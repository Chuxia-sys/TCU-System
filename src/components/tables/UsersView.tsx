'use client';

import { useState, useEffect } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Plus, MoreHorizontal, Pencil, Trash2, UserCog, Shield,
  Loader2, AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { User, Department } from '@/types';
import { safeJson } from '@/lib/utils';

export function UsersView() {
  const { data: users = [], isLoading: usersLoading, mutate: refetchUsers } = useCachedQuery<User[]>(
    'users:all',
    async (signal) => {
      const res = await fetch('/api/users', { signal });
      const data = await safeJson<User[]>(res);
      return Array.isArray(data) ? data : [];
    }
  );

  const { data: departments = [], isLoading: deptsLoading, mutate: refetchDepartments } = useCachedQuery<Department[]>(
    'departments:all',
    async (signal) => {
      const res = await fetch('/api/departments', { signal });
      const data = await safeJson<Department[]>(res);
      return Array.isArray(data) ? data : [];
    }
  );

  const loading = usersLoading || deptsLoading;

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = () => {
    setSelectedUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'faculty',
      departmentId: '',
      contractType: 'full-time',
      maxUnits: 24,
      isNew: true,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId || '',
      contractType: user.contractType,
      maxUnits: user.maxUnits,
      isNew: false,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleDelete = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name) errors.name = 'Name is required';
    if (!formData.email) errors.email = 'Email is required';
    if (formData.isNew && !formData.password) errors.password = 'Password is required';
    if (!formData.role) errors.role = 'Role is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const url = selectedUser ? `/api/users/${selectedUser.id}` : '/api/users';
      const method = selectedUser ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await safeJson<{ error?: string; id?: string } & Record<string, unknown>>(res);
      if (res.ok && data && !('error' in data)) {
        toast.success(selectedUser ? 'User updated' : 'User created');
        setDialogOpen(false);
        refetchUsers();
      } else {
        toast.error((data as any)?.error || 'Operation failed');
      }
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, { method: 'DELETE' });
      const data = await safeJson<{ success?: boolean; error?: string; message?: string }>(res);
      if (res.ok && data?.success) {
        toast.success(data.message || 'User deleted successfully');
        setDeleteDialogOpen(false);
        setSelectedUser(null);
        refetchUsers();
      } else {
        toast.error(data?.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete user. Network error.');
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const styles: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      admin: { label: 'Admin', variant: 'default' },
      department_head: { label: 'Dept Head', variant: 'secondary' },
      faculty: { label: 'Faculty', variant: 'outline' },
    };
    const style = styles[role] || styles.faculty;
    return <Badge variant={style.variant} className="text-xs">{style.label}</Badge>;
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'name',
      header: 'User',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-2 sm:gap-3">
            <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
              <AvatarImage src={user.image || ''} alt={user.name || ''} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
                {user.name?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        );
      },
    },
    { 
      accessorKey: 'role', 
      header: 'Role', 
      cell: ({ row }) => getRoleBadge(row.original.role),
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[120px] block">
          {row.original.department?.name || <span className="text-muted-foreground">-</span>}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleEdit(row.original)} className="text-sm">
              <Pencil className="mr-2 h-3.5 w-3.5" />Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive text-sm" onClick={() => handleDelete(row.original)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (loading) return (
    <div className="flex justify-center p-8">
      <UserCog className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Users Management</h1>
          <p className="text-sm text-muted-foreground">Manage system users and roles</p>
        </div>
        <Button onClick={handleCreate} size="sm" className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Add User</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">{users.length}</div>
            <p className="text-xs sm:text-sm text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">{users.filter(u => u.role === 'admin').length}</div>
            <p className="text-xs sm:text-sm text-muted-foreground">Admins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">{users.filter(u => u.role === 'department_head').length}</div>
            <p className="text-xs sm:text-sm text-muted-foreground">Dept Heads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-lg sm:text-2xl font-bold">{users.filter(u => u.role === 'faculty').length}</div>
            <p className="text-xs sm:text-sm text-muted-foreground">Faculty</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-3 sm:p-6">
          <DataTable 
            columns={columns} 
            data={users} 
            searchKey="name"
            searchPlaceholder="Search users..."
            mobileCardRender={(user) => (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={user.image || ''} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {user.name?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(user)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(user)}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap gap-2">
                  {getRoleBadge(user.role)}
                  {user.department && (
                    <Badge variant="outline" className="text-xs">{user.department.name}</Badge>
                  )}
                </div>
              </div>
            )}
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">{selectedUser ? 'Edit User' : 'Add User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 sm:py-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Name</Label>
              <Input 
                value={formData.name as string || ''} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 text-sm"
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input 
                type="email" 
                value={formData.email as string || ''} 
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-9 text-sm"
              />
              {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
            </div>
            {formData.isNew && (
              <div className="space-y-1.5">
                <Label className="text-sm">Password</Label>
                <Input 
                  type="password" 
                  value={formData.password as string || ''} 
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-9 text-sm"
                />
                {formErrors.password && <p className="text-xs text-destructive">{formErrors.password}</p>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Role</Label>
                <Select value={formData.role as string || 'faculty'} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="department_head">Department Head</SelectItem>
                    <SelectItem value="faculty">Faculty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Department</Label>
                <Select value={formData.departmentId as string || ''} onValueChange={(v) => setFormData({ ...formData, departmentId: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.role !== 'admin' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Contract Type</Label>
                  <Select value={formData.contractType as string || 'full-time'} onValueChange={(v) => setFormData({ ...formData, contractType: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Max Units</Label>
                  <Input 
                    type="number" 
                    value={formData.maxUnits as number || 24} 
                    onChange={(e) => setFormData({ ...formData, maxUnits: parseInt(e.target.value) || 24 })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto h-9">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto h-9">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedUser ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              Delete User
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. All associated data will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={selectedUser.image || ''} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedUser.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{selectedUser.name}</p>
                <p className="text-xs text-muted-foreground truncate">{selectedUser.email}</p>
                <div className="mt-1">{getRoleBadge(selectedUser.role)}</div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="w-full sm:w-auto h-9" disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} className="w-full sm:w-auto h-9" disabled={deleting}>
              {deleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="mr-2 h-4 w-4" />Delete User</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
