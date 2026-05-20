import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedSession, isAdmin, isDeptHead } from '@/lib/dept-auth';

// PUT /api/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    // Authentication check
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, name, phone, image } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Authorization check: users can only update their own profile unless admin
    const userIsAdmin = isAdmin(session);
    const userIsDeptHead = isDeptHead(session);

    if (!userIsAdmin) {
      // Non-admin users can only update their own profile
      if (userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied. You can only update your own profile.' },
          { status: 403 }
        );
      }

      // Department heads can only update their own profile (not other users')
      if (userIsDeptHead && userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied. Department heads can only update their own profile.' },
          { status: 403 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (image !== undefined) updateData.image = image;

    const user = await db.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'update_profile',
        entity: 'user',
        entityId: userId,
        details: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        image: user.image,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
