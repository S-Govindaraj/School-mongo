const ExportJob = require('../models/ExportJob');

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({
    success: true,
    data,
    meta: { requestId: res.req?.requestId || res.req?.id || 'req_' + Date.now() },
  });
};

exports.getExportJobs = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const jobs = await ExportJob.find({ schoolId, requestedBy: req.user?._id }).sort({ createdAt: -1 });
    sendSuccess(res, jobs);
  } catch (err) {
    next(err);
  }
};

exports.createExportJob = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { reportCode, module, exportFormat, filters } = req.body;

    const fileName = `${reportCode}_${Date.now()}.${(exportFormat || 'csv').toLowerCase()}`;

    const job = await ExportJob.create({
      schoolId,
      reportCode: reportCode || 'CUSTOM_REPORT',
      module: module || 'GENERAL',
      exportFormat: exportFormat || 'CSV',
      filters: filters || {},
      status: 'COMPLETED',
      fileName,
      fileSize: 1024 * 14,
      downloadUrl: `/api/v1/exports/download-file?name=${fileName}`,
      requestedBy: req.user?._id,
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 86400000)
    });

    sendSuccess(res, job, 201);
  } catch (err) {
    next(err);
  }
};

exports.downloadExport = async (req, res, next) => {
  try {
    const { name } = req.query;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${name || 'export.csv'}"`);
    res.send(`"Report","ExportedAt"\n"${name}","${new Date().toISOString()}"\n`);
  } catch (err) {
    next(err);
  }
};
