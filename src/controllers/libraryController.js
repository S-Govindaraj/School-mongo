const Library = require('../models/Library');
const BookCategory = require('../models/BookCategory');
const Author = require('../models/Author');
const Publisher = require('../models/Publisher');
const Book = require('../models/Book');
const BookCopy = require('../models/BookCopy');
const LibraryMember = require('../models/LibraryMember');
const BookIssue = require('../models/BookIssue');
const LibrarySetting = require('../models/LibrarySetting');

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({
    success: true,
    data,
    meta: { requestId: res.req?.requestId || res.req?.id || 'req_' + Date.now() },
  });
};

exports.getDashboard = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;

    const [
      totalBooks,
      totalCopies,
      availableCopies,
      issuedCopies,
      overdueCopies,
      totalMembers,
      settings
    ] = await Promise.all([
      Book.countDocuments({ schoolId, status: 'ACTIVE' }),
      BookCopy.countDocuments({ schoolId }),
      BookCopy.countDocuments({ schoolId, status: 'AVAILABLE' }),
      BookCopy.countDocuments({ schoolId, status: 'ISSUED' }),
      BookIssue.countDocuments({ schoolId, status: 'OVERDUE' }),
      LibraryMember.countDocuments({ schoolId, status: 'ACTIVE' }),
      LibrarySetting.findOne({ schoolId })
    ]);

    const activeIssues = await BookIssue.find({ schoolId, status: { $in: ['ISSUED', 'OVERDUE'] } })
      .populate({ path: 'bookCopyId', populate: { path: 'bookId', select: 'title isbn' } })
      .populate('memberId')
      .limit(10)
      .sort({ dueDate: 1 });

    sendSuccess(res, {
      summary: {
        totalBooks,
        totalCopies,
        availableCopies,
        issuedCopies,
        overdueCopies,
        totalMembers,
      },
      settings: settings || { finePerDay: 5, defaultLoanPeriodDays: 14, maximumBooks: 5 },
      recentIssues: activeIssues
    });
  } catch (err) {
    next(err);
  }
};

// Libraries
exports.getLibraries = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const libraries = await Library.find({ schoolId }).sort({ name: 1 });
    sendSuccess(res, libraries);
  } catch (err) {
    next(err);
  }
};

exports.createLibrary = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const library = await Library.create({ ...req.body, schoolId });
    sendSuccess(res, library, 201);
  } catch (err) {
    next(err);
  }
};

// Categories, Authors, Publishers
exports.getCategories = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const categories = await BookCategory.find({ schoolId }).sort({ name: 1 });
    sendSuccess(res, categories);
  } catch (err) {
    next(err);
  }
};

exports.createCategory = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const category = await BookCategory.create({ ...req.body, schoolId });
    sendSuccess(res, category, 201);
  } catch (err) {
    next(err);
  }
};

exports.getAuthors = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const authors = await Author.find({ schoolId }).sort({ name: 1 });
    sendSuccess(res, authors);
  } catch (err) {
    next(err);
  }
};

exports.createAuthor = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const author = await Author.create({ ...req.body, schoolId });
    sendSuccess(res, author, 201);
  } catch (err) {
    next(err);
  }
};

exports.getPublishers = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const publishers = await Publisher.find({ schoolId }).sort({ name: 1 });
    sendSuccess(res, publishers);
  } catch (err) {
    next(err);
  }
};

exports.createPublisher = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const publisher = await Publisher.create({ ...req.body, schoolId });
    sendSuccess(res, publisher, 201);
  } catch (err) {
    next(err);
  }
};

// Books & Copies
exports.getBooks = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const books = await Book.find({ schoolId })
      .populate('categoryId', 'name code')
      .populate('authorIds', 'name')
      .populate('publisherId', 'name')
      .sort({ createdAt: -1 });
    sendSuccess(res, books);
  } catch (err) {
    next(err);
  }
};

exports.createBook = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const book = await Book.create({ ...req.body, schoolId });
    sendSuccess(res, book, 201);
  } catch (err) {
    next(err);
  }
};

exports.getBookCopies = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { bookId } = req.query;
    const filter = { schoolId };
    if (bookId) filter.bookId = bookId;

    const copies = await BookCopy.find(filter)
      .populate('bookId', 'title isbn categoryId')
      .sort({ accessionNumber: 1 });
    sendSuccess(res, copies);
  } catch (err) {
    next(err);
  }
};

exports.createBookCopy = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const copy = await BookCopy.create({ ...req.body, schoolId });
    sendSuccess(res, copy, 201);
  } catch (err) {
    next(err);
  }
};

// Members
exports.getMembers = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const members = await LibraryMember.find({ schoolId })
      .populate('studentId', 'firstName lastName admissionNumber gradeName sectionName')
      .populate('staffId', 'firstName lastName employeeId designation')
      .sort({ createdAt: -1 });
    sendSuccess(res, members);
  } catch (err) {
    next(err);
  }
};

exports.createMember = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const member = await LibraryMember.create({ ...req.body, schoolId });
    sendSuccess(res, member, 201);
  } catch (err) {
    next(err);
  }
};

// Issues & Returns
exports.getIssues = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const issues = await BookIssue.find({ schoolId })
      .populate({ path: 'bookCopyId', populate: { path: 'bookId', select: 'title isbn' } })
      .populate('memberId')
      .sort({ createdAt: -1 });
    sendSuccess(res, issues);
  } catch (err) {
    next(err);
  }
};

exports.issueBook = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { bookCopyId, memberId, loanDays } = req.body;

    // Verify copy is AVAILABLE
    const copy = await BookCopy.findOne({ _id: bookCopyId, schoolId });
    if (!copy || copy.status !== 'AVAILABLE') {
      return res.status(400).json({
        success: false,
        error: { code: 'BOOK_NOT_AVAILABLE', message: 'Book copy is not available for issue' }
      });
    }

    // Verify member active & issue limit
    const member = await LibraryMember.findOne({ _id: memberId, schoolId });
    if (!member || member.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: { code: 'MEMBER_INACTIVE', message: 'Library member is inactive or suspended' }
      });
    }

    const activeIssuesCount = await BookIssue.countDocuments({ schoolId, memberId, status: 'ISSUED' });
    if (activeIssuesCount >= (member.issueLimit || 3)) {
      return res.status(400).json({
        success: false,
        error: { code: 'MEMBER_LIMIT_EXCEEDED', message: `Member issue limit of ${member.issueLimit} books exceeded` }
      });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (loanDays || 14));

    const issue = await BookIssue.create({
      schoolId,
      libraryId: copy.libraryId,
      bookCopyId,
      memberId,
      dueDate,
      status: 'ISSUED',
      issuedBy: req.user?._id
    });

    // Mark copy as ISSUED
    copy.status = 'ISSUED';
    await copy.save();

    sendSuccess(res, issue, 201);
  } catch (err) {
    next(err);
  }
};

exports.returnBook = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const { issueId, finePaid } = req.body;

    const issue = await BookIssue.findOne({ _id: issueId, schoolId });
    if (!issue || issue.status !== 'ISSUED') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ISSUE', message: 'Book issue record not active' }
      });
    }

    const returnDate = new Date();
    let fineAmount = 0;

    // Calculate overdue fine
    if (returnDate > issue.dueDate) {
      const diffTime = Math.abs(returnDate - issue.dueDate);
      const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const setting = await LibrarySetting.findOne({ schoolId });
      const rate = setting?.finePerDay || 5;
      fineAmount = overdueDays * rate;
    }

    issue.returnDate = returnDate;
    issue.status = 'RETURNED';
    issue.fineAmount = fineAmount;
    issue.finePaidStatus = finePaid ? 'PAID' : fineAmount > 0 ? 'PENDING' : 'PAID';
    issue.returnedBy = req.user?._id;
    await issue.save();

    // Mark book copy back to AVAILABLE
    await BookCopy.updateOne({ _id: issue.bookCopyId, schoolId }, { status: 'AVAILABLE' });

    sendSuccess(res, issue);
  } catch (err) {
    next(err);
  }
};

// Settings
exports.getSettings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    let setting = await LibrarySetting.findOne({ schoolId });
    if (!setting) {
      setting = await LibrarySetting.create({ schoolId });
    }
    sendSuccess(res, setting);
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const schoolId = req.schoolContext.schoolId;
    const setting = await LibrarySetting.findOneAndUpdate(
      { schoolId },
      req.body,
      { new: true, upsert: true }
    );
    sendSuccess(res, setting);
  } catch (err) {
    next(err);
  }
};
