'use client';

import { useState } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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
import { toast } from 'sonner';
import { Plus, MoreHorizontal, Pencil, Trash2, Building2, Users, BookOpen, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Department } from '@/types';
import { safeJson } from '@/lib/utils';

export function DepartmentsView() {
  const { data: departments = [], isLoading: loading, mutate: refetchDepartments } = useCachedQuery<Department[]>(
    'departments:all',
    async (signal) => {
      const res = await fetch('/api/departments', { signal });
      const data = await safeJson<Department[]>(res);
      return data || [];
    }
  );

  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleCreate = () => {
    setSelectedDept(null);
    setFormData({
      name: '',
      code: '',
      college: '',
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleEdit = (dept: Department) => {
    setSelectedDept(dept);
    setFormData({
      name: dept.name,
      code: dept.code || '',
      college: dept.college,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleDelete = (dept: Department) => {
    setSelectedDept(dept);
    setDeleteDialogOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name || (formData.name as string).trim() === '') {
      errors.name = 'Department name is required';
    }

    if (!formData.college || (formData.college as string).trim() === '') {
      errors.college = 'College is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const url = selectedDept ? `/api/departments/${selectedDept.id}` : '/api/departments';
      const method = selectedDept ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await safeJson<{ error?: string; id?: string } & Record<string, unknown>>(res);
      if (data && !('error' in data)) {
        toast.success(selectedDept ? 'Department updated' : 'Department created');
        setDialogOpen(false);
        refetchDepartments();
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
    if (!selectedDept) return;

    try {
      const res = await fetch(`/api/departments/${selectedDept.id}`, { method: 'DELETE' });
      const data = await safeJson<{ error?: string }>(res);
      if (data && !data.error) {
        toast.success('Department deleted');
        setDeleteDialogOpen(false);
        setSelectedDept(null);
        refetchDepartments();
      } else {
        toast.error(data?.error || 'Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    }
  };

  const columns: ColumnDef<Department>[] = [
    {
      accessorKey: 'name',
      header: 'Department',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium">{row.original.name}</p>
            {row.original.code && (
              <p className="text-xs text-muted-foreground">{row.original.code}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'college',
      header: 'College',
    },
    {
      accessorKey: '_count',
      header: 'Stats',
      cell: ({ row }) => {
        const count = row.original._count;
        return (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>{count?.users || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              <span>{count?.subjects || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5" />
              <span>{count?.sections || 0}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const dept = row.original;
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
              <DropdownMenuItem onClick={() => handleEdit(dept)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(dept)}>
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
        <Building2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground">Manage academic departments</p>
        </div>
        <Button onClick={handleCreate} className="h-9">
          <Plus className="mr-2 h-4 w-4" />
          Add Department
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <DataTable
            columns={columns}
            data={departments}
            searchKey="name"
            searchPlaceholder="Search departments..."
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedDept ? 'Edit Department' : 'Add New Department'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Name *</Label>
              <div className="space-y-1">
                <Input
                  value={formData.name as string || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={formErrors.name ? 'border-destructive h-9 text-sm' : 'h-9 text-sm'}
                />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Code</Label>
              <Input
                value={formData.code as string || ''}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">College *</Label>
              <div className="space-y-1">
                <Input
                  value={formData.college as string || ''}
                  onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                  className={formErrors.college ? 'border-destructive h-9 text-sm' : 'h-9 text-sm'}
                />
                {formErrors.college && <p className="text-xs text-destructive">{formErrors.college}</p>}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto h-9">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto h-9">{saving ? 'Saving...' : selectedDept ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete Department</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete {selectedDept?.name}?</p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="w-full sm:w-auto h-9">Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} className="w-full sm:w-auto h-9">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
