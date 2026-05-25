import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { 
  generateSchedules, 
  type Faculty, 
  type Room, 
  type Section, 
  type Subject,
  type ScheduleAssignment,
  type CurriculumEntry,
} from '@/lib/scheduling-algorithm';
import { optimizationService } from '@/lib/firestore-optimization-service';
import { incrementGenerationVersion } from '@/app/api/stats/route';
import { v4 as uuidv4 } from 'uuid';
import { sendNotificationToUser } from '@/lib/notification-client';

function parseJSON<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export async function POST(request: NextRequest) {
  // =========================================================================
  // AUTH & AUTHORIZATION (must complete before response)
  // =========================================================================
  console.log('Generate request received, checking auth...');
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Only admin can generate schedules
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
  }

  // =========================================================================
  // PARSE REQUEST BODY (must complete before response)
  // =========================================================================
  const body = await request.json();
  const { departmentId, clearExisting = true, curriculum, detectedConflicts, semester = '1st Semester' } = body;

  const generationId = uuidv4();
  const adminUserId = session.user.id;

  console.log('=== TCU SCHEDULE GENERATION v2.0 (ASYNC) ===');
  console.log(`Generation ID: ${generationId}`);
  console.log(`Semester: ${semester}`);
  console.log(`Department: ${departmentId || 'All'}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Detected conflicts passed: ${detectedConflicts?.length || 0}`);

  // =========================================================================
  // FIRE-AND-FORGET BACKGROUND GENERATION
  // =========================================================================

  // Start the heavy work in the background and return immediately
  (async () => {
    try {
      const startTime = Date.now();

      // =========================================================================
      // FETCH DATA
      // =========================================================================
      
      // Fetch sections (filtered by isActive, with fallback)
      let sectionsRaw = await db.section.findMany({
        where: departmentId ? { departmentId } : { isActive: true },
        include: { department: true },
      });
      if (sectionsRaw.length === 0) {
        console.log(`No sections found with isActive filter, trying without...`);
        sectionsRaw = await db.section.findMany({
          where: departmentId ? { departmentId } : {},
          include: { department: true },
        });
        if (sectionsRaw.length > 0) {
          console.log(`Found ${sectionsRaw.length} sections without isActive filter`);
        }
      }
      
      // Fetch subjects (filtered by semester, with fallback)
      let subjectsRaw = await db.subject.findMany({
        where: departmentId ? { departmentId, semester } : { semester },
      });
      // Fallback: if no subjects found with semester filter, try without it
      if (subjectsRaw.length === 0) {
        console.log(`No subjects found for semester "${semester}", trying without semester filter...`);
        subjectsRaw = await db.subject.findMany({
          where: departmentId ? { departmentId } : {},
        });
        if (subjectsRaw.length > 0) {
          console.log(`Found ${subjectsRaw.length} subjects without semester filter`);
        }
      }
      
      // Fetch rooms (filtered by isActive, with fallback)
      let roomsRaw = await db.room.findMany({
        where: { isActive: true },
      });
      if (roomsRaw.length === 0) {
        console.log(`No rooms found with isActive filter, trying without...`);
        roomsRaw = await db.room.findMany({ where: {} });
        if (roomsRaw.length > 0) {
          console.log(`Found ${roomsRaw.length} rooms without isActive filter`);
        }
      }
      
      // Fetch ALL faculty (regardless of department) with preferences
      const facultyRaw = await db.user.findMany({
        where: { 
          role: 'faculty',
        },
        include: { preferences: true },
      });

      console.log(`\n=== DATA LOADED [${generationId}] ===`);
      console.log(`Sections: ${sectionsRaw.length}`);
      console.log(`Subjects: ${subjectsRaw.length}`);
      console.log(`Rooms: ${roomsRaw.length}`);
      console.log(`Faculty: ${facultyRaw.length}`);
      
      // Log faculty details for debugging
      console.log(`\n=== FACULTY ANALYSIS ===`);
      for (const f of facultyRaw) {
        const spec = parseJSON(f.specialization, []);
        const pref = f.preferences?.[0];
        const prefDays = pref ? parseJSON(pref.preferredDays, []) : [];
        const unavailDays = pref?.unavailableDays ? parseJSON(pref.unavailableDays, []) : [];
        
        console.log(`- ${f.name} (${f.email})`);
        console.log(`  Max Units: ${f.maxUnits || 24}`);
        console.log(`  Specializations: ${spec.length > 0 ? spec.join(', ') : 'None (can teach any)'}`);
        console.log(`  Preferred Days: ${prefDays.length > 0 ? prefDays.join(', ') : 'All'}`);
        console.log(`  Unavailable Days: ${unavailDays.length > 0 ? unavailDays.join(', ') : 'None'}`);
      }

      // =========================================================================
      // VALIDATION
      // =========================================================================
      
      const errors: string[] = [];
      if (facultyRaw.length === 0) {
        errors.push('No faculty members found. Please add faculty before generating schedules.');
      }
      if (sectionsRaw.length === 0) {
        errors.push('No sections found. Please add sections before generating schedules.');
      }
      if (subjectsRaw.length === 0) {
        errors.push('No subjects found. Please add subjects before generating schedules.');
      }
      if (roomsRaw.length === 0) {
        errors.push('No rooms found. Please add rooms before generating schedules.');
      }

      if (errors.length > 0) {
        console.error(`\n=== VALIDATION FAILED [${generationId}] ===`);
        console.error(errors.join('\n'));
        // Notify admin of validation failure
        try {
          await db.notification.create({
            data: {
              userId: adminUserId,
              title: 'Schedule Generation Failed',
              message: `Generation ${generationId} failed validation: ${errors.join('; ')}`,
              type: 'error',
              actionUrl: 'dashboard',
            },
          });
          sendNotificationToUser({
            userId: adminUserId,
            title: 'Schedule Generation Failed',
            message: errors.join('; '),
            type: 'error',
          });
        } catch (notifErr) {
          console.error('Failed to send validation error notification:', notifErr);
        }
        return;
      }

      // =========================================================================
      // PRE-GENERATION CONFLICT CHECK
      // =========================================================================
      
      const preGenerationWarnings: Array<{
        type: string;
        message: string;
        severity: 'warning' | 'info';
        faculty?: string[];
      }> = [];

      // Check for faculty with identical preferred subjects and overlapping times
      const subjectPreferenceMap: Map<string, typeof facultyRaw> = new Map();
      
      for (const f of facultyRaw) {
        const pref = f.preferences?.[0];
        const prefSubjects = pref ? parseJSON<string[]>(pref.preferredSubjects, []) : [];
        const prefTimeStart = pref?.preferredTimeStart || '08:00';
        const prefTimeEnd = pref?.preferredTimeEnd || '17:00';
        const prefDays = pref ? parseJSON<string[]>(pref.preferredDays, []) : [];
        
        for (const subjectId of prefSubjects) {
          const key = `${subjectId}|${prefTimeStart}-${prefTimeEnd}|${prefDays.join(',')}`;
          
          if (!subjectPreferenceMap.has(key)) {
            subjectPreferenceMap.set(key, []);
          }
          subjectPreferenceMap.get(key)!.push(f);
        }
      }

      for (const [key, facultyList] of subjectPreferenceMap) {
        if (facultyList.length >= 2) {
          const [subjectId] = key.split('|');
          const subject = subjectsRaw.find(s => s.id === subjectId);
          
          preGenerationWarnings.push({
            type: 'subject_preference_conflict',
            message: `${facultyList.length} faculty members (${facultyList.map(f => f.name).join(', ')}) prefer the same subject "${subject?.subjectName || subjectId}" with overlapping time preferences.`,
            severity: 'warning',
            faculty: facultyList.map(f => f.name),
          });
        }
      }

      // Check for specialization gaps
      for (const subject of subjectsRaw) {
        const requiredSpecs = parseJSON<string[]>(subject.requiredSpecialization, []);
        
        if (requiredSpecs.length > 0) {
          const hasEligibleFaculty = facultyRaw.some(f => {
            const fSpecs = parseJSON<string[]>(f.specialization, []);
            return requiredSpecs.some(spec => fSpecs.includes(spec));
          });
          
          if (!hasEligibleFaculty) {
            preGenerationWarnings.push({
              type: 'specialization_gap',
              message: `Subject "${subject.subjectName}" requires specialization in ${requiredSpecs.join(' or ')}, but no eligible faculty found.`,
              severity: 'warning',
            });
          }
        }
      }

      // Check for faculty capacity issues
      for (const f of facultyRaw) {
        const pref = f.preferences?.[0];
        const prefSubjects = pref ? parseJSON<string[]>(pref.preferredSubjects, []) : [];
        const prefSubjectsUnits = subjectsRaw
          .filter(s => prefSubjects.includes(s.id))
          .reduce((sum, s) => sum + s.units, 0);
        
        if (prefSubjectsUnits > f.maxUnits) {
          preGenerationWarnings.push({
            type: 'capacity_warning',
            message: `${f.name}'s preferred subjects total ${prefSubjectsUnits} units, exceeding max capacity of ${f.maxUnits} units.`,
            severity: 'info',
            faculty: [f.name],
          });
        }
      }

      console.log(`\n=== PRE-GENERATION WARNINGS ===`);
      console.log(`Found ${preGenerationWarnings.length} potential issues`);
      for (const w of preGenerationWarnings) {
        console.log(`- [${w.severity}] ${w.message}`);
      }

      // =========================================================================
      // TRANSFORM DATA FOR ALGORITHM
      // =========================================================================

      const faculty: Faculty[] = facultyRaw.map(f => {
        const pref = f.preferences?.[0];
        return {
          id: f.id,
          name: f.name,
          specialization: parseJSON(f.specialization, []),
          maxUnits: f.maxUnits || 24,
          departmentId: f.departmentId,
          preferences: pref ? {
            preferredDays: parseJSON(pref.preferredDays, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
            preferredTimeStart: pref.preferredTimeStart || '08:00',
            preferredTimeEnd: pref.preferredTimeEnd || '17:00',
            preferredSubjects: parseJSON(pref.preferredSubjects, []),
            unavailableDays: pref.unavailableDays ? parseJSON(pref.unavailableDays, []) : undefined,
            notes: pref.notes || undefined,
          } : {
            preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            preferredTimeStart: '08:00',
            preferredTimeEnd: '17:00',
            preferredSubjects: [],
          },
        };
      });

      const rooms: Room[] = roomsRaw.map(r => ({
        id: r.id,
        roomName: r.roomName,
        capacity: r.capacity,
        equipment: parseJSON(r.equipment, []),
        building: r.building,
      }));

      const sections: Section[] = sectionsRaw.map(s => ({
        id: s.id,
        sectionName: s.sectionName,
        yearLevel: s.yearLevel,
        studentCount: s.studentCount,
        departmentId: s.departmentId,
      }));

      const subjects: Subject[] = subjectsRaw.map(s => ({
        id: s.id,
        subjectCode: s.subjectCode,
        subjectName: s.subjectName,
        units: s.units,
        departmentId: s.departmentId,
        requiredSpecialization: parseJSON(s.requiredSpecialization, []),
        requiredEquipment: [],
      }));

      // Prepare curriculum if provided
      const curriculumEntries: CurriculumEntry[] | undefined = curriculum;

      // =========================================================================
      // CLEAR EXISTING SCHEDULES
      // =========================================================================

      if (clearExisting) {
        console.log('\n=== CLEARING EXISTING SCHEDULES ===');
        try {
          const deleteResult = await db.schedule.deleteMany({});
          console.log(`Deleted ${deleteResult.count} existing schedules`);
        } catch (err) {
          console.error('Failed to clear existing schedules:', err);
        }
        
        try {
          await db.conflict.deleteMany({ 
            where: { resolved: false } 
          });
        } catch (err) {
          console.error('Failed to clear existing conflicts:', err);
        }
      }

      // =========================================================================
      // RUN SCHEDULING ALGORITHM
      // =========================================================================

      console.log('\n=== RUNNING SCHEDULING ALGORITHM ===');
      const result = generateSchedules(faculty, rooms, sections, subjects, curriculumEntries);

      console.log(`\n=== ALGORITHM RESULTS ===`);
      console.log(`Generation time: ${result.stats.generationTimeMs}ms`);
      console.log(`Backtracks: ${result.stats.backtrackCount}`);
      console.log(`Skipped (duplicates): ${result.stats.skippedCount}`);
      console.log(`Assigned: ${result.schedules.length}`);
      console.log(`Unassigned: ${result.unassigned.length}`);
      console.log(`Violations detected: ${result.violations.length}`);
      console.log(`Assignment rate: ${(result.stats.assignmentRate * 100).toFixed(1)}%`);
      console.log(`Preference match rate: ${(result.stats.preferenceMatchRate * 100).toFixed(1)}%`);

      // Log preference violation summary
      const prefViolations = result.violations.filter(v => v.type === 'preference_violation');
      if (prefViolations.length > 0) {
        console.log(`\n=== PREFERENCE VIOLATIONS (${prefViolations.length}) ===`);
        const byFaculty = new Map<string, number>();
        for (const v of prefViolations) {
          const facultyName = v.description.match(/Faculty (.+?) has/)?.[1] || 'Unknown';
          byFaculty.set(facultyName, (byFaculty.get(facultyName) || 0) + 1);
        }
        for (const [name, count] of byFaculty) {
          console.log(`  - ${name}: ${count} violation(s)`);
        }
      }

      // =========================================================================
      // SAVE SCHEDULES TO DATABASE
      // =========================================================================

      let savedScheduleCount = 0;
      if (result.schedules.length > 0) {
        console.log('\n=== SAVING TO DATABASE ===');
        
        const batchSize = 50;
        
        for (let i = 0; i < result.schedules.length; i += batchSize) {
          const batch = result.schedules.slice(i, i + batchSize);
          try {
            await db.schedule.createMany({
              data: batch.map(s => ({
                subjectId: s.subjectId,
                facultyId: s.facultyId,
                sectionId: s.sectionId,
                roomId: s.roomId,
                day: s.day,
                startTime: s.startTime,
                endTime: s.endTime,
                status: 'approved',
                semester,
                academicYear: '2024-2025',
              })),
            });
            savedScheduleCount += batch.length;
          } catch (err) {
            console.error(`Failed to save schedule batch ${i}-${i + batch.length}:`, err);
            for (const s of batch) {
              try {
                await db.schedule.create({
                  data: {
                    subjectId: s.subjectId,
                    facultyId: s.facultyId,
                    sectionId: s.sectionId,
                    roomId: s.roomId,
                    day: s.day,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    status: 'approved',
                    semester,
                    academicYear: '2024-2025',
                  },
                });
                savedScheduleCount++;
              } catch (singleErr) {
                console.error(`Failed to save single schedule for ${s.subjectId}/${s.sectionId}:`, singleErr);
              }
            }
          }
        }
        console.log(`Saved ${savedScheduleCount}/${result.schedules.length} schedules to database`);
      }

      // =========================================================================
      // RECORD VIOLATIONS AS CONFLICTS
      // =========================================================================

      if (result.violations.length > 0) {
        console.log(`\n=== RECORDING ${result.violations.length} VIOLATIONS ===`);
        
        for (const violation of result.violations) {
          try {
            await db.conflict.create({
              data: {
                type: violation.type,
                scheduleId1: violation.scheduleIds[0] || '',
                scheduleId2: violation.scheduleIds[1] || null,
                description: violation.description,
                severity: violation.severity,
                resolved: false,
              },
            });
          } catch (e) {
            console.error(`Failed to record violation: ${violation.description}`);
          }
        }
      }

      // =========================================================================
      // SAVE DETECTED CONFLICTS (from pre-generation check)
      // =========================================================================

      let savedConflictsCount = 0;
      
      if (detectedConflicts && detectedConflicts.length > 0) {
        console.log(`\n=== SAVING ${detectedConflicts.length} DETECTED CONFLICTS ===`);
        
        for (const conflict of detectedConflicts) {
          try {
            const facultyData = conflict.faculty?.map((f: { id?: string; name: string } | string) => 
              typeof f === 'string' ? { id: null, name: f } : { id: f.id || null, name: f.name }
            ) || [];
            
            const facultyNames = facultyData.map((f: { name: string }) => f.name);
            const facultyIds = facultyData
              .map((f: { id: string | null }) => f.id)
              .filter((id: string | null): id is string => id !== null);
            
            let scheduleId1: string | null = null;
            let scheduleId2: string | null = null;
            
            if (conflict.type === 'subject_conflict' || conflict.type === 'subject_preference_conflict') {
              const affectedSchedules = result.schedules.filter(s => {
                const facultyName = faculty.find(f => f.id === s.facultyId)?.name;
                return facultyName && facultyNames.includes(facultyName);
              });
              
              if (affectedSchedules.length >= 1) {
                scheduleId1 = affectedSchedules[0].id;
              }
              if (affectedSchedules.length >= 2) {
                scheduleId2 = affectedSchedules[1].id;
              }
            }
            
            let subjectId: string | null = null;
            if (conflict.details?.subjectId) {
              subjectId = conflict.details.subjectId;
            }
            
            await db.conflict.create({
              data: {
                type: conflict.type || 'preference_conflict',
                scheduleId1: scheduleId1,
                scheduleId2: scheduleId2,
                description: conflict.message || conflict.description || '',
                severity: conflict.severity || 'warning',
                resolved: false,
                suggestedResolution: getSuggestedResolution(conflict.type, facultyNames),
                facultyIds: facultyIds.length > 0 ? JSON.stringify(facultyIds) : null,
                subjectId: subjectId,
                generationId: generationId,
              },
            });
            savedConflictsCount++;
          } catch (e) {
            console.error(`Failed to save detected conflict: ${conflict.message || conflict.type}`);
          }
        }
        console.log(`Saved ${savedConflictsCount} detected conflicts to database`);
      }

      // Helper function for suggested resolutions
      function getSuggestedResolution(conflictType: string, facultyNames: string[]): string {
        switch (conflictType) {
          case 'subject_conflict':
          case 'subject_preference_conflict':
            return `Consider discussing with ${facultyNames.join(' and ')} to adjust preferences, or let the algorithm assign based on load balancing.`;
          case 'specialization_gap':
            return 'Add a faculty member with the required specialization or update subject requirements.';
          case 'capacity_warning':
            return 'Reduce preferred subjects or increase faculty max units.';
          case 'preference_overlap':
          case 'time_conflict':
            return 'The scheduling algorithm will resolve this using load balancing.';
          default:
            return 'Review faculty preferences and adjust as needed.';
        }
      }

      // =========================================================================
      // LOG UNASSIGNED ITEMS
      // =========================================================================

      if (result.unassigned.length > 0) {
        console.log(`\n=== UNASSIGNED SUBJECTS (${result.unassigned.length}) ===`);
        for (const item of result.unassigned.slice(0, 10)) {
          console.log(`- ${item.subjectCode} (${item.subjectName}) for ${item.sectionName}: ${item.reason}`);
        }
        if (result.unassigned.length > 10) {
          console.log(`... and ${result.unassigned.length - 10} more`);
        }
      }

      // =========================================================================
      // SEND NOTIFICATIONS TO FACULTY
      // =========================================================================

      console.log('\n=== SENDING NOTIFICATIONS ===');
      const notifiedFaculty = new Set<string>();
      let notificationCount = 0;
      
      for (const schedule of result.schedules) {
        if (!notifiedFaculty.has(schedule.facultyId)) {
          const facultyMember = faculty.find(f => f.id === schedule.facultyId);
          if (facultyMember) {
            const facultySchedules = result.schedules.filter(s => s.facultyId === schedule.facultyId);
            const totalUnits = facultySchedules.reduce((sum, s) => {
              const subj = subjects.find(sub => sub.id === s.subjectId);
              return sum + (subj?.units || 0);
            }, 0);
            
            const notificationTitle = 'New Schedules Generated';
            const notificationMessage = `You have been assigned ${facultySchedules.length} class(es) totaling ${totalUnits} units for ${semester} 2024-2025. Please review your schedule in the calendar view.`;
            
            try {
              await db.notification.create({
                data: {
                  userId: schedule.facultyId,
                  title: notificationTitle,
                  message: notificationMessage,
                  type: 'info',
                  actionUrl: 'calendar',
                },
              });
            } catch (notifErr) {
              console.error(`Failed to save notification for faculty ${schedule.facultyId}:`, notifErr);
            }
            
            sendNotificationToUser({
              userId: schedule.facultyId,
              title: notificationTitle,
              message: notificationMessage,
              type: 'info',
            });
            
            notifiedFaculty.add(schedule.facultyId);
            notificationCount++;
          }
        }
      }
      console.log(`Sent ${notificationCount} notifications to faculty`);

      // =========================================================================
      // SEND COMPLETION NOTIFICATION TO ADMIN
      // =========================================================================

      const adminNotificationMessage = prefViolations.length > 0
        ? `Generated ${result.schedules.length} schedules. ${prefViolations.length} assignment(s) could not match faculty preferences. ${savedConflictsCount > 0 ? `${savedConflictsCount} conflict(s) recorded.` : ''}`
        : result.violations.length === 0 
          ? `Successfully generated ${result.schedules.length} conflict-free schedules with full preference matching!`
          : `Generated ${result.schedules.length} schedules with ${result.violations.length} conflicts that need review.`;

      try {
        await db.notification.create({
          data: {
            userId: adminUserId,
            title: 'Schedule Generation Complete',
            message: adminNotificationMessage,
            type: result.violations.length > 0 ? 'warning' : 'success',
            actionUrl: 'dashboard',
          },
        });
        sendNotificationToUser({
          userId: adminUserId,
          title: 'Schedule Generation Complete',
          message: adminNotificationMessage,
          type: result.violations.length > 0 ? 'warning' : 'success',
        });
      } catch (adminNotifErr) {
        console.error('Failed to send completion notification to admin:', adminNotifErr);
      }

      // =========================================================================
      // CREATE AUDIT LOG
      // =========================================================================

      try {
        await db.auditLog.create({
          data: {
            action: 'generate_schedules',
            entity: 'schedule',
            details: JSON.stringify({
              version: '2.0',
              generated: result.schedules.length,
              savedSchedules: savedScheduleCount,
              unassigned: result.unassigned.length,
              violations: result.violations.length,
              savedConflicts: savedConflictsCount,
              departmentId,
              generationTimeMs: result.stats.generationTimeMs,
              backtrackCount: result.stats.backtrackCount,
              skippedCount: result.stats.skippedCount,
              preferenceMatchRate: result.stats.preferenceMatchRate,
              assignmentRate: result.stats.assignmentRate,
              generationId: generationId,
            }),
          },
        });
      } catch (auditErr) {
        console.error('Failed to create audit log:', auditErr);
      }

      // =========================================================================
      // INVALIDATE SERVER CACHES so dashboards see fresh data
      // =========================================================================

      console.log('\n=== INVALIDATING SERVER CACHES ===');
      try {
        optimizationService.invalidateCache(/^schedules:/);
        optimizationService.invalidateCache(/^conflicts:/);
        optimizationService.invalidateCache(/^stats:/);
        invalidateStatsCache();
        incrementGenerationVersion();
        console.log('Server caches invalidated successfully');
      } catch (cacheErr) {
        console.error('Failed to invalidate server caches:', cacheErr);
      }

      // =========================================================================
      // SUMMARY LOG
      // =========================================================================

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`\n=== GENERATION COMPLETE [${generationId}] ===`);
      console.log(`Total API time: ${totalTime}ms`);
      console.log(`Schedules generated: ${result.schedules.length}`);
      console.log(`Sections covered: ${new Set(result.schedules.map(s => s.sectionId)).size}/${sections.length}`);
      console.log(`Faculty utilized: ${new Set(result.schedules.map(s => s.facultyId)).size}/${faculty.length}`);

    } catch (error) {
      console.error(`[Background Generation Error] ${generationId}:`, error);
      // Notify admin of failure
      try {
        await db.notification.create({
          data: {
            userId: adminUserId,
            title: 'Schedule Generation Failed',
            message: `Generation ${generationId} encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            type: 'error',
            actionUrl: 'dashboard',
          },
        });
        sendNotificationToUser({
          userId: adminUserId,
          title: 'Schedule Generation Failed',
          message: `Generation ${generationId} encountered an error.`,
          type: 'error',
        });
      } catch (notifErr) {
        console.error('Failed to send error notification to admin:', notifErr);
      }
    }
  })().catch(err => {
    // Top-level catch for the fire-and-forget promise
    console.error(`[Uncaught Background Generation Error] ${generationId}:`, err);
  });

  // =========================================================================
  // RETURN IMMEDIATE RESPONSE (before background work completes)
  // =========================================================================

  return NextResponse.json({
    success: true,
    generating: true,
    generationId,
    message: 'Schedule generation started. You\'ll be notified when it\'s complete.',
  });
}
