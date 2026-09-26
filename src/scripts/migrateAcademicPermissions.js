require('dotenv').config();
const dns = require('dns');

if (process.env.MONGODB_DNS_SERVERS) {
  const dnsServers = process.env.MONGODB_DNS_SERVERS.split(',').map((s) => s.trim());
  dns.setServers(dnsServers);
} else {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
  } catch (_) {}
}

const mongoose = require('mongoose');
const Permission = require('../models/Permission');
const Role = require('../models/Role');

const DRY_RUN = process.argv.includes('--dry-run');

const NEW_PERMISSIONS = [
  // Full page view
  { module: 'Academic Setup', action: 'view', code: 'academic_config_view', name: 'View Academic Configuration', description: 'Access the full Academic Configuration workspace' },

  // Academic Years
  { module: 'Academic Setup', action: 'create', code: 'academic_year_create', name: 'Create Academic Year', description: 'Add new academic calendar years' },
  { module: 'Academic Setup', action: 'edit', code: 'academic_year_edit', name: 'Edit Academic Year', description: 'Modify academic calendar years' },
  { module: 'Academic Setup', action: 'inactive', code: 'academic_year_inactive', name: 'Deactivate Academic Year', description: 'Deactivate academic calendar years' },
  { module: 'Academic Setup', action: 'active', code: 'academic_year_active', name: 'Activate Academic Year', description: 'Activate or set as current academic calendar year' },

  // Academic Terms
  { module: 'Academic Setup', action: 'create', code: 'academic_term_create', name: 'Create Academic Term', description: 'Add new academic terms' },
  { module: 'Academic Setup', action: 'edit', code: 'academic_term_edit', name: 'Edit Academic Term', description: 'Modify academic terms' },
  { module: 'Academic Setup', action: 'inactive', code: 'academic_term_inactive', name: 'Deactivate Academic Term', description: 'Deactivate academic terms' },
  { module: 'Academic Setup', action: 'active', code: 'academic_term_active', name: 'Activate Academic Term', description: 'Activate academic terms' },

  // Grades / Classes
  { module: 'Academic Setup', action: 'create', code: 'grade_create', name: 'Create Grade / Class', description: 'Add new grade and class levels' },
  { module: 'Academic Setup', action: 'edit', code: 'grade_edit', name: 'Edit Grade / Class', description: 'Modify grade and class levels' },
  { module: 'Academic Setup', action: 'inactive', code: 'grade_inactive', name: 'Deactivate Grade / Class', description: 'Deactivate grade and class levels' },
  { module: 'Academic Setup', action: 'active', code: 'grade_active', name: 'Activate Grade / Class', description: 'Activate grade and class levels' },

  // Sections
  { module: 'Academic Setup', action: 'create', code: 'section_create', name: 'Create Section', description: 'Add new class sections' },
  { module: 'Academic Setup', action: 'edit', code: 'section_edit', name: 'Edit Section', description: 'Modify class sections' },
  { module: 'Academic Setup', action: 'inactive', code: 'section_inactive', name: 'Deactivate Section', description: 'Deactivate class sections' },
  { module: 'Academic Setup', action: 'active', code: 'section_active', name: 'Activate Section', description: 'Activate class sections' },

  // Master Subjects
  { module: 'Academic Setup', action: 'create', code: 'subject_create', name: 'Create Master Subject', description: 'Add new master subjects' },
  { module: 'Academic Setup', action: 'edit', code: 'subject_edit', name: 'Edit Master Subject', description: 'Modify master subjects' },
  { module: 'Academic Setup', action: 'inactive', code: 'subject_inactive', name: 'Deactivate Master Subject', description: 'Deactivate master subjects' },
  { module: 'Academic Setup', action: 'active', code: 'subject_active', name: 'Activate Master Subject', description: 'Activate master subjects' },

  // Class Subjects
  { module: 'Academic Setup', action: 'edit', code: 'class_subject_edit', name: 'Edit Class Subjects', description: 'Configure and save class subjects' },

  // Teacher Assignments
  { module: 'People & Staff', action: 'create', code: 'teacher_assignment_create', name: 'Create Teacher Assignment', description: 'Assign teachers to classes and subjects' },
  { module: 'People & Staff', action: 'edit', code: 'teacher_assignment_edit', name: 'Edit Teacher Assignment', description: 'Modify teacher assignments' },
  { module: 'People & Staff', action: 'active', code: 'teacher_assignment_active', name: 'Activate Teacher Assignment', description: 'Activate teacher assignments' },
  { module: 'People & Staff', action: 'inactive', code: 'teacher_assignment_inactive', name: 'Deactivate Teacher Assignment', description: 'Deactivate teacher assignments' },
];

const IMPLIED_BY = {
  academic_config_view: ['academic_year_view', 'academic_term_view', 'grade_view', 'section_view', 'subject_view', 'class_subject_view', 'teacher_assignment_view', 'academic_year_manage'],
  academic_year_create: ['academic_year_manage'],
  academic_year_edit: ['academic_year_manage'],
  academic_year_inactive: ['academic_year_manage'],
  academic_year_active: ['academic_year_manage'],
  academic_term_create: ['academic_term_manage', 'academic_year_manage'],
  academic_term_edit: ['academic_term_manage', 'academic_year_manage'],
  academic_term_inactive: ['academic_term_manage', 'academic_year_manage'],
  academic_term_active: ['academic_term_manage', 'academic_year_manage'],
  grade_create: ['grade_manage'],
  grade_edit: ['grade_manage'],
  grade_inactive: ['grade_manage'],
  grade_active: ['grade_manage'],
  section_create: ['section_manage', 'grade_manage'],
  section_edit: ['section_manage', 'grade_manage'],
  section_inactive: ['section_manage', 'grade_manage'],
  section_active: ['section_manage', 'grade_manage'],
  subject_create: ['subject_manage'],
  subject_edit: ['subject_manage'],
  subject_inactive: ['subject_manage'],
  subject_active: ['subject_manage'],
  class_subject_edit: ['class_subject_manage'],
  teacher_assignment_create: ['teacher_assignment_manage', 'teacher_create'],
  teacher_assignment_edit: ['teacher_assignment_manage', 'teacher_edit'],
  teacher_assignment_active: ['teacher_assignment_manage', 'teacher_delete'],
  teacher_assignment_inactive: ['teacher_assignment_manage', 'teacher_delete'],
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  console.log('\n--- Step 1: Permission Documents ---');
  for (const perm of NEW_PERMISSIONS) {
    const existing = await Permission.findOne({ code: perm.code }).lean();
    if (existing) {
      console.log(`  = already exists: ${perm.code}`);
      continue;
    }
    console.log(`  + ${DRY_RUN ? '[dry-run] would create' : 'creating'}: ${perm.code}`);
    if (!DRY_RUN) await Permission.create(perm);
  }

  console.log('\n--- Step 2: Role Permission Grants (additive only) ---');
  const roles = await Role.find({});
  for (const role of roles) {
    const current = new Set(role.permissions || []);
    if (current.has('*')) {
      console.log(`  = ${role.code}: has wildcard '*', skipping`);
      continue;
    }

    const toAdd = [];
    for (const perm of NEW_PERMISSIONS) {
      if (current.has(perm.code)) continue;
      const impliedBy = IMPLIED_BY[perm.code] || [];
      const alreadyImplicitlyAllowed = impliedBy.some((alias) => current.has(alias));
      if (alreadyImplicitlyAllowed) toAdd.push(perm.code);
    }

    if (!toAdd.length) {
      console.log(`  = ${role.code}: no changes`);
      continue;
    }

    console.log(`  + ${role.code}: adding ${toAdd.length} permissions: ${toAdd.join(', ')}`);
    if (!DRY_RUN) {
      role.permissions = Array.from(new Set([...(role.permissions || []), ...toAdd]));
      await role.save();
    }
  }

  console.log('\nDone!');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
