const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://peoplesoft_db_user:jdaKGQQTcmvIFyCl@peoplesoft.rjdu5de.mongodb.net/';

async function acceptPendingOffboardings() {
  console.log('Connecting to MongoDB cluster...');
  const baseUri = MONGO_URI.endsWith('/') ? MONGO_URI.slice(0, -1) : MONGO_URI;
  
  const masterConn = await mongoose.createConnection(`${baseUri}/hrdb_master`).asPromise();
  const admin = masterConn.db.admin();
  const dbs = await admin.listDatabases();
  
  let grandTotalAccepted = 0;
  
  for (const dbInfo of dbs.databases) {
    if (!dbInfo.name.startsWith('hrdb')) continue;
    
    console.log(`\n======================================================`);
    console.log(` Processing Database: ${dbInfo.name}`);
    console.log(`======================================================`);
    
    const conn = await mongoose.createConnection(`${baseUri}/${dbInfo.name}`).asPromise();
    
    // Find all non-accepted resignations
    const pendingList = await conn.collection('resignation_records')
      .find({ status: { $ne: 'accepted' } })
      .toArray();
      
    console.log(`Found ${pendingList.length} pending/unaccepted offboarding records in ${dbInfo.name}.`);
    
    let dbAcceptedCount = 0;
    
    for (const record of pendingList) {
      const { _id, userId, userType, fullName } = record;
      
      // 1. Update resignation record to accepted
      await conn.collection('resignation_records').updateOne(
        { _id },
        {
          $set: {
            status: 'accepted',
            managerStatus: 'approved',
            hrStatus: 'approved',
            hrRemarks: record.hrRemarks || 'Accepted (Direct DB update without email)',
            updatedAt: new Date()
          }
        }
      );
      
      // 2. Update user status in Intern / Employee collection
      let updatedUser = null;
      if (userType === 'employee') {
        updatedUser = await conn.collection('employees').findOneAndUpdate(
          { EmployeeId: userId },
          { $set: { status: 'drop', updatedAt: new Date() } },
          { returnDocument: 'after' }
        );
      } else {
        // Default to intern
        updatedUser = await conn.collection('interns').findOneAndUpdate(
          { internid: userId },
          { $set: { status: 'drop', updatedAt: new Date() } },
          { returnDocument: 'after' }
        );
      }
      
      // 3. Update unified users collection if exists
      if (userId) {
        await conn.collection('users').updateMany(
          {
            $or: [
              { 'employment.employeeId': userId },
              { 'employment.internId': userId },
              { EmployeeId: userId },
              { internid: userId }
            ]
          },
          {
            $set: {
              'employment.status': 'drop',
              status: 'drop',
              updatedAt: new Date()
            }
          }
        );
      }
      
      dbAcceptedCount++;
      grandTotalAccepted++;
      console.log(`  ✅ [${dbAcceptedCount}/${pendingList.length}] Accepted ${userType || 'intern'}: ${fullName} (ID: ${userId})`);
    }
    
    console.log(`Completed ${dbInfo.name}: ${dbAcceptedCount} offboardings accepted.`);
    await conn.close();
  }
  
  await masterConn.close();
  console.log(`\n🎉 Done! Total of ${grandTotalAccepted} offboarding records accepted across all databases without sending any email.\n`);
}

acceptPendingOffboardings().catch((err) => {
  console.error('❌ Error executing offboarding acceptance script:', err);
  process.exit(1);
});
