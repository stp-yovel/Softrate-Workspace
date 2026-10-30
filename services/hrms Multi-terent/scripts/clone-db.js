const mongoose = require('mongoose');
const { MongoClient } = mongoose.mongo;

const SOURCE_URI = 'mongodb+srv://peoplesoft_db_user:jdaKGQQTcmvIFyCl@peoplesoft.rjdu5de.mongodb.net/?retryWrites=true&w=majority';
const DEST_URI = 'mongodb+srv://peoplesoft_db_user:T3yjaoO4H1CD1kUN@cluster0.h0j1q98.mongodb.net/?retryWrites=true&w=majority';

const SYSTEM_DBS = ['admin', 'local', 'config'];

async function cloneData() {
  console.log('🚀 Connecting to Source and Destination clusters...');
  const sourceClient = new MongoClient(SOURCE_URI);
  const destClient = new MongoClient(DEST_URI);

  try {
    await Promise.all([sourceClient.connect(), destClient.connect()]);
    console.log('✅ Connected to both MongoDB clusters successfully.');

    // 1. List all databases on source
    const adminDb = sourceClient.db().admin();
    const { databases } = await adminDb.listDatabases();
    
    const dbsToClone = databases.filter(d => !SYSTEM_DBS.includes(d.name));
    console.log(`📋 Found ${dbsToClone.length} database(s) to clone: ${dbsToClone.map(d => d.name).join(', ')}`);

    let totalCollectionsCloned = 0;
    let totalDocsCloned = 0;

    for (const dbInfo of dbsToClone) {
      const dbName = dbInfo.name;
      console.log(`\n========================================`);
      console.log(`📂 Processing Database: [${dbName}]`);
      console.log(`========================================`);

      const sourceDb = sourceClient.db(dbName);
      const destDb = destClient.db(dbName);

      // List all collections in this db
      const collections = await sourceDb.listCollections().toArray();
      const userCollections = collections.filter(c => !c.name.startsWith('system.'));

      console.log(`Found ${userCollections.length} collection(s) in [${dbName}]`);

      for (const colInfo of userCollections) {
        const colName = colInfo.name;
        const sourceCol = sourceDb.collection(colName);
        const destCol = destDb.collection(colName);

        const totalDocs = await sourceCol.countDocuments();
        console.log(`  🔹 Collection [${colName}]: ${totalDocs} document(s)`);

        // Drop destination collection to ensure fresh clone
        try {
          await destCol.drop();
        } catch (e) {
          // Collection might not exist yet in destination
        }

        if (totalDocs > 0) {
          const cursor = sourceCol.find({});
          let batch = [];
          let copiedCount = 0;
          const BATCH_SIZE = 500;

          while (await cursor.hasNext()) {
            const doc = await cursor.next();
            batch.push(doc);

            if (batch.length >= BATCH_SIZE) {
              await destCol.insertMany(batch, { ordered: false });
              copiedCount += batch.length;
              process.stdout.write(`    ↳ Copied ${copiedCount}/${totalDocs} docs...\r`);
              batch = [];
            }
          }

          if (batch.length > 0) {
            await destCol.insertMany(batch, { ordered: false });
            copiedCount += batch.length;
          }

          console.log(`    ✅ Successfully cloned ${copiedCount}/${totalDocs} document(s).`);
          totalDocsCloned += copiedCount;
        } else {
          console.log(`    ℹ️ Empty collection, created on destination.`);
          await destDb.createCollection(colName).catch(() => {});
        }
        totalCollectionsCloned++;

        // Copy Indexes (excluding _id_)
        try {
          const indexes = await sourceCol.indexes();
          const indexesToCreate = indexes.filter(idx => idx.name !== '_id_');
          if (indexesToCreate.length > 0) {
            for (const idx of indexesToCreate) {
              const options = { name: idx.name };
              if (idx.unique) options.unique = true;
              if (idx.sparse) options.sparse = true;
              if (idx.expireAfterSeconds !== undefined) options.expireAfterSeconds = idx.expireAfterSeconds;
              await destCol.createIndex(idx.key, options).catch(err => {
                console.warn(`    ⚠️ Index '${idx.name}' warning:`, err.message);
              });
            }
            console.log(`    📇 Created ${indexesToCreate.length} custom index(es).`);
          }
        } catch (idxErr) {
          console.warn(`    ⚠️ Failed to clone indexes for [${colName}]:`, idxErr.message);
        }
      }
    }

    console.log(`\n========================================`);
    console.log(`🎉 SUMMARY:`);
    console.log(`   Databases Cloned: ${dbsToClone.length}`);
    console.log(`   Collections Cloned: ${totalCollectionsCloned}`);
    console.log(`   Total Documents Cloned: ${totalDocsCloned}`);
    console.log(`========================================\n`);

  } catch (err) {
    console.error('❌ Cloning error:', err);
  } finally {
    await Promise.all([sourceClient.close(), destClient.close()]);
    console.log('🔌 Closed MongoDB connections.');
  }
}

cloneData();
