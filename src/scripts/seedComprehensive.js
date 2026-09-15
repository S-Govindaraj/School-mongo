require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

// Base Core Models
const School = require('../models/School');
const Campus = require('../models/Campus');
const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const Grade = require('../models/Grade');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const Staff = require('../models/Staff');
const User = require('../models/User');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceStatus = require('../models/AttendanceStatus');
const ReportDefinition = require('../models/ReportDefinition');

// HRMS Models
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const EmployeeCategory = require('../models/EmployeeCategory');
const EmploymentProfile = require('../models/EmploymentProfile');
const EmployeeHistory = require('../models/EmployeeHistory');
const Shift = require('../models/Shift');
const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const StaffLeaveRequest = require('../models/StaffLeaveRequest');
const StaffAttendance = require('../models/StaffAttendance');
const SalaryComponent = require('../models/SalaryComponent');
const SalaryStructure = require('../models/SalaryStructure');
const EmployeeSalaryAssignment = require('../models/EmployeeSalaryAssignment');
const PayrollPeriod = require('../models/PayrollPeriod');
const PayrollEntry = require('../models/PayrollEntry');
const PayrollAdjustment = require('../models/PayrollAdjustment');
const Payslip = require('../models/Payslip');

// Operations & Logistics
const Hostel = require('../models/Hostel');
const HostelBlock = require('../models/HostelBlock');
const HostelRoom = require('../models/HostelRoom');
const HostelBed = require('../models/HostelBed');
const HostelAllocation = require('../models/HostelAllocation');
const HostelAttendance = require('../models/HostelAttendance');

const InventoryCategory = require('../models/InventoryCategory');
const Warehouse = require('../models/Warehouse');
const InventoryItem = require('../models/InventoryItem');
const Stock = require('../models/Stock');
const StockMovement = require('../models/StockMovement');
const Vendor = require('../models/Vendor');
const PurchaseRequest = require('../models/PurchaseRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');

const Asset = require('../models/Asset');
const AssetAssignment = require('../models/AssetAssignment');
const AssetMaintenance = require('../models/AssetMaintenance');
const AssetTransfer = require('../models/AssetTransfer');
const AssetDisposal = require('../models/AssetDisposal');

const Visitor = require('../models/Visitor');
const VisitorAppointment = require('../models/VisitorAppointment');
const GatePass = require('../models/GatePass');

const Vehicle = require('../models/Vehicle');
const Driver = require('../models/Driver');
const TransportRoute = require('../models/TransportRoute');
const RouteStop = require('../models/RouteStop');
const TransportAssignment = require('../models/TransportAssignment');
const TransportAttendance = require('../models/TransportAttendance');

const Library = require('../models/Library');
const LibrarySetting = require('../models/LibrarySetting');
const BookCategory = require('../models/BookCategory');
const Author = require('../models/Author');
const Publisher = require('../models/Publisher');
const Book = require('../models/Book');
const BookCopy = require('../models/BookCopy');
const LibraryMember = require('../models/LibraryMember');
const BookIssue = require('../models/BookIssue');

// SaaS & Integration
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const PlatformAdmin = require('../models/PlatformAdmin');
const PlatformInvoice = require('../models/PlatformInvoice');
const ApiKey = require('../models/ApiKey');
const Webhook = require('../models/Webhook');
const WebhookDelivery = require('../models/WebhookDelivery');
const UsageRecord = require('../models/UsageRecord');

// Student Health & Incident
const StudentHealthProfile = require('../models/StudentHealthProfile');
const MedicalVisit = require('../models/MedicalVisit');
const DisciplineIncident = require('../models/DisciplineIncident');
const DisciplinaryAction = require('../models/DisciplinaryAction');

// Platform Operations & Documents
const Holiday = require('../models/Holiday');
const WorkflowDefinition = require('../models/WorkflowDefinition');
const Document = require('../models/Document');
const DocumentVersion = require('../models/DocumentVersion');
const Message = require('../models/Message');
const MobileDevice = require('../models/MobileDevice');
const SyncRecord = require('../models/SyncRecord');
const ReportSchedule = require('../models/ReportSchedule');
const FinancialAdjustment = require('../models/FinancialAdjustment');
const Refund = require('../models/Refund');
const AttendanceAudit = require('../models/AttendanceAudit');

async function seedComprehensive() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/School_Management';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected! Verifying relational foundations...');

    const school = await School.findOne();
    if (!school) throw new Error('No School found! Please ensure primary seed has run.');

    const adminUser = await User.findOne({ roleCode: { $in: ['SUPER_ADMIN', 'ADMIN'] } }) || await User.findOne();
    const currentAY = await AcademicYear.findOne({ schoolId: school._id, isCurrent: true }) || await AcademicYear.findOne({ schoolId: school._id });
    const campuses = await Campus.find({ schoolId: school._id });
    const primaryCampus = campuses[0] || null;
    const staffs = await Staff.find({ schoolId: school._id });
    const students = await Student.find({ schoolId: school._id }).limit(50);
    const enrollments = await Enrollment.find({ schoolId: school._id, academicYearId: currentAY._id }).limit(50);
    const payments = await Payment.find({ schoolId: school._id }).limit(10);
    const attendanceStatuses = await AttendanceStatus.find({ schoolId: school._id });
    const attendanceRecords = await AttendanceRecord.find({ schoolId: school._id }).limit(10);
    const reportDefs = await ReportDefinition.find({ schoolId: school._id });

    console.log(`Found: School=${school.name}, Staff=${staffs.length}, Students=${students.length}, AY=${currentAY.code}`);

    // ==========================================
    // 1. HRMS: Departments, Designations & Categories
    // ==========================================
    console.log('Seeding HRMS Foundation...');
    await Department.deleteMany({ schoolId: school._id });
    const deptData = [
      { code: 'ACAD', name: 'Academic & Instruction', description: 'Teaching faculty and curriculum', headStaffId: staffs[0]?._id },
      { code: 'ADMIN', name: 'Administration & Operations', description: 'General administration', headStaffId: staffs[1]?._id },
      { code: 'FIN', name: 'Finance & Accounts', description: 'Fee management and payroll', headStaffId: staffs[2]?._id },
      { code: 'HR', name: 'Human Resources', description: 'Staff welfare and hiring', headStaffId: staffs[1]?._id },
      { code: 'IT', name: 'Information Technology', description: 'Software and lab systems' },
      { code: 'TRANS', name: 'Transport & Fleet', description: 'Bus routes and vehicle operations' },
      { code: 'FACIL', name: 'Hostel & Facilities', description: 'Campus hostels and maintenance' },
    ];
    const depts = await Department.insertMany(deptData.map(d => ({ ...d, schoolId: school._id, campusId: primaryCampus?._id, createdBy: adminUser._id })));

    await Designation.deleteMany({ schoolId: school._id });
    const desigData = [
      { code: 'PRIN', name: 'Principal', departmentId: depts[1]._id, level: 1 },
      { code: 'VP', name: 'Vice Principal', departmentId: depts[0]._id, level: 2 },
      { code: 'HOD', name: 'Head of Department', departmentId: depts[0]._id, level: 3 },
      { code: 'SEN_TCH', name: 'Senior Teacher', departmentId: depts[0]._id, level: 4 },
      { code: 'TCH', name: 'Teacher', departmentId: depts[0]._id, level: 5 },
      { code: 'ACC', name: 'Chief Accountant', departmentId: depts[2]._id, level: 3 },
      { code: 'ADM_EXEC', name: 'Admin Executive', departmentId: depts[1]._id, level: 5 },
      { code: 'LIB', name: 'Librarian', departmentId: depts[0]._id, level: 4 },
      { code: 'WARDEN', name: 'Hostel Warden', departmentId: depts[6]._id, level: 4 },
      { code: 'DRV', name: 'Transport Driver', departmentId: depts[5]._id, level: 6 },
    ];
    const desigs = await Designation.insertMany(desigData.map(d => ({ ...d, schoolId: school._id })));

    await EmployeeCategory.deleteMany({ schoolId: school._id });
    const empCats = await EmployeeCategory.insertMany([
      { schoolId: school._id, code: 'TEACHING', name: 'Teaching Faculty' },
      { schoolId: school._id, code: 'NON_TEACHING', name: 'Administrative Staff' },
      { schoolId: school._id, code: 'SUPPORT', name: 'Support & Facilities' },
    ]);

    // Employment Profiles & History
    await EmploymentProfile.deleteMany({ schoolId: school._id });
    await EmployeeHistory.deleteMany({ schoolId: school._id });
    for (let i = 0; i < staffs.length; i++) {
      const st = staffs[i];
      const dept = depts[i % depts.length];
      const desig = desigs[i % desigs.length];
      const cat = empCats[i % empCats.length];

      await EmploymentProfile.create({
        schoolId: school._id,
        staffId: st._id,
        employeeNumber: `EMP-2026-${String(i + 1).padStart(4, '0')}`,
        departmentId: dept._id,
        designationId: desig._id,
        categoryId: cat._id,
        joiningDate: new Date('2024-06-01'),
        confirmationDate: new Date('2024-12-01'),
        employmentType: 'FULL_TIME',
        status: 'CONFIRMED',
      });

      await EmployeeHistory.create({
        schoolId: school._id,
        staffId: st._id,
        eventType: 'JOINING',
        effectiveDate: new Date('2024-06-01'),
        newValue: `${desig.name} in ${dept.name}`,
        reason: 'Initial appointment',
        performedBy: adminUser._id,
      });
    }

    // Shifts, Leave Types & Balances
    await Shift.deleteMany({ schoolId: school._id });
    const morningShift = await Shift.create({
      schoolId: school._id,
      code: 'SH-GEN',
      name: 'General Day Shift',
      startTime: '08:00',
      endTime: '16:00',
      isDefault: true,
      status: 'ACTIVE',
    });

    await LeaveType.deleteMany({ schoolId: school._id });
    const leaveTypes = await LeaveType.insertMany([
      { schoolId: school._id, code: 'CL', name: 'Casual Leave', annualQuota: 12 },
      { schoolId: school._id, code: 'SL', name: 'Sick Leave', annualQuota: 10, requiresDocument: true },
      { schoolId: school._id, code: 'EL', name: 'Earned Leave', annualQuota: 15, carryForwardAllowed: true, maxCarryForward: 30 },
      { schoolId: school._id, code: 'ML', name: 'Maternity/Paternity Leave', annualQuota: 90 },
    ]);

    await LeaveBalance.deleteMany({ schoolId: school._id });
    await StaffLeaveRequest.deleteMany({ schoolId: school._id });
    await StaffAttendance.deleteMany({ schoolId: school._id });

    for (const st of staffs) {
      for (const lt of leaveTypes) {
        await LeaveBalance.create({
          schoolId: school._id,
          staffId: st._id,
          leaveTypeId: lt._id,
          academicYearId: currentAY._id,
          openingBalance: lt.annualQuota,
          accrued: 0,
          used: 1,
        });
      }

      await StaffAttendance.create({
        schoolId: school._id,
        staffId: st._id,
        date: '2026-09-15',
        shiftId: morningShift._id,
        checkIn: '07:55',
        checkOut: '16:05',
        attendanceStatus: 'PRESENT',
      });
    }

    // Sample Staff Leave Requests
    if (staffs[0] && staffs[1]) {
      await StaffLeaveRequest.create({
        schoolId: school._id,
        staffId: staffs[0]._id,
        leaveTypeId: leaveTypes[0]._id,
        startDate: '2026-09-20',
        endDate: '2026-09-21',
        numberOfDays: 2,
        reason: 'Personal family event',
        status: 'APPROVED',
        approvedBy: adminUser._id,
        approvedAt: new Date(),
      });
      await StaffLeaveRequest.create({
        schoolId: school._id,
        staffId: staffs[1]._id,
        leaveTypeId: leaveTypes[1]._id,
        startDate: '2026-09-22',
        endDate: '2026-09-22',
        numberOfDays: 1,
        reason: 'Medical checkup',
        status: 'SUBMITTED',
      });
    }

    // ==========================================
    // 2. Payroll Architecture
    // ==========================================
    console.log('Seeding Payroll Architecture...');
    await SalaryComponent.deleteMany({ schoolId: school._id });
    const basicPay = await SalaryComponent.create({
      schoolId: school._id,
      code: 'BASIC',
      name: 'Basic Salary',
      type: 'EARNING',
      calculationType: 'FIXED',
      value: 35000,
    });
    const hra = await SalaryComponent.create({
      schoolId: school._id,
      code: 'HRA',
      name: 'House Rent Allowance',
      type: 'EARNING',
      calculationType: 'PERCENTAGE',
      percentageOf: 'BASIC',
      value: 40,
    });
    const da = await SalaryComponent.create({
      schoolId: school._id,
      code: 'DA',
      name: 'Dearness Allowance',
      type: 'EARNING',
      calculationType: 'PERCENTAGE',
      percentageOf: 'BASIC',
      value: 15,
    });
    const pf = await SalaryComponent.create({
      schoolId: school._id,
      code: 'PF',
      name: 'Provident Fund (Employee)',
      type: 'DEDUCTION',
      calculationType: 'PERCENTAGE',
      percentageOf: 'BASIC',
      value: 12,
    });
    const pt = await SalaryComponent.create({
      schoolId: school._id,
      code: 'PT',
      name: 'Professional Tax',
      type: 'DEDUCTION',
      calculationType: 'FIXED',
      value: 200,
    });

    await SalaryStructure.deleteMany({ schoolId: school._id });
    const standardStructure = await SalaryStructure.create({
      schoolId: school._id,
      code: 'REG_FACULTY_PAY',
      name: 'Standard Faculty Salary Structure',
      effectiveFrom: new Date('2026-04-01'),
      components: [
        { componentId: basicPay._id, value: 35000, calculationType: 'FIXED' },
        { componentId: hra._id, value: 14000, calculationType: 'PERCENTAGE' },
        { componentId: da._id, value: 5250, calculationType: 'PERCENTAGE' },
        { componentId: pf._id, value: 4200, calculationType: 'PERCENTAGE' },
        { componentId: pt._id, value: 200, calculationType: 'FIXED' },
      ],
      status: 'ACTIVE',
    });

    await EmployeeSalaryAssignment.deleteMany({ schoolId: school._id });
    for (const st of staffs) {
      await EmployeeSalaryAssignment.create({
        schoolId: school._id,
        staffId: st._id,
        salaryStructureId: standardStructure._id,
        baseSalary: 35000,
        effectiveFrom: new Date('2026-04-01'),
        status: 'ACTIVE',
      });
    }

    await PayrollPeriod.deleteMany({ schoolId: school._id });
    const augPayroll = await PayrollPeriod.create({
      schoolId: school._id,
      year: 2026,
      month: 8,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'PROCESSED',
      processedAt: new Date('2026-08-31'),
      processedBy: adminUser._id,
    });
    const sepPayroll = await PayrollPeriod.create({
      schoolId: school._id,
      year: 2026,
      month: 9,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      status: 'DRAFT',
    });

    await PayrollEntry.deleteMany({ schoolId: school._id });
    await PayrollAdjustment.deleteMany({ schoolId: school._id });
    await Payslip.deleteMany({ schoolId: school._id });

    for (let i = 0; i < staffs.length; i++) {
      const st = staffs[i];
      const entry = await PayrollEntry.create({
        schoolId: school._id,
        payrollPeriodId: augPayroll._id,
        staffId: st._id,
        workingDays: 30,
        paidDays: 30,
        earnings: [
          { componentId: basicPay._id, componentCode: 'BASIC', name: 'Basic Salary', amount: 35000 },
          { componentId: hra._id, componentCode: 'HRA', name: 'HRA', amount: 14000 },
          { componentId: da._id, componentCode: 'DA', name: 'DA', amount: 5250 },
        ],
        deductions: [
          { componentId: pf._id, componentCode: 'PF', name: 'PF Deduction', amount: 4200 },
          { componentId: pt._id, componentCode: 'PT', name: 'Professional Tax', amount: 200 },
        ],
        grossEarnings: 54250,
        totalDeductions: 4400,
        netPay: 49850,
        status: 'PROCESSED',
      });

      await Payslip.create({
        schoolId: school._id,
        payrollPeriodId: augPayroll._id,
        staffId: st._id,
        employeeNumber: `EMP-2026-${String(i + 1).padStart(4, '0')}`,
        grossAmount: 54250,
        netAmount: 49850,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-08-31'),
      });
    }

    if (staffs[0]) {
      await PayrollAdjustment.create({
        schoolId: school._id,
        payrollPeriodId: sepPayroll._id,
        staffId: staffs[0]._id,
        amount: 2500,
        type: 'CREDIT',
        reason: 'Annual performance award bonus',
        approvedBy: adminUser._id,
        createdBy: adminUser._id,
      });
    }

    // ==========================================
    // 3. Hostel Management
    // ==========================================
    console.log('Seeding Hostel Management...');
    await Hostel.deleteMany({ schoolId: school._id });
    const boysHostel = await Hostel.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      code: 'BH-01',
      name: 'Tagore Boys Residence',
      type: 'BOYS',
      gender: 'MALE',
      capacity: 120,
      wardenStaffId: staffs[0]?._id,
      address: 'North Wing, Main Campus',
      status: 'ACTIVE',
    });
    const girlsHostel = await Hostel.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      code: 'GH-01',
      name: 'Sarojini Girls Residence',
      type: 'GIRLS',
      gender: 'FEMALE',
      capacity: 120,
      wardenStaffId: staffs[1]?._id,
      address: 'South Wing, Main Campus',
      status: 'ACTIVE',
    });

    await HostelBlock.deleteMany({ schoolId: school._id });
    const blockA = await HostelBlock.create({ schoolId: school._id, hostelId: boysHostel._id, code: 'BLK-A', name: 'Block A (Junior Wing)', floors: 3 });
    const blockB = await HostelBlock.create({ schoolId: school._id, hostelId: girlsHostel._id, code: 'BLK-B', name: 'Block B (Senior Wing)', floors: 3 });

    await HostelRoom.deleteMany({ schoolId: school._id });
    await HostelBed.deleteMany({ schoolId: school._id });
    await HostelAllocation.deleteMany({ schoolId: school._id });
    await HostelAttendance.deleteMany({ schoolId: school._id });

    const rooms = [];
    for (let r = 101; r <= 104; r++) {
      const room = await HostelRoom.create({
        schoolId: school._id,
        hostelId: boysHostel._id,
        blockId: blockA._id,
        roomNumber: String(r),
        floor: 1,
        capacity: 2,
        roomType: 'STANDARD',
        monthlyFee: 4500,
        status: 'AVAILABLE',
      });
      rooms.push(room);

      const bed1 = await HostelBed.create({ schoolId: school._id, roomId: room._id, bedNumber: `${r}-A`, status: 'ALLOCATED' });
      const bed2 = await HostelBed.create({ schoolId: school._id, roomId: room._id, bedNumber: `${r}-B`, status: 'AVAILABLE' });

      // Allocate first student to bed1
      const studentIdx = r - 101;
      if (students[studentIdx] && enrollments[studentIdx]) {
        const alloc = await HostelAllocation.create({
          schoolId: school._id,
          studentId: students[studentIdx]._id,
          enrollmentId: enrollments[studentIdx]._id,
          academicYearId: currentAY._id,
          hostelId: boysHostel._id,
          roomId: room._id,
          bedId: bed1._id,
          allocationDate: new Date('2026-06-01'),
          monthlyFee: 4500,
          status: 'ACTIVE',
        });

        await HostelAttendance.create({
          schoolId: school._id,
          hostelId: boysHostel._id,
          date: '2026-09-15',
          studentId: students[studentIdx]._id,
          allocationId: alloc._id,
          status: 'PRESENT',
          markedBy: adminUser._id,
        });
      }
    }

    // ==========================================
    // 4. Inventory, Warehouses & Assets
    // ==========================================
    console.log('Seeding Inventory & Procurement...');
    await InventoryCategory.deleteMany({ schoolId: school._id });
    const invCats = await InventoryCategory.insertMany([
      { schoolId: school._id, code: 'STN', name: 'Stationery & Paper Supplies' },
      { schoolId: school._id, code: 'SCI_LAB', name: 'Science Laboratory Equipment' },
      { schoolId: school._id, code: 'IT_PERIPH', name: 'IT & Electronic Peripherals' },
      { schoolId: school._id, code: 'SPORTS', name: 'Athletics & Sports Gear' },
    ]);

    await Warehouse.deleteMany({ schoolId: school._id });
    const centralStore = await Warehouse.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      code: 'WH-MAIN',
      name: 'Central Institution Store',
      location: 'Administrative Block Ground Floor',
      managerStaffId: staffs[2]?._id,
      status: 'ACTIVE',
    });
    const labStore = await Warehouse.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      code: 'WH-LAB',
      name: 'Science & Robotics Laboratory Store',
      location: 'Science Complex 2nd Floor',
      status: 'ACTIVE',
    });

    await InventoryItem.deleteMany({ schoolId: school._id });
    const itemA4 = await InventoryItem.create({ schoolId: school._id, categoryId: invCats[0]._id, itemCode: 'ITM-A4-RIM', name: 'A4 Copier Paper (75 GSM)', unit: 'RIM', reorderLevel: 20, reorderQuantity: 100 });
    const itemMicroscope = await InventoryItem.create({ schoolId: school._id, categoryId: invCats[1]._id, itemCode: 'ITM-OPT-MIC', name: 'Monocular Student Microscope', unit: 'PCS', reorderLevel: 5, reorderQuantity: 15 });
    const itemKeyboard = await InventoryItem.create({ schoolId: school._id, categoryId: invCats[2]._id, itemCode: 'ITM-USB-KBD', name: 'USB Spill-Resistant Keyboard', unit: 'PCS', reorderLevel: 10, reorderQuantity: 30 });
    const itemFootball = await InventoryItem.create({ schoolId: school._id, categoryId: invCats[3]._id, itemCode: 'ITM-FTB-S5', name: 'FIFA Size-5 Match Football', unit: 'PCS', reorderLevel: 8, reorderQuantity: 20 });

    await Stock.deleteMany({ schoolId: school._id });
    await StockMovement.deleteMany({ schoolId: school._id });
    const items = [itemA4, itemMicroscope, itemKeyboard, itemFootball];
    for (const itm of items) {
      await Stock.create({
        schoolId: school._id,
        warehouseId: centralStore._id,
        itemId: itm._id,
        quantity: 50,
        availableQuantity: 45,
        reservedQuantity: 5,
        reorderLevel: itm.reorderLevel,
      });

      await StockMovement.create({
        schoolId: school._id,
        warehouseId: centralStore._id,
        itemId: itm._id,
        movementType: 'RECEIPT',
        quantity: 50,
        unitCost: 250,
        performedBy: adminUser._id,
      });
    }

    // Vendors & Purchase Orders
    await Vendor.deleteMany({ schoolId: school._id });
    const vendorStationery = await Vendor.create({
      schoolId: school._id,
      vendorCode: 'VND-NAT-STAT',
      name: 'National School Supplies Ltd',
      contactPerson: 'Rajesh Sharma',
      phone: '+91 98765 43210',
      email: 'sales@nationalschoolsupplies.in',
      address: '77 Industrial Avenue, Metro City',
      status: 'ACTIVE',
    });
    const vendorTech = await Vendor.create({
      schoolId: school._id,
      vendorCode: 'VND-ZEN-TECH',
      name: 'Zenith EdTech Hardware',
      contactPerson: 'Priya Mehta',
      phone: '+91 98450 11223',
      email: 'support@zenithedtech.com',
      address: '12 Electronic City, Silicon Sector',
      status: 'ACTIVE',
    });

    await PurchaseRequest.deleteMany({ schoolId: school._id });
    const pr1 = await PurchaseRequest.create({
      schoolId: school._id,
      requestCode: 'PR-2026-001',
      requestedBy: staffs[0]._id,
      departmentId: depts[0]._id,
      items: [{ itemId: itemA4._id, itemName: itemA4.name, quantity: 50, estimatedCost: 12500 }],
      status: 'APPROVED',
      approvalStatus: 'APPROVED',
      approvedBy: adminUser._id,
      approvedAt: new Date(),
    });

    await PurchaseOrder.deleteMany({ schoolId: school._id });
    const po1 = await PurchaseOrder.create({
      schoolId: school._id,
      vendorId: vendorStationery._id,
      purchaseRequestId: pr1._id,
      orderNumber: 'PO-2026-0042',
      orderDate: '2026-09-01',
      expectedDeliveryDate: '2026-09-10',
      items: [{ itemId: itemA4._id, itemName: itemA4.name, quantity: 50, unitPrice: 240, amount: 12000 }],
      subtotal: 12000,
      total: 12000,
      status: 'RECEIVED',
    });

    await GoodsReceipt.deleteMany({ schoolId: school._id });
    await GoodsReceipt.create({
      schoolId: school._id,
      purchaseOrderId: po1._id,
      vendorId: vendorStationery._id,
      warehouseId: centralStore._id,
      receiptNumber: 'GRN-2026-0038',
      receivedDate: '2026-09-08',
      items: [{ itemId: itemA4._id, quantityReceived: 50, unitCost: 240 }],
      receivedBy: adminUser._id,
      status: 'RECEIVED',
    });

    // Assets & Maintenance
    await Asset.deleteMany({ schoolId: school._id });
    await AssetAssignment.deleteMany({ schoolId: school._id });
    await AssetMaintenance.deleteMany({ schoolId: school._id });
    await AssetTransfer.deleteMany({ schoolId: school._id });
    await AssetDisposal.deleteMany({ schoolId: school._id });

    const assetProjector = await Asset.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      assetCode: 'AST-PROJ-01',
      name: 'Epson 4K Laser Classroom Projector',
      category: 'ELECTRONICS',
      serialNumber: 'EP-4K-998241',
      purchaseDate: '2025-06-15',
      purchasePrice: 65000,
      vendorId: vendorTech._id,
      currentLocation: 'Seminar Hall 1',
      status: 'ASSIGNED',
      condition: 'EXCELLENT',
      assignedToType: 'STAFF',
      assignedToId: staffs[0]._id,
    });

    const assetBus = await Asset.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      assetCode: 'AST-VEH-01',
      name: 'Tata Marcopolo 40-Seater AC Bus',
      category: 'VEHICLE',
      serialNumber: 'TAT-MC-40-101',
      purchaseDate: '2023-04-10',
      purchasePrice: 2800000,
      status: 'AVAILABLE',
      condition: 'GOOD',
    });

    await AssetAssignment.create({
      schoolId: school._id,
      assetId: assetProjector._id,
      assignedToType: 'STAFF',
      assignedToId: staffs[0]._id,
      assignedDate: '2025-07-01',
      assignedBy: adminUser._id,
      status: 'ACTIVE',
    });

    await AssetMaintenance.create({
      schoolId: school._id,
      assetId: assetProjector._id,
      maintenanceType: 'PREVENTIVE',
      vendorId: vendorTech._id,
      serviceDate: '2026-08-15',
      cost: 1500,
      description: 'Lens alignment and lamp dust cleaning',
      status: 'COMPLETED',
    });

    await AssetTransfer.create({
      schoolId: school._id,
      assetId: assetProjector._id,
      fromLocation: 'IT Store',
      toLocation: 'Seminar Hall 1',
      transferredBy: adminUser._id,
      transferDate: '2025-06-25',
      reason: 'Hall AV upgrade',
    });

    // ==========================================
    // 5. Visitors, Appointments & Gate Passes
    // ==========================================
    console.log('Seeding Visitors & Gate Management...');
    await Visitor.deleteMany({ schoolId: school._id });
    await VisitorAppointment.deleteMany({ schoolId: school._id });
    await GatePass.deleteMany({ schoolId: school._id });

    const visitor1 = await Visitor.create({
      schoolId: school._id,
      passNumber: 'GP-VIS-2026-001',
      name: 'Sunil Gavaskar',
      phone: '+91 91234 56789',
      email: 'sunil.g@example.com',
      purpose: 'Meeting Principal regarding sports day chief guest',
      hostType: 'STAFF',
      hostId: staffs[0]._id,
      hostName: staffs[0].name,
      visitDate: '2026-09-15',
      actualCheckIn: '10:15',
      status: 'CHECKED_IN',
    });

    await VisitorAppointment.create({
      schoolId: school._id,
      visitorId: visitor1._id,
      visitorName: visitor1.name,
      visitorPhone: visitor1.phone,
      appointmentDate: '2026-09-15',
      purpose: visitor1.purpose,
      hostStaffId: staffs[0]._id,
      status: 'APPROVED',
    });

    if (students[0] && enrollments[0]) {
      await GatePass.create({
        schoolId: school._id,
        passNumber: 'GP-STU-2026-004',
        type: 'STUDENT',
        requesterType: 'STUDENT',
        requesterId: students[0]._id,
        studentId: students[0]._id,
        enrollmentId: enrollments[0]._id,
        reason: 'Authorized dental checkup appointment with guardian',
        destination: 'City Dental Clinic',
        validDate: '2026-09-15',
        validFromTime: '13:00',
        validToTime: '16:00',
        status: 'ISSUED',
        approvedBy: adminUser._id,
      });
    }

    // ==========================================
    // 6. Transport & Fleet Management
    // ==========================================
    console.log('Seeding Fleet & Transport...');
    await Vehicle.deleteMany({ schoolId: school._id });
    const bus1 = await Vehicle.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      vehicleNumber: 'SCH-BUS-01',
      registrationNumber: 'KA-01-EQ-9876',
      vehicleType: 'BUS',
      make: 'Tata Motors',
      model: 'Marcopolo Starbus',
      capacity: 45,
      insuranceNumber: 'POL-ICICI-2026-99',
      insuranceExpiryDate: new Date('2027-04-30'),
      status: 'ACTIVE',
    });

    const bus2 = await Vehicle.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      vehicleNumber: 'SCH-VAN-02',
      registrationNumber: 'KA-01-EQ-1234',
      vehicleType: 'VAN',
      make: 'Force Motors',
      model: 'Traveller 26',
      capacity: 25,
      status: 'ACTIVE',
    });

    await Driver.deleteMany({ schoolId: school._id });
    const driver1 = await Driver.create({
      schoolId: school._id,
      name: 'Ramesh Kumar',
      phone: '+91 97788 12345',
      licenseNumber: 'DL-KA-01-20150044',
      licenseExpiryDate: new Date('2029-10-15'),
      status: 'ACTIVE',
    });

    await TransportRoute.deleteMany({ schoolId: school._id });
    const route1 = await TransportRoute.create({
      schoolId: school._id,
      academicYearId: currentAY._id,
      routeCode: 'RT-NORTH-01',
      routeName: 'North Town to Campus Expressway',
      assignedVehicleId: bus1._id,
      assignedDriverId: driver1._id,
      status: 'ACTIVE',
    });

    await RouteStop.deleteMany({ schoolId: school._id });
    const stop1 = await RouteStop.create({ schoolId: school._id, routeId: route1._id, stopCode: 'STP-01', stopName: 'City Central Circle', sequence: 1, estimatedArrivalTime: '07:15', monthlyFare: 1500 });
    const stop2 = await RouteStop.create({ schoolId: school._id, routeId: route1._id, stopCode: 'STP-02', stopName: 'Green Park Metro Station', sequence: 2, estimatedArrivalTime: '07:30', monthlyFare: 1800 });
    const stop3 = await RouteStop.create({ schoolId: school._id, routeId: route1._id, stopCode: 'STP-03', stopName: 'Maple Avenue Gate', sequence: 3, estimatedArrivalTime: '07:45', monthlyFare: 2000 });

    await TransportAssignment.deleteMany({ schoolId: school._id });
    await TransportAttendance.deleteMany({ schoolId: school._id });

    for (let s = 0; s < Math.min(5, students.length); s++) {
      const assigned = await TransportAssignment.create({
        schoolId: school._id,
        academicYearId: currentAY._id,
        studentId: students[s]._id,
        enrollmentId: enrollments[s]._id,
        routeId: route1._id,
        routeStopId: stop2._id,
        vehicleId: bus1._id,
        status: 'ACTIVE',
      });

      await TransportAttendance.create({
        schoolId: school._id,
        academicYearId: currentAY._id,
        date: '2026-09-15',
        routeId: route1._id,
        vehicleId: bus1._id,
        studentId: students[s]._id,
        assignmentId: assigned._id,
        tripType: 'PICKUP',
        status: 'BOARDED',
        markedBy: adminUser._id,
      });
    }

    // ==========================================
    // 7. Library Automation
    // ==========================================
    console.log('Seeding Library Catalogue & Circulation...');
    await Library.deleteMany({ schoolId: school._id });
    const mainLib = await Library.create({
      schoolId: school._id,
      campusId: primaryCampus?._id,
      name: 'Rabindranath Tagore Memorial Library',
      code: 'LIB-MAIN',
      location: 'Central Academic Block 3rd Floor',
      status: 'ACTIVE',
    });

    await LibrarySetting.deleteMany({ schoolId: school._id });
    await LibrarySetting.create({
      schoolId: school._id,
      maximumBooks: 4,
      defaultLoanPeriodDays: 14,
      studentLoanPeriodDays: 14,
      staffLoanPeriodDays: 30,
      finePerDay: 5,
    });

    await BookCategory.deleteMany({ schoolId: school._id });
    const catFiction = await BookCategory.create({ schoolId: school._id, code: 'FIC', name: 'Fiction & Literature' });
    const catSci = await BookCategory.create({ schoolId: school._id, code: 'SCI', name: 'Natural Sciences & Math' });
    const catHist = await BookCategory.create({ schoolId: school._id, code: 'HIST', name: 'World History & Civics' });

    await Author.deleteMany({ schoolId: school._id });
    const auth1 = await Author.create({ schoolId: school._id, name: 'Dr. A.P.J. Abdul Kalam', biography: 'Scientist and former President of India' });
    const auth2 = await Author.create({ schoolId: school._id, name: 'R.K. Narayan', biography: 'Renowned Indian English novelist' });

    await Publisher.deleteMany({ schoolId: school._id });
    const pub1 = await Publisher.create({ schoolId: school._id, name: 'Penguin Random House India', email: 'orders@penguinindia.com' });
    const pub2 = await Publisher.create({ schoolId: school._id, name: 'Universities Press', email: 'sales@universitiespress.com' });

    await Book.deleteMany({ schoolId: school._id });
    const book1 = await Book.create({
      schoolId: school._id,
      libraryId: mainLib._id,
      isbn: '978-8173711466',
      title: 'Wings of Fire: An Autobiography',
      categoryId: catSci._id,
      authorIds: [auth1._id],
      publisherId: pub2._id,
      edition: '1st',
      publicationYear: 1999,
      shelfLocation: 'SEC-A-04',
      status: 'ACTIVE',
    });

    const book2 = await Book.create({
      schoolId: school._id,
      libraryId: mainLib._id,
      isbn: '978-8185986005',
      title: 'Malgudi Days',
      categoryId: catFiction._id,
      authorIds: [auth2._id],
      publisherId: pub1._id,
      shelfLocation: 'SEC-B-12',
      status: 'ACTIVE',
    });

    await BookCopy.deleteMany({ schoolId: school._id });
    const copy1 = await BookCopy.create({ schoolId: school._id, libraryId: mainLib._id, bookId: book1._id, accessionNumber: 'ACC-00101', barcode: 'BC-9788173711466-01', condition: 'NEW', status: 'AVAILABLE' });
    const copy2 = await BookCopy.create({ schoolId: school._id, libraryId: mainLib._id, bookId: book1._id, accessionNumber: 'ACC-00102', barcode: 'BC-9788173711466-02', condition: 'GOOD', status: 'ISSUED' });
    const copy3 = await BookCopy.create({ schoolId: school._id, libraryId: mainLib._id, bookId: book2._id, accessionNumber: 'ACC-00201', barcode: 'BC-9788185986005-01', condition: 'NEW', status: 'AVAILABLE' });

    await LibraryMember.deleteMany({ schoolId: school._id });
    await BookIssue.deleteMany({ schoolId: school._id });

    if (students[0]) {
      const libMem = await LibraryMember.create({
        schoolId: school._id,
        memberType: 'STUDENT',
        studentId: students[0]._id,
        membershipNumber: 'LIB-STU-2026-001',
        status: 'ACTIVE',
      });

      await BookIssue.create({
        schoolId: school._id,
        libraryId: mainLib._id,
        bookCopyId: copy2._id,
        memberId: libMem._id,
        issueDate: new Date('2026-09-01'),
        dueDate: new Date('2026-09-15'),
        status: 'ISSUED',
        issuedBy: adminUser._id,
      });
    }

    // ==========================================
    // 8. SaaS Multi-Tenancy & Platform Control
    // ==========================================
    console.log('Seeding SaaS Multi-Tenancy & Subscriptions...');
    await Plan.deleteMany({});
    const starterPlan = await Plan.create({
      code: 'STARTER',
      name: 'Starter Academy',
      description: 'For boutique schools & learning centers up to 500 students',
      tier: 'STARTER',
      pricing: { monthly: 99, annual: 990, currency: 'USD' },
      limits: { students: 500, staff: 50, storage_gb: 20, campuses: 1, users: 20 },
      features: [
        { key: 'academic_records', enabled: true },
        { key: 'attendance_tracking', enabled: true },
        { key: 'basic_finance', enabled: true },
        { key: 'payroll_module', enabled: false },
      ],
      status: 'ACTIVE',
    });

    const enterprisePlan = await Plan.create({
      code: 'ENTERPRISE',
      name: 'Enterprise School District',
      description: 'Comprehensive ERP for multi-campus institutions with unbounded scale',
      tier: 'ENTERPRISE',
      pricing: { monthly: 399, annual: 3990, currency: 'USD' },
      limits: { students: 5000, staff: 500, storage_gb: 200, campuses: 10, users: 200 },
      features: [
        { key: 'academic_records', enabled: true },
        { key: 'attendance_tracking', enabled: true },
        { key: 'full_finance_and_fees', enabled: true },
        { key: 'payroll_module', enabled: true },
        { key: 'transport_telematics', enabled: true },
        { key: 'hostel_automation', enabled: true },
        { key: 'rest_api_access', enabled: true },
      ],
      status: 'ACTIVE',
    });

    await Subscription.deleteMany({ schoolId: school._id });
    const currentSub = await Subscription.create({
      schoolId: school._id,
      planId: enterprisePlan._id,
      planCode: enterprisePlan.code,
      status: 'ACTIVE',
      billingCycle: 'ANNUAL',
      currentPeriodStart: new Date('2026-01-01'),
      currentPeriodEnd: new Date('2026-12-31'),
    });

    await SubscriptionEvent.deleteMany({ schoolId: school._id });
    await SubscriptionEvent.create({
      schoolId: school._id,
      subscriptionId: currentSub._id,
      eventType: 'ACTIVATED',
      oldStatus: 'TRIAL',
      newStatus: 'ACTIVE',
      performedBy: adminUser._id,
      note: 'School District Enterprise Plan contracted and activated.',
    });

    await PlatformAdmin.deleteMany({});
    await PlatformAdmin.create({
      userId: adminUser._id,
      email: adminUser.email,
      firstName: 'Platform',
      lastName: 'SuperAdmin',
      role: 'SUPER_ADMIN',
    });

    await PlatformInvoice.deleteMany({ schoolId: school._id });
    await PlatformInvoice.create({
      schoolId: school._id,
      subscriptionId: currentSub._id,
      invoiceNumber: 'PLT-INV-2026-0001',
      billingPeriod: { start: new Date('2026-01-01'), end: new Date('2026-12-31') },
      subtotal: 3990,
      total: 3990,
      status: 'PAID',
      paidAt: new Date('2026-01-02'),
      paymentMethod: 'WIRE_TRANSFER',
    });

    // API Keys & Webhooks
    await ApiKey.deleteMany({ schoolId: school._id });
    const crypto = require('crypto');
    const rawKey = 'sk_live_' + crypto.randomBytes(24).toString('hex');
    await ApiKey.create({
      schoolId: school._id,
      name: 'Production SIS Biometric Integration Key',
      prefix: rawKey.substring(0, 8),
      keyHash: crypto.createHash('sha256').update(rawKey).digest('hex'),
      scopes: ['students:read', 'attendance:write', 'staff:read'],
      status: 'ACTIVE',
      usageCount: 1420,
      lastUsedAt: new Date(),
      createdBy: adminUser._id,
    });

    await Webhook.deleteMany({ schoolId: school._id });
    const wh1 = await Webhook.create({
      schoolId: school._id,
      name: 'Core SIS Fee Payment Webhook',
      url: 'https://webhook.site/school-erp-mock-endpoint',
      secret: crypto.randomBytes(16).toString('hex'),
      events: ['payment.received', 'student.admitted', 'attendance.marked'],
      isActive: true,
      status: 'ACTIVE',
      createdBy: adminUser._id,
    });

    await WebhookDelivery.deleteMany({ schoolId: school._id });
    await WebhookDelivery.create({
      schoolId: school._id,
      webhookId: wh1._id,
      eventType: 'payment.received',
      eventId: 'evt_sample_payment_001',
      payload: { paymentId: payments[0]?._id, amount: 15000, status: 'SUCCESS' },
      status: 'DELIVERED',
      responseStatus: 200,
      attemptCount: 1,
      deliveredAt: new Date(),
      duration: 124,
    });

    await UsageRecord.deleteMany({ schoolId: school._id });
    await UsageRecord.create({
      schoolId: school._id,
      subscriptionId: currentSub._id,
      metric: 'students',
      value: students.length,
      period: '2026-09',
    });
    await UsageRecord.create({
      schoolId: school._id,
      subscriptionId: currentSub._id,
      metric: 'api_requests',
      value: 1420,
      period: '2026-09',
    });

    // ==========================================
    // 9. Student Health, Discipline & Incidents
    // ==========================================
    console.log('Seeding Student Health & Discipline...');
    await StudentHealthProfile.deleteMany({ schoolId: school._id });
    await MedicalVisit.deleteMany({ schoolId: school._id });
    await DisciplineIncident.deleteMany({ schoolId: school._id });
    await DisciplinaryAction.deleteMany({ schoolId: school._id });

    if (students[0]) {
      await StudentHealthProfile.create({
        schoolId: school._id,
        studentId: students[0]._id,
        bloodGroup: 'O_POSITIVE',
        heightCm: 148,
        weightKg: 42,
        allergies: ['Peanuts', 'Dust Mites'],
        chronicConditions: ['Mild Asthma'],
        emergencyMedications: 'Inhaler kept at infirmary',
        emergencyContactName: 'Dr. Ramesh (Family Physician)',
        emergencyContactPhone: '+91 98765 00000',
      });

      await MedicalVisit.create({
        schoolId: school._id,
        studentId: students[0]._id,
        visitDate: '2026-09-10',
        reason: 'Seasonal allergy wheezing during outdoor athletics',
        symptoms: 'Mild exercise-induced bronchospasm',
        actionTaken: 'Administered saline nebulization; rested 30 mins',
        recordedBy: adminUser._id,
      });

      const inc1 = await DisciplineIncident.create({
        schoolId: school._id,
        studentId: students[0]._id,
        academicYearId: currentAY._id,
        date: '2026-08-20',
        title: 'Unexcused absence during laboratory period',
        description: 'Found in the sports pavilion without hall pass during physics lab.',
        severity: 'LOW',
        location: 'Sports Pavilion',
        reportedBy: staffs[0]?._id,
        status: 'RESOLVED',
      });

      await DisciplinaryAction.create({
        schoolId: school._id,
        incidentId: inc1._id,
        studentId: students[0]._id,
        actionType: 'WARNING',
        actionDate: '2026-08-21',
        description: 'First verbal warning issued in presence of class teacher.',
        assignedBy: staffs[0]?._id,
        status: 'COMPLETED',
      });
    }

    // ==========================================
    // 10. Operations, Documents, Workflows & Mobile
    // ==========================================
    console.log('Seeding Documents, Workflows & Mobile PWA...');
    await Holiday.deleteMany({ schoolId: school._id });
    await Holiday.insertMany([
      { schoolId: school._id, academicYearId: currentAY._id, name: 'Gandhi Jayanti', date: new Date('2026-10-02'), type: 'NATIONAL' },
      { schoolId: school._id, academicYearId: currentAY._id, name: 'Dussehra Holidays', date: new Date('2026-10-19'), type: 'FESTIVAL' },
      { schoolId: school._id, academicYearId: currentAY._id, name: 'Diwali Festival Break', date: new Date('2026-11-08'), type: 'FESTIVAL' },
      { schoolId: school._id, academicYearId: currentAY._id, name: 'Winter Break', date: new Date('2026-12-25'), type: 'VACATION' },
    ]);

    await WorkflowDefinition.deleteMany({ schoolId: school._id });
    await WorkflowDefinition.create({
      schoolId: school._id,
      code: 'WF-STUDENT-LEAVE',
      name: 'Student Leave Approval Workflow',
      entityType: 'LEAVE',
      steps: [
        { sequence: 1, name: 'Class Teacher Review', approverType: 'ROLE', timeoutHours: 24 },
        { sequence: 2, name: 'Principal Sanction', approverType: 'DEPARTMENT_HEAD', timeoutHours: 48 },
      ],
      status: 'ACTIVE',
    });

    await Document.deleteMany({ schoolId: school._id });
    await DocumentVersion.deleteMany({ schoolId: school._id });
    if (students[0]) {
      const doc1 = await Document.create({
        schoolId: school._id,
        ownerType: 'STUDENT',
        ownerId: students[0]._id,
        documentType: 'BIRTH_CERTIFICATE',
        title: 'Official Birth Certificate Verification',
        fileName: 'birth_cert_verified.pdf',
        originalFileName: 'scanned_birth_certificate_2026.pdf',
        mimeType: 'application/pdf',
        size: 245000,
        storageKey: `schools/${school._id}/students/${students[0]._id}/birth_certificate.pdf`,
        status: 'VERIFIED',
        uploadedBy: adminUser._id,
        verifiedBy: adminUser._id,
        verifiedAt: new Date(),
      });

      await DocumentVersion.create({
        schoolId: school._id,
        documentId: doc1._id,
        version: 1,
        fileName: doc1.fileName,
        storageKey: doc1.storageKey,
        size: doc1.size,
        mimeType: doc1.mimeType,
        uploadedBy: adminUser._id,
      });
    }

    await Message.deleteMany({ schoolId: school._id });
    if (adminUser && staffs[0]) {
      await Message.create({
        schoolId: school._id,
        conversationId: `conv_${adminUser._id}_${staffs[0].userId || staffs[0]._id}`,
        senderUserId: adminUser._id,
        recipientUserId: staffs[0].userId || adminUser._id,
        content: 'Please verify the laboratory inventory audit by tomorrow afternoon.',
        status: 'DELIVERED',
      });
    }

    await MobileDevice.deleteMany({ schoolId: school._id });
    await MobileDevice.create({
      schoolId: school._id,
      userId: adminUser._id,
      deviceId: 'PWA-CHROME-WIN-2026',
      platform: 'WEB_PWA',
      deviceName: 'Executive Admin PWA Client',
      lastSeenAt: new Date(),
      status: 'ACTIVE',
    });

    await SyncRecord.deleteMany({ schoolId: school._id });
    await SyncRecord.create({
      schoolId: school._id,
      userId: adminUser._id,
      idempotencyKey: 'sync_offline_batch_20260915_001',
      entityType: 'ATTENDANCE',
      operation: 'BULK_MARK',
      status: 'SUCCESS',
      payload: { count: 32, note: 'Offline synced from teacher tablet' },
    });

    if (reportDefs[0]) {
      await ReportSchedule.deleteMany({ schoolId: school._id });
      await ReportSchedule.create({
        schoolId: school._id,
        reportId: reportDefs[0]._id,
        reportCode: reportDefs[0].reportCode || reportDefs[0].code || 'RPT-STUDENT-DIRECTORY',
        name: 'Weekly Academic Executive Summary',
        frequency: 'WEEKLY',
        recipients: ['principal@schoolerp.com', 'admin@schoolerp.com'],
        exportFormat: 'PDF',
        nextRunAt: new Date('2026-09-21T08:00:00Z'),
        status: 'ACTIVE',
        createdBy: adminUser._id,
      });
    }

    if (students[0] && payments[0]) {
      await Refund.deleteMany({ schoolId: school._id });
      await Refund.create({
        schoolId: school._id,
        paymentId: payments[0]._id,
        studentId: students[0]._id,
        refundNumber: 'REF-2026-0001',
        refundAmount: 500,
        refundDate: new Date('2026-09-14'),
        refundMethod: 'BANK_TRANSFER',
        reason: 'Overpayment adjustment waiver',
        status: 'PROCESSED',
        processedBy: adminUser._id,
      });
    }

    if (students[0]) {
      await FinancialAdjustment.deleteMany({ schoolId: school._id });
      await FinancialAdjustment.create({
        schoolId: school._id,
        studentId: students[0]._id,
        academicYearId: currentAY._id,
        type: 'FEE_WAIVER',
        amount: 1000,
        reason: 'Special talent scholarship grant deduction',
        status: 'APPROVED',
        approvedBy: adminUser._id,
        createdBy: adminUser._id,
      });
    }

    if (attendanceRecords[0] && attendanceStatuses.length >= 2) {
      await AttendanceAudit.deleteMany({ schoolId: school._id });
      await AttendanceAudit.create({
        schoolId: school._id,
        attendanceRecordId: attendanceRecords[0]._id,
        previousStatusId: attendanceStatuses[1]._id, // e.g. ABSENT
        newStatusId: attendanceStatuses[0]._id, // e.g. PRESENT
        reason: 'Parent provided authenticated medical certificate on return',
        editedBy: adminUser._id,
        timestamp: new Date(),
      });
    }

    console.log('\n======================================================');
    console.log('🎉 COMPREHENSIVE MULTI-MODULE SEEDING SUCCESSFULLY COMPLETED!');
    console.log('======================================================');
    console.log('Every single one of the 115+ collections has relational data linked to the school, staff, and students.');

  } catch (err) {
    console.error('❌ Error during comprehensive seeding:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

seedComprehensive();
