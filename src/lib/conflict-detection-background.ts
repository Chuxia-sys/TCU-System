/**
 * Background task handler for conflict detection.
 * Queues and processes conflict detection asynchronously
 * to prevent long-running requests from blocking the API.
 */

import { getAuthSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { optimizationService } from '@/lib/firestore-optimization-service';
import { setCachedConflicts, generateConflictCacheKey } from '@/lib/conflict-cache';

// Track active background tasks to avoid duplicate processing
const activeDetectionTasks = new Set<string>();

interface ConflictDetectionContext {
  userId: string;
  role: string;
  departmentId?: string;
  isFaculty: boolean;
  isDeptHead: boolean;
  isAdmin: boolean;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  const start1 = timeToMinutes(s1);
  const end1 = timeToMinutes(e1);
  const start2 = timeToMinutes(s2);
  const end2 = timeToMinutes(e2);
  return start1 < end2 && end1 > start2;
}

/**
 * Run conflict detection in the background (non-blocking).
 * Returns immediately while detection continues asynchronously.
 */
export async function queueConflictDetection(ctx: ConflictDetectionContext): Promise<void> {
  const cacheKey = generateConflictCacheKey(ctx.userId, ctx.role, ctx.departmentId);

  // Avoid duplicate detection tasks for the same user
  if (activeDetectionTasks.has(cacheKey)) {
    return;
  }

  activeDetectionTasks.add(cacheKey);

  // Run detection in the background without blocking the response
  setImmediate(async () => {
    try {
      await performConflictDetection(ctx);
    } catch (error) {
      console.error('[Background] Conflict detection failed:', error);
    } finally {
      activeDetectionTasks.delete(cacheKey);
    }
  });
}

/**
 * Perform actual conflict detection and update cache.
 */
async function performConflictDetection(ctx: ConflictDetectionContext): Promise<void> {
  try {
    const scheduleWhere: { facultyId?: string } = {};

    if (ctx.isFaculty) {
      scheduleWhere.facultyId = ctx.userId;
    }

    // Fetch schedules
    const schedules = await optimizationService.executeOptimizedQuery({
      descriptor: {
        collection: 'schedules',
        where: Object.keys(scheduleWhere).length > 0 ? scheduleWhere : undefined,
        label: 'conflicts-schedules-bg',
      },
      cacheKey: ctx.isFaculty ? `schedules:faculty:${ctx.userId}` : 'schedules:all',
      cacheTtlMs: 5 * 60 * 1000,
      fetcher: async () => {
        return db.schedule.findMany({
          where: Object.keys(scheduleWhere).length > 0 ? scheduleWhere : undefined,
          include: {
            subject: true,
            faculty: true,
            section: { include: { department: true } },
            room: true,
          },
        });
      },
    });

    let filteredSchedules = schedules;
    if (ctx.isDeptHead && !ctx.isAdmin) {
      filteredSchedules = schedules.filter((s) => s.section?.departmentId === ctx.departmentId);
    }

    const detectedConflicts: Array<{
      type: string;
      scheduleId1: string;
      scheduleId2: string | null;
      description: string;
      severity: string;
    }> = [];

    console.log(`[Background] Checking ${filteredSchedules.length} schedules for conflicts...`);

    // Group schedules by day
    const schedulesByDay = new Map<string, typeof filteredSchedules>();
    for (const schedule of filteredSchedules) {
      const daySchedules = schedulesByDay.get(schedule.day) || [];
      daySchedules.push(schedule);
      schedulesByDay.set(schedule.day, daySchedules);
    }

    // Check each day separately
    for (const [day, daySchedules] of schedulesByDay) {
      daySchedules.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      for (let i = 0; i < daySchedules.length; i++) {
        const s1 = daySchedules[i];

        for (let j = i + 1; j < daySchedules.length; j++) {
          const s2 = daySchedules[j];

          if (timeToMinutes(s2.startTime) >= timeToMinutes(s1.endTime)) {
            break;
          }

          if (!timesOverlap(s1.startTime, s1.endTime, s2.startTime, s2.endTime)) {
            continue;
          }

          // Faculty double booking
          if (s1.facultyId === s2.facultyId) {
            detectedConflicts.push({
              type: 'faculty_double_booking',
              scheduleId1: s1.id,
              scheduleId2: s2.id,
              description: `Faculty "${s1.faculty?.name}" is double-booked on ${s1.day}`,
              severity: 'critical',
            });
          }

          // Room double booking
          if (s1.roomId === s2.roomId) {
            detectedConflicts.push({
              type: 'room_double_booking',
              scheduleId1: s1.id,
              scheduleId2: s2.id,
              description: `Room "${s1.room?.roomName}" is double-booked on ${s1.day}`,
              severity: 'critical',
            });
          }

          // Section overlap
          if (s1.sectionId === s2.sectionId) {
            detectedConflicts.push({
              type: 'section_overlap',
              scheduleId1: s1.id,
              scheduleId2: s2.id,
              description: `Section "${s1.section?.sectionName}" has overlapping classes on ${s1.day}`,
              severity: 'critical',
            });
          }
        }
      }
    }

    // Check capacity violations
    for (const schedule of filteredSchedules) {
      const room = schedule.room;
      const section = schedule.section;

      if (room && section && room.capacity < section.studentCount) {
        const existingViolation = detectedConflicts.find(
          (c) => c.type === 'capacity_exceeded' && c.scheduleId1 === schedule.id
        );

        if (!existingViolation) {
          detectedConflicts.push({
            type: 'capacity_exceeded',
            scheduleId1: schedule.id,
            scheduleId2: null,
            description: `Room "${room.roomName}" is too small for section "${section.sectionName}"`,
            severity: 'warning',
          });
        }
      }
    }

    console.log(`[Background] Detected ${detectedConflicts.length} conflicts`);

    // Create new conflict records (avoid duplicates)
    let newConflictCount = 0;
    for (const conflict of detectedConflicts) {
      const existing = await db.conflict.findFirst({
        where: {
          type: conflict.type,
          scheduleId1: conflict.scheduleId1,
          scheduleId2: conflict.scheduleId2,
          resolved: false,
        },
      });

      if (!existing) {
        await db.conflict.create({
          data: {
            type: conflict.type,
            scheduleId1: conflict.scheduleId1,
            scheduleId2: conflict.scheduleId2,
            description: conflict.description,
            severity: conflict.severity,
          },
        });
        newConflictCount++;
      }
    }

    if (newConflictCount > 0) {
      console.log(`[Background] Created ${newConflictCount} new conflict records`);
    }

    // Fetch all conflicts
    const conflicts = await db.conflict.findMany({
      where: undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Enrich conflicts (simplified - avoid N+1 queries)
    const enrichedConflicts = await Promise.all(
      conflicts.slice(0, 50).map(async (conflict) => {
        let schedule1 = null;
        let schedule2 = null;

        if (conflict.scheduleId1) {
          schedule1 = await db.schedule.findUnique({
            where: { id: conflict.scheduleId1 },
            include: { subject: true, faculty: true, section: { include: { department: true } }, room: true },
          });
        }

        if (conflict.scheduleId2) {
          schedule2 = await db.schedule.findUnique({
            where: { id: conflict.scheduleId2 },
            include: { subject: true, faculty: true, section: { include: { department: true } }, room: true },
          });
        }

        return {
          ...conflict,
          schedule1,
          schedule2,
          isPreGeneration: !conflict.scheduleId1,
        };
      })
    );

    // Filter for user
    let filteredConflicts = enrichedConflicts;
    if (ctx.isFaculty) {
      filteredConflicts = enrichedConflicts.filter(
        (c) =>
          c.schedule1?.facultyId === ctx.userId || c.schedule2?.facultyId === ctx.userId
      );
    } else if (ctx.isDeptHead) {
      filteredConflicts = enrichedConflicts.filter(
        (c) =>
          c.schedule1?.section?.departmentId === ctx.departmentId ||
          c.schedule2?.section?.departmentId === ctx.departmentId
      );
    }

    // Build summary
    const conflictSummary = {
      faculty_double_booking: filteredConflicts.filter(
        (c) => c.type === 'faculty_double_booking' && !c.resolved
      ).length,
      room_double_booking: filteredConflicts.filter(
        (c) => c.type === 'room_double_booking' && !c.resolved
      ).length,
      section_overlap: filteredConflicts.filter((c) => c.type === 'section_overlap' && !c.resolved)
        .length,
      capacity_exceeded: filteredConflicts.filter((c) => c.type === 'capacity_exceeded' && !c.resolved)
        .length,
      subject_preference_conflict: filteredConflicts.filter(
        (c) => c.type === 'subject_preference_conflict' && !c.resolved
      ).length,
      specialization_gap: filteredConflicts.filter((c) => c.type === 'specialization_gap' && !c.resolved)
        .length,
      capacity_warning: filteredConflicts.filter((c) => c.type === 'capacity_warning' && !c.resolved)
        .length,
      time_conflict: filteredConflicts.filter((c) => c.type === 'time_conflict' && !c.resolved).length,
    };

    // Update cache
    const cacheKey = generateConflictCacheKey(ctx.userId, ctx.role, ctx.departmentId);
    setCachedConflicts(cacheKey, {
      conflicts: filteredConflicts,
      summary: conflictSummary,
      total: filteredConflicts.length,
      unresolved: filteredConflicts.filter((c) => !c.resolved).length,
      lastChecked: new Date().toISOString(),
    });

    console.log(`[Background] Cache updated for ${cacheKey}`);
  } catch (error) {
    console.error('[Background] Conflict detection error:', error);
    throw error;
  }
}
