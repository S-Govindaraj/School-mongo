const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Guardian = require('../models/Guardian');
const Invoice = require('../models/Invoice');
const Book = require('../models/Book');
const Vehicle = require('../models/Vehicle');
const TransportRoute = require('../models/TransportRoute');
const Announcement = require('../models/Announcement');

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({
    success: true,
    data,
    meta: { requestId: res.req?.requestId || res.req?.id || 'req_' + Date.now() },
  });
};

exports.globalSearch = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return sendSuccess(res, { results: [] });
    }

    const regex = new RegExp(q.trim(), 'i');

    const [
      students,
      staff,
      guardians,
      invoices,
      books,
      vehicles,
      routes,
      announcements
    ] = await Promise.all([
      Student.find({ schoolId, $or: [{ firstName: regex }, { lastName: regex }, { admissionNumber: regex }] }).limit(5),
      Staff.find({ schoolId, $or: [{ firstName: regex }, { lastName: regex }, { employeeId: regex }] }).limit(5),
      Guardian.find({ schoolId, $or: [{ firstName: regex }, { lastName: regex }, { phone: regex }] }).limit(5),
      Invoice.find({ schoolId, invoiceNumber: regex }).limit(5),
      Book.find({ schoolId, $or: [{ title: regex }, { isbn: regex }] }).limit(5),
      Vehicle.find({ schoolId, $or: [{ registrationNumber: regex }, { vehicleNumber: regex }] }).limit(5),
      TransportRoute.find({ schoolId, $or: [{ routeName: regex }, { routeCode: regex }] }).limit(5),
      Announcement.find({ schoolId, title: regex }).limit(5)
    ]);

    const results = [
      ...students.map(s => ({ id: s._id, type: 'STUDENT', title: `${s.firstName} ${s.lastName}`, subtitle: `Adm #: ${s.admissionNumber}`, url: `/students/${s._id}` })),
      ...staff.map(st => ({ id: st._id, type: 'STAFF', title: `${st.firstName} ${st.lastName}`, subtitle: `Emp #: ${st.employeeId}`, url: `/people/staff` })),
      ...guardians.map(g => ({ id: g._id, type: 'GUARDIAN', title: `${g.firstName} ${g.lastName}`, subtitle: `Phone: ${g.phone}`, url: `/guardians` })),
      ...invoices.map(i => ({ id: i._id, type: 'INVOICE', title: i.invoiceNumber, subtitle: `Amount: ₹${i.totalAmount}`, url: `/finance/invoices` })),
      ...books.map(b => ({ id: b._id, type: 'BOOK', title: b.title, subtitle: `ISBN: ${b.isbn || 'N/A'}`, url: `/library/books` })),
      ...vehicles.map(v => ({ id: v._id, type: 'VEHICLE', title: v.registrationNumber, subtitle: `Capacity: ${v.capacity}`, url: `/transport/vehicles` })),
      ...routes.map(r => ({ id: r._id, type: 'ROUTE', title: `${r.routeCode} - ${r.routeName}`, subtitle: r.direction, url: `/transport/routes` })),
      ...announcements.map(a => ({ id: a._id, type: 'ANNOUNCEMENT', title: a.title, subtitle: a.status, url: `/communications/announcements` }))
    ];

    sendSuccess(res, { query: q, total: results.length, results });
  } catch (err) {
    next(err);
  }
};
