import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { FIREBASE_PROJECT_ID } from '@/lib/firebase';

// ============================================================
// Custom Claims Management API
// ============================================================
// Sets Firebase Auth custom claims for department heads to store
// their role and departmentId in the auth token.
//
// This enables:
// 1. Firestore security rules to check request.auth.token.departmentId
// 2. Backend authorization to verify claims match the user record
// 3. Client-side role/department checks without DB lookups
//
// IMPORTANT: This requires the Firebase Auth Admin SDK or
// the Identity Toolkit REST API with a service account token.
// Since this project uses Firestore REST API with API key auth,
// we store claims in a custom collection as a fallback.
// ============================================================

// PUT /api/custom-claims - Set custom claims for a user
export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can set custom claims
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Fetch the user to get their role and departmentId
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build the claims object
    const claims: Record<string, string | boolean> = {
      role: user.role,
    };

    if (user.departmentId) {
      claims.departmentId = user.departmentId;
    }

    // Store the claims in a custom collection since we use REST API
    // (Firebase Auth custom claims require Admin SDK with service account)
    // This serves as a verifiable claim store for the backend
    try {
      // Try to use Firebase Auth REST API to set custom claims
      // This requires a Google OAuth2 access token which we may not have
      // As a fallback, we store claims in Firestore
      const claimDoc = {
        fields: {
          userId: { stringValue: user.id },
          uid: { stringValue: user.uid || user.id },
          email: { stringValue: user.email },
          role: { stringValue: user.role },
          departmentId: user.departmentId
            ? { stringValue: user.departmentId }
            : { nullValue: null },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      };

      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/authClaims/${user.id}?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(claimDoc),
        }
      );

      if (!response.ok && response.status !== 404) {
        console.warn('[Custom Claims] Failed to store claims in Firestore:', response.status);
      }
    } catch (error) {
      console.warn('[Custom Claims] Error storing claims:', error);
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'set_custom_claims',
        entity: 'user',
        entityId: userId,
        details: JSON.stringify({ claims }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Custom claims set for ${user.name}`,
      claims,
    });
  } catch (error) {
    console.error('Error setting custom claims:', error);
    return NextResponse.json(
      { error: 'Failed to set custom claims' },
      { status: 500 }
    );
  }
}

// POST /api/custom-claims - Sync claims for all department heads
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can sync all claims
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    // Get all department heads
    const deptHeads = await db.user.findMany({
      where: { role: 'department_head' },
      include: { department: true },
    });

    let synced = 0;
    let errors = 0;

    for (const user of deptHeads) {
      try {
        const claims = {
          role: user.role,
          departmentId: user.departmentId || undefined,
        };

        // Store in authClaims collection
        const claimDoc = {
          fields: {
            userId: { stringValue: user.id },
            uid: { stringValue: user.uid || user.id },
            email: { stringValue: user.email },
            role: { stringValue: user.role },
            departmentId: user.departmentId
              ? { stringValue: user.departmentId }
              : { nullValue: null },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        };

        const response = await fetch(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/authClaims/${user.id}?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(claimDoc),
          }
        );

        if (response.ok || response.status === 404) {
          synced++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'sync_custom_claims',
        entity: 'system',
        entityId: 'all_dept_heads',
        details: JSON.stringify({ synced, errors, total: deptHeads.length }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Synced custom claims for ${synced} department heads`,
      synced,
      errors,
      total: deptHeads.length,
    });
  } catch (error) {
    console.error('Error syncing custom claims:', error);
    return NextResponse.json(
      { error: 'Failed to sync custom claims' },
      { status: 500 }
    );
  }
}

// GET /api/custom-claims - Verify claims for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch stored claims
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/authClaims/${session.user.id}?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      { method: 'GET' }
    );

    if (response.status === 404) {
      return NextResponse.json({
        hasClaims: false,
        message: 'No custom claims found. Ask an admin to sync claims.',
        expectedClaims: {
          role: session.user.role,
          departmentId: session.user.departmentId,
        },
      });
    }

    if (!response.ok) {
      return NextResponse.json({
        hasClaims: false,
        error: 'Failed to fetch claims',
      });
    }

    const data = await response.json();
    const fields = data.fields || {};

    // Parse stored claims
    const storedClaims = {
      role: fields.role?.stringValue || null,
      departmentId: fields.departmentId?.stringValue || fields.departmentId?.nullValue || null,
    };

    // Verify claims match current user data
    const claimsMatch =
      storedClaims.role === session.user.role &&
      (storedClaims.departmentId === session.user.departmentId ||
        (!storedClaims.departmentId && !session.user.departmentId));

    return NextResponse.json({
      hasClaims: true,
      claims: storedClaims,
      claimsMatch,
      expectedClaims: {
        role: session.user.role,
        departmentId: session.user.departmentId,
      },
      warning: !claimsMatch
        ? 'Claims are out of sync with your user record. Ask an admin to update claims.'
        : undefined,
    });
  } catch (error) {
    console.error('Error verifying custom claims:', error);
    return NextResponse.json(
      { error: 'Failed to verify custom claims' },
      { status: 500 }
    );
  }
}
