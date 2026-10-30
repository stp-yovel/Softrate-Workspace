/**
 * diagnose-slowness.js
 * Run: node scripts/diagnose-slowness.js
 *
 * Times every stage of the /api/public/jobs flow to pinpoint the bottleneck.
 * Also runs a direct raw MongoDB query to isolate atlas network latency.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI.replace(/\/$/, '');
const COMPANY_CODE = 'SOFTRATE';

const t = () => Date.now();
const elapsed = (start) => `${Date.now() - start}ms`;

async function run() {
  console.log('\n========================================');
  console.log(' SLOW ENDPOINT DIAGNOSTICS');
  console.log(' Target: /api/public/jobs?companyCode=SOFTRATE');
  console.log('========================================\n');

  // ── STAGE 1: Connect to master DB ─────────────────────────────────────────
  console.log('STAGE 1: Connecting to hrdb_master...');
  let s1 = t();
  const masterConn = mongoose.createConnection(`${MONGO_URI}/hrdb_master`, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  await new Promise((resolve, reject) => {
    masterConn.once('connected', resolve);
    masterConn.once('error', reject);
    setTimeout(() => reject(new Error('Connection timeout > 10s')), 10000);
  });
  console.log(`  ✅ Connected in ${elapsed(s1)}\n`);

  // ── STAGE 2: findOne with regex (current code path) ────────────────────────
  console.log('STAGE 2: findOne by companyCode REGEX (current code)...');
  const CompanySchema = new mongoose.Schema({}, { strict: false });
  const Company = masterConn.model('Company', CompanySchema, 'companies');

  let s2 = t();
  const companyByRegex = await Company.findOne({
    companyCode: { $regex: new RegExp(`^${COMPANY_CODE}$`, 'i') }
  });
  const t2 = elapsed(s2);
  console.log(`  Result: ${companyByRegex ? '✅ Found' : '❌ Not found'} | Time: ${t2}`);
  if (companyByRegex) {
    const docSizeKB = (JSON.stringify(companyByRegex.toObject()).length / 1024).toFixed(1);
    console.log(`  Document size: ${docSizeKB} KB`);
    const postings = companyByRegex.settings?.careerPostings || [];
    console.log(`  careerPostings count: ${postings.length}`);
  }
  console.log();

  // ── STAGE 3: findOne with exact match (optimized) ─────────────────────────
  console.log('STAGE 3: findOne by exact companyCode string (optimized)...');
  let s3 = t();
  const companyExact = await Company.findOne({ companyCode: COMPANY_CODE });
  console.log(`  Result: ${companyExact ? '✅ Found' : '❌ Not found'} | Time: ${elapsed(s3)}\n`);

  // ── STAGE 4: findOne with projection (only needed fields) ─────────────────
  console.log('STAGE 4: findOne with field projection (only careerPostings + name)...');
  let s4 = t();
  const companyProjected = await Company.findOne(
    { companyCode: { $regex: new RegExp(`^${COMPANY_CODE}$`, 'i') } },
    { name: 1, companyCode: 1, 'settings.careerPostings': 1, dbName: 1 }
  );
  const t4 = elapsed(s4);
  if (companyProjected) {
    const docSizeKB = (JSON.stringify(companyProjected.toObject()).length / 1024).toFixed(1);
    console.log(`  Result: ✅ Found | Time: ${t4} | Projected size: ${docSizeKB} KB\n`);
  } else {
    console.log(`  Result: ❌ Not found | Time: ${t4}\n`);
  }

  // ── STAGE 5: Check index on companyCode ───────────────────────────────────
  console.log('STAGE 5: Checking indexes on companies collection...');
  let s5 = t();
  const indexes = await masterConn.db.collection('companies').indexes();
  console.log(`  Indexes fetched in ${elapsed(s5)}`);
  const hasCompanyCodeIndex = indexes.some(idx =>
    idx.key && (idx.key.companyCode !== undefined)
  );
  console.log(`  companyCode index exists: ${hasCompanyCodeIndex ? '✅ YES' : '❌ NO — this causes a full collection scan!'}`);
  indexes.forEach(idx => console.log(`   - ${JSON.stringify(idx.key)} (${idx.name})`));
  console.log();

  // ── STAGE 6: explain() the regex query ────────────────────────────────────
  console.log('STAGE 6: explain() for regex query (showing execution plan)...');
  let s6 = t();
  const explainResult = await masterConn.db.collection('companies').find(
    { companyCode: { $regex: new RegExp(`^${COMPANY_CODE}$`, 'i') } }
  ).explain('executionStats');
  console.log(`  explain() fetched in ${elapsed(s6)}`);

  const stats = explainResult?.executionStats;
  if (stats) {
    console.log(`  Stage: ${explainResult.queryPlanner?.winningPlan?.stage}`);
    console.log(`  Docs examined: ${stats.totalDocsExamined}`);
    console.log(`  Docs returned: ${stats.nReturned}`);
    console.log(`  Execution time (ms): ${stats.executionTimeMillis}`);
    if (stats.totalDocsExamined > stats.nReturned) {
      console.log(`  ⚠️  FULL SCAN: examined ${stats.totalDocsExamined} docs to return ${stats.nReturned}`);
    }
  }
  console.log();

  // ── STAGE 7: Connect tenant DB ────────────────────────────────────────────
  const companyDoc = companyByRegex;
  if (companyDoc) {
    const dbName = companyDoc.dbName || `hrdb_${COMPANY_CODE.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
    console.log(`STAGE 7: Connecting to tenant DB: ${dbName}...`);
    let s7 = t();
    const tenantConn = mongoose.createConnection(`${MONGO_URI}/${dbName}`, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
    });
    await new Promise((resolve, reject) => {
      tenantConn.once('connected', resolve);
      tenantConn.once('error', reject);
      setTimeout(() => reject(new Error('Tenant connection timeout > 10s')), 10000);
    });
    console.log(`  ✅ Tenant connected in ${elapsed(s7)}\n`);
    await tenantConn.close();
  }

  // ── STAGE 8: Simulate full endpoint latency (total) ──────────────────────
  console.log('STAGE 8: Simulating FULL /api/public/jobs flow (double DB hits as current code)...');
  let s8 = t();
  // hit 1: verifyPublicTenant -> findOne company
  await Company.findOne({ companyCode: { $regex: new RegExp(`^${COMPANY_CODE}$`, 'i') } });
  // hit 2: route handler -> findById again
  if (companyByRegex) {
    await Company.findById(companyByRegex._id);
  }
  console.log(`  ⏱  Total simulated round-trips: ${elapsed(s8)}\n`);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('========================================');
  console.log(' DIAGNOSIS SUMMARY');
  console.log('========================================');
  console.log(`  Regex findOne:     ${t2}`);
  console.log(`  Exact findOne:     ${elapsed(s3)}`);
  console.log(`  Projected findOne: ${t4}`);
  console.log(`  companyCode index: ${hasCompanyCodeIndex ? '✅ EXISTS' : '❌ MISSING'}`);
  console.log(`  Full double fetch: ${elapsed(s8)}`);
  console.log('\nRECOMMENDATIONS:');
  if (!hasCompanyCodeIndex) {
    console.log('  1. ❗ ADD INDEX: db.companies.createIndex({ companyCode: 1 })');
  }
  console.log('  2. ❗ FIX DOUBLE FETCH in public.routes.js /jobs route — reuse req.tenant');
  console.log('  3. ❗ ADD PROJECTION: only fetch { name, companyCode, settings.careerPostings, dbName }');
  console.log('  4. ❗ ADD In-memory cache in publicTenant.middleware.js (like tenant.middleware.js)');
  console.log('  5. ❗ ADD HTTP cache headers: Cache-Control: public, max-age=60');
  console.log('');

  await masterConn.close();
  console.log('Connections closed. Done.\n');
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
