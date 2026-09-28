const ReportDefinition = require('../models/ReportDefinition');
const ReportSchedule = require('../models/ReportSchedule');
const Student = require('../models/Student');
const AttendanceDay = require('../models/AttendanceDay');
const { flattenPeriodsToRecords } = require('../services/attendanceDayService');
const Invoice = require('../models/Invoice');

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({
    success: true,
    data,
    meta: { requestId: res.req?.requestId || res.req?.id || 'req_' + Date.now() },
  });
};

exports.getDefinitions = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    let definitions = await ReportDefinition.find({ schoolId }).sort({ module: 1, name: 1 });

    // Seed default definitions if none present
    if (definitions.length === 0) {
      const defaults = [
        {
          schoolId,
          reportCode: 'STUDENT_MASTER',
          name: 'Student Master Directory Report',
          description: 'Comprehensive list of all registered students with grade and section details',
          module: 'STUDENT',
          filters: ['gradeId', 'sectionId', 'status'],
          columns: [
            { field: 'admissionNumber', label: 'Admission #' },
            { field: 'firstName', label: 'First Name' },
            { field: 'lastName', label: 'Last Name' },
            { field: 'gradeName', label: 'Grade' },
            { field: 'sectionName', label: 'Section' },
            { field: 'gender', label: 'Gender' }
          ]
        },
        {
          schoolId,
          reportCode: 'ATTENDANCE_SUMMARY',
          name: 'Monthly Attendance Summary Report',
          description: 'Aggregated attendance metrics and absenteeism counts by class',
          module: 'ATTENDANCE',
          filters: ['dateRange', 'gradeId', 'sectionId'],
          columns: [
            { field: 'date', label: 'Date' },
            { field: 'presentCount', label: 'Present' },
            { field: 'absentCount', label: 'Absent' },
            { field: 'percentage', label: 'Attendance %' }
          ]
        },
        {
          schoolId,
          reportCode: 'FEE_COLLECTION',
          name: 'Fee Collection & Outstanding Report',
          description: 'Billing, collections, and overdue invoice balances breakdown',
          module: 'FINANCE',
          filters: ['dateRange', 'status'],
          columns: [
            { field: 'invoiceNumber', label: 'Invoice #' },
            { field: 'studentName', label: 'Student' },
            { field: 'totalAmount', label: 'Total Billed' },
            { field: 'paidAmount', label: 'Paid' },
            { field: 'balanceAmount', label: 'Outstanding' },
            { field: 'status', label: 'Status' }
          ]
        }
      ];
      definitions = await ReportDefinition.insertMany(defaults);
    }

    sendSuccess(res, definitions);
  } catch (err) {
    next(err);
  }
};

exports.generateReport = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { reportCode, filters } = req.body;

    let records = [];

    if (reportCode === 'STUDENT_MASTER') {
      const filter = { schoolId };
      if (filters?.status) filter.status = filters.status;
      const students = await Student.find(filter).limit(100);
      records = students.map(s => ({
        admissionNumber: s.admissionNumber,
        firstName: s.firstName,
        lastName: s.lastName,
        gradeName: s.gradeName || 'Grade 8',
        sectionName: s.sectionName || 'Section A',
        gender: s.gender || 'MALE'
      }));
    } else if (reportCode === 'ATTENDANCE_SUMMARY') {
      // Fixed: this previously read `a.status`, a field that doesn't exist
      // on the real schema (the status is a ref, `statusId`) — every row
      // silently came back presentCount:0, absentCount:0, and the
      // percentage was a hardcoded '96%' placeholder, not real data.
      const days = await AttendanceDay.find({ schoolId })
        .populate('periods.statusId', 'code countsAsPresent countsAsAbsent')
        .sort({ date: -1 })
        .limit(100)
        .lean();
      const flatRecords = flattenPeriodsToRecords(days);
      records = flatRecords.map((r) => {
        const isPresent = !!r.statusId?.countsAsPresent;
        const isAbsent = !!r.statusId?.countsAsAbsent;
        return {
          date: r.date,
          presentCount: isPresent ? 1 : 0,
          absentCount: isAbsent ? 1 : 0,
          percentage: isPresent ? '100%' : '0%',
        };
      });
    } else {
      const invoices = await Invoice.find({ schoolId }).limit(100);
      records = invoices.map(i => ({
        invoiceNumber: i.invoiceNumber,
        studentName: 'Student Record',
        totalAmount: i.totalAmount,
        paidAmount: i.paidAmount,
        balanceAmount: i.balanceAmount,
        status: i.status
      }));
    }

    sendSuccess(res, {
      reportCode,
      generatedAt: new Date(),
      totalRecords: records.length,
      records
    });
  } catch (err) {
    next(err);
  }
};

exports.getSchedules = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const schedules = await ReportSchedule.find({ schoolId }).sort({ nextRunAt: 1 });
    sendSuccess(res, schedules);
  } catch (err) {
    next(err);
  }
};

exports.createSchedule = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const schedule = await ReportSchedule.create({
      ...req.body,
      schoolId,
      nextRunAt: new Date(Date.now() + 86400000),
      createdBy: req.user?._id
    });
    sendSuccess(res, schedule, 201);
  } catch (err) {
    next(err);
  }
};
