import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { isDeptHead, isAdmin } from '@/lib/dept-auth';
import { db } from '@/lib/db';

// GET - Get all schedule responses (admin) or user's own responses (faculty) or department responses (dept_head)
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const userIsFaculty = session.user.role === 'faculty';
    const userIsDeptHead = isDeptHead(session);
    const userIsAdmin = isAdmin(session);

    const where: Record<string, unknown> = {};
    
    // Faculty can only see their own responses
    if (userIsFaculty) {
      where.facultyId = session.user.id;
    }
    
    // Filter by status if provided
    if (status && ['pending', 'accepted', 'rejected'].includes(status)) {
      where.status = status;
    }

    const responses = await db.scheduleResponse.findMany({
      where,
      include: {
        schedule: {
          include: {
            subject: true,
            section: true,
            room: true,
          },
        },
        faculty: {
          select: {
            id: true,
            name: true,
            email: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // For dept_head: filter responses to only those where the schedule's section belongs to their department
    if (userIsDeptHead && session.user.departmentId) {
      const filteredResponses = responses.filter(
        (response) => response.schedule?.section?.departmentId === session.user.departmentId
      );
      return NextResponse.json(filteredResponses);
    }

    // Admin sees all, faculty sees their own (already filtered by where clause)
    return NextResponse.json(responses);
  } catch (error) {
    console.error('Error fetching schedule responses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule responses' },
      { status: 500 }
    );
  }
}

// POST - Create or update a schedule response (faculty only)
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scheduleId, status, reason } = body;

    if (!scheduleId || !status) {
      return NextResponse.json(
        { error: 'Schedule ID and status are required' },
        { status: 400 }
      );
    }

    if (!['accepted', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be either accepted or rejected' },
        { status: 400 }
      );
    }

    // If rejected, reason is required
    if (status === 'rejected' && !reason?.trim()) {
      return NextResponse.json(
        { error: 'Reason is required when rejecting a schedule' },
        { status: 400 }
      );
    }

    // Verify the schedule exists and belongs to the faculty
    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      return NextResponse.json(
        { error: 'Schedule not found' },
        { status: 404 }
      );
    }

    // Only the assigned faculty can respond
    if (schedule.facultyId !== session.user.id) {
      return NextResponse.json(
        { error: 'You can only respond to schedules assigned to you' },
        { status: 403 }
      );
    }

    // Check if response already exists
    const existingResponse = await db.scheduleResponse.findUnique({
      where: { scheduleId },
    });

    let response;
    if (existingResponse) {
      // Update existing response
      response = await db.scheduleResponse.update({
        where: { id: existingResponse.id },
        data: {
          status,
          reason: status === 'rejected' ? reason : null,
          respondedAt: new Date(),
        },
        include: {
          schedule: {
            include: {
              subject: true,
              section: true,
              room: true,
            },
          },
          faculty: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    } else {
      // Create new response
      response = await db.scheduleResponse.create({
        data: {
          scheduleId,
          facultyId: session.user.id,
          status,
          reason: status === 'rejected' ? reason : null,
          respondedAt: new Date(),
        },
        include: {
          schedule: {
            include: {
              subject: true,
              section: true,
              room: true,
            },
          },
          faculty: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }

    // Create notification for admin about the response
    const admins = await db.user.findMany({
      where: { role: 'admin' },
    });

    const notificationMessage = status === 'accepted'
      ? `${session.user.name} has accepted the schedule for ${response.schedule.subject?.subjectName || 'a subject'}`
      : `${session.user.name} has rejected the schedule for ${response.schedule.subject?.subjectName || 'a subject'}`;

    await db.notification.createMany({
      data: admins.map(admin => ({
        userId: admin.id,
        title: status === 'accepted' ? 'Schedule Accepted' : 'Schedule Rejected',
        message: notificationMessage + (status === 'rejected' && reason ? ` - Reason: ${reason}` : ''),
        type: status === 'accepted' ? 'success' : 'warning',
        actionUrl: '/schedule-responses',
      })),
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error creating/updating schedule response:', error);
    return NextResponse.json(
      { error: 'Failed to submit response' },
      { status: 500 }
    );
  }
}
