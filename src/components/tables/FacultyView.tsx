'use client';

import { useState, useEffect } from 'react';
import { useFaculty, useDepartments, useSchedules, useCreateUser, useUpdateUser, useDeleteUser } from '@/hooks/queries';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/store';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Users,
  Mail,
  Phone,
  Building2,
  Lock,
  Calendar,
  Clock,
  MapPin,
  BookOpen,
  X,
  Layers,
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { User, Department, Schedule } from '@/types';

export function FacultyView() {
  const { data: session } = useSession();
  const { initializeDepartmentFromSession } = useAppStore();

  const isDeptHead = session?.user?.role === 'department_head';
  const deptHeadDepartmentId = isDeptHead ? session?.user?.departmentId : null;

  const { data: faculty = [], isLoading: facultyLoading } = useFaculty(deptHeadDepartmentId);
  const { data: departments = [], isLoading: deptsLoading } = useDepartments();
  const { data: schedules = [], isLoading: schedulesLoading } = useSchedules();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const loading = facultyLoading || deptsLoading || schedulesLoading;

  const [saving, setSaving] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState<User | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleViewOpen, setScheduleViewOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Initialize department from session for dept_head isolation
  useEffect(() => {
    if (session?.user) {
      initializeDepartmentFromSession(session.user.role, session.user.departmentId);
    }
  }, [session?.user, initializeDepartmentFromSession]);

  const getFacultyLoad = (facultyId: string) => {
    return schedules
      .filter((s) => s.facultyId === facultyId)
      .reduce((sum, s) => sum + (s.subject?.units || 0), 0);
  };

  const handleCreate = () => {
    setSelectedFaculty(null);
    // For dept_head, pre-select their department
    const preselectedDept = isDeptHead && deptHeadDepartmentId ? deptHeadDepartmentId : '';
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'faculty',
      contractType: 'full-time',
      maxUnits: 24,
      departmentId: preselectedDept,
      specialization: [],
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedFaculty(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      contractType: user.contractType,
      maxUnits: user.maxUnits,
      departmentId: user.departmentId || '',
      specialization: user.specialization,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleViewSchedule = (user: User) => {
    setSelectedFaculty(user);
    // Use setTimeout to let the DropdownMenu fully close before opening the
    // dialog, preventing focus-management conflicts between the two portals.
    setTimeout(() => {
      setScheduleViewOpen(true);
    }, 50);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.name || (formData.name as string).trim() === '') {
      errors.name = 'Name is required';
    }
    
    if (!formData.email || (formData.email as string).trim() === '') {
      errors.email = 'Email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email as string)) {
        errors.email = 'Please enter a valid email address';
      }
    }
    
    if (!selectedFaculty) {
      if (!formData.password || (formData.password as string).length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }
    }
    
    if (!formData.departmentId) {
      errors.departmentId = 'Department is required';
    }
    
    if (!formData.maxUnits || (formData.maxUnits as number) < 1) {
      errors.maxUnits = 'Max units must be at least 1';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSaving(true);
    try {
      if (selectedFaculty) {
        await updateUser.mutateAsync({ id: selectedFaculty.id, ...formData } as any);
        toast.success('Faculty updated successfully');
      } else {
        await createUser.mutateAsync(formData as any);
        toast.success('Faculty created successfully');
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (user: User) => {
    setSelectedFaculty(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedFaculty) return;

    try {
      await deleteUser.mutateAsync(selectedFaculty.id);
      toast.success('Faculty deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedFaculty(null);
    } catch {
      toast.error('Delete failed');
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <button
            onClick={() => handleViewSchedule(user)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.image || ''} />
              <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </button>
        );
      },
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => {
        const dept = row.original.department;
        return dept ? (
          <Badge variant="secondary">{dept.name}</Badge>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        );
      },
    },
    {
      accessorKey: 'contractType',
      header: 'Contract',
      cell: ({ row }) => (
        <Badge variant={row.original.contractType === 'full-time' ? 'default' : 'outline'}>
          {row.original.contractType}
        </Badge>
      ),
    },
    {
      id: 'load',
      header: 'Load',
      cell: ({ row }) => {
        const user = row.original;
        const load = getFacultyLoad(user.id);
        const maxUnits = user.maxUnits || 24;
        const percentage = Math.round((load / maxUnits) * 100);
        const isOverloaded = load > maxUnits;

        return (
          <div className="w-32 min-w-25">
            <div className="flex justify-between text-xs mb-1">
              <span>{load}/{maxUnits} units</span>
              <span className={isOverloaded ? 'text-red-500' : ''}>{percentage}%</span>
            </div>
            <Progress
              value={Math.min(percentage, 100)}
              className={`h-1.5 ${isOverloaded ? '[&>div]:bg-red-500' : ''}`}
            />
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleViewSchedule(user)}>
                <Eye className="mr-2 h-4 w-4" />
                View Schedule
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEdit(user)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(user)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Users className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Determine if department select should be locked (dept_head creating new faculty)
  const isDepartmentLocked = isDeptHead && !selectedFaculty;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Faculty Management</h1>
          <p className="text-muted-foreground">
            Manage faculty members and teaching loads
            {isDeptHead && ' (Your department only)'}
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Faculty
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">{faculty.length}</div>
            <p className="text-sm text-muted-foreground">Total Faculty</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">
              {faculty.filter((f) => f.contractType === 'full-time').length}
            </div>
            <p className="text-sm text-muted-foreground">Full-time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">
              {faculty.filter((f) => f.contractType === 'part-time').length}
            </div>
            <p className="text-sm text-muted-foreground">Part-time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">
              {faculty.filter((f) => getFacultyLoad(f.id) > f.maxUnits).length}
            </div>
            <p className="text-sm text-muted-foreground">Overloaded</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-3 sm:p-6">
          <DataTable
            columns={columns}
            data={faculty}
            searchKey="name"
            searchPlaceholder="Search faculty..."
            mobileCardRender={(user) => (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => handleViewSchedule(user)}
                    className="flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity cursor-pointer text-left"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={user.image || ''} />
                      <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewSchedule(user)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Schedule
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEdit(user)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(user)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{user.department?.name || 'Unassigned'}</Badge>
                  <Badge variant={user.contractType === 'full-time' ? 'default' : 'outline'}>
                    {user.contractType}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Load: {getFacultyLoad(user.id)}/{user.maxUnits || 24} units</span>
                    <span>{Math.round((getFacultyLoad(user.id) / (user.maxUnits || 24)) * 100)}%</span>
                  </div>
                  <Progress value={Math.min((getFacultyLoad(user.id) / (user.maxUnits || 24)) * 100, 100)} className="h-1.5" />
                </div>
              </div>
            )}
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedFaculty ? 'Edit Faculty' : 'Add New Faculty'}</DialogTitle>
            <DialogDescription>
              {selectedFaculty
                ? 'Update faculty information'
                : 'Fill in the details to add a new faculty member'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name as string || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter faculty name"
                className={`h-9 ${formErrors.name ? 'border-destructive' : ''}`}
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email as string || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email address"
                className={`h-9 ${formErrors.email ? 'border-destructive' : ''}`}
              />
              {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
            </div>
            {!selectedFaculty && (
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password as string || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter password (min 6 characters)"
                  className={`h-9 ${formErrors.password ? 'border-destructive' : ''}`}
                />
                {formErrors.password && <p className="text-xs text-destructive">{formErrors.password}</p>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department" className="flex items-center gap-1">
                  Department *
                  {isDepartmentLocked && (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                </Label>
                <Select
                  value={formData.departmentId as string || ''}
                  onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                  disabled={isDepartmentLocked}
                >
                  <SelectTrigger className={formErrors.departmentId ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* For dept_head creating new faculty, only show their department */}
                    {(isDepartmentLocked
                      ? departments.filter((d) => d.id === deptHeadDepartmentId)
                      : departments
                    ).map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isDepartmentLocked && (
                  <p className="text-xs text-muted-foreground">
                    Locked to your department
                  </p>
                )}
                {formErrors.departmentId && <p className="text-xs text-destructive">{formErrors.departmentId}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractType">Contract</Label>
                <Select
                  value={formData.contractType as string || 'full-time'}
                  onValueChange={(value) => setFormData({ ...formData, contractType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="part-time">Part-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxUnits">Max Units *</Label>
              <Input
                id="maxUnits"
                type="number"
                value={formData.maxUnits as number || 24}
                onChange={(e) => setFormData({ ...formData, maxUnits: parseInt(e.target.value) || 24 })}
                className={`h-9 ${formErrors.maxUnits ? 'border-destructive' : ''}`}
              />
              {formErrors.maxUnits && <p className="text-xs text-destructive">{formErrors.maxUnits}</p>}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Saving...' : selectedFaculty ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Faculty</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedFaculty?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} className="w-full sm:w-auto">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule View Dialog — Calendar Styling */}
      <Dialog open={scheduleViewOpen} onOpenChange={setScheduleViewOpen}>
        <DialogContent
          className="p-0! gap-0! overflow-visible! rounded-lg! sm:rounded-2xl! border-0! shadow-lg! dark:shadow-lg! w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] flex flex-col"
          showCloseButton={false}
        >
          {selectedFaculty && (
            <>
              {/* ── Header — RED (Calendar style) ──────────────────────── */}
              <div className="relative px-3 sm:px-5 pt-3 sm:pt-5 pb-3 sm:pb-4 shrink-0 bg-[#C0392B] dark:bg-[#9B2218] transition-colors duration-300">
                {/* Close button — frosted white pill matching header style */}
                <button
                  onClick={() => setScheduleViewOpen(false)}
                  className="absolute top-2.5 sm:top-3.5 right-2.5 sm:right-3.5 flex items-center justify-center h-7 sm:h-8 w-7 sm:w-8 rounded-lg sm:rounded-lg bg-white/15 backdrop-blur-md border border-white/20 text-white hover:text-white hover:bg-white/25 transition-all duration-200"
                >
                  <X className="h-4 sm:h-4 w-4 sm:w-4" />
                </button>

                {/* Icon + Title */}
                <div className="flex items-start gap-2 sm:gap-3.5 pr-8">
                  <div className="w-9 sm:w-11 h-9 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 bg-white/20 backdrop-blur-sm border border-white/15">
                    <Calendar className="h-4 sm:h-5 w-4 sm:w-5 text-white" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <DialogTitle className="text-sm sm:text-lg font-bold text-white leading-tight truncate">
                      {selectedFaculty.name}
                    </DialogTitle>
                    <DialogDescription className="text-white/60 mt-0.5 sm:mt-1 text-xs">
                      Faculty Schedule
                    </DialogDescription>
                  </div>
                </div>
              </div>

              {/* ── Body ──────────────────────────────────────────────────── */}
              <div className="px-3 sm:px-5 py-3 sm:py-4 overflow-y-auto flex-1 bg-white dark:bg-[#393E46] transition-colors duration-300">
                {schedulesLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="relative">
                      <Loader2 className="h-10 w-10 animate-spin text-red-500/60 dark:text-[#EF4444]/60" />
                      <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-red-500/5 dark:bg-[#EF4444]/5" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-4 font-medium">Loading schedule...</p>
                  </div>
                ) : (() => {
                  const facultySchedules = schedules
                    .filter((s) => s.facultyId === selectedFaculty.id)
                    .sort((a, b) => {
                      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                      const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
                      if (dayDiff !== 0) return dayDiff;
                      return a.startTime.localeCompare(b.startTime);
                    });

                  if (facultySchedules.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
                          <Calendar className="h-8 w-8 text-red-400 dark:text-red-400/60" />
                        </div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">No schedule assignments</p>
                        <p className="text-xs text-muted-foreground mt-1 text-center max-w-50">
                          This faculty member has no class schedules assigned yet.
                        </p>
                      </div>
                    );
                  }

                  // Group schedules by day
                  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const groupedByDay: Record<string, typeof facultySchedules> = {};
                  facultySchedules.forEach(s => {
                    if (!groupedByDay[s.day]) groupedByDay[s.day] = [];
                    groupedByDay[s.day].push(s);
                  });

                  const totalUnits = facultySchedules.reduce((sum, s) => sum + (s.subject?.units || 0), 0);
                  const maxUnits = selectedFaculty.maxUnits || 24;
                  const loadPercent = Math.round((totalUnits / maxUnits) * 100);
                  const isOverloaded = totalUnits > maxUnits;

                  const getStatusColor = (status?: string) => {
                    switch (status) {
                      case 'approved': return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20';
                      case 'generated': return 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20';
                      case 'conflict': return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20';
                      case 'modified': return 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400 border-purple-200/50 dark:border-purple-500/20';
                      default: return 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400 border-gray-200 dark:border-white/10';
                    }
                  };

                  return (
                    <div className="space-y-5">
                      {/* ── Day-grouped schedule list ── */}
                      {dayOrder.filter(d => groupedByDay[d]).map(day => (
                        <div key={day}>
                          <div className="flex items-center gap-2.5 mb-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-[#EF4444]" />
                              <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{day}</h3>
                            </div>
                            <div className="h-px flex-1 bg-linear-to-r from-gray-200/60 to-transparent dark:from-white/10" />
                            <span className="text-[10px] font-medium text-muted-foreground/70">{groupedByDay[day].length} class{groupedByDay[day].length > 1 ? 'es' : ''}</span>
                          </div>
                          <div className="space-y-2">
                            {groupedByDay[day].map((schedule, idx) => (
                              <motion.div
                                key={schedule.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.03, type: 'spring', stiffness: 300, damping: 30 }}
                                className="group relative flex items-stretch gap-0 bg-white dark:bg-[#3a3f4a] rounded-xl border border-gray-100 dark:border-white/6 hover:shadow-md hover:border-gray-200 dark:hover:border-white/12 transition-all duration-200"
                              >
                                {/* Time indicator bar */}
                                <div className="w-1.5 shrink-0 rounded-l-xl bg-linear-to-b from-red-500 to-red-600 dark:from-[#EF4444] dark:to-[#DC2626]" />

                                <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2.5 p-3 sm:p-3.5 min-w-0">
                                  {/* Time block */}
                                  <div className="flex sm:flex-col items-baseline sm:items-start gap-1.5 sm:gap-0 sm:min-w-20 shrink-0">
                                    <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{schedule.startTime}</span>
                                    <span className="text-[10px] text-muted-foreground/60 sm:text-[9px]">–</span>
                                    <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{schedule.endTime}</span>
                                  </div>

                                  {/* Divider */}
                                  <div className="hidden sm:block w-px h-8 bg-gray-100 dark:bg-white/6" />

                                  {/* Subject info */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider truncate">
                                      {schedule.subject?.subjectCode || 'N/A'}
                                    </p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                      {schedule.subject?.subjectName || schedule.subject?.name || 'No subject found'}
                                    </p>
                                  </div>

                                  {/* Meta info row */}
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground shrink-0">
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {schedule.room?.roomName || 'TBD'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {schedule.section?.sectionName || 'N/A'}
                                    </span>
                                    <span className={cn(
                                      'inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border',
                                      getStatusColor(schedule.status)
                                    )}>
                                      {schedule.status || 'scheduled'}
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* ── Summary Stats ── */}
                      <div className="pt-4 border-t border-gray-200/40 dark:border-white/6">
                        <div className="grid grid-cols-3 gap-2.5">
                          {/* Classes count */}
                          <div className="rounded-xl p-3 sm:p-3.5 bg-gray-50/80 dark:bg-white/3 border border-gray-100/50 dark:border-white/6">
                            <div className="flex items-center gap-2 mb-1.5">
                              <BookOpen className="h-3.5 w-3.5 text-red-500/70 dark:text-red-400/70" />
                              <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Classes</span>
                            </div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{facultySchedules.length}</p>
                          </div>

                          {/* Units */}
                          <div className="rounded-xl p-3 sm:p-3.5 bg-gray-50/80 dark:bg-white/3 border border-gray-100/50 dark:border-white/6">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Layers className="h-3.5 w-3.5 text-red-500/70 dark:text-red-400/70" />
                              <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Units</span>
                            </div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                              {totalUnits}<span className="text-sm font-medium text-muted-foreground">/{maxUnits}</span>
                            </p>
                          </div>

                          {/* Load percentage with progress */}
                          <div className="rounded-xl p-3 sm:p-3.5 bg-gray-50/80 dark:bg-white/3 border border-gray-100/50 dark:border-white/6">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Eye className="h-3.5 w-3.5 text-red-500/70 dark:text-red-400/70" />
                              <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider">Load</span>
                            </div>
                            <p className={cn(
                              'text-lg font-bold',
                              isOverloaded ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                            )}>
                              {loadPercent}%
                            </p>
                            <div className="mt-1.5 h-1 rounded-full bg-gray-200 dark:bg-white/8 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  isOverloaded ? 'bg-red-500' : loadPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                                )}
                                style={{ width: `${Math.min(loadPercent, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Footer ────────────────────────────────────────────────── */}
              <div className="px-3 sm:px-5 py-2.5 sm:py-3.5 flex items-center justify-end gap-2 sm:gap-2.5 shrink-0 border-t border-gray-100 dark:border-white/8 bg-white dark:bg-[#393E46] transition-colors duration-300">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs sm:text-sm text-gray-500 dark:text-[#9CA3AF] hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/6 rounded-lg px-3 sm:px-4 h-8 sm:h-9"
                  onClick={() => setScheduleViewOpen(false)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
