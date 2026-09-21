const repo = require('../repositories/student360Repository');
const { NotFoundError } = require('../utils/errors');

const round1 = (n) => Math.round(n * 10) / 10;

const requireStudent = async (schoolId, studentId) => {
  const student = await repo.findStudentInSchool(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student profile not found');
  }
  return student;
};

const withId = (doc) => (doc ? { ...doc, id: String(doc._id) } : null);
const withIds = (docs) => docs.map((d) => ({ ...d, id: String(d._id) }));

class Student360Service {
  static async getOverview(schoolId, studentId) {
    const student = await requireStudent(schoolId, studentId);

    const [currentEnrollment, allEnrollments, examResults, pendingDocsCount] = await Promise.all([
      repo.getCurrentEnrollment(schoolId, studentId),
      repo.getAllEnrollments(schoolId, studentId),
      repo.getExamResultsAllYears(schoolId, studentId),
      repo.countPendingDocuments(schoolId, studentId),
    ]);

    const academicYearId = currentEnrollment?.academicYearId?._id;

    const [attendanceRecords, invoices, classTeacher] = await Promise.all([
      academicYearId ? repo.getAttendanceRecords(schoolId, studentId, academicYearId) : Promise.resolve([]),
      academicYearId ? repo.getInvoices(schoolId, studentId, academicYearId) : Promise.resolve([]),
      currentEnrollment
        ? repo.getClassTeacher(schoolId, academicYearId, currentEnrollment.gradeId?._id, currentEnrollment.sectionId?._id)
        : Promise.resolve(null),
    ]);

    let presentCount = 0;
    for (const r of attendanceRecords) {
      if (r.statusId?.countsAsPresent) presentCount++;
    }
    const attendancePercentage = attendanceRecords.length > 0
      ? round1((presentCount / attendanceRecords.length) * 100)
      : null;

    const currentYearExams = examResults.filter((r) => String(r.academicYearId?._id || r.academicYearId) === String(academicYearId));
    const averagePercentage = currentYearExams.length > 0
      ? round1(currentYearExams.reduce((sum, r) => sum + r.percentage, 0) / currentYearExams.length)
      : null;

    const feeBalance = invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);
    const distinctYears = new Set(allEnrollments.map((e) => String(e.academicYearId?._id || e.academicYearId)));

    return {
      student: withId(student),
      currentEnrollment: withId(currentEnrollment),
      classTeacher,
      kpis: {
        attendancePercentage,
        averagePercentage,
        feeBalance,
        totalYearsEnrolled: distinctYears.size,
        pendingDocuments: pendingDocsCount,
      },
    };
  }

  static async getAcademicJourney(schoolId, studentId) {
    await requireStudent(schoolId, studentId);
    const [enrollments, history] = await Promise.all([
      repo.getAllEnrollments(schoolId, studentId),
      repo.getAcademicHistory(schoolId, studentId),
    ]);

    const historyByEnrollment = {};
    history.forEach((h) => { historyByEnrollment[String(h.enrollmentId)] = h; });

    return withIds(enrollments).map((e) => ({
      ...e,
      academicHistory: withId(historyByEnrollment[e.id]),
    }));
  }

  static async getYearDetail(schoolId, studentId, academicYearId) {
    await requireStudent(schoolId, studentId);
    const enrollment = await repo.getEnrollmentForYear(schoolId, studentId, academicYearId);
    if (!enrollment) {
      throw new NotFoundError('No enrollment found for this student in the requested academic year');
    }

    const [history, examResults, attendanceRecords, invoices, classSubjects] = await Promise.all([
      repo.getAcademicHistory(schoolId, studentId),
      repo.getExamResults(schoolId, studentId, academicYearId),
      repo.getAttendanceRecords(schoolId, studentId, academicYearId),
      repo.getInvoices(schoolId, studentId, academicYearId),
      repo.getClassSubjects(schoolId, academicYearId, enrollment.gradeId?._id),
    ]);

    const yearHistory = history.find((h) => String(h.enrollmentId) === String(enrollment._id));

    let presentCount = 0;
    attendanceRecords.forEach((r) => { if (r.statusId?.countsAsPresent) presentCount++; });
    const attendancePercentage = attendanceRecords.length > 0
      ? round1((presentCount / attendanceRecords.length) * 100)
      : null;

    const averagePercentage = examResults.length > 0
      ? round1(examResults.reduce((sum, r) => sum + r.percentage, 0) / examResults.length)
      : null;

    const feeBalance = invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

    return {
      enrollment: withId(enrollment),
      academicHistory: withId(yearHistory),
      subjects: withIds(classSubjects),
      examResults: withIds(examResults),
      attendanceSummary: { totalDays: attendanceRecords.length, presentCount, attendancePercentage },
      financeSummary: { invoiceCount: invoices.length, feeBalance },
    };
  }

  static async getSubjectsAndTeachers(schoolId, studentId, academicYearId) {
    await requireStudent(schoolId, studentId);
    const enrollment = academicYearId
      ? await repo.getEnrollmentForYear(schoolId, studentId, academicYearId)
      : await repo.getCurrentEnrollment(schoolId, studentId);
    if (!enrollment) {
      return { enrollment: null, subjects: [] };
    }

    const resolvedYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
    const gradeId = enrollment.gradeId?._id || enrollment.gradeId;
    const sectionId = enrollment.sectionId?._id || enrollment.sectionId;

    const [classSubjects, teacherAssignments] = await Promise.all([
      repo.getClassSubjects(schoolId, resolvedYearId, gradeId),
      repo.getTeacherAssignmentsForSection(schoolId, resolvedYearId, gradeId, sectionId),
    ]);

    const teacherBySubject = {};
    teacherAssignments.forEach((ta) => {
      const key = String(ta.subjectId?._id || ta.subjectId);
      if (!teacherBySubject[key]) teacherBySubject[key] = [];
      teacherBySubject[key].push({
        staff: ta.staffId,
        assignmentType: ta.assignmentType,
        isClassTeacher: ta.isClassTeacher,
      });
    });

    const subjects = classSubjects.map((cs) => ({
      ...cs,
      id: String(cs._id),
      teachers: teacherBySubject[String(cs.subjectId?._id || cs.subjectId)] || [],
    }));

    return { enrollment: withId(enrollment), subjects };
  }

  static async getAttendance(schoolId, studentId, academicYearId) {
    await requireStudent(schoolId, studentId);
    const targetAY = await repo.resolveAcademicYear(schoolId, academicYearId);
    const records = await repo.getAttendanceRecords(schoolId, studentId, targetAY);

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;
    records.forEach((r) => {
      if (r.statusId?.countsAsPresent) presentCount++;
      if (r.statusId?.countsAsAbsent) absentCount++;
      if (r.statusId?.code === 'LATE') lateCount++;
      if (r.statusId?.code === 'EXCUSED' || r.statusId?.code === 'LEAVE') excusedCount++;
    });
    const totalDays = records.length;
    const attendancePercentage = totalDays > 0 ? round1((presentCount / totalDays) * 100) : null;

    return {
      academicYearId: targetAY,
      totalDays,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      attendancePercentage,
      records: withIds(records),
    };
  }

  static async getExamsResults(schoolId, studentId, academicYearId) {
    await requireStudent(schoolId, studentId);
    const results = await repo.getExamResults(schoolId, studentId, academicYearId);
    const averagePercentage = results.length > 0
      ? round1(results.reduce((sum, r) => sum + r.percentage, 0) / results.length)
      : null;
    return { averagePercentage, results: withIds(results) };
  }

  static async getPerformanceTrend(schoolId, studentId) {
    await requireStudent(schoolId, studentId);
    const results = await repo.getExamResultsAllYears(schoolId, studentId);

    const byYear = {};
    results.forEach((r) => {
      const ay = r.academicYearId;
      const key = String(ay?._id || ay);
      if (!byYear[key]) byYear[key] = { academicYearId: key, academicYearName: ay?.name || '', total: 0, count: 0 };
      byYear[key].total += r.percentage;
      byYear[key].count += 1;
    });

    return Object.values(byYear)
      .map((y) => ({
        academicYearId: y.academicYearId,
        academicYearName: y.academicYearName,
        averagePercentage: round1(y.total / y.count),
      }))
      .sort((a, b) => a.academicYearName.localeCompare(b.academicYearName));
  }

  static async getFinance(schoolId, studentId, academicYearId) {
    await requireStudent(schoolId, studentId);
    const [invoices, concessions] = await Promise.all([
      repo.getInvoices(schoolId, studentId, academicYearId),
      repo.getConcessions(schoolId, studentId, academicYearId),
    ]);

    const totals = invoices.reduce((acc, inv) => {
      acc.totalAmount += inv.totalAmount || 0;
      acc.paidAmount += inv.paidAmount || 0;
      acc.balanceAmount += inv.balanceAmount || 0;
      return acc;
    }, { totalAmount: 0, paidAmount: 0, balanceAmount: 0 });

    return { totals, invoices: withIds(invoices), concessions: withIds(concessions) };
  }

  static async getTimetable(schoolId, studentId, academicYearId) {
    await requireStudent(schoolId, studentId);
    const enrollment = academicYearId
      ? await repo.getEnrollmentForYear(schoolId, studentId, academicYearId)
      : await repo.getCurrentEnrollment(schoolId, studentId);
    if (!enrollment) {
      return { enrollment: null, entries: [] };
    }
    const resolvedYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
    const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
    const entries = await repo.getSectionTimetable(schoolId, resolvedYearId, sectionId);
    return { enrollment: withId(enrollment), entries: withIds(entries) };
  }

  static async getGuardians(schoolId, studentId) {
    await requireStudent(schoolId, studentId);
    return repo.getGuardians(schoolId, studentId);
  }

  static async getDocuments(schoolId, studentId) {
    await requireStudent(schoolId, studentId);
    const documents = await repo.getDocuments(schoolId, studentId);
    return withIds(documents);
  }

  static async getTransport(schoolId, studentId, academicYearId) {
    await requireStudent(schoolId, studentId);
    const assignments = await repo.getTransportAssignment(schoolId, studentId, academicYearId);
    return withIds(assignments);
  }

  static async getTimeline(schoolId, studentId) {
    await requireStudent(schoolId, studentId);
    const events = await repo.getTimeline(schoolId, studentId, 50);
    return withIds(events);
  }

  static async getDiscipline(schoolId, studentId) {
    await requireStudent(schoolId, studentId);
    const incidents = await repo.getDisciplineIncidents(schoolId, studentId);
    if (incidents.length === 0) return [];

    const actions = await repo.getDisciplinaryActionsForIncidents(schoolId, incidents.map((i) => i._id));
    const actionsByIncident = {};
    actions.forEach((a) => {
      const key = String(a.incidentId);
      if (!actionsByIncident[key]) actionsByIncident[key] = [];
      actionsByIncident[key].push({ ...a, id: String(a._id) });
    });

    return incidents.map((incident) => ({
      ...incident,
      id: String(incident._id),
      actions: actionsByIncident[String(incident._id)] || [],
    }));
  }

  static async getMedical(schoolId, studentId) {
    await requireStudent(schoolId, studentId);
    const [healthProfile, visits] = await Promise.all([
      repo.getHealthProfile(schoolId, studentId),
      repo.getMedicalVisits(schoolId, studentId),
    ]);

    return {
      healthProfile: withId(healthProfile),
      visits: withIds(visits),
    };
  }
}

module.exports = Student360Service;
