/**
 * Migration Script: Migrate Intern Applications to Campus Hiring Drive
 * 
 * Target Database: hrdb_softrateglobalcom
 * Target College:  Loyola Institute of Technology (6aec0b41630cc83585707705)
 * Target Drive:    MERN Stack Recruitment Campus (6aec0bbb630cc83585707716)
 * 
 * Usage:
 *   Dry run (preview without saving):
 *     node migrate-interns-to-campus-drive.js --start="2026-11-05 09:00:00" --end="2026-11-05 11:30:00"
 * 
 *   Execute Migration:
 *     node migrate-interns-to-campus-drive.js --start="2026-11-05 09:00:00" --end="2026-11-05 11:30:00" --execute
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://peoplesoft_db_user:jdaKGQQTcmvIFyCl@peoplesoft.rjdu5de.mongodb.net/';
const TARGET_DB = 'hrdb_softrateglobalcom';
const TARGET_DRIVE_ID = '6aec0bbb630cc83585707716';
const TARGET_COLLEGE_ID = '6aec0b41630cc83585707705';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    start: null,
    end: null,
    collegeFilter: null,
    execute: false
  };

  for (const arg of args) {
    if (arg.startsWith('--start=')) {
      options.start = new Date(arg.split('=')[1].trim());
    } else if (arg.startsWith('--end=')) {
      options.end = new Date(arg.split('=')[1].trim());
    } else if (arg.startsWith('--college=')) {
      options.collegeFilter = arg.split('=')[1].trim();
    } else if (arg === '--execute') {
      options.execute = true;
    }
  }

  return options;
}

async function run() {
  const options = parseArgs();

  console.log('===============================================================');
  console.log(' CAMPUS HIRING DRIVE MIGRATION TOOL');
  console.log('===============================================================');
  console.log(`Database:     ${TARGET_DB}`);
  console.log(`Target Drive: MERN Stack Recruitment Campus (${TARGET_DRIVE_ID})`);
  console.log(`College:      Loyola Institute of Technology (${TARGET_COLLEGE_ID})`);
  console.log(`Mode:         ${options.execute ? 'EXECUTE (Writing to DB)' : 'DRY RUN (Preview Only - No DB writes)'}`);

  if (!options.start || isNaN(options.start.getTime())) {
    console.error('\n❌ Error: Please provide a valid --start time.');
    console.log('Example: node migrate-interns-to-campus-drive.js --start="2026-11-05 09:00:00" --end="2026-11-05 11:30:00"');
    process.exit(1);
  }

  const end = options.end && !isNaN(options.end.getTime()) ? options.end : new Date();
  console.log(`Time Slot:    ${options.start.toISOString()} --> ${end.toISOString()}`);
  if (options.collegeFilter) {
    console.log(`College Filter: ${options.collegeFilter}`);
  }
  console.log('---------------------------------------------------------------\n');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.useDb(TARGET_DB);

  // 1. Fetch Target Drive
  const drive = await db.collection('campusdrives').findOne({ _id: new mongoose.Types.ObjectId(TARGET_DRIVE_ID) });
  if (!drive) {
    console.error('❌ Target campus drive not found!');
    await mongoose.disconnect();
    process.exit(1);
  }

  const college = await db.collection('colleges').findOne({ _id: new mongoose.Types.ObjectId(TARGET_COLLEGE_ID) });
  const companyId = drive.companyId;

  // Round 1 config
  const round1 = (drive.rounds || []).find(r => r.order === 1) || {
    roundId: 'r_aptitude',
    name: 'Aptitude Test',
    order: 1
  };

  // 2. Query Intern Applications in Time Slot
  const internQuery = {
    companyId: companyId,
    createdAt: {
      $gte: options.start,
      $lte: end
    }
  };

  if (options.collegeFilter) {
    internQuery.college = new RegExp(options.collegeFilter, 'i');
  }

  const matchingInterns = await db.collection('interns')
    .find(internQuery)
    .sort({ createdAt: 1 })
    .toArray();

  console.log(`Found ${matchingInterns.length} intern application(s) in this time slot.`);
  if (matchingInterns.length === 0) {
    console.log('No applications matched the specified criteria.');
    await mongoose.disconnect();
    return;
  }

  // 3. Check for existing students in this drive to avoid duplicates
  const driveObjectId = new mongoose.Types.ObjectId(TARGET_DRIVE_ID);
  const collegeObjectId = new mongoose.Types.ObjectId(TARGET_COLLEGE_ID);

  const existingStudents = await db.collection('campusstudents')
    .find({ driveId: driveObjectId }, { projection: { email: 1, rollNumber: 1 } })
    .toArray();

  const existingEmails = new Set(existingStudents.map(s => (s.email || '').toLowerCase()));
  const existingRolls = new Set(existingStudents.map(s => (s.rollNumber || '').toLowerCase()));

  const toMigrate = [];
  const skipped = [];

  for (const intern of matchingInterns) {
    const email = (intern.email || '').trim().toLowerCase();
    const rollNumber = email; // Set rollNumber to email so candidate logs into HirePro with email

    if (existingEmails.has(email) || existingRolls.has(rollNumber)) {
      skipped.push({ intern, reason: 'Already exists in this Campus Drive' });
    } else {
      toMigrate.push(intern);
    }
  }

  console.log(`\nReady to Migrate: ${toMigrate.length}`);
  console.log(`Skipped/Duplicates: ${skipped.length}`);

  console.log('\nPreview of candidates to migrate:');
  console.table(toMigrate.map((i, idx) => ({
    '#': idx + 1,
    'Full Name': i.fullName,
    'Email (HirePro ID)': i.email,
    'Mobile': i.contact,
    'Applied Role': i.role || 'Full Stack Developer (MERN)',
    'College': i.college || (college ? college.name : ''),
    'Project Links': (i.projectLinks || []).length,
    'Applied At': new Date(i.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  })));

  if (skipped.length > 0) {
    console.log('\nSkipped candidates:');
    console.table(skipped.map(s => ({
      'Full Name': s.intern.fullName,
      'Email': s.intern.email,
      'Reason': s.reason
    })));
  }

  if (!options.execute) {
    console.log('\n⚡ This was a DRY RUN. No database records were created or modified.');
    console.log('To execute this migration, re-run with --execute:');
    console.log(`node migrate-interns-to-campus-drive.js --start="${options.start.toISOString()}" --end="${end.toISOString()}" --execute\n`);
    await mongoose.disconnect();
    return;
  }

  // 4. Execute Migration
  console.log('\n🚀 Executing migration...');
  let migratedCount = 0;
  const errors = [];

  for (const intern of toMigrate) {
    try {
      const email = (intern.email || '').trim().toLowerCase();
      const rollNumber = email;

      const studentDoc = {
        driveId: driveObjectId,
        collegeId: collegeObjectId,
        collegeName: college ? college.name : (intern.college || ''),
        rollNumber: rollNumber,
        fullName: intern.fullName || 'Candidate',
        dob: intern.dob || null,
        password: intern.password || 'Softrate@123',
        email: email,
        phone: intern.contact || '',
        department: intern.department || '',
        degree: intern.degree || 'B.E/B.Tech',
        cgpa: intern.cgpaOrPercentage ? intern.cgpaOrPercentage.toString() : '',
        passingYear: (intern.year || intern.passingYear || '2026').toString(),
        appliedRoles: [intern.role || 'Full Stack Developer (MERN)'],
        selectedRole: intern.role || 'Full Stack Developer (MERN)',
        projectLinks: intern.projectLinks || [],
        linkedin: intern.linkedin || '',
        assessmentAnswers: intern.assessmentAnswers || {},
        currentRoundOrder: round1.order,
        currentRoundName: round1.name,
        overallStatus: 'Active',
        isFormSubmitted: true,
        formSubmittedAt: intern.createdAt || new Date(),
        roundHistory: [
          {
            _id: new mongoose.Types.ObjectId(),
            roundId: round1.roundId,
            roundName: round1.name,
            roundOrder: round1.order,
            status: 'Pending',
            score: 0,
            remarks: 'Migrated from Intern Web Application'
          }
        ],
        companyId: companyId,
        createdAt: intern.createdAt || new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('campusstudents').insertOne(studentDoc);

      // Link back on the intern record
      await db.collection('interns').updateOne(
        { _id: intern._id },
        {
          $set: {
            campusStudentId: result.insertedId,
            driveId: driveObjectId,
            collegeId: collegeObjectId,
            updatedAt: new Date()
          }
        }
      );

      migratedCount++;
    } catch (err) {
      console.error(`Failed to migrate ${intern.email}:`, err.message);
      errors.push({ email: intern.email, error: err.message });
    }
  }

  console.log('\n===============================================================');
  console.log(`✅ Migration Complete!`);
  console.log(`Successfully Migrated: ${migratedCount} candidates`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
  }
  console.log('All migrated candidates can now log into HirePro using:');
  console.log('  - User ID:  Candidate Email Address');
  console.log('  - Password: Candidate Date of Birth in DDMMYYYY format (or Phone Number)');
  console.log('===============================================================\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});

