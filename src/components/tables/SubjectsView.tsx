'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/store';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { Plus, MoreHorizontal, Pencil, Trash2, BookOpen, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Subject, Department } from '@/types';
import { safeJson } from '@/lib/utils';

export function SubjectsView() {
  const { data: session } = useSession();
  const { initializeDepartmentFromSession } = useAppStore();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isDeptHead = session?.user?.role === 'department_head';
  const deptHeadDepartmentId = isDeptHead ? session?.user?.departmentId : null;

  // Initialize department from session for dept_head isolation
  useEffect(() => {
    if (session?.user) {
      initializeDepartmentFromSession(session.user.role, session.user.departmentId);
    }
  }, [session?.user, initializeDepartmentFromSession]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // For dept_head, pass departmentId query param to filter to their department
      const subjectsUrl = isDeptHead && deptHeadDepartmentId
        ? `/api/subjects?departmentId=${deptHeadDepartmentId}`
        : '/api/subjects';

      const [subjectsRes, deptsRes] = await Promise.all([
        fetch(subjectsUrl),
        fetch('/api/departments'),
      ]);

      const subjectsData = await safeJson(subjectsRes);
      const deptsData = await safeJson(deptsRes);

      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
      setDepartments(Array.isArray(deptsData) ? deptsData : []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast.error('Failed to load subjects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedSubject(null);
    // For dept_head, pre-select their department
    const preselectedDept = isDeptHead && deptHeadDepartmentId ? deptHeadDepartmentId : '';
    setFormData({
      subjectCode: '',
      subjectName: '',
      description: '',
      units: 3,
      departmentId: preselectedDept,
      requiredSpecialization: [],
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleEdit = (subject: Subject) => {
    setSelectedSubject(subject);
    setFormData({
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      description: subject.description || '',
      units: subject.units,
      departmentId: subject.departmentId,
      requiredSpecialization: subject.requiredSpecialization,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleDelete = (subject: Subject) => {
    setSelectedSubject(subject);
    setDeleteDialogOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.subjectCode || (formData.subjectCode as string).trim() === '') {
      errors.subjectCode = 'Subject code is required';
    }

    if (!formData.subjectName || (formData.subjectName as string).trim() === '') {
      errors.subjectName = 'Subject name is required';
    }

    if (!formData.units || (formData.units as number) < 1) {
      errors.units = 'Units must be at least 1';
    }

    if (!formData.departmentId) {
      errors.departmentId = 'Department is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const url = selectedSubject ? `/api/subjects/${selectedSubject.id}` : '/api/subjects';
      const method = selectedSubject ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await safeJson<{ error?: string }>(res);
      if (data) {
        toast.success(selectedSubject ? 'Subject updated' : 'Subject created');
        setDialogOpen(false);
        fetchData();
      } else {
        toast.error('Operation failed');
      }
    } catch {
      toast.error('Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedSubject) return;

    try {
      const res = await fetch(`/api/subjects/${selectedSubject.id}`, { method: 'DELETE' });
      const data = await safeJson<{ error?: string }>(res);
      if (data) {
        toast.success('Subject deleted');
        setDeleteDialogOpen(false);
        fetchData();
      } else {
        toast.error('Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    }
  };

  // Determine if department select should be locked (dept_head creating new subject)
  const isDepartmentLocked = isDeptHead && !selectedSubject;

  const columns: ColumnDef<Subject>[] = [
    {
      accessorKey: 'subjectCode',
      header: 'Code',
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono text-xs">
          {row.original.subjectCode}
        </Badge>
      ),
    },
    {
      accessorKey: 'subjectName',
      header: 'Subject Name',
    },
    {
      accessorKey: 'units',
      header: 'Units',
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-xs">{row.original.units} units</Badge>
      ),
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => {
        const dept = row.original.department;
        return dept ? (
          <Badge variant="outline" className="text-xs">{dept.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const subject = row.original;
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
              <DropdownMenuItem onClick={() => handleEdit(subject)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(subject)}>
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
        <BookOpen className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Subjects</h1>
          <p className="text-muted-foreground">
            Manage course subjects and offerings
            {isDeptHead && ' (Your department only)'}
          </p>
        </div>
        <Button onClick={handleCreate} className="h-9">
          <Plus className="mr-2 h-4 w-4" />
          Add Subject
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <DataTable
            columns={columns}
            data={subjects}
            searchKey="subjectName"
            searchPlaceholder="Search subjects..."
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSubject ? 'Edit Subject' : 'Add New Subject'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Code *</Label>
              <div className="space-y-1">
                <Input
                  value={formData.subjectCode as string || ''}
                  onChange={(e) => setFormData({ ...formData, subjectCode: e.target.value })}
                  className={`h-9 text-sm${formErrors.subjectCode ? ' border-destructive' : ''}`}
                />
                {formErrors.subjectCode && <p className="text-xs text-destructive">{formErrors.subjectCode}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Name *</Label>
              <div className="space-y-1">
                <Input
                  value={formData.subjectName as string || ''}
                  onChange={(e) => setFormData({ ...formData, subjectName: e.target.value })}
                  className={`h-9 text-sm${formErrors.subjectName ? ' border-destructive' : ''}`}
                />
                {formErrors.subjectName && <p className="text-xs text-destructive">{formErrors.subjectName}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Units *</Label>
              <div className="space-y-1">
                <Input
                  type="number"
                  value={formData.units as number || 3}
                  onChange={(e) => setFormData({ ...formData, units: parseInt(e.target.value) })}
                  className={`h-9 text-sm${formErrors.units ? ' border-destructive' : ''}`}
                />
                {formErrors.units && <p className="text-xs text-destructive">{formErrors.units}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1">
                Department *
                {isDepartmentLocked && (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
              </Label>
              <div className="space-y-1">
                <Select
                  value={formData.departmentId as string || ''}
                  onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                  disabled={isDepartmentLocked}
                >
                  <SelectTrigger className={formErrors.departmentId ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* For dept_head creating new subject, only show their department */}
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
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto h-9">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto h-9">{saving ? 'Saving...' : selectedSubject ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subject</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedSubject?.subjectName}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
