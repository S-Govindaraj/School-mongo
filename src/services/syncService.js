const SyncRecord = require('../models/SyncRecord');
const AttendanceStatus = require('../models/AttendanceStatus');
const Enrollment = require('../models/Enrollment');
const LeaveRequest = require('../models/LeaveRequest');
const Visitor = require('../models/Visitor');
const { logAuditEvent } = require('../middleware/auditLogger');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const { upsertPeriodEntry } = require('./attendanceDayService');
const { resolveAttendanceScope, assertSectionInScope } = require('./attendanceScopeService');

class SyncService {
  /**
   * Process an array of offline mutations with strict idempotency and conflict detection
   */
  async processMutations({ schoolId, userId, actor, mutations, requestId, ip, userAgent }) {
    const results = {
      synced: [],
      conflicts: [],
      errors: []
    };

    for (const item of mutations) {
      const {
        idempotencyKey,
        entityType,
        operation,
        payload,
        clientTimestamp
      } = item;

      if (!idempotencyKey) {
        results.errors.push({
          idempotencyKey: null,
          message: 'Missing idempotency key'
        });
        continue;
      }

      // 1. Idempotency Check: Was this exact client mutation already processed?
      const existing = await SyncRecord.findOne({ schoolId, idempotencyKey });
      if (existing) {
        console.log(`[SyncService] Idempotency match for key ${idempotencyKey}. Returning previous result.`);
        results.synced.push({
          idempotencyKey,
          status: existing.status,
          data: existing.responsePayload,
          isDuplicate: true
        });
        continue;
      }

      try {
        let resultData = null;

        // 2. Route by Entity Type & Operation
        if (entityType === 'ATTENDANCE' && (operation === 'MARK' || operation === 'BULK_MARK')) {
          resultData = await this.handleAttendanceSync({
            schoolId,
            userId,
            payload,
            actor
          });
        } else if (entityType === 'LEAVE' && operation === 'APPLY') {
          resultData = await this.handleLeaveSync({
            schoolId,
            userId,
            payload
          });
        } else if (entityType === 'VISITOR' && operation === 'CHECKIN') {
          resultData = await this.handleVisitorSync({
            schoolId,
            userId,
            payload
          });
        } else {
          // Generic entity sync
          resultData = { processed: true, entityType, operation };
        }

        // 3. Save Sync Record for Idempotency
        await SyncRecord.create({
          schoolId,
          userId,
          idempotencyKey,
          entityType,
          operation,
          status: 'SUCCESS',
          clientTimestamp: clientTimestamp ? new Date(clientTimestamp) : new Date(),
          responsePayload: resultData
        });

        // 4. Audit Trail with source = MOBILE_OFFLINE
        await logAuditEvent({
          schoolId,
          actorId: userId,
          actorName: actor?.name || 'Mobile Client',
          actorEmail: actor?.email || 'mobile@client.local',
          action: operation,
          entity: entityType,
          entityId: resultData?._id?.toString() || 'sync_batch',
          newValues: resultData,
          requestId,
          ipAddress: ip,
          userAgent: userAgent || 'SchoolERP Mobile PWA'
        });

        results.synced.push({
          idempotencyKey,
          status: 'SUCCESS',
          data: resultData
        });
      } catch (err) {
        console.error(`[SyncService] Error processing ${entityType}:${operation}:`, err);

        // Check if error is a business conflict
        if (err.code === 'SYNC_CONFLICT' || err.isConflict) {
          results.conflicts.push({
            idempotencyKey,
            entityType,
            clientPayload: payload,
            serverData: err.serverData || null,
            message: err.message
          });
        } else {
          results.errors.push({
            idempotencyKey,
            entityType,
            message: err.message
          });
        }
      }
    }

    return results;
  }

  // ─── Domain Sync Handlers ──────────────────────────────────
  /**
   * Mirrors POST /attendance/mark-bulk's contract (single-collection
   * AttendanceDay model — no more sessionId/AttendanceSession to reference).
   * Re-derives the caller's attendance scope here since this generic sync
   * route has no attendanceScope middleware attached — a class teacher's
   * offline mutation must be just as section-scoped as their online one.
   */
  async handleAttendanceSync({ schoolId, userId, payload, actor }) {
    const { academicYearId, date, gradeId, sectionId, periodId, attendanceType = 'DAILY', records = [] } = payload;
    if (!academicYearId || !date || !sectionId || !records.length) {
      throw new ValidationError('academicYearId, date, sectionId and at least one record are required for attendance sync.');
    }

    const scope = await resolveAttendanceScope({ schoolContext: { schoolId }, user: actor });
    try {
      assertSectionInScope(scope, sectionId);
    } catch (err) {
      throw new ForbiddenError(err.message);
    }

    const targetDate = new Date(date);
    const normalizedPeriodId = periodId || null;

    const allStatuses = await AttendanceStatus.find({ schoolId, status: 'ACTIVE' });
    const statusMap = new Map(allStatuses.map((s) => [String(s._id), s]));

    const recordStudentIds = records.map((r) => r.studentId);
    const activeEnrollments = await Enrollment.find({
      schoolId, studentId: { $in: recordStudentIds }, gradeId, sectionId, academicYearId,
      status: { $in: ['ENROLLED', 'ACTIVE'] },
    });
    const enrollmentMap = new Map(activeEnrollments.map((e) => [String(e.studentId), e]));

    let syncedCount = 0;
    let conflictCount = 0;

    for (const r of records) {
      const activeEnrollment = enrollmentMap.get(String(r.studentId));
      if (!activeEnrollment) continue;

      const statusDoc = statusMap.get(String(r.statusId));
      if (!statusDoc) continue;

      const result = await upsertPeriodEntry({
        schoolId, academicYearId, date: targetDate, attendanceType,
        studentId: r.studentId, enrollmentId: r.enrollmentId || activeEnrollment._id, gradeId, sectionId,
        periodId: normalizedPeriodId,
        fields: {
          statusId: r.statusId,
          remarks: String(r.remarks || '').trim(),
          markedBy: userId,
          markedAt: new Date(),
          source: 'BULK',
        },
      });

      if (result.outcome === 'LOCKED') {
        conflictCount++;
        continue;
      }
      syncedCount++;
    }

    if (syncedCount === 0 && conflictCount > 0) {
      const err = new Error('This attendance period is already locked on server.');
      err.code = 'SYNC_CONFLICT';
      err.isConflict = true;
      throw err;
    }

    return { date, sectionId, periodId: normalizedPeriodId, count: syncedCount, lockedSkipped: conflictCount };
  }

  async handleLeaveSync({ schoolId, userId, payload }) {
    return await LeaveRequest.create({
      schoolId,
      studentId: payload.studentId || userId,
      academicYearId: payload.academicYearId,
      fromDate: payload.fromDate || payload.startDate,
      toDate: payload.toDate || payload.endDate,
      reason: payload.reason || 'Leave requested',
      status: 'PENDING'
    });
  }

  async handleVisitorSync({ schoolId, userId, payload }) {
    return await Visitor.create({
      schoolId,
      name: payload.name,
      phone: payload.phone,
      purpose: payload.purpose,
      hostName: payload.hostName || 'Staff',
      checkInTime: new Date(),
      status: 'INSIDE'
    });
  }
}

module.exports = new SyncService();
