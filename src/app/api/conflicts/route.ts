import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { getCachedConflicts, generateConflictCacheKey } from '@/lib/conflict-cache';
import { queueConflictDetection } from '@/lib/conflict-detection-background';

// GET /api/conflicts
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved');

    // Role-based filtering
    const isFaculty = session.user.role === 'faculty';
    const isDeptHead = session.user.role === 'department_head';
    const isAdmin = session.user.role === 'admin';

    // Generate cache key
    const cacheKey = generateConflictCacheKey(session.user.id, session.user.role, session.user.departmentId);

    // STEP 1: Check cache first (returns immediately if available)
    let cachedData = getCachedConflicts(cacheKey);

    if (cachedData) {
      // Apply resolved filter if requested
      let filteredConflicts = cachedData.conflicts;
      if (resolved !== null) {
        filteredConflicts = cachedData.conflicts.filter(
          (c) => c.resolved === (resolved === 'true')
        );
      }

      console.log(`[API] Returning cached conflicts for ${cacheKey} (age: ${Date.now() - (cachedData.lastChecked ? new Date(cachedData.lastChecked).getTime() : 0)}ms)`);

      return NextResponse.json({
        conflicts: filteredConflicts,
        total: filteredConflicts.length,
        unresolved: filteredConflicts.filter((c) => !c.resolved).length,
        summary: cachedData.summary,
        lastChecked: cachedData.lastChecked,
        cached: true, // Indicate this is from cache
      });
    }

    // STEP 2: No cache — queue background detection and return empty/fallback while it processes
    console.log(`[API] No cache for ${cacheKey}, queuing background detection...`);

    queueConflictDetection({
      userId: session.user.id,
      role: session.user.role,
      departmentId: session.user.departmentId,
      isFaculty,
      isDeptHead,
      isAdmin,
    }).catch((err) => console.error('[API] Failed to queue conflict detection:', err));

    // Return empty response with indicator that data is being loaded in background
    return NextResponse.json(
      {
        conflicts: [],
        total: 0,
        unresolved: 0,
        summary: {
          faculty_double_booking: 0,
          room_double_booking: 0,
          section_overlap: 0,
          capacity_exceeded: 0,
          subject_preference_conflict: 0,
          specialization_gap: 0,
          capacity_warning: 0,
          time_conflict: 0,
        },
        lastChecked: null,
        cached: false,
        loading: true, // Indicate background loading
      },
      {
        headers: {
          'X-Data-Loading': 'true', // Custom header for client to know data is loading
        },
      }
    );
  } catch (error) {
    console.error('Error in conflicts endpoint:', error);
    return NextResponse.json(
      {
        conflicts: [],
        total: 0,
        unresolved: 0,
        summary: {},
        error: 'Failed to fetch conflicts',
        cached: false,
      },
      { status: 500 }
    );
  }
}