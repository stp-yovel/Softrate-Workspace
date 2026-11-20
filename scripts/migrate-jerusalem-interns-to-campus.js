#!/usr/bin/env node

/**
 * Migration Script: Migrate Candidates from Play Store Mobile App Onboarding (code: JCE)
 * (hrdb_jerusalem.interns) -> (hrdb_softrateglobalcom.campusstudents)
 *
 * MAPPING STRATEGY:
 * 1. Match by Email (case-insensitive, trimmed)
 * 2. Fallback: Match by Phone (last 10 digits) to link students who used personal Gmail
 * 3. Fallback: Match by Roll Number
 * 4. Existing students are updated with isFormSubmitted: true, resume, project links, assessment answers
 * 5. Non-matching students (e.g. AI & DS students not in initial roster) are inserted as new candidates
 *
 * Usage:
 *   node scripts/migrate-jerusalem-interns-to-campus.js
 */

const path = require('path');

// Support both standalone root execution and inside-container (/app) execution
let dotenv, mongoose;
try {
  dotenv = require('dotenv');
  mongoose = require('mongoose');
  dotenv.config();
} catch (e) {
  const serviceDir = path.resolve(__dirname, '../services/hrms Multi-terent');
  dotenv = require(path.join(serviceDir, 'node_modules', 'dotenv'));
  mongoose = require(path.join(serviceDir, 'node_modules', 'mongoose'));
  dotenv.config({ path: path.join(serviceDir, '.env') });
}

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://peoplesoft_db_user:jdaKGQQTcmvIFyCl@peoplesoft.rjdu5de.mongodb.net/';

function getTenantUri(rawUri, dbName) {
  try {
    const url = new URL(rawUri);
    url.pathname = `/${dbName}`;
    return url.toString();
  } catch (e) {
    const [base, query] = rawUri.split('?');
    const cleanBase = base.replace(/\/+$/, '');
    const prefix = cleanBase.substring(0, cleanBase.lastIndexOf('/') + 1);
    return `${prefix}${dbName}${query ? '?' + query : ''}`;
  }
}

function cleanPhone(phone) {
  if (!phone) return '';
  return phone.toString().replace(/\D/g, '').slice(-10);
}

function parseProjectLinks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(l => l && typeof l === 'string' && l.trim()).slice(0, 5);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(l => l && typeof l === 'string' && l.trim()).slice(0, 5);
    } catch (_) {}
    if (raw.startsWith('http')) return [raw.trim()];
  }
  return [];
}

function parseAssessmentAnswers(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch (_) {}
  }
  return {};
}

async function runMigration() {
  console.log('🚀 Starting Jerusalem Play Store candidates migration to Campus Hiring...');

  const jerusalemUri = getTenantUri(MONGO_URI, 'hrdb_jerusalem');
  const softrateUri = getTenantUri(MONGO_URI, 'hrdb_softrateglobalcom');

  const jerusalemConn = await mongoose.createConnection(jerusalemUri).asPromise();
  console.log('✅ Connected to source DB: hrdb_jerusalem');

  const softrateConn = await mongoose.createConnection(softrateUri).asPromise();
  console.log('✅ Connected to target DB: hrdb_softrateglobalcom');

  const jerusalemInternsColl = jerusalemConn.db.collection('interns');
  const campusDrivesColl = softrateConn.db.collection('campusdrives');
  const campusStudentsColl = softrateConn.db.collection('campusstudents');
  const collegesColl = softrateConn.db.collection('colleges');

  // Find Jerusalem College & Drive
  const college = await collegesColl.findOne({ name: /Jerusalem College of Engineering/i });
  if (!college) {
    console.error('❌ Jerusalem College of Engineering record not found in colleges collection.');
    process.exit(1);
  }
  console.log(`📍 Found College: ${college.name} (_id: ${college._id})`);

  const drive = await campusDrivesColl.findOne({
    collegeId: college._id,
    roles: { $in: ['Full Stack Developer (MERN)'] }
  }) || await campusDrivesColl.findOne({ collegeId: college._id });

  if (!drive) {
    console.error('❌ Campus Drive for Jerusalem College not found in campusdrives collection.');
    process.exit(1);
  }
  console.log(`📍 Found Campus Drive: "${drive.title}" (_id: ${drive._id})`);

  const firstRound = (drive.rounds || []).find(r => r.isActive && r.order === 1) || drive.rounds?.[0] || {
    roundId: 'r_resume',
    name: 'Shortlisting from Resume',
    order: 1
  };

  // Fetch all interns from hrdb_jerusalem (filter out any test accounts)
  const interns = await jerusalemInternsColl.find({
    email: { $not: /yovel/i },
    fullName: { $not: /yovel/i }
  }).toArray();
  console.log(`📋 Total candidates in hrdb_jerusalem.interns: ${interns.length}`);

  if (interns.length === 0) {
    console.log('ℹ️  No candidates to migrate at this time.');
    await jerusalemConn.close();
    await softrateConn.close();
    process.exit(0);
  }

  // Fetch all existing students in this drive
  const existingCampusStudents = await campusStudentsColl.find({ driveId: drive._id }).toArray();
  console.log(`📚 Existing students in Campus Drive: ${existingCampusStudents.length}`);

  // Build lookup maps
  const existingByEmail = new Map();
  const existingByPhone = new Map();
  const existingByRoll = new Map();

  existingCampusStudents.forEach(s => {
    if (s.email) existingByEmail.set(s.email.trim().toLowerCase(), s);
    const p = cleanPhone(s.phone);
    if (p) existingByPhone.set(p, s);
    if (s.rollNumber) existingByRoll.set(s.rollNumber.trim(), s);
  });

  let matchedByEmailCount = 0;
  let matchedByPhoneCount = 0;
  let matchedByRollCount = 0;
  let newlyInsertedCount = 0;

  for (const intern of interns) {
    const internEmail = (intern.email || '').trim().toLowerCase();
    const internPhone = (intern.contact || intern.phone || '').trim();
    const internCleanPhone = cleanPhone(internPhone);
    const internName = (intern.fullName || intern.name || '').trim();
    const internRoll = (intern.rollNumber || intern.internid || intern.internId || '').trim();

    const projectLinks = parseProjectLinks(intern.projectLinks);
    const assessmentAnswers = parseAssessmentAnswers(intern.assessmentAnswers);

    // 1. Try matching by Email
    let matchedStudent = existingByEmail.get(internEmail);
    let matchType = matchedStudent ? 'email' : null;

    // 2. Try matching by Phone
    if (!matchedStudent && internCleanPhone && existingByPhone.has(internCleanPhone)) {
      matchedStudent = existingByPhone.get(internCleanPhone);
      matchType = 'phone';
    }

    // 3. Try matching by Roll Number
    if (!matchedStudent && internRoll && existingByRoll.has(internRoll)) {
      matchedStudent = existingByRoll.get(internRoll);
      matchType = 'roll';
    }

    if (matchedStudent) {
      if (matchType === 'email') matchedByEmailCount++;
      else if (matchType === 'phone') matchedByPhoneCount++;
      else if (matchType === 'roll') matchedByRollCount++;

      // Update existing student with submitted form data
      const updateFields = {
        isFormSubmitted: true,
        formSubmittedAt: intern.createdAt || new Date(),
        resumeBase64: intern.resume || matchedStudent.resumeBase64 || '',
        resumeUrl: intern.resumeUrl || matchedStudent.resumeUrl || '',
        projectLinks: projectLinks.length > 0 ? projectLinks : matchedStudent.projectLinks || [],
        assessmentAnswers: Object.keys(assessmentAnswers).length > 0 ? assessmentAnswers : matchedStudent.assessmentAnswers || {},
        linkedin: intern.linkedin || matchedStudent.linkedin || '',
        linkedCandidateId: intern._id,
        updatedAt: new Date()
      };

      // Enrich personal email / mobile if previously missing
      if (!matchedStudent.phone && internPhone) updateFields.phone = internPhone;
      if (!matchedStudent.department && intern.department) updateFields.department = intern.department;
      if (!matchedStudent.degree && (intern.degree || intern.qualification)) updateFields.degree = intern.degree || intern.qualification;

      await campusStudentsColl.updateOne({ _id: matchedStudent._id }, { $set: updateFields });
    } else {
      // New Student (e.g. AI & DS students not in initial roster)
      const rollNumber = internRoll || (internCleanPhone ? `23033109${internCleanPhone.slice(-6)}` : `JCE_${Date.now()}`);

      const newDoc = {
        driveId: drive._id,
        collegeId: college._id,
        collegeName: college.name,
        rollNumber,
        fullName: internName,
        email: internEmail,
        phone: internPhone || '',
        department: intern.department || 'Computer Science & Engineering',
        degree: intern.degree || intern.qualification || 'B.E',
        cgpa: intern.cgpa || '',
        appliedRoles: ['Full Stack Developer (MERN)'],
        selectedRole: 'Full Stack Developer (MERN)',
        resumeBase64: intern.resume || '',
        resumeUrl: intern.resumeUrl || '',
        projectLinks,
        assessmentAnswers,
        linkedin: intern.linkedin || '',
        linkedCandidateId: intern._id,
        isFormSubmitted: true,
        formSubmittedAt: intern.createdAt || new Date(),
        currentRoundOrder: firstRound.order,
        currentRoundName: firstRound.name,
        overallStatus: 'Active',
        roundHistory: [
          {
            roundId: firstRound.roundId,
            roundName: firstRound.name,
            roundOrder: firstRound.order,
            status: 'Pending',
            remarks: 'Registered via Play Store App',
            evaluatedAt: new Date()
          }
        ],
        companyId: drive.companyId,
        createdAt: intern.createdAt || new Date(),
        updatedAt: new Date()
      };

      await campusStudentsColl.insertOne(newDoc);
      newlyInsertedCount++;

      // Add to lookup maps so duplicates in this loop are prevented
      existingByEmail.set(internEmail, newDoc);
      if (internCleanPhone) existingByPhone.set(internCleanPhone, newDoc);
      existingByRoll.set(rollNumber, newDoc);
    }
  }

  const finalDriveTotal = await campusStudentsColl.countDocuments({ driveId: drive._id });
  const finalSubmittedTotal = await campusStudentsColl.countDocuments({ driveId: drive._id, isFormSubmitted: true });

  console.log('\n======================================================');
  console.log('🎉 MIGRATION & CANDIDATE MAPPING COMPLETE!');
  console.log('======================================================');
  console.log(`📥 Total Mobile App Applicants Processed: ${interns.length}`);
  console.log(`   ├─ Mapped to Existing by College Email:  ${matchedByEmailCount}`);
  console.log(`   ├─ Mapped to Existing by Mobile Number:   ${matchedByPhoneCount}`);
  console.log(`   ├─ Mapped to Existing by Roll Number:     ${matchedByRollCount}`);
  console.log(`   └─ Newly Inserted Candidates (e.g. AI&DS): ${newlyInsertedCount}`);
  console.log('------------------------------------------------------');
  console.log(`📊 Final Drive Total Students:             ${finalDriveTotal}`);
  console.log(`✅ Total "Form Submitted" Active Candidates: ${finalSubmittedTotal}`);
  console.log('======================================================\n');

  await jerusalemConn.close();
  await softrateConn.close();
}

runMigration().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
