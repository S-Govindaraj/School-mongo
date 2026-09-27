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
    const resolvedStudentId = student._id;

    const [currentEnrollment, allEnrollments, examResults, pendingDocsCount, guardians, inactiveGuardianNames] = await Promise.all([
      repo.getCurrentEnrollment(schoolId, resolvedStudentId),
      repo.getAllEnrollments(schoolId, resolvedStudentId),
      repo.getExamResultsAllYears(schoolId, resolvedStudentId),
      repo.countPendingDocuments(schoolId, resolvedStudentId),
      repo.getGuardians(schoolId, resolvedStudentId),
      repo.getInactiveGuardianNames(schoolId, resolvedStudentId),
    ]);

    const activeEnrollment = currentEnrollment || allEnrollments.find((e) => e.isCurrent) || null;
    const academicYearId = activeEnrollment?.academicYearId?._id || activeEnrollment?.academicYearId;

    const [attendanceRecords, invoices, classTeacher] = await Promise.all([
      academicYearId ? repo.getAttendanceRecords(schoolId, resolvedStudentId, academicYearId) : Promise.resolve([]),
      academicYearId ? repo.getInvoices(schoolId, resolvedStudentId, academicYearId) : Promise.resolve([]),
      activeEnrollment
        ? repo.getClassTeacher(
            schoolId,
            academicYearId,
            activeEnrollment.gradeId?._id || activeEnrollment.gradeId,
            activeEnrollment.sectionId?._id || activeEnrollment.sectionId
          )
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

    let sanitizedStudent = withId(student);
    if (sanitizedStudent?.emergencyContact?.name && inactiveGuardianNames.has(sanitizedStudent.emergencyContact.name.toLowerCase().trim())) {
      sanitizedStudent = {
        ...sanitizedStudent,
        emergencyContact: null,
      };
    }

    return {
      student: sanitizedStudent,
      currentEnrollment: withId(activeEnrollment),
      classTeacher,
      guardians,
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
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const [enrollments, history] = await Promise.all([
      repo.getAllEnrollments(schoolId, resolvedStudentId),
      repo.getAcademicHistory(schoolId, resolvedStudentId),
    ]);

    const historyByEnrollment = {};
    history.forEach((h) => { historyByEnrollment[String(h.enrollmentId)] = h; });

    return withIds(enrollments).map((e) => ({
      ...e,
      academicHistory: withId(historyByEnrollment[e.id]),
    }));
  }

  static async getYearDetail(schoolId, studentId, academicYearId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const enrollment = await repo.getEnrollmentForYear(schoolId, resolvedStudentId, academicYearId);
    if (!enrollment) {
      throw new NotFoundError('No enrollment found for this student in the requested academic year');
    }

    const [history, examResults, attendanceRecords, invoices, classSubjects] = await Promise.all([
      repo.getAcademicHistory(schoolId, resolvedStudentId),
      repo.getExamResults(schoolId, resolvedStudentId, academicYearId),
      repo.getAttendanceRecords(schoolId, resolvedStudentId, academicYearId),
      repo.getInvoices(schoolId, resolvedStudentId, academicYearId),
      repo.getClassSubjects(schoolId, academicYearId, enrollment.gradeId?._id || enrollment.gradeId),
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
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    let enrollment = academicYearId
      ? await repo.getEnrollmentForYear(schoolId, resolvedStudentId, academicYearId)
      : await repo.getCurrentEnrollment(schoolId, resolvedStudentId);
    if (!enrollment && !academicYearId) {
      const all = await repo.getAllEnrollments(schoolId, resolvedStudentId);
      enrollment = all.find((e) => e.isCurrent) || all[0] || null;
    }
    let resolvedYearId = enrollment?.academicYearId?._id || enrollment?.academicYearId;
    if (!resolvedYearId) {
      resolvedYearId = await repo.resolveAcademicYear(schoolId, academicYearId);
    }

    let subjects = [];
    if (enrollment) {
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

      subjects = classSubjects.map((cs) => ({
        ...cs,
        id: String(cs._id),
        teachers: teacherBySubject[String(cs.subjectId?._id || cs.subjectId)] || [],
      }));
    }

    const standards = await repo.getAllStandardsWithSectionsAndSubjects(schoolId, resolvedYearId, resolvedStudentId);

    return {
      enrollment: enrollment ? withId(enrollment) : null,
      subjects,
      standards,
      academicYearId: resolvedYearId,
    };
  }

  static async getAttendance(schoolId, studentId, academicYearId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    let targetAY = academicYearId;
    if (!targetAY) {
      const currentEnr = await repo.getCurrentEnrollment(schoolId, resolvedStudentId);
      targetAY = currentEnr?.academicYearId?._id || currentEnr?.academicYearId;
    }
    if (!targetAY) {
      const all = await repo.getAllEnrollments(schoolId, resolvedStudentId);
      const enr = all.find((e) => e.isCurrent) || all[0] || null;
      targetAY = enr?.academicYearId?._id || enr?.academicYearId;
    }
    targetAY = await repo.resolveAcademicYear(schoolId, targetAY);
    let records = await repo.getAttendanceRecords(schoolId, resolvedStudentId, targetAY);
    if (records.length === 0 && !academicYearId) {
      const allRecords = await repo.getAttendanceRecords(schoolId, resolvedStudentId);
      if (allRecords.length > 0) {
        records = allRecords;
        if (!targetAY && allRecords[0]?.academicYearId) {
          targetAY = allRecords[0].academicYearId;
        }
      }
    }

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
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const results = await repo.getExamResults(schoolId, resolvedStudentId, academicYearId);
    const averagePercentage = results.length > 0
      ? round1(results.reduce((sum, r) => sum + r.percentage, 0) / results.length)
      : null;
    return { averagePercentage, results: withIds(results) };
  }

  static async getPerformanceTrend(schoolId, studentId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const results = await repo.getExamResultsAllYears(schoolId, resolvedStudentId);

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
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const [invoices, concessions] = await Promise.all([
      repo.getInvoices(schoolId, resolvedStudentId, academicYearId),
      repo.getConcessions(schoolId, resolvedStudentId, academicYearId),
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
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    let enrollment = academicYearId
      ? await repo.getEnrollmentForYear(schoolId, resolvedStudentId, academicYearId)
      : await repo.getCurrentEnrollment(schoolId, resolvedStudentId);
    if (!enrollment && !academicYearId) {
      const all = await repo.getAllEnrollments(schoolId, resolvedStudentId);
      enrollment = all.find((e) => e.isCurrent) || all[0] || null;
    }
    if (!enrollment) {
      return { enrollment: null, entries: [] };
    }
    const resolvedYearId = enrollment.academicYearId?._id || enrollment.academicYearId;
    const sectionId = enrollment.sectionId?._id || enrollment.sectionId;
    const entries = await repo.getSectionTimetable(schoolId, resolvedYearId, sectionId);
    return { enrollment: withId(enrollment), entries: withIds(entries) };
  }

  static async getGuardians(schoolId, studentId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    return repo.getGuardians(schoolId, resolvedStudentId);
  }

  static async getDocuments(schoolId, studentId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const documents = await repo.getDocuments(schoolId, resolvedStudentId);
    return withIds(documents);
  }

  static async getTransport(schoolId, studentId, academicYearId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const assignments = await repo.getTransportAssignment(schoolId, resolvedStudentId, academicYearId);
    return withIds(assignments);
  }

  static async getTimeline(schoolId, studentId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const events = await repo.getTimeline(schoolId, resolvedStudentId, 50);
    return withIds(events);
  }

  static async getDiscipline(schoolId, studentId) {
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const incidents = await repo.getDisciplineIncidents(schoolId, resolvedStudentId);
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
    const student = await requireStudent(schoolId, studentId);
    const resolvedStudentId = student._id;
    const [healthProfile, visits] = await Promise.all([
      repo.getHealthProfile(schoolId, resolvedStudentId),
      repo.getMedicalVisits(schoolId, resolvedStudentId),
    ]);

    return {
      healthProfile: withId(healthProfile),
      visits: withIds(visits),
    };
  }
}

module.exports = Student360Service;
