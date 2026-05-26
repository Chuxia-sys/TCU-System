'use client';

import { useState, useEffect } from 'react';
import { useSections, useDepartments, useCreateSection, useUpdateSection, useDeleteSection } from '@/hooks/queries';
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
import { Plus, MoreHorizontal, Pencil, Trash2, GraduationCap, Users, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Section, Department } from '@/types';

export function SectionsView() {
  const { data: session } = useSession();
  const { initializeDepartmentFromSession } = useAppStore();

  const isDeptHead = session?.user?.role === 'department_head';
  const deptHeadDepartmentId = isDeptHead ? session?.user?.departmentId : null;

  const { data: sections = [], isLoading: sectionsLoading } = useSections(deptHeadDepartmentId);
  const { data: departments = [], isLoading: deptsLoading } = useDepartments();
  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();

  const loading = sectionsLoading || deptsLoading;

  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Initialize department from session for dept_head isolation
  useEffect(() => {
    if (session?.user) {
      initializeDepartmentFromSession(session.user.role, session.user.departmentId);
    }
  }, [session?.user, initializeDepartmentFromSession]);

  const handleCreate = () => {
    setSelectedSection(null);
    // For dept_head, pre-select their department
    const preselectedDept = isDeptHead && deptHeadDepartmentId ? deptHeadDepartmentId : '';
    setFormData({
      sectionName: '',
      sectionCode: '',
      yearLevel: 1,
      departmentId: preselectedDept,
      studentCount: 40,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleEdit = (section: Section) => {
    setSelectedSection(section);
    setFormData({
      sectionName: section.sectionName,
      sectionCode: section.sectionCode || '',
      yearLevel: section.yearLevel,
      departmentId: section.departmentId,
      studentCount: section.studentCount,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleDelete = (section: Section) => {
    setSelectedSection(section);
    setDeleteDialogOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.sectionName || (formData.sectionName as string).trim() === '') {
      errors.sectionName = 'Section name is required';
    }

    if (!formData.yearLevel || (formData.yearLevel as number) < 1 || (formData.yearLevel as number) > 5) {
      errors.yearLevel = 'Year level must be between 1 and 5';
    }

    if (!formData.departmentId) {
      errors.departmentId = 'Department is required';
    }

    if (!formData.studentCount || (formData.studentCount as number) < 1) {
      errors.studentCount = 'Student count must be at least 1';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (selectedSection) {
        await updateSection.mutateAsync({ id: selectedSection.id, ...formData } as any);
        toast.success('Section updated');
      } else {
        await createSection.mutateAsync(formData as any);
        toast.success('Section created');
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedSection) return;

    try {
      await deleteSection.mutateAsync(selectedSection.id);
      toast.success('Section deleted');
      setDeleteDialogOpen(false);
      setSelectedSection(null);
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  // Determine if department select should be locked (dept_head creating new section)
  const isDepartmentLocked = isDeptHead && !selectedSection;

  const columns: ColumnDef<Section>[] = [
    {
      accessorKey: 'sectionName',
      header: 'Section Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.sectionName}</p>
          {row.original.sectionCode && (
            <p className="text-xs text-muted-foreground">{row.original.sectionCode}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'yearLevel',
      header: 'Year Level',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">Year {row.original.yearLevel}</Badge>
      ),
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => {
        const dept = row.original.department;
        return dept ? (
          <Badge variant="secondary" className="text-xs">{dept.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'studentCount',
      header: 'Students',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{row.original.studentCount}</span>
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const section = row.original;
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
              <DropdownMenuItem onClick={() => handleEdit(section)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(section)}>
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
        <GraduationCap className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Sections</h1>
          <p className="text-muted-foreground">
            Manage student sections and cohorts
            {isDeptHead && ' (Your department only)'}
          </p>
        </div>
        <Button className="h-9" onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Section
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <DataTable
            columns={columns}
            data={sections}
            searchKey="sectionName"
            searchPlaceholder="Search sections..."
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSection ? 'Edit Section' : 'Add New Section'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Name *</Label>
              <div className="space-y-1">
                <Input
                  value={formData.sectionName as string || ''}
                  onChange={(e) => setFormData({ ...formData, sectionName: e.target.value })}
                  className={`h-9 text-sm${formErrors.sectionName ? ' border-destructive' : ''}`}
                />
                {formErrors.sectionName && <p className="text-xs text-destructive">{formErrors.sectionName}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Year Level *</Label>
              <div className="space-y-1">
                <Select
                  value={String(formData.yearLevel || 1)}
                  onValueChange={(value) => setFormData({ ...formData, yearLevel: parseInt(value) })}
                >
                  <SelectTrigger className={formErrors.yearLevel ? 'border-destructive' : ''}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((year) => (
                      <SelectItem key={year} value={String(year)}>Year {year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.yearLevel && <p className="text-xs text-destructive">{formErrors.yearLevel}</p>}
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
                    {/* For dept_head creating new section, only show their department */}
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
            <div className="space-y-1.5">
              <Label className="text-sm">Students *</Label>
              <div className="space-y-1">
                <Input
                  type="number"
                  value={formData.studentCount as number || 40}
                  onChange={(e) => setFormData({ ...formData, studentCount: parseInt(e.target.value) })}
                  className={`h-9 text-sm${formErrors.studentCount ? ' border-destructive' : ''}`}
                />
                {formErrors.studentCount && <p className="text-xs text-destructive">{formErrors.studentCount}</p>}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto h-9" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto h-9" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : selectedSection ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Section</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete {selectedSection?.sectionName}?</p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto h-9" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="w-full sm:w-auto h-9" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
