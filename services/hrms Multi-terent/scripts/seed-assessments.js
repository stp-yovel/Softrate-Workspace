/**
 * seed-assessments.js
 * Seeds role-appropriate assessments into careerPostings for all companies
 * in BOTH the master DB (hrdb_master) and all tenant DBs.
 *
 * Run: node scripts/seed-assessments.js
 */
const mongoose = require('mongoose');

// Both MongoDB clusters to seed
const CLUSTERS = [
  {
    label: '🏭 PRODUCTION',
    uri: 'mongodb+srv://peoplesoft_db_user:jdaKGQQTcmvIFyCl@peoplesoft.rjdu5de.mongodb.net'
  },
  {
    label: '🧪 TEST',
    uri: 'mongodb+srv://peoplesoft_db_user:T3yjaoO4H1CD1kUN@cluster0.h0j1q98.mongodb.net'
  }
];

// ==================== Assessment Templates ====================
function getAssessmentForRole(roleName = '') {
  const clean = roleName.toLowerCase();

  if (clean.includes('front end') || clean.includes('frontend') || clean.includes('react') || clean.includes('ui developer') || clean.includes('html')) {
    return { enabled: true, title: 'Frontend Developer Assessment', description: 'Technical evaluation of frontend technologies, React proficiency, and responsive design.', questions: [
      { id: 'fe_tech', label: 'Which frontend technologies are you familiar with?', type: 'multiselect', options: ['HTML', 'CSS', 'JavaScript', 'React', 'TypeScript', 'Bootstrap', 'Tailwind CSS', 'Next.js', 'Vue.js', 'Other'], required: true, placeholder: 'Select frontend technologies' },
      { id: 'fe_react_rating', label: 'How would you rate your React knowledge?', type: 'dropdown', options: ['Beginner', 'Basic', 'Good', 'Very Good', 'Expert'], required: true },
      { id: 'fe_responsive', label: 'Have you built a responsive website / application?', type: 'dropdown', options: ['Yes', 'No'], required: true },
      { id: 'fe_api', label: 'Have you integrated APIs into a frontend application?', type: 'dropdown', options: ['Yes', 'Basic knowledge', 'No'], required: true },
      { id: 'fe_links', label: 'Share Live Project Links (Min 3, Max 5, No Git link)', type: 'links', minLinks: 3, maxLinks: 5, required: true, placeholder: 'https://my-app.vercel.app' }
    ]};
  }

  if (clean.includes('full stack') || clean.includes('fullstack') || clean.includes('mern') || clean.includes('backend') || clean.includes('node') || clean.includes('express')) {
    return { enabled: true, title: 'Full Stack Developer Assessment', description: 'Comprehensive evaluation of full-stack engineering, databases, and APIs.', questions: [
      { id: 'fs_languages', label: 'Which programming languages & frameworks have you worked with?', type: 'multiselect', options: ['HTML/CSS', 'JavaScript', 'React', 'Node.js', 'Express.js', 'Python', 'Java', 'PHP', 'Other'], required: true },
      { id: 'fs_experience', label: 'Do you have experience building end-to-end full-stack applications?', type: 'dropdown', options: ['Yes - Multiple full-stack applications', 'Yes - Basic full-stack application', 'Somewhat', 'No'], required: true },
      { id: 'fs_databases', label: 'Which databases have you worked with?', type: 'multiselect', options: ['MongoDB', 'MySQL', 'PostgreSQL', 'Redis', 'Firebase', 'SQL Server', 'Other', 'None'], required: true },
      { id: 'fs_api_exp', label: 'Have you designed and integrated REST / GraphQL APIs?', type: 'dropdown', options: ['Yes, independently', 'Yes, as part of a project', 'Basic knowledge', 'No'], required: true },
      { id: 'fs_links', label: 'Share Live Project Links (Min 3, Max 5, No Git link)', type: 'links', minLinks: 3, maxLinks: 5, required: true, placeholder: 'https://my-fullstack-app.com' }
    ]};
  }

  if (clean.includes('test') || clean.includes('qa') || clean.includes('quality') || clean.includes('automation')) {
    return { enabled: true, title: 'Software Testing & QA Assessment', description: 'Evaluation of QA concepts, test planning, automation tools, and bug lifecycle.', questions: [
      { id: 'qa_concepts', label: 'Which testing concepts are you familiar with?', type: 'multiselect', options: ['Manual Testing', 'Functional Testing', 'Regression Testing', 'Integration Testing', 'Smoke Testing', 'API Testing', 'Performance Testing', 'Automation Testing', 'None'], required: true },
      { id: 'qa_tools', label: 'Which testing tools & frameworks have you used?', type: 'multiselect', options: ['Postman', 'Selenium', 'Cypress', 'Playwright', 'Jira', 'JMeter', 'TestRail', 'None', 'Other'], required: true },
      { id: 'qa_project', label: 'Have you worked on a live software testing / QA project?', type: 'dropdown', options: ['Yes', 'No'], required: true },
      { id: 'qa_rating', label: 'How would you rate your overall testing proficiency?', type: 'dropdown', options: ['Beginner', 'Basic', 'Good', 'Expert'], required: true },
      { id: 'qa_sample', label: 'Share link to a sample test case sheet / portfolio (Optional)', type: 'text', required: false, placeholder: 'https://docs.google.com/spreadsheets/...' }
    ]};
  }

  if (clean.includes('sales') || clean.includes('business development') || clean.includes('bde') || clean.includes('telecalling')) {
    return { enabled: true, title: 'Inside Sales Assessment', description: 'Assessment of sales experience, outreach strategies, and target orientation.', questions: [
      { id: 'sales_type', label: 'What type of sales experience do you have?', type: 'dropdown', options: ['B2B', 'B2C', 'Both', 'No Prior Experience'], required: true },
      { id: 'sales_products', label: 'Which product / service categories have you sold?', type: 'multiselect', options: ['IT / Software', 'SaaS', 'Services', 'EdTech', 'Consulting', 'Other'], required: true },
      { id: 'sales_activities', label: 'Which sales activities are you proficient in?', type: 'multiselect', options: ['Lead Generation', 'Cold Calling', 'Email Outreach', 'Client Meetings', 'Follow-ups', 'Negotiation', 'Closing'], required: true },
      { id: 'sales_targets', label: 'Have you worked in a target-driven sales environment?', type: 'dropdown', options: ['Yes', 'No'], required: true },
      { id: 'sales_tier', label: 'Total relevant sales experience:', type: 'dropdown', options: ['Fresher / Less than 1 year', '1–2 years', '2–3 years', '3–5 years', '5+ years'], required: true }
    ]};
  }

  if (clean.includes('market') || clean.includes('seo') || clean.includes('growth') || clean.includes('digital')) {
    return { enabled: true, title: 'Growth & Performance Marketing Assessment', description: 'Evaluation of paid media, campaign management, budget handling, and analytics.', questions: [
      { id: 'mkt_google', label: 'Google Ads experience level:', type: 'dropdown', options: ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'None'], required: true },
      { id: 'mkt_meta', label: 'Meta Ads (Facebook & Instagram) experience level:', type: 'dropdown', options: ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'None'], required: true },
      { id: 'mkt_campaigns', label: 'Which campaign types have you actively managed?', type: 'multiselect', options: ['Search Ads', 'Meta (FB/Insta)', 'Performance Max', 'Lead Generation', 'E-commerce / Shopping', 'App Installs', 'YouTube Ads'], required: true },
      { id: 'mkt_budget', label: 'Highest monthly ad budget you have managed:', type: 'dropdown', options: ['< 50,000', '50K - 2 Lakhs', '2L - 10 Lakhs', '10 Lakhs+'], required: true },
      { id: 'mkt_tools', label: 'Analytics & Tracking tools familiar with:', type: 'multiselect', options: ['Google Analytics 4', 'Google Tag Manager', 'Meta Pixel', 'Mixpanel', 'AppsFlyer', 'Hotjar'], required: true }
    ]};
  }

  if (clean.includes('video') || clean.includes('media') || clean.includes('editor') || clean.includes('motion') || clean.includes('graphic')) {
    return { enabled: true, title: 'Creative Media & Video Production Assessment', description: 'Assessment of editing software proficiency, storytelling, and showreel.', questions: [
      { id: 'vid_tools', label: 'Which video editing & creative tools do you use?', type: 'multiselect', options: ['Adobe Premiere Pro', 'After Effects', 'DaVinci Resolve', 'Final Cut Pro', 'Photoshop', 'CapCut / Mobile', 'Blender'], required: true },
      { id: 'vid_showreel', label: 'Link to your Video Showreel / Portfolio *', type: 'text', required: true, placeholder: 'https://youtube.com/watch?v=...' },
      { id: 'vid_shortform', label: 'Experience producing short-form content (Reels, Shorts)?', type: 'dropdown', options: ['Yes (Reels, Shorts, Promo Videos)', 'Long-form only', 'Both'], required: true },
      { id: 'vid_turnaround', label: 'Typical turnaround for a 60-second polished reel:', type: 'dropdown', options: ['Under 24 hours', '1-2 days', '3-4 days', '1 week'], required: true }
    ]};
  }

  if (clean.includes('data') || clean.includes('machine learning') || clean.includes('data science') || (clean.includes('ai') && !clean.includes('trail'))) {
    return { enabled: true, title: 'Data Science & AI/ML Assessment', description: 'Evaluation of programming, ML pipelines, data analysis, and modeling.', questions: [
      { id: 'ai_stack', label: 'Which languages & ML libraries do you use?', type: 'multiselect', options: ['Python', 'Pandas', 'NumPy', 'Scikit-learn', 'TensorFlow', 'PyTorch', 'SQL', 'R', 'HuggingFace', 'LangChain / LLMs'], required: true },
      { id: 'ai_domains', label: 'Which areas have you worked on?', type: 'multiselect', options: ['Data Analysis & EDA', 'Predictive Modeling', 'NLP & LLMs', 'Computer Vision', 'Time Series Forecasting', 'Deep Learning'], required: true },
      { id: 'ai_cloud', label: 'Cloud & MLOps experience:', type: 'dropdown', options: ['AWS', 'GCP', 'Azure', 'Docker', 'None'], required: true },
      { id: 'ai_links', label: 'Share GitHub / Kaggle / Live ML Project links (Min 1, Max 3)', type: 'links', minLinks: 1, maxLinks: 3, required: true, placeholder: 'https://github.com/username/project' }
    ]};
  }

  if (clean.includes('cyber') || clean.includes('security') || clean.includes('network engineer') || clean.includes('network admin')) {
    return { enabled: true, title: 'Cyber Security Assessment', description: 'Evaluation of security concepts, vulnerability assessment, and tooling.', questions: [
      { id: 'sec_domains', label: 'Which security domains are you familiar with?', type: 'multiselect', options: ['Network Security', 'Web App Security (OWASP Top 10)', 'Penetration Testing', 'SOC / SIEM Monitoring', 'Cloud Security', 'Incident Response', 'Cryptography'], required: true },
      { id: 'sec_tools', label: 'Which security tools have you worked with?', type: 'multiselect', options: ['Wireshark', 'Burp Suite', 'Nmap', 'Metasploit', 'Nessus', 'Splunk', 'Kali Linux', 'Other'], required: true },
      { id: 'sec_cert', label: 'Certifications held or pursuing:', type: 'text', required: true, placeholder: 'e.g. CompTIA Security+, CEH, OSCP' }
    ]};
  }

  if (clean.includes('mobile') || clean.includes('flutter') || clean.includes('react native') || clean.includes('android') || clean.includes('ios')) {
    return { enabled: true, title: 'Mobile Application Development Assessment', description: 'Evaluation of cross-platform/native mobile development and published apps.', questions: [
      { id: 'mob_tech', label: 'Which mobile technologies do you work with?', type: 'multiselect', options: ['Flutter', 'React Native', 'Android (Kotlin/Java)', 'iOS (Swift)', 'Firebase', 'Other'], required: true },
      { id: 'mob_state', label: 'State management and API integration proficiency:', type: 'dropdown', options: ['Advanced (Bloc, Provider, Riverpod, Redux)', 'Intermediate', 'Basic', 'None'], required: true },
      { id: 'mob_links', label: 'Share links to published apps / APK (Min 1, Max 3)', type: 'links', minLinks: 1, maxLinks: 3, required: true, placeholder: 'https://play.google.com/store/apps/details?id=...' }
    ]};
  }

  return null; // No assessment for unrecognized roles
}

// ==================== Seed Logic ====================
async function seedDb(baseUri, dbName) {
  console.log(`\n   📦 DB: ${dbName}`);
  let conn;
  try {
    conn = await mongoose.createConnection(`${baseUri}/${dbName}`, { serverSelectionTimeoutMS: 10000 }).asPromise();
  } catch (e) {
    console.log(`      ⚠️  Could not connect: ${e.message}`);
    return;
  }

  const Company = conn.model('Company', new mongoose.Schema({}, { strict: false }), 'companies');
  const companies = await Company.find({}).lean();

  if (!companies.length) {
    console.log(`      ⚠️  No companies found`);
    await conn.close();
    return;
  }

  for (const company of companies) {
    const postings = company.settings?.careerPostings || [];
    if (!postings.length) {
      console.log(`      ↳ [${company.companyCode || company._id}] no careerPostings — skipped`);
      continue;
    }

    let seeded = 0;
    const updatedPostings = postings.map(p => {
      const hasValid = p.assessment && p.assessment.enabled !== false &&
        Array.isArray(p.assessment.questions) && p.assessment.questions.length > 0;
      if (hasValid) return p;

      const assessment = getAssessmentForRole(p.title || '');
      if (!assessment) return p;

      seeded++;
      return { ...p, assessment };
    });

    if (seeded > 0) {
      await Company.updateOne({ _id: company._id }, { $set: { 'settings.careerPostings': updatedPostings } });
      console.log(`      ✅ [${company.companyCode || company._id}] seeded ${seeded} posting(s)`);
    } else {
      console.log(`      ✔  [${company.companyCode || company._id}] all postings already have assessments`);
    }
  }

  await conn.close();
}

async function seedCluster({ label, uri }) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${label}: ${uri.split('@')[1]}`);
  console.log('='.repeat(50));

  // Seed master DB
  await seedDb(uri, 'hrdb_master');

  // Discover tenant DBs
  console.log('\n   🔍 Discovering tenant DBs...');
  let masterConn;
  try {
    masterConn = await mongoose.createConnection(`${uri}/hrdb_master`, { serverSelectionTimeoutMS: 10000 }).asPromise();
  } catch (e) {
    console.log(`   ⚠️  Could not connect to master: ${e.message}`);
    return;
  }
  const MasterCompany = masterConn.model('Company', new mongoose.Schema({}, { strict: false }), 'companies');
  const allCompanies = await MasterCompany.find({}, 'dbName companyCode').lean();
  await masterConn.close();

  const tenantDbs = [...new Set(allCompanies.map(c => c.dbName).filter(Boolean))];
  console.log(`   Found ${tenantDbs.length} tenant DB(s): ${tenantDbs.join(', ') || 'none'}`);

  for (const dbName of tenantDbs) {
    await seedDb(uri, dbName);
  }
}

async function main() {
  console.log('🌱 Assessment Seeder — Running on ALL clusters\n');

  for (const cluster of CLUSTERS) {
    await seedCluster(cluster);
  }

  console.log('\n\n✅ All clusters seeded!');
  process.exit(0);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });

