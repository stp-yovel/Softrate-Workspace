const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://softrate:changeme@mongo:27017/?authSource=admin';

async function wipeAllDeals() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log('Connected to MongoDB.');

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    let totalDealsDeleted = 0;

    for (const dbInfo of databases) {
      if (dbInfo.name === 'admin' || dbInfo.name === 'local' || dbInfo.name === 'config') continue;
      
      console.log(`\n========================================`);
      console.log(`Scanning Database: ${dbInfo.name}`);
      console.log(`========================================`);
      
      const db = client.db(dbInfo.name);
      
      const dealsCollection = db.collection('deals');
      const deleteResult = await dealsCollection.deleteMany({});
      
      console.log(`  Deleted ${deleteResult.deletedCount} deal(s).`);
      totalDealsDeleted += deleteResult.deletedCount;
    }

    console.log(`\n========================================`);
    console.log(`PIPELINE WIPEOUT COMPLETE`);
    console.log(`Total Deals Deleted Across All Tenants: ${totalDealsDeleted}`);
    console.log(`========================================\n`);

  } catch (error) {
    console.error('Error wiping all deals:', error);
  } finally {
    await client.close();
    console.log('MongoDB connection closed.');
  }
}

wipeAllDeals();
