'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Layers, X, ChevronRight, Palette,
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
// hoverBg uses neutral soft overlays instead of color-intensified shades
// Light: subtle dark overlay (black/5) for depth
// Dark: soft white overlay (white/10) for luminance
const CARD_COLORS = [
  { bg: 'bg-emerald-100 dark:bg-emerald-950/50', border: 'border-emerald-400 dark:border-emerald-700', text: 'text-emerald-900 dark:text-emerald-100', accent: 'bg-emerald-500', dot: 'bg-emerald-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-sky-100 dark:bg-sky-950/50', border: 'border-sky-400 dark:border-sky-700', text: 'text-sky-900 dark:text-sky-100', accent: 'bg-sky-500', dot: 'bg-sky-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-violet-100 dark:bg-violet-950/50', border: 'border-violet-400 dark:border-violet-700', text: 'text-violet-900 dark:text-violet-100', accent: 'bg-violet-500', dot: 'bg-violet-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-amber-100 dark:bg-amber-950/50', border: 'border-amber-400 dark:border-amber-700', text: 'text-amber-900 dark:text-amber-100', accent: 'bg-amber-500', dot: 'bg-amber-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-rose-100 dark:bg-rose-950/50', border: 'border-rose-400 dark:border-rose-700', text: 'text-rose-900 dark:text-rose-100', accent: 'bg-rose-500', dot: 'bg-rose-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-teal-100 dark:bg-teal-950/50', border: 'border-teal-400 dark:border-teal-700', text: 'text-teal-900 dark:text-teal-100', accent: 'bg-teal-500', dot: 'bg-teal-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-orange-100 dark:bg-orange-950/50', border: 'border-orange-400 dark:border-orange-700', text: 'text-orange-900 dark:text-orange-100', accent: 'bg-orange-500', dot: 'bg-orange-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-cyan-100 dark:bg-cyan-950/50', border: 'border-cyan-400 dark:border-cyan-700', text: 'text-cyan-900 dark:text-cyan-100', accent: 'bg-cyan-500', dot: 'bg-cyan-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-950/50', border: 'border-fuchsia-400 dark:border-fuchsia-700', text: 'text-fuchsia-900 dark:text-fuchsia-100', accent: 'bg-fuchsia-500', dot: 'bg-fuchsia-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-lime-100 dark:bg-lime-950/50', border: 'border-lime-400 dark:border-lime-700', text: 'text-lime-900 dark:text-lime-100', accent: 'bg-lime-500', dot: 'bg-lime-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-pink-100 dark:bg-pink-950/50', border: 'border-pink-400 dark:border-pink-700', text: 'text-pink-900 dark:text-pink-100', accent: 'bg-pink-500', dot: 'bg-pink-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
  { bg: 'bg-yellow-100 dark:bg-yellow-950/50', border: 'border-yellow-400 dark:border-yellow-700', text: 'text-yellow-900 dark:text-yellow-100', accent: 'bg-yellow-500', dot: 'bg-yellow-500', hoverBg: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]' },
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
            'absolute rounded-lg overflow-hidden cursor-pointer',
            'transition-all duration-200 ease-in-out group/card',
            'hover:z-20 hover:shadow-md hover:scale-[1.015]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'border-l-[3px]',
            color.bg,
            color.border,
            color.hoverBg,
            isConflict && 'ring-2 ring-red-400 dark:ring-red-500 ring-offset-1 dark:ring-offset-background animate-pulse',
          )}
          style={{
            top: `${top}px`,
            height: `${effectiveHeight}px`,
            left: `calc(${leftPercent}% + 1px)`,
            width: `calc(${widthPercent}% - 2px)`,
          }}
        >
          <div className={cn('flex flex-col h-full p-1.5 text-left gap-0.5', color.text)}>
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
      <TooltipContent side="top" className="max-w-xs p-2 z-50" sideOffset={6}>
        <div className="space-y-1 text-xs">
          <div className="font-bold">{getSubjectLabel(schedule)} — {getSubjectName(schedule)}</div>
          <div className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime12Hour(schedule.startTime)} – {formatTime12Hour(schedule.endTime)}</div>
          <div className="text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{schedule.faculty?.name}</div>
          <div className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{schedule.room?.roomName}{schedule.room?.building ? ` (${schedule.room.building})` : ''}</div>
          <div className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{schedule.section?.sectionName}</div>
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
        'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700',
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

// ─── Detail Item helper ───────────────────────────────────────────────
function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Status Badge helper ──────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const variant = status === 'conflict' ? 'destructive' : 'outline';
  const extraClass = cn(
    status === 'approved' && 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700',
    status === 'generated' && 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-700',
    status === 'modified' && 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700',
  );
  return <Badge variant={variant} className={cn('shrink-0', extraClass)}>{status}</Badge>;
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
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [faculty, setFaculty] = useState<UserType[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Fetch data on mount and when lastRefresh changes (after generation)
  useEffect(() => {
    if (session?.user) {
      fetchData();
    }
  }, [session?.user, lastRefresh]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [schedulesRes, usersRes, sectionsRes, roomsRes] = await Promise.all([
        fetch('/api/schedules'),
        fetch('/api/users?role=faculty'),
        fetch('/api/sections'),
        fetch('/api/rooms'),
      ]);

      const schedulesData = await safeJson<Schedule[]>(schedulesRes);
      const usersData = await safeJson<UserType[]>(usersRes);
      const sectionsData = await safeJson<Section[]>(sectionsRes);
      const roomsData = await safeJson<Room[]>(roomsRes);

      setSchedules(Array.isArray(schedulesData) ? schedulesData : []);
      setFaculty(Array.isArray(usersData) ? usersData : []);
      setSections(Array.isArray(sectionsData) ? sectionsData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      setSchedules([]);
      setFaculty([]);
      setSections([]);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
          <div className="overflow-x-auto">
            <ScrollArea className="w-full" style={{ height: 'calc(100vh - 340px)', minHeight: '500px' }} ref={scrollRef}>
              <div className="min-w-[780px]">
                {/* Day headers row */}
                <div className="sticky top-0 z-10 flex border-b bg-card/95 backdrop-blur-sm">
                  {/* Time gutter */}
                  <div className="w-16 shrink-0 border-r bg-muted/30" />
                  {DAYS.map((day) => {
                    const daySchedules = schedulesByDay.get(day) || [];
                    const isDayHidden = selectedDay !== 'all' && selectedDay !== day;
                    return (
                      <div
                        key={day}
                        className={cn(
                          'flex-1 min-w-[110px] py-2.5 text-center border-r last:border-r-0 cursor-pointer transition-colors duration-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.06]',
                          isDayHidden && 'opacity-30',
                          selectedDay === day && 'bg-primary/5',
                        )}
                        onClick={() => setSelectedDay(selectedDay === day ? 'all' : day)}
                      >
                        <p className={cn(
                          'text-xs font-semibold uppercase tracking-wider',
                          selectedDay === day ? 'text-primary' : 'text-muted-foreground',
                        )}>
                          {day.slice(0, 3)}
                        </p>
                        {daySchedules.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{daySchedules.length}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Time grid body */}
                <div className="relative flex" style={{ height: `${totalGridHeight}px` }}>
                  {/* Time gutter */}
                  <div className="w-16 shrink-0 border-r relative">
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                      const hour = MIN_HOUR + i;
                      return (
                        <div
                          key={hour}
                          className="absolute right-2 text-[10px] text-muted-foreground font-medium -translate-y-1/2"
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
            </ScrollArea>
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
                      'border-l-[4px]',
                      color.bg,
                      color.border,
                      color.hoverBg,
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
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Approved</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Generated</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Modified</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Conflict</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Schedule Detail Dialog ─────────────────────────────────── */}
      <Dialog open={!!selectedSchedule} onOpenChange={(open) => !open && setSelectedSchedule(null)}>
        {selectedSchedule && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  CARD_COLORS[colorMap.get(selectedSchedule.subjectId) || 0].bg,
                )}>
                  <BookOpen className={cn('h-5 w-5', CARD_COLORS[colorMap.get(selectedSchedule.subjectId) || 0].text)} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg">
                    {selectedSchedule.subject?.subjectName || 'Unknown Subject'}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5">
                    {selectedSchedule.subject?.subjectCode} • {selectedSchedule.day}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedSchedule.status} />
                {selectedSchedule.section?.yearLevel && (
                  <Badge variant="outline" className="text-xs">
                    <GraduationCap className="h-3 w-3 mr-1" />
                    Year {selectedSchedule.section.yearLevel}
                  </Badge>
                )}
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailItem
                  icon={<User className="h-4 w-4" />}
                  label="Faculty"
                  value={selectedSchedule.faculty?.name || 'N/A'}
                />
                {selectedSchedule.faculty?.department && (
                  <DetailItem
                    icon={<Building2 className="h-4 w-4" />}
                    label="Faculty Dept"
                    value={selectedSchedule.faculty.department.name}
                  />
                )}
                <DetailItem
                  icon={<MapPin className="h-4 w-4" />}
                  label="Room"
                  value={selectedSchedule.room?.roomName || 'N/A'}
                />
                {selectedSchedule.room?.building && (
                  <DetailItem
                    icon={<Building2 className="h-4 w-4" />}
                    label="Building"
                    value={selectedSchedule.room.building}
                  />
                )}
                <DetailItem
                  icon={<Users className="h-4 w-4" />}
                  label="Section"
                  value={selectedSchedule.section?.sectionName || 'N/A'}
                />
                <DetailItem
                  icon={<Clock className="h-4 w-4" />}
                  label="Time"
                  value={`${formatTime12Hour(selectedSchedule.startTime)} – ${formatTime12Hour(selectedSchedule.endTime)}`}
                />
                <DetailItem
                  icon={<CalendarIcon className="h-4 w-4" />}
                  label="Day"
                  value={selectedSchedule.day}
                />
                {selectedSchedule.subject?.department && (
                  <DetailItem
                    icon={<Layers className="h-4 w-4" />}
                    label="Department"
                    value={selectedSchedule.subject.department.name}
                  />
                )}
              </div>

              {/* Conflict warning */}
              {selectedSchedule.status === 'conflict' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Schedule Conflict</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                      This schedule conflicts with another assignment. Please check the conflicts page for details.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedSchedule(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </motion.div>
  );
}
