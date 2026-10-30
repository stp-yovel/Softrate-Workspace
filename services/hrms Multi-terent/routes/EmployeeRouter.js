const express = require("express");
const mongoose = require("mongoose");
const Employee = require("../models/EmployeeModel");
const LeaveCounter = require("../models/leaveCounter.model"); 
const { sendEmail, LOGO_URL, getLogoUrl } = require("../utilities/sendEmail");
const { getSignature } = require("../utilities/emailSignature");
const multer = require("multer");
const ExcelJS = require("exceljs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const verifyTenant = require("../middleware/tenant.middleware");


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ============================
   ADD / ONBOARD (INITIAL)
============================ */
const User = require("../models/User");
const Role = require("../models/Role");

const verifyPublicTenant = require("../middleware/publicTenant.middleware");

router.post(
  "/add",
  upload.any(), // parse multipart/form-data FIRST
  verifyPublicTenant,
  async (req, res) => {
    try {
      console.log("BODY:", req.body);   // employee fields
      
      // 1. Check if user already exists in this company
      const existingUser = await User.findOne({ companyId: req.tenant.companyId, email: req.body.email });
      if (existingUser) {
        return res.status(400).json({ message: "An application with this email already exists for this company." });
      }

      // 2. Find or Create the Default EMPLOYEE Role for this company
      let employeeRole = await Role.findOne({ companyId: req.tenant.companyId, name: 'EMPLOYEE' });
      if (!employeeRole) {
        employeeRole = new Role({
          companyId: req.tenant.companyId,
          name: 'EMPLOYEE',
          description: 'Standard employee permissions',
          permissions: ['VIEW_DASHBOARD', 'REQUEST_LEAVE'],
          isSystemDefined: true
        });
        await employeeRole.save();
      }

      // Parse projectLinks (sent as JSON string from Flutter/Web)
      let projectLinks = [];
      try {
        if (req.body.projectLinks) {
          projectLinks = JSON.parse(req.body.projectLinks);
          if (!Array.isArray(projectLinks)) projectLinks = [];
          projectLinks = projectLinks.filter(l => l && l.trim()).slice(0, 5);
        }
      } catch (_) { projectLinks = []; }

      // Parse assessmentAnswers (sent as JSON string from frontend)
      let assessmentAnswers = {};
      try {
        if (req.body.assessmentAnswers) {
          assessmentAnswers = typeof req.body.assessmentAnswers === 'string'
            ? JSON.parse(req.body.assessmentAnswers)
            : req.body.assessmentAnswers;
        }
      } catch (_) { assessmentAnswers = {}; }

      const isExperienced = req.body.isExperienced === 'true' || req.body.isExperienced === true;

      // 3. Create User in unified collection
      const newUser = new User({
        companyId: req.tenant.companyId,
        email: req.body.email,
        password: req.tenant.defaultPassword, // Set to company's default password, will require reset
        roleId: employeeRole._id,
        profile: {
          firstName: req.body.fullName,
          phone: req.body.phone,
          dob: req.body.dob,
          address: req.body.address,
          gender: req.body.gender,
          nationality: req.body.nationality,
          maritalStatus: req.body.maritalStatus,
          emergencyContact: {
            name: req.body.emergencyName,
            phone: req.body.emergencyPhone
          }
        },
        education: {
          qualification: req.body.qualification || req.body.degree,
          specialization: req.body.specialization || req.body.department,
          college: req.body.college,
          passingYear: req.body.passingYear
        },
        experience: {
          isExperienced: isExperienced,
          years: req.body.experienceYears,
          previousOrg: req.body.previousOrg,
          designation: req.body.designation || req.body.role
        },
        employment: {
          type: 'FULL_TIME',
          designation: req.body.designation || req.body.role,
          status: 'ONBOARDING'
        },
        system: {
          onboardingStatus: 'initial',
          declaration: req.body.declaration === 'true' || req.body.declaration === true,
          bgConsent: req.body.bgConsent === 'true' || req.body.bgConsent === true,
          whatsappConsent: req.body.whatsappConsent === 'true' || req.body.whatsappConsent === true
        },
        assessmentAnswers
      });

      await newUser.save();

      // 4. Create Employee in legacy collection (Backward Compatibility)
      const newEmployee = new Employee({
        companyId: req.tenant.companyId,
        fullName: req.body.fullName,
        email: req.body.email,
        phone: req.body.phone,
        emergencyName: req.body.emergencyName,
        emergencyPhone: req.body.emergencyPhone,
        dob: req.body.dob,
        address: req.body.address,
        role: req.body.designation || req.body.role,
        department: req.body.department || '',
        linkedin: (req.body.linkedin && req.body.linkedin.trim()) ? req.body.linkedin.trim() : 'https://linkedin.com',
        gender: req.body.gender,
        nationality: req.body.nationality,
        maritalStatus: req.body.maritalStatus,
        degree: req.body.degree || '',
        qualification: req.body.qualification || req.body.degree || '',
        college: req.body.college || '',
        passingYear: req.body.passingYear || '',
        cgpaOrPercentage: req.body.cgpaOrPercentage || '',
        location: req.body.location || '',
        countryCode: req.body.countryCode || '+91',
        jobId: req.body.jobId || '',
        isExperienced: isExperienced,
        experienceYears: req.body.experienceYears || '',
        previousOrg: req.body.previousOrg || '',
        designation: req.body.designation || req.body.role || '',
        currentCtc: !isNaN(Number(req.body.currentCtc)) ? Number(req.body.currentCtc) : (parseFloat(req.body.currentCtc) || 0),
        expectedCtc: !isNaN(Number(req.body.expectedCtc)) ? Number(req.body.expectedCtc) : (parseFloat(req.body.expectedCtc) || 0),
        noticePeriod: !isNaN(Number(req.body.noticePeriod)) ? Number(req.body.noticePeriod) : (parseInt(req.body.noticePeriod, 10) || 0),
        joiningDate: req.body.joiningDate || null,
        assessmentAnswers,
        declaration: req.body.declaration === 'true' || req.body.declaration === true,
        bgConsent: req.body.bgConsent === 'true' || req.body.bgConsent === true,
        whatsappConsent: req.body.whatsappConsent === 'true' || req.body.whatsappConsent === true,
        projectLinks,
        completeDetails: false,
        status: 'initial',
        password: req.tenant.defaultPassword // Backward compatibility
      });

      await newEmployee.save();

      // Trigger Real-Time Dashboard/Approvals Update
      const io = req.app.get('io');
      if (io) {
        io.emit('activity-updated', { type: 'new_employee', employee: newEmployee });
      }

      const { formatApplicationEmailHtml } = require("../utilities/applicationEmailTemplate");
      const emailHtml = formatApplicationEmailHtml({
        applicationType: 'Full-Time Employee',
        fullName: newEmployee.fullName,
        email: newEmployee.email,
        phone: newEmployee.phone,
        dob: req.body.dob,
        gender: newEmployee.gender,
        maritalStatus: newEmployee.maritalStatus,
        location: newEmployee.location,
        degree: newEmployee.degree,
        qualification: newEmployee.qualification,
        college: newEmployee.college,
        department: newEmployee.department,
        passingYear: newEmployee.passingYear,
        cgpaOrPercentage: newEmployee.cgpaOrPercentage,
        isExperienced: newEmployee.isExperienced,
        experienceYears: newEmployee.experienceYears,
        previousOrg: newEmployee.previousOrg,
        designation: newEmployee.designation,
        role: newEmployee.role,
        currentCtc: newEmployee.currentCtc,
        expectedCtc: newEmployee.expectedCtc,
        noticePeriod: newEmployee.noticePeriod,
        joiningDate: newEmployee.joiningDate ? (typeof newEmployee.joiningDate === 'string' ? newEmployee.joiningDate : new Date(newEmployee.joiningDate).toLocaleDateString()) : (req.body.joiningDate || ''),
        jobId: newEmployee.jobId,
        linkedin: newEmployee.linkedin,
        projectLinks: newEmployee.projectLinks,
        assessmentAnswers: newEmployee.assessmentAnswers
      });

      // Send initial application email to HR (with resume attachment if provided)
      const emailOptions = {
        to: req.tenant.receivingEmail,
        subject: `New Employee Application: ${req.body.fullName} (${newEmployee.role || 'Employee'})`,
        html: emailHtml,
        replyTo: req.tenant.receivingEmail,
      };

      if (req.body.resume) {
        try {
          const resumeBuffer = Buffer.from(req.body.resume, 'base64');
          emailOptions.attachments = [
            {
              filename: `${(req.body.fullName || 'Employee').replace(/\s+/g, '_')}_Resume.pdf`,
              content: resumeBuffer,
              contentType: 'application/pdf'
            }
          ];
        } catch (bufErr) {
          console.error("Failed to parse resume buffer for employee email:", bufErr);
        }
      }

      await sendEmail(emailOptions);

      if (req.body.campusStudentId) {
        try {
          const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : require('../models/CampusStudent');
          await CampusStudentModel.updateOne(
            { _id: req.body.campusStudentId, companyId: req.tenant.companyId },
            { $set: { isOnboarded: true, onboardedAt: new Date(), linkedCandidateId: newEmployee._id } }
          );
        } catch (csErr) {
          console.error("[EmployeeAdd] Failed to link CampusStudent:", csErr);
        }
      }

      res.status(201).json({ message: "Employee submitted & email sent", userId: newUser._id, employeeMongoId: newEmployee._id });
    } catch (err) {
      console.error("Employee Add Error:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

/* ============================
   COMPLETE DETAILS (post-login)
   Saves deferred education/experience/docs fields.
   Emails uploaded files to company communication email.
   Sets completeDetails = true.
============================ */
router.post(
  "/complete-details/:id",
  upload.any(),
  verifyTenant,
  async (req, res) => {
    try {
      const { id } = req.params;
      let query = { companyId: req.tenant.companyId };
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        query._id = id;
      } else {
        query.EmployeeId = { $regex: new RegExp(`^${id}$`, 'i') };
      }

      const employee = await Employee.findOne(query);
      if (!employee) return res.status(404).json({ message: "Employee not found" });

      // Parse projectLinks if re-submitted
      let projectLinks = employee.projectLinks || [];
      try {
        if (req.body.projectLinks) {
          const parsed = JSON.parse(req.body.projectLinks);
          if (Array.isArray(parsed)) {
            projectLinks = parsed.filter(l => l && l.trim()).slice(0, 5);
          }
        }
      } catch (_) {}

      // Update deferred fields
      employee.qualification = req.body.qualification || employee.qualification;
      employee.specialization = req.body.specialization || employee.specialization;
      employee.college = req.body.college || employee.college;
      employee.passingYear = req.body.passingYear || employee.passingYear;
      employee.ugCgpa = req.body.ugCgpa ? Number(req.body.ugCgpa) : employee.ugCgpa;
      employee.pgCgpa = req.body.pgCgpa ? Number(req.body.pgCgpa) : employee.pgCgpa;
      employee.isExperienced = req.body.isExperienced === 'true' || req.body.isExperienced === true;
      employee.experienceYears = req.body.experienceYears || employee.experienceYears;
      employee.previousOrg = req.body.previousOrg || employee.previousOrg;
      employee.designation = req.body.designation || employee.designation;
      employee.projectLinks = projectLinks;

      // Update statutory & bank details
      if (req.body.panNumber) employee.panNumber = req.body.panNumber.trim().toUpperCase();
      if (req.body.uanNumber) employee.uanNumber = req.body.uanNumber.trim();
      if (req.body.esiNumber) employee.esiNumber = req.body.esiNumber.trim();
      if (req.body.bankName || req.body.accountNumber || req.body.ifscCode || req.body.branchName || req.body.accountHolderName) {
        employee.bankDetails = {
          bankName: req.body.bankName ? req.body.bankName.trim() : (employee.bankDetails?.bankName || ""),
          accountNumber: req.body.accountNumber ? req.body.accountNumber.trim() : (employee.bankDetails?.accountNumber || ""),
          ifscCode: req.body.ifscCode ? req.body.ifscCode.trim().toUpperCase() : (employee.bankDetails?.ifscCode || ""),
          branchName: req.body.branchName ? req.body.branchName.trim() : (employee.bankDetails?.branchName || ""),
          accountHolderName: req.body.accountHolderName ? req.body.accountHolderName.trim() : (employee.bankDetails?.accountHolderName || "")
        };
      }

      employee.completeDetails = true;

      await employee.save();

      // Sync education/experience/bank to User record as well
      const userUpdateData = {
        'education.qualification': employee.qualification,
        'education.specialization': employee.specialization,
        'education.college': employee.college,
        'education.passingYear': employee.passingYear,
        'education.ugCgpa': employee.ugCgpa,
        'education.pgCgpa': employee.pgCgpa,
        'experience.isExperienced': employee.isExperienced,
        'experience.years': employee.experienceYears,
        'experience.previousOrg': employee.previousOrg,
        'experience.designation': employee.designation,
      };
      if (employee.panNumber) userUpdateData['panNumber'] = employee.panNumber;
      if (employee.uanNumber) userUpdateData['uanNumber'] = employee.uanNumber;
      if (employee.esiNumber) userUpdateData['esiNumber'] = employee.esiNumber;
      if (employee.bankDetails) userUpdateData['bankDetails'] = employee.bankDetails;

      await User.findOneAndUpdate(
        { email: { $regex: new RegExp(`^${employee.email.trim()}$`, 'i') }, companyId: req.tenant.companyId },
        { $set: userUpdateData }
      );

      // Email uploaded files to company communication email
      const attachments = (req.files || []).map(file => ({
        filename: `${file.fieldname}-${file.originalname}`,
        content: file.buffer,
      }));

      if (attachments.length > 0) {
        await sendEmail({
          to: req.tenant.receivingEmail,
          subject: `Employee Documents Submitted: ${employee.fullName} (${employee.EmployeeId || employee.email})`,
          html: `
            <h3>Employee documents received</h3>
            <p><b>Name:</b> ${employee.fullName}</p>
            <p><b>Email:</b> ${employee.email}</p>
            <p><b>Employee ID:</b> ${employee.EmployeeId || 'Pending Approval'}</p>
            <p>The employee has completed their profile details. Attached documents are included above.</p>
          `,
          attachments,
          replyTo: req.tenant.receivingEmail,
        });
      }

      res.json({ success: true, message: "Details saved successfully", completeDetails: true });
    } catch (err) {
      console.error("Complete Details Error:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);


/* ============================
   GET INITIAL EMPLOYEES
============================ */
router.get("/all/initial", verifyTenant, async (req, res) => {
  const query = { status: "initial", companyId: req.tenant.companyId };
  if (req.user && req.user.role === 'manager') {
    query.assignedManager = req.user.id;
  }
  const employees = await Employee.find(query);
  res.json(employees);
});

/* ============================
   GET ACTIVE EMPLOYEES
============================ */
/* ===================================================
   GET ALL PENDING EMPLOYEES (status: initial) — for HR Approvals Hub
=================================================== */
router.get("/all/pending", verifyTenant, async (req, res) => {
  try {
    const query = {
      status: "initial",
      companyId: req.tenant.companyId
    };
    if (req.user && req.user.role === 'manager') {
      query.assignedManager = req.user.id;
    }
    const employees = await Employee.find(query)
      .sort({ EmployeeId: 1 })
      .lean();
    res.json(employees);
  } catch (err) {
    console.error("Fetch Pending Employees Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/all/active", verifyTenant, async (req, res) => {
  try {
    const { range = "all", status = "all" } = req.query;

    const statusFilter = status === "all" ? ["approved", "ongoing"] : (status.includes(",") ? status.split(",") : [status]);

    const query = { status: { $in: statusFilter }, companyId: req.tenant.companyId };

    if (req.user && req.user.role === 'manager') {
      query.assignedManager = req.user.id;
    }

    const now = new Date();
    let start, end;

    if (range === "thisMonth") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (range === "sixMonths") {
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (range === "all") {
      // ✅ ALL TIME - no date filter
      start = null;
      end = null;
    }

    // ✅ FIXED: Use submittedAt instead of createdAt
    if (start && end) {
      query.submittedAt = { $gte: start, $lte: end };
    }

    const employees = await Employee.find(query)
      .sort({ EmployeeId: 1 })
      .lean();

    console.log(`Found ${employees.length} employees`);
    res.json(employees);
  } catch (err) {
    console.error("Fetch Active Employees Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================
   GET SINGLE EMPLOYEE
============================ */
router.get("/get/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Projection: exclude profilePhoto.data binary — the mobile dashboard
    // loads profile photos separately. Avoids binary blob on every dashboard load.
    const projection = { 'profilePhoto.data': 0 };

    let employee;
    // Try ObjectId first (fastest), then custom EmployeeId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      employee = await Employee.findOne({ _id: id, companyId: req.tenant.companyId }, projection).lean();
    }
    if (!employee) {
      employee = await Employee.findOne({
        EmployeeId: { $regex: new RegExp(`^${id}$`, 'i') },
        companyId: req.tenant.companyId
      }, projection).lean();
    }

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Attach Shortlist record data if available so that interview info / projectLinks / CTC are populated
    if (req.models && req.models.Shortlist) {
      try {
        const shortlist = await req.models.Shortlist.findOne({
          candidateId: employee._id,
          companyId: req.tenant.companyId
        }).lean();
        if (shortlist) {
          employee.shortlist = shortlist;
          if ((employee.currentCtc === undefined || employee.currentCtc === 0 || employee.currentCtc === null || employee.currentCtc === '') && shortlist.currentCtc) {
            employee.currentCtc = shortlist.currentCtc;
          }
          if ((employee.expectedCtc === undefined || employee.expectedCtc === 0 || employee.expectedCtc === null || employee.expectedCtc === '') && shortlist.expectedCtc) {
            employee.expectedCtc = shortlist.expectedCtc;
          }
          if ((employee.noticePeriod === undefined || employee.noticePeriod === 0 || employee.noticePeriod === null || employee.noticePeriod === '') && shortlist.noticePeriod) {
            employee.noticePeriod = shortlist.noticePeriod;
          }
          if (!employee.previousOrg && shortlist.previousOrg) {
            employee.previousOrg = shortlist.previousOrg;
          }
          if (!employee.experienceYears && shortlist.experienceYears) {
            employee.experienceYears = shortlist.experienceYears;
          }
          if ((!employee.projectLinks || employee.projectLinks.length === 0) && shortlist.projectLinks?.length > 0) {
            employee.projectLinks = shortlist.projectLinks;
          }
          if (!employee.linkedin && shortlist.linkedin) {
            employee.linkedin = shortlist.linkedin;
          }
          if (!employee.degree && shortlist.qualification) {
            employee.degree = shortlist.qualification;
          }
        }
      } catch (shortlistErr) {
        console.error("Error populating shortlist info for employee:", shortlistErr.message);
      }
    }

    res.json({ employee });
  } catch (err) {
    console.error("Fetch Single Employee Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================
   GET EMPLOYEE PROFILE PHOTO
============================ */
router.get("/profile-photo/:id", async (req, res, next) => {
  if (req.query.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
}, verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    let employee;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      employee = await Employee.findById(id).select('+profilePhoto.data');
    } else {
      employee = await Employee.findOne({ EmployeeId: { $regex: new RegExp(`^${id}$`, 'i') } }).select('+profilePhoto.data');
    }
    if (!employee) return res.status(404).send("Employee not found");

    if (employee.profilePhoto && employee.profilePhoto.data) {
      res.set("Content-Type", employee.profilePhoto.contentType || "image/png");
      return res.send(employee.profilePhoto.data);
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${employee.email.trim()}$`, 'i') } }).select('+profilePhoto.data');
    if (!user || !user.profilePhoto || !user.profilePhoto.data) {
      return res.status(404).send("No photo");
    }

    res.set("Content-Type", user.profilePhoto.contentType || "image/png");
    res.send(user.profilePhoto.data);
  } catch (err) {
    console.error("Fetch Employee Photo Error:", err);
    res.status(500).send("Server error");
  }
});

/* ============================
   ACCEPT EMPLOYEE (PDF + MAIL)
============================ */
router.put("/accept/:id", verifyTenant, async (req, res) => {
  try {
    const { onboardingDate, webAccess, remoteAccess } = req.body;
    const employee = await Employee.findOne({ _id: req.params.id, companyId: req.tenant.companyId });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    // Generate unique Employee ID
    const newEmployeeId = await generateEmployeeId(req.tenant.companyId);
    employee.EmployeeId = newEmployeeId;
    employee.status = "approved";
    employee.onboardingDate = onboardingDate;
    if (webAccess !== undefined) employee.webAccess = webAccess === true || webAccess === 'true';
    if (remoteAccess !== undefined) employee.remoteAccess = remoteAccess === true || remoteAccess === 'true';

    await employee.save();

    // 2. Synchronize with User Record (Unified Collection)
    const updatedUser = await User.findOneAndUpdate(
      { email: { $regex: new RegExp(`^${employee.email.trim()}$`, 'i') }, companyId: req.tenant.companyId },
      { 
        'employment.status': 'approved',
        'employment.joinedAt': onboardingDate,
        'system.onboardingStatus': 'completed'
      },
      { new: true }
    );

    if (updatedUser) {
      console.log(`[DEBUG] Updated User record for approved employee: ${employee.email}`);
    } else {
      console.log(`[DEBUG] Warning: No User record found for approved employee: ${employee.email}`);
    }

    // 3. Initialize leave counter
    const startDate = new Date(onboardingDate);

    // Fetch dynamic leave policies
    const Company = await _getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    let leavePolicies = company?.leavePolicies;
    if (!leavePolicies || leavePolicies.length === 0) {
      leavePolicies = [
        { name: 'Casual Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' },
        { name: 'Sick Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' }
      ];
    }

    const records = [];
    for (const p of leavePolicies) {
      if (p.appliesTo === 'both' || p.appliesTo === 'employee') {
        const nextResetDate = new Date(startDate);
        if (p.frequency === 'monthly') {
          nextResetDate.setMonth(startDate.getMonth() + 1);
        } else {
          nextResetDate.setFullYear(startDate.getFullYear() + 1);
        }
        
        records.push({
          companyId: req.tenant.companyId,
          employeeId: newEmployeeId,
          leaveType: p.name,
          totalAllowed: p.allowance,
          used: 0,
          balance: p.allowance,
          cycleStartDate: startDate,
          nextResetDate: nextResetDate,
        });
      }
    }

    try {
      if (records.length > 0) {
        await LeaveCounter.insertMany(records, { ordered: false });
        console.log(`[DEBUG] Initialized leave counters for employee ${newEmployeeId}:`, records.length);
      }
    } catch (err) {
      console.error("[DEBUG] Error initializing leave counters:", err);
    }

    // 4. Send approval email
    try {
      const Company = await _getMasterCompany();
      const company = await Company.findById(req.tenant.companyId);
      const template = company?.settings?.communication?.onboardingTemplateEmployee;
      const customSignature = company?.settings?.communication?.emailSignatureUrl;
      const customLogo = company?.settings?.communication?.emailLogoUrl;
      
      const signatureHtml = getSignature(customSignature);

      const logoHtml = customLogo
        ? `<div style="margin-bottom: 20px;"><img src="${customLogo}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`
        : `<div style="margin-bottom: 20px;"><img src="${LOGO_URL}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`;

      let htmlContent = "";
      if (template) {
        htmlContent = template
          .replace(/{formattedName}/g, employee.fullName)
          .replace(/{employeeId}/g, newEmployeeId)
          .replace(/{onboardingDate}/g, onboardingDate)
          .replace(/{signature}/g, signatureHtml)
          .replace(/{logo}/g, logoHtml);
      } else {
        htmlContent = `<div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                 <h2>Hi ${employee.fullName},</h2>
                 <p>Your profile has been <b>approved</b> 🎉</p>
                 <p><b>Employee ID:</b> ${newEmployeeId}</p>
                 <p><b>Onboarding Date:</b> ${onboardingDate}</p>
                 ${signatureHtml}
               </div>`;
      }

      await sendEmail({
        to: employee.email,
        subject: "Your Employee ID is Ready",
        html: htmlContent,
      });
      console.log(`[DEBUG] Approval email sent to: ${employee.email}`);
    } catch (emailErr) {
      console.error("[DEBUG] Failed to send approval email:", emailErr);
      // We do NOT return error here, because the DB records are already updated successfully
    }

    res.json({ success: true, message: "Employee approved & onboarded successfully", employee });
  } catch (err) {
    console.error("Employee Accept Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ============================
   REJECT EMPLOYEE / DELETE
============================ */
router.delete("/delete/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    let query = { companyId: req.tenant.companyId };
    
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      query.EmployeeId = { $regex: new RegExp(`^${id}$`, 'i') };
    }

    const employee = await Employee.findOneAndDelete(query);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({ message: "Employee deleted successfully", employee });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// Alias for delete to match some frontend calls
router.delete("/reject/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    let query = { companyId: req.tenant.companyId };
    
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      query.EmployeeId = { $regex: new RegExp(`^${id}$`, 'i') };
    }

    const employee = await Employee.findOneAndDelete(query);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    res.json({ message: "Employee rejected/deleted", employee });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

const authController = require("../controllers/AuthController");
router.post("/login", authController.login);

/* ============================
   MANAGER LOGIN (BY EMAIL)
============================ */
router.post("/manager/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const manager = await Employee.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') }, isManager: true });

    if (!manager) {
      return res.status(404).json({ message: "Manager not found or unauthorized" });
    }

    if (!manager.password) {
      manager.password = password;
      await manager.save();
      return res.json({ message: "First-time password set", firstTime: true, manager });
    }

    let isMatch = false;
    if (manager.password.length === 60 || manager.password.startsWith('$2a$') || manager.password.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(password, manager.password);
    } else {
        isMatch = (manager.password === password);
        if (isMatch) {
            const salt = await bcrypt.genSalt(10);
            manager.password = await bcrypt.hash(password, salt);
            await manager.save();
        }
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Wrong password" });
    }

    const token = jwt.sign(
      { user: { id: manager.id, companyId: manager.companyId, role: 'manager' } },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '1d' }
    );

    res.json({ message: "Login successful", firstTime: false, manager, token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/* ============================
   EMPLOYEE ID GENERATOR
============================ */
const Counter = require("../models/counter.model");
const { getMasterConnection: _getMasterConn, waitForConnection: _waitConn } = require("../db");
const CompanyModelExport = require("../models/CompanyModel");
async function _getMasterCompany() {
  const db = _getMasterConn();
  await _waitConn(db);
  return db.models.Company || db.model("Company", CompanyModelExport.schema);
}

async function generateEmployeeId(companyId) {
  const Company = await _getMasterCompany();
  const company = await Company.findById(companyId);
  const companyCode = company ? company.companyCode : "UNKNOWN";

  const year = new Date().getFullYear().toString().slice(-2);
  let counter;
  let employeeId;

  do {
    counter = await Counter.findOneAndUpdate(
      { companyId: companyId, type: 'employee', year: year },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    employeeId = `${year}2${String(counter.seq).padStart(3, "0")}`;
  } while (await Employee.exists({ EmployeeId: employeeId, companyId: companyId }));

  return employeeId;
}



router.get("/export/excel/all-employees", verifyTenant, async (req, res) => {
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

    let employees = await Employee.find(query).sort({ submittedAt: -1 });

    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);

      employees = employees.filter((emp) => {
        if (!emp.onboardingDate) return false;
        const onboardDate = new Date(emp.onboardingDate);
        if (isNaN(onboardDate)) return false;
        return onboardDate >= fromDate && onboardDate <= toDate;
      });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Employees");

    sheet.columns = [
      { header: "Employee ID", key: "EmployeeId", width: 18 },
      { header: "Full Name", key: "fullName", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Status", key: "status", width: 15 },
      { header: "Role", key: "role", width: 20 },
      { header: "Onboarding Date", key: "onboardingDate", width: 18 },
      { header: "Date of Birth", key: "dob", width: 15 },
      { header: "Gender", key: "gender", width: 12 },
      { header: "Nationality", key: "nationality", width: 15 },
      { header: "Marital Status", key: "maritalStatus", width: 15 },

      // Education
      { header: "Qualification", key: "qualification", width: 18 },
      { header: "Specialization", key: "specialization", width: 20 },
      { header: "College", key: "college", width: 25 },
      { header: "Passing Year", key: "passingYear", width: 15 },

      // CGPA
      { header: "UG CGPA", key: "ugCgpa", width: 12 },
      { header: "PG CGPA", key: "pgCgpa", width: 12 },

      // Experience
      { header: "Experienced", key: "isExperienced", width: 15 },
      { header: "Experience Years", key: "experienceYears", width: 18 },
      { header: "Previous Organization", key: "previousOrg", width: 25 },
      { header: "Designation", key: "designation", width: 20 },

      // Emergency
      { header: "Emergency Contact Name", key: "emergencyName", width: 25 },
      { header: "Emergency Contact Phone", key: "emergencyPhone", width: 20 },

      { header: "Submitted At", key: "submittedAt", width: 22 },
    ];

    employees.forEach((emp) => {
      sheet.addRow({
        EmployeeId: emp.EmployeeId || "",
        fullName: emp.fullName || "",
        email: emp.email || "",
        phone: emp.phone || "",
        status: emp.status || "",
        role: emp.role || "",
        onboardingDate: emp.onboardingDate
          ? new Date(emp.onboardingDate).toLocaleDateString("en-GB")
          : "",
        dob: emp.dob
          ? new Date(emp.dob).toLocaleDateString("en-GB")
          : "",
        gender: emp.gender || "",
        nationality: emp.nationality || "",
        maritalStatus: emp.maritalStatus || "",

        qualification: emp.qualification || "",
        specialization: emp.specialization || "",
        college: emp.college || "",
        passingYear: emp.passingYear || "",

        ugCgpa: emp.ugCgpa ?? "",
        pgCgpa: emp.pgCgpa ?? "",

        isExperienced: emp.isExperienced ? "Yes" : "No",
        experienceYears: emp.experienceYears || "",
        previousOrg: emp.previousOrg || "",
        designation: emp.designation || "",

        emergencyName: emp.emergencyName || "",
        emergencyPhone: emp.emergencyPhone || "",

        submittedAt: emp.submittedAt
          ? new Date(emp.submittedAt).toLocaleDateString("en-GB")
          : "",
      });
    });

    // Header styling
    sheet.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Employee_Data.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Employee Excel Export Error:", err);
    res.status(500).json({ message: "Employee Excel export failed" });
  }
});


// Toggle Manager Status
router.put("/toggle-manager/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne({ _id: id, companyId: req.tenant.companyId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    employee.isManager = !employee.isManager;
    await employee.save();

    res.json({ 
      message: `Employee ${employee.isManager ? 'promoted to' : 'removed from'} manager role`,
      isManager: employee.isManager 
    });
  } catch (err) {
    console.error("Toggle Manager Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/update/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    let query = { companyId: req.tenant.companyId };
    
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      query.EmployeeId = { $regex: new RegExp(`^${id}$`, 'i') };
    }

    let updatedEmployee = await Employee.findOneAndUpdate(
      query,
      { $set: req.body },
      { new: true }
    );

    if (!updatedEmployee) {
      // Fallback: If updated by HR / User ID
      const userQuery = id.match(/^[0-9a-fA-F]{24}$/) 
        ? { _id: id, companyId: req.tenant.companyId }
        : { employeeId: { $regex: new RegExp(`^${id}$`, 'i') }, companyId: req.tenant.companyId };
        
      const updatedUser = await User.findOneAndUpdate(
        userQuery,
        { $set: req.body },
        { new: true }
      );
      if (updatedUser) {
        return res.json({ message: "Profile updated successfully", employee: updatedUser });
      }
      return res.status(404).json({ message: "Employee not found" });
    }

    // Sync with User record if email, profile fields, payroll, or statutory/bank details changed
    if (req.body.email || req.body.fullName || req.body.phone || req.body.payroll || req.body.panNumber || req.body.uanNumber || req.body.esiNumber || req.body.bankDetails) {
      const updateData = {};
      if (req.body.fullName) updateData['profile.firstName'] = updatedEmployee.fullName;
      if (req.body.phone) updateData['profile.phone'] = updatedEmployee.phone;
      if (req.body.designation || req.body.role) updateData['employment.designation'] = updatedEmployee.designation || updatedEmployee.role;
      if (req.body.payroll) updateData['payroll'] = updatedEmployee.payroll;
      if (req.body.panNumber !== undefined) updateData['panNumber'] = updatedEmployee.panNumber;
      if (req.body.uanNumber !== undefined) updateData['uanNumber'] = updatedEmployee.uanNumber;
      if (req.body.esiNumber !== undefined) updateData['esiNumber'] = updatedEmployee.esiNumber;
      if (req.body.bankDetails) updateData['bankDetails'] = updatedEmployee.bankDetails;

      await User.findOneAndUpdate(
        { email: { $regex: new RegExp(`^${updatedEmployee.email.trim()}$`, 'i') }, companyId: req.tenant.companyId },
        { $set: updateData }
      );
    }

    res.json({ message: "Employee updated successfully", employee: updatedEmployee });
  } catch (err) {
    console.error("Employee Update Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ============================
   ASSIGN EMPLOYEE TO MANAGER
============================ */
router.put("/assign-manager/:id", verifyTenant, async (req, res) => {
  try {
    const { managerId } = req.body;
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    employee.assignedManager = managerId;
    employee.managerApprovalStatus = "pending";
    await employee.save();

    res.json({ message: "Employee assigned to manager", employee });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ============================
   GET EMPLOYEES ASSIGNED TO MANAGER (INITIAL STATUS)
============================ */
router.get("/assigned-to/:managerId", verifyTenant, async (req, res) => {
  try {
    const employees = await Employee.find({ 
      assignedManager: req.params.managerId,
      status: "initial"
    });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ============================
   MANAGER REVIEW OF EMPLOYEE ONBOARDING
============================ */
router.put("/manager-review/:id", verifyTenant, async (req, res) => {
  try {
    const { status, remarks } = req.body; // status: 'approved' | 'rejected'
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    employee.managerApprovalStatus = status;
    employee.managerRemarks = remarks;
    await employee.save();

    res.json({ message: `Employee onboarding request ${status} by manager`, employee });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ============================
   SHORTLIST EMPLOYEE CANDIDATE & SEND MEETING INVITE
============================ */
router.put("/shortlist/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { emailSubject, emailBody, meetDate, meetTime, meetLink, meetNotes, role, department, designation } = req.body;
    
    let employee = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      employee = await Employee.findById(id);
    }
    if (!employee) {
      employee = await Employee.findOne({ EmployeeId: id });
    }

    if (!employee) return res.status(404).json({ message: "Employee not found" });

    // 1. Update status
    employee.status = "shortlist";
    employee.managerApprovalStatus = "shortlist";
    if (designation || role) employee.designation = designation || role;
    if (department) employee.department = department;
    await employee.save();

    // 1b. Create or Update Shortlist document
    let rescheduleBtnHtml = "";
    if (req.models.Shortlist) {
      try {
        const parsedMeetDate = meetDate ? new Date(meetDate) : new Date();
        const { generateRawToken, createRescheduleToken, buildRescheduleUrl, buildRescheduleButtonHtml } = require("../utilities/rescheduleHelper");
        const rawToken = generateRawToken();
        const shortlistRecord = await req.models.Shortlist.findOneAndUpdate(
          { companyId: req.tenant.companyId, candidateId: employee._id },
          {
            companyId: req.tenant.companyId,
            candidateId: employee._id,
            candidateType: "Employee",
            fullName: employee.fullName,
            email: employee.email,
            phone: employee.phone || "",
            role: employee.designation || employee.role || "",
            department: employee.department || "",
            qualification: employee.qualification || employee.degree || "",
            college: employee.college || "",
            location: employee.location || "",
            experienceYears: employee.experienceYears || "",
            isExperienced: Boolean(employee.isExperienced),
            currentCtc: employee.currentCtc || 0,
            expectedCtc: employee.expectedCtc || 0,
            noticePeriod: employee.noticePeriod || 0,
            linkedin: employee.linkedin || "",
            projectLinks: employee.projectLinks || [],
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
    const candRole = employee.designation || employee.role || "Job Applicant";
    if (!finalHtml) {
      const template = company?.settings?.communication?.shortlistInterviewTemplate;
      if (template) {
        finalHtml = template
          .replace(/{formattedName}/g, employee.fullName)
          .replace(/{role}/g, candRole)
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
            <p>Dear ${employee.fullName},</p>
            <p>Congratulations! We are pleased to inform you that your application for the <b>${candRole}</b> position has been shortlisted.</p>
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
        .replace(/{formattedName}/g, employee.fullName)
        .replace(/{role}/g, candRole)
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

    const subject = emailSubject || `Application Shortlisted - Interview Scheduled for ${candRole} at Softrate`;

    let emailSent = false;
    let emailError = null;

    if (employee.email) {
      try {
        await sendEmail({
          to: employee.email,
          subject,
          html: finalHtml,
          replyTo: req.tenant?.receivingEmail,
        });
        emailSent = true;
        console.log(`[DEBUG] Shortlist interview email sent to employee candidate: ${employee.email}`);
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
      employee,
      emailSent,
      emailError 
    });
  } catch (err) {
    console.error("Shortlist error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ============================
   REJECT EMPLOYEE CANDIDATE & SEND REJECTION EMAIL
============================ */
router.put("/reject/:id", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, emailSubject, emailBody } = req.body;
    
    let employee = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      employee = await Employee.findById(id);
    }
    if (!employee) {
      employee = await Employee.findOne({ EmployeeId: id });
    }

    if (!employee) return res.status(404).json({ message: "Employee not found" });

    // 1. Update status
    employee.status = "rejected";
    employee.managerApprovalStatus = "rejected";
    if (reason) employee.rejectionReason = reason;
    await employee.save();

    // 2. Fetch company settings for branding/signature
    const Company = await _getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    const customSignature = company?.settings?.communication?.emailSignatureUrl;

    const signatureHtml = getSignature(customSignature);

    // 3. Prepare email content
    let finalHtml = emailBody;
    const candRole = employee.designation || employee.role || "Job Applicant";
    const reasonText = reason ? reason.trim() : "";

    if (!finalHtml) {
      const template = company?.settings?.communication?.applicationRejectionTemplate;
      if (template) {
        finalHtml = template
          .replace(/{formattedName}/g, employee.fullName)
          .replace(/{role}/g, candRole)
          .replace(/{reason}/g, reasonText)
          .replace(/{logo}/g, '')
          .replace(/{signature}/g, signatureHtml);
      } else {
        finalHtml = `
          <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <p>Dear ${employee.fullName},</p>
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
        .replace(/{formattedName}/g, employee.fullName)
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

    if (employee.email) {
      try {
        // await sendEmail({
        //   to: employee.email,
        //   subject,
        //   html: finalHtml,
        //   replyTo: req.tenant?.receivingEmail,
        // });
        // emailSent = true;
        // console.log(`[DEBUG] Rejection email sent to candidate: ${employee.email}`);
      } catch (mailErr) {
        emailError = mailErr.message;
        console.error("Employee rejection email error:", mailErr);
      }
    }

    res.json({ 
      success: true, 
      message: "Application rejected successfully",
      employee,
      emailSent,
      emailError 
    });
  } catch (err) {
    console.error("Employee rejection error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
