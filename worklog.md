---
Task ID: 12
Agent: main
Task: Fix systemic "Failed to fetch" errors — notification polling storm + Firestore composite index optimization

Work Log:
- Diagnosed root cause: NotificationProvider polling every 5s, each poll taking 1.5-2.4s due to 3-step Firestore index fallback retries
- Combined with Header polling every 30s, the server was overwhelmed with constant Firestore queries
- This caused ALL other API calls (NextAuth session, departments, etc.) to timeout → "Failed to fetch"

Changes made:

1. **`src/components/notifications/NotificationProvider.tsx`** — Reduced polling + exponential backoff:
   - Changed polling interval from 5s to 30s base
   - Added exponential backoff on failure: 30s → 60s → 120s max
   - Added AbortController to cancel in-flight requests before starting new ones
   - Used `setTimeout` chain instead of `setInterval` for dynamic backoff
   - Reset backoff to 30s on successful poll

2. **`src/app/api/notifications/poll/route.ts`** — Eliminated composite index requirement:
   - Changed query from `where: { userId, read: false, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }`
   - To: `where: { userId }` only (single-field index, auto-created by Firestore)
   - Moved `read` filter and `createdAt` inequality filter to in-memory
   - Moved `orderBy` to in-memory sort
   - Result: 249ms response time (down from 1.5-2.4s)

3. **`src/app/api/notifications/route.ts`** — Same optimization for notification list:
   - Changed `where: { userId, read: false }, orderBy: { createdAt: 'desc' }` to `where: { userId }` only
   - Filter `read` and sort in-memory
   - Result: ~250ms response time (down from 1.2-1.5s)

4. **`src/components/layout/Header.tsx`** — Fixed rapid re-fetching + AbortController:
   - Changed useEffect dependency from `session` (re-created every render) to `sessionId` (stable string)
   - Added AbortController for notification fetch cleanup
   - Changed `handleMarkAllRead` to optimistic local state update instead of re-fetching
   - Removed unused `useCallback` import

5. **`src/components/auth/LoginPage.tsx`** — Added safeJson for robustness:
   - Added `safeJson` import
   - Changed `fetchDepartments` to use `safeJson<Department[]>` instead of raw `res.json()`
   - Changed `handleRegister` to use `safeJson<{ error?: string }>` instead of raw `res.json()`

6. **`src/app/api/schedules/route.ts`** — Eliminated composite index for schedules list:
   - Removed `orderBy: [{ day: 'asc' }, { startTime: 'asc' }]` from findMany
   - Added in-memory sort using dayOrder array + startTime comparison
   - Result: no more `[DB] Missing composite index for "schedules"` errors

7. **`src/app/api/conflicts/route.ts`** — Eliminated composite index for conflicts detection:
   - Removed `orderBy: [{ day: 'asc' }, { startTime: 'asc' }]` from schedules query
   - Conflict detection already sorts by startTime in-memory within each day group

8. **`src/app/api/schedule-responses/pending/route.ts`** — Eliminated composite index:
   - Removed multi-field orderBy, added in-memory sort with dayOrder

Stage Summary:
- Files changed: 8 files (3 components, 5 API routes)
- Notification polling: 5s → 30s with exponential backoff on failure
- Notification API response time: 1.5-2.4s → 250ms (6-10x faster)
- Zero Firestore composite index errors in latest logs
- Zero "Failed to fetch" errors in latest logs
- Lint passes clean (0 errors, 1 pre-existing TanStack Table warning)

---
Task ID: 11
Agent: main
Task: Fix generated schedules not appearing in calendar — Firestore composite index fallback

Work Log:
- User reported schedules were generated (20/20 saved) but not appearing in the calendar
- Investigated dev.log: every `/api/schedules` call was failing with `Firestore REST error 400: The query requires an index`
- Root cause: Firestore requires composite indexes for queries with multiple `orderBy` fields (e.g., `day ASC, startTime ASC`) or equality filters combined with orderBy/inequality filters
- The `findMany` method in `src/lib/db.ts` was catching the error and returning empty array `[]`
- Also affecting: notifications poll (equality + inequality + orderBy), sections, rooms queries
- Solution: implemented a 3-step graceful fallback in `findMany`:

Changes made — **`src/lib/db.ts`**:

1. **Enhanced `buildFilters`** with `options` parameter:
   - `{ equalityOnly: true }` — returns only EQUAL, NOT_EQUAL, IN, ARRAY_CONTAINS filters
   - `{ inequalityOnly: true }` — returns only GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL filters
   - Default (no options) — returns all filters (backward compatible)

2. **3-step fallback in `findMany`**:
   - **Attempt 1**: Full query with all filters + orderBy (same as before)
   - **Attempt 2**: If "requires an index" error → retry without orderBy, sort in-memory
   - **Attempt 3**: If still "requires an index" → retry with only equality filters, apply inequality filters in-memory, sort in-memory
   - Each step logs a descriptive warning for debugging
   - All retries use the same `processResults` helper for skip/take/include

3. **In-memory sort** (`sortInMemory` helper):
   - Supports multi-field orderBy with ASC/DESC
   - Handles both string (localeCompare) and numeric comparisons
   - Matches Firestore ordering semantics

4. **In-memory inequality filtering** (`applyInequalityFilters` helper):
   - Applies GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL
   - Used when Attempt 3 strips inequality filters from the Firestore query

Stage Summary:
- Files changed: `src/lib/db.ts`
- All `findMany` calls now resilient to missing Firestore composite indexes
- Schedules, notifications, sections, rooms queries all succeed via fallback
- Lint passes clean (0 errors, 1 pre-existing warning)
- Verified: `/api/schedules` returns 200 with schedule data after fix

---

Task ID: 10
Agent: main
Task: Comprehensive enhancement of Schedule Calendar with modern card-based entries

Work Log:
- Read existing CalendarView.tsx (853 lines), types, store, utils, and UI components
- Identified improvements needed: better overlap algorithm, color legend, "+N more" stacking, shadcn Dialog/Tooltip integration, empty state, dark mode polish, proper `cn` import
- Complete rewrite of CalendarView.tsx with all requested enhancements

Changes made — **`src/components/calendar/CalendarView.tsx`** (complete rewrite):

1. **Modern card design**:
   - Left color accent border (3px), rounded corners, subtle shadows on hover
   - Semi-transparent backgrounds with subject color (dark mode support via `dark:` prefix)
   - Clear visual hierarchy: bold subject code, secondary info below
   - Conflict cards have red ring + pulse animation indicator

2. **Card content** (progressively revealed by height):
   - Subject code (bold, always visible)
   - Subject name (height > 52px)
   - Time range with clock icon (always visible)
   - Faculty name (height > 76px)
   - Room name (height > 92px)
   - Section name (height > 108px)
   - Department (height > 124px)

3. **Color coding**:
   - Stable `Map<subjectId, colorIndex>` built via `useMemo`, sorted alphabetically by subject code for consistency across refreshes
   - 12 distinct pastel colors with light/dark mode variants
   - Replaced indigo with yellow for the 12th color (no indigo/blue per guidelines)
   - Added `hoverBg` property to each color for hover state
   - Collapsible **color legend** with Palette button in header, showing subject code → color mapping

4. **Enhanced overlap algorithm**:
   - BFS-based overlap group detection: finds maximal sets of connected overlapping intervals
   - Greedy column assignment within each group
   - `MIN_CARD_WIDTH = 90px`, `MAX_VISIBLE_OVERLAPS = 3` constants
   - Cards beyond MAX_VISIBLE_OVERLAPS are hidden; shows **"+N more" overflow card** at the overlap region
   - Proportional width: `width = 100 / totalCols %` with 1px gap

5. **Expandable detail dialog** using shadcn `Dialog` component:
   - Subject icon badge with color, name + code in header
   - Status badge + year level badge
   - 2-column details grid: faculty, faculty dept, room, building, section, time, day, department
   - Conflict warning box with AlertTriangle icon
   - Close button in footer

6. **Hover tooltip** using shadcn `Tooltip`:
   - Quick preview on desktop hover showing subject, time, faculty, room, section, conflict indicator
   - Positioned above card with proper z-index

7. **Empty state**:
   - Clean centered layout with CalendarIcon in muted circle
   - "No schedules yet" heading + helpful description
   - Refresh button in header

8. **Real-time sync**: Watches `lastRefresh` from Zustand store, unchanged

9. **Responsive design**:
   - Desktop: full 6-day week grid with horizontal scroll
   - Tablet: compressed grid with min-width per column
   - Mobile: pill navigation (rounded-full day buttons with "All" button) + list view with card entries
   - Mobile list cards show all info: subject code, name, time, faculty, room, section, department
   - Mobile list has "Show all" button + AnimatePresence transitions

10. **Performance**:
    - `useMemo` for all computations: `filteredSchedules`, `colorMap`, `schedulesByDay`, `dayLayouts`, `colorLegend`, `conflictCount`
    - `useCallback` for `fetchData`, `handlePrint`, `handleExport`, `clearFilters`
    - Proper dependency arrays throughout

11. **Other improvements**:
    - Removed local `cn` function — uses `cn` from `@/lib/utils`
    - Removed `formatTimeRange` import (unused in previous version)
    - Half-hour dashed grid lines for finer time resolution
    - Day headers with backdrop blur (`backdrop-blur-sm`) for modern feel
    - Reduced time gutter from `w-16` with no left padding for cleaner alignment
    - Status legend at bottom preserved
    - Print and CSV export buttons with hidden text on mobile (icon-only)
    - All fetch calls use `safeJson` with proper generic types
    - Faculty filtering preserved (faculty role sees only their own schedules)
    - All filter dropdowns (day, section, faculty, room) + Clear button preserved
    - Current time red indicator preserved

Stage Summary:
- Files changed: `src/components/calendar/CalendarView.tsx` (complete rewrite)
- Enhanced overlap algorithm with BFS group detection and "+N more" stacking
- Modern card design with left accent, dark mode, progressive content reveal
- Color legend, hover tooltips, shadcn Dialog for details
- Empty state, responsive mobile view with pill navigation
- Lint passes clean (0 errors, 1 pre-existing warning unrelated)

---
Task ID: 9
Agent: main
Task: Fix schedule generation 502 timeout — convert to async fire-and-forget pattern

Work Log:
- Investigated "Generate API returned status 502: null" error
- Analyzed dev.log: generate API consistently takes 34-36 seconds to complete
- Root cause: sandbox proxy/gateway has ~30 second timeout, killing the request before server finishes → 502 Bad Gateway
- Solution: make generation asynchronous — return 200 immediately, run heavy work in background

Changes made:
1. **`src/app/api/generate/route.ts`** — Async fire-and-forget:
   - Auth check and body parsing complete BEFORE response (guaranteed)
   - Generate `generationId` (UUID) for tracking
   - Start background IIFE that does ALL heavy work (data fetch, algorithm, DB saves, notifications, audit log)
   - Return `{ success: true, generating: true, generationId, message }` immediately (~100ms)
   - Background error handling: logs errors + sends notification to admin via `db.notification.create()` + `sendNotificationToUser()`
   - Completion handling: sends admin notification with summary (schedule count, conflicts, violations)
   - All existing generation logic preserved exactly as-is, just moved into background IIFE

2. **`src/components/dashboard/DashboardView.tsx`** — Background generation UI:
   - New state: `bgGenerating` (boolean), `pollTimerRef`, `pollStartRef`, `prevScheduleCountRef`
   - `executeGeneration()`: detects `generating: true` response → shows toast, starts polling
   - `pollForCompletion()`: polls `/api/stats` every 5 seconds, detects when `totalSchedules` changes
   - Auto-stops after 2 minutes with info toast
   - Cleanup on unmount via useEffect return
   - Button shows 3 states: "Generate Schedules" / "Starting..." / "Generating in background..." with pulse animation
   - Backward compatible: falls back to legacy sync handling if `generating` field absent

Stage Summary:
- Files changed: `src/app/api/generate/route.ts`, `src/components/dashboard/DashboardView.tsx`
- API returns immediately (~100ms), generation runs in background (~35s)
- Client polls for completion and auto-refreshes dashboard
- Admin gets notification when generation completes or fails
- Lint passes clean (0 errors, 1 pre-existing warning)

---
Task ID: 8
Agent: main
Task: Fix "failed to generate schedule" error — client error display + server defensive error handling

Work Log:
- Investigated the generate route (`src/app/api/generate/route.ts`) and client code (`src/components/dashboard/DashboardView.tsx`)
- Identified root cause: `safeJson()` utility in `src/lib/utils.ts` returns `null` on non-OK responses (line 14: `if (!res.ok) return null`), dropping the server's JSON error body
- The generate endpoint returns JSON errors with status 400 (validation) or 500 (server error), but `safeJson` discards the body, so client shows generic "Failed to generate schedules" instead of the actual error
- Additionally found multiple server-side database operations without try-catch that could crash the entire generation

Changes made:
1. **Client-side (`DashboardView.tsx`) — `executeGeneration()` function**:
   - Replaced `safeJson(res)` with manual JSON parsing that reads the response body even on non-OK status codes
   - Now displays the actual server error message (e.g., "Validation failed", specific error details)
   - Added console logging of status code and response body for easier debugging

2. **Server-side (`generate/route.ts`) — defensive error handling**:
   - Fixed `deleteMany` call: removed unsupported Prisma-style nested relation filter `{ section: { departmentId } }` → changed to `deleteMany({})` since `departmentId` is never passed from client
   - Added try-catch around `schedule.deleteMany` (non-fatal, continues generation)
   - Added try-catch around `conflict.deleteMany` (non-fatal)
   - Added try-catch around `schedule.createMany` with fallback: if batch create fails, retries each schedule individually
   - Added try-catch around `notification.create` (non-fatal, generation succeeds even if notifications fail)
   - Added try-catch around `auditLog.create` (non-fatal)
   - Reduced batch size from 100 to 50 for Firestore compatibility

Stage Summary:
- Files changed: `src/components/dashboard/DashboardView.tsx`, `src/app/api/generate/route.ts`
- Client now shows actual server error messages instead of generic "Failed to generate schedules"
- Server generation is much more resilient: notification/audit log failures no longer crash the entire generation
- Batch save failures gracefully fall back to individual saves
- Lint passes clean (0 errors, 1 pre-existing warning)

---
Task ID: 7
Agent: main
Task: Fix "Failed to generate schedules" 401 Unauthorized error — auth, preferences, and env fixes

Work Log:
- Root cause: `getServerSession(authOptions)` in API route handlers was failing to read cookies behind Caddy reverse proxy, returning null session and triggering 401
- Also identified: `NEXTAUTH_URL` not set in `.env`, causing NextAuth warnings
- Also identified: `f.preferences` accessed as a single object but it's a `many` relation (array) — needs `[0]` indexing

Changes made:
1. Created `src/lib/auth-session.ts` — shared helper `getAuthSession()` that wraps `getServerSession(authOptions)` with explicit cookie passing via `cookies()` from `next/headers`
2. Updated all 22 API route files to import `getAuthSession` instead of `getServerSession` + `authOptions`:
   - src/app/api/generate/route.ts
   - src/app/api/schedules/route.ts
   - src/app/api/schedules/[id]/route.ts
   - src/app/api/conflicts/route.ts
   - src/app/api/conflicts/[id]/route.ts
   - src/app/api/settings/route.ts
   - src/app/api/departments/route.ts
   - src/app/api/departments/[id]/route.ts
   - src/app/api/users/route.ts
   - src/app/api/users/[id]/route.ts
   - src/app/api/subjects/route.ts
   - src/app/api/subjects/[id]/route.ts
   - src/app/api/sections/route.ts
   - src/app/api/sections/[id]/route.ts
   - src/app/api/rooms/route.ts
   - src/app/api/rooms/[id]/route.ts
   - src/app/api/notifications/route.ts
   - src/app/api/notifications/poll/route.ts
   - src/app/api/profile/password/route.ts
   - src/app/api/stats/route.ts
   - src/app/api/schedule-responses/route.ts
   - src/app/api/schedule-responses/pending/route.ts
3. Fixed `f.preferences` array access in generate route (4 locations):
   - Debug logging block: `f.preferences` → `f.preferences?.[0]`
   - Pre-generation conflict check: `f.preferences` → `f.preferences?.[0]`
   - Faculty capacity check: `f.preferences` → `f.preferences?.[0]`
   - Data transformation for algorithm: `f.preferences` → `f.preferences?.[0]` (converted arrow function to block body)
4. Added `NEXTAUTH_URL=http://localhost:3000` to `.env`
5. Added `console.log('Generate request received, checking auth...')` before auth check in generate route
6. Did NOT modify `src/lib/auth.ts` as instructed

Stage Summary:
- Files changed: 22 API route files + 1 new helper (`src/lib/auth-session.ts`) + `.env`
- Auth fix: all API routes now explicitly pass cookies to getServerSession, resolving 401 behind Caddy proxy
- Preferences fix: faculty preferences correctly accessed as array[0] instead of treating as single object
- Lint passes clean (0 errors, 1 pre-existing warning unrelated)

---

Task ID: 6
Agent: main
Task: Rewrite scheduling algorithm to be truly preference-aware

Work Log:
- Analyzed current `src/lib/scheduling-algorithm.ts` (1305 lines) to understand existing architecture
- Identified 6 key problems: weak preference weighting (0.15), no preference-aware slot filtering, no faculty subject preference prioritization, no fallback mechanism, no preference violation warnings, no match rate tracking
- Added 3 new preference helper functions: `isPreferredDay()`, `isPreferredTime()`, `isPartialPreferredTime()`, `isPreferredSubject()`, `facultyHasPreferences()`
- Added `generatePreferenceAwareSlots()` — new function that takes a Faculty param and returns slots filtered by preferred days (HARD filter) and preferred time range (HARD filter), with automatic fallback to all slots when no valid candidates exist
- Rewrote `getEligibleFaculty()` to sort faculty by preference priority: faculty who have the subject in their `preferredSubjects` list come FIRST, then by load balance (least loaded first)
- Rewrote `generateCandidates()` to use two-phase approach: Phase 1 generates candidates using only preference-aligned slots per faculty; Phase 2 falls back to all days/times when Phase 1 yields 0 candidates. Extracted `buildCandidatesFromSlots()` helper for DRY code.
- Updated WEIGHTS: `FACULTY_PREFERENCE: 0.15 → 0.45`, `LOAD_BALANCE: 0.30 → 0.15`, others reduced proportionally
- Added `PREF_SCORES` constants: `PREFERRED_DAY: +10.0`, `PREFERRED_TIME: +8.0`, `PREFERRED_SUBJECT: +12.0`, `PARTIAL_TIME: +4.0`, `NON_PREFERRED_DAY: -5.0`, `OUTSIDE_PREFERRED_TIME: -3.0`, `UNAVAILABLE_DAY: -20.0`
- Rewrote `scoreFacultyPreference()` to use massive scoring differences so preference-matching candidates always score far higher than non-matching ones
- Updated `calculateOverallScore()` to use the new weight distribution
- Added preference violation detection in `detectViolations()`: new Pass 2 checks each assignment against faculty preferences, generates `preference_violation` type warnings with severity 'warning', listing which constraints (day, time, subject) were violated
- Updated `calculateStats()` to compute weighted preference match rate: all=1.0, partial=0.5, none=0.0
- Added `evaluatePreferenceMatch()` private method returning 'all' | 'partial' | 'none'
- Added comprehensive debug logging: `logAllFacultyPreferences()` at start logs each faculty's loaded preferences, `logPreferenceMatchSummary()` at end logs per-faculty and total match statistics
- Added `[PREF-PHASE1]`, `[PREF-PHASE2]`, `[PREF-FALLBACK]` log markers throughout the candidate generation process
- All existing interfaces/types preserved unchanged (Faculty, Room, Section, Subject, etc.)
- `generateSchedules()` export signature unchanged
- All hard constraints preserved (double booking, capacity, equipment, specialization, unavailable days)
- Backtracking mechanism preserved

Stage Summary:
- Files changed: `src/lib/scheduling-algorithm.ts`
- Complete rewrite of preference handling from soft scoring (weight 0.15) to dominant scoring (weight 0.45) with hard-constraint-first slot generation
- Two-phase candidate generation ensures preference-aligned slots are tried first, with automatic fallback
- Faculty eligible list now prioritized by subject preference match
- Lint passes clean (0 errors, 1 pre-existing warning)

---
Task ID: 5
Agent: main
Task: Replace chevron icon with burger menu, increase TCU logo to 40px, enhance calendar with card-based layout

Work Log:
- Analyzed current Sidebar, Header, AppShell, MobileBottomNav, CalendarView, page.tsx, types, store, schedules API
- Replaced ChevronLeft/ChevronRight icons in Sidebar with Menu (hamburger) icon from lucide-react
- Placed burger menu button horizontally beside TCU logo in same row with proper alignment
- Increased TCU logo from 28px to 40px in both Sidebar (expanded + collapsed states) and Header mobile view
- Changed logo container from `rounded-md p-1` to `rounded-lg p-1.5` for better visual proportion at 40px
- Completely rewrote CalendarView.tsx as a modern card-based weekly calendar grid:
  - CSS Grid layout with absolute-positioned schedule cards aligned to time slots
  - 12-color palette for subject-based color coding (stable color assignment via colorMap)
  - Overlap detection algorithm: greedy interval scheduling with column-based layout
  - Cards show: subject code, name, time, faculty, room, section (progressively revealed based on card height)
  - Hover overlay with full details on desktop
  - Click-to-expand detail dialog with all info, department, conflict warning
  - Current time red indicator line
  - Day filtering: click day header to isolate, mobile day pills
  - Mobile list view for selected day below the grid
  - Responsive design: full grid on desktop, day pills + list on mobile
  - Smooth scroll to current time on mount
  - Print and CSV export support
  - Status legend with colored dots
  - Schedule count per day in headers
  - Clean empty slots when no schedules exist
- Added auto-refresh: DashboardView now calls `triggerRefresh()` after successful generation
- CalendarView watches `lastRefresh` from store to auto-fetch new data after generation
- Added manual Refresh button in calendar header

Stage Summary:
- Files changed: `src/components/layout/Sidebar.tsx`, `src/components/layout/Header.tsx`, `src/components/calendar/CalendarView.tsx`, `src/components/dashboard/DashboardView.tsx`
- Sidebar: burger menu icon replaces chevron, TCU logo 40px, horizontal alignment
- Calendar: complete rewrite with card-based weekly grid, color coding, overlap handling, responsive, auto-refresh
- Lint passes clean (0 errors, 1 pre-existing warning)

---
Task ID: 4
Agent: general-purpose
Task: Fix all unsafe .json() fetch calls across component files

Work Log:
- Read `safeJson` utility from `src/lib/utils.ts` — checks `res.ok`, `content-type: application/json`, wraps `.json()` in try/catch, returns `null` on any failure
- Identified all 17 component files with `.json()` calls to modify
- For each file: added `safeJson` import, replaced all `await res.json()` / `await someRes.json()` with `await safeJson(res)` / `await safeJson<ExpectedType>(res)`
- Converted `if (res.ok) { ... } else { const data = await res.json(); ... }` patterns to `const data = await safeJson(res); if (data) { ... } else { ... }`
- Added `Array.isArray()` guards after `safeJson()` for GET requests that expect array data
- Added optional chaining (`?.`) where safeJson may return null for nested property access
- Preserved existing business logic (toasts, data processing, error messages) while simplifying control flow
- Verified with `rg` that only `LoginPage.tsx` (excluded by rules) still has raw `.json()` calls
- Ran `bun run lint` — 0 errors, 1 pre-existing warning (unrelated DataTable TanStack Table issue)

Files modified (17 total):
- src/components/calendar/CalendarView.tsx (4 safeJson calls)
- src/components/dashboard/DashboardView.tsx (5 safeJson calls)
- src/components/responses/MyScheduleResponsesView.tsx (4 safeJson calls)
- src/components/responses/ScheduleResponsesView.tsx (1 safeJson call)
- src/components/tables/UsersView.tsx (4 safeJson calls)
- src/components/tables/ReportsView.tsx (1 safeJson call)
- src/components/tables/DepartmentsView.tsx (4 safeJson calls)
- src/components/tables/FacultyView.tsx (5 safeJson calls)
- src/components/tables/SchedulesView.tsx (7 safeJson calls)
- src/components/tables/SubjectsView.tsx (4 safeJson calls)
- src/components/tables/RoomsView.tsx (4 safeJson calls)
- src/components/tables/ConflictView.tsx (1 safeJson call)
- src/components/tables/NotificationsView.tsx (1 safeJson call)
- src/components/tables/SectionsView.tsx (4 safeJson calls)
- src/components/tables/PreferencesView.tsx (3 safeJson calls)
- src/components/tables/SettingsView.tsx (4 safeJson calls)
- src/components/tables/ProfileView.tsx (7 safeJson calls)

Stage Summary:
- All 17 component files updated: ~63 unsafe `.json()` calls replaced with `safeJson()`
- No files in `src/app/api/`, `src/lib/db.ts`, or `src/components/auth/LoginPage.tsx` were modified
- Lint passes clean (0 errors, 1 pre-existing warning unrelated to this change)
- All fetch calls now safely handle HTML error pages, non-JSON responses, and network failures without SyntaxError
