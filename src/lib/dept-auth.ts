// =============================================================
// Department Head Authorization Helper
// =============================================================
// Provides reusable authorization functions for department-level
// access control. ALL API routes that serve department_head users
// MUST use these helpers to enforce isolation.
//
// CRITICAL RULES:
// 1. Never trust frontend filtering alone
// 2. Always validate department ownership on the backend
// 3. Department Heads can ONLY access their own department
// 4. Admin has unrestricted access
// =============================================================

import { getAuthSession } from '@/lib/auth-session';

// Type for the session user returned by getAuthSession
interface AuthUser {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  image?: string | null;
}

interface AuthSession {
  user: AuthUser;
}

// ============================================================
// Core Authorization Checks
// ============================================================

/**
 * Get the authenticated session or return null.
 * Use this as the first check in every API route.
 */
export async function getAuthenticatedSession(): Promise<AuthSession | null> {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return session as AuthSession;
}

/**
 * Check if a user has admin role.
 */
export function isAdmin(session: AuthSession): boolean {
  return session.user.role === 'admin';
}

/**
 * Check if a user has department_head role.
 */
export function isDeptHead(session: AuthSession): boolean {
  return session.user.role === 'department_head';
}

/**
 * Check if a user has faculty role.
 */
export function isFaculty(session: AuthSession): boolean {
  return session.user.role === 'faculty';
}

// ============================================================
// Department Access Validation
// ============================================================

/**
 * Get the department filter that should be applied to queries
 * for the current user. Returns the departmentId that the user
 * is restricted to, or undefined if no restriction applies.
 *
 * - Admin: no restriction (returns undefined)
 * - Department Head: restricted to their departmentId
 * - Faculty: returns undefined (faculty filtering is different)
 */
export function getDepartmentFilter(session: AuthSession): string | undefined {
  if (isAdmin(session)) return undefined;
  if (isDeptHead(session)) return session.user.departmentId || undefined;
  return undefined;
}

/**
 * Validate that a department_head can access a specific department.
 * Admin always passes. Department heads can only access their own department.
 *
 * Returns { allowed: true } or { allowed: false, error: string, status: number }
 */
export function validateDepartmentAccess(
  session: AuthSession,
  targetDepartmentId: string | null | undefined
): { allowed: boolean; error?: string; status?: number } {
  // Admin can access any department
  if (isAdmin(session)) {
    return { allowed: true };
  }

  // Department heads can only access their own department
  if (isDeptHead(session)) {
    if (!session.user.departmentId) {
      return {
        allowed: false,
        error: 'Your account is not assigned to a department. Contact an administrator.',
        status: 403,
      };
    }

    if (targetDepartmentId && targetDepartmentId !== session.user.departmentId) {
      return {
        allowed: false,
        error: 'Access denied. You can only access resources in your own department.',
        status: 403,
      };
    }

    return { allowed: true };
  }

  // Faculty members should use their own access checks
  return {
    allowed: false,
    error: 'Access denied. Insufficient permissions.',
    status: 403,
  };
}

/**
 * Validate that a department_head can modify a specific document
 * that belongs to a department. This checks the document's departmentId
 * against the user's departmentId.
 *
 * Use this for PUT/DELETE operations where the target resource
 * has a departmentId field.
 */
export function validateDocumentOwnership(
  session: AuthSession,
  documentDepartmentId: string | null | undefined
): { allowed: boolean; error?: string; status?: number } {
  // Admin can modify any document
  if (isAdmin(session)) {
    return { allowed: true };
  }

  // Department heads can only modify documents in their department
  if (isDeptHead(session)) {
    if (!session.user.departmentId) {
      return {
        allowed: false,
        error: 'Your account is not assigned to a department. Contact an administrator.',
        status: 403,
      };
    }

    if (documentDepartmentId !== session.user.departmentId) {
      return {
        allowed: false,
        error: 'Access denied. You can only modify resources in your own department.',
        status: 403,
      };
    }

    return { allowed: true };
  }

  return {
    allowed: false,
    error: 'Access denied. Insufficient permissions.',
    status: 403,
  };
}

/**
 * Validate that a department_head can access a user record.
 * Admin can access any user. Department heads can only access
 * users in their own department.
 */
export function validateUserAccess(
  session: AuthSession,
  targetUserDepartmentId: string | null | undefined
): { allowed: boolean; error?: string; status?: number } {
  // Admin can access any user
  if (isAdmin(session)) {
    return { allowed: true };
  }

  // Department heads can only access users in their department
  if (isDeptHead(session)) {
    if (!session.user.departmentId) {
      return {
        allowed: false,
        error: 'Your account is not assigned to a department. Contact an administrator.',
        status: 403,
      };
    }

    if (targetUserDepartmentId !== session.user.departmentId) {
      return {
        allowed: false,
        error: 'Access denied. You can only access users in your own department.',
        status: 403,
      };
    }

    return { allowed: true };
  }

  return {
    allowed: false,
    error: 'Access denied. Insufficient permissions.',
    status: 403,
  };
}

// ============================================================
// Composite Authorization Checks
// ============================================================

/**
 * Require that the user is authenticated.
 * Returns the session if authenticated, or an error response.
 */
export async function requireAuth(): Promise<
  { session: AuthSession } | { error: ReturnType<typeof errorResponse> }
> {
  const session = await getAuthenticatedSession();
  if (!session) {
    return { error: errorResponse('Authentication required', 401) };
  }
  return { session };
}

/**
 * Require that the user is an admin or department_head.
 * Returns the session if authorized, or an error response.
 */
export async function requireAdminOrDeptHead(): Promise<
  { session: AuthSession } | { error: ReturnType<typeof errorResponse> }
> {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult;

  const { session } = authResult;
  if (!isAdmin(session) && !isDeptHead(session)) {
    return { error: errorResponse('Access denied. Admin or Department Head role required.', 403) };
  }

  return { session };
}

/**
 * Require that the user is an admin.
 * Returns the session if authorized, or an error response.
 */
export async function requireAdmin(): Promise<
  { session: AuthSession } | { error: ReturnType<typeof errorResponse> }
> {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult;

  const { session } = authResult;
  if (!isAdmin(session)) {
    return { error: errorResponse('Access denied. Admin role required.', 403) };
  }

  return { session };
}

// ============================================================
// Helper: Create a consistent error response object
// ============================================================

function errorResponse(message: string, status: number) {
  return { error: message, status };
}
