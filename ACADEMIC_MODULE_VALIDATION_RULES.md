# Academic Module Validation, Business Rules & Data Integrity Specification

This document provides the complete, production-ready specification and reference implementation of all business rules, database constraints, relationship validations, normalization rules, and test verification matrices for the **Academic Module** across its two primary workspaces:
1. **Academic Configuration**
2. **Academic Operations**

---

## 1. Architectural Principles

| Layer | Responsibility | Implementation Details |
|---|---|---|
| **Frontend UX** | Real-time feedback, character counter, input masking, optimistic UI, prevention of bad submission | React Hook Form + Zod, Lucide icons, responsive pagination, lazy-loading tabs via React Query |
| **Backend API** | Final source of truth, request validation, sanitization | Zod request validation middleware (`validate(schema)`) |
| **Service Layer** | Cross-entity relationship validation, temporal bounds, capacity safeguards, business logic | Specialized controllers with audit logging and domain exception classes |
| **Database Layer** | Data integrity, unique indexes, atomic multi-document transactions | MongoDB compound indexes, partial filter indexes, atomic sessions (`withTransactionOrFallback`) |
| **Tenant Isolation** | Multi-school data isolation | Authenticated `req.schoolContext.schoolId` (never trusting client-provided `schoolId`) |

---

## 2. Part 1: Academic Configuration

### 2.1 Academic Years
* **Canonical DB Format**: `YYYY-YYYY` (e.g., `2026-2027`).
* **Accepted User Inputs**: `2026-2027`, `2026 - 2027`, `2026  -  2027`.
* **Rejected Formats**: `20262027`, `2026/2027`, `2026_2027`, `2026-28`, `2026-2026`, `2026-2028`, `2027-2026`, `ABC-DEF`.
* **Business Rule**: `endYear === startYear + 1`.
* **Dates**: `startDate < endDate`.
* **Default Status**: `INACTIVE` (New academic years are never created active by default).
* **Single Active Year**: Maximum 1 active academic year per school. Toggling `[✓] Set as Active Academic Year` atomically sets previous active year to `INACTIVE` and new year to `ACTIVE`.
* **Deactivation Guard**: Blind deactivation of the active academic year without selecting a replacement is blocked with `"Please select another academic year before deactivating the current active academic year."`.
* **Dependency Guard**: Deletion or identifier renaming is blocked if terms, class subjects, teacher assignments, enrollments, timetables, attendance, or fees exist (`"This academic year cannot be deleted because related records exist."`).

### 2.2 Academic Terms
* **Fields**: Name, Code, Academic Year, Start Date, End Date, Sequence, Status.
* **Normalization**: Name trimmed, Code trimmed and uppercase (e.g. `term-1` $\rightarrow$ `TERM-1`).
* **Boundary Validation**: Term start and end dates must fall completely inside the parent Academic Year date range.
* **Overlap Prevention**: Terms in the same academic year must not overlap in date ranges.
* **Sequence**: Positive integer, unique within academic year.
* **Default Status**: `INACTIVE`.

### 2.3 Grades / Classes
* **Fields**: Grade Name, Code, Display Order (`sequenceOrder`), Description, Status.
* **Normalization**: Name trimmed (max 100 chars), Code trimmed & uppercase (e.g., `grade-08` $\rightarrow$ `GRADE-08`).
* **Uniqueness**: Code unique within school (`schoolId + code`).
* **Default Status**: `INACTIVE`.
* **Dependency Guard**: Deletion blocked if sections, class subjects, or enrollments exist.

### 2.4 Sections
* **Fields**: Grade, Section Name, Section Code, Capacity, Display Order, Status.
* **Normalization**: Name and code trimmed (e.g. `" A "` $\rightarrow$ `"A"`).
* **Uniqueness**: Unique per grade (`schoolId + gradeId + name`).
* **Capacity Safeguard**: Integer $> 0$. Reducing capacity below active enrollment count is rejected.
* **Default Status**: `INACTIVE`.

### 2.5 Master Subjects
* **Fields**: Subject Name, Subject Code, Type (`CORE`, `ELECTIVE`, `LANGUAGE`, `PRACTICAL`, `OTHER`), Status.
* **Normalization**: Name trimmed, Code trimmed & uppercase (e.g., `" math "` $\rightarrow$ `"MATH"`).
* **Uniqueness**: Case-insensitive duplicate prevention for name and code per school.
* **Default Status**: `INACTIVE`.

### 2.6 Class Subject Config
* **Relationship**: `schoolId + academicYearId + gradeId + subjectId` (unique).
* **Marks Validation**:
  * $0 \le \text{Pass Marks} \le \text{Max Marks}$.
  * When both theory and practical marks are configured: $\text{Theory Marks} + \text{Practical Marks} \equiv \text{Max Marks}$.
* **Weekly Periods**: Positive integer $\ge 1$.
* **Elective Subjects**: If `isElective = true`, `subjectGroup` is mandatory.

### 2.7 Teacher Assignments
* **Relationship**: `schoolId + academicYearId + gradeId + sectionId + subjectId + teacherId` (unique).
* **Validation**:
  * Staff must exist, be active, and belong to the same school.
  * Section must belong to selected Grade.
  * Subject must be configured in `ClassSubject` for that Grade and Academic Year.
  * Only one `PRIMARY` teacher per `Academic Year + Grade + Section + Subject`.
  * Dates must fall within the Academic Year period.
* **Default Status**: `INACTIVE`.

---

## 3. Part 2: Academic Operations

### 3.1 Period Configuration
* **Fields**: Period Name, Code, Sequence, Start Time (`HH:mm`), End Time (`HH:mm`), Duration (computed), Status.
* **Validation**:
  * `startTime < endTime`.
  * Automatic duration calculation in backend.
  * Overlapping periods within the same school schedule are prevented.
  * Sequence is positive integer and unique per school.
* **Default Status**: `INACTIVE`.

### 3.2 Timetable
* **Relationships**: Section belongs to Grade, Subject configured for Grade/Year, Teacher assigned to Class/Subject.
* **Conflict Prevention**:
  1. **Section Double-Booking**: Same `schoolId + academicYearId + sectionId + dayOfWeek + periodId` rejected.
  2. **Teacher Double-Booking**: Same `schoolId + academicYearId + teacherId + dayOfWeek + periodId` rejected.
  3. **Room Double-Booking**: Same `schoolId + academicYearId + roomNumber + dayOfWeek + periodId` rejected.
* **Default Status**: `INACTIVE`.

### 3.3 Mark Attendance
* **Validation**: Student must have active enrollment in selected Section and Academic Year.
* **Statuses**: `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`, `LEAVE`, `HALF_DAY`.
* **Reason Enforcement**: `EXCUSED` and `LEAVE` statuses strictly require a non-empty reason.
* **Lock State**: Locked attendance records reject normal edits and require authorized correction with audit log.

### 3.4 Attendance Monitor & Audit
* **Audit Immutability**: All modifications create append-only audit log records (`actorId`, `action`, `oldValues`, `newValues`, `requestId`, `timestamp`, `ipAddress`).
* **Caching**: React Query query caching per tab; initial page load requests only active tab data.

### 3.5 Leave Requests
* **Date Validation**: `startDate <= endDate`.
* **Overlap Guard**: Overlapping leave dates for the same applicant are rejected.
* **Workflow Engine**: Allowed transitions `DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `APPROVED` / `REJECTED` / `CANCELLED`. Arbitrary reversion (e.g. `APPROVED` $\rightarrow$ `DRAFT`) is prohibited.
* **Rejection Reason**: Rejection requires a non-empty reason.

---

## 4. Part 3: MongoDB Database Constraints & Indexes

```javascript
// Academic Year
AcademicYearSchema.index({ schoolId: 1, code: 1 }, { unique: true });
AcademicYearSchema.index({ schoolId: 1, isCurrent: 1 }, { unique: true, partialFilterExpression: { isCurrent: true } });

// Academic Term
AcademicTermSchema.index({ schoolId: 1, academicYearId: 1, code: 1 }, { unique: true });
AcademicTermSchema.index({ schoolId: 1, academicYearId: 1, sequence: 1 }, { unique: true });

// Grade
GradeSchema.index({ schoolId: 1, code: 1 }, { unique: true });
GradeSchema.index({ schoolId: 1, sequenceOrder: 1 }, { unique: true });

// Section
SectionSchema.index({ schoolId: 1, gradeId: 1, name: 1 }, { unique: true });
SectionSchema.index({ schoolId: 1, gradeId: 1, code: 1 }, { unique: true });

// Subject
SubjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
SubjectSchema.index({ schoolId: 1, normalizedName: 1 }, { unique: true });

// Class Subject
ClassSubjectSchema.index({ schoolId: 1, academicYearId: 1, gradeId: 1, subjectId: 1 }, { unique: true });

// Teacher Assignment
TeacherAssignmentSchema.index({ schoolId: 1, academicYearId: 1, gradeId: 1, sectionId: 1, subjectId: 1, teacherId: 1 }, { unique: true });

// Period
PeriodSchema.index({ schoolId: 1, code: 1 }, { unique: true });
PeriodSchema.index({ schoolId: 1, sequence: 1 }, { unique: true });

// Timetable
TimetableSchema.index({ schoolId: 1, academicYearId: 1, sectionId: 1, dayOfWeek: 1, periodId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
TimetableSchema.index({ schoolId: 1, academicYearId: 1, teacherId: 1, dayOfWeek: 1, periodId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
TimetableSchema.index({ schoolId: 1, academicYearId: 1, roomNumber: 1, dayOfWeek: 1, periodId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE', roomNumber: { $gt: '' } } });

// Attendance
AttendanceRecordSchema.index({ schoolId: 1, attendanceSessionId: 1, studentId: 1 }, { unique: true });
```

---

## 5. Automated Test Suite Results

Test script: `School-mongo/src/scripts/testAcademicModuleValidation.js`.
All tests executed against Zod schemas, Mongoose models, and live MongoDB cluster.

```
===============================================================
 ACADEMIC MODULE COMPREHENSIVE VALIDATION & BUSINESS RULE TESTS
===============================================================

--- 1. ACADEMIC YEAR TESTS ---
  ✓ Normalize 2026-2027
  ✓ Normalize "2026 - 2027" with spaces
  ✓ Normalize multiple spaces around hyphen
  ✓ Valid year continuity: 2026-2027
  ✓ Valid year continuity: 2026 - 2027
  ✓ Reject 2026-2026 (end equals start)
  ✓ Reject 2026-2028 (end > start + 1)
  ✓ Reject 2027-2026 (end < start)
  ✓ Create 2026-2027 normalizes and passes
  ✓ Academic year defaults to INACTIVE status
  ✓ Reject invalid format (2026/2027)
  ✓ Reject empty/whitespace academic year
  ✓ Reject invalid dates (Start Date > End Date)

--- 2. ACADEMIC TERM TESTS ---
  ✓ Valid academic term parses successfully
  ✓ Term name trims leading/trailing spaces
  ✓ Term code normalizes to uppercase
  ✓ Term defaults to INACTIVE status
  ✓ Reject term with Start Date >= End Date
  ✓ Reject non-positive sequence order for Term

--- 3. GRADE / CLASS TESTS ---
  ✓ Valid grade parses
  ✓ Grade name trims whitespace
  ✓ Grade code uppercased
  ✓ Grade defaults to INACTIVE status
  ✓ Reject negative display sequenceOrder for Grade

--- 4. SECTION TESTS ---
  ✓ Valid section parses
  ✓ Section name trims whitespace
  ✓ Section code normalizes to uppercase
  ✓ Section defaults to INACTIVE status
  ✓ Reject section capacity <= 0

--- 5. MASTER SUBJECT TESTS ---
  ✓ Valid subject parses
  ✓ Subject name trimmed
  ✓ Subject code normalized to uppercase
  ✓ Subject defaults to INACTIVE status
  ✓ Reject invalid subject type

--- 6. CLASS SUBJECT CONFIG TESTS ---
  ✓ Valid class subject configuration passes (Theory 70 + Practical 30 = 100)
  ✓ Reject passMarks > maxMarks
  ✓ Reject Theory (80) + Practical (30) !== MaxMarks (100)
  ✓ Reject elective subject without elective group

--- 7. TEACHER ASSIGNMENT TESTS ---
  ✓ Valid teacher assignment passes
  ✓ Teacher assignment defaults to INACTIVE status
  ✓ Reject teacher assignment with Start Date > End Date

--- 8. PERIOD CONFIGURATION TESTS ---
  ✓ Valid period configuration passes
  ✓ Period name trimmed
  ✓ Period code uppercased
  ✓ Period defaults to INACTIVE status
  ✓ Reject period with startTime >= endTime

--- 9. TIMETABLE TESTS ---
  ✓ Valid timetable entry passes schema validation
  ✓ Timetable entry defaults to INACTIVE status
  ✓ Reject invalid day of week

--- 10. LEAVE REQUEST TESTS ---
  ✓ Valid leave request passes
  ✓ Reject leave request with Start Date > End Date

--- 11. LIVE DATABASE CONSTRAINTS & ATOMICITY TESTS ---
  ✓ DB stores normalized canonical year without spaces
  ✓ DB creates academic year with default status INACTIVE
  ✓ DB creates academic year with default isCurrent: false
  ✓ MongoDB index or validation blocks duplicate academic year for school
  ✓ Exactly one active academic year maintained for school
  ✓ Previous active year was deactivated atomically
  ✓ Term created with default INACTIVE
  ✓ Duplicate term code rejected within same academic year
  ✓ Grade created with default status INACTIVE
  ✓ Section created with default status INACTIVE
  ✓ Subject created with default status INACTIVE
  ✓ Dependent terms exist for academic year
  ✓ Prevent deleting academic year when dependent historical records exist
  ✓ Prevent deactivating single active academic year without selecting replacement
  ✓ Timetable entry created
  ✓ Prevent two timetable entries for same section during same day/period
  ✓ Prevent teacher from being assigned to two classes at same day/period
  ✓ Prevent overlapping periods where configuration prohibits overlap
  ✓ Reject EXCUSED attendance without reason
  ✓ Accept EXCUSED attendance with reason
  ✓ Accept PRESENT attendance without reason
  ✓ Prevent overlapping leave requests for same student

===============================================================
 TEST SUMMARY: 73 PASSED, 0 FAILED (100% SUCCESS)
===============================================================
```

---

## 6. Sub-Module Validation & Integrity Matrix

| # | Sub-Module | Canonical Format / Normalization | Key Business Rules | Database Constraints | Default Status |
|---|---|---|---|---|---|
| 1 | **Academic Years** | `YYYY-YYYY` (e.g. `2026-2027`), trimmed | $End = Start + 1$, Start < End, atomic single active year | `{ schoolId: 1, code: 1 }` (unique), `{ schoolId: 1, isCurrent: 1 }` (partial unique) | `INACTIVE` |
| 2 | **Academic Terms** | Name trimmed, Code uppercase | Must belong inside Academic Year dates, non-overlapping, unique sequence | `{ schoolId: 1, academicYearId: 1, code: 1 }` (unique), `{ schoolId: 1, academicYearId: 1, sequence: 1 }` (unique) | `INACTIVE` |
| 3 | **Grades / Classes** | Name trimmed, Code uppercase | Unique order, dependency-aware delete guard | `{ schoolId: 1, code: 1 }` (unique), `{ schoolId: 1, sequenceOrder: 1 }` (unique) | `INACTIVE` |
| 4 | **Sections** | Name & code trimmed | Capacity > 0, cannot reduce capacity below enrolled headcount | `{ schoolId: 1, gradeId: 1, name: 1 }` (unique), `{ schoolId: 1, gradeId: 1, code: 1 }` (unique) | `INACTIVE` |
| 5 | **Master Subjects** | Name trimmed, Code uppercase | Valid subject types (`CORE`, `ELECTIVE`, etc.), case-insensitive duplicate prevention | `{ schoolId: 1, code: 1 }` (unique), `{ schoolId: 1, normalizedName: 1 }` (unique) | `INACTIVE` |
| 6 | **Class Subject Config** | Foreign Keys verified | $0 \le Pass \le Max$, $Theory + Practical \equiv Max$, mandatory group if elective | `{ schoolId: 1, academicYearId: 1, gradeId: 1, subjectId: 1 }` (unique) | `INACTIVE` |
| 7 | **Teacher Assignments** | Active staff check | Section in Grade, Subject in Class, exactly 1 PRIMARY teacher per section/subject | `{ schoolId: 1, academicYearId: 1, gradeId: 1, sectionId: 1, subjectId: 1, teacherId: 1 }` (unique) | `INACTIVE` |
| 8 | **Period Config** | `HH:mm` format | $Start < End$, auto duration calculation, no overlapping periods | `{ schoolId: 1, code: 1 }` (unique), `{ schoolId: 1, sequence: 1 }` (unique) | `INACTIVE` |
| 9 | **Timetable** | Day enum, active periods | Section conflict guard, Teacher double-booking guard, Room conflict guard | Unique compound indexes with `partialFilterExpression: { status: 'ACTIVE' }` | `INACTIVE` |
| 10 | **Mark Attendance** | Active enrollment verified | Valid statuses, mandatory reason for `EXCUSED` and `LEAVE`, locked state protection | `{ schoolId: 1, attendanceSessionId: 1, studentId: 1 }` (unique) | `LOCKED` on submit |
| 11 | **Attendance Monitor** | Read-only with lazy filters | Strict filter sanitization, zero unneeded network requests on mount | Read queries scoped by `schoolId` | N/A |
| 12 | **Attendance Audit** | Append-only immutable log | Actor, action, old/new diff, IP, user-agent, request ID | Indexed by `schoolId`, `entityId`, `createdAt` | Immutable |
| 13 | **Leave Requests** | $Start \le End$, document requirement | Overlap detection, workflow state machine transitions, rejection reason | Scoped by `schoolId`, `applicantId`, `status` | `PENDING` |
