const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyPublicTenant = require('../middleware/publicTenant.middleware');

// Ensure permissive CORS on all public routes for careers website, embeds, etc.
router.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-company-code, X-Demo-Mode');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// We use the tenant context to fetch from the correct DB
const walkinDriveController = require('../controllers/walkinDriveController');
const walkinApplicationController = require('../controllers/walkinApplicationController');

router.get('/walkin-drives', verifyPublicTenant, (req, res, next) => {
  req.query.activeOnly = 'true';
  next();
}, walkinDriveController.getWalkinDrives);
router.post('/walkin-apply', verifyPublicTenant, walkinApplicationController.applyToWalkinDrive);

router.get("/id-card/:id", verifyPublicTenant, async (req, res) => {
  try {
    const { id } = req.params;
    let person = null;
    let type = null;
    let user = null;

    // We can get the models from req.models which was set by verifyPublicTenant
    const { Intern, Employee, User } = req.models;

    // Check Intern
    if (Intern) {
      person = await Intern.findOne({ internid: { $regex: new RegExp(`^${id}$`, 'i') }, companyId: req.tenant.companyId }).select('+profilePhoto.data');
      if (!person && mongoose.Types.ObjectId.isValid(id)) {
        person = await Intern.findOne({ _id: id, companyId: req.tenant.companyId }).select('+profilePhoto.data');
      }
    }
    
    if (person) {
       type = 'intern';
    } else if (Employee) {
       // Check Employee
       person = await Employee.findOne({ EmployeeId: { $regex: new RegExp(`^${id}$`, 'i') }, companyId: req.tenant.companyId }).select('+profilePhoto.data');
       if (!person && mongoose.Types.ObjectId.isValid(id)) {
         person = await Employee.findOne({ _id: id, companyId: req.tenant.companyId }).select('+profilePhoto.data');
       }
       if (person) type = 'employee';
    }

    if (!person) {
      return res.status(404).json({ success: false, message: "ID Card not found" });
    }

    if (User) {
       user = await User.findOne({ email: { $regex: new RegExp(`^${person.email.trim()}$`, 'i') }, companyId: req.tenant.companyId }).select('+profilePhoto.data');
    }

    // Build public profile
    let profilePhotoDataUrl = null;
    let photoData = user?.profilePhoto?.data || person.profilePhoto?.data;
    let contentType = user?.profilePhoto?.contentType || person.profilePhoto?.contentType || 'image/jpeg';
    
    if (photoData) {
      let buffer = null;
      if (Buffer.isBuffer(photoData)) buffer = photoData;
      else if (photoData.buffer && Buffer.isBuffer(photoData.buffer)) buffer = photoData.buffer;
      else if (Array.isArray(photoData.data)) buffer = Buffer.from(photoData.data);
      
      if (buffer && buffer.length) {
        profilePhotoDataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
      }
    }

    // ✅ Reuse company already fetched by verifyPublicTenant — no extra DB hit
    const company = req.tenant.companyData;

    res.json({
      success: true,
      data: {
        fullName: person.fullName,
        id: type === 'intern' ? person.internid : person.EmployeeId,
        role: person.role || person.designation,
        type: type,
        profilePhoto: profilePhotoDataUrl,
        companyCode: req.tenant.companyCode,
        companyName: company?.settings?.offerLetterSettings?.companyName || 'Softrate Global',
        companyLogo: company?.settings?.communication?.emailLogoUrl || null,
        virtualIdTemplate: company?.settings?.offerLetterSettings?.documentTemplates?.virtualIdCard || null
      }
    });

  } catch (err) {
    console.error("Public ID Card Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Middleware to default companyCode to SOFTRATE if omitted
 */
const defaultCompanyMiddleware = (req, res, next) => {
  if (!req.query.companyCode && !req.query.company && !req.body?.companyCode && !req.body?.companyId) {
    req.query.companyCode = 'SOFTRATE';
  } else if (req.query.company && !req.query.companyCode) {
    req.query.companyCode = req.query.company;
  }
  next();
};

/**
 * @route GET /api/public/jobs
 * @desc Get public active career postings for a tenant company
 * @access Public (cached 60s by browser/CDN)
 */
router.get('/jobs', defaultCompanyMiddleware, verifyPublicTenant, async (req, res) => {
  try {
    // ✅ Company is already fetched (and cached) by verifyPublicTenant — no second DB hit!
    const company = req.tenant.companyData;

    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    let postings = (company.settings?.careerPostings || []).filter(p => p.isListed !== false);
    
    // Sort urgent/important jobs first, then by createdAt desc
    postings.sort((a, b) => {
      const aImp = a.is_important || a.important ? 1 : 0;
      const bImp = b.is_important || b.important ? 1 : 0;
      if (bImp !== aImp) return bImp - aImp;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    // Cache this response for 60 seconds — careers page doesn't need real-time freshness
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    res.json({
      success: true,
      companyCode: req.tenant.companyCode,
      companyName: company.name,
      count: postings.length,
      jobs: postings
    });
  } catch (err) {
    console.error("Public Jobs Error:", err);
    res.status(500).json({ success: false, message: "Server error fetching jobs" });
  }
});

/**
 * @route GET /api/public/jobs/:job_id
 * @desc Get a specific job detail by job_id
 * @access Public (cached 60s)
 */
router.get('/jobs/:job_id', defaultCompanyMiddleware, verifyPublicTenant, async (req, res) => {
  try {
    const { job_id } = req.params;

    // ✅ Reuse company already fetched by verifyPublicTenant
    const company = req.tenant.companyData;
    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    const postings = company.settings?.careerPostings || [];
    const job = postings.find(j => j.job_id === job_id || String(j._id) === job_id);

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({
      success: true,
      companyCode: req.tenant.companyCode,
      companyName: company.name,
      job: job
    });
  } catch (err) {
    console.error("Public Job Detail Error:", err);
    res.status(500).json({ success: false, message: "Server error fetching job details" });
  }
});

module.exports = router;
