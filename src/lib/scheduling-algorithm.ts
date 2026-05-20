/**
 * TCU Scheduling System - Preference-Aware Schedule Generation Algorithm
 * 
 * This implements a Constraint Satisfaction Problem (CSP) approach with:
 * - Proper backtracking with intelligent pruning
 * - Constraint propagation (forward checking)
 * - Heuristic optimization (MRV, LCV)
 * - Multi-objective scoring with HEAVY preference weighting
 * - Two-phase candidate generation (preference-first, then fallback)
 * - Faculty subject preference prioritization in eligible faculty sorting
 * - Preference violation warnings in violation detection
 * - Comprehensive preference match rate tracking and debug logging
 * - Support for flexible time slots
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface Faculty {
  id: string;
  name: string;
  specialization: string[];
  maxUnits: number;
  departmentId: string | null;
  preferences?: FacultyPreference;
}

export interface FacultyPreference {
  preferredDays: string[];
  preferredTimeStart: string;
  preferredTimeEnd: string;
  preferredSubjects: string[];
  unavailableDays?: string[];
  notes?: string;
}

export interface Subject {
  id: string;
  subjectCode: string;
  subjectName: string;
  units: number;
  departmentId: string;
  requiredSpecialization: string[];
  requiredEquipment?: string[];
  yearLevel?: number; // Target year level for this subject
  hoursPerWeek?: number; // Contact hours per week
}

export interface Room {
  id: string;
  roomName: string;
  capacity: number;
  equipment: string[];
  building: string;
}

export interface Section {
  id: string;
  sectionName: string;
  yearLevel: number;
  studentCount: number;
  departmentId: string;
}

export interface CurriculumEntry {
  subjectId: string;
  sectionId: string;
  semester?: string;
  isRequired: boolean;
}

export interface TimeSlot {
  day: string;
  start: string;
  end: string;
}

export interface ScheduleAssignment {
  id: string;
  subjectId: string;
  facultyId: string;
  sectionId: string;
  roomId: string;
  day: string;
  startTime: string;
  endTime: string;
  status: 'approved' | 'generated' | 'conflict';
  score?: number;
}

export interface ConstraintViolation {
  type: 'faculty_double_booking' | 'room_double_booking' | 'section_overlap' | 
        'capacity_exceeded' | 'equipment_missing' | 'specialization_mismatch' |
        'unit_overload' | 'preference_violation' | 'duplicate_subject_section';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  scheduleIds: string[];
}

export interface GenerationResult {
  success: boolean;
  schedules: ScheduleAssignment[];
  violations: ConstraintViolation[];
  unassigned: UnassignedItem[];
  stats: GenerationStats;
}

export interface UnassignedItem {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  reason: string;
}

export interface GenerationStats {
  totalSlots: number;
  assignedSlots: number;
  assignmentRate: number;
  averageFacultyLoad: number;
  averageRoomUtilization: number;
  preferenceMatchRate: number;
  generationTimeMs: number;
  backtrackCount: number;
  skippedCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WORK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

// Time slots from 7:00 AM to 9:00 PM
export const TIME_RANGES = {
  START: '07:00',
  END: '21:00',
  MORNING_START: '07:00',
  MORNING_END: '12:00',
  AFTERNOON_START: '13:00',
  AFTERNOON_END: '18:00',
  EVENING_START: '18:00',
  EVENING_END: '21:00',
};

// Weight factors for scoring - PREFERENCES DOMINATE
// Preferences are treated as near-hard constraints with massive scoring boosts
const WEIGHTS = {
  FACULTY_PREFERENCE: 0.45,  // DOMINANT - preferences drive assignment quality
  LOAD_BALANCE: 0.15,        // Still important but secondary to preferences
  ROOM_EFFICIENCY: 0.08,     // Reduced - less critical
  TIME_QUALITY: 0.07,        // Reduced
  DAY_DISTRIBUTION: 0.08,    // Reduced
  BACKTRACK_PENALTY: 0.05,   // Reduced
};

// Preference scoring values - these make preference matches score MUCH higher
const PREF_SCORES = {
  PREFERRED_DAY: 10.0,       // Massive bonus for matching preferred day
  PREFERRED_TIME: 8.0,       // Large bonus for matching preferred time range
  PREFERRED_SUBJECT: 12.0,   // Largest bonus for matching preferred subject
  PARTIAL_TIME: 4.0,         // Partial time overlap bonus
  NON_PREFERRED_DAY: -5.0,   // Penalty for non-preferred day
  OUTSIDE_PREFERRED_TIME: -3.0, // Penalty for outside preferred time
  UNAVAILABLE_DAY: -20.0,    // Severe penalty for unavailable day
};

// Standard class durations (in hours) based on units
const UNIT_TO_HOURS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  const start1 = timeToMinutes(s1);
  const end1 = timeToMinutes(e1);
  const start2 = timeToMinutes(s2);
  const end2 = timeToMinutes(e2);
  return start1 < end2 && end1 > start2;
}

function parseJSON<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate class duration based on units
 * Rules:
 * - 1 unit = 1 hour
 * - 2 units = 2 hours
 * - 3+ units = typically split into multiple meetings
 * - For now, we schedule the full hours per week
 */
function calculateDurationHours(subject: Subject): number {
  // If hours per week is specified, use that
  if (subject.hoursPerWeek && subject.hoursPerWeek > 0) {
    return subject.hoursPerWeek;
  }
  
  // Otherwise, calculate from units
  // Standard: 1 unit = 1 hour of lecture per week
  const units = subject.units || 3;
  return UNIT_TO_HOURS[units] || Math.min(units, 5); // Cap at 5 hours
}

/**
 * Determine how many meetings per week for a subject
 * Common patterns:
 * - 3-unit subjects: 1 meeting of 3 hours OR 2 meetings of 1.5 hours
 * - For simplicity, we do 1 meeting per subject per week
 */
function calculateMeetingsPerWeek(subject: Subject): number {
  // Default: 1 meeting per week
  return 1;
}

// ============================================================================
// PREFERENCE HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a given day is in the faculty's preferred days list
 */
function isPreferredDay(faculty: Faculty, day: string): boolean {
  if (!faculty.preferences?.preferredDays) return false;
  if (faculty.preferences.preferredDays.length === 0) return false;
  return faculty.preferences.preferredDays.includes(day);
}

/**
 * Check if a given time slot falls within the faculty's preferred time range
 * A slot matches if its start >= preferred start AND its end <= preferred end
 */
function isPreferredTime(faculty: Faculty, start: string, end: string): boolean {
  if (!faculty.preferences) return false;
  if (!faculty.preferences.preferredTimeStart || !faculty.preferences.preferredTimeEnd) return false;
  
  const prefStart = timeToMinutes(faculty.preferences.preferredTimeStart);
  const prefEnd = timeToMinutes(faculty.preferences.preferredTimeEnd);
  const slotStart = timeToMinutes(start);
  const slotEnd = timeToMinutes(end);
  
  // Full containment within preferred time range
  return slotStart >= prefStart && slotEnd <= prefEnd;
}

/**
 * Check if a given time slot partially overlaps with the faculty's preferred time range
 */
function isPartialPreferredTime(faculty: Faculty, start: string, end: string): boolean {
  if (!faculty.preferences) return false;
  if (!faculty.preferences.preferredTimeStart || !faculty.preferences.preferredTimeEnd) return false;
  
  const prefStart = timeToMinutes(faculty.preferences.preferredTimeStart);
  const prefEnd = timeToMinutes(faculty.preferences.preferredTimeEnd);
  const slotStart = timeToMinutes(start);
  const slotEnd = timeToMinutes(end);
  
  // Partial overlap: some part of the slot is within preferred range
  return (slotStart >= prefStart || slotEnd <= prefEnd) &&
         !(slotStart >= prefStart && slotEnd <= prefEnd);
}

/**
 * Check if a given subject is in the faculty's preferred subjects list
 */
function isPreferredSubject(faculty: Faculty, subjectId: string): boolean {
  if (!faculty.preferences?.preferredSubjects) return false;
  if (faculty.preferences.preferredSubjects.length === 0) return false;
  return faculty.preferences.preferredSubjects.includes(subjectId);
}

/**
 * Check if a faculty member has any preferences set at all
 */
function facultyHasPreferences(faculty: Faculty): boolean {
  if (!faculty.preferences) return false;
  const prefs = faculty.preferences;
  return (
    (prefs.preferredDays && prefs.preferredDays.length > 0) ||
    !!prefs.preferredTimeStart ||
    !!prefs.preferredTimeEnd ||
    (prefs.preferredSubjects && prefs.preferredSubjects.length > 0)
  );
}

// ============================================================================
// CONSTRAINT CHECKERS
// ============================================================================

interface ConstraintContext {
  assignments: ScheduleAssignment[];
  faculty: Map<string, Faculty>;
  rooms: Map<string, Room>;
  sections: Map<string, Section>;
  subjects: Map<string, Subject>;
  facultyLoad: Map<string, number>;
  facultyDayLoad: Map<string, Map<string, number>>;
  roomDayUsage: Map<string, Map<string, Array<{start: string, end: string}>>>;
  sectionDayUsage: Map<string, Map<string, Array<{start: string, end: string}>>>;
  sectionSubjects: Map<string, Set<string>>; // Track subjects assigned to each section
  globalDayCount: Map<string, number>; // Track total schedules per day for balancing
}

function createConstraintContext(
  faculty: Faculty[],
  rooms: Room[],
  sections: Section[],
  subjects: Subject[]
): ConstraintContext {
  const ctx: ConstraintContext = {
    assignments: [],
    faculty: new Map(faculty.map(f => [f.id, f])),
    rooms: new Map(rooms.map(r => [r.id, r])),
    sections: new Map(sections.map(s => [s.id, s])),
    subjects: new Map(subjects.map(s => [s.id, s])),
    facultyLoad: new Map(faculty.map(f => [f.id, 0])),
    facultyDayLoad: new Map(faculty.map(f => [f.id, new Map(DAYS.map(d => [d, 0]))])),
    roomDayUsage: new Map(rooms.map(r => [r.id, new Map(DAYS.map(d => [d, []]))])),
    sectionDayUsage: new Map(sections.map(s => [s.id, new Map(DAYS.map(d => [d, []]))])),
    sectionSubjects: new Map(sections.map(s => [s.id, new Set<string>()])),
    globalDayCount: new Map(WORK_DAYS.map(d => [d, 0])),
  };
  return ctx;
}

function checkFacultyAvailability(
  ctx: ConstraintContext,
  facultyId: string,
  day: string,
  start: string,
  end: string
): boolean {
  const assignments = ctx.assignments.filter(a => 
    a.facultyId === facultyId && a.day === day
  );
  return !assignments.some(a => timesOverlap(a.startTime, a.endTime, start, end));
}

function checkRoomAvailability(
  ctx: ConstraintContext,
  roomId: string,
  day: string,
  start: string,
  end: string
): boolean {
  const assignments = ctx.assignments.filter(a => 
    a.roomId === roomId && a.day === day
  );
  return !assignments.some(a => timesOverlap(a.startTime, a.endTime, start, end));
}

function checkSectionAvailability(
  ctx: ConstraintContext,
  sectionId: string,
  day: string,
  start: string,
  end: string
): boolean {
  const assignments = ctx.assignments.filter(a => 
    a.sectionId === sectionId && a.day === day
  );
  return !assignments.some(a => timesOverlap(a.startTime, a.endTime, start, end));
}

function checkFacultyCapacity(
  ctx: ConstraintContext,
  facultyId: string,
  additionalUnits: number
): boolean {
  const faculty = ctx.faculty.get(facultyId);
  if (!faculty) return false;
  const currentLoad = ctx.facultyLoad.get(facultyId) || 0;
  return currentLoad + additionalUnits <= faculty.maxUnits;
}

function checkSpecialization(
  ctx: ConstraintContext,
  facultyId: string,
  subjectId: string
): boolean {
  const faculty = ctx.faculty.get(facultyId);
  const subject = ctx.subjects.get(subjectId);
  if (!faculty || !subject) return false;
  
  // If subject has no specialization requirements, anyone can teach
  if (subject.requiredSpecialization.length === 0) return true;
  
  // If faculty has no specializations, allow them to teach (new faculty)
  if (faculty.specialization.length === 0) return true;
  
  // Check if faculty has at least one required specialization
  return subject.requiredSpecialization.some(spec => faculty.specialization.includes(spec));
}

function checkRoomCapacity(
  ctx: ConstraintContext,
  roomId: string,
  sectionId: string
): boolean {
  const room = ctx.rooms.get(roomId);
  const section = ctx.sections.get(sectionId);
  if (!room || !section) return false;
  return room.capacity >= section.studentCount;
}

function checkRoomEquipment(
  ctx: ConstraintContext,
  roomId: string,
  subjectId: string
): boolean {
  const room = ctx.rooms.get(roomId);
  const subject = ctx.subjects.get(subjectId);
  if (!room || !subject) return true;
  
  const requiredEquipment = subject.requiredEquipment || [];
  if (requiredEquipment.length === 0) return true;
  return requiredEquipment.every(eq => room.equipment.includes(eq));
}

/**
 * Check if subject is already assigned to this section
 * Prevents duplicate subject-section assignments
 */
function checkSubjectNotDuplicate(
  ctx: ConstraintContext,
  subjectId: string,
  sectionId: string
): boolean {
  const assignedSubjects = ctx.sectionSubjects.get(sectionId);
  return !assignedSubjects || !assignedSubjects.has(subjectId);
}

/**
 * Check faculty unavailable days
 */
function checkFacultyUnavailableDay(
  ctx: ConstraintContext,
  facultyId: string,
  day: string
): boolean {
  const faculty = ctx.faculty.get(facultyId);
  if (!faculty?.preferences?.unavailableDays) return true;
  return !faculty.preferences.unavailableDays.includes(day);
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Score faculty preference match with MASSIVE weight differences.
 * 
 * Preference matching candidates score MUCH higher than non-matching:
 * - All prefs matched: up to +30.0 raw score
 * - Partial match: moderate positive score  
 * - No match: up to -8.0 raw score
 * - No preferences set: neutral 0.5
 */
function scoreFacultyPreference(
  ctx: ConstraintContext,
  facultyId: string,
  day: string,
  start: string,
  end: string,
  subjectId: string
): number {
  const faculty = ctx.faculty.get(facultyId);
  if (!faculty?.preferences) return 0.5; // Neutral score if no preferences
  
  // If preferences exist but are all empty, return neutral
  if (!facultyHasPreferences(faculty)) return 0.5;
  
  let score = 0;
  const prefs = faculty.preferences;
  
  // === PREFERRED SUBJECT: +12.0 (highest single bonus) ===
  if (prefs.preferredSubjects && prefs.preferredSubjects.length > 0) {
    if (prefs.preferredSubjects.includes(subjectId)) {
      score += PREF_SCORES.PREFERRED_SUBJECT;
    }
  }
  
  // === PREFERRED DAY: +10.0 bonus, -5.0 penalty ===
  if (prefs.preferredDays && prefs.preferredDays.length > 0) {
    if (prefs.preferredDays.includes(day)) {
      score += PREF_SCORES.PREFERRED_DAY;
    } else {
      score += PREF_SCORES.NON_PREFERRED_DAY;
    }
  }
  
  // === PREFERRED TIME RANGE: +8.0 full, +4.0 partial, -3.0 outside ===
  if (prefs.preferredTimeStart && prefs.preferredTimeEnd) {
    if (isPreferredTime(faculty, start, end)) {
      score += PREF_SCORES.PREFERRED_TIME;
    } else if (isPartialPreferredTime(faculty, start, end)) {
      score += PREF_SCORES.PARTIAL_TIME;
    } else {
      score += PREF_SCORES.OUTSIDE_PREFERRED_TIME;
    }
  }
  
  // === UNAVAILABLE DAY: severe penalty ===
  if (prefs.unavailableDays?.includes(day)) {
    score += PREF_SCORES.UNAVAILABLE_DAY;
  }
  
  // Normalize to 0-1 range based on possible score range (-21 to +34)
  // Shift so 0 is roughly the midpoint, then normalize
  const normalized = (score + 21) / 55;
  return Math.max(0, Math.min(1, normalized));
}

function scoreLoadBalance(
  ctx: ConstraintContext,
  facultyId: string,
  additionalUnits: number
): number {
  const faculty = ctx.faculty.get(facultyId);
  if (!faculty) return 0;
  
  const currentLoad = ctx.facultyLoad.get(facultyId) || 0;
  const newLoad = currentLoad + additionalUnits;
  const utilization = newLoad / faculty.maxUnits;
  
  // IMPORTANT: We want to BALANCE load, so we give HIGHER scores
  // to UNDER-utilized faculty to encourage assigning them more work
  
  // Calculate how far from ideal (60-80%) we are
  if (utilization <= 0.3) return 1.0;   // Very under-utilized - HIGHEST priority
  if (utilization <= 0.5) return 0.9;   // Under-utilized - high priority
  if (utilization <= 0.7) return 0.8;   // Getting to ideal range
  if (utilization <= 0.85) return 0.7;  // Ideal range
  if (utilization <= 0.95) return 0.5;  // Getting full
  return 0.3; // Nearly at capacity - lower priority
}

function scoreDayDistribution(
  ctx: ConstraintContext,
  facultyId: string,
  day: string
): number {
  const dayLoad = ctx.facultyDayLoad.get(facultyId);
  if (!dayLoad) return 0.5;
  
  const loads = Array.from(dayLoad.values());
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  const currentDayLoad = dayLoad.get(day) || 0;
  
  // Prefer adding to days with lower than average load
  if (currentDayLoad < avgLoad) return 1.0;
  if (currentDayLoad === avgLoad) return 0.8;
  return 0.6;
}

/**
 * Score based on global day balance
 * Encourages even distribution of schedules across all days
 * This prevents overloading certain days while others are empty
 */
function scoreGlobalDayBalance(
  ctx: ConstraintContext,
  day: string
): number {
  const dayCounts = Array.from(ctx.globalDayCount.values());
  const totalSchedules = dayCounts.reduce((a, b) => a + b, 0);
  
  if (totalSchedules === 0) return 0.5; // No schedules yet, neutral score
  
  const avgPerDay = totalSchedules / WORK_DAYS.length;
  const currentDayCount = ctx.globalDayCount.get(day) || 0;
  
  // Calculate how far below average this day is
  // Days with fewer schedules get higher scores to encourage balance
  const deficit = avgPerDay - currentDayCount;
  
  if (deficit > 2) return 1.0;  // Significantly under-scheduled
  if (deficit > 1) return 0.9;  // Moderately under-scheduled
  if (deficit > 0) return 0.8;  // Slightly under-scheduled
  if (deficit === 0) return 0.7; // At average
  if (deficit > -2) return 0.6; // Slightly over-scheduled
  if (deficit > -4) return 0.4; // Moderately over-scheduled
  return 0.2; // Significantly over-scheduled
}

function scoreTimeQuality(start: string, end: string): number {
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  
  // Prefer morning and early afternoon classes (8 AM - 5 PM)
  const MORNING_START = 8 * 60; // 8:00 AM
  const PRIME_END = 17 * 60; // 5:00 PM
  const LATE_END = 18 * 60; // 6:00 PM
  
  if (startMin >= MORNING_START && endMin <= PRIME_END) {
    return 1.0; // Prime time
  }
  if (startMin >= MORNING_START && endMin <= LATE_END) {
    return 0.8; // Late afternoon
  }
  if (startMin >= 7 * 60 && endMin <= 21 * 60) {
    return 0.6; // Early morning or evening
  }
  return 0.4; // Less desirable times
}

function scoreRoomEfficiency(
  ctx: ConstraintContext,
  roomId: string,
  sectionId: string
): number {
  const room = ctx.rooms.get(roomId);
  const section = ctx.sections.get(sectionId);
  if (!room || !section) return 0;
  
  const utilization = section.studentCount / room.capacity;
  
  // Ideal room utilization is 60-85%
  if (utilization >= 0.6 && utilization <= 0.85) return 1.0;
  if (utilization >= 0.5 && utilization <= 0.9) return 0.8;
  if (utilization >= 0.3) return 0.6;
  return 0.4; // Room too large for section
}

function calculateOverallScore(
  ctx: ConstraintContext,
  facultyId: string,
  roomId: string,
  sectionId: string,
  subjectId: string,
  day: string,
  start: string,
  end: string,
  additionalUnits: number
): number {
  const preferenceScore = scoreFacultyPreference(ctx, facultyId, day, start, end, subjectId);
  const loadScore = scoreLoadBalance(ctx, facultyId, additionalUnits);
  const dayDistScore = scoreDayDistribution(ctx, facultyId, day);
  const globalDayScore = scoreGlobalDayBalance(ctx, day);
  const timeScore = scoreTimeQuality(start, end);
  const roomScore = scoreRoomEfficiency(ctx, roomId, sectionId);
  
  return (
    preferenceScore * WEIGHTS.FACULTY_PREFERENCE +
    loadScore * WEIGHTS.LOAD_BALANCE +
    dayDistScore * WEIGHTS.DAY_DISTRIBUTION +
    globalDayScore * 0.07 + // Reduced weight for global day balance
    timeScore * WEIGHTS.TIME_QUALITY +
    roomScore * WEIGHTS.ROOM_EFFICIENCY
  );
}

// ============================================================================
// SLOT GENERATION
// ============================================================================

interface SlotCandidate {
  day: string;
  start: string;
  end: string;
  timeScore: number;
}

/**
 * Generate time slot candidates for ALL work days (fallback / general use)
 * Supports different slot durations (1, 1.5, 2, 3 hours)
 */
function generateSlotCandidates(
  durationHours: number
): SlotCandidate[] {
  const candidates: SlotCandidate[] = [];
  
  // Round duration to nearest 0.5 hour
  const roundedDuration = Math.ceil(durationHours * 2) / 2;
  const durationMinutes = roundedDuration * 60;
  
  // Generate slots from 7:00 AM to 9:00 PM
  // Use 30-minute granularity for flexibility
  for (const day of WORK_DAYS) {
    for (let minutes = 7 * 60; minutes <= 21 * 60 - durationMinutes; minutes += 30) {
      const start = minutesToTime(minutes);
      const end = minutesToTime(minutes + durationMinutes);
      
      candidates.push({
        day,
        start,
        end,
        timeScore: scoreTimeQuality(start, end),
      });
    }
  }
  
  // Sort by time quality (descending)
  return candidates.sort((a, b) => b.timeScore - a.timeScore);
}

/**
 * Generate preference-aware time slot candidates for a specific faculty member.
 * 
 * Phase behavior:
 * - If the faculty has preferences and the filtered set is non-empty, return ONLY preferred slots
 * - If no preferences exist OR filtered set is empty, fall back to all slots
 * 
 * Hard filters applied:
 * - Days: only faculty's preferred days (if specified and non-empty)
 * - Time range: only slots that fit within preferred time start/end
 * - Unavailable days: always excluded (hard constraint)
 * 
 * @param durationHours - Duration of the class in hours
 * @param faculty - The faculty member to generate slots for
 * @returns Array of slot candidates filtered by preferences, or all slots as fallback
 */
function generatePreferenceAwareSlots(
  durationHours: number,
  faculty: Faculty
): SlotCandidate[] {
  const allSlots = generateSlotCandidates(durationHours);
  
  // If faculty has no preferences at all, return all slots
  if (!faculty.preferences || !facultyHasPreferences(faculty)) {
    return allSlots;
  }
  
  const prefs = faculty.preferences;
  
  // Apply HARD filters based on faculty preferences
  let filtered = allSlots.filter(slot => {
    // Always exclude unavailable days (hard constraint)
    if (prefs.unavailableDays?.includes(slot.day)) {
      return false;
    }
    
    // HARD filter: only preferred days
    if (prefs.preferredDays && prefs.preferredDays.length > 0) {
      if (!prefs.preferredDays.includes(slot.day)) {
        return false;
      }
    }
    
    // HARD filter: only preferred time range
    if (prefs.preferredTimeStart && prefs.preferredTimeEnd) {
      const prefStart = timeToMinutes(prefs.preferredTimeStart);
      const prefEnd = timeToMinutes(prefs.preferredTimeEnd);
      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);
      
      // Slot must fit entirely within preferred time range
      if (slotStart < prefStart || slotEnd > prefEnd) {
        return false;
      }
    }
    
    return true;
  });
  
  // FALLBACK: if no slots survive preference filtering, return all non-unavailable slots
  if (filtered.length === 0) {
    console.log(
      `[PREF-FALLBACK] No preference-aligned slots found for ${faculty.name}. ` +
      `Falling back to all available slots (excluding unavailable days). ` +
      `Preferred days: [${prefs.preferredDays?.join(', ') || 'none'}], ` +
      `Preferred time: ${prefs.preferredTimeStart || 'N/A'} - ${prefs.preferredTimeEnd || 'N/A'}`
    );
    
    filtered = allSlots.filter(slot => {
      // Still exclude unavailable days
      if (prefs.unavailableDays?.includes(slot.day)) {
        return false;
      }
      return true;
    });
  }
  
  return filtered;
}

// ============================================================================
// CURRICULUM-BASED SUBJECT ASSIGNMENT
// ============================================================================

/**
 * Determine which subjects should be assigned to which sections
 * This is the core curriculum mapping logic
 */
function determineSubjectSectionPairs(
  sections: Map<string, Section>,
  subjects: Map<string, Subject>,
  curriculum?: CurriculumEntry[]
): Array<{ subjectId: string; sectionId: string }> {
  const pairs: Array<{ subjectId: string; sectionId: string }> = [];
  
  if (curriculum && curriculum.length > 0) {
    // Use provided curriculum mapping
    for (const entry of curriculum) {
      if (entry.isRequired) {
        pairs.push({ subjectId: entry.subjectId, sectionId: entry.sectionId });
      }
    }
  } else {
    // Auto-generate based on department and year level
    for (const [sectionId, section] of sections) {
      for (const [subjectId, subject] of subjects) {
        // Match by department
        if (subject.departmentId !== section.departmentId) continue;
        
        // Match by year level
        if (!subjectMatchesYearLevel(subject, section.yearLevel)) continue;
        
        pairs.push({ subjectId, sectionId });
      }
    }
  }
  
  return pairs;
}

/**
 * Check if a subject is appropriate for a given year level
 * Flexible matching: subjects can be assigned to sections within ±1 year level
 * This allows for:
 * - Advanced Year 1 students taking Year 2 subjects
 * - Year 4 students taking Year 3 electives
 * - Cross-year subjects like electives
 */
function subjectMatchesYearLevel(subject: Subject, sectionYearLevel: number, strictMode: boolean = false): boolean {
  // If subject has explicit year level, use that
  if (subject.yearLevel !== undefined) {
    if (strictMode) {
      return subject.yearLevel === sectionYearLevel;
    }
    // Allow ±1 year flexibility
    return Math.abs(subject.yearLevel - sectionYearLevel) <= 1;
  }
  
  // Extract year level from subject code (e.g., CS101 -> 1, CS201 -> 2, IT110 -> 1)
  // Look for the first digit sequence that could represent year level
  const match = subject.subjectCode.match(/\d(\d)?/);
  if (match) {
    // For codes like CS101, CS201, etc. - use the first digit
    const firstDigit = parseInt(subject.subjectCode.match(/\d/)?.[0] || '0');
    if (firstDigit >= 1 && firstDigit <= 5) {
      const subjectYear = firstDigit;
      
      if (strictMode) {
        return subjectYear === sectionYearLevel;
      }
      
      // Flexible: allow subjects within ±1 year level
      // Year 1 subjects (CS101) → can go to Year 1 or Year 2 sections
      // Year 2 subjects (CS201) → can go to Year 1, 2, or 3 sections
      // Year 3 subjects (CS301) → can go to Year 2, 3, or 4 sections
      // Year 4 subjects (CS401) → can go to Year 3, 4, or 5 sections
      return Math.abs(subjectYear - sectionYearLevel) <= 1;
    }
  }
  
  // If can't determine from code, check subject name patterns
  const nameLower = subject.subjectName.toLowerCase();
  if (nameLower.includes('1st year') || nameLower.includes('first year')) {
    return strictMode ? sectionYearLevel === 1 : Math.abs(1 - sectionYearLevel) <= 1;
  }
  if (nameLower.includes('2nd year') || nameLower.includes('second year')) {
    return strictMode ? sectionYearLevel === 2 : Math.abs(2 - sectionYearLevel) <= 1;
  }
  if (nameLower.includes('3rd year') || nameLower.includes('third year')) {
    return strictMode ? sectionYearLevel === 3 : Math.abs(3 - sectionYearLevel) <= 1;
  }
  if (nameLower.includes('4th year') || nameLower.includes('fourth year')) {
    return strictMode ? sectionYearLevel === 4 : Math.abs(4 - sectionYearLevel) <= 1;
  }
  if (nameLower.includes('5th year') || nameLower.includes('fifth year')) {
    return strictMode ? sectionYearLevel === 5 : Math.abs(5 - sectionYearLevel) <= 1;
  }
  
  // Check for keywords that suggest all-year applicability
  const electiveKeywords = ['elective', 'seminar', 'workshop', 'special topics', 'research', 'thesis', 'capstone'];
  if (electiveKeywords.some(kw => nameLower.includes(kw))) {
    return true; // Electives and special subjects can be for any year
  }
  
  // Default: assume subject is valid for all year levels if no pattern found
  return true;
}

// ============================================================================
// MAIN SCHEDULING ALGORITHM
// ============================================================================

export class ScheduleGenerator {
  private ctx: ConstraintContext;
  private unassigned: UnassignedItem[] = [];
  private backtrackCount = 0;
  private maxBacktracks = 50000;
  private startTime = 0;
  private skippedCount = 0;

  constructor(
    faculty: Faculty[],
    rooms: Room[],
    sections: Section[],
    subjects: Subject[],
    private curriculum?: CurriculumEntry[]
  ) {
    this.ctx = createConstraintContext(faculty, rooms, sections, subjects);
  }

  /**
   * Main entry point - generates conflict-free schedules
   */
  generate(): GenerationResult {
    this.startTime = Date.now();
    this.unassigned = [];
    this.backtrackCount = 0;
    this.skippedCount = 0;

    // === DEBUG: Log all faculty preferences at start ===
    this.logAllFacultyPreferences();

    // Get subject-section pairs based on curriculum or auto-detection
    const subjectSectionPairs = determineSubjectSectionPairs(
      this.ctx.sections,
      this.ctx.subjects,
      this.curriculum
    );

    console.log(`Scheduling ${subjectSectionPairs.length} subject-section pairs`);

    // Create scheduling tasks
    const tasks = this.createSchedulingTasks(subjectSectionPairs);
    
    // Sort tasks by difficulty (most constrained first - MRV heuristic)
    const sortedTasks = this.sortByDifficulty(tasks);

    console.log(`Created ${tasks.length} scheduling tasks`);

    // Solve using backtracking with forward checking
    const success = this.solve(sortedTasks, 0);

    const stats = this.calculateStats(subjectSectionPairs.length);

    // === DEBUG: Log preference match summary per faculty ===
    this.logPreferenceMatchSummary();

    return {
      success,
      schedules: this.ctx.assignments,
      violations: this.detectViolations(),
      unassigned: this.unassigned,
      stats,
    };
  }

  // ==========================================================================
  // DEBUG LOGGING
  // ==========================================================================

  /**
   * Log each faculty member's loaded preferences at the start of generation
   */
  private logAllFacultyPreferences(): void {
    console.log('=== FACULTY PREFERENCE LOADING ===');
    for (const [facultyId, faculty] of this.ctx.faculty) {
      if (faculty.preferences && facultyHasPreferences(faculty)) {
        const prefs = faculty.preferences;
        console.log(
          `[PREF] ${faculty.name} (${facultyId}): ` +
          `days=[${prefs.preferredDays?.join(', ') || 'none'}], ` +
          `time=${prefs.preferredTimeStart || 'N/A'}-${prefs.preferredTimeEnd || 'N/A'}, ` +
          `subjects=[${prefs.preferredSubjects?.join(', ') || 'none'}], ` +
          `unavailable=[${prefs.unavailableDays?.join(', ') || 'none'}]`
        );
      } else {
        console.log(`[PREF] ${faculty.name} (${facultyId}): No preferences set`);
      }
    }
    console.log('=== END FACULTY PREFERENCE LOADING ===');
  }

  /**
   * Log preference match summary per faculty after generation completes
   */
  private logPreferenceMatchSummary(): void {
    console.log('=== PREFERENCE MATCH SUMMARY ===');
    let totalAllMatch = 0;
    let totalPartialMatch = 0;
    let totalNoMatch = 0;
    let totalNoPrefs = 0;

    for (const [facultyId, faculty] of this.ctx.faculty) {
      const facultyAssignments = this.ctx.assignments.filter(a => a.facultyId === facultyId);
      
      if (facultyAssignments.length === 0) {
        console.log(`[PREF-SUMMARY] ${faculty.name}: No assignments`);
        continue;
      }

      if (!faculty.preferences || !facultyHasPreferences(faculty)) {
        totalNoPrefs += facultyAssignments.length;
        console.log(`[PREF-SUMMARY] ${faculty.name}: ${facultyAssignments.length} assignments (no preferences set)`);
        continue;
      }

      let allMatch = 0;
      let partialMatch = 0;
      let noMatch = 0;

      for (const assignment of facultyAssignments) {
        const matchResult = this.evaluatePreferenceMatch(faculty, assignment);
        if (matchResult === 'all') allMatch++;
        else if (matchResult === 'partial') partialMatch++;
        else noMatch++;
      }

      totalAllMatch += allMatch;
      totalPartialMatch += partialMatch;
      totalNoMatch += noMatch;

      console.log(
        `[PREF-SUMMARY] ${faculty.name}: ${facultyAssignments.length} assignments - ` +
        `all match: ${allMatch}, partial: ${partialMatch}, violated: ${noMatch}`
      );
    }

    const total = totalAllMatch + totalPartialMatch + totalNoMatch + totalNoPrefs;
    console.log(
      `[PREF-SUMMARY] TOTAL: ${total} assignments - ` +
      `all match: ${totalAllMatch} (${total > 0 ? ((totalAllMatch / total) * 100).toFixed(1) : 0}%), ` +
      `partial: ${totalPartialMatch} (${total > 0 ? ((totalPartialMatch / total) * 100).toFixed(1) : 0}%), ` +
      `violated: ${totalNoMatch} (${total > 0 ? ((totalNoMatch / total) * 100).toFixed(1) : 0}%), ` +
      `no prefs: ${totalNoPrefs}`
    );
    console.log('=== END PREFERENCE MATCH SUMMARY ===');
  }

  /**
   * Evaluate how well an assignment matches the faculty's preferences
   * Returns 'all', 'partial', or 'none'
   */
  private evaluatePreferenceMatch(
    faculty: Faculty,
    assignment: ScheduleAssignment
  ): 'all' | 'partial' | 'none' {
    if (!faculty.preferences || !facultyHasPreferences(faculty)) return 'all';

    const prefs = faculty.preferences;
    const checks: boolean[] = [];

    // Check preferred day
    if (prefs.preferredDays && prefs.preferredDays.length > 0) {
      checks.push(prefs.preferredDays.includes(assignment.day));
    }

    // Check preferred time
    if (prefs.preferredTimeStart && prefs.preferredTimeEnd) {
      checks.push(isPreferredTime(faculty, assignment.startTime, assignment.endTime));
    }

    // Check preferred subject
    if (prefs.preferredSubjects && prefs.preferredSubjects.length > 0) {
      checks.push(prefs.preferredSubjects.includes(assignment.subjectId));
    }

    if (checks.length === 0) return 'all';
    
    const matched = checks.filter(Boolean).length;
    if (matched === checks.length) return 'all';
    if (matched > 0) return 'partial';
    return 'none';
  }

  /**
   * Creates scheduling tasks from subject-section pairs
   */
  private createSchedulingTasks(pairs: Array<{ subjectId: string; sectionId: string }>): Array<{
    subjectId: string;
    subject: Subject;
    sectionId: string;
    section: Section;
    difficulty: number;
  }> {
    const tasks: Array<{
      subjectId: string;
      subject: Subject;
      sectionId: string;
      section: Section;
      difficulty: number;
    }> = [];

    for (const pair of pairs) {
      const subject = this.ctx.subjects.get(pair.subjectId);
      const section = this.ctx.sections.get(pair.sectionId);
      
      if (!subject || !section) continue;

      // Calculate difficulty (fewer options = higher difficulty)
      const eligibleFaculty = this.getEligibleFaculty(subject);
      const suitableRooms = this.getSuitableRooms(section);
      
      // Higher difficulty = fewer options = should be scheduled first
      const difficulty = 100 - (eligibleFaculty.length * 10) - (suitableRooms.length * 5);

      tasks.push({
        subjectId: subject.id,
        subject,
        sectionId: section.id,
        section,
        difficulty,
      });
    }

    return tasks;
  }

  /**
   * Sorts tasks by difficulty (Most Constrained Variable heuristic)
   */
  private sortByDifficulty(
    tasks: Array<{
      subjectId: string;
      subject: Subject;
      sectionId: string;
      section: Section;
      difficulty: number;
    }>
  ): typeof tasks {
    return tasks.sort((a, b) => b.difficulty - a.difficulty);
  }

  /**
   * Gets faculty eligible to teach a subject, SORTED BY PREFERENCE PRIORITY.
   * 
   * Sorting order:
   * 1. Faculty who have the subject in their preferredSubjects list come FIRST
   * 2. Within each group, sort by load balance (least loaded first)
   * 
   * This ensures preference-aligned faculty are tried before others.
   */
  private getEligibleFaculty(subject: Subject): Faculty[] {
    const eligible = Array.from(this.ctx.faculty.values()).filter(f => {
      // Check specialization match
      if (!checkSpecialization(this.ctx, f.id, subject.id)) return false;

      // Check remaining capacity
      const currentLoad = this.ctx.facultyLoad.get(f.id) || 0;
      if (currentLoad + subject.units > f.maxUnits) return false;

      return true;
    });

    // Sort: preferred-subject faculty first, then by load balance (least loaded first)
    eligible.sort((a, b) => {
      const aPrefersSubject = isPreferredSubject(a, subject.id) ? 0 : 1;
      const bPrefersSubject = isPreferredSubject(b, subject.id) ? 0 : 1;
      
      // First priority: preferred subject
      if (aPrefersSubject !== bPrefersSubject) {
        return aPrefersSubject - bPrefersSubject;
      }
      
      // Second priority: load balance (least loaded first)
      const aLoad = this.ctx.facultyLoad.get(a.id) || 0;
      const bLoad = this.ctx.facultyLoad.get(b.id) || 0;
      return aLoad - bLoad;
    });

    return eligible;
  }

  /**
   * Gets rooms suitable for a section
   */
  private getSuitableRooms(section: Section): Room[] {
    return Array.from(this.ctx.rooms.values())
      .filter(r => r.capacity >= section.studentCount)
      .sort((a, b) => a.capacity - b.capacity); // Prefer smaller rooms
  }

  /**
   * Main solving algorithm using greedy assignment with backtracking
   * Uses Least Constraining Value (LCV) heuristic
   */
  private solve(
    tasks: Array<{
      subjectId: string;
      subject: Subject;
      sectionId: string;
      section: Section;
      difficulty: number;
    }>,
    index: number
  ): boolean {
    if (index >= tasks.length) return true;

    // Prevent infinite loops
    if (this.backtrackCount >= this.maxBacktracks) {
      console.warn('Max backtracks reached, stopping generation');
      // Mark remaining tasks as unassigned
      for (let i = index; i < tasks.length; i++) {
        const task = tasks[i];
        this.unassigned.push({
          subjectId: task.subjectId,
          subjectCode: task.subject.subjectCode,
          subjectName: task.subject.subjectName,
          sectionId: task.sectionId,
          sectionName: task.section.sectionName,
          reason: 'Generation stopped due to complexity limit',
        });
      }
      return false;
    }

    const task = tasks[index];
    const { subject, section } = task;

    // Check for duplicate subject-section assignment
    if (!checkSubjectNotDuplicate(this.ctx, subject.id, section.id)) {
      // Skip this task - subject already assigned to section
      this.skippedCount++;
      return this.solve(tasks, index + 1);
    }

    // Generate candidates for this task (two-phase: preference-first, then fallback)
    const candidates = this.generateCandidates(task);

    if (candidates.length === 0) {
      // No valid candidates - mark as unassigned and continue
      this.unassigned.push({
        subjectId: subject.id,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        sectionId: section.id,
        sectionName: section.sectionName,
        reason: 'No valid time slot, faculty, or room combination available',
      });
      return this.solve(tasks, index + 1);
    }

    // Try each candidate (sorted by score - best first)
    for (const candidate of candidates) {
      this.backtrackCount++;

      if (this.tryAssign(candidate)) {
        // Successfully assigned, continue to next task
        const result = this.solve(tasks, index + 1);
        if (result) return true;

        // Backtrack - remove the assignment and try next candidate
        this.removeAssignment(candidate.id);
      }
    }

    // No valid assignment found after trying all candidates
    this.unassigned.push({
      subjectId: subject.id,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      sectionId: section.id,
      sectionName: section.sectionName,
      reason: 'Could not find conflict-free assignment after backtracking',
    });

    // Continue with remaining tasks (greedy approach)
    return this.solve(tasks, index + 1);
  }

  /**
   * Generates all valid candidates for a task using a TWO-PHASE approach.
   * 
   * PHASE 1 (Preference-Aligned): Generate candidates using ONLY preference-aligned slots
   *   - For each faculty, use generatePreferenceAwareSlots() which filters by preferred days + times
   *   - Faculty who prefer the subject are tried first (due to getEligibleFaculty sorting)
   * 
   * PHASE 2 (Relaxed Fallback): If Phase 1 yields 0 candidates, generate with all slots
   *   - Use all work days and all time ranges
   *   - These candidates get flagged with lower scores due to preference penalties
   *   - A warning is logged that relaxed mode was triggered
   */
  private generateCandidates(task: {
    subjectId: string;
    subject: Subject;
    sectionId: string;
    section: Section;
  }): ScheduleAssignment[] {
    const { subject, section } = task;

    const eligibleFaculty = this.getEligibleFaculty(subject);
    const suitableRooms = this.getSuitableRooms(section);
    const duration = calculateDurationHours(subject);
    
    // Limit candidates to prevent combinatorial explosion
    const maxCandidates = 1000;

    // ============================================================
    // PHASE 1: Generate candidates with preference-aligned slots
    // ============================================================
    console.log(
      `[PREF-PHASE1] Generating preference-aligned candidates for ` +
      `${subject.subjectCode} / ${section.sectionName}`
    );
    
    const phase1Candidates = this.buildCandidatesFromSlots(
      eligibleFaculty,
      suitableRooms,
      subject,
      section,
      duration,
      maxCandidates,
      true // preferenceMode: true = use preference-aware slots per faculty
    );

    if (phase1Candidates.length > 0) {
      console.log(
        `[PREF-PHASE1] Found ${phase1Candidates.length} preference-aligned candidates ` +
        `for ${subject.subjectCode} / ${section.sectionName}`
      );
      return phase1Candidates;
    }

    // ============================================================
    // PHASE 2: Relaxed fallback - use all available slots
    // ============================================================
    console.log(
      `[PREF-PHASE2] No preference-aligned candidates found for ` +
      `${subject.subjectCode} / ${section.sectionName}. ` +
      `Falling back to relaxed constraints (all days/times).`
    );
    
    const phase2Candidates = this.buildCandidatesFromSlots(
      eligibleFaculty,
      suitableRooms,
      subject,
      section,
      duration,
      maxCandidates,
      false // preferenceMode: false = use all slots (fallback)
    );

    if (phase2Candidates.length > 0) {
      console.log(
        `[PREF-PHASE2] Found ${phase2Candidates.length} relaxed candidates ` +
        `for ${subject.subjectCode} / ${section.sectionName}`
      );
    }

    return phase2Candidates;
  }

  /**
   * Build candidate assignments from a set of slots, optionally using preference-aware filtering.
   * 
   * When preferenceMode is true, each faculty gets their own set of preference-filtered slots.
   * When preferenceMode is false, all faculty share the same full set of slots.
   */
  private buildCandidatesFromSlots(
    eligibleFaculty: Faculty[],
    suitableRooms: Room[],
    subject: Subject,
    section: Section,
    duration: number,
    maxCandidates: number,
    preferenceMode: boolean
  ): ScheduleAssignment[] {
    const candidates: ScheduleAssignment[] = [];
    let candidateCount = 0;

    // Generate slots once for all faculty (in non-preference mode)
    // or per-faculty in preference mode
    const allSlots = preferenceMode ? null : generateSlotCandidates(duration);

    for (const faculty of eligibleFaculty) {
      // Get slots: preference-aware per faculty, or shared all-slots
      const slots = preferenceMode
        ? generatePreferenceAwareSlots(duration, faculty)
        : allSlots!;

      for (const room of suitableRooms) {
        for (const slot of slots) {
          // Early exit if we have enough candidates
          if (candidateCount >= maxCandidates) break;
          
          // Check all hard constraints
          if (!checkFacultyAvailability(this.ctx, faculty.id, slot.day, slot.start, slot.end)) continue;
          if (!checkRoomAvailability(this.ctx, room.id, slot.day, slot.start, slot.end)) continue;
          if (!checkSectionAvailability(this.ctx, section.id, slot.day, slot.start, slot.end)) continue;
          if (!checkRoomEquipment(this.ctx, room.id, subject.id)) continue;
          if (!checkFacultyUnavailableDay(this.ctx, faculty.id, slot.day)) continue;
          if (!checkRoomCapacity(this.ctx, room.id, section.id)) continue;

          // Calculate score (includes heavy preference weighting)
          const score = calculateOverallScore(
            this.ctx,
            faculty.id,
            room.id,
            section.id,
            subject.id,
            slot.day,
            slot.start,
            slot.end,
            subject.units
          );

          candidates.push({
            id: generateUniqueId(),
            subjectId: subject.id,
            facultyId: faculty.id,
            sectionId: section.id,
            roomId: room.id,
            day: slot.day,
            startTime: slot.start,
            endTime: slot.end,
            status: 'generated',
            score,
          });
          
          candidateCount++;
        }
        if (candidateCount >= maxCandidates) break;
      }
      if (candidateCount >= maxCandidates) break;
    }

    // Sort by score (descending) - best candidates first
    return candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Attempts to assign a candidate
   */
  private tryAssign(candidate: ScheduleAssignment): boolean {
    // Double-check all constraints
    if (!checkFacultyAvailability(this.ctx, candidate.facultyId, candidate.day, candidate.startTime, candidate.endTime)) {
      return false;
    }
    if (!checkRoomAvailability(this.ctx, candidate.roomId, candidate.day, candidate.startTime, candidate.endTime)) {
      return false;
    }
    if (!checkSectionAvailability(this.ctx, candidate.sectionId, candidate.day, candidate.startTime, candidate.endTime)) {
      return false;
    }

    // Get subject for units
    const subject = this.ctx.subjects.get(candidate.subjectId);
    if (!subject) return false;

    if (!checkFacultyCapacity(this.ctx, candidate.facultyId, subject.units)) {
      return false;
    }

    // Check for duplicate subject-section
    if (!checkSubjectNotDuplicate(this.ctx, candidate.subjectId, candidate.sectionId)) {
      return false;
    }

    // Assign
    this.ctx.assignments.push(candidate);

    // Update faculty load tracking
    const currentLoad = this.ctx.facultyLoad.get(candidate.facultyId) || 0;
    this.ctx.facultyLoad.set(candidate.facultyId, currentLoad + subject.units);

    const dayLoad = this.ctx.facultyDayLoad.get(candidate.facultyId);
    if (dayLoad) {
      const current = dayLoad.get(candidate.day) || 0;
      dayLoad.set(candidate.day, current + 1);
    }

    // Update room usage
    const roomUsage = this.ctx.roomDayUsage.get(candidate.roomId);
    if (roomUsage) {
      const dayUsage = roomUsage.get(candidate.day);
      if (dayUsage) {
        dayUsage.push({ start: candidate.startTime, end: candidate.endTime });
      }
    }

    // Update section usage
    const sectionUsage = this.ctx.sectionDayUsage.get(candidate.sectionId);
    if (sectionUsage) {
      const dayUsage = sectionUsage.get(candidate.day);
      if (dayUsage) {
        dayUsage.push({ start: candidate.startTime, end: candidate.endTime });
      }
    }

    // Track subject assigned to section
    const sectionSubjects = this.ctx.sectionSubjects.get(candidate.sectionId);
    if (sectionSubjects) {
      sectionSubjects.add(candidate.subjectId);
    }

    // Update global day count for balancing
    const currentDayCount = this.ctx.globalDayCount.get(candidate.day) || 0;
    this.ctx.globalDayCount.set(candidate.day, currentDayCount + 1);

    return true;
  }

  /**
   * Removes an assignment (for backtracking)
   */
  private removeAssignment(id: string): void {
    const index = this.ctx.assignments.findIndex(a => a.id === id);
    if (index === -1) return;

    const assignment = this.ctx.assignments[index];
    const subject = this.ctx.subjects.get(assignment.subjectId);

    // Remove from assignments
    this.ctx.assignments.splice(index, 1);

    // Update faculty load tracking
    if (subject) {
      const currentLoad = this.ctx.facultyLoad.get(assignment.facultyId) || 0;
      this.ctx.facultyLoad.set(assignment.facultyId, Math.max(0, currentLoad - subject.units));
    }

    const dayLoad = this.ctx.facultyDayLoad.get(assignment.facultyId);
    if (dayLoad) {
      const current = dayLoad.get(assignment.day) || 0;
      dayLoad.set(assignment.day, Math.max(0, current - 1));
    }

    // Update room usage
    const roomUsage = this.ctx.roomDayUsage.get(assignment.roomId);
    if (roomUsage) {
      const dayUsage = roomUsage.get(assignment.day);
      if (dayUsage) {
        const idx = dayUsage.findIndex(u => u.start === assignment.startTime && u.end === assignment.endTime);
        if (idx >= 0) dayUsage.splice(idx, 1);
      }
    }

    // Update section usage
    const sectionUsage = this.ctx.sectionDayUsage.get(assignment.sectionId);
    if (sectionUsage) {
      const dayUsage = sectionUsage.get(assignment.day);
      if (dayUsage) {
        const idx = dayUsage.findIndex(u => u.start === assignment.startTime && u.end === assignment.endTime);
        if (idx >= 0) dayUsage.splice(idx, 1);
      }
    }

    // Remove subject from section tracking
    const sectionSubjects = this.ctx.sectionSubjects.get(assignment.sectionId);
    if (sectionSubjects) {
      sectionSubjects.delete(assignment.subjectId);
    }

    // Update global day count for balancing
    const currentDayCount = this.ctx.globalDayCount.get(assignment.day) || 0;
    this.ctx.globalDayCount.set(assignment.day, Math.max(0, currentDayCount - 1));
  }

  /**
   * Detects any constraint violations in the final schedule,
   * INCLUDING preference violation warnings.
   */
  private detectViolations(): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // --- PASS 1: Hard constraint violations (double booking, capacity, etc.) ---
    for (let i = 0; i < this.ctx.assignments.length; i++) {
      const a1 = this.ctx.assignments[i];

      for (let j = i + 1; j < this.ctx.assignments.length; j++) {
        const a2 = this.ctx.assignments[j];

        if (a1.day !== a2.day) continue;
        if (!timesOverlap(a1.startTime, a1.endTime, a2.startTime, a2.endTime)) continue;

        // Faculty double booking
        if (a1.facultyId === a2.facultyId) {
          const faculty = this.ctx.faculty.get(a1.facultyId);
          violations.push({
            type: 'faculty_double_booking',
            severity: 'critical',
            description: `Faculty ${faculty?.name || a1.facultyId} is double-booked on ${a1.day} (${a1.startTime}-${a1.endTime} and ${a2.startTime}-${a2.endTime})`,
            scheduleIds: [a1.id, a2.id],
          });
        }

        // Room double booking
        if (a1.roomId === a2.roomId) {
          const room = this.ctx.rooms.get(a1.roomId);
          violations.push({
            type: 'room_double_booking',
            severity: 'critical',
            description: `Room ${room?.roomName || a1.roomId} is double-booked on ${a1.day} (${a1.startTime}-${a1.endTime} and ${a2.startTime}-${a2.endTime})`,
            scheduleIds: [a1.id, a2.id],
          });
        }

        // Section overlap
        if (a1.sectionId === a2.sectionId) {
          const section = this.ctx.sections.get(a1.sectionId);
          violations.push({
            type: 'section_overlap',
            severity: 'critical',
            description: `Section ${section?.sectionName || a1.sectionId} has overlapping classes on ${a1.day}`,
            scheduleIds: [a1.id, a2.id],
          });
        }
      }
    }

    // Check for capacity violations
    for (const assignment of this.ctx.assignments) {
      const room = this.ctx.rooms.get(assignment.roomId);
      const section = this.ctx.sections.get(assignment.sectionId);
      
      if (room && section && room.capacity < section.studentCount) {
        violations.push({
          type: 'capacity_exceeded',
          severity: 'warning',
          description: `Room ${room.roomName} capacity (${room.capacity}) is less than section ${section.sectionName} size (${section.studentCount})`,
          scheduleIds: [assignment.id],
        });
      }
    }

    // Check for unit overload violations
    const facultyTotalLoad = new Map<string, number>();
    for (const assignment of this.ctx.assignments) {
      const subject = this.ctx.subjects.get(assignment.subjectId);
      if (subject) {
        const currentLoad = facultyTotalLoad.get(assignment.facultyId) || 0;
        facultyTotalLoad.set(assignment.facultyId, currentLoad + subject.units);
      }
    }
    for (const [facultyId, totalLoad] of facultyTotalLoad) {
      const faculty = this.ctx.faculty.get(facultyId);
      if (faculty && totalLoad > faculty.maxUnits) {
        violations.push({
          type: 'unit_overload',
          severity: 'warning',
          description: `Faculty ${faculty.name} is overloaded with ${totalLoad} units (max: ${faculty.maxUnits})`,
          scheduleIds: this.ctx.assignments.filter(a => a.facultyId === facultyId).map(a => a.id),
        });
      }
    }

    // --- PASS 2: Preference violation warnings ---
    for (const assignment of this.ctx.assignments) {
      const faculty = this.ctx.faculty.get(assignment.facultyId);
      if (!faculty || !faculty.preferences || !facultyHasPreferences(faculty)) continue;

      const violatedConstraints: string[] = [];
      const prefs = faculty.preferences;

      // Check preferred day
      if (prefs.preferredDays && prefs.preferredDays.length > 0) {
        if (!prefs.preferredDays.includes(assignment.day)) {
          violatedConstraints.push(`day "${assignment.day}" is not preferred (prefers: ${prefs.preferredDays.join(', ')})`);
        }
      }

      // Check preferred time range
      if (prefs.preferredTimeStart && prefs.preferredTimeEnd) {
        if (!isPreferredTime(faculty, assignment.startTime, assignment.endTime)) {
          violatedConstraints.push(
            `time ${assignment.startTime}-${assignment.endTime} is outside preferred range (${prefs.preferredTimeStart}-${prefs.preferredTimeEnd})`
          );
        }
      }

      // Check preferred subject
      if (prefs.preferredSubjects && prefs.preferredSubjects.length > 0) {
        const subject = this.ctx.subjects.get(assignment.subjectId);
        if (!prefs.preferredSubjects.includes(assignment.subjectId)) {
          violatedConstraints.push(
            `subject "${subject?.subjectCode || assignment.subjectId}" is not in preferred subjects list`
          );
        }
      }

      // Only add a violation if at least one preference constraint was violated
      if (violatedConstraints.length > 0) {
        const subject = this.ctx.subjects.get(assignment.subjectId);
        violations.push({
          type: 'preference_violation',
          severity: 'warning',
          description: `${faculty.name}'s preferences not fully satisfied for ${subject?.subjectCode || assignment.subjectId} on ${assignment.day} ${assignment.startTime}-${assignment.endTime}: ${violatedConstraints.join('; ')}`,
          scheduleIds: [assignment.id],
        });
      }
    }

    return violations;
  }

  /**
   * Calculates generation statistics, including detailed preference match rates.
   */
  private calculateStats(totalPairs: number): GenerationStats {
    const assignedSlots = this.ctx.assignments.length;
    
    // Calculate faculty utilization
    const facultyUtilizations: number[] = [];
    for (const [facultyId, load] of this.ctx.facultyLoad) {
      const faculty = this.ctx.faculty.get(facultyId);
      if (faculty && faculty.maxUnits > 0) {
        facultyUtilizations.push(load / faculty.maxUnits);
      }
    }
    const averageFacultyLoad = facultyUtilizations.length > 0
      ? facultyUtilizations.reduce((a, b) => a + b, 0) / facultyUtilizations.length
      : 0;

    // === Calculate detailed preference match rate ===
    let allMatchCount = 0;
    let partialMatchCount = 0;
    let totalWithPrefs = 0;

    for (const assignment of this.ctx.assignments) {
      const faculty = this.ctx.faculty.get(assignment.facultyId);
      if (!faculty || !faculty.preferences || !facultyHasPreferences(faculty)) {
        // No preferences = treat as full match
        allMatchCount++;
        continue;
      }
      
      totalWithPrefs++;
      const matchResult = this.evaluatePreferenceMatch(faculty, assignment);
      if (matchResult === 'all') allMatchCount++;
      else if (matchResult === 'partial') partialMatchCount++;
      // 'none' = violated, counts as 0 match
    }

    // Preference match rate: weighted score where all=1.0, partial=0.5, none=0.0
    const noMatchCount = assignedSlots - allMatchCount - partialMatchCount;
    const preferenceMatchRate = assignedSlots > 0
      ? (allMatchCount * 1.0 + partialMatchCount * 0.5) / assignedSlots
      : 0;

    console.log(
      `[PREF-STATS] Preference match rate: ${(preferenceMatchRate * 100).toFixed(1)}% ` +
      `(all: ${allMatchCount}, partial: ${partialMatchCount}, violated: ${noMatchCount}, ` +
      `no prefs: ${assignedSlots - totalWithPrefs})`
    );

    // Calculate room utilization
    const usedRooms = new Set(this.ctx.assignments.map(a => a.roomId));
    const averageRoomUtilization = this.ctx.rooms.size > 0
      ? usedRooms.size / this.ctx.rooms.size
      : 0;

    return {
      totalSlots: totalPairs,
      assignedSlots,
      assignmentRate: totalPairs > 0 ? assignedSlots / totalPairs : 0,
      averageFacultyLoad,
      averageRoomUtilization,
      preferenceMatchRate,
      generationTimeMs: Date.now() - this.startTime,
      backtrackCount: this.backtrackCount,
      skippedCount: this.skippedCount,
    };
  }
}

// ============================================================================
// EXPORT HELPER FUNCTION
// ============================================================================

export function generateSchedules(
  faculty: Faculty[],
  rooms: Room[],
  sections: Section[],
  subjects: Subject[],
  curriculum?: CurriculumEntry[]
): GenerationResult {
  const generator = new ScheduleGenerator(faculty, rooms, sections, subjects, curriculum);
  return generator.generate();
}

// Export utility functions for external use
export {
  timeToMinutes,
  minutesToTime,
  timesOverlap,
  calculateDurationHours,
  subjectMatchesYearLevel,
};
