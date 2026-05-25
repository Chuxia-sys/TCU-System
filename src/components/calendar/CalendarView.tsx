'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { DAYS } from '@/types';
import { useAppStore } from '@/store';
import { cn, formatTime12Hour, safeJson } from '@/lib/utils';
import {
  Calendar as CalendarIcon, Filter, Printer, Download, User, MapPin, Users,
  Clock, BookOpen, AlertTriangle, RefreshCw, Building2, GraduationCap,
  Layers, X, ChevronRight, Palette, CheckCircle, Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Schedule, User as UserType, Section, Room, DayOfWeek } from '@/types';

// ─── Constants ─────────────────────────────────────────────────────────
const HOUR_HEIGHT = 64; // px per hour
const SLOT_HEIGHT = HOUR_HEIGHT;
const MIN_HOUR = 7;  // 07:00
const MAX_HOUR = 21; // 21:00
const TOTAL_HOURS = MAX_HOUR - MIN_HOUR; // 14 hours
const MIN_CARD_WIDTH = 90; // minimum px width before stacking
const MAX_VISIBLE_OVERLAPS = 3; // max cards shown side by side

// ─── Color palette (12 pastel colors for light & dark mode) ───────────
// Hover effect is handled by the .schedule-card-hover CSS class
// which uses filter: brightness() dimming (see globals.css).
// headerBg/headerText: used for the modal header banner gradient.
const CARD_COLORS = [
  { bg: 'bg-emerald-100 dark:bg-emerald-950/50', border: 'border-emerald-400 dark:border-emerald-700', text: 'text-emerald-900 dark:text-emerald-100', accent: 'bg-emerald-500', dot: 'bg-emerald-500', headerBg: 'from-emerald-600 to-emerald-700 dark:from-emerald-700 dark:to-emerald-900', headerText: 'text-white', accentBg: 'bg-emerald-600 dark:bg-emerald-500' },
  { bg: 'bg-sky-100 dark:bg-sky-950/50', border: 'border-sky-400 dark:border-sky-700', text: 'text-sky-900 dark:text-sky-100', accent: 'bg-sky-500', dot: 'bg-sky-500', headerBg: 'from-sky-600 to-sky-700 dark:from-sky-700 dark:to-sky-900', headerText: 'text-white', accentBg: 'bg-sky-600 dark:bg-sky-500' },
  { bg: 'bg-violet-100 dark:bg-violet-950/50', border: 'border-violet-400 dark:border-violet-700', text: 'text-violet-900 dark:text-violet-100', accent: 'bg-violet-500', dot: 'bg-violet-500', headerBg: 'from-violet-600 to-violet-700 dark:from-violet-700 dark:to-violet-900', headerText: 'text-white', accentBg: 'bg-violet-600 dark:bg-violet-500' },
  { bg: 'bg-amber-100 dark:bg-amber-950/50', border: 'border-amber-400 dark:border-amber-700', text: 'text-amber-900 dark:text-amber-100', accent: 'bg-amber-500', dot: 'bg-amber-500', headerBg: 'from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-800', headerText: 'text-white', accentBg: 'bg-amber-600 dark:bg-amber-500' },
  { bg: 'bg-rose-100 dark:bg-rose-950/50', border: 'border-rose-400 dark:border-rose-700', text: 'text-rose-900 dark:text-rose-100', accent: 'bg-rose-500', dot: 'bg-rose-500', headerBg: 'from-rose-600 to-rose-700 dark:from-rose-700 dark:to-rose-900', headerText: 'text-white', accentBg: 'bg-rose-600 dark:bg-rose-500' },
  { bg: 'bg-teal-100 dark:bg-teal-950/50', border: 'border-teal-400 dark:border-teal-700', text: 'text-teal-900 dark:text-teal-100', accent: 'bg-teal-500', dot: 'bg-teal-500', headerBg: 'from-teal-600 to-teal-700 dark:from-teal-700 dark:to-teal-900', headerText: 'text-white', accentBg: 'bg-teal-600 dark:bg-teal-500' },
  { bg: 'bg-orange-100 dark:bg-orange-950/50', border: 'border-orange-400 dark:border-orange-700', text: 'text-orange-900 dark:text-orange-100', accent: 'bg-orange-500', dot: 'bg-orange-500', headerBg: 'from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-800', headerText: 'text-white', accentBg: 'bg-orange-600 dark:bg-orange-500' },
  { bg: 'bg-cyan-100 dark:bg-cyan-950/50', border: 'border-cyan-400 dark:border-cyan-700', text: 'text-cyan-900 dark:text-cyan-100', accent: 'bg-cyan-500', dot: 'bg-cyan-500', headerBg: 'from-cyan-600 to-cyan-700 dark:from-cyan-700 dark:to-cyan-900', headerText: 'text-white', accentBg: 'bg-cyan-600 dark:bg-cyan-500' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-950/50', border: 'border-fuchsia-400 dark:border-fuchsia-700', text: 'text-fuchsia-900 dark:text-fuchsia-100', accent: 'bg-fuchsia-500', dot: 'bg-fuchsia-500', headerBg: 'from-fuchsia-600 to-fuchsia-700 dark:from-fuchsia-700 dark:to-fuchsia-900', headerText: 'text-white', accentBg: 'bg-fuchsia-600 dark:bg-fuchsia-500' },
  { bg: 'bg-lime-100 dark:bg-lime-950/50', border: 'border-lime-400 dark:border-lime-700', text: 'text-lime-900 dark:text-lime-100', accent: 'bg-lime-500', dot: 'bg-lime-500', headerBg: 'from-lime-500 to-lime-600 dark:from-lime-600 dark:to-lime-800', headerText: 'text-white', accentBg: 'bg-lime-600 dark:bg-lime-500' },
  { bg: 'bg-pink-100 dark:bg-pink-950/50', border: 'border-pink-400 dark:border-pink-700', text: 'text-pink-900 dark:text-pink-100', accent: 'bg-pink-500', dot: 'bg-pink-500', headerBg: 'from-pink-600 to-pink-700 dark:from-pink-700 dark:to-pink-900', headerText: 'text-white', accentBg: 'bg-pink-600 dark:bg-pink-500' },
  { bg: 'bg-yellow-100 dark:bg-yellow-950/50', border: 'border-yellow-400 dark:border-yellow-700', text: 'text-yellow-900 dark:text-yellow-100', accent: 'bg-yellow-500', dot: 'bg-yellow-500', headerBg: 'from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-800', headerText: 'text-white', accentBg: 'bg-yellow-600 dark:bg-yellow-500' },
];

// ─── Time helpers ─────────────────────────────────────────────────────
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function getTopOffset(startTime: string): number {
  const minutes = timeToMinutes(startTime) - (MIN_HOUR * 60);
  return (minutes / 60) * SLOT_HEIGHT;
}

function getCardHeight(startTime: string, endTime: string): number {
  const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
  return (duration / 60) * SLOT_HEIGHT;
}

// ─── Overlap detection & column layout ────────────────────────────────
interface LayoutItem {
  schedule: Schedule;
  col: number;       // 0-indexed column
  totalCols: number; // total columns in this overlap group
  hidden: boolean;   // true if card should be collapsed behind "+N more"
}

interface OverlapGroup {
  start: number; // min start in minutes
  end: number;   // max end in minutes
  indices: number[]; // indices into sorted array
}

function computeDayLayout(daySchedules: Schedule[]): LayoutItem[] {
  if (daySchedules.length === 0) return [];
  if (daySchedules.length === 1) return [{ schedule: daySchedules[0], col: 0, totalCols: 1, hidden: false }];

  // Sort by start time, then longer duration first
  const sorted = [...daySchedules].sort((a, b) => {
    const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    if (startDiff !== 0) return startDiff;
    return (timeToMinutes(b.endTime) - timeToMinutes(b.startTime)) - (timeToMinutes(a.endTime) - timeToMinutes(a.startTime));
  });

  // Find overlap groups: a group is a maximal set of schedules where each overlaps with at least one other
  const n = sorted.length;
  const placed = new Array(n).fill(false);
  const groups: OverlapGroup[] = [];

  for (let i = 0; i < n; i++) {
    if (placed[i]) continue;
    const group: OverlapGroup = { start: timeToMinutes(sorted[i].startTime), end: timeToMinutes(sorted[i].endTime), indices: [i] };
    placed[i] = true;

    // BFS to find all connected overlapping schedules
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < n; j++) {
        if (placed[j]) continue;
        const jStart = timeToMinutes(sorted[j].startTime);
        const jEnd = timeToMinutes(sorted[j].endTime);
        // Check if j overlaps with anyone in the group
        const overlaps = group.indices.some(idx => {
          const sStart = timeToMinutes(sorted[idx].startTime);
          const sEnd = timeToMinutes(sorted[idx].endTime);
          return jStart < sEnd && jEnd > sStart;
        });
        if (overlaps) {
          group.indices.push(j);
          group.start = Math.min(group.start, jStart);
          group.end = Math.max(group.end, jEnd);
          placed[j] = true;
          changed = true;
        }
      }
    }
    groups.push(group);
  }

  // Assign columns within each group using greedy interval scheduling
  const result: LayoutItem[] = [];

  for (const group of groups) {
    const { indices } = group;
    const groupSchedules = indices.map(i => sorted[i]);

    // Sort within group by start time, longer first
    groupSchedules.sort((a, b) => {
      const d = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      return d !== 0 ? d : (timeToMinutes(b.endTime) - timeToMinutes(b.startTime)) - (timeToMinutes(a.endTime) - timeToMinutes(a.startTime));
    });

    // Build column assignment
    const columns: Array<{ end: number; items: Set<Schedule> }> = [];

    for (const s of groupSchedules) {
      const start = timeToMinutes(s.startTime);
      const end = timeToMinutes(s.endTime);
      let colIdx = -1;

      for (let c = 0; c < columns.length; c++) {
        if (columns[c].end <= start) {
          colIdx = c;
          break;
        }
      }

      if (colIdx === -1) {
        colIdx = columns.length;
        columns.push({ end, items: new Set() });
      }
      columns[colIdx].end = end;
      columns[colIdx].items.add(s);
    }

    const totalCols = columns.length;
    const showMax = Math.min(totalCols, MAX_VISIBLE_OVERLAPS);

    for (const s of groupSchedules) {
      let col = 0;
      for (let c = 0; c < columns.length; c++) {
        if (columns[c].items.has(s)) {
          col = c;
          break;
        }
      }
      const hidden = col >= MAX_VISIBLE_OVERLAPS;
      result.push({ schedule: s, col, totalCols: showMax, hidden });
    }
  }

  return result;
}

// ─── Build stable color map from subjectId -> color index ─────────────
function buildColorMap(schedules: Schedule[]): Map<string, number> {
  const map = new Map<string, number>();
  // Collect unique subject IDs with their codes for consistent sorting
  const subjectMap = new Map<string, string>();
  for (const s of schedules) {
    if (!subjectMap.has(s.subjectId)) {
      subjectMap.set(s.subjectId, s.subject?.subjectCode || s.subjectId);
    }
  }
  // Sort by subject code for consistent color assignment across refreshes
  const sortedSubjects = [...subjectMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  sortedSubjects.forEach(([id], i) => map.set(id, i % CARD_COLORS.length));
  return map;
}

// ─── Subject label helper ─────────────────────────────────────────────
function getSubjectLabel(s: Schedule): string {
  return s.subject?.subjectCode || 'N/A';
}

function getSubjectName(s: Schedule): string {
  return s.subject?.subjectName || 'Unknown';
}

// ─── Schedule Card (in-grid) ─────────────────────────────────────────
function ScheduleCard({
  schedule,
  color,
  top,
  height,
  col,
  totalCols,
  onClick,
  hidden,
}: {
  schedule: Schedule;
  color: typeof CARD_COLORS[number];
  top: number;
  height: number;
  col: number;
  totalCols: number;
  onClick: () => void;
  hidden: boolean;
}) {
  const widthPercent = 100 / totalCols;
  const leftPercent = col * widthPercent;
  const isConflict = schedule.status === 'conflict';
  const effectiveHeight = Math.max(height, 36);

  if (hidden) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: col * 0.03 }}
          onClick={onClick}
          className={cn(
            'absolute rounded-lg overflow-hidden cursor-pointer schedule-card-hover',
            'group/card',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'border-l-[3px]',
            color.bg,
            color.border,
            isConflict && 'ring-2 ring-red-400 dark:ring-red-500 ring-offset-1 dark:ring-offset-background animate-pulse',
          )}
          style={{
            top: `${top}px`,
            height: `${effectiveHeight}px`,
            left: `calc(${leftPercent}% + 1px)`,
            width: `calc(${widthPercent}% - 2px)`,
          }}
        >
          <div className={cn('relative z-[2] flex flex-col h-full p-1.5 text-left gap-0.5', color.text)}>
            {/* Row 1: subject code + conflict icon */}
            <div className="flex items-center justify-between gap-1 min-h-0">
              <p className="font-bold text-[11px] leading-tight truncate flex-1">
                {getSubjectLabel(schedule)}
              </p>
              {isConflict && (
                <AlertTriangle className="h-3 w-3 text-red-500 dark:text-red-400 shrink-0" />
              )}
            </div>

            {/* Row 2: subject name (if tall enough) */}
            {effectiveHeight > 52 && (
              <p className="text-[10px] leading-tight truncate opacity-80">
                {getSubjectName(schedule)}
              </p>
            )}

            {/* Row 3: time */}
            <div className="flex items-center gap-0.5 mt-auto">
              <Clock className="h-2.5 w-2.5 shrink-0 opacity-60" />
              <p className="text-[9px] leading-tight truncate opacity-70">
                {formatTime12Hour(schedule.startTime)} – {formatTime12Hour(schedule.endTime)}
              </p>
            </div>

            {/* Row 4: faculty (if tall enough) */}
            {effectiveHeight > 76 && (
              <div className="flex items-center gap-0.5">
                <User className="h-2.5 w-2.5 shrink-0 opacity-60" />
                <p className="text-[9px] leading-tight truncate opacity-70">
                  {schedule.faculty?.name}
                </p>
              </div>
            )}

            {/* Row 5: room (if tall enough) */}
            {effectiveHeight > 92 && (
              <div className="flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5 shrink-0 opacity-60" />
                <p className="text-[9px] leading-tight truncate opacity-70">
                  {schedule.room?.roomName}
                </p>
              </div>
            )}

            {/* Row 6: section (if tall enough) */}
            {effectiveHeight > 108 && (
              <div className="flex items-center gap-0.5">
                <Users className="h-2.5 w-2.5 shrink-0 opacity-60" />
                <p className="text-[9px] leading-tight truncate opacity-70">
                  {schedule.section?.sectionName}
                </p>
              </div>
            )}

            {/* Row 7: department (if tall enough) */}
            {effectiveHeight > 124 && schedule.subject?.department && (
              <div className="flex items-center gap-0.5">
                <BookOpen className="h-2.5 w-2.5 shrink-0 opacity-60" />
                <p className="text-[9px] leading-tight truncate opacity-60">
                  {schedule.subject.department.name}
                </p>
              </div>
            )}
          </div>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs p-3 z-50" sideOffset={8}>
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold text-[#111827]">{getSubjectLabel(schedule)} — {getSubjectName(schedule)}</div>
          <div className="text-[#4b5563] flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime12Hour(schedule.startTime)} – {formatTime12Hour(schedule.endTime)}</div>
          <div className="text-[#4b5563] flex items-center gap-1"><User className="h-3 w-3" />{schedule.faculty?.name}</div>
          <div className="text-[#4b5563] flex items-center gap-1"><MapPin className="h-3 w-3" />{schedule.room?.roomName}{schedule.room?.building ? ` (${schedule.room.building})` : ''}</div>
          <div className="text-[#4b5563] flex items-center gap-1"><Users className="h-3 w-3" />{schedule.section?.sectionName}</div>
          {isConflict && <div className="text-red-500 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Conflict</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── "+N more" overflow indicator ─────────────────────────────────────
function OverlapOverflowCard({
  count,
  top,
  height,
  col,
  totalCols,
  onClick,
}: {
  count: number;
  top: number;
  height: number;
  col: number;
  totalCols: number;
  onClick: () => void;
}) {
  const widthPercent = 100 / totalCols;
  const leftPercent = col * widthPercent;

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClick}
      className={cn(
        'absolute rounded-lg overflow-hidden cursor-pointer',
        'border-l-[3px] border-zinc-300 dark:border-zinc-600',
        'bg-zinc-100 dark:bg-[#444951] hover:bg-zinc-200 dark:hover:bg-[#4D525A]',
        'text-zinc-600 dark:text-zinc-300',
        'transition-colors flex items-center justify-center',
      )}
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 36)}px`,
        left: `calc(${leftPercent}% + 1px)`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
    >
      <span className="text-xs font-semibold">+{count} more</span>
    </motion.button>
  );
}

// ─── Info Tile (modern card tile for modal) ──────────────────────────
function InfoTile({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={cn(
      'flex items-start gap-3 sm:gap-4 rounded-xl sm:rounded-2xl p-4 sm:p-5',
      'bg-muted/40 dark:bg-[#444951]/60 border border-gray-200/60 dark:border-white/[0.08]',
      'transition-all duration-200 hover:shadow-sm hover:border-gray-300/80 dark:hover:border-white/[0.15]',
      'h-full',
      className,
    )}>
      <div className="text-gray-400 dark:text-[#9CA3AF] mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 space-y-1">
        <p className="text-[10px] sm:text-xs text-muted-foreground dark:text-[#9CA3AF] uppercase tracking-wide font-semibold">{label}</p>
        <p className="text-sm sm:text-base font-bold text-gray-800 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Quick Info Pill (for header — always on red banner) ─────────
function QuickPill({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-medium',
      // Same style in both modes — semi-transparent white on red header
      'bg-white/20 backdrop-blur-sm border border-white/15 text-white/90',
      'transition-colors duration-200',
      className,
    )}>
      {icon}
      {children}
    </span>
  );
}

// ─── Current Time Indicator ───────────────────────────────────────────
function CurrentTimeIndicator() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const calendarStart = MIN_HOUR * 60;
  const calendarEnd = MAX_HOUR * 60;

  if (currentMinutes < calendarStart || currentMinutes > calendarEnd) return null;

  const top = ((currentMinutes - calendarStart) / 60) * SLOT_HEIGHT;

  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top: `${top}px` }}
    >
      <div className="flex items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shrink-0" />
        <div className="flex-1 h-[2px] bg-red-500" />
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <CalendarIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">No schedules yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Schedules will appear here once generated. Go to the Dashboard and click &ldquo;Generate Schedules&rdquo; to get started.
      </p>
    </motion.div>
  );
}

// ─── Main Calendar View ───────────────────────────────────────────────
export function CalendarView() {
  const { data: session } = useSession();
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [now] = useState(new Date());
  const [showColorLegend, setShowColorLegend] = useState(false);
  const { calendarFilters, setCalendarFilters, lastRefresh } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const isFaculty = session?.user?.role === 'faculty';

  // Force faculty filter to their own ID
  useEffect(() => {
    if (isFaculty && session?.user?.id) {
      setCalendarFilters({ faculty: session.user.id });
    }
  }, [isFaculty, session?.user?.id, setCalendarFilters]);

  const { data: schedules = [], isLoading: schedulesLoading, mutate: refetchSchedules } = useCachedQuery<Schedule[]>(
    'schedules:all',
    async (signal) => {
      const res = await fetch('/api/schedules', { signal });
      const data = await safeJson<Schedule[]>(res);
      return Array.isArray(data) ? data : [];
    }
  );

  const { data: faculty = [], isLoading: facultyLoading } = useCachedQuery<UserType[]>(
    'faculty:all',
    async (signal) => {
      const res = await fetch('/api/users?role=faculty', { signal });
      const data = await safeJson<UserType[]>(res);
      return Array.isArray(data) ? data : [];
    }
  );

  const { data: sections = [], isLoading: sectionsLoading } = useCachedQuery<Section[]>(
    'sections:all',
    async (signal) => {
      const res = await fetch('/api/sections', { signal });
      const data = await safeJson<Section[]>(res);
      return Array.isArray(data) ? data : [];
    }
  );

  const { data: rooms = [], isLoading: roomsLoading } = useCachedQuery<Room[]>(
    'rooms:all',
    async (signal) => {
      const res = await fetch('/api/rooms', { signal });
      const data = await safeJson<Room[]>(res);
      return Array.isArray(data) ? data : [];
    }
  );

  const loading = schedulesLoading || facultyLoading || sectionsLoading || roomsLoading;

  // Filtered schedules
  const filteredSchedules = useMemo(() => {
    const effectiveFacultyFilter = isFaculty ? session?.user?.id : calendarFilters.faculty;
    return schedules.filter(s => {
      if (calendarFilters.section !== 'all' && s.sectionId !== calendarFilters.section) return false;
      if (effectiveFacultyFilter !== 'all' && effectiveFacultyFilter && s.facultyId !== effectiveFacultyFilter) return false;
      if (selectedDay !== 'all' && s.day !== selectedDay) return false;
      if (calendarFilters.room !== 'all' && s.roomId !== calendarFilters.room) return false;
      return true;
    });
  }, [schedules, calendarFilters, isFaculty, session?.user?.id, selectedDay]);

  // Build color map from ALL schedules (not just filtered) for consistent colors
  const colorMap = useMemo(() => buildColorMap(schedules), [schedules]);

  // Group filtered schedules by day
  const schedulesByDay = useMemo(() => {
    const map = new Map<DayOfWeek, Schedule[]>();
    for (const day of DAYS) {
      map.set(day, filteredSchedules.filter(s => s.day === day));
    }
    return map;
  }, [filteredSchedules]);

  // Compute layouts per day
  const dayLayouts = useMemo(() => {
    const map = new Map<DayOfWeek, { items: LayoutItem[]; hiddenCount: number; overflowTop: number; overflowHeight: number }>();
    for (const [day, daySchedules] of schedulesByDay) {
      const items = computeDayLayout(daySchedules);
      const hiddenItems = items.filter(i => i.hidden);
      let hiddenCount = hiddenItems.length;

      // Find overlap region for "+N more" indicator
      let overflowTop = 0;
      let overflowHeight = 0;
      if (hiddenCount > 0) {
        const visibleItems = items.filter(i => !i.hidden);
        const allInGroup = items.filter(i =>
          !i.hidden || hiddenItems.some(hi =>
            timeToMinutes(hi.schedule.startTime) < timeToMinutes(i.schedule.endTime) &&
            timeToMinutes(hi.schedule.endTime) > timeToMinutes(i.schedule.startTime)
          )
        );
        const minStart = Math.min(...allInGroup.map(i => timeToMinutes(i.schedule.startTime)));
        const maxEnd = Math.max(...allInGroup.map(i => timeToMinutes(i.schedule.endTime)));
        overflowTop = ((minStart - MIN_HOUR * 60) / 60) * SLOT_HEIGHT;
        overflowHeight = ((maxEnd - minStart) / 60) * SLOT_HEIGHT;
      }
      map.set(day, { items, hiddenCount, overflowTop, overflowHeight });
    }
    return map;
  }, [schedulesByDay]);

  // Color legend data: unique subjects sorted alphabetically
  const colorLegend = useMemo(() => {
    const seen = new Map<string, { code: string; name: string }>();
    for (const s of schedules) {
      if (!seen.has(s.subjectId)) {
        seen.set(s.subjectId, { code: s.subject?.subjectCode || 'N/A', name: s.subject?.subjectName || 'Unknown' });
      }
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].code.localeCompare(b[1].code))
      .map(([id, info]) => ({
        subjectId: id,
        colorIndex: colorMap.get(id) ?? 0,
        ...info,
      }));
  }, [schedules, colorMap]);

  // Navigate to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = now.getHours();
      const scrollTo = Math.max(0, currentHour - MIN_HOUR - 1) * SLOT_HEIGHT;
      scrollRef.current.scrollTo({ top: scrollTo, behavior: 'smooth' });
    }
  }, [loading]);

  const handlePrint = useCallback(() => window.print(), []);

  const handleExport = useCallback(() => {
    const headers = ['Day', 'Start Time', 'End Time', 'Subject', 'Subject Code', 'Faculty', 'Section', 'Room', 'Status'];
    const rows = filteredSchedules.map(s => [
      s.day,
      s.startTime,
      s.endTime,
      s.subject?.subjectName || '',
      s.subject?.subjectCode || '',
      s.faculty?.name || '',
      s.section?.sectionName || '',
      s.room?.roomName || '',
      s.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tcu-schedule-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [filteredSchedules]);

  const clearFilters = useCallback(() => {
    setSelectedDay('all');
    setCalendarFilters({ section: 'all', faculty: 'all', room: 'all' });
  }, [setCalendarFilters]);

  const totalGridHeight = TOTAL_HOURS * SLOT_HEIGHT;
  const conflictCount = useMemo(() => filteredSchedules.filter(s => s.status === 'conflict').length, [filteredSchedules]);

  // ─── Loading state ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CalendarIcon className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────
  if (schedules.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isFaculty ? 'My Schedule' : 'Schedule Calendar'}
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
        </div>
        <EmptyState />
      </motion.div>
    );
  }

  // ─── Main render ────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {isFaculty ? 'My Schedule' : 'Schedule Calendar'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {filteredSchedules.length} schedule{filteredSchedules.length !== 1 ? 's' : ''}
            {conflictCount > 0 && (
              <span className="text-red-500 ml-1 font-medium">({conflictCount} conflict{conflictCount !== 1 ? 's' : ''})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showColorLegend ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowColorLegend(v => !v)}
              >
                <Palette className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Color Legend</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── Color Legend (collapsible) ──────────────────────────────── */}
      <AnimatePresence>
        {showColorLegend && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="print:hidden">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Subject Color Legend</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={() => setShowColorLegend(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {colorLegend.map(item => (
                    <div key={item.subjectId} className="flex items-center gap-1.5 text-xs">
                      <div className={cn('w-3 h-3 rounded-sm shrink-0', CARD_COLORS[item.colorIndex].dot)} />
                      <span className="text-muted-foreground font-medium">{item.code}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <Card className="print:hidden">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span className="font-medium hidden sm:inline">Filters:</span>
            </div>
            <Select value={selectedDay} onValueChange={setSelectedDay}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="All Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Days</SelectItem>
                {DAYS.map((day) => (
                  <SelectItem key={day} value={day}>{day}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={calendarFilters.section}
              onValueChange={(value) => setCalendarFilters({ section: value })}
            >
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.sectionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isFaculty && (
              <Select
                value={calendarFilters.faculty}
                onValueChange={(value) => setCalendarFilters({ faculty: value })}
              >
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="All Faculty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Faculty</SelectItem>
                  {faculty.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={calendarFilters.room}
              onValueChange={(value) => setCalendarFilters({ room: value })}
            >
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="All Rooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rooms</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>{room.roomName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(selectedDay !== 'all' || calendarFilters.section !== 'all' || calendarFilters.faculty !== 'all' || calendarFilters.room !== 'all') && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Day pill navigation (mobile) ───────────────────────────── */}
      <div className="flex md:hidden gap-2 overflow-x-auto pb-1 print:hidden scrollbar-none">
        <button
          onClick={() => setSelectedDay('all')}
          className={cn(
            'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all border',
            selectedDay === 'all'
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'bg-card border-border text-muted-foreground hover:bg-muted'
          )}
        >
          All
        </button>
        {DAYS.map((day) => {
          const count = schedulesByDay.get(day)?.length || 0;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(selectedDay === day ? 'all' : day)}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all border',
                selectedDay === day
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted'
              )}
            >
              <span className="block">{day.slice(0, 3)}</span>
              {count > 0 && (
                <span className="block text-[10px] mt-0.5 opacity-80">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Calendar Grid ──────────────────────────────────────────── */}
      <Card className="overflow-hidden print:shadow-none print:border">
        <CardContent className="p-0">
          <div
            className="overflow-auto"
            style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}
            ref={scrollRef}
          >
            <div className="min-w-[780px] md:min-w-full">
                {/* Day headers row */}
                <div className="sticky top-0 z-10 flex border-b bg-card/95 backdrop-blur-sm">
                  {/* Time gutter */}
                  <div className="w-12 md:w-16 shrink-0 border-r bg-muted/30" />
                  {DAYS.map((day) => {
                    const daySchedules = schedulesByDay.get(day) || [];
                    const isDayHidden = selectedDay !== 'all' && selectedDay !== day;
                    return (
                      <div
                        key={day}
                        className={cn(
                          'flex-1 min-w-[85px] md:min-w-[110px] py-2 md:py-2.5 text-center border-r last:border-r-0 cursor-pointer transition-colors duration-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.06]',
                          isDayHidden && 'opacity-30',
                          selectedDay === day && 'bg-primary/5',
                        )}
                        onClick={() => setSelectedDay(selectedDay === day ? 'all' : day)}
                      >
                        <p className={cn(
                          'text-[10px] md:text-xs font-semibold uppercase tracking-wider',
                          selectedDay === day ? 'text-primary' : 'text-muted-foreground',
                        )}>
                          {day.slice(0, 3)}
                        </p>
                        {daySchedules.length > 0 && (
                          <p className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5">{daySchedules.length}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Time grid body */}
                <div className="relative flex" style={{ height: `${totalGridHeight}px` }}>
                  {/* Time gutter */}
                  <div className="w-12 md:w-16 shrink-0 border-r relative">
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                      const hour = MIN_HOUR + i;
                      return (
                        <div
                          key={hour}
                          className="absolute right-1 md:right-2 text-[8px] md:text-[10px] text-muted-foreground font-medium -translate-y-1/2"
                          style={{ top: `${i * SLOT_HEIGHT}px` }}
                        >
                          {formatTime12Hour(`${String(hour).padStart(2, '0')}:00`)}
                        </div>
                      );
                    })}
                  </div>

                  {/* Day columns */}
                  {DAYS.map((day) => {
                    const layoutInfo = dayLayouts.get(day);
                    const isDayHidden = selectedDay !== 'all' && selectedDay !== day;

                    return (
                      <div
                        key={day}
                        className={cn(
                          'flex-1 min-w-[110px] relative border-r last:border-r-0 transition-opacity duration-200',
                          isDayHidden && 'opacity-15 pointer-events-none',
                        )}
                      >
                        {/* Hour grid lines */}
                        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
                          <div
                            key={i}
                            className="absolute left-0 right-0 border-t border-border/30"
                            style={{ top: `${i * SLOT_HEIGHT}px` }}
                          />
                        ))}

                        {/* Half-hour dashed lines */}
                        {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                          <div
                            key={`half-${i}`}
                            className="absolute left-0 right-0 border-t border-dashed border-border/15"
                            style={{ top: `${i * SLOT_HEIGHT + SLOT_HEIGHT / 2}px` }}
                          />
                        ))}

                        {/* Schedule cards */}
                        {layoutInfo?.items.map((item) => {
                          if (item.hidden) return null;
                          const colorIndex = colorMap.get(item.schedule.subjectId) || 0;
                          const color = CARD_COLORS[colorIndex];
                          const top = getTopOffset(item.schedule.startTime);
                          const height = getCardHeight(item.schedule.startTime, item.schedule.endTime);

                          return (
                            <ScheduleCard
                              key={item.schedule.id}
                              schedule={item.schedule}
                              color={color}
                              top={top}
                              height={height}
                              col={item.col}
                              totalCols={item.totalCols}
                              onClick={() => setSelectedSchedule(item.schedule)}
                              hidden={false}
                            />
                          );
                        })}

                        {/* "+N more" overflow indicator */}
                        {layoutInfo && layoutInfo.hiddenCount > 0 && (
                          <OverlapOverflowCard
                            count={layoutInfo.hiddenCount}
                            top={layoutInfo.overflowTop}
                            height={layoutInfo.overflowHeight}
                            col={layoutInfo.items.length > 0 ? Math.min(MAX_VISIBLE_OVERLAPS, layoutInfo.items.filter(i => !i.hidden).length) : 0}
                            totalCols={layoutInfo.items.length > 0 ? (layoutInfo.items[0]?.totalCols || 1) : 1}
                            onClick={() => {
                              // Show first hidden schedule in dialog
                              const hidden = layoutInfo.items.find(i => i.hidden);
                              if (hidden) setSelectedSchedule(hidden.schedule);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Current time indicator */}
                <CurrentTimeIndicator />
              </div>
            </div>
        </CardContent>
      </Card>

      {/* ── Mobile list view for selected day ──────────────────────── */}
      <AnimatePresence>
        {selectedDay !== 'all' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden space-y-2 print:hidden overflow-hidden"
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {selectedDay} — {(schedulesByDay.get(selectedDay) || []).length} classes
              </h3>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedDay('all')}>
                Show all
              </Button>
            </div>
            {(schedulesByDay.get(selectedDay as DayOfWeek) || [])
              .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
              .map(schedule => {
                const colorIndex = colorMap.get(schedule.subjectId) || 0;
                const color = CARD_COLORS[colorIndex];
                const isConflict = schedule.status === 'conflict';
                return (
                  <motion.div
                    key={schedule.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className={cn(
                      'rounded-xl border p-3.5 cursor-pointer transition-all duration-200',
                      'hover:shadow-md active:scale-[0.98]',
                      'hover:brightness-[0.96] dark:hover:brightness-[0.9]',
                      'border-l-[4px]',
                      color.bg,
                      color.border,
                      isConflict && 'ring-2 ring-red-400 dark:ring-red-500',
                    )}
                    onClick={() => setSelectedSchedule(schedule)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('w-3 h-3 rounded-full shrink-0 mt-1', color.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={cn('font-bold text-sm', color.text)}>
                              {schedule.subject?.subjectCode}
                            </p>
                            <p className={cn('text-xs mt-0.5', color.text, 'opacity-80')}>
                              {schedule.subject?.subjectName}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isConflict && (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime12Hour(schedule.startTime)} – {formatTime12Hour(schedule.endTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {schedule.faculty?.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {schedule.room?.roomName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {schedule.section?.sectionName}
                          </span>
                        </div>
                        {schedule.subject?.department && (
                          <p className="text-[11px] text-muted-foreground mt-1 opacity-70">
                            {schedule.subject.department.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status Legend ───────────────────────────────────────────── */}
      <Card className="print:hidden">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-muted-foreground">Status:</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Approved</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Generated</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Modified</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Conflict</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Schedule Detail Dialog (Red Brand — Always Red Header) ──── */}
      <Dialog open={!!selectedSchedule} onOpenChange={(open) => !open && setSelectedSchedule(null)}>
        {selectedSchedule && (() => {
          const isConflict = selectedSchedule.status === 'conflict';
          const isApproved = selectedSchedule.status === 'approved';

          return (
            <DialogContent
              className="!p-0 !gap-0 !overflow-hidden !rounded-xl sm:!rounded-2xl !border-0 !shadow-xl dark:!shadow-2xl w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] sm:max-h-none flex flex-col"
              showCloseButton={false}
            >
              {/* ── Header — ALWAYS RED in both modes ─────────────── */}
              <div className={cn(
                'relative p-4 sm:p-6 flex-shrink-0 space-y-3 sm:space-y-3.5',
                // Light: #C0392B, Dark: #9B2218 (darker red, not dark surface)
                'bg-[#C0392B] dark:bg-[#9B2218]',
                'transition-colors duration-300',
              )}>
                {/* Close button — frosted white pill on red */}
                <button
                  onClick={() => setSelectedSchedule(null)}
                  className={cn(
                    'absolute top-3 sm:top-4 right-3 sm:right-4',
                    'flex items-center justify-center h-7 sm:h-8 w-7 sm:w-8 rounded-full',
                    'bg-white/20 backdrop-blur-md border border-white/20',
                    'text-white/80 hover:text-white hover:bg-white/30',
                    'transition-all duration-200',
                  )}
                >
                  <X className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
                </button>

                {/* Icon + Title row */}
                <div className="flex items-start gap-3 sm:gap-4 pr-10">
                  {/* Icon container — semi-transparent white square */}
                  <div className={cn(
                    'w-10 sm:w-12 h-10 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0',
                    'bg-white/20 backdrop-blur-sm border border-white/15',
                  )}>
                    <BookOpen className="h-4 sm:h-5 w-4 sm:w-5 text-white" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <DialogTitle className="!text-sm sm:!text-lg !font-bold !text-white !leading-tight truncate">
                      {selectedSchedule.subject?.subjectName || 'Unknown Subject'}
                    </DialogTitle>
                    <DialogDescription className="!text-white/60 !mt-0.5 sm:!mt-1 !text-xs sm:!text-sm">
                      {selectedSchedule.subject?.subjectCode}
                      {selectedSchedule.section?.sectionName && ` · ${selectedSchedule.section.sectionName}`}
                    </DialogDescription>
                  </div>
                </div>

                {/* Quick Info Pills — same style in both modes (on red header) */}
                <div className="flex flex-wrap gap-2">
                  <QuickPill icon={<Clock className="h-2.5 sm:h-3 w-2.5 sm:w-3" />}>
                    <span className="text-xs sm:text-sm">{formatTime12Hour(selectedSchedule.startTime)} – {formatTime12Hour(selectedSchedule.endTime)}</span>
                  </QuickPill>
                  <QuickPill icon={<CalendarIcon className="h-2.5 sm:h-3 w-2.5 sm:w-3" />}>
                    <span className="text-xs sm:text-sm">{selectedSchedule.day}</span>
                  </QuickPill>
                  {/* Approved pill: red-tinted border to distinguish */}
                  <QuickPill
                    icon={<CheckCircle className="h-2.5 sm:h-3 w-2.5 sm:w-3" />}
                    className={cn(
                      // Approved: subtle red-tinted border accent
                      isApproved && 'border-red-300/50 bg-white/25',
                      // Conflict: stronger red tint
                      isConflict && 'border-red-300/50 bg-red-400/30',
                      // Generated
                      selectedSchedule.status === 'generated' && 'border-sky-300/30',
                      // Modified
                      selectedSchedule.status === 'modified' && 'border-amber-300/30',
                    )}
                  >
                    <span className="text-xs sm:text-sm">{selectedSchedule.status}</span>
                  </QuickPill>
                </div>
              </div>

              {/* ── Body ─────────────────────────────────────────────── */}
              <div className={cn(
                'p-4 sm:p-6 space-y-5 overflow-y-auto flex-1',
                // Light: white, Dark: #393E46
                'bg-white dark:bg-[#393E46]',
                'transition-colors duration-300',
              )}>
                {/* Information Card Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InfoTile
                    icon={<User className="h-3.5 sm:h-4 w-3.5 sm:w-4" />}
                    label="Faculty"
                    value={selectedSchedule.faculty?.name || 'N/A'}
                  />
                  <InfoTile
                    icon={<MapPin className="h-3.5 sm:h-4 w-3.5 sm:w-4" />}
                    label="Room"
                    value={selectedSchedule.room?.roomName || 'N/A'}
                  />
                </div>

                {/* Full-width building tile */}
                {selectedSchedule.room?.building && (
                  <InfoTile
                    icon={<Building2 className="h-3.5 sm:h-4 w-3.5 sm:w-4" />}
                    label="Building"
                    value={selectedSchedule.room.building}
                  />
                )}

                {/* Extra info row: Section + Department */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InfoTile
                    icon={<Users className="h-3.5 sm:h-4 w-3.5 sm:w-4" />}
                    label="Section"
                    value={selectedSchedule.section?.sectionName || 'N/A'}
                    className={!selectedSchedule.subject?.department && !selectedSchedule.faculty?.department ? 'md:col-span-2' : ''}
                  />
                  {(selectedSchedule.subject?.department || selectedSchedule.faculty?.department) && (
                    <InfoTile
                      icon={selectedSchedule.subject?.department ? <GraduationCap className="h-3.5 sm:h-4 w-3.5 sm:w-4" /> : <Layers className="h-3.5 sm:h-4 w-3.5 sm:w-4" />}
                      label="Department"
                      value={selectedSchedule.subject?.department?.name || selectedSchedule.faculty?.department?.name || ''}
                    />
                  )}
                </div>

                {/* Conflict warning */}
                {isConflict && (
                  <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-red-50 dark:bg-[rgba(185,28,28,0.08)] border border-red-200/60 dark:border-white/[0.08]">
                    <AlertTriangle className="h-3.5 sm:h-4 w-3.5 sm:w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-red-700 dark:text-red-400">Schedule Conflict</p>
                      <p className="text-[11px] sm:text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                        This schedule conflicts with another assignment. Check the conflicts page for details.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Footer Actions ────────────────────────────────────── */}
              <div className={cn(
                'px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-end gap-3 flex-shrink-0',
                'border-t border-gray-100 dark:border-white/[0.08]',
                'bg-white dark:bg-[#393E46]',
                'transition-colors duration-300',
              )}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs sm:text-sm text-gray-500 dark:text-[#9CA3AF] hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-lg px-3 sm:px-4 h-8 sm:h-9"
                  onClick={() => setSelectedSchedule(null)}
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    'text-xs sm:text-sm rounded-lg px-4 sm:px-5 text-white font-medium h-8 sm:h-9',
                    'transition-all duration-200',
                    // Red CTA — same red family as header
                    'bg-[#C0392B] hover:bg-[#A93226]',
                    'dark:bg-[#9B2218] dark:hover:bg-[#7E1B12]',
                  )}
                  onClick={() => {
                    setSelectedSchedule(null);
                  }}
                >
                  <Eye className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1" />
                  <span className="hidden xs:inline">View Full Details</span>
                  <span className="xs:hidden">Details</span>
                </Button>
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>
    </motion.div>
  );
}
