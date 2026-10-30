const express = require('express');
const router = express.Router();
const { getMasterConnection } = require('../db');
const CompanyModelExport = require('../models/CompanyModel');
const verifyTenant = require('../middleware/tenant.middleware');
const { clearPublicCompanyCache } = require('../middleware/publicTenant.middleware');

/**
 * Helper: get the Company model from the master connection (no-wait when already connected)
 */
const getMasterCompany = () => {
  const masterDb = getMasterConnection();
  return masterDb.models.Company || masterDb.model('Company', CompanyModelExport.schema);
};

/**
 * @route GET /api/settings/company
 * @desc Get current company settings
 * @access Private (HR Admin)
 */
router.get('/company', verifyTenant, async (req, res) => {
  try {
    const Company = getMasterCompany();
    // ✅ Surgical sub-field projection:
    // - offerLetterSettings is 2.2MB (embedded base64 HTML templates) — excluded, load lazily
    // - communication is 90KB (embedded logo) — only config sub-fields projected
    const company = await Company.findById(req.tenant.companyId, {
      name: 1,
      companyCode: 1,
      leavePolicies: 1,
      careerPostings: 1,
      workDurationSettings: 1,
      'settings.roles': 1,
      'settings.employeeRoles': 1,
      'settings.internRoles': 1,
      'settings.receivingEmail': 1,
      'settings.themeColor': 1,
      'settings.locations': 1,
      'settings.defaultPassword': 1,
      'settings.careerPostings': 1,
      'settings.showInRegistrationDropdown': 1,
      'settings.leavePolicies': 1,
      'settings.workDurationSettings': 1,
      'settings.payrollSettings': 1,
      'settings.hrPolicyUrl': 1,
      'settings.hrPolicyUpdatedAt': 1,
      'settings.communication': 1,
    }).lean();
    if (!company) {
      return res.status(404).json({ success: false, msg: 'Company not found' });
    }

    const companyObj = company; // already a plain object from .lean()
    const settings = companyObj.settings || {};
    const sortRoles = (roles) => {
      const filtered = roles.filter(r => r !== 'Other').sort((a, b) => a.localeCompare(b));
      return [...filtered, 'Other'];
    };

    let roles = settings.roles || [];
    if (!roles || roles.length === 0) {
      const empSet = new Set((settings.employeeRoles || []).filter(r => r && r !== 'Other'));
      const intSet = new Set((settings.internRoles || []).filter(r => r && r !== 'Other'));
      const combined = Array.from(new Set([...empSet, ...intSet]));
      roles = combined.map(name => ({
        name,
        isEmployee: empSet.has(name) || !intSet.has(name),
        isIntern: intSet.has(name)
      }));
    }

    const derivedEmployeeRoles = roles.filter(r => r.isEmployee && r.name !== 'Other').map(r => r.name);
    const derivedInternRoles = roles.filter(r => r.isIntern && r.name !== 'Other').map(r => r.name);

    const employeeRoles = sortRoles(Array.from(new Set([...derivedEmployeeRoles, ...(settings.employeeRoles || []), 'Other'])));
    const internRoles = sortRoles(Array.from(new Set([...derivedInternRoles, ...(settings.internRoles || []), 'Other'])));
    const careerPostings = Array.isArray(settings.careerPostings)
      ? settings.careerPostings 
      : (Array.isArray(companyObj.careerPostings) ? companyObj.careerPostings : []);

    res.json({
      success: true,
      settings: {
        ...settings,
        leavePolicies: companyObj.leavePolicies || settings.leavePolicies || [],
        roles: roles,
        internRoles: internRoles,
        employeeRoles: employeeRoles,
        careerPostings: careerPostings,
        // offerLetterSettings is 2.2MB — NOT included here, fetch via dedicated endpoint
        offerLetterSettings: undefined,
      },
      workDurationSettings: companyObj.workDurationSettings || { hr: 8, manager: 8, employee: 8, intern: 6 },
      company: {
        name: company.name,
        companyCode: company.companyCode
      }
    });
  } catch (error) {
    console.error('Fetch Settings Error:', error);
    res.status(500).json({ success: false, msg: 'Server error fetching settings' });
  }
});

/**
 * @route GET /api/settings/offer-letter-settings
 * @desc Lazily load the offer letter / certificate templates (2.2MB) on demand.
 *       Only called when the user opens the Certificate Settings tab — NOT on every page load.
 * @access Private (HR Admin)
 */
router.get('/offer-letter-settings', verifyTenant, async (req, res) => {
  try {
    const Company = getMasterCompany();
    const company = await Company.findById(req.tenant.companyId, {
      'settings.offerLetterSettings': 1,
    }).lean();
    if (!company) {
      return res.status(404).json({ success: false, msg: 'Company not found' });
    }
    res.json({
      success: true,
      offerLetterSettings: company.settings?.offerLetterSettings || {},
    });
  } catch (error) {
    console.error('Fetch Offer Letter Settings Error:', error);
    res.status(500).json({ success: false, msg: 'Server error fetching offer letter settings' });
  }
});

/**
 * @route GET /api/settings/work-duration
 * @desc Micro-endpoint for Flutter dashboard: returns ONLY workDurationSettings.
 *       Called instead of the full /company route to avoid loading all 50+ settings fields.
 *       Response is tiny (~100 bytes) vs the full settings response (~10KB).
 * @access Private
 */
router.get('/work-duration', verifyTenant, async (req, res) => {
  try {
    const Company = getMasterCompany();
    const company = await Company.findById(req.tenant.companyId, {
      workDurationSettings: 1,
      'settings.workDurationSettings': 1,
    }).lean();

    if (!company) {
      return res.status(404).json({ success: false, msg: 'Company not found' });
    }

    const wd = company.workDurationSettings || company.settings?.workDurationSettings || { hr: 8, manager: 8, employee: 8, intern: 6 };
    res.json({ success: true, workDurationSettings: wd });
  } catch (error) {
    console.error('Fetch Work Duration Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});


/**
 * @route PUT /api/settings/company
 * @desc Update company settings
 * @access Private (HR Admin)
 */
router.put('/company', verifyTenant, async (req, res) => {
  try {
    const { receivingEmail, themeColor, locations, communication, roles, employeeRoles, internRoles, careerPostings, offerLetterSettings, payrollSettings, workDurationSettings, leavePolicies, defaultPassword } = req.body;
    
    const Company = getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    if (!company.settings) {
      company.settings = {};
    }

    const sortRoles = (rList) => {
      const filtered = (rList || []).filter(r => r && r !== 'Other').sort((a, b) => a.localeCompare(b));
      return [...filtered, 'Other'];
    };

    if (receivingEmail !== undefined) company.settings.receivingEmail = receivingEmail;
    if (themeColor !== undefined) company.settings.themeColor = themeColor;
    if (locations !== undefined) company.settings.locations = locations;
    if (communication !== undefined) company.settings.communication = communication;
    
    // Unified Roles handling + Legacy sync
    if (roles !== undefined && Array.isArray(roles)) {
      company.settings.roles = roles;
      company.markModified('settings.roles');
      
      const empRoles = roles.filter(r => r.isEmployee && r.name !== 'Other').map(r => r.name);
      const intRoles = roles.filter(r => r.isIntern && r.name !== 'Other').map(r => r.name);
      
      company.settings.employeeRoles = sortRoles(empRoles);
      company.settings.internRoles = sortRoles(intRoles);
      company.markModified('settings.employeeRoles');
      company.markModified('settings.internRoles');
    } else {
      if (employeeRoles !== undefined) {
        company.settings.employeeRoles = sortRoles(employeeRoles);
        company.markModified('settings.employeeRoles');
      }
      if (internRoles !== undefined) {
        company.settings.internRoles = sortRoles(internRoles);
        company.markModified('settings.internRoles');
      }
    }

    if (careerPostings !== undefined) {
      company.settings.careerPostings = careerPostings;
      company.careerPostings = careerPostings;
      company.markModified('settings.careerPostings');
      company.markModified('careerPostings');
    }
    if (defaultPassword !== undefined) company.settings.defaultPassword = defaultPassword;
    if (req.body.showInRegistrationDropdown !== undefined) {
      company.settings.showInRegistrationDropdown = Boolean(req.body.showInRegistrationDropdown);
      company.markModified('settings.showInRegistrationDropdown');
    }
    
    if (leavePolicies !== undefined) {
      company.leavePolicies = leavePolicies;
      company.markModified('leavePolicies');

      try {
        const Employee = require('../models/EmployeeModel.js');
        const Intern = require('../models/Intern.js');
        const LeaveCounter = require('../models/leaveCounter.model.js');
        
        const employees = await Employee.find({ companyId: req.tenant.companyId, status: { $in: ['approved', 'ongoing'] } });
        const interns = await Intern.find({ companyId: req.tenant.companyId, status: { $in: ['approved', 'ongoing'] } });
        
        const now = new Date();
        
        const syncCounters = async (users, userType) => {
          for (const user of users) {
            const userId = userType === 'employee' ? user.EmployeeId : user.internid;
            if (!userId) continue;
            
            const existingCounters = await LeaveCounter.find({ companyId: req.tenant.companyId, employeeId: userId });
            
            for (const policy of leavePolicies) {
              if (policy.appliesTo === 'both' || policy.appliesTo === userType) {
                const existing = existingCounters.find(c => c.leaveType === policy.name);
                if (existing) {
                  if (existing.totalAllowed !== policy.allowance) {
                    const diff = policy.allowance - existing.totalAllowed;
                    existing.totalAllowed = policy.allowance;
                    existing.balance = existing.balance + diff;
                    await existing.save();
                  }
                } else {
                  const startDate = user.onboardingDate ? new Date(user.onboardingDate) : now;
                  const nextResetDate = new Date(startDate);
                  if (policy.frequency === 'monthly') {
                    nextResetDate.setMonth(now.getMonth() + 1);
                  } else {
                    nextResetDate.setFullYear(now.getFullYear() + 1);
                  }
                  
                  await LeaveCounter.create({
                    companyId: req.tenant.companyId,
                    employeeId: userId,
                    leaveType: policy.name,
                    totalAllowed: policy.allowance,
                    used: 0,
                    balance: policy.allowance,
                    cycleStartDate: startDate,
                    nextResetDate: nextResetDate
                  });
                }
              }
            }
            
            // Delete counters for policies that have been removed
            const validPolicyNames = leavePolicies
              .filter(p => p.appliesTo === 'both' || p.appliesTo === userType)
              .map(p => p.name);
              
            for (const existing of existingCounters) {
              if (!validPolicyNames.includes(existing.leaveType)) {
                await LeaveCounter.deleteOne({ _id: existing._id });
              }
            }
          }
        };
        
        await syncCounters(employees, 'employee');
        await syncCounters(interns, 'intern');
        console.log(`[DEBUG] Synced leave policies for ${employees.length} employees and ${interns.length} interns.`);
      } catch (syncErr) {
        console.error('[DEBUG] Error syncing leave counters:', syncErr);
      }
    }
    
    if (offerLetterSettings !== undefined) {
      company.settings.offerLetterSettings = {
        ...company.settings.offerLetterSettings,
        ...offerLetterSettings
      };
      company.markModified('settings.offerLetterSettings');
    }

    if (payrollSettings !== undefined) {
      company.settings.payrollSettings = {
        ...company.settings.payrollSettings,
        ...payrollSettings
      };
      company.markModified('settings.payrollSettings');
    }

    // Work Duration Settings (stored at top-level, not inside settings)
    if (workDurationSettings !== undefined) {
      company.workDurationSettings = {
        ...company.workDurationSettings?.toObject?.() || company.workDurationSettings || {},
        ...workDurationSettings
      };
      company.markModified('workDurationSettings');
    }

    company.markModified('settings');
    await company.save();

    try {
      if (clearPublicCompanyCache) {
        clearPublicCompanyCache(company.companyCode);
        clearPublicCompanyCache(company._id);
      }
    } catch (e) {}

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: {
        ...company.settings,
        leavePolicies: company.leavePolicies
      },
      workDurationSettings: company.workDurationSettings,
      offerLetterSettings: company.settings.offerLetterSettings
    });
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating settings' });
  }
});

/**
 * @route GET /api/settings/public
 * @desc Get public settings (locations) for mobile app
 * @access Private (Any Auth User)
 */
router.get('/public', verifyTenant, async (req, res) => {
  try {
    const Company = getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    res.json({
      success: true,
      locations: company.settings?.locations || [],
      themeColor: company.settings?.themeColor || '#00657F',
      leavePolicies: company.leavePolicies || company.settings?.leavePolicies || []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
