const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const verifyTenant = require("../middleware/tenant.middleware");
const { getMasterConnection } = require("../db");
const { sendEmail } = require("../utilities/sendEmail");
const { getSignature } = require("../utilities/emailSignature");

const LOGO_URL =
  "https://raw.githubusercontent.com/yovelr31/Softrate-Workspace/refs/heads/main/logo/peoplesoft.png";

// Helper to access master Company collection
async function _getMasterCompany() {
  const masterConn = getMasterConnection();
  return (
    masterConn.models.Company ||
    masterConn.model("Company", require("../models/CompanyModel").schema)
  );
}

// Generate unique Employee ID
async function generateEmployeeId(companyId) {
  const Company = await _getMasterCompany();
  const company = await Company.findById(companyId);
  const prefix = company?.settings?.employeePrefix || "EMP-";
  let nextSeq = (company?.settings?.lastEmployeeSequence || 0) + 1;

  if (company) {
    company.settings = company.settings || {};
    company.settings.lastEmployeeSequence = nextSeq;
    await company.save();
  }

  const padded = String(nextSeq).padStart(4, "0");
  return `${prefix}${padded}`;
}

// Generate unique Intern ID
async function generateInternId(companyId) {
  const Company = await _getMasterCompany();
  const company = await Company.findById(companyId);
  const prefix = company?.settings?.internPrefix || "INT-";
  let nextSeq = (company?.settings?.lastInternSequence || 0) + 1;

  if (company) {
    company.settings = company.settings || {};
    company.settings.lastInternSequence = nextSeq;
    await company.save();
  }

  const padded = String(nextSeq).padStart(4, "0");
  return `${prefix}${padded}`;
}

/* ==============================================================================
   1. GET ALL SHORTLISTED CANDIDATES + METRICS SUMMARY
   ============================================================================== */
router.get("/", verifyTenant, async (req, res) => {
  try {
    const { Shortlist } = req.models;
    const {
      tab = "active", // active | scheduled | interviewed | onboarded | rejected | all
      type = "all", // all | Employee | Intern | Walkin
      search = "",
      page = 1,
      limit = 50
    } = req.query;

    const companyId = req.tenant.companyId;
    const filter = { companyId };

    // Tab filter
    if (tab === "active") {
      filter.status = { $in: ["scheduled", "interviewed"] };
    } else if (tab === "reschedule") {
      filter["rescheduleRequest.status"] = "pending";
    } else if (tab !== "all") {
      filter.status = tab;
    }

    // Type filter
    if (type !== "all") {
      filter.candidateType = type;
    }

    // Search filter
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { fullName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { role: { $regex: q, $options: "i" } },
        { department: { $regex: q, $options: "i" } }
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Shortlist.find(filter)
        .sort({ meetDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Shortlist.countDocuments(filter)
    ]);

    // Metrics calculations for the stats bar
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [todayCount, upcomingCount, interviewedCount, onboardedMonthCount, totalActiveCount, reschedulePendingCount] =
      await Promise.all([
        Shortlist.countDocuments({
          companyId,
          status: "scheduled",
          meetDate: { $gte: todayStart, $lte: todayEnd }
        }),
        Shortlist.countDocuments({
          companyId,
          status: "scheduled",
          meetDate: { $gt: todayEnd }
        }),
        Shortlist.countDocuments({
          companyId,
          status: "interviewed"
        }),
        Shortlist.countDocuments({
          companyId,
          status: "onboarded",
          onboardedAt: { $gte: monthStart }
        }),
        Shortlist.countDocuments({
          companyId,
          status: { $in: ["scheduled", "interviewed"] }
        }),
        Shortlist.countDocuments({
          companyId,
          "rescheduleRequest.status": "pending"
        })
      ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      metrics: {
        todayCount,
        upcomingCount,
        interviewedCount,
        onboardedMonthCount,
        totalActiveCount,
        reschedulePendingCount
      }
    });
  } catch (err) {
    console.error("GET /api/shortlist error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch shortlisted candidates", error: err.message });
  }
});

/* ==============================================================================
   2. CREATE OR UPSERT SHORTLIST ENTRY
   ============================================================================== */
router.post("/", verifyTenant, async (req, res) => {
  try {
    const { Shortlist } = req.models;
    const {
      candidateId,
      candidateType = "Employee",
      fullName,
      email,
      phone,
      role,
      department,
      qualification,
      college,
      location,
      experienceYears,
      isExperienced,
      currentCtc,
      expectedCtc,
      noticePeriod,
      linkedin,
      projectLinks,
      resumeUrl,
      meetDate,
      meetTime,
      meetLink,
      meetNotes,
      emailSubject,
      emailBody,
      remarkText
    } = req.body;

    if (!candidateId || !fullName || !email || !meetDate) {
      return res.status(400).json({
        success: false,
        message: "candidateId, fullName, email, and meetDate are required."
      });
    }

    const companyId = req.tenant.companyId;

    let parsedMeetDate = new Date(meetDate);
    if (isNaN(parsedMeetDate.getTime())) {
      parsedMeetDate = new Date();
    }

    const initialRemarks = [];
    if (remarkText && remarkText.trim()) {
      initialRemarks.push({
        text: remarkText.trim(),
        addedBy: req.user?.id || "",
        addedByName: req.user?.name || "HR Team",
        role: req.user?.role || "HR",
        createdAt: new Date()
      });
    }

    // Check if candidate already has a shortlist record
    let shortlistDoc = await Shortlist.findOne({
      companyId,
      candidateId
    });

    if (shortlistDoc) {
      // Update existing
      shortlistDoc.meetDate = parsedMeetDate;
      shortlistDoc.meetTime = meetTime || shortlistDoc.meetTime;
      shortlistDoc.meetLink = meetLink || shortlistDoc.meetLink;
      shortlistDoc.meetNotes = meetNotes || shortlistDoc.meetNotes;
      shortlistDoc.emailSubject = emailSubject || shortlistDoc.emailSubject;
      shortlistDoc.emailBody = emailBody || shortlistDoc.emailBody;
      shortlistDoc.status = "scheduled";
      if (role) shortlistDoc.role = role;
      if (department) shortlistDoc.department = department;

      if (remarkText && remarkText.trim()) {
        shortlistDoc.remarks.push({
          text: remarkText.trim(),
          addedBy: req.user?.id || "",
          addedByName: req.user?.name || "HR Team",
          role: req.user?.role || "HR",
          createdAt: new Date()
        });
      }

      await shortlistDoc.save();
    } else {
      // Create new
      shortlistDoc = await Shortlist.create({
        companyId,
        candidateId,
        candidateType,
        fullName,
        email,
        phone,
        role,
        department,
        qualification,
        college,
        location,
        experienceYears,
        isExperienced,
        currentCtc,
        expectedCtc,
        noticePeriod,
        linkedin,
        projectLinks: Array.isArray(projectLinks) ? projectLinks : [],
        resumeUrl,
        meetDate: parsedMeetDate,
        meetTime: meetTime || "11:00 AM",
        meetLink: meetLink || "",
        meetNotes: meetNotes || "",
        emailSubject: emailSubject || "",
        emailBody: emailBody || "",
        remarks: initialRemarks,
        status: "scheduled",
        scheduledBy: {
          userId: req.user?.id || "",
          name: req.user?.name || "HR Team"
        },
        scheduledAt: new Date()
      });
    }

    return res.status(201).json({
      success: true,
      message: "Candidate shortlisted and interview scheduled successfully",
      data: shortlistDoc
    });
  } catch (err) {
    console.error("POST /api/shortlist error:", err);
    return res.status(500).json({ success: false, message: "Failed to create shortlist entry", error: err.message });
  }
});

/* ==============================================================================
   3. GET SINGLE SHORTLIST ENTRY
   ============================================================================== */
router.get("/:id", verifyTenant, async (req, res) => {
  try {
    const { Shortlist } = req.models;
    const doc = await Shortlist.findOne({
      _id: req.params.id,
      companyId: req.tenant.companyId
    }).lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found" });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("GET /api/shortlist/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

/* ==============================================================================
   4. ADD REMARK / INTERVIEW FEEDBACK NOTE
   ============================================================================== */
router.post("/:id/remarks", verifyTenant, async (req, res) => {
  try {
    const { Shortlist } = req.models;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Remark text is required." });
    }

    const doc = await Shortlist.findOne({
      _id: req.params.id,
      companyId: req.tenant.companyId
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found." });
    }

    const newRemark = {
      text: text.trim(),
      addedBy: req.user?.id || "",
      addedByName: req.user?.name || "HR Team",
      role: req.user?.role || "HR",
      createdAt: new Date()
    };

    doc.remarks.push(newRemark);
    await doc.save();

    return res.json({
      success: true,
      message: "Remark added successfully",
      data: doc.remarks
    });
  } catch (err) {
    console.error("POST /api/shortlist/:id/remarks error:", err);
    return res.status(500).json({ success: false, message: "Failed to add remark", error: err.message });
  }
});

/* ==============================================================================
   4b. UPDATE STRUCTURED INTERVIEW EVALUATION & ASSESSMENT
   ============================================================================== */
router.put("/:id/evaluation", verifyTenant, async (req, res) => {
  try {
    const { Shortlist } = req.models;
    const {
      longTermGoal = "",
      expectationsFromCompany = "",
      reasonNotSelectedPreviously = "",
      redFlags = "",
      greenFlags = "",
      bond = "",
      startupIdeasNext2Years = "",
      locationAndRelocation = ""
    } = req.body;

    const doc = await Shortlist.findOne({
      _id: req.params.id,
      companyId: req.tenant.companyId
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found." });
    }

    doc.interviewEvaluation = {
      longTermGoal: (longTermGoal || "").trim(),
      expectationsFromCompany: (expectationsFromCompany || "").trim(),
      reasonNotSelectedPreviously: (reasonNotSelectedPreviously || "").trim(),
      redFlags: (redFlags || "").trim(),
      greenFlags: (greenFlags || "").trim(),
      bond: bond || "",
      startupIdeasNext2Years: startupIdeasNext2Years || "",
      locationAndRelocation: (locationAndRelocation || "").trim(),
      evaluatedBy: req.user?.id || "",
      evaluatedByName: req.user?.name || "HR Team",
      evaluatedAt: new Date()
    };

    // Auto-record an informative remark on the timeline
    doc.remarks.push({
      text: "Detailed Interview Assessment & Evaluation updated.",
      addedBy: req.user?.id || "",
      addedByName: req.user?.name || "HR Team",
      role: req.user?.role || "HR",
      createdAt: new Date()
    });

    await doc.save();

    return res.json({
      success: true,
      message: "Interview evaluation saved successfully",
      data: doc
    });
  } catch (err) {
    console.error("PUT /api/shortlist/:id/evaluation error:", err);
    return res.status(500).json({ success: false, message: "Failed to save evaluation", error: err.message });
  }
});

/* ==============================================================================
   5. RESCHEDULE INTERVIEW & OPTIONALLY RE-SEND EMAIL
   ============================================================================== */
router.patch("/:id/schedule", verifyTenant, async (req, res) => {
  try {
    const { Shortlist } = req.models;
    const { meetDate, meetTime, meetLink, meetNotes, emailSubject, emailBody, sendNotification = true } = req.body;

    if (!meetDate) {
      return res.status(400).json({ success: false, message: "Meeting date is required." });
    }

    const doc = await Shortlist.findOne({
      _id: req.params.id,
      companyId: req.tenant.companyId
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found." });
    }

    doc.meetDate = new Date(meetDate);
    if (meetTime) doc.meetTime = meetTime;
    if (meetLink) doc.meetLink = meetLink;
    if (meetNotes !== undefined) doc.meetNotes = meetNotes;
    if (emailSubject) doc.emailSubject = emailSubject;
    if (emailBody) doc.emailBody = emailBody;
    doc.status = "scheduled";

    // Auto-record a remark for the reschedule
    doc.remarks.push({
      text: `Interview rescheduled to ${doc.meetDate.toLocaleDateString()} at ${doc.meetTime}.`,
      addedBy: req.user?.id || "",
      addedByName: req.user?.name || "HR Team",
      role: "System",
      createdAt: new Date()
    });

    await doc.save();

    // Send email notification if requested
    let mailSent = false;
    if (sendNotification && doc.email && emailBody) {
      try {
        const Company = await _getMasterCompany();
        const company = await Company.findById(req.tenant.companyId);
        const smtpHost = company?.settings?.communication?.smtpHost;
        const smtpUser = company?.settings?.communication?.smtpUser;
        const smtpPass = company?.settings?.communication?.smtpPass;
        const smtpPort = company?.settings?.communication?.smtpPort;
        const fromEmail = company?.settings?.communication?.fromEmail || "careers@softrateglobal.com";
        const fromName = company?.settings?.communication?.fromName || "HR Team";

        await sendEmail({
          to: doc.email,
          subject: emailSubject || `Interview Rescheduled - ${doc.role || "Job Application"} | Softrate`,
          html: emailBody,
          companyCode: company?.companyCode,
          smtpConfig: smtpHost ? { host: smtpHost, user: smtpUser, pass: smtpPass, port: smtpPort, fromEmail, fromName } : null
        });
        mailSent = true;
      } catch (mailErr) {
        console.error("Reschedule email error:", mailErr);
      }
    }

    return res.json({
      success: true,
      message: mailSent
        ? "Interview rescheduled and update email sent successfully!"
        : "Interview schedule updated successfully!",
      data: doc
    });
  } catch (err) {
    console.error("PATCH /api/shortlist/:id/schedule error:", err);
    return res.status(500).json({ success: false, message: "Failed to reschedule interview", error: err.message });
  }
});

/* ==============================================================================
   6. UPDATE PIPELINE STATUS (e.g. mark interviewed)
   ============================================================================== */
router.patch("/:id/status", verifyTenant, async (req, res) => {
  try {
    const { Shortlist } = req.models;
    const { status, remark } = req.body;

    if (!status || !["scheduled", "interviewed", "cancelled"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value." });
    }

    const doc = await Shortlist.findOne({
      _id: req.params.id,
      companyId: req.tenant.companyId
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found." });
    }

    doc.status = status;
    if (status === "interviewed") {
      doc.interviewedAt = new Date();
    }

    if (remark && remark.trim()) {
      doc.remarks.push({
        text: remark.trim(),
        addedBy: req.user?.id || "",
        addedByName: req.user?.name || "HR Team",
        role: req.user?.role || "HR",
        createdAt: new Date()
      });
    }

    await doc.save();

    return res.json({
      success: true,
      message: `Status updated to ${status}`,
      data: doc
    });
  } catch (err) {
    console.error("PATCH /api/shortlist/:id/status error:", err);
    return res.status(500).json({ success: false, message: "Failed to update status", error: err.message });
  }
});

/* ==============================================================================
   7. ONBOARD CANDIDATE DIRECTLY FROM SHORTLIST
   ============================================================================== */
router.post("/:id/onboard", verifyTenant, async (req, res) => {
  try {
    const { Shortlist, Employee, Intern, User, LeaveCounter } = req.models;
    const { onboardingDate = new Date(), webAccess = true, remoteAccess = false } = req.body;

    const shortlistDoc = await Shortlist.findOne({
      _id: req.params.id,
      companyId: req.tenant.companyId
    });

    if (!shortlistDoc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found." });
    }

    const companyId = req.tenant.companyId;
    const isIntern = shortlistDoc.candidateType === "Intern";
    let assignedId = "";

    const Company = await _getMasterCompany();
    const company = await Company.findById(companyId);

    if (isIntern) {
      // ── Onboard Intern ───────────────────────────────────────────────────────
      const intern = await Intern.findById(shortlistDoc.candidateId);
      if (!intern) {
        return res.status(404).json({ success: false, message: "Associated Intern profile not found." });
      }

      assignedId = await generateInternId(companyId);
      intern.internid = assignedId;
      intern.status = "approved";
      intern.onboardingDate = onboardingDate;
      await intern.save();

      // Synchronize User record
      await User.findOneAndUpdate(
        { email: { $regex: new RegExp(`^${intern.email.trim()}$`, "i") }, companyId },
        {
          "employment.status": "approved",
          "employment.joinedAt": onboardingDate,
          "system.onboardingStatus": "completed",
          internid: assignedId
        }
      );

      // Initialize Leave Counters
      const startDate = new Date(onboardingDate);
      let leavePolicies = company?.leavePolicies || [
        { name: "Casual Leave", allowance: 6, frequency: "annual", appliesTo: "both" },
        { name: "Sick Leave", allowance: 6, frequency: "annual", appliesTo: "both" }
      ];

      const records = [];
      for (const p of leavePolicies) {
        if (p.appliesTo === "both" || p.appliesTo === "intern") {
          const nextResetDate = new Date(startDate);
          if (p.frequency === "monthly") {
            nextResetDate.setMonth(startDate.getMonth() + 1);
          } else {
            nextResetDate.setFullYear(startDate.getFullYear() + 1);
          }
          records.push({
            companyId,
            employeeId: assignedId,
            leaveType: p.name,
            totalAllowed: p.allowance,
            used: 0,
            balance: p.allowance,
            cycleStartDate: startDate,
            nextResetDate
          });
        }
      }
      if (records.length > 0 && LeaveCounter) {
        try {
          await LeaveCounter.insertMany(records, { ordered: false });
        } catch (e) {}
      }

      // Send Welcome Email
      try {
        const template = company?.settings?.communication?.onboardingTemplateIntern;
        const customSignature = company?.settings?.communication?.emailSignatureUrl;
        const customLogo = company?.settings?.communication?.emailLogoUrl;

        const signatureHtml = getSignature(customSignature);

        const logoHtml = customLogo
          ? `<div style="margin-bottom: 20px;"><img src="${customLogo}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`
          : `<div style="margin-bottom: 20px;"><img src="${LOGO_URL}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`;

        let htmlContent = template
          ? template
              .replace(/{formattedName}/g, intern.fullName)
              .replace(/{internId}/g, assignedId)
              .replace(/{onboardingDate}/g, new Date(onboardingDate).toLocaleDateString())
              .replace(/{signature}/g, signatureHtml)
              .replace(/{logo}/g, logoHtml)
          : `<p>Hi ${intern.fullName},</p><p>Congratulations! Your internship onboarding has been approved. Your Intern ID is <b>${assignedId}</b>.</p>${signatureHtml}`;

        await sendEmail({
          to: intern.email,
          subject: `Welcome to Softrate! Internship Approved (${assignedId})`,
          html: htmlContent,
          companyCode: company?.companyCode
        });
      } catch (mailErr) {
        console.error("Onboarding email error:", mailErr);
      }
    } else {
      // ── Onboard Employee ─────────────────────────────────────────────────────
      const employee = await Employee.findById(shortlistDoc.candidateId);
      if (!employee) {
        return res.status(404).json({ success: false, message: "Associated Employee profile not found." });
      }

      assignedId = await generateEmployeeId(companyId);
      employee.EmployeeId = assignedId;
      employee.status = "approved";
      employee.onboardingDate = onboardingDate;
      employee.webAccess = Boolean(webAccess);
      employee.remoteAccess = Boolean(remoteAccess);
      await employee.save();

      // Synchronize User record
      await User.findOneAndUpdate(
        { email: { $regex: new RegExp(`^${employee.email.trim()}$`, "i") }, companyId },
        {
          "employment.status": "approved",
          "employment.joinedAt": onboardingDate,
          "system.onboardingStatus": "completed",
          EmployeeId: assignedId
        }
      );

      // Initialize Leave Counters
      const startDate = new Date(onboardingDate);
      let leavePolicies = company?.leavePolicies || [
        { name: "Casual Leave", allowance: 12, frequency: "annual", appliesTo: "both" },
        { name: "Sick Leave", allowance: 12, frequency: "annual", appliesTo: "both" }
      ];

      const records = [];
      for (const p of leavePolicies) {
        if (p.appliesTo === "both" || p.appliesTo === "employee") {
          const nextResetDate = new Date(startDate);
          if (p.frequency === "monthly") {
            nextResetDate.setMonth(startDate.getMonth() + 1);
          } else {
            nextResetDate.setFullYear(startDate.getFullYear() + 1);
          }
          records.push({
            companyId,
            employeeId: assignedId,
            leaveType: p.name,
            totalAllowed: p.allowance,
            used: 0,
            balance: p.allowance,
            cycleStartDate: startDate,
            nextResetDate
          });
        }
      }
      if (records.length > 0 && LeaveCounter) {
        try {
          await LeaveCounter.insertMany(records, { ordered: false });
        } catch (e) {}
      }

      // Send Welcome Email
      try {
        const template = company?.settings?.communication?.onboardingTemplateEmployee;
        const customSignature = company?.settings?.communication?.emailSignatureUrl;
        const customLogo = company?.settings?.communication?.emailLogoUrl;

        const signatureHtml = getSignature(customSignature);

        const logoHtml = customLogo
          ? `<div style="margin-bottom: 20px;"><img src="${customLogo}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`
          : `<div style="margin-bottom: 20px;"><img src="${LOGO_URL}" alt="Company Logo" style="max-height: 60px; display: block;" /></div>`;

        let htmlContent = template
          ? template
              .replace(/{formattedName}/g, employee.fullName)
              .replace(/{employeeId}/g, assignedId)
              .replace(/{onboardingDate}/g, new Date(onboardingDate).toLocaleDateString())
              .replace(/{signature}/g, signatureHtml)
              .replace(/{logo}/g, logoHtml)
          : `<p>Hi ${employee.fullName},</p><p>Congratulations! Your employment profile has been approved. Your Employee ID is <b>${assignedId}</b>.</p>${signatureHtml}`;

        await sendEmail({
          to: employee.email,
          subject: `Welcome to Softrate! Employment Approved (${assignedId})`,
          html: htmlContent,
          companyCode: company?.companyCode
        });
      } catch (mailErr) {
        console.error("Onboarding email error:", mailErr);
      }
    }

    // Mark Shortlist Doc as Onboarded
    shortlistDoc.status = "onboarded";
    shortlistDoc.onboardedAt = new Date();
    shortlistDoc.remarks.push({
      text: `Candidate successfully approved and onboarded with ID ${assignedId}.`,
      addedBy: req.user?.id || "",
      addedByName: req.user?.name || "HR Team",
      role: "System",
      createdAt: new Date()
    });

    await shortlistDoc.save();

    return res.json({
      success: true,
      message: `${shortlistDoc.candidateType} ${applicantName} onboarded successfully with ID ${assignedId}!`,
      assignedId,
      data: shortlistDoc
    });
  } catch (err) {
    console.error("POST /api/shortlist/:id/onboard error:", err);
    return res.status(500).json({ success: false, message: "Failed to onboard candidate", error: err.message });
  }
});

/* ==============================================================================
   8. REJECT CANDIDATE DIRECTLY FROM SHORTLIST
   ============================================================================== */
router.post("/:id/reject", verifyTenant, async (req, res) => {
  try {
    const { Shortlist, Employee, Intern } = req.models;
    const { reason = "Profile not matching requirements", emailSubject, emailBody } = req.body;

    const shortlistDoc = await Shortlist.findOne({
      _id: req.params.id,
      companyId: req.tenant.companyId
    });

    if (!shortlistDoc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found." });
    }

    const isIntern = shortlistDoc.candidateType === "Intern";

    // Update applicant collection status
    if (isIntern && Intern) {
      await Intern.findByIdAndUpdate(shortlistDoc.candidateId, {
        status: "rejected",
        managerApprovalStatus: "rejected"
      });
    } else if (Employee) {
      await Employee.findByIdAndUpdate(shortlistDoc.candidateId, {
        status: "rejected",
        managerApprovalStatus: "rejected"
      });
    }

    // Update Shortlist document
    shortlistDoc.status = "rejected";
    shortlistDoc.rejectedAt = new Date();
    shortlistDoc.rejectionReason = reason;
    shortlistDoc.remarks.push({
      text: `Candidate rejected: ${reason}`,
      addedBy: req.user?.id || "",
      addedByName: req.user?.name || "HR Team",
      role: "System",
      createdAt: new Date()
    });

    await shortlistDoc.save();

    // Send rejection email if content exists (Temporarily commented out)
    if (shortlistDoc.email && emailBody) {
      try {
        // const Company = await _getMasterCompany();
        // const company = await Company.findById(req.tenant.companyId);
        // await sendEmail({
        //   to: shortlistDoc.email,
        //   subject: emailSubject || `Update on your application for ${shortlistDoc.role || "Job Role"} | Softrate`,
        //   html: emailBody,
        //   companyCode: company?.companyCode
        // });
      } catch (mailErr) {
        console.error("Rejection email error:", mailErr);
      }
    }

    return res.json({
      success: true,
      message: `Candidate ${shortlistDoc.fullName} marked as rejected.`,
      data: shortlistDoc
    });
  } catch (err) {
    console.error("POST /api/shortlist/:id/reject error:", err);
    return res.status(500).json({ success: false, message: "Failed to reject candidate", error: err.message });
  }
});

/* ==============================================================================
   7. PUBLIC RESCHEDULE ENDPOINTS (ACCESSED VIA EMAIL TOKEN)
   ============================================================================== */
const {
  verifyRescheduleToken,
  buildRescheduleAcceptedEmailHtml,
  buildRescheduleDeclinedEmailHtml
} = require("../utilities/rescheduleHelper");
const { getTenantConnection, waitForConnection } = require("../db");
const { getModelsForConnection } = require("../utilities/modelLoader");

router.get("/public/reschedule/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = verifyRescheduleToken(token);
    if (!decoded || !decoded.shortlistId || !decoded.companyId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "This interview reschedule link is invalid or has expired."
      });
    }

    const Company = await _getMasterCompany();
    const company = await Company.findById(decoded.companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found." });
    }

    const tenantDbName = company.dbName || company.databaseName || `hrdb_${(company.companyCode || "").toLowerCase()}`;
    const tenantConn = getTenantConnection(tenantDbName);
    if (tenantConn.readyState !== 1) await waitForConnection(tenantConn);
    const models = getModelsForConnection(tenantConn);
    const Shortlist = models.Shortlist;
    if (!Shortlist) {
      return res.status(500).json({ success: false, message: "Shortlist service not available." });
    }

    const shortlistDoc = await Shortlist.findById(decoded.shortlistId);
    if (!shortlistDoc) {
      return res.status(404).json({ success: false, message: "Interview record not found." });
    }

    // Verify rawToken match if present
    if (shortlistDoc.rescheduleToken && decoded.token && shortlistDoc.rescheduleToken !== decoded.token) {
      return res.status(400).json({
        success: false,
        code: "SUPERSEDED_TOKEN",
        message: "This reschedule link has been superseded by a more recent interview update."
      });
    }

    const rescheduleReq = shortlistDoc.rescheduleRequest || { status: "none" };
    const rescheduleCount = shortlistDoc.rescheduleCount || 0;
    const canReschedule = (rescheduleCount === 0 && rescheduleReq.status !== "pending" && shortlistDoc.status === "scheduled");

    return res.json({
      success: true,
      candidate: {
        id: shortlistDoc._id,
        fullName: shortlistDoc.fullName,
        role: shortlistDoc.role,
        department: shortlistDoc.department,
        meetDate: shortlistDoc.meetDate,
        meetTime: shortlistDoc.meetTime,
        companyName: company.name,
        companyCode: company.companyCode,
        status: shortlistDoc.status
      },
      reschedule: {
        status: rescheduleReq.status || "none",
        rescheduleCount,
        canReschedule,
        requestedDate: rescheduleReq.requestedDate,
        requestedTime: rescheduleReq.requestedTime,
        reason: rescheduleReq.reason,
        adminNotes: rescheduleReq.adminNotes,
        requestedAt: rescheduleReq.requestedAt,
        respondedAt: rescheduleReq.respondedAt
      }
    });
  } catch (err) {
    console.error("GET /api/shortlist/public/reschedule/:token error:", err);
    return res.status(500).json({ success: false, message: "Failed to load reschedule details", error: err.message });
  }
});

router.post("/public/reschedule/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { preferredDate, preferredTime, reason } = req.body;

    if (!preferredDate || !preferredTime) {
      return res.status(400).json({
        success: false,
        message: "Preferred date and preferred time are required."
      });
    }

    const reqDate = new Date(preferredDate);
    if (isNaN(reqDate.getTime())) {
      return res.status(400).json({ success: false, message: "Please provide a valid date." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (reqDate <= today) {
      return res.status(400).json({ success: false, message: "Preferred date must be a future date." });
    }

    const decoded = verifyRescheduleToken(token);
    if (!decoded || !decoded.shortlistId || !decoded.companyId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "This interview reschedule link is invalid or has expired."
      });
    }

    const Company = await _getMasterCompany();
    const company = await Company.findById(decoded.companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found." });
    }

    const tenantDbName = company.dbName || company.databaseName || `hrdb_${(company.companyCode || "").toLowerCase()}`;
    const tenantConn = getTenantConnection(tenantDbName);
    if (tenantConn.readyState !== 1) await waitForConnection(tenantConn);
    const models = getModelsForConnection(tenantConn);
    const Shortlist = models.Shortlist;
    if (!Shortlist) {
      return res.status(500).json({ success: false, message: "Shortlist service not available." });
    }

    const shortlistDoc = await Shortlist.findById(decoded.shortlistId);
    if (!shortlistDoc) {
      return res.status(404).json({ success: false, message: "Interview record not found." });
    }

    // Enforce 1 reschedule limit policy
    const rescheduleCount = shortlistDoc.rescheduleCount || 0;
    const currentReqStatus = shortlistDoc.rescheduleRequest?.status || "none";
    if (rescheduleCount > 0 || currentReqStatus === "pending") {
      return res.status(400).json({
        success: false,
        code: "LIMIT_REACHED",
        message: currentReqStatus === "pending"
          ? "You already have a pending reschedule request under review by the HR team."
          : "Only one reschedule request is permitted per candidate."
      });
    }

    // Save reschedule request
    shortlistDoc.rescheduleRequest = {
      status: "pending",
      requestedDate: reqDate,
      requestedTime: preferredTime.trim(),
      reason: (reason || "").trim(),
      requestedAt: new Date()
    };

    const formattedDateStr = reqDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    shortlistDoc.remarks.push({
      text: `Candidate requested to reschedule interview to ${formattedDateStr} at ${preferredTime.trim()}.${reason ? ` Reason: ${reason.trim()}` : ""}`,
      addedByName: shortlistDoc.fullName,
      role: "Candidate",
      createdAt: new Date()
    });

    await shortlistDoc.save();

    return res.json({
      success: true,
      message: "Your reschedule request has been submitted successfully. The HR team will review it and send an update to your email.",
      data: {
        requestedDate: reqDate,
        requestedTime: preferredTime.trim(),
        status: "pending"
      }
    });
  } catch (err) {
    console.error("POST /api/shortlist/public/reschedule/:token error:", err);
    return res.status(500).json({ success: false, message: "Failed to submit reschedule request", error: err.message });
  }
});

/* ==============================================================================
   8. HR ACTION: RESPOND TO RESCHEDULE REQUEST (ACCEPT / DECLINE)
   ============================================================================== */
router.post("/:id/reschedule-respond", verifyTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, meetDate, meetTime, meetLink, meetNotes, emailSubject, emailBody, adminNotes } = req.body;

    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({ success: false, message: "Action must be 'accept' or 'decline'." });
    }

    const { Shortlist, Intern, Employee } = req.models;
    const shortlistDoc = await Shortlist.findOne({
      _id: id,
      companyId: req.tenant.companyId
    });

    if (!shortlistDoc) {
      return res.status(404).json({ success: false, message: "Shortlist record not found." });
    }

    const Company = await _getMasterCompany();
    const company = await Company.findById(req.tenant.companyId);
    const signatureHtml = getSignature(company?.settings?.communication?.emailSignatureUrl);

    if (action === "accept") {
      if (!meetDate || !meetTime) {
        return res.status(400).json({ success: false, message: "Date and Time are required to accept reschedule." });
      }

      const parsedDate = new Date(meetDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ success: false, message: "Please provide a valid date." });
      }

      const finalMeetLink = meetLink !== undefined ? meetLink : shortlistDoc.meetLink;
      const finalMeetNotes = meetNotes !== undefined ? meetNotes : shortlistDoc.meetNotes;

      // Update Shortlist document
      shortlistDoc.meetDate = parsedDate;
      shortlistDoc.meetTime = meetTime.trim();
      shortlistDoc.meetLink = (finalMeetLink || "").trim();
      shortlistDoc.meetNotes = (finalMeetNotes || "").trim();
      shortlistDoc.status = "scheduled";
      shortlistDoc.rescheduleCount = (shortlistDoc.rescheduleCount || 0) + 1;
      shortlistDoc.rescheduleRequest = {
        ...(shortlistDoc.rescheduleRequest || {}),
        status: "accepted",
        respondedBy: req.user?.name || "HR Team",
        respondedAt: new Date(),
        adminNotes: (adminNotes || "").trim()
      };

      const formattedDateStr = parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      shortlistDoc.remarks.push({
        text: `Reschedule request accepted by ${req.user?.name || 'HR Team'}. Confirmed interview for ${formattedDateStr} at ${meetTime.trim()}.`,
        addedBy: req.user?.id || "",
        addedByName: req.user?.name || "HR Team",
        role: "HR",
        createdAt: new Date()
      });

      await shortlistDoc.save();

      // Sync candidate model if present
      if (shortlistDoc.candidateType === "Intern" && Intern) {
        await Intern.findByIdAndUpdate(shortlistDoc.candidateId, { status: "shortlist" });
      } else if (Employee) {
        await Employee.findByIdAndUpdate(shortlistDoc.candidateId, { status: "shortlist" });
      }

      // Send confirmation email
      if (shortlistDoc.email) {
        try {
          const mailHtml = emailBody || buildRescheduleAcceptedEmailHtml({
            fullName: shortlistDoc.fullName,
            role: shortlistDoc.role,
            newDate: formattedDateStr,
            newTime: meetTime.trim(),
            meetLink: shortlistDoc.meetLink,
            meetNotes: shortlistDoc.meetNotes,
            signatureHtml
          });

          await sendEmail({
            to: shortlistDoc.email,
            subject: emailSubject || `Interview Rescheduled & Confirmed - ${shortlistDoc.role || 'Position'} | ${company?.name || 'Softrate'}`,
            html: mailHtml,
            companyCode: company?.companyCode
          });
        } catch (mailErr) {
          console.error("Reschedule confirmation email error:", mailErr);
        }
      }

      return res.json({
        success: true,
        message: `Reschedule accepted and confirmed for ${shortlistDoc.fullName} on ${formattedDateStr} at ${meetTime}.`,
        data: shortlistDoc
      });
    } else {
      // Decline
      shortlistDoc.rescheduleCount = (shortlistDoc.rescheduleCount || 0) + 1;
      shortlistDoc.rescheduleRequest = {
        ...(shortlistDoc.rescheduleRequest || {}),
        status: "declined",
        respondedBy: req.user?.name || "HR Team",
        respondedAt: new Date(),
        adminNotes: (adminNotes || "").trim()
      };

      shortlistDoc.remarks.push({
        text: `Reschedule request declined by ${req.user?.name || 'HR Team'}.${adminNotes ? ` Note: ${adminNotes.trim()}` : ''} Original schedule retained.`,
        addedBy: req.user?.id || "",
        addedByName: req.user?.name || "HR Team",
        role: "HR",
        createdAt: new Date()
      });

      await shortlistDoc.save();

      // Send decline notification email
      if (shortlistDoc.email) {
        try {
          const formattedCurrentDate = new Date(shortlistDoc.meetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const mailHtml = emailBody || buildRescheduleDeclinedEmailHtml({
            fullName: shortlistDoc.fullName,
            role: shortlistDoc.role,
            currentDate: formattedCurrentDate,
            currentTime: shortlistDoc.meetTime,
            meetLink: shortlistDoc.meetLink,
            adminNotes: adminNotes || "",
            signatureHtml
          });

          await sendEmail({
            to: shortlistDoc.email,
            subject: emailSubject || `Interview Schedule Confirmed - ${shortlistDoc.role || 'Position'} | ${company?.name || 'Softrate'}`,
            html: mailHtml,
            companyCode: company?.companyCode
          });
        } catch (mailErr) {
          console.error("Reschedule decline email error:", mailErr);
        }
      }

      return res.json({
        success: true,
        message: `Reschedule request declined. Original interview schedule retained for ${shortlistDoc.fullName}.`,
        data: shortlistDoc
      });
    }
  } catch (err) {
    console.error("POST /api/shortlist/:id/reschedule-respond error:", err);
    return res.status(500).json({ success: false, message: "Failed to respond to reschedule request", error: err.message });
  }
});

module.exports = router;
