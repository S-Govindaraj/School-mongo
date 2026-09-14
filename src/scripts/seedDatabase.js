require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore
}

const Permission = require('../models/Permission');
const Role = require('../models/Role');
const School = require('../models/School');
const Campus = require('../models/Campus');
const User = require('../models/User');

const permissionsData = [
  // People & Staff Management
  { id: 'staff.view', module: 'People & Staff', action: 'view', code: 'staff.view', name: 'View Teachers & Staff', description: 'View staff directory and member profiles' },
  { id: 'staff.manage', module: 'People & Staff', action: 'manage', code: 'staff.manage', name: 'Manage Teachers & Staff', description: 'Register, edit and manage staff members' },
  { id: 'teacher_assignment.view', module: 'People & Staff', action: 'view', code: 'teacher_assignment.view', name: 'View Teacher Assignments', description: 'View teacher class and subject assignments' },
  { id: 'teacher_assignment.manage', module: 'People & Staff', action: 'manage', code: 'teacher_assignment.manage', name: 'Manage Teacher Assignments', description: 'Assign teachers to classes, sections and subjects' },

  // Roles & Access Control
  { id: 'role.view', module: 'Roles & Access Control', action: 'view', code: 'role.view', name: 'View Roles & Permissions', description: 'View role directory and permission matrix' },
  { id: 'role.manage', module: 'Roles & Access Control', action: 'manage', code: 'role.manage', name: 'Manage Roles & Permissions', description: 'Create, modify and manage system roles and permissions' },

  // School & Campus Setup
  { id: 'school.view', module: 'School Setup', action: 'view', code: 'school.view', name: 'View School Profile', description: 'View school institution profile' },
  { id: 'school.manage', module: 'School Setup', action: 'manage', code: 'school.manage', name: 'Manage School Profile', description: 'Update school profile and configuration' },
  { id: 'campus.view', module: 'School Setup', action: 'view', code: 'campus.view', name: 'View Campuses', description: 'View school campus list' },
  { id: 'campus.manage', module: 'School Setup', action: 'manage', code: 'campus.manage', name: 'Manage Campuses', description: 'Create, edit, delete school campuses' },

  // Academic Setup
  { id: 'academic_year.view', module: 'Academic Setup', action: 'view', code: 'academic_year.view', name: 'View Academic Years', description: 'View academic calendar years' },
  { id: 'academic_year.manage', module: 'Academic Setup', action: 'manage', code: 'academic_year.manage', name: 'Manage Academic Years', description: 'Create, edit, delete & set current academic year' },
  { id: 'academic_term.view', module: 'Academic Setup', action: 'view', code: 'academic_term.view', name: 'View Academic Terms', description: 'View academic terms and semesters' },
  { id: 'academic_term.manage', module: 'Academic Setup', action: 'manage', code: 'academic_term.manage', name: 'Manage Academic Terms', description: 'Create, edit, delete academic terms' },
  { id: 'grade.view', module: 'Academic Setup', action: 'view', code: 'grade.view', name: 'View Grades / Classes', description: 'View grade and class directory' },
  { id: 'grade.manage', module: 'Academic Setup', action: 'manage', code: 'grade.manage', name: 'Manage Grades / Classes', description: 'Create, edit, delete grades and classes' },
  { id: 'section.view', module: 'Academic Setup', action: 'view', code: 'section.view', name: 'View Sections', description: 'View class sections' },
  { id: 'section.manage', module: 'Academic Setup', action: 'manage', code: 'section.manage', name: 'Manage Sections', description: 'Create, edit, delete class sections' },
  { id: 'subject.view', module: 'Academic Setup', action: 'view', code: 'subject.view', name: 'View Master Subjects', description: 'View subject catalogue' },
  { id: 'subject.manage', module: 'Academic Setup', action: 'manage', code: 'subject.manage', name: 'Manage Master Subjects', description: 'Create, edit, delete master subjects' },
  { id: 'class_subject.view', module: 'Academic Setup', action: 'view', code: 'class_subject.view', name: 'View Class Subject Mapping', description: 'View class subject configurations' },
  { id: 'class_subject.manage', module: 'Academic Setup', action: 'manage', code: 'class_subject.manage', name: 'Manage Class Subject Mapping', description: 'Configure subjects per class' },

  // System & Audit
  { id: 'settings.view', module: 'System & Audit', action: 'view', code: 'settings.view', name: 'View System Settings', description: 'View system configuration parameters' },
  { id: 'settings.manage', module: 'System & Audit', action: 'manage', code: 'settings.manage', name: 'Manage System Settings', description: 'Update system settings and policies' },
  { id: 'audit.view', module: 'System & Audit', action: 'view', code: 'audit.view', name: 'View Audit Logs', description: 'View system audit trail and logs' },

  // Legacy compatibility mappings
  { id: 'teacher_view', module: 'People & Staff', action: 'view', code: 'teacher_view', name: 'View Teachers (Legacy)', description: 'Legacy alias for staff.view' },
  { id: 'teacher_create', module: 'People & Staff', action: 'create', code: 'teacher_create', name: 'Create Teacher (Legacy)', description: 'Legacy alias for staff.manage' },
  { id: 'teacher_edit', module: 'People & Staff', action: 'edit', code: 'teacher_edit', name: 'Edit Teacher (Legacy)', description: 'Legacy alias for staff.manage' },
  { id: 'teacher_delete', module: 'People & Staff', action: 'delete', code: 'teacher_delete', name: 'Delete Teacher (Legacy)', description: 'Legacy alias for staff.manage' },
  { id: 'teacher_assignment_manage', module: 'People & Staff', action: 'manage', code: 'teacher_assignment_manage', name: 'Manage Teacher Assignments (Legacy)', description: 'Legacy alias for teacher_assignment.manage' },
  { id: 'role_view', module: 'Roles & Access Control', action: 'view', code: 'role_view', name: 'View Roles (Legacy)', description: 'Legacy alias for role.view' },
  { id: 'role_create', module: 'Roles & Access Control', action: 'create', code: 'role_create', name: 'Create Role (Legacy)', description: 'Legacy alias for role.manage' },
  { id: 'role_edit', module: 'Roles & Access Control', action: 'edit', code: 'role_edit', name: 'Edit Role (Legacy)', description: 'Legacy alias for role.manage' },
  { id: 'role_delete', module: 'Roles & Access Control', action: 'delete', code: 'role_delete', name: 'Delete Role (Legacy)', description: 'Legacy alias for role.manage' },
  { id: 'role_activate', module: 'Roles & Access Control', action: 'activate', code: 'role_activate', name: 'Activate Role (Legacy)', description: 'Legacy alias for role.manage' },
  { id: 'school_edit', module: 'School Setup', action: 'edit', code: 'school_edit', name: 'Edit School (Legacy)', description: 'Legacy alias for school.manage' },
  { id: 'campus_create', module: 'School Setup', action: 'create', code: 'campus_create', name: 'Create Campus (Legacy)', description: 'Legacy alias for campus.manage' },
  { id: 'campus_edit', module: 'School Setup', action: 'edit', code: 'campus_edit', name: 'Edit Campus (Legacy)', description: 'Legacy alias for campus.manage' },
  { id: 'campus_delete', module: 'School Setup', action: 'delete', code: 'campus_delete', name: 'Delete Campus (Legacy)', description: 'Legacy alias for campus.manage' },
  { id: 'academic_year_view', module: 'Academic Setup', action: 'view', code: 'academic_year_view', name: 'View Academic Years (Legacy)', description: 'Legacy alias' },
  { id: 'academic_year_manage', module: 'Academic Setup', action: 'manage', code: 'academic_year_manage', name: 'Manage Academic Years (Legacy)', description: 'Legacy alias' },
  { id: 'academic_term_view', module: 'Academic Setup', action: 'view', code: 'academic_term_view', name: 'View Terms (Legacy)', description: 'Legacy alias' },
  { id: 'academic_term_manage', module: 'Academic Setup', action: 'manage', code: 'academic_term_manage', name: 'Manage Terms (Legacy)', description: 'Legacy alias' },
  { id: 'grade_view', module: 'Academic Setup', action: 'view', code: 'grade_view', name: 'View Grades (Legacy)', description: 'Legacy alias' },
  { id: 'grade_manage', module: 'Academic Setup', action: 'manage', code: 'grade_manage', name: 'Manage Grades (Legacy)', description: 'Legacy alias' },
  { id: 'section_view', module: 'Academic Setup', action: 'view', code: 'section_view', name: 'View Sections (Legacy)', description: 'Legacy alias' },
  { id: 'section_manage', module: 'Academic Setup', action: 'manage', code: 'section_manage', name: 'Manage Sections (Legacy)', description: 'Legacy alias' },
  { id: 'subject_view', module: 'Academic Setup', action: 'view', code: 'subject_view', name: 'View Subjects (Legacy)', description: 'Legacy alias' },
  { id: 'subject_manage', module: 'Academic Setup', action: 'manage', code: 'subject_manage', name: 'Manage Subjects (Legacy)', description: 'Legacy alias' },
  { id: 'class_subject_view', module: 'Academic Setup', action: 'view', code: 'class_subject_view', name: 'View Class Subject (Legacy)', description: 'Legacy alias' },
  { id: 'class_subject_manage', module: 'Academic Setup', action: 'manage', code: 'class_subject_manage', name: 'Manage Class Subject (Legacy)', description: 'Legacy alias' },
  { id: 'settings_manage', module: 'System & Audit', action: 'manage', code: 'settings_manage', name: 'Manage Settings (Legacy)', description: 'Legacy alias' },
];

const defaultRoles = [
  {
    name: 'Super Administrator',
    code: 'SUPER_ADMIN',
    description: 'System Super Admin with complete administrative control',
    hierarchyLevel: 1,
    isSystem: true,
    status: 'ACTIVE',
  },
  {
    name: 'Principal',
    code: 'PRINCIPAL',
    description: 'School Principal & Senior Executive Leadership',
    hierarchyLevel: 2,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Teacher / Educator',
    code: 'TEACHER',
    description: 'Academic Educator managing classes, subjects and grades',
    hierarchyLevel: 4,
    isSystem: false,
    status: 'ACTIVE',
  },
  {
    name: 'Administrative Staff',
    code: 'STAFF',
    description: 'School Operational Staff managing daily administration',
    hierarchyLevel: 5,
    isSystem: false,
    status: 'ACTIVE',
  },
];

async function seed() {
  try {
    console.log('🌱 Starting MongoDB Database Seeding (Database: School_Management)...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('✅ Connected to MongoDB School_Management Database.');

    // 1. Seed Permissions
    const permCodes = [];
    for (const p of permissionsData) {
      await Permission.findOneAndUpdate(
        { code: p.code },
        p,
        { upsert: true, new: true }
      );
      permCodes.push(p.code);
    }
    console.log(`✅ ${permissionsData.length} Action Permissions seeded.`);

    // 2. Seed Roles
    let superAdminRole;
    for (const r of defaultRoles) {
      const isSuper = r.code === 'SUPER_ADMIN';
      const rolePerms = isSuper
        ? permCodes
        : r.code === 'PRINCIPAL'
        ? permCodes.filter((c) => !c.includes('settings'))
        : r.code === 'TEACHER'
        ? ['staff.view', 'teacher_view', 'grade.view', 'grade_view', 'section.view', 'section_view', 'subject.view', 'subject_view', 'class_subject.view', 'class_subject_view']
        : ['staff.view', 'teacher_view', 'school.view', 'school_view', 'campus.view', 'campus_view', 'grade.view', 'grade_view', 'section.view', 'section_view'];

      const role = await Role.findOneAndUpdate(
        { code: r.code },
        { ...r, permissions: rolePerms },
        { upsert: true, new: true }
      );
      if (isSuper) superAdminRole = role;
    }
    console.log(`✅ Default Roles seeded with granular action permissions.`);

    // 3. Seed School & Main Campus
    const school = await School.findOneAndUpdate(
      { code: 'SCH-001' },
      {
        name: 'St. Mary Enterprise Academy',
        code: 'SCH-001',
        address: '100 Knowledge Boulevard, Tech City',
        phone: '+91 98765 43210',
        email: 'contact@stmarys.edu',
        website: 'https://stmarys.edu',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        status: 'ACTIVE',
      },
      { upsert: true, new: true }
    );

    await Campus.findOneAndUpdate(
      { schoolId: school._id, code: 'MAIN' },
      {
        schoolId: school._id,
        name: 'Main City Campus',
        code: 'MAIN',
        address: '100 Knowledge Boulevard',
        isMain: true,
        status: 'ACTIVE',
      },
      { upsert: true, new: true }
    );
    console.log(`✅ School & Main Campus seeded.`);

    // 4. Seed Super Admin User (admin@schoolerp.com / admin123)
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await User.findOneAndUpdate(
      { email: 'admin@schoolerp.com' },
      {
        schoolId: school._id,
        roleId: superAdminRole._id,
        email: 'admin@schoolerp.com',
        password: hashedPassword,
        name: 'System Administrator',
        phone: '+91 98765 43210',
        status: 'ACTIVE',
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Super Admin User seeded: ${adminUser.email} (Password: admin123)`);
    console.log('\n🎉 MongoDB School_Management Database Seeding Complete!');
  } catch (error) {
    console.error('❌ Seeding Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

seed();

