# Intelligent Conflict Detection & Auto-Rescheduling System

## System Purpose
Build an intelligent conflict detection and automatic rescheduling system that identifies scheduling conflicts (double-booking of faculty/rooms/sections) and intelligently reassigns conflicting subjects to alternative times and days while respecting user preferences and avoiding cascading conflicts.

## Core Workflow

### Phase 1: Conflict Detection
When schedules are generated or manually created, perform real-time conflict scanning:

**Detect the following conflicts:**
1. **Faculty Double-Booking**: Same faculty assigned to multiple classes at overlapping times
2. **Room Double-Booking**: Same room assigned to multiple classes at overlapping times
3. **Section Overlap**: Same section assigned to multiple classes at overlapping times
4. **Capacity Exceeded**: Section size exceeds room capacity
5. **Equipment Mismatch**: Room lacks required equipment for subject

**For each conflict identified:**
- Log the conflict with severity level: `critical` | `warning` | `info`
- Identify affected users (faculty and sections involved)
- Flag the original schedule assignment as status: `conflict`
- Collect conflict metadata (type, entities involved, time overlap duration)

---

### Phase 2: Intelligent Reassignment Algorithm

When a conflict is detected, attempt automatic reassignment using this priority order:

#### Step 1: Identify the Conflicting Assignment
```
- Determine which assignment triggered the conflict
- If multiple conflicts: resolve in order of severity (critical → warning → info)
- Mark assignment as "under resolution"
```

#### Step 2: Gather Preference Context
For the affected faculty member:
```javascript
{
  preferredDays: ["Monday", "Wednesday", "Friday"],  // Days they prefer
  preferredTimeStart: "09:00",                       // Earliest preferred time
  preferredTimeEnd: "17:00",                         // Latest preferred time
  unavailableDays: ["Saturday"],                     // Days they can't teach
  preferredSubjects: [subject1_id, subject2_id],     // Preferred subjects
}
```

#### Step 3: Generate Alternative Slot Candidates
**Candidate Generation Strategy (Priority Order):**

**Tier 1 - PREFERRED slots** (highest priority)
```
For each of faculty's preferredDays:
  Generate time slots within preferredTimeStart to preferredTimeEnd
  That don't conflict with:
    - Other faculty assignments
    - Room assignments
    - Section assignments
  Score these candidates highest
```

**Tier 2 - NON-PREFERRED but AVAILABLE slots** (fallback)
```
Generate from remaining available days/times:
  Exclude unavailableDays (hard constraint)
  Exclude times causing new conflicts
  Score lower than Tier 1
```

**Tier 3 - LAST RESORT** (if Tiers 1-2 exhausted)
```
Generate slots even if they're outside preferred time range:
  Still respect unavailableDays
  Still avoid conflicts
  Mark as "sub-optimal assignment"
```

#### Step 4: Score Candidates
For each candidate slot, calculate a **reassignment quality score**:

```
SCORE = (
  (Tier1Bonus × 0.4) +                    // Prefers preferred day
  (TimeQuality × 0.25) +                  // Prefers morning/afternoon
  (PreferredSubjectBonus × 0.2) +         // Is this a preferred subject?
  (LoadBalanceBonus × 0.15)               // Doesn't overload this day
)

Where:
- Tier1Bonus: 1.0 if in preferred day, 0.5 if available day, 0.2 if last resort
- TimeQuality: 1.0 for 9-5pm, 0.8 for 8-6pm, 0.6 for others
- PreferredSubjectBonus: 1.0 if subject in preferredSubjects, 0.3 otherwise
- LoadBalanceBonus: inverse of current load on that day (prefer less-loaded days)
```

#### Step 5: Validate Reassignment
Before assigning the chosen slot, verify:
```
✓ No new faculty conflicts
✓ No new room conflicts
✓ No new section conflicts
✓ Faculty capacity not exceeded
✓ Doesn't create cascading conflicts
```

**If validation fails:** Try next best candidate. If all fail → leave as `conflict` status for manual resolution.

#### Step 6: Apply Reassignment
If valid candidate found:
```javascript
{
  assignment: {
    id: assignment_id,
    newDay: "Wednesday",
    newStartTime: "10:00",
    newEndTime: "12:00",
    newRoomId: room_id,
    status: "rescheduled_due_conflict",
    originalDay: "Monday",
    originalStartTime: "09:00",
    originalEndTime: "11:00",
    conflictReason: "Room double-booking with HR101",
    reasonDescription: "Room B202 was already assigned to HR101 on Monday 09:00-11:00",
    rescheduleReason: "automatically_reassigned_to_preferred_day",
  }
}
```

---

### Phase 3: Multi-Channel Notifications

Notify all affected parties through multiple channels:

#### Notification Type 1: **Schedule Change Alert**
**Send to:** Faculty member whose schedule was changed

**Content:**
```
📅 YOUR SCHEDULE HAS CHANGED DUE TO A CONFLICT

Subject: [Subject Code] - [Subject Name]
Section: [Section Name]

❌ ORIGINAL SCHEDULE:
   Day: [Original Day]
   Time: [Original Start] - [Original End]
   Room: [Original Room]

✅ NEW SCHEDULE:
   Day: [New Day] ← MOVED TO PREFERRED DAY
   Time: [New Start] - [New End]
   Room: [New Room]

🔍 REASON FOR CHANGE:
   [Conflict Type]: [Other subject/faculty] was already scheduled at that time.
   
   Your new time has been chosen to match one of your preferred days: [New Day]
   This avoids conflicts with other faculty assignments.

⚠️ ACTION REQUIRED:
   Please review the new schedule. If this doesn't work for you, 
   you can manually reassign or request changes from administration.

Conflict ID: [conflict_id]
Reassignment ID: [reassignment_id]
```

#### Notification Type 2: **Affected Users Alert**
**Send to:** Other faculty/sections whose schedules were affected

**Content:**
```
⚠️ RELATED SCHEDULE CHANGE

[Faculty Name]'s schedule for [Subject] has been moved to avoid conflicts:

   MOVED FROM: [Original Day], [Original Time], [Original Room]
   MOVED TO: [New Day], [New Time], [New Room]

This change may affect you if you share:
   - Room resources
   - Student sections
   - Time slot dependencies

Check your dashboard for any adjustments.
```

#### Notification Type 3: **Admin/Dept Head Report**
**Send to:** Department heads and admins

**Content:**
```
📊 CONFLICT RESOLUTION REPORT

Conflict Detected & Auto-Resolved:
- Conflict Type: [Type]
- Affected Faculty: [Name]
- Affected Subject: [Code - Name]
- Original Slot: [Day] [Time] [Room]
- New Slot: [Day] [Time] [Room]
- Resolution Strategy: Moved to preferred day within preferred hours
- Resolution Status: ✅ SUCCESS / ⚠️ REQUIRES_MANUAL_REVIEW

Rationale:
[Detailed explanation of why this choice was made]

Review & Actions Available:
- Approve reassignment
- Request manual review
- Force alternative reassignment
```

#### Notification Channels:
- **In-App Notification**: Dashboard alert + notification badge
- **Email**: Detailed email with full context
- **SMS** (optional): Quick alert for critical conflicts
- **Notification Log**: Audit trail of all changes

---

### Phase 4: Escalation & Manual Review

**When auto-resolution is NOT possible:**

1. Mark assignment as `conflict_unresolved`
2. Trigger escalation workflow:
   ```
   Faculty → Department Head → Admin
   ```
3. Notify stakeholders with:
   - Why automatic resolution failed
   - Available options (manual reassign, remove subject, etc.)
   - Deadline for manual intervention

**Manual Resolution Options:**
- Reassign to specific day/time
- Move subject to different faculty
- Change room assignment
- Mark as accepted conflict (with justification)

---

## Advanced Features

### Feature 1: Cascade Conflict Prevention
```
When reassigning Subject A:
  1. Identify all subjects that depend on Subject A's new slot
  2. For each dependent:
     - Check if new slot creates conflict
     - If yes: cascade the reassignment
     - If too many cascades: flag for manual review
  3. Show cascade impact to admin before confirming
```

### Feature 2: Preference Learning
```
After reassignment:
  1. If faculty accepts new time for same subject again → update preferences
  2. If faculty rejects new time repeatedly → flag preference as inaccurate
  3. Use pattern history to improve future reassignments
```

### Feature 3: Conflict Prediction
```
Before generating schedules:
  1. Scan all faculty preferences
  2. Identify potential conflict hotspots (e.g., 3 faculty prefer same time/day)
  3. Warn admin: "10 potential conflicts detected. Recommend pre-review."
```

### Feature 4: Bulk Conflict Resolution
```
If multiple conflicts detected:
  1. Group related conflicts
  2. Resolve in dependency order (most constrained first)
  3. Show resolution strategy before executing
  4. Allow batch approval or selective processing
```

---

## Implementation Checklist

### Backend (`scheduling-algorithm.ts` + new conflict resolver)
- [ ] Add conflict detection function
- [ ] Add conflict scoring system
- [ ] Add intelligent reassignment algorithm
- [ ] Add cascade detection
- [ ] Add conflict logging/audit trail

### API Endpoints
- [ ] `POST /api/conflicts/detect` - Scan for conflicts
- [ ] `POST /api/conflicts/{id}/resolve` - Auto-resolve single conflict
- [ ] `POST /api/conflicts/resolve-all` - Batch resolve
- [ ] `GET /api/conflicts` - List all conflicts
- [ ] `GET /api/conflicts/{id}/alternatives` - Get reassignment options
- [ ] `PUT /api/conflicts/{id}/manual-resolve` - Manual reassignment

### Database Schema
- [ ] Extend Schedule model: add `conflictId`, `resolvedAt`, `resolutionStrategy`
- [ ] New Conflict model: type, severity, entities, timestamp, resolved
- [ ] New ConflictResolution model: original slot, new slot, reason, status
- [ ] New NotificationLog model: audit trail

### Frontend Notifications
- [ ] Real-time toast notifications
- [ ] Notification center in dashboard
- [ ] Conflict resolution UI modal
- [ ] Manual reassignment interface
- [ ] Audit trail viewer

### Testing Scenarios
- [ ] Single conflict detection & resolution
- [ ] Multiple simultaneous conflicts
- [ ] Cascade conflicts (A → B → C)
- [ ] No available slots (manual escalation)
- [ ] Faculty with no preferences
- [ ] Priority: preferred vs available
- [ ] Notification delivery verification

---

## Success Criteria

✅ **Conflicts automatically detected** within 100ms of schedule creation
✅ **80%+ of conflicts** resolved automatically without admin intervention
✅ **All affected users** notified within 30 seconds
✅ **Reassignments respect** faculty preferences 90% of the time
✅ **Zero cascading unresolved conflicts** (all cascades either resolve or escalate)
✅ **Audit trail complete** (all changes logged and reversible)
✅ **User satisfaction** > 85% (survey after using feature)

---

## Example Scenario

**Initial Conflict:**
```
Monday 10:00-12:00 Room B202
- Faculty: Dr. Smith (CS101)
- Faculty: Dr. Jones (HR101) ← SAME TIME, SAME ROOM = CONFLICT!

Dr. Smith's Preferences:
- Preferred Days: [Mon, Wed, Fri]
- Preferred Time: 09:00 - 17:00
- Unavailable: [Saturday]
```

**Algorithm Resolution:**
```
Step 1: Detect conflict (Dr. Smith + Dr. Jones, Room B202, Mon 10:00-12:00)
Step 2: Check Dr. Smith's preferences
Step 3: Generate candidates:
  Tier 1: Mon (other times in preferred range) ✓ 13:00-15:00 available
  Tier 1: Wed (within preferred days) ✓ 10:00-12:00 available, same room
  Tier 1: Fri (within preferred days) ✓ 14:00-16:00 available
Step 4: Score candidates:
  Wed 10:00-12:00 Room B202 → Score: 0.95 (preferred day, preferred time, same room)
  Mon 13:00-15:00 Room B202 → Score: 0.92 (preferred day, preferred time)
  Fri 14:00-16:00 Room B202 → Score: 0.88 (preferred day, preferred time)
Step 5: Validate Wed 10:00-12:00 → No new conflicts ✓
Step 6: Reassign
  Status: rescheduled_due_conflict
  Original: Mon 10:00-12:00
  New: Wed 10:00-12:00 (PREFERRED DAY! ✓)
Step 7: Notify Dr. Smith
  "Your CS101 class moved from Monday 10:00 to Wednesday 10:00 
   to avoid room conflict. This matches your preferred teaching day!"
```

**Result:**
- ✅ Conflict resolved
- ✅ Faculty preference respected (Wed is preferred day)
- ✅ Faculty notified
- ✅ Audit logged
- ✅ Admin alerted

---

## Configuration Parameters

```javascript
const CONFLICT_RESOLUTION_CONFIG = {
  // Scoring weights
  PREFERENCE_WEIGHT: 0.40,        // How much we weight faculty preferences
  TIME_QUALITY_WEIGHT: 0.25,      // How much we weight time quality (morning > evening)
  SUBJECT_PREF_WEIGHT: 0.20,      // How much we weight if subject is preferred
  LOAD_BALANCE_WEIGHT: 0.15,      // How much we weight day load balancing
  
  // Thresholds
  AUTO_RESOLVE_THRESHOLD: 0.75,   // Minimum score to auto-resolve without approval
  ESCALATE_THRESHOLD: 0.50,       // If score below this, escalate to admin
  MAX_CASCADE_DEPTH: 3,            // Max cascading reassignments allowed
  
  // Timeouts
  RESOLUTION_TIMEOUT_MS: 30000,   // Max time to find alternative slot
  NOTIFICATION_DELAY_MS: 500,     // Delay before sending notifications
  
  // Preferences
  PREFER_ORIGINAL_TIME: true,     // If available, keep original time?
  PREFER_PREFERRED_DAYS: true,    // Prioritize faculty preferred days?
  NOTIFY_ALL_AFFECTED: true,      // Notify everyone or just primary?
};
```

