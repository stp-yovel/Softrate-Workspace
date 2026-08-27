const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://softrate:changeme@mongo:27017/?authSource=admin';

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.endsWith("'") && !str.startsWith("'")) {
    str = str.slice(0, -1);
  }
  str = str.replace(/\r?\n|\r/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function exportLeadsByEmployee() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log('Connected to MongoDB.');

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    // 1. Build comprehensive employee lookup map
    const employeeMap = {};
    for (const dbInfo of databases) {
      if (['admin', 'local', 'config'].includes(dbInfo.name)) continue;
      const db = client.db(dbInfo.name);

      try {
        const emps = await db.collection('employees').find({}).toArray();
        emps.forEach(e => {
          const id = e._id.toString();
          const name = e.name || e.employeeName || e.fullName || e.username;
          if (name) {
            employeeMap[id] = {
              name: name.trim(),
              email: e.email || '',
              phone: e.phone || ''
            };
          }
        });
      } catch (err) {}

      try {
        const users = await db.collection('users').find({}).toArray();
        users.forEach(u => {
          const id = u._id.toString();
          const name = u.name || u.fullName || u.username;
          if (name && !employeeMap[id]) {
            employeeMap[id] = {
              name: name.trim(),
              email: u.email || '',
              phone: u.phone || ''
            };
          }
        });
      } catch (err) {}
    }

    console.log(`Loaded ${Object.keys(employeeMap).length} employee definitions.`);

    const baseOutputDir = path.resolve(__dirname, '../../exports');
    const employeeOutputDir = path.join(baseOutputDir, 'by_employee');
    if (!fs.existsSync(employeeOutputDir)) {
      fs.mkdirSync(employeeOutputDir, { recursive: true });
    }

    const allLeadsWithEmployee = [];
    const leadsByCompanyAndEmp = {}; // { companyCode: { empName: [leads] } }
    const overallEmployeeCounts = {};

    for (const dbInfo of databases) {
      if (['admin', 'local', 'config'].includes(dbInfo.name)) continue;
      const db = client.db(dbInfo.name);

      const leads = await db.collection('leads').find({}).toArray();
      if (!leads || leads.length === 0) continue;

      const compCode = dbInfo.name;
      leadsByCompanyAndEmp[compCode] = {};

      leads.forEach(lead => {
        lead.__dbName = dbInfo.name;
        const empId = lead.assignedEmployeeId ? lead.assignedEmployeeId.toString() : '';
        const empInfo = employeeMap[empId];
        lead.__employeeName = empInfo ? empInfo.name : (empId ? `Unknown (${empId})` : 'Unassigned');
        lead.__employeeEmail = empInfo ? empInfo.email : '';
        lead.__employeePhone = empInfo ? empInfo.phone : '';

        const empName = lead.__employeeName;
        if (!leadsByCompanyAndEmp[compCode][empName]) {
          leadsByCompanyAndEmp[compCode][empName] = [];
        }
        leadsByCompanyAndEmp[compCode][empName].push(lead);
        allLeadsWithEmployee.push(lead);

        overallEmployeeCounts[empName] = (overallEmployeeCounts[empName] || 0) + 1;
      });
    }

    // 2. Export CSV per employee per company
    for (const [compCode, empGroup] of Object.entries(leadsByCompanyAndEmp)) {
      for (const [empName, leadsList] of Object.entries(empGroup)) {
        const safeComp = sanitizeFilename(compCode.replace('salesdb_', ''));
        const safeEmp = sanitizeFilename(empName);
        const fileName = `${safeComp}_${safeEmp}_leads.csv`;
        const filePath = path.join(employeeOutputDir, fileName);
        exportDatasetToCsv(leadsList, filePath);
      }
    }

    // 3. Export global employee-wise CSV (all companies combined with Employee columns)
    exportDatasetToCsv(allLeadsWithEmployee, path.join(baseOutputDir, 'all_leads_employee_wise.csv'));

    console.log('\n========================================');
    console.log('EMPLOYEE-WISE EXPORT SUMMARY');
    console.log('========================================');
    for (const [empName, count] of Object.entries(overallEmployeeCounts)) {
      console.log(`- ${empName}: ${count} leads`);
    }
    console.log('========================================\n');
    console.log(`Exported successfully to: ${employeeOutputDir}`);

  } catch (error) {
    console.error('Error exporting leads by employee:', error);
  } finally {
    await client.close();
  }
}

function exportDatasetToCsv(leads, filePath) {
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
    'Assigned Employee Name',
    'Assigned Employee ID',
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
    
    let fName = lead.directorFirstName || '';
    let lName = lead.directorLastName || '';
    if (!fName && !lName && lead.contactName) {
      const parts = lead.contactName.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ');
    }

    const row = [
      escapeCsvValue(lead.__employeeName || 'Unassigned'),
      escapeCsvValue(lead.assignedEmployeeId || ''),
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
  console.log(`  -> Wrote ${leads.length} rows to ${path.basename(filePath)}`);
}

exportLeadsByEmployee();
