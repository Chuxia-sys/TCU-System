import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedSession, isAdmin, isDeptHead, isFaculty } from '@/lib/dept-auth';

// GET /api/preferences - Get faculty preferences
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const facultyId = searchParams.get('facultyId');

    if (!facultyId) {
      return NextResponse.json({ error: 'Faculty ID is required' }, { status: 400 });
    }

    // Authorization check
    const userIsAdmin = isAdmin(session);
    const userIsDeptHead = isDeptHead(session);
    const userIsFaculty = isFaculty(session);

    if (userIsFaculty) {
      // Faculty can only read their own preferences
      if (facultyId !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied. You can only view your own preferences.' },
          { status: 403 }
        );
      }
    } else if (userIsDeptHead) {
      // Department heads can read preferences of faculty in their own department
      const targetFaculty = await db.user.findUnique({
        where: { id: facultyId },
        select: { departmentId: true },
      });
      if (!targetFaculty) {
        return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });
      }
      if (targetFaculty.departmentId !== session.user.departmentId) {
        return NextResponse.json(
          { error: 'Access denied. You can only view preferences of faculty in your department.' },
          { status: 403 }
        );
      }
    }
    // Admin can read any preferences (no additional check needed)

    const preferences = await db.facultyPreference.findUnique({
      where: { facultyId },
    });

    if (!preferences) {
      return NextResponse.json(null);
    }

    return NextResponse.json({
      ...preferences,
      preferredDays: JSON.parse(preferences.preferredDays || '[]'),
      preferredSubjects: JSON.parse(preferences.preferredSubjects || '[]'),
      unavailableDays: preferences.unavailableDays ? JSON.parse(preferences.unavailableDays) : [],
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

// PUT /api/preferences - Update faculty preferences
export async function PUT(request: NextRequest) {
  try {
    // Authentication check
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { facultyId, preferredDays, preferredTimeStart, preferredTimeEnd, preferredSubjects, unavailableDays, notes } = body;

    if (!facultyId) {
      return NextResponse.json({ error: 'Faculty ID is required' }, { status: 400 });
    }

    // Authorization check
    const userIsAdmin = isAdmin(session);
    const userIsDeptHead = isDeptHead(session);
    const userIsFaculty = isFaculty(session);

    if (userIsFaculty) {
      // Faculty can only update their own preferences
      if (facultyId !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied. You can only update your own preferences.' },
          { status: 403 }
        );
      }
    } else if (userIsDeptHead) {
      // Department heads can update preferences of faculty in their own department
      const targetFaculty = await db.user.findUnique({
        where: { id: facultyId },
        select: { departmentId: true },
      });
      if (!targetFaculty) {
        return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });
      }
      if (targetFaculty.departmentId !== session.user.departmentId) {
        return NextResponse.json(
          { error: 'Access denied. You can only update preferences of faculty in your department.' },
          { status: 403 }
        );
      }
    }
    // Admin can update any preferences (no additional check needed)

    // Upsert preferences
    const preferences = await db.facultyPreference.upsert({
      where: { facultyId },
      create: {
        facultyId,
        preferredDays: JSON.stringify(preferredDays || []),
        preferredTimeStart: preferredTimeStart || '08:00',
        preferredTimeEnd: preferredTimeEnd || '17:00',
        preferredSubjects: JSON.stringify(preferredSubjects || []),
        unavailableDays: unavailableDays ? JSON.stringify(unavailableDays) : null,
        notes: notes || null,
      },
      update: {
        preferredDays: JSON.stringify(preferredDays || []),
        preferredTimeStart: preferredTimeStart || '08:00',
        preferredTimeEnd: preferredTimeEnd || '17:00',
        preferredSubjects: JSON.stringify(preferredSubjects || []),
        unavailableDays: unavailableDays ? JSON.stringify(unavailableDays) : null,
        notes: notes || null,
      },
    });

    // Create audit log - use the acting user's ID, not the target facultyId
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'update_preferences',
        entity: 'facultyPreference',
        entityId: preferences.id,
      },
    });

    // Create notification
    await db.notification.create({
      data: {
        userId: facultyId,
        title: 'Preferences Updated',
        message: 'Your scheduling preferences have been saved successfully.',
        type: 'success',
      },
    });

    return NextResponse.json({
      success: true,
      preferences: {
        ...preferences,
        preferredDays: JSON.parse(preferences.preferredDays || '[]'),
        preferredSubjects: JSON.parse(preferences.preferredSubjects || '[]'),
        unavailableDays: preferences.unavailableDays ? JSON.parse(preferences.unavailableDays) : [],
      },
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
