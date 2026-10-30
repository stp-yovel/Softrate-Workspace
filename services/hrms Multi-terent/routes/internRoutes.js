const express = require("express");
const verifyTenant = require("../middleware/tenant.middleware.js");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const Intern = require("../models/Intern.js");
const Resignation = require("../models/resignation.model.js");
const LeaveCounter = require("../models/leaveCounter.model.js");
const router = express.Router();
const multer = require('multer');
const upload = multer();
const Counter = require("../models/counter.model.js");
const ExcelJS = require("exceljs");
const { sendEmail, getLogoUrl } = require("../utilities/sendEmail.js");
const { getSignature } = require("../utilities/emailSignature.js");
const { generateOfferLetter } = require("../utilities/offerLetterGenerator.js");
const { generateDynamicPDF } = require("../utilities/certificateGenerator.js");
const fs = require('fs');
const path = require('path');
const { getAssetBuffer } = require("../utilities/assetHelper.js");
const { getMasterConnection: _internGetMC, waitForConnection: _internWFC } = require("../db");
const _internCompanyModelExport = require("../models/CompanyModel.js");
async function _getMasterCompany() {
  const db = _internGetMC();
  await _internWFC(db);
  return db.models.Company || db.model("Company", _internCompanyModelExport.schema);
}
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User.js");
const Role = require("../models/Role.js");

const verifyPublicTenant = require("../middleware/publicTenant.middleware.js");

router.post("/add", verifyPublicTenant, async (req, res) => {
  try {
    const {
      fullName,
      email,
      college,
      year,
      department,
      role,
      contact,
      emergencyContact,
      onboardingDate,
      endDate,
      linkedin,
      internshipType,
      resume, // Base64 PDF
      projectLinks: projectLinksRaw,
      webAccess,
      remoteAccess,
      degree,
      qualification,
      location,
      gender,
      maritalStatus,
      dob,
      countryCode,
      jobId,
      applicationType,
      assessmentAnswers: assessmentAnswersRaw
    } = req.body;

    // Parse projectLinks (sent as JSON string from Flutter/Web)
    let projectLinks = [];
    try {
      if (projectLinksRaw) {
        const parsed = JSON.parse(projectLinksRaw);
        if (Array.isArray(parsed)) {
          projectLinks = parsed.filter(l => l && l.trim()).slice(0, 5);
        }
      }
    } catch (_) { projectLinks = []; }

    // Parse assessmentAnswers
    let assessmentAnswers = {};
    try {
      if (assessmentAnswersRaw) {
        assessmentAnswers = typeof assessmentAnswersRaw === 'string'
          ? JSON.parse(assessmentAnswersRaw)
          : assessmentAnswersRaw;
      }
    } catch (_) { assessmentAnswers = {}; }

    // Check Campus Drive Timeline Expiration & Duplicate Submission: Do not allow form submission once timeline ends or already submitted
    if (req.body.campusStudentId) {
      const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : require('../models/CampusStudent');
      const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : require('../models/CampusDrive');
      const student = await CampusStudentModel.findById(req.body.campusStudentId).select('driveId isOnboarded isFormSubmitted');
      if (student) {
        if (student.isFormSubmitted || student.isOnboarded) {
          return res.status(400).json({
            success: false,
            code: 'ALREADY_SUBMITTED',
            message: 'You have already submitted your application for this campus drive. Multiple submissions are not allowed.'
          });
        }
        if (student.driveId) {
        const drive = await CampusDriveModel.findById(student.driveId).select('title endDate status');
        if (drive) {
          const now = new Date();
          let isExpired = false;
          let formattedEndDate = '';
          if (drive.status === 'Completed' || drive.status === 'Cancelled') {
            isExpired = true;
          } else if (drive.endDate) {
            const end = new Date(drive.endDate);
            if (!isNaN(end.getTime())) {
              formattedEndDate = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0) {
                end.setUTCHours(23, 59, 59, 999);
              }
              if (now > end) isExpired = true;
            }
          }
          if (isExpired) {
            return res.status(403).json({
              success: false,
              code: 'DRIVE_TIMELINE_EXPIRED',
              message: `The registration timeline for this campus drive ended on ${formattedEndDate || 'the specified deadline'}. Submissions are no longer accepted.`
            });
          }
        }
      }
    }
  }

    // 1. Check if user already exists in this company
    const existingUser = await User.findOne({ companyId: req.tenant.companyId, email });
    if (existingUser) {
      return res.status(400).json({ message: "An application with this email already exists for this company." });
    }

    // 2. Find or Create the Default INTERN Role for this company
    let internRole = await Role.findOne({ companyId: req.tenant.companyId, name: 'INTERN' });
    if (!internRole) {
      internRole = new Role({
        companyId: req.tenant.companyId,
        name: 'INTERN',
        description: 'Standard intern permissions',
        permissions: ['VIEW_DASHBOARD', 'REQUEST_LEAVE'],
        isSystemDefined: true
      });
      await internRole.save();
    }

    const newUser = new User({
      companyId: req.tenant.companyId,
      email: email,
      password: req.tenant.defaultPassword, // Set to company's default password, will require reset
      roleId: internRole._id,
      profile: {
        firstName: fullName,
        phone: contact,
        dob: dob || null,
        gender: gender || '',
        maritalStatus: maritalStatus || '',
        emergencyContact: {
          phone: emergencyContact || ''
        },
        linkedin: linkedin
      },
      education: {
        qualification: qualification || degree || '',
        college: college,
        passingYear: year, // Mapping "year" to passingYear or current year
        specialization: department
      },
      employment: {
        type: 'INTERN',
        designation: role,
        status: 'ONBOARDING',
        joinedAt: onboardingDate,
        endDate: endDate,
        linkedin: linkedin
      },
      system: {
        onboardingStatus: 'initial'
      },
      assessmentAnswers
    });

    await newUser.save();

    // 3. ALSO Create Intern in legacy collection (Backward Compatibility for Admin Dashboard)
    const newIntern = new Intern({
      companyId: req.tenant.companyId,
      fullName,
      email,
      college,
      year: year || req.body.passingYear || req.body.graduationYear || '',
      department,
      role,
      contact,
      emergencyContact: emergencyContact || '',
      onboardingDate,
      endDate,
      linkedin: (linkedin && linkedin.trim()) ? linkedin.trim() : 'https://linkedin.com',
      internshipType,
      applicationType: applicationType || 'Internship',
      degree: degree || qualification || '',
      location: location || '',
      gender: gender || '',
      maritalStatus: maritalStatus || '',
      dob: dob || null,
      countryCode: countryCode || '+91',
      jobId: jobId || '',
      assessmentAnswers,
      projectLinks,
      campusStudentId: req.body.campusStudentId || null,
      driveId: req.body.driveId || null,
      collegeId: req.body.collegeId || null,
      isExperienced: req.body.isExperienced === true || req.body.isExperienced === 'true',
      experienceStatus: req.body.experienceStatus || (req.body.isExperienced ? 'experienced' : 'fresher'),
      passingYear: req.body.passingYear || req.body.graduationYear || year || '',
      cgpaOrPercentage: req.body.cgpaOrPercentage || req.body.cgpa || '',
      previousOrg: req.body.previousOrg || req.body.currentCompany || '',
      designation: req.body.designation || req.body.currentDesignation || '',
      experienceYears: req.body.experienceYears || req.body.yearsOfExperience || '',
      currentCtc: req.body.currentCtc || '',
      expectedCtc: req.body.expectedCtc || '',
      noticePeriod: req.body.noticePeriod || req.body.noticePeriodDays || '',
      joiningDate: req.body.joiningDate || req.body.availableJoiningDate || '',
      status: 'initial',
      webAccess: webAccess === true || webAccess === 'true',
      remoteAccess: remoteAccess === true || remoteAccess === 'true',
      password: req.tenant.defaultPassword // Backward compatibility
    });

    await newIntern.save();

    // Trigger Real-Time Dashboard Update
    const io = req.app.get('io');
    if (io) {
      io.emit('activity-updated', { type: 'new_intern', intern: newIntern });
    }

    const { formatApplicationEmailHtml } = require("../utilities/applicationEmailTemplate");
    const emailHtml = formatApplicationEmailHtml({
      applicationType: 'Internship',
      fullName: newIntern.fullName,
      email: newIntern.email,
      phone: newIntern.contact,
      dob: newIntern.dob,
      gender: newIntern.gender,
      maritalStatus: newIntern.maritalStatus,
      location: newIntern.location,
      degree: newIntern.degree,
      qualification: newIntern.degree,
      college: newIntern.college,
      department: newIntern.department,
      year: newIntern.year,
      passingYear: newIntern.year,
      role: newIntern.role,
      jobId: newIntern.jobId,
      linkedin: newIntern.linkedin,
      projectLinks: newIntern.projectLinks,
      assessmentAnswers: newIntern.assessmentAnswers
    });

    // Send initial application email to HR (with resume attachment if provided)
    const internEmailOptions = {
      to: req.tenant.receivingEmail,
      subject: `New Intern Application: ${fullName} (${newIntern.role || 'Intern'})`,
      html: emailHtml,
      replyTo: req.tenant.receivingEmail,
    };

    if (resume) {
      try {
        const resumeBuffer = Buffer.from(resume, 'base64');
        internEmailOptions.attachments = [
          {
            filename: `${(fullName || 'Intern').replace(/\s+/g, '_')}_Resume.pdf`,
            content: resumeBuffer,
            contentType: 'application/pdf'
          }
        ];
      } catch (bufErr) {
        console.error("Failed to parse resume buffer for intern email:", bufErr);
      }
    }

    try {
      await sendEmail(internEmailOptions);
    } catch (emailErr) {
      console.error("[InternAdd] Failed to send email:", emailErr);
    }

    if (req.body.campusStudentId) {
      try {
        const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : require('../models/CampusStudent');
        await CampusStudentModel.updateOne(
          { _id: req.body.campusStudentId, companyId: req.tenant.companyId },
          { $set: { isOnboarded: true, onboardedAt: new Date(), linkedCandidateId: newIntern._id } }
        );
      } catch (csErr) {
        console.error("[InternAdd] Failed to link CampusStudent:", csErr);
      }
    }

    res.status(200).json({
      message: "Intern stored successfully",
      user: newUser,
    });

  } catch (err) {
    console.error("Save Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET intern by internid
router.get("/all/initial", verifyTenant, async (req, res) => {
  try {
    const query = { status: "initial", companyId: req.tenant.companyId };
    if (req.user && req.user.role === 'manager') {
      query.assignedManager = req.user.id;
    }

    const limit = parseInt(req.query.limit) || 0; // 0 = no limit (default, backwards-compat)
    const isLimited = limit > 0;

    let q = Intern.find(query).sort({ createdAt: -1 });
    if (isLimited) {
      // Dashboard only needs name/role/createdAt for the activity feed — don't load full docs
      q = q.limit(limit).select('fullName role createdAt internId');
    }

    const interns = await q.lean();
    res.json(interns);
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});



/* ===================================================
   GET ALL PENDING INTERNS (status: initial) — for HR Approvals Hub
   Returns interns awaiting HR action (manager-approved or no manager)
=================================================== */
router.get("/all/pending", verifyTenant, async (req, res) => {
  try {
    const query = { status: "initial", companyId: req.tenant.companyId };
    if (req.user && req.user.role === 'manager') {
      query.assignedManager = req.user.id;
    }
    const interns = await Intern.find(query)
      .populate("assignedManager", "fullName department")
      .sort({ internid: 1 });
    res.json(interns);
  } catch (err) {
    console.error("Fetch Pending Interns Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all approved or ongoing interns
// Get all approved or ongoing interns with filters
router.get("/all/active", verifyTenant, async (req, res) => {
  try {
    const { range = "current", status = "all" } = req.query;

    const query = { companyId: req.tenant.companyId };

    if (range === "alumni") {
      query.status = "drop";
    } else {
      // current and all time use the same base statuses, but current has date filtering on frontend
      const statusFilter = status === "all" ? ["approved", "ongoing"] : status.split(',');
      query.status = { $in: statusFilter };
    }

    if (req.user && req.user.role === 'manager') {
      query.assignedManager = req.user.id;
    }

    const interns = await Intern.find(query)
      .populate("assignedManager", "fullName department")
      .sort({ internid: 1 });
    res.json(interns);
  } catch (err) {
    console.error("Fetch Active Interns Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});




router.put("/accept/:id", verifyTenant,
  async (req, res) => {
    try {
      const { onboardingDate, endDate, internshipType, role, webAccess, remoteAccess } = req.body;

      const intern = await Intern.findById(req.params.id).select('+profilePhoto.data');
      if (!intern) {
        return res.status(404).json({ message: "Intern not found" });
      }

      if (internshipType && !["Stipend", "Paid"].includes(internshipType)) {
        return res.status(400).json({ message: "Invalid internship type" });
      }

      // 1. Generate Intern ID
      const newId = await generateInternId(req.tenant.companyId);

      // 2. Fetch company for settings
      const Company = await _getMasterCompany();
      const company = await Company.findById(req.tenant.companyId);
      // Correct path: settings.offerLetterSettings
      const olSettings = company?.settings?.offerLetterSettings || company?.offerLetterSettings || {};

      // Generate Virtual ID URL
      const frontendUrl = process.env.FRONTEND_URL || 'https://workspace.softrateglobal.com/hrms';
      const virtualIdUrl = `${frontendUrl}/id-card/${req.tenant.companyId}/${newId}`;
      const qrCodeDataUrl = await QRCode.toDataURL(virtualIdUrl);

      // 3. Prepare data for dynamic PDF generation
      // Build profilePhoto data URL if available
      let profilePhotoDataUrl = null;
      if (intern.profilePhoto?.data) {
        const rawData = intern.profilePhoto.data;
        let buffer = null;
        if (Buffer.isBuffer(rawData)) buffer = rawData;
        else if (rawData.buffer && Buffer.isBuffer(rawData.buffer)) buffer = rawData.buffer;
        else if (Array.isArray(rawData.data)) buffer = Buffer.from(rawData.data);
        if (buffer?.length) {
          const ct = intern.profilePhoto.contentType || 'image/jpeg';
          profilePhotoDataUrl = `data:${ct};base64,${buffer.toString('base64')}`;
        }
      }

      const docData = {
        fullName: intern.fullName,
        internId: newId,
        onboardingDate: onboardingDate,
        endDate: endDate,
        todayDate: new Date(),
        role: role || intern.role,
        companyName: olSettings.companyName,
        workLocation: olSettings.workLocation,
        logo: company?.settings?.communication?.emailLogoUrl || null,
        signature: company?.settings?.communication?.emailSignatureUrl || null,
        qrCode: qrCodeDataUrl,
        profilePhoto: profilePhotoDataUrl
      };

      const attachments = [];

      // Offer Letter
      if (olSettings.documentTemplates?.offerLetter?.pages?.length > 0 || olSettings.documentTemplates?.offerLetter?.backgroundUrl) {
        const buffer = await generateDynamicPDF(docData, olSettings.documentTemplates.offerLetter);
        attachments.push({ filename: `${newId}-Offer-Letter.pdf`, content: buffer });
      } else {
        // Fallback to legacy generator
        const buffer = await generateOfferLetter(docData, olSettings);
        attachments.push({ filename: `${newId}-Offer-Letter.pdf`, content: buffer });
      }

      // Annexure
      if (olSettings.documentTemplates?.annexure?.pages?.length > 0 || olSettings.documentTemplates?.annexure?.backgroundUrl) {
        const buffer = await generateDynamicPDF(docData, olSettings.documentTemplates.annexure);
        attachments.push({ filename: `${newId}-Annexure.pdf`, content: buffer });
      } else if (olSettings.annexureUrl) {
        const annBuf = await getAssetBuffer(olSettings.annexureUrl);
        if (annBuf) attachments.push({ filename: `${newId}-Annexure.pdf`, content: annBuf });
      } else {
        // Fallback to static asset
        const annexurePath = path.join(__dirname, '../assets/pdf/Softrate_Internship_Annexure.pdf');
        if (fs.existsSync(annexurePath)) attachments.push({ filename: `${newId}-Annexure.pdf`, content: fs.readFileSync(annexurePath) });
      }

      // NDA
      if (olSettings.documentTemplates?.nda?.pages?.length > 0 || olSettings.documentTemplates?.nda?.backgroundUrl) {
        const buffer = await generateDynamicPDF(docData, olSettings.documentTemplates.nda);
        attachments.push({ filename: `${newId}-NDA.pdf`, content: buffer });
      } else if (olSettings.ndaUrl) {
        const ndaBuf = await getAssetBuffer(olSettings.ndaUrl);
        if (ndaBuf) attachments.push({ filename: `${newId}-NDA.pdf`, content: ndaBuf });
      } else {
        // Fallback to static asset
        const ndaPath = path.join(__dirname, '../assets/pdf/Internship NDA.pdf');
        if (fs.existsSync(ndaPath)) attachments.push({ filename: `${newId}-NDA.pdf`, content: fs.readFileSync(ndaPath) });
      }

      // 4. Update Intern Record
      intern.internid = newId;
      intern.status = "approved";
      intern.onboardingDate = onboardingDate;
      intern.endDate = endDate;
      if (internshipType) intern.internshipType = internshipType;
      if (role) intern.role = role;
      if (webAccess !== undefined) intern.webAccess = webAccess === true || webAccess === 'true';
      if (remoteAccess !== undefined) intern.remoteAccess = remoteAccess === true || remoteAccess === 'true';

      await intern.save();

      // 4.5 Initialize Leave Counter for Intern
      if (onboardingDate) {
        const startDate = new Date(onboardingDate);
        const Company = await _getMasterCompany();
        const company = await Company.findById(req.tenant.companyId);
        let policies = company?.leavePolicies;
        if (!policies || policies.length === 0) {
          policies = [
            { name: 'Sick Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' },
            { name: 'Casual Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' }
          ];
        }

        const records = [];
        policies.forEach((policy) => {
          if (policy.appliesTo === 'both' || policy.appliesTo === 'intern') {
            let resetDate = new Date(startDate);
            if (policy.frequency === 'monthly') {
              resetDate.setMonth(resetDate.getMonth() + 1);
            } else {
              resetDate.setFullYear(resetDate.getFullYear() + 1);
            }
            records.push({
              companyId: req.tenant.companyId,
              employeeId: newId,
              leaveType: policy.name,
              totalAllowed: policy.allowance,
              used: 0,
              balance: policy.allowance,
              cycleStartDate: startDate,
              nextResetDate: resetDate
            });
          }
        });

        try {
          if (records.length > 0) {
            await LeaveCounter.insertMany(records, { ordered: false });
            console.log(`[DEBUG] Initialized leave counters for intern ${newId}:`, records.length);
          }
        } catch (err) {
          console.error("[DEBUG] Error initializing leave counters for intern:", err);
        }
      }

      // 5. Synchronize with User Record (Unified Collection)
      const updatedUser = await User.findOneAndUpdate(
        { email: { $regex: new RegExp(`^${intern.email.trim()}$`, 'i') }, companyId: req.tenant.companyId },
        {
          'employment.status': 'approved',
          'employment.joinedAt': onboardingDate,
          'employment.endDate': endDate,
          'system.onboardingStatus': 'completed'
        },
        { new: true }
      );

      if (updatedUser) {
        console.log(`[DEBUG] Updated User record for approved intern: ${intern.email}`);
      } else {
        console.log(`[DEBUG] Warning: No User record found for approved intern: ${intern.email}`);
      }

      console.log("Intern saved successfully. Preparing to send email with generated documents...");

      try {
        const Company = await _getMasterCompany();
        const companyTemplate = await Company.findById(req.tenant.companyId);
        const template = companyTemplate?.settings?.communication?.onboardingTemplateIntern;
        const customSignature = companyTemplate?.settings?.communication?.emailSignatureUrl;
        const customLogo = companyTemplate?.settings?.communication?.emailLogoUrl;

        const internName = intern.fullName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        const formattedOnboardingDate = new Date(onboardingDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
        const formattedEndDate = new Date(endDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

        const signatureHtml = getSignature(customSignature);

        const logoHtml = customLogo
          ? `<div style="margin-bottom: 20px;"><img src="${customLogo}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`
          : `<div style="margin-bottom: 20px;"><img src="${getLogoUrl()}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`;

        let htmlContent = "";
        if (template) {
          htmlContent = template
            .replace(/{formattedName}/g, internName)
            .replace(/{onboardingDate}/g, formattedOnboardingDate)
            .replace(/{endDate}/g, formattedEndDate)
            .replace(/{signature}/g, signatureHtml)
            .replace(/{logo}/g, logoHtml);
        } else {
          htmlContent = `
            ${logoHtml}
            <p>Dear ${internName},</p>
            <p>Softrate Global welcomes you Onboard, We herein have attached your Official Offer Letter and Company Culture Book for joining us.</p>
            <p>You can share your offer letter on Linkedin by mentioning @softrate with hashtags #careeratsoftrate #softratetechpark #softratetechnologies</p>
            <p>Also read out the annexure completely that had been attached in this mail and make sure you are agreeing with our policies by signing and filling up the date in the attached annexure.</p>
            <p>Your internship details are as follows:</p>
            <ul>
              <li>Onboarding Date: ${formattedOnboardingDate}</li>
              <li>End Date: ${formattedEndDate}</li>
            </ul>
            <p style="margin: 0 0 0 0;">To proceed further, please log in to the PeopleSoft portal using the credentials shared separately.</p>
            <p style="margin: 0 0 0 0;">For first-time login, you will be required to set your own password and complete your profile by providing the necessary details.</p>
            <p style="margin: 0 0 0 0;">Kindly ensure that all required information is submitted before your onboarding date to avoid any delays.</p>
            <p style="margin: 0 0 15px 0;">For any queries, feel free to contact us.</p>
            ${signatureHtml}
          `;
        }

        await sendEmail({
          to: intern.email,
          subject: "Internship Application – Approval Notification",
          html: htmlContent,
          attachments: attachments,
          replyTo: req.tenant.receivingEmail,
        });
        console.log(`[DEBUG] Approval email sent to intern: ${intern.email}`);
      } catch (emailErr) {
        console.error("[DEBUG] Failed to send intern approval email:", emailErr);
        // Do not fail the request if only email fails
      }

      res.json({ success: true, message: "Intern approved & onboarded successfully", intern });
    } catch (err) {
      console.error("Approve Error [FULL STACK]:", err.stack);
      console.error("Approve Error:", err);
      res.status(500).json({ message: "Server error", error: err.message, stack: err.stack });
    }
  }
);


router.post("/resend-onboarding/:id", verifyTenant, async (req, res) => {
  try {
    const intern = await Intern.findById(req.params.id).select('+profilePhoto.data');
    if (!intern) return res.status(404).json({ message: "Intern not found" });
    if (intern.status !== "approved" && intern.status !== "ongoing") {
      return res.status(400).json({ message: "Intern is not approved yet" });
    }

    const Company = await _getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    const olSettings = company?.settings?.offerLetterSettings || company?.offerLetterSettings || {};

    const frontendUrl = process.env.FRONTEND_URL || 'https://workspace.softrateglobal.com/hrms';
    const virtualIdUrl = `${frontendUrl}/id-card/${req.tenant.companyId}/${intern.internid}`;
    const qrCodeDataUrl = await QRCode.toDataURL(virtualIdUrl);

    let profilePhotoDataUrl = null;
    if (intern.profilePhoto?.data) {
      const rawData = intern.profilePhoto.data;
      let buffer = null;
      if (Buffer.isBuffer(rawData)) buffer = rawData;
      else if (rawData.buffer && Buffer.isBuffer(rawData.buffer)) buffer = rawData.buffer;
      else if (Array.isArray(rawData.data)) buffer = Buffer.from(rawData.data);
      if (buffer?.length) {
        const ct = intern.profilePhoto.contentType || 'image/jpeg';
        profilePhotoDataUrl = `data:${ct};base64,${buffer.toString('base64')}`;
      }
    }

    const docData = {
      fullName: intern.fullName,
      internId: intern.internid,
      onboardingDate: intern.onboardingDate,
      endDate: intern.endDate,
      todayDate: new Date(),
      role: intern.role,
      companyName: olSettings.companyName,
      workLocation: olSettings.workLocation,
      logo: company?.settings?.communication?.emailLogoUrl || null,
      signature: company?.settings?.communication?.emailSignatureUrl || null,
      qrCode: qrCodeDataUrl,
      profilePhoto: profilePhotoDataUrl
    };

    const attachments = [];
    if (olSettings.documentTemplates?.offerLetter?.pages?.length > 0 || olSettings.documentTemplates?.offerLetter?.backgroundUrl) {
      const buffer = await generateDynamicPDF(docData, olSettings.documentTemplates.offerLetter);
      attachments.push({ filename: `${intern.internid}-Offer-Letter.pdf`, content: buffer });
    } else {
      const buffer = await generateOfferLetter(docData, olSettings);
      attachments.push({ filename: `${intern.internid}-Offer-Letter.pdf`, content: buffer });
    }

    if (olSettings.documentTemplates?.annexure?.pages?.length > 0 || olSettings.documentTemplates?.annexure?.backgroundUrl) {
      const buffer = await generateDynamicPDF(docData, olSettings.documentTemplates.annexure);
      attachments.push({ filename: `${intern.internid}-Annexure.pdf`, content: buffer });
    } else if (olSettings.annexureUrl) {
      const annBuf = await getAssetBuffer(olSettings.annexureUrl);
      if (annBuf) attachments.push({ filename: `${intern.internid}-Annexure.pdf`, content: annBuf });
    } else {
      const annexurePath = path.join(__dirname, '../assets/pdf/Softrate_Internship_Annexure.pdf');
      if (fs.existsSync(annexurePath)) attachments.push({ filename: `${intern.internid}-Annexure.pdf`, content: fs.readFileSync(annexurePath) });
    }

    if (olSettings.documentTemplates?.nda?.pages?.length > 0 || olSettings.documentTemplates?.nda?.backgroundUrl) {
      const buffer = await generateDynamicPDF(docData, olSettings.documentTemplates.nda);
      attachments.push({ filename: `${intern.internid}-NDA.pdf`, content: buffer });
    } else if (olSettings.ndaUrl) {
      const ndaBuf = await getAssetBuffer(olSettings.ndaUrl);
      if (ndaBuf) attachments.push({ filename: `${intern.internid}-NDA.pdf`, content: ndaBuf });
    } else {
      const ndaPath = path.join(__dirname, '../assets/pdf/Internship NDA.pdf');
      if (fs.existsSync(ndaPath)) attachments.push({ filename: `${intern.internid}-NDA.pdf`, content: fs.readFileSync(ndaPath) });
    }

    const companyTemplate = await Company.findById(req.tenant.companyId);
    const template = companyTemplate?.settings?.communication?.onboardingTemplateIntern;
    const customSignature = companyTemplate?.settings?.communication?.emailSignatureUrl;
    const customLogo = companyTemplate?.settings?.communication?.emailLogoUrl;

    const internName = intern.fullName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    const formattedOnboardingDate = intern.onboardingDate ? new Date(intern.onboardingDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";
    const formattedEndDate = intern.endDate ? new Date(intern.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";

    const signatureHtml = getSignature(customSignature);
    const logoHtml = customLogo ? `<div style="margin-bottom: 20px;"><img src="${customLogo}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>` : `<div style="margin-bottom: 20px;"><img src="${getLogoUrl()}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`;

    let htmlContent = "";
    if (template) {
      htmlContent = template
        .replace(/{formattedName}/g, internName)
        .replace(/{onboardingDate}/g, formattedOnboardingDate)
        .replace(/{endDate}/g, formattedEndDate)
        .replace(/{signature}/g, signatureHtml)
        .replace(/{logo}/g, logoHtml);
    } else {
      htmlContent = `
        ${logoHtml}
        <p>Dear ${internName},</p>
        <p>Softrate Global welcomes you Onboard, We herein have attached your Official Offer Letter and Company Culture Book for joining us.</p>
        <p>You can share your offer letter on Linkedin by mentioning @softrate with hashtags #careeratsoftrate #softratetechpark #softratetechnologies</p>
        <p>Also read out the annexure completely that had been attached in this mail and make sure you are agreeing with our policies by signing and filling up the date in the attached annexure.</p>
        <p>Your internship details are as follows:</p>
        <ul>
          <li>Onboarding Date: ${formattedOnboardingDate}</li>
          <li>End Date: ${formattedEndDate}</li>
        </ul>
        <p style="margin: 0 0 0 0;">To proceed further, please log in to the PeopleSoft portal using the credentials shared separately.</p>
        <p style="margin: 0 0 0 0;">For first-time login, you will be required to set your own password and complete your profile by providing the necessary details.</p>
        <p style="margin: 0 0 0 0;">Kindly ensure that all required information is submitted before your onboarding date to avoid any delays.</p>
        <p style="margin: 0 0 15px 0;">For any queries, feel free to contact us.</p>
        ${signatureHtml}
      `;
    }

    await sendEmail({
      to: intern.email,
      subject: "Internship Application – Approval Notification (Resend)",
      html: htmlContent,
      attachments: attachments,
      replyTo: req.tenant.receivingEmail,
    });
    
    res.json({ success: true, message: "Onboarding email resent successfully" });
  } catch (err) {
    console.error("Resend Email Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/reject/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, emailSubject, emailBody } = req.body;

    let intern = await Intern.findById(id);
    if (!intern) {
      return res.status(404).json({ message: "Intern not found" });
    }

    intern.status = 'rejected';
    intern.managerApprovalStatus = 'rejected';
    if (reason) intern.rejectionReason = reason;
    await intern.save();

    // 2. Fetch company settings for branding/signature
    const Company = await _getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    const customSignature = company?.settings?.communication?.emailSignatureUrl;

    const signatureHtml = getSignature(customSignature);

    // 3. Prepare email content
    let finalHtml = emailBody;
    const candRole = intern.role || intern.domain || "Candidate";
    const reasonText = reason ? reason.trim() : "";

    if (!finalHtml) {
      const template = company?.settings?.communication?.applicationRejectionTemplate;
      if (template) {
        finalHtml = template
          .replace(/{formattedName}/g, intern.fullName)
          .replace(/{role}/g, candRole)
          .replace(/{reason}/g, reasonText)
          .replace(/{logo}/g, '')
          .replace(/{signature}/g, signatureHtml);
      } else {
        finalHtml = `
          <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <p>Dear ${intern.fullName},</p>
            <p>Thank you for taking the time to apply for the <b>${candRole}</b> position with us and for your interest in our company.</p>
            <p>After careful consideration and review of your application, we regret to inform you that we will not be moving forward with your candidacy for this role at this time.</p>
            ${reasonText ? `<p>${reasonText}</p>` : ''}
            <p>We truly appreciate the effort you put into your application and wish you the very best in your job search and future professional endeavors.</p>
            <p>Best regards,</p>
            ${signatureHtml}
          </div>
        `;
      }
    } else {
      let enrichedBody = emailBody
        .replace(/{formattedName}/g, intern.fullName)
        .replace(/{role}/g, candRole)
        .replace(/{reason}/g, reasonText)
        .replace(/{logo}/g, '')
        .replace(/{signature}/g, signatureHtml);

      if (!enrichedBody.includes(signatureHtml) && !enrichedBody.includes('Company Signature') && !enrichedBody.includes('Authorized Signatory')) {
        enrichedBody = `${enrichedBody}\n${signatureHtml}`;
      }
      finalHtml = enrichedBody;
    }

    const subject = emailSubject || `Update regarding your application for ${candRole} at Softrate`;

    let emailSent = false;
    let emailError = null;

    if (intern.email) {
      try {
        // await sendEmail({
        //   to: intern.email,
        //   subject,
        //   html: finalHtml,
        //   replyTo: req.tenant?.receivingEmail,
        // });
        // emailSent = true;
        // console.log(`[DEBUG] Rejection email sent to intern candidate: ${intern.email}`);
      } catch (mailErr) {
        emailError = mailErr.message;
        console.error("Intern rejection email error:", mailErr);
      }
    }

    res.json({
      success: true,
      message: "Application rejected successfully",
      intern,
      emailSent,
      emailError
    });
  } catch (err) {
    console.error("Reject Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});



// id generator


async function generateInternId(companyId) {
  // Fetch company code
  const Company = await _getMasterCompany();
  const company = await Company.findById(companyId);
  const companyCode = company ? company.companyCode : "UNKNOWN";

  const year = new Date().getFullYear().toString().slice(-2);
  let counter;
  let internId;

  do {
    counter = await Counter.findOneAndUpdate(
      { companyId: companyId, type: 'intern', year: year },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    internId = `${year}1${String(counter.seq).padStart(3, "0")}`;
  } while (await Intern.exists({ internid: internId, companyId: companyId }));

  return internId;
}

const authController = require("../controllers/AuthController.js");
router.post("/login", authController.login);

// Get intern by internid or MongoDB _id
router.get("/get/:id", verifyTenant, async (req, res) => {
  try {
    const id = req.params.id;

    // ✅ Projection: exclude profilePhoto.data binary — the mobile dashboard
    // doesn't render the profile photo here, it loads it separately.
    // This avoids fetching potentially large binary blobs on every dashboard load.
    const projection = { 'profilePhoto.data': 0 };

    let intern;
    // Try ObjectId first (fast index hit), then internid
    if (mongoose.Types.ObjectId.isValid(id)) {
      intern = await Intern.findById(id, projection).lean();
    }
    if (!intern) {
      intern = await Intern.findOne({ internid: id }, projection).lean();
    }

    if (!intern) {
      return res.status(404).json({ message: "Intern not found" });
    }

    // Attach Shortlist record data if available so that interview info / projectLinks / CTC are populated
    if (req.models && req.models.Shortlist) {
      try {
        const shortlist = await req.models.Shortlist.findOne({
          candidateId: intern._id,
          companyId: req.tenant.companyId
        }).lean();
        if (shortlist) {
          intern.shortlist = shortlist;
          if ((intern.currentCtc === undefined || intern.currentCtc === 0 || intern.currentCtc === null || intern.currentCtc === '') && shortlist.currentCtc) {
            intern.currentCtc = shortlist.currentCtc;
          }
          if ((intern.expectedCtc === undefined || intern.expectedCtc === 0 || intern.expectedCtc === null || intern.expectedCtc === '') && shortlist.expectedCtc) {
            intern.expectedCtc = shortlist.expectedCtc;
          }
          if ((intern.noticePeriod === undefined || intern.noticePeriod === 0 || intern.noticePeriod === null || intern.noticePeriod === '') && shortlist.noticePeriod) {
            intern.noticePeriod = shortlist.noticePeriod;
          }
          if (!intern.previousOrg && shortlist.previousOrg) {
            intern.previousOrg = shortlist.previousOrg;
          }
          if (!intern.experienceYears && shortlist.experienceYears) {
            intern.experienceYears = shortlist.experienceYears;
          }
          if ((!intern.projectLinks || intern.projectLinks.length === 0) && shortlist.projectLinks?.length > 0) {
            intern.projectLinks = shortlist.projectLinks;
          }
          if (!intern.linkedin && shortlist.linkedin) {
            intern.linkedin = shortlist.linkedin;
          }
          if (!intern.degree && shortlist.qualification) {
            intern.degree = shortlist.qualification;
          }
        }
      } catch (shortlistErr) {
        console.error("Error populating shortlist info for intern:", shortlistErr.message);
      }
    }

    res.json({ intern });
  } catch (err) {
    console.error("Fetch Intern Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// changing approved to ongoing
router.post("/update-status", verifyTenant, async (req, res) => {
  try {
    const { internId, status } = req.body;

    const intern = await Intern.findOneAndUpdate(
      { internid: internId },
      { status: status },
      { new: true }
    );

    if (!intern) {
      return res.status(404).json({ message: "Intern not found" });
    }

    res.status(200).json({
      message: "Status updated successfully",
      intern,
    });
  } catch (err) {
    console.error("Update Status Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


router.get("/pastout", verifyTenant, async (req, res) => {
  try {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month); // 0 = all

    const resignations = await Resignation.find({ status: "accepted" });

    const filtered = resignations.filter((r) => {
      if (!r.lastWorkingDay) return false;

      const date = new Date(r.lastWorkingDay);
      if (isNaN(date)) return false;

      if (year && date.getFullYear() !== year) return false;
      if (month && month !== 0 && date.getMonth() + 1 !== month) return false;

      return true;
    });

    const internIds = filtered.map((r) => r.internId);

    const interns = await Intern.find({
      internid: { $in: internIds },
    });

    const result = filtered.map((r) => {
      const intern = interns.find((i) => i.internid === r.internId);

      return {
        internId: r.internId,
        fullName: intern?.fullName ?? r.internName,
        department: intern?.department ?? "",
        endDate: r.lastWorkingDay,
        status: "drop",
        exitType: r.exitType,
        exitReason: r.exitReason,
      };
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("Past-out error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/export/excel", verifyTenant, async (req, res) => {
  try {
    const { status = "all", from, to, managerId } = req.query;

    const query =
      status === "all"
        ? { companyId: req.tenant.companyId }
        : { status, companyId: req.tenant.companyId };

    if (req.user && req.user.role === 'manager') {
      query.assignedManager = req.user.id;
    } else if (managerId) {
      query.assignedManager = managerId;
    }

    let interns = await Intern.find(query).sort({ createdAt: -1 });

    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);

      interns = interns.filter((intern) => {
        if (!intern.onboardingDate) return false;
        const onboardDate = new Date(intern.onboardingDate);
        if (isNaN(onboardDate)) return false;
        return onboardDate >= fromDate && onboardDate <= toDate;
      });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Interns");

    sheet.columns = [
      { header: "Intern ID", key: "internid", width: 15 },
      { header: "Full Name", key: "fullName", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Contact", key: "contact", width: 15 },
      { header: "College", key: "college", width: 25 },
      { header: "Year", key: "year", width: 10 },
      { header: "Department", key: "department", width: 20 },
      { header: "Role", key: "role", width: 20 },
      { header: "Internship Type", key: "internshipType", width: 18 },
      { header: "Status", key: "status", width: 15 },
      { header: "Onboarding Date", key: "onboardingDate", width: 18 },
      { header: "End Date", key: "endDate", width: 18 },
      { header: "Created At", key: "createdAt", width: 22 },
    ];

    interns.forEach((intern) => {
      sheet.addRow({
        internid: intern.internid || "",
        fullName: intern.fullName,
        email: intern.email,
        contact: intern.contact,
        college: intern.college,
        year: intern.year,
        department: intern.department,
        role: intern.role,
        internshipType: intern.internshipType || "",
        status: intern.status,
        onboardingDate: intern.onboardingDate || "",
        endDate: intern.endDate || "",
        createdAt: intern.createdAt
          ? new Date(intern.createdAt).toLocaleDateString("en-GB")
          : "",
      });
    });

    // Header style
    sheet.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Intern_Data.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Intern Excel Export Error:", err);
    res.status(500).json({ message: "Excel export failed" });
  }
});

/* ============================
   GET INTERN PROFILE PHOTO
============================ */
router.get("/profile-photo/:id", async (req, res, next) => {
  if (req.query.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
}, verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    let intern;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      intern = await Intern.findById(id).select('+profilePhoto.data');
    } else {
      intern = await Intern.findOne({ internid: { $regex: new RegExp(`^${id}$`, 'i') } }).select('+profilePhoto.data');
    }
    if (!intern) return res.status(404).send("Intern not found");

    if (intern.profilePhoto && intern.profilePhoto.data) {
      res.set("Content-Type", intern.profilePhoto.contentType || "image/png");
      return res.send(intern.profilePhoto.data);
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${intern.email.trim()}$`, 'i') } }).select('+profilePhoto.data');
    if (!user || !user.profilePhoto || !user.profilePhoto.data) {
      return res.status(404).send("No photo");
    }

    res.set("Content-Type", user.profilePhoto.contentType || "image/png");
    res.send(user.profilePhoto.data);
  } catch (err) {
    console.error("Fetch Intern Photo Error:", err);
    res.status(500).send("Server error");
  }
});

/* ============================
   ASSIGN INTERN TO MANAGER
============================ */
router.put("/assign-manager/:id", verifyTenant, async (req, res) => {
  try {
    const { managerId } = req.body;
    const intern = await Intern.findById(req.params.id);
    if (!intern) return res.status(404).json({ message: "Intern not found" });

    intern.assignedManager = managerId;
    intern.managerApprovalStatus = "pending";
    await intern.save();

    res.json({ message: "Intern assigned to manager", intern });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ============================
   GET INTERNS ASSIGNED TO MANAGER
============================ */
router.get("/assigned-to/:managerId", verifyTenant, async (req, res) => {
  try {
    const interns = await Intern.find({
      assignedManager: req.params.managerId,
      status: "initial" // Only show pending applications to managers
    });
    res.json(interns);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ============================
   MANAGER REVIEW (APPROVE/REJECT)
============================ */
router.put("/manager-review/:id", verifyTenant, async (req, res) => {
  try {
    const { status, remarks } = req.body; // status: 'approved' | 'rejected'
    const intern = await Intern.findById(req.params.id);
    if (!intern) return res.status(404).json({ message: "Intern not found" });

    intern.managerApprovalStatus = status;
    intern.managerRemarks = remarks;
    await intern.save();

    res.json({ message: `Intern ${status} by manager`, intern });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.put("/update/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    let query = { companyId: req.tenant.companyId };
    
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      query.internid = id;
    }

    const updatedIntern = await Intern.findOneAndUpdate(
      query,
      { $set: req.body },
      { new: true }
    );

    if (!updatedIntern) return res.status(404).json({ message: "Intern not found" });

    // Sync with User record
    if (req.body.email || req.body.fullName || req.body.contact || req.body.payroll) {
      const updateData = {};
      if (req.body.fullName) updateData['profile.firstName'] = updatedIntern.fullName;
      if (req.body.contact) updateData['profile.phone'] = updatedIntern.contact;
      if (req.body.role) updateData['employment.designation'] = updatedIntern.role;
      if (req.body.payroll) updateData['payroll'] = updatedIntern.payroll;

      await User.findOneAndUpdate(
        { email: { $regex: new RegExp(`^${updatedIntern.email.trim()}$`, 'i') }, companyId: req.tenant.companyId },
        { $set: updateData }
      );
    }

    res.json({ message: "Intern updated successfully", intern: updatedIntern });
  } catch (err) {
    console.error("Intern Update Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/shortlist/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { emailSubject, emailBody, meetDate, meetTime, meetLink, meetNotes, role, department } = req.body;
    
    let intern = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      intern = await Intern.findById(id);
    }
    if (!intern) {
      intern = await Intern.findOne({ internid: id });
    }
    if (!intern && mongoose.Types.ObjectId.isValid(id)) {
      const Employee = require("../models/EmployeeModel.js");
      intern = await Employee.findById(id);
    }

    if (!intern) return res.status(404).json({ message: "Candidate not found" });

    // 1. Update status
    intern.status = "shortlist";
    intern.managerApprovalStatus = "shortlist";
    if (role) intern.role = role;
    if (department) intern.department = department;
    await intern.save();

    // 1b. Create or Update Shortlist document
    let rescheduleBtnHtml = "";
    if (req.models.Shortlist) {
      try {
        const parsedMeetDate = meetDate ? new Date(meetDate) : new Date();
        const { generateRawToken, createRescheduleToken, buildRescheduleUrl, buildRescheduleButtonHtml } = require("../utilities/rescheduleHelper");
        const rawToken = generateRawToken();
        const shortlistRecord = await req.models.Shortlist.findOneAndUpdate(
          { companyId: req.tenant.companyId, candidateId: intern._id },
          {
            companyId: req.tenant.companyId,
            candidateId: intern._id,
            candidateType: "Intern",
            fullName: intern.fullName,
            email: intern.email,
            phone: intern.phone || "",
            role: intern.role || "",
            department: intern.department || "",
            qualification: intern.qualification || intern.degree || "",
            college: intern.college || "",
            location: intern.location || "",
            linkedin: intern.linkedin || "",
            projectLinks: intern.projectLinks || [],
            meetDate: isNaN(parsedMeetDate.getTime()) ? new Date() : parsedMeetDate,
            meetTime: meetTime || "11:00 AM",
            meetLink: meetLink || "",
            meetNotes: meetNotes || "",
            emailSubject: emailSubject || "",
            emailBody: emailBody || "",
            rescheduleToken: rawToken,
            status: "scheduled",
            scheduledBy: {
              userId: req.user?.id || "",
              name: req.user?.name || "HR Team"
            },
            scheduledAt: new Date()
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (shortlistRecord) {
          const signedRescheduleToken = createRescheduleToken(
            shortlistRecord._id,
            req.tenant.companyId,
            rawToken
          );
          const rescheduleUrl = buildRescheduleUrl(signedRescheduleToken);
          rescheduleBtnHtml = buildRescheduleButtonHtml(rescheduleUrl);
        }
      } catch (shortlistErr) {
        console.error("Failed to sync Shortlist record:", shortlistErr);
      }
    }

    // 2. Fetch company settings for branding/signature
    const Company = await _getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    const customSignature = company?.settings?.communication?.emailSignatureUrl;

    const signatureHtml = getSignature(customSignature);

    // 3. Prepare email content
    let finalHtml = emailBody;
    if (!finalHtml) {
      const template = company?.settings?.communication?.shortlistInterviewTemplate;
      if (template) {
        finalHtml = template
          .replace(/{formattedName}/g, intern.fullName)
          .replace(/{role}/g, intern.role || "Candidate")
          .replace(/{meetDate}/g, meetDate || "TBD")
          .replace(/{meetTime}/g, meetTime || "TBD")
          .replace(/{meetLink}/g, meetLink || "Will be shared shortly")
          .replace(/{meetNotes}/g, meetNotes || "None")
          .replace(/{rescheduleButton}/g, rescheduleBtnHtml)
          .replace(/{logo}/g, '')
          .replace(/{signature}/g, signatureHtml);

        if (rescheduleBtnHtml && !finalHtml.includes("Request to Reschedule")) {
          finalHtml = finalHtml.replace(signatureHtml, `${rescheduleBtnHtml}\n${signatureHtml}`);
        }
      } else {
        finalHtml = `
          <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <p>Dear ${intern.fullName},</p>
            <p>Congratulations! We are pleased to inform you that your application for the <b>${intern.role || 'Role'}</b> position has been shortlisted.</p>
            <p>We would like to invite you for an interview / discussion meeting scheduled as follows:</p>
            <ul>
              <li><b>Date & Time:</b> ${meetDate || 'TBD'} at ${meetTime || 'TBD'}</li>
              <li><b>Meeting Platform / Link:</b> <a href="${meetLink || '#'}" target="_blank" style="color: #007bb6;">${meetLink || 'Link will be provided'}</a></li>
              <li><b>Notes / Instructions:</b> ${meetNotes || 'Please join on time.'}</li>
            </ul>
            ${rescheduleBtnHtml}
            <p>Please make sure to join on time.</p>
            <p>Best regards,</p>
            ${signatureHtml}
          </div>
        `;
      }
    } else {
      let enrichedBody = emailBody
        .replace(/{formattedName}/g, intern.fullName)
        .replace(/{role}/g, intern.role || "Candidate")
        .replace(/{meetDate}/g, meetDate || "")
        .replace(/{meetTime}/g, meetTime || "")
        .replace(/{meetLink}/g, meetLink || "")
        .replace(/{meetNotes}/g, meetNotes || "")
        .replace(/{rescheduleButton}/g, rescheduleBtnHtml)
        .replace(/{logo}/g, '')
        .replace(/{signature}/g, signatureHtml);

      if (rescheduleBtnHtml && !enrichedBody.includes("Request to Reschedule")) {
        enrichedBody = `${enrichedBody}\n${rescheduleBtnHtml}`;
      }

      if (!enrichedBody.includes(signatureHtml) && !enrichedBody.includes('Company Signature') && !enrichedBody.includes('Authorized Signatory')) {
        enrichedBody = `${enrichedBody}\n${signatureHtml}`;
      }
      finalHtml = enrichedBody;
    }

    const subject = emailSubject || `Application Shortlisted - Interview Scheduled for ${intern.role || 'Role'} at Softrate`;

    let emailSent = false;
    let emailError = null;

    if (intern.email) {
      try {
        await sendEmail({
          to: intern.email,
          subject,
          html: finalHtml,
          replyTo: req.tenant?.receivingEmail,
        });
        emailSent = true;
        console.log(`[DEBUG] Shortlist interview email sent to candidate: ${intern.email}`);
      } catch (mailErr) {
        emailError = mailErr.message;
        console.error("Shortlist email error:", mailErr);
      }
    }

    res.json({ 
      success: true, 
      message: emailSent 
        ? "Candidate shortlisted and interview schedule email sent successfully" 
        : `Candidate shortlisted, but email failed: ${emailError || 'No email address found'}`,
      intern,
      emailSent,
      emailError 
    });
  } catch (err) {
    console.error("Shortlist error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;