const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://softrate:changeme@mongo:27017/?authSource=admin';

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Remove leading/trailing trailing quotes often found in dirty data like +919999999'
  if (str.endsWith("'") && !str.startsWith("'")) {
    str = str.slice(0, -1);
  }
  // Replace internal newlines with space or keep them escaped
  str = str.replace(/\r?\n|\r/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function exportLeads() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log('Connected to MongoDB.');

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    const outputDir = path.resolve(__dirname, '../../exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const allLeadsCombined = [];

    for (const dbInfo of databases) {
      if (['admin', 'local', 'config'].includes(dbInfo.name)) continue;

      const db = client.db(dbInfo.name);
      const leads = await db.collection('leads').find({}).toArray();
      if (!leads || leads.length === 0) continue;

      console.log(`Processing Database: ${dbInfo.name} (${leads.length} leads)`);
      
      leads.forEach(lead => {
        lead.__dbName = dbInfo.name;
        allLeadsCombined.push(lead);
      });

      // Export individual company DB
      exportDatasetToCsv(leads, path.join(outputDir, `${dbInfo.name}_leads.csv`));
    }

    // Export combined
    if (allLeadsCombined.length > 0) {
      exportDatasetToCsv(allLeadsCombined, path.join(outputDir, `all_companies_leads_combined.csv`));
    }

    console.log(`\nExport complete! Files saved to: ${outputDir}`);
  } catch (error) {
    console.error('Error exporting leads:', error);
  } finally {
    await client.close();
  }
}

function exportDatasetToCsv(leads, filePath) {
  // Determine max remarks
  let maxRemarks = 0;
  leads.forEach(lead => {
    let count = 0;
    if (Array.isArray(lead.remarks)) {
      count = lead.remarks.length;
    } else if (lead.remarks) {
      count = 1;
    }
    if (count > maxRemarks) maxRemarks = count;
  });

  const baseHeaders = [
    'Lead ID',
    'Company Code',
    'Set Label / Source',
    'Status',
    'OC / ROC',
    'CIN',
    'Date Of Incorporation',
    'Company Email',
    'Authorised Capital',
    'PaidUp Capital',
    'Total Obligation Of Contribution',
    'Address Type',
    'Street Address Line 1',
    'Street Address Line 2',
    'City',
    'State',
    'Postal Code',
    'Director DIN',
    'Company Name',
    'Main Division Description',
    'Director First Name',
    'Director Last Name',
    'Director Mobile Number',
    'Director Email Address',
    'Director Permanent Address Line 1',
    'Director Permanent Address Line 2',
    'Director Permanent City',
    'Director Permanent State',
    'Director Permanent Pincode',
    'Director Present Address Line 1',
    'Director Present Address Line 2',
    'Director Present City',
    'Director Present State',
    'Director Present Pincode',
    'Main Division No',
    'Company Type',
    'Class Of Company',
    'Company Category',
    'Company Subcategory',
    'Registration Number',
    'Company Origin'
  ];

  const remarkHeaders = [];
  for (let i = 1; i <= Math.max(maxRemarks, 1); i++) {
    remarkHeaders.push(`Remark ${i}`);
  }

  const allHeaders = [...baseHeaders, ...remarkHeaders];
  const rows = [allHeaders.join(',')];

  leads.forEach(lead => {
    const contactMobile = lead.directorMobileNumber || lead.contactNumber || '';
    const contactEmail = lead.directorEmailAddress || lead.companyEmail || '';
    
    // First name & Last name fallbacks if not split
    let fName = lead.directorFirstName || '';
    let lName = lead.directorLastName || '';
    if (!fName && !lName && lead.contactName) {
      const parts = lead.contactName.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ');
    }

    const row = [
      escapeCsvValue(lead.leadId || lead._id),
      escapeCsvValue(lead.companyCode || lead.__dbName),
      escapeCsvValue(lead.setLabel || ''),
      escapeCsvValue(lead.status || ''),
      escapeCsvValue(lead.roc || ''),
      escapeCsvValue(lead.cin || ''),
      escapeCsvValue(lead.dateOfIncorporation || ''),
      escapeCsvValue(lead.companyEmail || ''),
      escapeCsvValue(lead.authorisedCapital || ''),
      escapeCsvValue(lead.paidUpCapital || ''),
      escapeCsvValue(lead.totalObligationOfContribution || ''),
      escapeCsvValue(lead.addressType || ''),
      escapeCsvValue(lead.streetAddressLine1 || ''),
      escapeCsvValue(lead.streetAddressLine2 || ''),
      escapeCsvValue(lead.city || ''),
      escapeCsvValue(lead.state || ''),
      escapeCsvValue(lead.postalCode || ''),
      escapeCsvValue(lead.directorDin || ''),
      escapeCsvValue(lead.leadCompanyName || ''),
      escapeCsvValue(lead.mainDivisionDescription || ''),
      escapeCsvValue(fName),
      escapeCsvValue(lName),
      escapeCsvValue(contactMobile),
      escapeCsvValue(contactEmail),
      escapeCsvValue(lead.directorPermanentAddressLine1 || ''),
      escapeCsvValue(lead.directorPermanentAddressLine2 || ''),
      escapeCsvValue(lead.directorPermanentCity || ''),
      escapeCsvValue(lead.directorPermanentState || ''),
      escapeCsvValue(lead.directorPermanentPincode || ''),
      escapeCsvValue(lead.directorPresentAddressLine1 || ''),
      escapeCsvValue(lead.directorPresentAddressLine2 || ''),
      escapeCsvValue(lead.directorPresentCity || ''),
      escapeCsvValue(lead.directorPresentState || ''),
      escapeCsvValue(lead.directorPresentPincode || ''),
      escapeCsvValue(lead.mainDivisionNo || ''),
      escapeCsvValue(lead.companyType || ''),
      escapeCsvValue(lead.classOfCompany || ''),
      escapeCsvValue(lead.companyCategory || ''),
      escapeCsvValue(lead.companySubcategory || ''),
      escapeCsvValue(lead.registrationNumber || ''),
      escapeCsvValue(lead.companyOrigin || '')
    ];

    // Remarks
    let leadRemarks = [];
    if (Array.isArray(lead.remarks)) {
      leadRemarks = lead.remarks;
    } else if (lead.remarks) {
      leadRemarks = [lead.remarks];
    }

    for (let i = 0; i < Math.max(maxRemarks, 1); i++) {
      row.push(escapeCsvValue(leadRemarks[i] || ''));
    }

    rows.push(row.join(','));
  });

  fs.writeFileSync(filePath, rows.join('\n'), 'utf8');
  console.log(`  -> Wrote ${leads.length} rows to ${filePath}`);
}

exportLeads();
