---
Task ID: 1
Agent: Main
Task: Fix Admin Panel Delete User and Improve Responsive Design

Work Log:
- Investigated project structure and identified root cause of delete user bug
- Found the error in dev.log: `TypeError: Cannot read properties of undefined (reading 'schedules')` at line 251 of users/[id]/route.ts
- The code was previously partially fixed (using `scheduleCount` instead of `user._count.schedules`) but needed better error handling
- Fixed DELETE handler in /api/users/[id]/route.ts with comprehensive logging, isolated try-catch blocks for each step, and non-blocking audit log creation
- Rewrote UsersView.tsx with full responsive design, mobile card view, improved delete dialog with user preview, and loading states
- Fixed responsive design in DepartmentsView, SubjectsView, RoomsView, SectionsView, FacultyView, SchedulesView:
  - Titles: text-3xl → text-xl sm:text-2xl lg:text-3xl
  - Container spacing: space-y-6 → space-y-4 sm:space-y-6
  - Card padding: pt-6 → p-3 sm:p-4 or p-3 sm:p-6
  - Form layouts: grid-cols-4 → stacked space-y-1.5 on mobile
  - Dialogs: max-w-[95vw] sm:max-w-lg, responsive DialogFooter
  - Input fields: h-9 text-sm for compact mobile-friendly sizing
  - Badges: text-xs for compact display
  - Stats cards: responsive font sizes and padding
- Improved DataTable with auto mobile detection (auto-switch to card view on <640px screens)
- All lint checks pass (only pre-existing TanStack Table warning)

Stage Summary:
- Delete User API: Fixed with proper error handling, step-by-step logging, and isolated error boundaries
- Responsive Design: All 7 admin views (Users, Departments, Subjects, Rooms, Sections, Faculty, Schedules) now have mobile-first responsive design
- DataTable: Auto-detects mobile screens and switches to card view
- Key files modified: 
  - src/app/api/users/[id]/route.ts (delete handler fix)
  - src/components/tables/UsersView.tsx (full rewrite)
  - src/components/tables/DepartmentsView.tsx (responsive)
  - src/components/tables/SubjectsView.tsx (responsive)
  - src/components/tables/RoomsView.tsx (responsive)
  - src/components/tables/SectionsView.tsx (responsive)
  - src/components/tables/FacultyView.tsx (responsive)
  - src/components/tables/SchedulesView.tsx (responsive)
  - src/components/tables/DataTable.tsx (auto mobile detection)
