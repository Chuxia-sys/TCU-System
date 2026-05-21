import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { db } from '@/lib/db';

// GET - Poll for new notifications since a given timestamp
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');

    // Query only by userId (single-field index, no composite needed)
    const notifications = await db.notification.findMany({
      where: {
        userId: session.user.id,
      },
      take: 50,
    });

    // Filter in-memory: unread only + after 'since' timestamp
    let filtered = notifications.filter((n: any) => !n.read);
    if (since) {
      const sinceDate = new Date(since);
      filtered = filtered.filter((n: any) => new Date(n.createdAt) > sinceDate);
    }

    // Sort in-memory: newest first
    filtered.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      notifications: filtered.slice(0, 10),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error polling notifications:', error);
    return NextResponse.json({ notifications: [], timestamp: new Date().toISOString() });
  }
}
