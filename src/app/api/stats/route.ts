import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthSession } from '@/lib/auth-session';
import { getDepartmentFilter, isAdmin, isDeptHead, isFaculty } from '@/lib/dept-auth';

// GET /api/stats
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const departmentIdParam = searchParams.get('departmentId');
    const facultyId = searchParams.get('facultyId');

    // Determine role-based filtering
    const userIsFaculty = isFaculty(session as Parameters<typeof isFaculty>[0]);
    const userIsDeptHead = isDeptHead(session as Parameters<typeof isDeptHead>[0]);
    const userIsAdmin = isAdmin(session as Parameters<typeof isAdmin>[0]);

    // Faculty can only see their own data
    const filterFacultyId = userIsFaculty ? session.user.id : facultyId;

    // Department filtering:
    // - Admin: use URL param if provided, otherwise no filter
    // - Dept Head: forced to their own department (ignore URL param)
    // - Faculty: no department filter (they see their own data via facultyId filter)
    let departmentFilter: string | undefined;
    if (userIsDeptHead) {
      // Department heads are restricted to their own department
      departmentFilter = session.user.departmentId || undefined;
    } else if (userIsAdmin) {
      // Admin can optionally filter by department via URL param
      departmentFilter = departmentIdParam || undefined;
    }
    // Faculty: no department filter (they only see their own schedules)

    // Pre-fetch section IDs for department filtering
    // Firestore REST API doesn't support nested where clauses like
    // { section: { departmentId: ... } }, so we resolve to section IDs first.
    let departmentSectionIds: string[] | undefined;
    if (departmentFilter) {
      const deptSections = await db.section.findMany({
        where: { departmentId: departmentFilter },
      });
      departmentSectionIds = deptSections.map(s => s.id);
    }

    // Get all relevant data
    const [users, schedules, conflicts, rooms, sections, subjects] = await Promise.all([
      db.user.findMany({
        where: {
          role: 'faculty',
          ...(departmentFilter && { departmentId: departmentFilter }),
          ...(filterFacultyId && { id: filterFacultyId }),
        },
        include: { department: true },
      }),
      db.schedule.findMany({
        where: {
          ...(departmentSectionIds && departmentSectionIds.length > 0
            ? { sectionId: { in: departmentSectionIds } }
            : departmentFilter ? { sectionId: '__none__' } : {}),
          ...(filterFacultyId && { facultyId: filterFacultyId }),
        },
        include: { subject: true, faculty: true, room: true, section: true },
      }),
      db.conflict.findMany({
        where: {
          resolved: false,
        },
      }),
      db.room.findMany(),
      db.section.findMany({
        where: departmentFilter ? { departmentId: departmentFilter } : undefined,
      }),
      db.subject.findMany({
        where: departmentFilter ? { departmentId: departmentFilter } : undefined,
      }),
    ]);

    // Filter conflicts by department in memory (Firestore can't join across collections)
    let filteredConflicts = conflicts;
    if (departmentSectionIds && departmentSectionIds.length > 0) {
      const deptScheduleIds = new Set(schedules.map(s => s.id));
      filteredConflicts = conflicts.filter(c =>
        deptScheduleIds.has(c.scheduleId1) || deptScheduleIds.has(c.scheduleId2)
      );
    } else if (departmentFilter) {
      // Department has no sections → no conflicts to show
      filteredConflicts = [];
    }

    // Calculate stats
    const totalFaculty = users.length;
    const totalSchedules = schedules.length;
    const totalConflicts = filteredConflicts.length;

    // Faculty utilization
    const facultyLoads: Record<string, number> = {};
    users.forEach(u => { facultyLoads[u.id] = 0; });
    schedules.forEach(s => {
      if (s.subject) {
        facultyLoads[s.facultyId] = (facultyLoads[s.facultyId] || 0) + s.subject.units;
      }
    });

    const totalCapacity = users.reduce((sum, u) => sum + (u.maxUnits || 24), 0);
    const totalLoad = Object.values(facultyLoads).reduce((sum, load) => sum + load, 0);
    const facultyUtilizationAvg = totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0;

    // Individual faculty utilization
    const facultyUtilization = users.map(u => {
      const assigned = facultyLoads[u.id] || 0;
      const max = u.maxUnits || 24;
      return {
        id: u.id,
        name: u.name,
        image: u.image,
        assigned,
        max,
        percent: max > 0 ? Math.round((assigned / max) * 100) : 0,
      };
    }).sort((a, b) => b.percent - a.percent);

    // Room occupancy
    const roomSchedules: Record<string, number> = {};
    rooms.forEach(r => { roomSchedules[r.id] = 0; });
    schedules.forEach(s => {
      roomSchedules[s.roomId] = (roomSchedules[s.roomId] || 0) + 1;
    });

    const maxRoomSchedules = 6 * 13; // 6 days (Mon-Sat) * 13 time slots
    const avgRoomUsage = rooms.length > 0 ? Object.values(roomSchedules).reduce((sum, count) => sum + count, 0) / rooms.length : 0;
    const roomOccupancy = Math.round((avgRoomUsage / maxRoomSchedules) * 100) || 0;

    // Overloaded/underloaded faculty
    const overloadedFaculty = users.filter(u => (facultyLoads[u.id] || 0) > (u.maxUnits || 24)).length;
    const underloadedFaculty = users.filter(u => (facultyLoads[u.id] || 0) < 12).length;

    // Schedules by day
    const dayCounts: Record<string, number> = {
      Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0,
    };
    schedules.forEach(s => {
      dayCounts[s.day] = (dayCounts[s.day] || 0) + 1;
    });
    const schedulesByDay = Object.entries(dayCounts).map(([day, count]) => ({ day, count }));

    // Schedules by status
    const statusCounts: Record<string, number> = {};
    schedules.forEach(s => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });
    const schedulesByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    // Faculty by department
    const deptCounts: Record<string, number> = {};
    users.forEach(u => {
      const deptName = u.department?.name || 'Unassigned';
      deptCounts[deptName] = (deptCounts[deptName] || 0) + 1;
    });
    const facultyByDepartment = Object.entries(deptCounts).map(([department, count]) => ({ department, count }));

    // Room utilization details - fixed property name
    const roomUtilization = rooms.slice(0, 10).map(r => ({
      room: r.roomName,
      utilization: Math.round(((roomSchedules[r.id] || 0) / maxRoomSchedules) * 100),
    }));

    return NextResponse.json({
      totalFaculty,
      totalSchedules,
      totalConflicts,
      facultyUtilizationAvg,
      facultyUtilization,
      roomOccupancy,
      overloadedFaculty,
      underloadedFaculty,
      schedulesByDay,
      schedulesByStatus,
      facultyByDepartment,
      roomUtilization,
      totalRooms: rooms.length,
      totalSections: sections.length,
      totalSubjects: subjects.length,
      isFacultyView: userIsFaculty,
      currentFacultyId: filterFacultyId || null,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    // Return default stats structure for easier frontend handling
    return NextResponse.json({
      totalFaculty: 0,
      totalSchedules: 0,
      totalConflicts: 0,
      facultyUtilizationAvg: 0,
      facultyUtilization: [],
      roomOccupancy: 0,
      overloadedFaculty: 0,
      underloadedFaculty: 0,
      schedulesByDay: [],
      schedulesByStatus: [],
      facultyByDepartment: [],
      roomUtilization: [],
      totalRooms: 0,
      totalSections: 0,
      totalSubjects: 0,
      isFacultyView: false,
      currentFacultyId: null,
    });
  }
}
