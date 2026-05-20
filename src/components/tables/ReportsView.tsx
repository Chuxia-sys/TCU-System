'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  FileText,
  Download,
  Printer,
  Users,
  Calendar,
  Building2,
  BookOpen,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Lock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { safeJson } from '@/lib/utils';

interface ReportStats {
  facultyByDepartment: Array<{ department: string; count: number }>;
  schedulesByDay: Array<{ day: string; count: number }>;
  schedulesByStatus: Array<{ status: string; count: number }>;
  roomUtilization: Array<{ room: string; utilization: number }>;
  facultyUtilization: Array<{ name: string; assigned: number; max: number; percent: number }>;
  totalFaculty: number;
  totalSchedules: number;
  totalConflicts: number;
  facultyUtilizationAvg: number;
  roomOccupancy: number;
  overloadedFaculty: number;
  underloadedFaculty: number;
}

// TCU institutional palette for charts
const TCU_COLORS = [
  '#8B0000', // crimson
  '#C00018', // TCU red
  '#6D0000', // dark crimson
  '#A5001F', // deep red
  '#D4AF37', // gold
];

const TCU_GRADIENT = {
  start: '#8B0000', // crimson
  mid: '#C00018', // TCU red
  end: '#6D0000', // dark crimson
};

export function ReportsView() {
  const { data: session } = useSession();
  const { initializeDepartmentFromSession } = useAppStore();
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [reportType, setReportType] = useState<'overview' | 'faculty' | 'schedules' | 'rooms'>('overview');
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  const isDeptHead = session?.user?.role === 'department_head';
  const deptHeadDepartmentId = isDeptHead ? session?.user?.departmentId : null;

  // Initialize department from session for dept_head isolation
  useEffect(() => {
    if (session?.user) {
      initializeDepartmentFromSession(session.user.role, session.user.departmentId);
    }
  }, [session?.user, initializeDepartmentFromSession]);

  // For dept_head, force selectedDepartment to their department
  useEffect(() => {
    if (isDeptHead && deptHeadDepartmentId) {
      setSelectedDepartment(deptHeadDepartmentId);
    }
  }, [isDeptHead, deptHeadDepartmentId]);

  // Fetch departments for the filter dropdown
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await fetch('/api/departments');
        const data = await safeJson<Array<{ id: string; name: string }>>(res);
        if (Array.isArray(data)) {
          setDepartments(data);
        }
      } catch {
        // Silently fail - department filter is optional
      }
    };
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchStats();
  }, [selectedDepartment]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/stats${selectedDepartment !== 'all' ? `?departmentId=${selectedDepartment}` : ''}`);
      const data = await safeJson<ReportStats>(res);
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: 'csv' | 'pdf') => {
    if (!stats) return;

    if (format === 'csv') {
      // Export as CSV
      const headers = ['Metric', 'Value'];
      const rows = [
        ['Total Faculty', stats.totalFaculty],
        ['Total Schedules', stats.totalSchedules],
        ['Total Conflicts', stats.totalConflicts],
        ['Average Utilization (%)', stats.facultyUtilizationAvg],
        ['Room Occupancy (%)', stats.roomOccupancy],
        ['Overloaded Faculty', stats.overloadedFaculty],
        ['Underloaded Faculty', stats.underloadedFaculty],
        ['', ''],
        ['Faculty by Department', ''],
        ...stats.facultyByDepartment.map(d => [d.department, d.count]),
        ['', ''],
        ['Schedules by Day', ''],
        ...stats.schedulesByDay.map(d => [d.day, d.count]),
        ['', ''],
        ['Schedules by Status', ''],
        ...stats.schedulesByStatus.map(s => [s.status, s.count]),
        ['', ''],
        ['Faculty Utilization', ''],
        ...stats.facultyUtilization.map(f => [f.name, `${f.assigned}/${f.max} units (${f.percent}%)`]),
      ];

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `tcu-report-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Report exported as CSV');
    } else {
      // Print as PDF
      const printContent = document.getElementById('reports-print-content');
      if (!printContent) return;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups to print the report');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>TCU Reports & Analytics</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { text-align: center; margin-bottom: 10px; }
              .date { text-align: center; color: #666; margin-bottom: 20px; }
              .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
              .metric-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; text-align: center; }
              .metric-value { font-size: 24px; font-weight: bold; }
              .metric-label { color: #666; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f4f4f4; }
              .chart-placeholder { background: #f9f9f9; padding: 20px; text-align: center; margin-bottom: 20px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>TCU Reports & Analytics</h1>
            <p class="date">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
            <div class="metrics-grid">
              <div class="metric-card">
                <div class="metric-value">${stats.totalFaculty}</div>
                <div class="metric-label">Total Faculty</div>
              </div>
              <div class="metric-card">
                <div class="metric-value">${stats.totalSchedules}</div>
                <div class="metric-label">Total Schedules</div>
              </div>
              <div class="metric-card">
                <div class="metric-value">${stats.totalConflicts}</div>
                <div class="metric-label">Conflicts</div>
              </div>
              <div class="metric-card">
                <div class="metric-value">${stats.facultyUtilizationAvg}%</div>
                <div class="metric-label">Avg Utilization</div>
              </div>
            </div>
            <h2>Schedules by Day</h2>
            <table>
              <tr><th>Day</th><th>Count</th></tr>
              ${stats.schedulesByDay.map(d => `<tr><td>${d.day}</td><td>${d.count}</td></tr>`).join('')}
            </table>
            <h2>Schedules by Status</h2>
            <table>
              <tr><th>Status</th><th>Count</th></tr>
              ${stats.schedulesByStatus.map(s => `<tr><td>${s.status}</td><td>${s.count}</td></tr>`).join('')}
            </table>
            <h2>Faculty by Department</h2>
            <table>
              <tr><th>Department</th><th>Faculty Count</th></tr>
              ${stats.facultyByDepartment.map(d => `<tr><td>${d.department}</td><td>${d.count}</td></tr>`).join('')}
            </table>
            <h2>Faculty Load Analysis</h2>
            <table>
              <tr><th>Faculty</th><th>Assigned</th><th>Max</th><th>Utilization</th></tr>
              ${stats.facultyUtilization.map(f => `<tr><td>${f.name}</td><td>${f.assigned}</td><td>${f.max}</td><td>${f.percent}%</td></tr>`).join('')}
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      toast.success('Report sent to printer');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Find the dept_head's department name for display
  const deptHeadDeptName = isDeptHead && deptHeadDepartmentId
    ? departments.find(d => d.id === deptHeadDepartmentId)?.name || 'Your Department'
    : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive insights into scheduling and faculty utilization
            {isDeptHead && deptHeadDeptName && ` (${deptHeadDeptName} only)`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
            <Printer className="mr-2 h-4 w-4" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Report Type:</span>
              <Select value={reportType} onValueChange={(v) => setReportType(v as typeof reportType)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Overview</SelectItem>
                  <SelectItem value="faculty">Faculty Analysis</SelectItem>
                  <SelectItem value="schedules">Schedule Analysis</SelectItem>
                  <SelectItem value="rooms">Room Utilization</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium flex items-center gap-1">
                Department:
                {isDeptHead && <Lock className="h-3 w-3 text-muted-foreground" />}
              </span>
              <Select
                value={selectedDepartment}
                onValueChange={(v) => setSelectedDepartment(v)}
                disabled={isDeptHead}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  {/* For dept_head, only show their department (already selected & locked) */}
                  {!isDeptHead && (
                    <SelectItem value="all">All Departments</SelectItem>
                  )}
                  {(isDeptHead
                    ? departments.filter(d => d.id === deptHeadDepartmentId)
                    : departments
                  ).map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isDeptHead && (
                <span className="text-xs text-muted-foreground">
                  Locked to your department
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Faculty</p>
                <p className="text-xl sm:text-3xl font-bold">{stats?.totalFaculty || 0}</p>
              </div>
              <div className="p-2 sm:p-3 rounded-full bg-primary/10 dark:bg-primary/20">
                <Users className="h-4 w-4 sm:h-6 sm:w-6 text-primary dark:text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Schedules</p>
                <p className="text-xl sm:text-3xl font-bold">{stats?.totalSchedules || 0}</p>
              </div>
              <div className="p-2 sm:p-3 rounded-full bg-primary/10 dark:bg-primary/20">
                <Calendar className="h-4 w-4 sm:h-6 sm:w-6 text-primary dark:text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Conflicts</p>
                <p className="text-xl sm:text-3xl font-bold text-red-500">{stats?.totalConflicts || 0}</p>
              </div>
              <div className="p-2 sm:p-3 rounded-full bg-red-500/10">
                <AlertTriangle className="h-4 w-4 sm:h-6 sm:w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Avg. Utilization</p>
                <p className="text-xl sm:text-3xl font-bold text-primary dark:text-primary">{stats?.facultyUtilizationAvg || 0}%</p>
              </div>
              <div className="p-2 sm:p-3 rounded-full bg-primary/10 dark:bg-primary/20">
                <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-primary dark:text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedules by Day */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-primary/5 dark:from-card dark:via-card dark:to-transparent pointer-events-none rounded-lg" />
          <div className="relative">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20">
                  <BarChart3 className="h-4 w-4 text-primary dark:text-primary" />
                </div>
                Schedules Distribution by Day
              </CardTitle>
              <CardDescription>Number of classes scheduled each day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.schedulesByDay || []}>
                    <defs>
                      <linearGradient id="reportsPrimaryBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B0000" stopOpacity={1} />
                        <stop offset="50%" stopColor="#C00018" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#6D0000" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      cursor={{ fill: 'rgba(139, 0, 0, 0.1)' }}
                    />
                    <Bar dataKey="count" fill="url(#reportsPrimaryBar)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Schedule Status */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-primary/5 dark:from-card dark:via-card dark:to-transparent pointer-events-none rounded-lg" />
          <div className="relative">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20">
                  <PieChartIcon className="h-4 w-4 text-primary dark:text-primary" />
                </div>
                Schedule Status Breakdown
              </CardTitle>
              <CardDescription>Distribution of schedule statuses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {TCU_COLORS.map((color, index) => (
                        <linearGradient key={`statusGradient-${index}`} id={`statusGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={stats?.schedulesByStatus?.map(s => ({ name: s.status, value: s.count })) || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {stats?.schedulesByStatus?.map((_, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={`url(#statusGradient-${index % TCU_COLORS.length})`}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Faculty by Department */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-primary/5 dark:from-card dark:via-card dark:to-transparent pointer-events-none rounded-lg" />
          <div className="relative">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20">
                  <Building2 className="h-4 w-4 text-primary dark:text-primary" />
                </div>
                Faculty by Department
              </CardTitle>
              <CardDescription>Distribution of faculty across departments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.facultyByDepartment || []} layout="vertical">
                    <defs>
                      <linearGradient id="facultyPrimaryBar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6D0000" stopOpacity={0.5} />
                        <stop offset="50%" stopColor="#C00018" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#8B0000" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="department" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={100} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      cursor={{ fill: 'rgba(139, 0, 0, 0.1)' }}
                    />
                    <Bar dataKey="count" fill="url(#facultyPrimaryBar)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Room Utilization */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-primary/5 dark:from-card dark:via-card dark:to-transparent pointer-events-none rounded-lg" />
          <div className="relative">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20">
                  <BookOpen className="h-4 w-4 text-primary dark:text-primary" />
                </div>
                Room Utilization
              </CardTitle>
              <CardDescription>Utilization rate of top rooms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats?.roomUtilization || []}>
                    <defs>
                      <linearGradient id="roomLineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B0000" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8B0000" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="room" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="utilization"
                      stroke="#8B0000"
                      strokeWidth={3}
                      dot={{ fill: '#8B0000', strokeWidth: 2, r: 4 }}
                      activeDot={{ fill: '#C00018', strokeWidth: 2, r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Faculty Utilization Table */}
      <Card>
        <CardHeader>
          <CardTitle>Faculty Load Analysis</CardTitle>
          <CardDescription>Teaching load distribution across faculty</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4 pr-4">
              {stats?.facultyUtilization?.map((faculty, index) => {
                const isOverloaded = faculty.percent > 100;
                const isUnderloaded = faculty.percent < 50;
                return (
                  <div key={index} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 dark:bg-primary/5">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{faculty.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {faculty.assigned}/{faculty.max} units
                          </span>
                          <Badge
                            className={isOverloaded 
                              ? 'bg-red-500 hover:bg-red-600' 
                              : isUnderloaded 
                                ? 'bg-amber-500 hover:bg-amber-600'
                                : 'bg-primary hover:bg-primary/90'
                            }
                          >
                            {faculty.percent}%
                          </Badge>
                        </div>
                      </div>
                      <Progress
                        value={Math.min(faculty.percent, 100)}
                        className={`h-2 ${isOverloaded ? '[&>div]:bg-primary' : isUnderloaded ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary'}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-primary dark:text-primary">{stats?.facultyUtilizationAvg || 0}%</p>
                <p className="text-sm text-muted-foreground">Average Utilization</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.underloadedFaculty || 0}</p>
                <p className="text-sm text-muted-foreground">Underloaded Faculty</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.overloadedFaculty || 0}</p>
                <p className="text-sm text-muted-foreground">Overloaded Faculty</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
