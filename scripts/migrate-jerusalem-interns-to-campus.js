#!/usr/bin/env node

/**
 * Migration Script: Migrate Candidates from Play Store Mobile App Onboarding (code: JCE)
 * (hrdb_jerusalem.interns) -> (hrdb_softrateglobalcom.campusstudents)
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
    // Fallback if URL parsing fails on mongodb+srv
    const [base, query] = rawUri.split('?');
    const cleanBase = base.replace(/\/+$/, '');
    const prefix = cleanBase.substring(0, cleanBase.lastIndexOf('/') + 1);
    return `${prefix}${dbName}${query ? '?' + query : ''}`;
  }
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

  // Fetch all interns registered under Jerusalem
  const interns = await jerusalemInternsColl.find({}).toArray();
  console.log(`📋 Total candidates in hrdb_jerusalem.interns: ${interns.length}`);

  if (interns.length === 0) {
    console.log('ℹ️  No candidates to migrate at this time.');
    await jerusalemConn.close();
    await softrateConn.close();
    process.exit(0);
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const intern of interns) {
    const email = (intern.email || '').trim().toLowerCase();
    const phone = (intern.contact || intern.phone || '').trim();
    const fullName = (intern.fullName || intern.name || '').trim();
    // Use rollNumber if present, or internId, or fallback to phone
    const rollNumber = (intern.rollNumber || intern.internid || intern.internId || phone || email).trim();

    if (!email || !fullName) {
      console.warn(`⚠️ Skipping candidate with missing email or name:`, intern._id);
      skippedCount++;
      continue;
    }

    // Check if already exists in campusstudents for this drive
    const existing = await campusStudentsColl.findOne({
      driveId: drive._id,
      $or: [
        { email },
        { rollNumber }
      ]
    });

    if (existing) {
      // Update missing fields
      await campusStudentsColl.updateOne(
        { _id: existing._id },
        {
          $set: {
            fullName: fullName || existing.fullName,
            phone: phone || existing.phone,
            department: intern.department || existing.department,
            degree: intern.degree || intern.qualification || existing.degree,
            resumeBase64: intern.resume || existing.resumeBase64,
            resumeUrl: intern.resumeUrl || existing.resumeUrl,
            updatedAt: new Date()
          }
        }
      );
      updatedCount++;
    } else {
      // Insert new Campus Student
      await campusStudentsColl.insertOne({
        driveId: drive._id,
        collegeId: college._id,
        collegeName: college.name,
        rollNumber,
        fullName,
        email,
        phone: phone || '',
        department: intern.department || '',
        degree: intern.degree || intern.qualification || '',
        cgpa: intern.cgpa || '',
        appliedRoles: ['Full Stack Developer (MERN)'],
        selectedRole: 'Full Stack Developer (MERN)',
        resumeBase64: intern.resume || '',
        resumeUrl: intern.resumeUrl || '',
        currentRoundOrder: firstRound.order,
        currentRoundName: firstRound.name,
        overallStatus: 'Active',
        isFormSubmitted: true,
        formSubmittedAt: intern.createdAt || new Date(),
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
      });
      insertedCount++;
    }
  }

  console.log('\n=============================================');
  console.log('🎉 Migration Completed Successfully!');
  console.log(`   - Inserted into Campus Drive: ${insertedCount}`);
  console.log(`   - Updated existing candidates: ${updatedCount}`);
  console.log(`   - Skipped invalid rows:       ${skippedCount}`);
  console.log('=============================================\n');

  await jerusalemConn.close();
  await softrateConn.close();
}

runMigration().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
