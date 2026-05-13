import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { db } from '@/lib/db';

// GET - Get pending schedules for the logged-in faculty (schedules without responses)
export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only faculty can access this endpoint
    if (session.user.role !== 'faculty') {
      return NextResponse.json({ error: 'Only faculty can access this endpoint' }, { status: 403 });
    }

    // Get schedules assigned to this faculty that don't have responses yet
    const pendingSchedules = await db.schedule.findMany({
      where: {
        facultyId: session.user.id,
        response: null, // No response yet
      },
      include: {
        subject: true,
        section: true,
        room: true,
      },
    });

    // Sort in-memory to avoid Firestore composite index
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    pendingSchedules.sort((a, b) => {
      const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.startTime.localeCompare(b.startTime);
    });

    return NextResponse.json(pendingSchedules);
  } catch (error) {
    console.error('Error fetching pending schedules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending schedules' },
      { status: 500 }
    );
  }
}
