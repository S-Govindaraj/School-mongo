const SyncRecord = require('../models/SyncRecord');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Student = require('../models/Student');
const LeaveRequest = require('../models/LeaveRequest');
const Visitor = require('../models/Visitor');
const { logAuditEvent } = require('../middleware/auditLogger');
const { ValidationError } = require('../utils/errors');

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
  async handleAttendanceSync({ schoolId, userId, payload }) {
    const { sessionId, records = [] } = payload;
    if (!sessionId) {
      throw new ValidationError('Session ID is required for attendance sync');
    }

    // Verify session existence and lock state
    const session = await AttendanceSession.findOne({ _id: sessionId, schoolId });
    if (!session) {
      const err = new Error('Attendance session not found on server');
      err.code = 'SYNC_CONFLICT';
      err.isConflict = true;
      throw err;
    }

    if (session.isLocked) {
      const err = new Error('Attendance session is already locked on server');
      err.code = 'SYNC_CONFLICT';
      err.isConflict = true;
      err.serverData = session;
      throw err;
    }

    const savedRecords = [];
    for (const r of records) {
      const student = await Student.findOne({ _id: r.studentId, schoolId });
      if (!student) continue;

      const record = await AttendanceRecord.findOneAndUpdate(
        { schoolId, sessionId, studentId: r.studentId },
        {
          status: r.status || 'PRESENT',
          remarks: r.remarks || 'Marked via Mobile Offline',
          markedBy: userId,
          markedAt: new Date()
        },
        { upsert: true, new: true }
      );
      savedRecords.push(record);
    }

    return { sessionId, count: savedRecords.length };
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
