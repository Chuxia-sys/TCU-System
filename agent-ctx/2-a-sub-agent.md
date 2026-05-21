# Task 2-a: Fix Delete User TypeError

## Summary
Fixed 5 related bugs in the TCU Scheduling System's delete user functionality.

## Bugs Fixed

1. **Primary Bug - TypeError on `_count`**: The DELETE handler accessed `user._count.schedules` but the Firestore REST API adapter didn't support Prisma's `_count` pseudo-relation. Fixed by using manual `db.schedule.count()` instead.

2. **Missing cascade deletes**: `scheduleResponse` records were not deleted before deleting the user, which could cause orphaned records or foreign key violations. Added deletes for both schedule-owned responses and faculty-linked responses.

3. **Firestore IN query limit**: When `scheduleIds` exceeded 30 items, the `{ in: scheduleIds }` query would fail due to Firestore's IN limit. Fixed by batching in chunks of 30.

4. **`updateMany` with null values**: `auditLog.updateMany({ userId: id }, { userId: null })` doesn't work reliably with the Firestore REST API. Replaced with `deleteMany`.

5. **Swallowed error messages**: `safeJson()` returned `null` for non-OK responses, so the frontend couldn't show actual API error messages. Fixed to parse JSON body even for error responses.

## Files Modified
- `src/app/api/users/[id]/route.ts` - DELETE handler rewritten
- `src/lib/db.ts` - Added `_count` support to `resolveIncludes`
- `src/lib/utils.ts` - `safeJson` now reads error messages from non-OK responses
- `src/components/tables/UsersView.tsx` - `confirmDelete` and `handleSubmit` show real error messages

## Verification
- Lint passes (only pre-existing TanStack Table warning)
- Dev server compiles successfully, no errors in dev.log
