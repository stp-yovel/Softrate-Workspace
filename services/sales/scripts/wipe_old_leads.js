const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || "mongodb://softrate:changeme@127.0.0.1:27027/?authSource=admin";
const client = new MongoClient(uri);

async function wipeOldLeads() {
  try {
    console.log(`Connecting to MongoDB at: ${uri}`);
    await client.connect();
    console.log("Connected successfully.\n");

    const adminDb = client.db('admin');
    const dbsInfo = await adminDb.admin().listDatabases();

    let totalLeadsDeleted = 0;
    let totalDealsDeleted = 0;

    for (const dbInfo of dbsInfo.databases) {
      const dbName = dbInfo.name;
      if (['admin', 'local', 'config'].includes(dbName)) continue;

      console.log(`========================================`);
      console.log(`Scanning Database: ${dbName}`);
      console.log(`========================================`);

      const db = client.db(dbName);
      const leadsCol = db.collection('leads');
      const dealsCol = db.collection('deals');

      // Query to match Old Leads by label, lower label, or status
      const leadQuery = {
        $or: [
          { setLabel: { $regex: /^old\s*leads?$/i } },
          { setLabelLower: { $regex: /^old\s*leads?$/i } },
          { status: { $regex: /^old\s*leads?$/i } },
        ]
      };

      // 1. Find matched lead IDs first so we can remove associated deals
      const matchedLeads = await leadsCol.find(leadQuery, { projection: { _id: 1 } }).toArray();
      const matchedLeadIds = matchedLeads.map(l => l._id);

      console.log(`  Found ${matchedLeadIds.length} lead(s) matching "Old Leads"`);

      // 2. Delete matched leads
      if (matchedLeadIds.length > 0) {
        const leadDeleteResult = await leadsCol.deleteMany({ _id: { $in: matchedLeadIds } });
        console.log(`  Deleted ${leadDeleteResult.deletedCount} lead documents.`);
        totalLeadsDeleted += leadDeleteResult.deletedCount;

        // 3. Delete any deals created for these leads
        const dealDeleteResult = await dealsCol.deleteMany({ leadId: { $in: matchedLeadIds } });
        console.log(`  Deleted ${dealDeleteResult.deletedCount} associated deal documents.`);
        totalDealsDeleted += dealDeleteResult.deletedCount;
      } else {
        console.log(`  No "Old Leads" found in ${dbName}.`);
      }
      console.log();
    }

    console.log(`========================================`);
    console.log(`WIPEOUT COMPLETE`);
    console.log(`Total Leads Deleted: ${totalLeadsDeleted}`);
    console.log(`Total Deals Deleted: ${totalDealsDeleted}`);
    console.log(`========================================\n`);

  } catch (error) {
    console.error("Error wiping old leads:", error);
  } finally {
    await client.close();
    console.log("MongoDB connection closed.");
  }
}

wipeOldLeads();
