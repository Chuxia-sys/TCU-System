import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { validateDocumentOwnership } from '@/lib/dept-auth';
import { db } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.role === 'admin';
    const isDeptHead = session.user.role === 'department_head';

    if (!isAdmin && !isDeptHead) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    // For dept_head: verify the conflict belongs to their department
    if (isDeptHead) {
      const conflict = await db.conflict.findUnique({
        where: { id },
        select: { scheduleId1: true },
      });

      if (!conflict) {
        return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
      }

      // Fetch the schedule's section to get the departmentId
      const schedule = conflict.scheduleId1
        ? await db.schedule.findUnique({
            where: { id: conflict.scheduleId1 },
            select: { section: { select: { departmentId: true } } },
          })
        : null;

      const scheduleDepartmentId = schedule?.section?.departmentId ?? null;

      const ownership = validateDocumentOwnership(session, scheduleDepartmentId);
      if (!ownership.allowed) {
        return NextResponse.json(
          { error: ownership.error },
          { status: ownership.status }
        );
      }
    }

    const conflict = await db.conflict.update({
      where: { id },
      data: {
        resolved: true,
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'resolve',
        entity: 'conflict',
        entityId: id,
        details: JSON.stringify({ resolvedBy: session.user.id }),
      },
    });

    return NextResponse.json(conflict);
  } catch (error) {
    console.error('Error resolving conflict:', error);
    return NextResponse.json({ error: 'Failed to resolve conflict' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.role === 'admin';
    const isDeptHead = session.user.role === 'department_head';

    if (!isAdmin && !isDeptHead) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    // For dept_head: verify the conflict belongs to their department
    if (isDeptHead) {
      const conflict = await db.conflict.findUnique({
        where: { id },
        select: { scheduleId1: true },
      });

      if (!conflict) {
        return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
      }

      // Fetch the schedule's section to get the departmentId
      const schedule = conflict.scheduleId1
        ? await db.schedule.findUnique({
            where: { id: conflict.scheduleId1 },
            select: { section: { select: { departmentId: true } } },
          })
        : null;

      const scheduleDepartmentId = schedule?.section?.departmentId ?? null;

      const ownership = validateDocumentOwnership(session, scheduleDepartmentId);
      if (!ownership.allowed) {
        return NextResponse.json(
          { error: ownership.error },
          { status: ownership.status }
        );
      }
    }

    await db.conflict.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'delete',
        entity: 'conflict',
        entityId: id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting conflict:', error);
    return NextResponse.json({ error: 'Failed to delete conflict' }, { status: 500 });
  }
}
