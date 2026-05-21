'use client';

import { useState, useEffect, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle, RefreshCw, User, MapPin, Users,
  Zap, ArrowRightLeft, Eye, Loader2, Package, Wrench, Sparkles,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Conflict, ReassignmentCandidate } from '@/types';
import { safeJson } from '@/lib/utils';
import { DAYS, TIME_OPTIONS } from '@/types';

// ── Extended conflict type with schedule details ───────────
interface ConflictWithDetails extends Conflict {
  schedule1?: {
    id: string;
    subject?: { subjectName: string; subjectCode: string };
    faculty?: { name: string };
    room?: { roomName: string };
    section?: { sectionName: string };
    day: string;
    startTime: string;
    endTime: string;
  };
  schedule2?: {
    id: string;
    subject?: { subjectName: string; subjectCode: string };
    faculty?: { name: string };
    room?: { roomName: string };
    section?: { sectionName: string };
    day: string;
    startTime: string;
    endTime: string;
  } | null;
}

export function ConflictsView() {
  const [conflicts, setConflicts] = useState<ConflictWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [resolvingAll, setResolvingAll] = useState(false);

  // Selected conflict for various dialogs
  const [selectedConflict, setSelectedConflict] = useState<ConflictWithDetails | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Alternatives dialog
  const [alternatives, setAlternatives] = useState<ReassignmentCandidate[]>([]);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);

  // Manual reassign dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [manualResolving, setManualResolving] = useState(false);
  const [manualForm, setManualForm] = useState({
    scheduleId: '',
    newDay: 'Monday',
    newStartTime: '08:00',
    newEndTime: '09:00',
    newRoomId: '',
    reason: '',
  });
  const [rooms, setRooms] = useState<{ id: string; roomName: string; capacity: number; building: string }[]>([]);

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchConflicts = useCallback(async () => {
    try {
      const res = await fetch('/api/conflicts');
      const data = await safeJson<{ conflicts?: ConflictWithDetails[] }>(res);
      setConflicts(data?.conflicts || []);
    } catch (error) {
      console.error('Error fetching conflicts:', error);
      toast.error('Failed to load conflicts');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await safeJson<{ rooms?: { id: string; roomName: string; capacity: number; building: string }[] }>(res);
      setRooms(data?.rooms || []);
    } catch {
      // Silently fail — rooms are optional
    }
  }, []);

  useEffect(() => {
    fetchConflicts();
    fetchRooms();
  }, [fetchConflicts, fetchRooms]);

  // ── Detect Conflicts ──
  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch('/api/conflicts/detect', { method: 'POST' });
      const data = await safeJson<{ newCount?: number; existingCount?: number }>(res);
      if (res.ok) {
        toast.success(`Detected ${(data?.newCount ?? 0)} new conflicts (${data?.existingCount ?? 0} already known)`);
        fetchConflicts();
      } else {
        toast.error('Conflict detection failed');
      }
    } catch {
      toast.error('Conflict detection failed');
    } finally {
      setDetecting(false);
    }
  };

  // ── Auto-Resolve Single Conflict ──
  const handleAutoResolve = async () => {
    if (!selectedConflict) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/conflicts/${selectedConflict.id}/resolve`, { method: 'POST' });
      const data = await safeJson<{ success?: boolean; message?: string; strategy?: string }>(res);
      if (res.ok && data?.success) {
        toast.success(`Auto-resolved: ${data.message}`);
      } else {
        toast[data?.strategy === 'escalated' ? 'warning' : 'error'](
          data?.message || 'Resolution failed'
        );
      }
      setResolveDialogOpen(false);
      fetchConflicts();
    } catch {
      toast.error('Auto-resolution failed');
    } finally {
      setResolving(false);
    }
  };

  // ── Resolve All Conflicts ──
  const handleResolveAll = async () => {
    setResolvingAll(true);
    try {
      const res = await fetch('/api/conflicts/resolve-all', { method: 'POST' });
      const data = await safeJson<{ total?: number; resolved?: number; escalated?: number }>(res);
      if (res.ok) {
        toast.success(
          `Batch resolution: ${data?.resolved ?? 0} resolved, ${data?.escalated ?? 0} escalated out of ${data?.total ?? 0}`
        );
        fetchConflicts();
      } else {
        toast.error('Batch resolution failed');
      }
    } catch {
      toast.error('Batch resolution failed');
    } finally {
      setResolvingAll(false);
    }
  };

  // ── Load Alternatives ──
  const handleViewAlternatives = async (conflict: ConflictWithDetails) => {
    setSelectedConflict(conflict);
    setAlternativesOpen(true);
    setLoadingAlternatives(true);
    setAlternatives([]);
    try {
      const res = await fetch(`/api/conflicts/${conflict.id}/alternatives`);
      const data = await safeJson<{ alternatives?: ReassignmentCandidate[] }>(res);
      setAlternatives(data?.alternatives || []);
    } catch {
      toast.error('Failed to load alternatives');
    } finally {
      setLoadingAlternatives(false);
    }
  };

  // ── Open Manual Reassign ──
  const handleOpenManual = (conflict: ConflictWithDetails) => {
    setSelectedConflict(conflict);
    setManualForm({
      scheduleId: conflict.scheduleId1,
      newDay: 'Monday',
      newStartTime: '08:00',
      newEndTime: '09:00',
      newRoomId: '',
      reason: '',
    });
    setManualOpen(true);
  };

  // ── Submit Manual Reassign ──
  const handleManualResolve = async () => {
    if (!selectedConflict || !manualForm.newRoomId) {
      toast.error('Please fill all required fields');
      return;
    }
    setManualResolving(true);
    try {
      const res = await fetch(`/api/conflicts/${selectedConflict.id}/manual-resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm),
      });
      const data = await safeJson<{ success?: boolean; message?: string }>(res);
      if (res.ok && data?.success) {
        toast.success(`Reassigned: ${data.message}`);
        setManualOpen(false);
        fetchConflicts();
      } else {
        toast.error(data?.message || 'Manual reassignment failed');
      }
    } catch {
      toast.error('Manual reassignment failed');
    } finally {
      setManualResolving(false);
    }
  };

  // ── Mark Resolved (simple) ──
  const handleMarkResolved = async () => {
    if (!selectedConflict) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/conflicts/${selectedConflict.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: 'current-user' }),
      });
      if (res.ok) {
        toast.success('Conflict marked as resolved');
        setResolveDialogOpen(false);
        fetchConflicts();
      } else {
        toast.error('Failed to resolve conflict');
      }
    } catch {
      toast.error('Failed to resolve conflict');
    } finally {
      setResolving(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'faculty_double_booking': return <User className="h-4 w-4" />;
      case 'room_double_booking': return <MapPin className="h-4 w-4" />;
      case 'section_overlap': return <Users className="h-4 w-4" />;
      case 'capacity_exceeded': return <Package className="h-4 w-4" />;
      case 'equipment_mismatch': return <Wrench className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getTierBadge = (tier: 1 | 2 | 3) => {
    switch (tier) {
      case 1: return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Preferred</Badge>;
      case 2: return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Available</Badge>;
      case 3: return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Last Resort</Badge>;
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const columns: ColumnDef<ConflictWithDetails>[] = [
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.original.type;
        return (
          <div className="flex items-center gap-2">
            {getTypeIcon(type)}
            <span className="capitalize text-sm">{type.replace(/_/g, ' ')}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ row }) => {
        const severity = row.original.severity;
        return (
          <Badge
            variant={severity === 'critical' ? 'destructive' : severity === 'warning' ? 'secondary' : 'outline'}
          >
            {severity || 'warning'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <p className="text-sm text-muted-foreground max-w-xs sm:max-w-md truncate">
          {row.original.description}
        </p>
      ),
    },
    {
      accessorKey: 'resolutionStatus',
      header: 'Resolution',
      cell: ({ row }) => {
        const status = row.original.resolutionStatus;
        if (row.original.resolved) return <Badge variant="default">Resolved</Badge>;
        if (status === 'auto_resolved') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Auto-Resolved</Badge>;
        if (status === 'manual_review') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Needs Review</Badge>;
        if (status === 'escalated') return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Escalated</Badge>;
        return <Badge variant="destructive">Active</Badge>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const conflict = row.original;
        if (conflict.resolved) return null;
        return (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5"
              onClick={() => handleViewAlternatives(conflict)}
              title="View alternatives"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-8 px-2.5 bg-primary hover:bg-primary/90"
              onClick={() => {
                setSelectedConflict(conflict);
                setResolveDialogOpen(true);
              }}
              title="Auto-resolve"
            >
              <Zap className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-2.5"
              onClick={() => handleOpenManual(conflict)}
              title="Manual reassign"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
    {
      id: 'expand',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleRow(row.original.id)}>
          {expandedRows.has(row.original.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      ),
    },
  ];

  const activeConflicts = conflicts.filter((c) => !c.resolved);
  const resolvedConflicts = conflicts.filter((c) => c.resolved);
  const autoResolved = conflicts.filter((c) => c.resolutionStatus === 'auto_resolved');
  const escalated = conflicts.filter((c) => c.resolutionStatus === 'escalated');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertTriangle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Conflict Resolution
          </h1>
          <p className="text-sm text-muted-foreground">Intelligent conflict detection & auto-rescheduling</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleDetect} variant="outline" size="sm" disabled={detecting}>
            {detecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            {detecting ? 'Scanning...' : 'Detect'}
          </Button>
          {activeConflicts.length > 0 && (
            <Button onClick={handleResolveAll} size="sm" disabled={resolvingAll} className="bg-primary hover:bg-primary/90">
              {resolvingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              {resolvingAll ? 'Resolving...' : 'Resolve All'}
            </Button>
          )}
          <Button onClick={fetchConflicts} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold">{conflicts.length}</div>
          </CardContent>
        </Card>
        <Card className="border-destructive/50">
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-destructive">{activeConflicts.length}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/50">
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Auto-Resolved</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{autoResolved.length}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/50">
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Escalated</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-amber-600">{escalated.length}</div>
          </CardContent>
        </Card>
        <Card className="border-primary/50">
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Resolved</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-primary">{resolvedConflicts.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Expanded Conflict Details */}
      <AnimatePresence>
        {expandedRows.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {conflicts.filter(c => expandedRows.has(c.id)).map(conflict => (
              <Card key={conflict.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(conflict.type)}
                      <span className="font-semibold text-sm capitalize">{conflict.type.replace(/_/g, ' ')}</span>
                      <Badge variant={conflict.severity === 'critical' ? 'destructive' : 'secondary'}>
                        {conflict.severity || 'warning'}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleRow(conflict.id)}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{conflict.description}</p>

                  {/* Schedule pair details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {conflict.schedule1 && (
                      <div className="rounded-lg border p-3 bg-muted/30">
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Schedule A</p>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Subject:</span> {conflict.schedule1.subject?.subjectCode} – {conflict.schedule1.subject?.subjectName}</p>
                          <p><span className="text-muted-foreground">Faculty:</span> {conflict.schedule1.faculty?.name}</p>
                          <p><span className="text-muted-foreground">Room:</span> {conflict.schedule1.room?.roomName}</p>
                          <p><span className="text-muted-foreground">Section:</span> {conflict.schedule1.section?.sectionName}</p>
                          <p><span className="text-muted-foreground">Time:</span> {conflict.schedule1.day} {conflict.schedule1.startTime}–{conflict.schedule1.endTime}</p>
                        </div>
                      </div>
                    )}
                    {conflict.schedule2 && (
                      <div className="rounded-lg border p-3 bg-muted/30">
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Schedule B</p>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Subject:</span> {conflict.schedule2.subject?.subjectCode} – {conflict.schedule2.subject?.subjectName}</p>
                          <p><span className="text-muted-foreground">Faculty:</span> {conflict.schedule2.faculty?.name}</p>
                          <p><span className="text-muted-foreground">Room:</span> {conflict.schedule2.room?.roomName}</p>
                          <p><span className="text-muted-foreground">Section:</span> {conflict.schedule2.section?.sectionName}</p>
                          <p><span className="text-muted-foreground">Time:</span> {conflict.schedule2.day} {conflict.schedule2.startTime}–{conflict.schedule2.endTime}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Suggested Resolution */}
                  {conflict.suggestedResolution && (
                    <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs font-semibold uppercase text-primary mb-1">Suggested Resolution</p>
                      <p className="text-sm">{conflict.suggestedResolution}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!conflict.resolved && (
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleViewAlternatives(conflict)}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> View Alternatives
                      </Button>
                      <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => { setSelectedConflict(conflict); setResolveDialogOpen(true); }}>
                        <Zap className="mr-1.5 h-3.5 w-3.5" /> Auto-Resolve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleOpenManual(conflict)}>
                        <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Manual Reassign
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Conflicts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Active Conflicts
          </CardTitle>
          <CardDescription>Conflicts that require immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          {activeConflicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-12 w-12 text-primary mb-4" />
              <p className="font-medium text-lg">No Active Conflicts</p>
              <p className="text-muted-foreground">All schedules are conflict-free</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={activeConflicts}
              searchKey="description"
              searchPlaceholder="Search conflicts..."
            />
          )}
        </CardContent>
      </Card>

      {/* Resolved Conflicts */}
      {resolvedConflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Resolved Conflicts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={resolvedConflicts}
              searchKey="description"
              searchPlaceholder="Search resolved..."
            />
          </CardContent>
        </Card>
      )}

      {/* ── Auto-Resolve Dialog ──────────────────────────── */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Auto-Resolve Conflict
            </DialogTitle>
            <DialogDescription>
              The system will find the best alternative time slot that respects faculty preferences and avoids cascading conflicts.
            </DialogDescription>
          </DialogHeader>
          {selectedConflict && (
            <div className="py-4 space-y-3">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-sm font-medium mb-1">{selectedConflict.type.replace(/_/g, ' ')}</p>
                <p className="text-sm text-muted-foreground">{selectedConflict.description}</p>
              </div>
              {selectedConflict.suggestedResolution && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-semibold uppercase text-primary mb-1">Current Suggestion</p>
                  <p className="text-sm">{selectedConflict.suggestedResolution}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)} disabled={resolving}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={handleMarkResolved} disabled={resolving}>
              Mark Resolved
            </Button>
            <Button onClick={handleAutoResolve} disabled={resolving}>
              {resolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Auto-Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Alternatives Dialog ──────────────────────────── */}
      <Dialog open={alternativesOpen} onOpenChange={setAlternativesOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Reassignment Alternatives
            </DialogTitle>
            <DialogDescription>
              Ranked alternatives for resolving this conflict. Higher scores = better match with faculty preferences.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {loadingAlternatives ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : alternatives.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No Alternatives Available</p>
                <p className="text-sm text-muted-foreground">This conflict requires manual resolution</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {alternatives.slice(0, 20).map((alt, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">#{idx + 1}</span>
                        {getTierBadge(alt.tier)}
                      </div>
                      <span className="text-sm font-semibold text-primary">{alt.score.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Original</p>
                        <p className="font-medium">{alt.originalDay} {alt.originalStartTime}–{alt.originalEndTime}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Proposed</p>
                        <p className="font-medium text-emerald-600">{alt.newDay} {alt.newStartTime}–{alt.newEndTime}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{alt.rescheduleReason.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlternativesOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual Reassign Dialog ───────────────────────── */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              Manual Reassignment
            </DialogTitle>
            <DialogDescription>
              Manually assign a new day, time, and room for the conflicting schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Day</Label>
              <Select value={manualForm.newDay} onValueChange={(v) => setManualForm(f => ({ ...f, newDay: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Select value={manualForm.newStartTime} onValueChange={(v) => setManualForm(f => ({ ...f, newStartTime: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Select value={manualForm.newEndTime} onValueChange={(v) => setManualForm(f => ({ ...f, newEndTime: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={manualForm.newRoomId} onValueChange={(v) => setManualForm(f => ({ ...f, newRoomId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a room" /></SelectTrigger>
                <SelectContent>
                  {rooms.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.roomName} (Cap: {r.capacity}, {r.building})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={2}
                value={manualForm.reason}
                onChange={(e) => setManualForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Why this reassignment..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setManualOpen(false)} disabled={manualResolving}>Cancel</Button>
            <Button onClick={handleManualResolve} disabled={manualResolving || !manualForm.newRoomId}>
              {manualResolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
              Apply Reassignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
