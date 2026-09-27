const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
require('dotenv').config();

const School = require('../models/School');
const Department = require('../models/Department');
const Qualification = require('../models/Qualification');
const Staff = require('../models/Staff');

// Canonical Departments
const CANONICAL_DEPARTMENTS = [
  { code: 'SCI', name: 'Science', description: 'Physics, Chemistry, Biology & Natural Sciences', aliases: ['sci department', 'science'] },
  { code: 'MATH', name: 'Mathematics', description: 'Pure & Applied Mathematics, Statistics', aliases: ['math department', 'mathematics'] },
  { code: 'ENG', name: 'English', description: 'English Language, Grammar & Literature', aliases: ['eng department', 'english', 'languages'] },
  { code: 'TAM', name: 'Tamil', description: 'Tamil Language & Classical Tamil Literature', aliases: ['tam department', 'tamil'] },
  { code: 'HIN', name: 'Hindi', description: 'Hindi Language & Literature', aliases: ['hin department', 'hindi'] },
  { code: 'FRE', name: 'French', description: 'French Foreign Language Studies', aliases: ['fre department', 'french'] },
  { code: 'SOC_SCI', name: 'Social Sciences', description: 'History, Geography, Civics & Economics', aliases: ['soc-sci department', 'social sciences', 'social studies'] },
  { code: 'CS', name: 'Computer Science & IT', description: 'Computer Applications, Coding & Information Technology', aliases: ['cs department', 'computer science', 'it & systems', 'it'] },
  { code: 'EVS', name: 'Environmental Studies', description: 'Ecology, Environmental Science & Sustainability', aliases: ['evs department', 'environmental science', 'environmental studies'] },
  { code: 'ARTS', name: 'Arts & Crafts', description: 'Fine Arts, Visual Design & Handicrafts', aliases: ['art department', 'arts', 'fine arts'] },
  { code: 'PET', name: 'Physical Education & Sports', description: 'Athletics, Physical Training, Yoga & Games', aliases: ['pet department', 'physical education', 'sports'] },
  { code: 'VE', name: 'Value Education & Life Skills', description: 'Ethics, Moral Science, Life Skills & Wellbeing', aliases: ['ve department', 'value education', 'value education & life skills'] },
  { code: 'ACAD', name: 'Academic & Instruction', description: 'Curriculum Planning, Pedagogy & Faculty Coordination', aliases: ['academic & instruction', 'academic', 'academics'] },
  { code: 'LEAD', name: 'Leadership & Administration', description: 'Executive Leadership, School Governance & Policy', aliases: ['leadership', 'administration'] },
  { code: 'FIN', name: 'Finance & Accounts', description: 'Tuition, Accounting, Payroll & Financial Planning', aliases: ['finance', 'accounts'] },
  { code: 'HR', name: 'Human Resources', description: 'Staffing, Faculty Development & Employee Welfare', aliases: ['human resources', 'hr'] },
  { code: 'OPS', name: 'Operations & Facilities', description: 'Campus Logistics, Transport, Security & Maintenance', aliases: ['operations', 'security', 'transport'] },
  { code: 'LIB', name: 'Library & Learning Resources', description: 'Library Operations, Archive & Research Resources', aliases: ['library'] },
];

// Canonical Qualifications & Degrees
const CANONICAL_QUALIFICATIONS = [
  // Degrees & Diplomas
  { code: 'MA', name: 'M.A.', level: 'POST_GRADUATE', description: 'Master of Arts' },
  { code: 'BA', name: 'B.A.', level: 'UNDER_GRADUATE', description: 'Bachelor of Arts' },
  { code: 'MSC', name: 'M.Sc.', level: 'POST_GRADUATE', description: 'Master of Science' },
  { code: 'BSC', name: 'B.Sc.', level: 'UNDER_GRADUATE', description: 'Bachelor of Science' },
  { code: 'BED', name: 'B.Ed.', level: 'PROFESSIONAL', description: 'Bachelor of Education' },
  { code: 'MED', name: 'M.Ed.', level: 'POST_GRADUATE', description: 'Master of Education' },
  { code: 'MCA', name: 'M.C.A.', level: 'POST_GRADUATE', description: 'Master of Computer Applications' },
  { code: 'BCA', name: 'B.C.A.', level: 'UNDER_GRADUATE', description: 'Bachelor of Computer Applications' },
  { code: 'BE', name: 'B.E.', level: 'UNDER_GRADUATE', description: 'Bachelor of Engineering' },
  { code: 'BTECH', name: 'B.Tech', level: 'UNDER_GRADUATE', description: 'Bachelor of Technology' },
  { code: 'MTECH', name: 'M.Tech', level: 'POST_GRADUATE', description: 'Master of Technology' },
  { code: 'PHD', name: 'Ph.D', level: 'DOCTORATE', description: 'Doctor of Philosophy' },
  { code: 'MPHIL', name: 'M.Phil.', level: 'POST_GRADUATE', description: 'Master of Philosophy' },
  { code: 'MBA', name: 'MBA', level: 'POST_GRADUATE', description: 'Master of Business Administration' },
  { code: 'BCOM', name: 'B.Com', level: 'UNDER_GRADUATE', description: 'Bachelor of Commerce' },
  { code: 'MCOM', name: 'M.Com', level: 'POST_GRADUATE', description: 'Master of Commerce' },
  { code: 'BFA', name: 'B.F.A.', level: 'UNDER_GRADUATE', description: 'Bachelor of Fine Arts' },
  { code: 'MFA', name: 'M.F.A.', level: 'POST_GRADUATE', description: 'Master of Fine Arts' },
  { code: 'BPED', name: 'B.P.Ed.', level: 'PROFESSIONAL', description: 'Bachelor of Physical Education' },
  { code: 'MPED', name: 'M.P.Ed.', level: 'POST_GRADUATE', description: 'Master of Physical Education' },
  { code: 'MLIB', name: 'M.Lib', level: 'POST_GRADUATE', description: 'Master of Library Science' },
  { code: 'BLIB', name: 'B.Lib', level: 'UNDER_GRADUATE', description: 'Bachelor of Library Science' },
  { code: 'DELED', name: 'D.El.Ed.', level: 'DIPLOMA', description: 'Diploma in Elementary Education' },
  { code: 'NIS', name: 'NIS', level: 'CERTIFICATE', description: 'National Institute of Sports Coaching' },
  { code: 'CA', name: 'CA', level: 'PROFESSIONAL', description: 'Chartered Accountant' },
  { code: 'YOGA_DIP', name: 'Yoga Diploma', level: 'DIPLOMA', description: 'Diploma in Yogic Science' },
  { code: 'YOGA_INST', name: 'Yoga Instructor', level: 'CERTIFICATE', description: 'Certified Yoga Instructor' },
  { code: 'DIP_HANDI', name: 'Diploma in Handicrafts', level: 'DIPLOMA', description: 'Diploma in Handicrafts & Vocational Arts' },

  // Specializations / Discipline Tracks
  { code: 'SPEC_VE', name: 'Value Education & Life Skills', level: 'SPECIALIZATION', description: 'Value Education & Life Skills' },
  { code: 'SPEC_MATH', name: 'Mathematics', level: 'SPECIALIZATION', description: 'Mathematics' },
  { code: 'SPEC_TAM_LIT', name: 'Tamil Literature', level: 'SPECIALIZATION', description: 'Tamil Literature' },
  { code: 'SPEC_ENG_LIT', name: 'English Literature', level: 'SPECIALIZATION', description: 'English Literature' },
  { code: 'SPEC_PHY', name: 'Physics', level: 'SPECIALIZATION', description: 'Physical Sciences' },
  { code: 'SPEC_CHEM', name: 'Chemistry', level: 'SPECIALIZATION', description: 'Chemical Sciences' },
  { code: 'SPEC_BOT', name: 'Botany', level: 'SPECIALIZATION', description: 'Botany & Plant Biology' },
  { code: 'SPEC_ZOO', name: 'Zoology', level: 'SPECIALIZATION', description: 'Zoology & Animal Biology' },
  { code: 'SPEC_HIST_CIV', name: 'History & Civics', level: 'SPECIALIZATION', description: 'History & Political Science' },
  { code: 'SPEC_SOC_SCI', name: 'Social Sciences', level: 'SPECIALIZATION', description: 'Social Sciences' },
  { code: 'SPEC_CS', name: 'Computer Science', level: 'SPECIALIZATION', description: 'Computer Science' },
  { code: 'SPEC_TAM', name: 'Tamil', level: 'SPECIALIZATION', description: 'Tamil Language' },
  { code: 'SPEC_GEO', name: 'Geography', level: 'SPECIALIZATION', description: 'Geography' },
  { code: 'SPEC_ENG', name: 'English', level: 'SPECIALIZATION', description: 'English Language' },
  { code: 'SPEC_ECON', name: 'Economics', level: 'SPECIALIZATION', description: 'Economics' },
  { code: 'SPEC_HIST', name: 'History', level: 'SPECIALIZATION', description: 'History' },
  { code: 'SPEC_EVS', name: 'Environmental Science', level: 'SPECIALIZATION', description: 'Environmental Science' },
  { code: 'SPEC_IT', name: 'Information Tech', level: 'SPECIALIZATION', description: 'Information Technology' },
  { code: 'SPEC_EV_STUD', name: 'Environmental Studies', level: 'SPECIALIZATION', description: 'Environmental Studies' },
  { code: 'SPEC_PE', name: 'Physical Education', level: 'SPECIALIZATION', description: 'Physical Education' },
  { code: 'SPEC_HIN_LIT', name: 'Hindi Literature', level: 'SPECIALIZATION', description: 'Hindi Literature' },
  { code: 'SPEC_FINE_ARTS', name: 'Drawing & Fine Arts', level: 'SPECIALIZATION', description: 'Drawing & Fine Arts' },
  { code: 'SPEC_FRE_LIT', name: 'French Literature', level: 'SPECIALIZATION', description: 'French Literature' },
  { code: 'SPEC_ATHLETICS', name: 'Athletics', level: 'SPECIALIZATION', description: 'Athletics' },
  { code: 'SPEC_BBALL_ATH', name: 'Basketball & Athletics', level: 'SPECIALIZATION', description: 'Basketball & Athletics' },
  { code: 'SPEC_ECON_GEO', name: 'Economics & Geography', level: 'SPECIALIZATION', description: 'Economics & Geography' },
  { code: 'SPEC_GEO_ECON', name: 'Geography & Economics', level: 'SPECIALIZATION', description: 'Geography & Economics' },
  { code: 'SPEC_ZOO_LIFE', name: 'Zoology & Life Sciences', level: 'SPECIALIZATION', description: 'Zoology & Life Sciences' },
  { code: 'SPEC_BOT_LIFE', name: 'Botany & Life Sciences', level: 'SPECIALIZATION', description: 'Botany & Life Sciences' },
  { code: 'SPEC_ZOO_MICRO', name: 'Zoology & Microbiology', level: 'SPECIALIZATION', description: 'Zoology & Microbiology' },
  { code: 'SPEC_FRE', name: 'French', level: 'SPECIALIZATION', description: 'French Language' },
  { code: 'SPEC_EDU_ADMIN', name: 'Education Administration', level: 'SPECIALIZATION', description: 'Education Administration' },
  { code: 'SPEC_EDU_LEAD', name: 'Educational Leadership', level: 'SPECIALIZATION', description: 'Educational Leadership' },
  { code: 'SPEC_FINANCE', name: 'Finance', level: 'SPECIALIZATION', description: 'Financial Management' },
  { code: 'SPEC_HR', name: 'HR', level: 'SPECIALIZATION', description: 'Human Resource Management' },
  { code: 'SPEC_IT_GOV', name: 'IT Governance', level: 'SPECIALIZATION', description: 'IT Governance & Enterprise Architecture' },
  { code: 'SPEC_LIB_SCI', name: 'Library Science', level: 'SPECIALIZATION', description: 'Library & Information Science' },
];

function decomposeQualification(raw) {
  if (!raw || !raw.trim()) return [];
  let str = raw.trim();

  // Extract parenthesized specialization: e.g. "M.A., B.Ed. (Value Education & Life Skills)"
  let spec = null;
  const parenMatch = str.match(/\(([^)]+)\)/);
  if (parenMatch) {
    spec = parenMatch[1].trim();
    str = str.replace(/\([^)]+\)/, '').trim();
  }

  // Handle "in [field]" e.g. "Ph.D in Education Administration"
  const inMatch = str.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch) {
    str = inMatch[1].trim();
    spec = inMatch[2].trim();
  }

  // Split by comma
  const parts = str.split(',').map(p => p.trim()).filter(Boolean);

  // If there's a space-separated suffix like "MBA Finance, CA" or "MBA HR" or "M.Lib Library Science" or "M.Tech IT Governance"
  const cleanedParts = [];
  for (const part of parts) {
    const spaceMatch = part.match(/^(MBA|M\.Lib|M\.Tech)\s+(.+)$/i);
    if (spaceMatch) {
      cleanedParts.push(spaceMatch[1].trim());
      spec = spaceMatch[2].trim();
    } else {
      cleanedParts.push(part);
    }
  }

  if (spec) {
    // Normalise specializations like "CSE" -> "Computer Science"
    if (spec.toUpperCase() === 'CSE') spec = 'Computer Science';
    cleanedParts.push(spec);
  }

  return cleanedParts;
}

async function runMigration() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const schools = await School.find({});
  if (schools.length === 0) {
    console.error('No schools found.');
    process.exit(1);
  }
  const primarySchool = schools[0];
  const schoolId = primarySchool._id;
  console.log(`Target School: ${primarySchool.name} (${schoolId})`);

  // 1. Seed / Upsert Departments
  console.log('\n--- 1. Seeding Canonical Departments ---');
  const deptMap = new Map();
  for (const d of CANONICAL_DEPARTMENTS) {
    let dept = await Department.findOne({ schoolId, code: d.code });
    if (!dept) {
      dept = await Department.create({
        schoolId,
        code: d.code,
        name: d.name,
        description: d.description,
        status: 'ACTIVE',
      });
      console.log(`Created Department: [${d.code}] ${d.name}`);
    } else {
      dept.name = d.name;
      dept.description = d.description;
      await dept.save();
    }
    deptMap.set(d.code, dept);
    // Index aliases
    for (const alias of d.aliases) {
      deptMap.set(alias.toLowerCase(), dept);
    }
  }

  // 2. Seed / Upsert Qualifications
  console.log('\n--- 2. Seeding Canonical Qualifications ---');
  const qualMap = new Map();
  for (const q of CANONICAL_QUALIFICATIONS) {
    let qual = await Qualification.findOne({
      $or: [{ schoolId }, { schoolId: null }],
      name: { $regex: `^${q.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (!qual) {
      qual = await Qualification.create({
        schoolId,
        code: q.code,
        name: q.name,
        level: q.level,
        description: q.description,
        status: 'ACTIVE',
      });
      console.log(`Created Qualification: [${q.code}] ${q.name} (${q.level})`);
    } else {
      qual.code = q.code;
      qual.level = q.level;
      if (q.description) qual.description = q.description;
      await qual.save();
    }
    qualMap.set(q.name.toLowerCase(), qual);
    // Also map common variations
    const dotless = q.name.replace(/\./g, '').toLowerCase();
    qualMap.set(dotless, qual);
  }

  // Helper function to resolve qualification by token
  const resolveQualification = async (token) => {
    const raw = token.trim();
    const key = raw.toLowerCase();
    if (qualMap.has(key)) return qualMap.get(key);
    const dotless = key.replace(/\./g, '');
    if (qualMap.has(dotless)) return qualMap.get(dotless);

    // Try finding in DB
    let found = await Qualification.findOne({
      $or: [{ schoolId }, { schoolId: null }],
      name: { $regex: `^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (!found) {
      // Create it dynamically if missing
      found = await Qualification.create({
        schoolId,
        code: raw.replace(/[^A-Za-z0-9]/g, '').substring(0, 10).toUpperCase(),
        name: raw,
        level: 'OTHER',
        status: 'ACTIVE',
      });
      console.log(`Created dynamic qualification: ${raw}`);
    }
    qualMap.set(key, found);
    return found;
  };

  // Helper function to resolve department
  const resolveDepartment = (rawDept) => {
    if (!rawDept || !rawDept.trim()) return deptMap.get('ACAD');
    const key = rawDept.trim().toLowerCase();
    if (deptMap.has(key)) return deptMap.get(key);

    // Fuzzy check
    for (const [alias, dept] of deptMap.entries()) {
      if (key.includes(alias) || alias.includes(key)) {
        return dept;
      }
    }
    return deptMap.get('ACAD');
  };

  // 3. Map all staff members
  console.log('\n--- 3. Mapping Staff Members to Departments & Qualifications ---');
  const allStaff = await Staff.find({ schoolId });
  console.log(`Found ${allStaff.length} staff members.`);

  let updatedCount = 0;
  for (const st of allStaff) {
    // A. Resolve Department
    const matchedDept = resolveDepartment(st.department);
    st.departmentId = matchedDept._id;
    st.department = matchedDept.name;

    // B. Resolve Qualifications
    const tokens = decomposeQualification(st.qualification);
    const qualIds = [];
    const resolvedNames = [];
    for (const token of tokens) {
      const q = await resolveQualification(token);
      if (q && !qualIds.some(id => id.toString() === q._id.toString())) {
        qualIds.push(q._id);
        resolvedNames.push(q.name);
      }
    }
    st.qualificationIds = qualIds;
    // Format nicely like: ( M.A., B.Ed. (Value Education & Life Skills) )
    if (tokens.length >= 2 && resolvedNames.length >= 2) {
      const degrees = resolvedNames.slice(0, -1);
      const lastSpec = resolvedNames[resolvedNames.length - 1];
      // Check if last is a specialization
      const lastQual = await Qualification.findById(qualIds[qualIds.length - 1]);
      if (lastQual && lastQual.level === 'SPECIALIZATION') {
        st.qualification = `${degrees.join(', ')} (${lastSpec})`;
      } else {
        st.qualification = resolvedNames.join(', ');
      }
    } else if (resolvedNames.length > 0) {
      st.qualification = resolvedNames.join(', ');
    }

    await st.save();
    updatedCount++;
    console.log(
      `Updated [${st.employeeId}] ${st.firstName} ${st.lastName}: Dept -> '${st.department}' | Qual -> '${st.qualification}' (${st.qualificationIds.length} IDs)`
    );
  }

  console.log(`\nSuccessfully migrated ${updatedCount} staff members!`);
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
