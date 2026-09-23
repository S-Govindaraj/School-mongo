// PDF LAYOUT ONLY. This file receives already-computed data from its callers
// (reportCardController / examSubjectController, composing reportCardService /
// marksEntryService respectively) — it never queries the DB or calls another
// service itself.
const PDFDocument = require('pdfkit');

const safeFileToken = (value) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'document';

const drawTableRow = (doc, cols, values, opts = {}) => {
  const y = doc.y;
  cols.forEach((col, i) => {
    doc.text(String(values[i] != null ? values[i] : ''), col.x, y, { width: col.width, ...opts });
  });
  doc.moveDown(opts.lineGap ?? 0.6);
};

const drawRule = (doc) => {
  const y = doc.y;
  doc.moveTo(50, y).lineTo(545, y).stroke();
  doc.moveDown(0.3);
};

// streamReportCardPdf(res, schoolInfo, studentInfo, reportCard, thresholds)
//   schoolInfo:  { name, address }
//   studentInfo: { name, admissionNumber, gradeName, sectionName }
//   reportCard:  the object returned by reportCardService.generateReportCard
//   thresholds:  the grading-scale array (from gradingSchemeService.getThresholds)
//                — the legend footer reuses this verbatim, never hardcoded.
const streamReportCardPdf = (res, schoolInfo, studentInfo, reportCard, thresholds = []) => {
  res.setHeader('Content-Type', 'application/pdf');
  const fileName = `report-card-${safeFileToken(studentInfo?.admissionNumber || studentInfo?.name)}.pdf`;
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text(schoolInfo?.name || 'School', { align: 'center' });
  if (schoolInfo?.address) {
    doc.fontSize(10).font('Helvetica').text(schoolInfo.address, { align: 'center' });
  }
  doc.moveDown(0.5);
  doc.fontSize(14).font('Helvetica-Bold').text('Report Card', { align: 'center', underline: true });
  doc.moveDown();

  doc.fontSize(11).font('Helvetica');
  doc.text(`Student Name: ${studentInfo?.name || ''}`);
  doc.text(`Admission Number: ${studentInfo?.admissionNumber || ''}`);
  doc.text(`Grade / Section: ${[studentInfo?.gradeName, studentInfo?.sectionName].filter(Boolean).join(' / ')}`);
  if (reportCard?.academicTermId) {
    doc.text(`Term: ${reportCard.academicTermId}`);
  }
  doc.moveDown();

  const cols = [
    { x: 50, width: 250 },
    { x: 320, width: 90 },
    { x: 430, width: 90 },
  ];

  doc.font('Helvetica-Bold');
  drawTableRow(doc, cols, ['Subject', 'Percentage', 'Grade']);
  doc.font('Helvetica');
  drawRule(doc);

  (reportCard?.subjects || []).forEach((s) => {
    drawTableRow(doc, cols, [s.subjectName || s.subjectId, `${s.percentage}%`, s.grade]);
  });

  drawRule(doc);
  doc.font('Helvetica-Bold');
  drawTableRow(doc, cols, ['Overall', `${reportCard?.overallPercentage ?? ''}%`, reportCard?.overallGrade || '']);
  doc.font('Helvetica');
  doc.moveDown(0.3);

  const rankLine = reportCard?.rank != null
    ? `Rank: ${reportCard.rank}${reportCard.totalStudentsInSection ? ` of ${reportCard.totalStudentsInSection}` : ''}`
    : 'Rank: N/A';
  doc.text(rankLine);

  doc.moveDown(1.2);
  doc.fontSize(10).font('Helvetica-Bold').text('Grading Scale');
  doc.font('Helvetica');
  (thresholds || []).forEach((t) => {
    doc.text(`${t.grade}: ${t.min}% and above`);
  });

  doc.end();
};

// streamMarkSheetPdf(res, schoolInfo, examSubjectInfo, marksGridRows)
//   schoolInfo:      { name, address }
//   examSubjectInfo: { examTitle, subjectName, gradeName, maxMarks, passMarks,
//                      hasTheoryPractical, theoryMaxMarks, practicalMaxMarks }
//   marksGridRows:   [{ rollNumber, studentName, marksObtained, theoryMarksObtained,
//                       practicalMarksObtained, isAbsent, isExempted, grade }]
//                    — the caller is responsible for computing `grade` per row
//                    (this file does layout only, no grading logic).
const streamMarkSheetPdf = (res, schoolInfo, examSubjectInfo, marksGridRows = []) => {
  res.setHeader('Content-Type', 'application/pdf');
  const fileName = `marksheet-${safeFileToken(examSubjectInfo?.subjectName)}.pdf`;
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text(schoolInfo?.name || 'School', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).font('Helvetica-Bold').text('Mark Sheet', { align: 'center', underline: true });
  doc.moveDown();

  doc.fontSize(11).font('Helvetica');
  doc.text(`Exam: ${examSubjectInfo?.examTitle || ''}`);
  doc.text(`Subject: ${examSubjectInfo?.subjectName || ''}`);
  doc.text(`Grade: ${examSubjectInfo?.gradeName || ''}`);
  if (examSubjectInfo?.hasTheoryPractical) {
    doc.text(`Max Marks: Theory ${examSubjectInfo.theoryMaxMarks} + Practical ${examSubjectInfo.practicalMaxMarks} = ${examSubjectInfo.maxMarks}`);
  } else {
    doc.text(`Max Marks: ${examSubjectInfo?.maxMarks}   Pass Marks: ${examSubjectInfo?.passMarks}`);
  }
  doc.moveDown();

  const isSplit = !!examSubjectInfo?.hasTheoryPractical;
  const cols = isSplit
    ? [
      { x: 50, width: 40 },
      { x: 95, width: 155 },
      { x: 260, width: 70 },
      { x: 335, width: 70 },
      { x: 415, width: 55 },
      { x: 475, width: 70 },
    ]
    : [
      { x: 50, width: 40 },
      { x: 95, width: 220 },
      { x: 320, width: 90 },
      { x: 415, width: 55 },
      { x: 475, width: 70 },
    ];
  const headers = isSplit
    ? ['Roll No', 'Student', 'Theory', 'Practical', 'Grade', 'Status']
    : ['Roll No', 'Student', 'Marks', 'Grade', 'Status'];

  doc.font('Helvetica-Bold');
  drawTableRow(doc, cols, headers);
  doc.font('Helvetica');
  drawRule(doc);

  marksGridRows.forEach((row) => {
    const status = row.isAbsent ? 'Absent' : row.isExempted ? 'Exempted' : 'Present';
    const values = isSplit
      ? [row.rollNumber, row.studentName, row.theoryMarksObtained ?? '-', row.practicalMarksObtained ?? '-', row.grade || '', status]
      : [row.rollNumber, row.studentName, row.marksObtained ?? '-', row.grade || '', status];
    drawTableRow(doc, cols, values);

    if (doc.y > 760) {
      doc.addPage();
    }
  });

  doc.end();
};

module.exports = { streamReportCardPdf, streamMarkSheetPdf };
