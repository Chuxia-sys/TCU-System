'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/store';
import { StatsCard } from './StatsCard';
import { SchedulesChart } from './SchedulesChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users,
  Calendar,
  AlertTriangle,
  User,
  Building2,
  BookOpen,
  DoorOpen,
  Zap,
  Activity,
  TrendingUp,
  Clock,
  ArrowRight,
  BookOpenCheck,
  AlertCircle,
  Info,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { DashboardStats, User as UserType, Schedule, Conflict } from '@/types';
import { cn, safeJson } from '@/lib/utils';

type FacultyInfo = {
  id: string;
  name: string;
  email: string;
  department?: string | null;
};

type PreGenerationWarning = {
  type: string;
  message: string;
  severity: 'warning' | 'info';
  faculty?: FacultyInfo[];
};

export function DashboardView() {
  const { data: session } = useSession();
  const { triggerRefresh, initializeDepartmentFromSession } = useAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSchedules, setRecentSchedules] = useState<Schedule[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [preGenerationWarnings, setPreGenerationWarnings] = useState<PreGenerationWarning[]>([]);
  const [bgGenerating, setBgGenerating] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const prevScheduleCountRef = useRef<number>(0);

  const isFaculty = session?.user?.role === 'faculty';
  const isDeptHead = session?.user?.role === 'department_head';
  const isAdmin = session?.user?.role === 'admin';

  // Initialize department from session for dept_head isolation
  useEffect(() => {
    if (session?.user) {
      initializeDepartmentFromSession(session.user.role, session.user.departmentId);
    }
  }, [session?.user, initializeDepartmentFromSession]);

  // Build department query param for dept_head users
  const getDeptParam = useCallback(() => {
    return isDeptHead && session?.user?.departmentId 
      ? `?departmentId=${session.user.departmentId}` 
      : '';
  }, [isDeptHead, session?.user?.departmentId]);

  const pollForCompletion = useCallback(() => {
    if (Date.now() - pollStartRef.current > 120_000) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setBgGenerating(false);
      toast.info('Schedule generation is taking longer than expected. Check your notifications for updates.');
      return;
    }

    fetch(`/api/stats${getDeptParam()}`)
      .then(res => res.json())
      .then(statsData => {
        const currentCount = statsData?.totalSchedules ?? 0;
        if (currentCount > 0 && currentCount !== prevScheduleCountRef.current) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setBgGenerating(false);
          fetchDashboardData();
          triggerRefresh();
          toast.success(`Schedule generation complete! ${currentCount} schedules created.`);
        }
      })
      .catch(() => {});
  }, [getDeptParam, triggerRefresh]);

  useEffect(() => {
    fetchDashboardData();
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      const deptParam = getDeptParam();
      const [statsRes, schedulesRes, conflictsRes] = await Promise.all([
        fetch(`/api/stats${deptParam}`),
        fetch(`/api/schedules${deptParam}`),
        fetch('/api/conflicts'),
      ]);

      const statsData = await safeJson(statsRes);
      const schedulesData = await safeJson(schedulesRes);
      const conflictsData = await safeJson(conflictsRes);

      setStats(statsData);
      setRecentSchedules(Array.isArray(schedulesData) ? schedulesData.slice(0, 5) : []);
      setConflicts(Array.isArray(conflictsData?.conflicts) ? conflictsData.conflicts.slice(0, 5) : []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
      setStats(null);
      setRecentSchedules([]);
      setConflicts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSchedules = () => {
    setShowConfirmDialog(true);
  };

  const confirmGeneration = async () => {
    setShowConfirmDialog(false);
    try {
      const checkRes = await fetch('/api/preferences/check-conflicts');
      const checkData = await safeJson<{ conflicts?: Array<{ severity: string }> }>(checkRes);
      
      const warnings = checkData?.conflicts?.filter((c) => c.severity === 'warning') || [];
      
      if (warnings.length > 0) {
        setPreGenerationWarnings(warnings);
        setShowWarningDialog(true);
        return;
      }
      
      await executeGeneration();
    } catch {
      await executeGeneration();
    }
  };

  const executeGeneration = async () => {
    setShowWarningDialog(false);
    setGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clearExisting: true,
          detectedConflicts: preGenerationWarnings,
        }),
      });

      let data: {
        success?: boolean;
        generating?: boolean;
        generated?: number;
        savedConflicts?: number;
        preGenerationWarnings?: unknown[];
        message?: string;
        error?: string;
        details?: unknown;
        generationId?: string;
      } | null = null;

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        try {
          data = await res.json();
        } catch {}
      }
      
      if (data?.success && data?.generating) {
        setGenerating(false);
        setBgGenerating(true);
        toast.success(data.message || 'Schedule generation started. You\'ll be notified when it\'s complete.', { duration: 6000 });
        prevScheduleCountRef.current = stats?.totalSchedules ?? 0;
        pollStartRef.current = Date.now();
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
        }
        pollTimerRef.current = setInterval(pollForCompletion, 5000);
      } else if (data?.success) {
        if (data.savedConflicts && data.savedConflicts > 0) {
          toast.success(`Generated ${data.generated} schedules. ${data.savedConflicts} conflict(s) recorded for review.`, { duration: 6000 });
        } else if (data.preGenerationWarnings && data.preGenerationWarnings.length > 0) {
          toast.info(`Generated ${data.generated} schedules. ${data.preGenerationWarnings.length} preference conflicts were detected but did not block generation.`, { duration: 6000 });
        } else {
          toast.success(data.message || 'Schedules generated successfully');
        }
        fetchDashboardData();
        triggerRefresh();
      } else {
        const errorMsg = data?.error || 'Failed to generate schedules';
        toast.error(errorMsg, { duration: 6000 });
        if (data?.details) {
          console.error('Generation details:', data.details);
        }
        if (!res.ok) {
          console.error(`Generate API returned status ${res.status}:`, data);
        }
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate schedules. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="h-8 w-8 animate-spin text-red-500 dark:text-[#EF4444]" />
      </div>
    );
  }

  // ── Faculty Dashboard ──
  if (isFaculty) {
    return (
      <div className="space-y-8">
        {/* Premium Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-red-500 dark:text-[#EF4444]" />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight dark:text-[#F8FAFC]">
              My Dashboard
            </h1>
          </div>
          <p className="text-base sm:text-lg text-muted-foreground dark:text-[#94A3B8]">
            Welcome back, {session?.user?.name} 👋
          </p>
        </motion.div>

        {/* Faculty Stats Cards — 2x2 grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <StatsCard
            title="My Schedules"
            value={stats?.totalSchedules || 0}
            description="Assigned classes"
            icon={Calendar}
            variant="success"
          />
          <StatsCard
            title="Teaching Load"
            value={`${stats?.facultyUtilizationAvg || 0}%`}
            description="Of max capacity"
            icon={TrendingUp}
          />
          <StatsCard
            title="Subjects"
            value={new Set(recentSchedules.map(s => s.subjectId)).size}
            description="Different subjects"
            icon={BookOpen}
          />
          <StatsCard
            title="Days Active"
            value={new Set(recentSchedules.map(s => s.day)).size}
            description="Teaching days per week"
            icon={Calendar}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SchedulesChart
            data={stats?.schedulesByDay || []}
            title="My Schedule by Day"
            description="Distribution of your classes across the week"
            type="bar"
          />
          <SchedulesChart
            data={stats?.schedulesByStatus?.map(s => ({ name: s.status, value: s.count })) || []}
            title="Schedule Status"
            description="Current status of your schedules"
            type="pie"
          />
        </div>

        {/* My Upcoming Classes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card
            className="relative overflow-hidden border-0 shadow-lg dark:bg-[#1E293B] dark:shadow-black/35 dark:stat-card-glow"
            style={{ borderRadius: '20px' }}
          >
            <div className="absolute inset-0 rounded-[20px] border border-white/[0.05] dark:border-white/[0.05] pointer-events-none" />
            <div className="relative">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="flex items-center gap-2 dark:text-[#F8FAFC]">
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-500/10 dark:bg-[#EF4444]/10">
                    <Clock className="h-4 w-4 text-red-500 dark:text-[#EF4444]" />
                  </div>
                  My Class Schedule
                </CardTitle>
                <CardDescription className="dark:text-[#64748B]">Your upcoming classes for the week</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <ScrollArea className="h-80 premium-scrollbar">
                  {recentSchedules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="rounded-2xl bg-muted/50 dark:bg-[#334155]/30 p-5 mb-4">
                        <Calendar className="h-8 w-8 text-muted-foreground dark:text-[#64748B]" />
                      </div>
                      <p className="font-semibold dark:text-[#F8FAFC]">No schedules assigned</p>
                      <p className="text-sm text-muted-foreground dark:text-[#64748B]">
                        You have not been assigned any classes yet
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentSchedules.map((schedule, index) => (
                        <div key={schedule.id}>
                          {index > 0 && <Separator className="mb-3 dark:bg-[#334155]/50" />}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 dark:bg-[#EF4444]/10">
                                <BookOpenCheck className="h-5 w-5 text-red-500 dark:text-[#EF4444]" />
                              </div>
                              <div>
                                <p className="font-medium dark:text-[#F8FAFC]">{schedule.subject?.subjectName}</p>
                                <p className="text-sm text-muted-foreground dark:text-[#64748B]">
                                  {schedule.section?.sectionName} • {schedule.room?.roomName}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium dark:text-[#F8FAFC]">{schedule.day}</p>
                              <p className="text-xs text-muted-foreground dark:text-[#64748B]">
                                {schedule.startTime} - {schedule.endTime}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </div>
          </Card>
        </motion.div>

        {/* Teaching Load */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card
            className="relative overflow-hidden border-0 shadow-lg dark:bg-[#1E293B] dark:shadow-black/35 dark:stat-card-glow"
            style={{ borderRadius: '20px' }}
          >
            <div className="absolute inset-0 rounded-[20px] border border-white/[0.05] dark:border-white/[0.05] pointer-events-none" />
            <div className="relative">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="dark:text-[#F8FAFC]">My Teaching Load</CardTitle>
                <CardDescription className="dark:text-[#64748B]">Your current teaching load vs maximum capacity</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground dark:text-[#94A3B8]">My Utilization</span>
                    <span className="font-semibold dark:text-[#F8FAFC]">{stats?.facultyUtilizationAvg || 0}%</span>
                  </div>
                  <Progress value={stats?.facultyUtilizationAvg || 0} className="h-2.5 dark:bg-[#334155]" />
                  <div className="flex justify-between text-xs text-muted-foreground dark:text-[#64748B]">
                    <span>Current: {stats?.facultyUtilization?.[0]?.assigned || 0} units</span>
                    <span>Max: {stats?.facultyUtilization?.[0]?.max || 24} units</span>
                  </div>
                </div>
              </CardContent>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ── Admin/Dept Head Dashboard ──
  return (
    <div className="space-y-8">
      {/* Premium Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-red-500 dark:text-[#EF4444]" />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight dark:text-[#F8FAFC]">
              Dashboard
            </h1>
          </div>
          <p className="text-base sm:text-lg text-muted-foreground dark:text-[#94A3B8]">
            Welcome back, {session?.user?.name}
            {isDeptHead && session?.user?.departmentId && (
              <Badge variant="secondary" className="ml-2 dark:bg-[#334155] dark:text-[#CBD5E1]">
                {session.user.departmentId}
              </Badge>
            )}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={handleGenerateSchedules}
            disabled={generating || bgGenerating}
            size="lg"
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 dark:bg-[#EF4444] dark:hover:bg-[#DC2626] text-white shadow-lg shadow-red-500/20 dark:shadow-[#EF4444]/20 transition-all duration-200 hover:-translate-y-0.5 rounded-xl"
          >
            <Zap className={`mr-2 h-4 w-4 ${bgGenerating ? 'animate-pulse' : ''}`} />
            {generating ? 'Starting...' : bgGenerating ? 'Generating in background...' : 'Generate Schedules'}
          </Button>
        )}
      </motion.div>

      {/* Primary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatsCard
          title="Total Faculty"
          value={stats?.totalFaculty || 0}
          description="Active faculty members"
          icon={Users}
          trend={{ value: 12, label: 'vs last semester', positive: true }}
        />
        <StatsCard
          title="Total Schedules"
          value={stats?.totalSchedules || 0}
          description="Generated schedules"
          icon={Calendar}
          variant="success"
        />
        <StatsCard
          title="Active Conflicts"
          value={stats?.totalConflicts || 0}
          description={stats?.totalConflicts === 0 ? 'No conflicts detected' : 'Requires attention'}
          icon={AlertTriangle}
          variant={stats?.totalConflicts && stats.totalConflicts > 0 ? 'danger' : 'success'}
        />
        <StatsCard
          title="Faculty Utilization"
          value={`${stats?.facultyUtilizationAvg || 0}%`}
          description="Average load percentage"
          icon={TrendingUp}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatsCard
          title="Departments"
          value={stats?.facultyByDepartment?.length || 0}
          icon={Building2}
        />
        <StatsCard
          title="Subjects"
          value={stats?.totalSubjects || 0}
          icon={BookOpen}
        />
        <StatsCard
          title="Rooms"
          value={stats?.totalRooms || 0}
          icon={DoorOpen}
        />
        <StatsCard
          title="Sections"
          value={stats?.totalSections || 0}
          icon={Users}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SchedulesChart
          data={stats?.schedulesByDay || []}
          title="Schedules by Day"
          description="Distribution of classes across the week"
          type="bar"
        />
        <SchedulesChart
          data={stats?.schedulesByStatus?.map(s => ({ name: s.status, value: s.count })) || []}
          title="Schedules by Status"
          description="Current schedule status breakdown"
          type="pie"
        />
      </div>

      {/* Recent Activity & Conflicts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Schedules */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card
            className="relative overflow-hidden border-0 shadow-lg dark:bg-[#1E293B] dark:shadow-black/35 dark:stat-card-glow"
            style={{ borderRadius: '20px' }}
          >
            <div className="absolute inset-0 rounded-[20px] border border-white/[0.05] dark:border-white/[0.05] pointer-events-none" />
            <div className="relative">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="flex items-center gap-2 dark:text-[#F8FAFC]">
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-500/10 dark:bg-[#EF4444]/10">
                    <Clock className="h-4 w-4 text-red-500 dark:text-[#EF4444]" />
                  </div>
                  Recent Schedules
                </CardTitle>
                <CardDescription className="dark:text-[#64748B]">Latest schedule assignments</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <ScrollArea className="h-64 premium-scrollbar">
                  {recentSchedules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="rounded-2xl bg-muted/50 dark:bg-[#334155]/30 p-5 mb-4">
                        <Calendar className="h-8 w-8 text-muted-foreground dark:text-[#64748B]" />
                      </div>
                      <p className="font-semibold dark:text-[#F8FAFC]">No schedules generated yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentSchedules.map((schedule, index) => (
                        <div key={schedule.id}>
                          {index > 0 && <Separator className="mb-3 dark:bg-[#334155]/50" />}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium dark:text-[#F8FAFC]">{schedule.subject?.subjectName}</p>
                              <p className="text-sm text-muted-foreground dark:text-[#64748B]">
                                {schedule.faculty?.name} • {schedule.room?.roomName}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium dark:text-[#F8FAFC]">{schedule.day}</p>
                              <p className="text-xs text-muted-foreground dark:text-[#64748B]">
                                {schedule.startTime} - {schedule.endTime}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </div>
          </Card>
        </motion.div>

        {/* Conflicts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <Card
            className="relative overflow-hidden border-0 shadow-lg dark:bg-[#1E293B] dark:shadow-black/35 dark:stat-card-glow"
            style={{ borderRadius: '20px' }}
          >
            <div className="absolute inset-0 rounded-[20px] border border-white/[0.05] dark:border-white/[0.05] pointer-events-none" />
            <div className="relative">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="flex items-center gap-2 dark:text-[#F8FAFC]">
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-500/10 dark:bg-[#EF4444]/10">
                    <AlertTriangle className="h-4 w-4 text-red-500 dark:text-[#EF4444]" />
                  </div>
                  Active Conflicts
                </CardTitle>
                <CardDescription className="dark:text-[#64748B]">Scheduling conflicts that need resolution</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <ScrollArea className="h-64 premium-scrollbar">
                  {conflicts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/10 p-5 mb-4">
                        <Activity className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
                      </div>
                      <p className="font-semibold dark:text-[#F8FAFC]">No Conflicts</p>
                      <p className="text-sm text-muted-foreground dark:text-[#64748B]">
                        All schedules are conflict-free
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {conflicts.map((conflict, index) => (
                        <div key={conflict.id}>
                          {index > 0 && <Separator className="mb-3 dark:bg-[#334155]/50" />}
                          <div className="flex items-start gap-3">
                            <div className={`rounded-xl p-1.5 ${
                              conflict.severity === 'critical' 
                                ? 'bg-red-500/10 text-red-500 dark:bg-[#EF4444]/10 dark:text-[#EF4444]' 
                                : 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'
                            }`}>
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium capitalize dark:text-[#F8FAFC]">
                                {conflict.type.replace(/_/g, ' ')}
                              </p>
                              <p className="text-sm text-muted-foreground dark:text-[#64748B]">
                                {conflict.description}
                              </p>
                            </div>
                            <Badge variant={conflict.severity === 'critical' ? 'destructive' : 'secondary'} className="dark:bg-[#334155] dark:text-[#CBD5E1]">
                              {conflict.severity}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Faculty Utilization */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card
          className="relative overflow-hidden border-0 shadow-lg dark:bg-[#1E293B] dark:shadow-black/35 dark:stat-card-glow"
          style={{ borderRadius: '20px' }}
        >
          <div className="absolute inset-0 rounded-[20px] border border-white/[0.05] dark:border-white/[0.05] pointer-events-none" />
          <div className="relative">
            <CardHeader className="px-5 pt-5">
              <CardTitle className="dark:text-[#F8FAFC]">Faculty Load Distribution</CardTitle>
              <CardDescription className="dark:text-[#64748B]">Current teaching load vs maximum capacity</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground dark:text-[#94A3B8]">Overall Utilization</span>
                  <span className="font-semibold dark:text-[#F8FAFC]">{stats?.facultyUtilizationAvg || 0}%</span>
                </div>
                <Progress value={stats?.facultyUtilizationAvg || 0} className="h-2.5 dark:bg-[#334155]" />
                <div className="flex justify-between text-xs text-muted-foreground dark:text-[#64748B]">
                  <span>Underloaded: {stats?.underloadedFaculty || 0}</span>
                  <span>Optimal</span>
                  <span>Overloaded: {stats?.overloadedFaculty || 0}</span>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>
      </motion.div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="dark:bg-[#1E293B] dark:border-[#334155]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 dark:text-[#F8FAFC]">
              <Zap className="h-5 w-5 text-red-500 dark:text-[#EF4444]" />
              Generate Schedules
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2">
                <p className="dark:text-[#CBD5E1]">
                  This will generate a new schedule for all sections, faculty, and subjects in the system.
                </p>
                <div className="bg-muted/50 dark:bg-[#334155]/30 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-medium dark:text-[#F8FAFC]">What happens when you proceed:</p>
                  <ul className="text-sm text-muted-foreground dark:text-[#94A3B8] space-y-1.5">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <span>Existing schedules will be cleared</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <span>New schedules will be assigned based on faculty preferences</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <span>Conflicts will be detected and recorded</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <span>Faculty will be notified of their new assignments</span>
                    </li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground dark:text-[#94A3B8]">
                  The system will check for preference conflicts before generation.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-[#334155] dark:text-[#CBD5E1] dark:border-[#334155] dark:hover:bg-[#475569]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmGeneration}
              className="bg-red-600 hover:bg-red-700 dark:bg-[#EF4444] dark:hover:bg-[#DC2626] text-white"
            >
              <Zap className="h-4 w-4 mr-2" />
              Start Generation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pre-generation Warning Dialog */}
      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent className="max-w-lg dark:bg-[#1E293B] dark:border-[#334155]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 dark:text-[#F8FAFC]">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Schedule Generation Warnings
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2">
                <p className="dark:text-[#CBD5E1]">
                  The following potential conflicts were detected. The system can still generate schedules, 
                  but some faculty preferences may not be fully satisfied.
                </p>
                <ScrollArea className="max-h-[300px] rounded-xl border dark:border-[#334155] p-3">
                  <AnimatePresence>
                    {preGenerationWarnings.map((warning, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                          'p-3 rounded-xl mb-2 last:mb-0',
                          warning.severity === 'warning' 
                            ? 'bg-amber-500/10 border border-amber-500/20' 
                            : 'bg-blue-500/10 border border-blue-500/20'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {warning.severity === 'warning' ? (
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          ) : (
                            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-medium dark:text-[#F8FAFC]">{warning.type.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-muted-foreground dark:text-[#94A3B8]">{warning.message}</p>
                            {warning.faculty && warning.faculty.length > 0 && (
                              <p className="text-xs text-muted-foreground dark:text-[#64748B] mt-1">
                                Affected: {warning.faculty.map(f => typeof f === 'string' ? f : f.name).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </ScrollArea>
                <p className="text-sm text-muted-foreground dark:text-[#94A3B8]">
                  The scheduling algorithm will use load balancing and specialization matching 
                  to resolve these conflicts automatically.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-[#334155] dark:text-[#CBD5E1] dark:border-[#334155] dark:hover:bg-[#475569]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeGeneration}
              className="bg-red-600 hover:bg-red-700 dark:bg-[#EF4444] dark:hover:bg-[#DC2626] text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Proceed with Generation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
