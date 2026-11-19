const path = require('path');
const fs = require('fs');
const Intern = require('../models/Intern');
const WalkinDrive = require('../models/WalkinDrive');
const { sendEmail } = require('../utilities/sendEmail');

/**
 * POST /api/public/walkin-apply
 * Handles a candidate's application to a Walk-in Drive.
 * - Saves application to Intern collection (with isWalkinDrive: true)
 * - Sends JD PDF to candidate's email
 * - Returns the WhatsApp group link for the mobile app to open
 */
exports.applyToWalkinDrive = async (req, res) => {
  try {
    const {
      walkinDriveId,
      fullName,
      email,
      college,
      year,
      department,
      role,
      contact,
      emergencyContact,
      linkedin,
      applicationType,
      resume,
      projectLinks: projectLinksRaw,
      degree,
      qualification,
      location,
      gender,
      maritalStatus,
      dob,
      countryCode,
      jobId,
      assessmentAnswers: assessmentAnswersRaw
    } = req.body;

    if (!walkinDriveId) {
      return res.status(400).json({ message: 'walkinDriveId is required.' });
    }
    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name and email are required.' });
    }

    // 1. Fetch the drive to get details
    const WalkinDriveModel = req.models && req.models.WalkinDrive ? req.models.WalkinDrive : WalkinDrive;
    const drive = await WalkinDriveModel.findById(walkinDriveId);
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found.' });
    }

    const isSeasonal = drive.driveType === 'seasonal';

    // 2. Check for duplicate application
    const InternModel = req.models && req.models.Intern ? req.models.Intern : Intern;
    const existing = await InternModel.findOne({
      $or: [
        { walkinDriveId, email, companyId: req.tenant.companyId },
        { seasonalDriveId: walkinDriveId, email, companyId: req.tenant.companyId }
      ]
    });
    if (existing) {
      return res.status(400).json({ message: `You have already applied to this ${isSeasonal ? 'Seasonal Internship' : 'Walk-in Drive'}.` });
    }

    // 3. Parse project links
    let projectLinks = [];
    try {
      if (projectLinksRaw) {
        if (Array.isArray(projectLinksRaw)) {
          projectLinks = projectLinksRaw.filter(l => l && typeof l === 'string' && l.trim()).slice(0, 5);
        } else if (typeof projectLinksRaw === 'string') {
          const parsed = JSON.parse(projectLinksRaw);
          if (Array.isArray(parsed)) {
            projectLinks = parsed.filter(l => l && typeof l === 'string' && l.trim()).slice(0, 5);
          }
        }
      }
    } catch (_) { projectLinks = []; }

    // Parse assessment answers
    let assessmentAnswers = {};
    try {
      if (assessmentAnswersRaw) {
        assessmentAnswers = typeof assessmentAnswersRaw === 'string'
          ? JSON.parse(assessmentAnswersRaw)
          : assessmentAnswersRaw;
      }
    } catch (_) { assessmentAnswers = {}; }

    // 4. Save the application
    const safeYear = (year && year.trim()) ? year.trim() : (req.body.passingYear || req.body.graduationYear || '1st Year');
    const safeCollege = (college && college.trim()) ? college.trim() : 'Candidate College';
    const safeDepartment = (department && department.trim()) ? department.trim() : 'General';
    const safeEmergencyContact = (emergencyContact && emergencyContact.trim()) ? emergencyContact.trim() : (contact || phone || '0000000000');
    const safeLinkedin = (linkedin && linkedin.trim()) ? linkedin.trim() : 'https://linkedin.com';

    let dobDate = null;
    if (dob) {
      if (typeof dob === 'string' && dob.includes('/')) {
        const parts = dob.trim().split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parseInt(parts[2], 10);
          const customDate = new Date(Date.UTC(y, m, d));
          if (!isNaN(customDate.getTime())) {
            dobDate = customDate;
          }
        }
      }
      if (!dobDate) {
        const parsed = new Date(dob);
        if (!isNaN(parsed.getTime())) {
          dobDate = parsed;
        }
      }
    }

    const application = new InternModel({
      walkinDriveId: isSeasonal ? null : walkinDriveId,
      isWalkinDrive: !isSeasonal,
      seasonalDriveId: isSeasonal ? drive._id : null,
      isSeasonalInternship: isSeasonal,
      seasonalTitle: isSeasonal ? (drive.title || 'Seasonal Internship') : '',
      companyId: req.tenant.companyId,
      fullName,
      email,
      college: safeCollege,
      year: safeYear,
      department: safeDepartment,
      role: role || 'Intern',
      contact: contact || phone,
      emergencyContact: safeEmergencyContact,
      linkedin: safeLinkedin,
      applicationType: isSeasonal ? 'Internship' : (applicationType || 'Walk-in Drive'),
      degree: degree || qualification || '',
      location: location || '',
      gender: gender || '',
      maritalStatus: maritalStatus || 'Single',
      dob: dobDate,
      countryCode: countryCode || '+91',
      jobId: jobId || '',
      assessmentAnswers,
      // DO NOT SAVE RESUME IN DATABASE
      projectLinks,
      status: 'initial'
    });
    await application.save();

    // 5. Send Full Application to HR Email
    try {
      if (req.tenant && req.tenant.receivingEmail) {
        const { formatApplicationEmailHtml } = require('../utilities/applicationEmailTemplate');
        const emailHtml = formatApplicationEmailHtml({
          applicationType: isSeasonal ? (drive.title || 'Seasonal Internship') : 'Walk-in Drive',
          fullName: application.fullName,
          email: application.email,
          phone: application.contact,
          dob: application.dob,
          gender: application.gender,
          maritalStatus: application.maritalStatus,
          location: application.location,
          degree: application.degree,
          qualification: application.degree,
          college: application.college,
          department: application.department,
          year: application.year,
          passingYear: application.year,
          role: application.role,
          jobId: application.jobId,
          linkedin: application.linkedin,
          projectLinks: application.projectLinks,
          assessmentAnswers: application.assessmentAnswers
        });

        const attachments = [];
        if (resume) {
          attachments.push({
            filename: `${fullName.replace(/\s+/g, '_')}_Resume.pdf`,
            content: Buffer.from(resume, 'base64'),
            contentType: 'application/pdf'
          });
        }

        await sendEmail({
          to: req.tenant.receivingEmail,
          subject: `New ${isSeasonal ? (drive.title || 'Seasonal Internship') : 'Walk-in'} Application - ${fullName} (${application.role || 'Intern'})`,
          html: emailHtml,
          attachments
        });
      }
    } catch (err) {
      console.error('[WalkinApply] Failed to send email to HR:', err);
    }

    // Return success
    res.status(200).json({
      message: 'Application submitted successfully!',
      whatsappGroupLink: drive.whatsappGroupLink || '',
      jdPdfUrl: drive.jdPdfUrl || '',
      isSeasonal
    });

  } catch (error) {
    console.error('[WalkinApply] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/walkin-drives/applications
 * Fetches Walk-in Applications for the tenant.
 */
exports.getWalkinApplications = async (req, res) => {
  try {
    const InternModel = req.models && req.models.Intern ? req.models.Intern : Intern;
    const query = { isWalkinDrive: true };
    if (req.tenant && req.tenant.companyId) {
      query.companyId = req.tenant.companyId;
    }
    const applications = await InternModel.find(query)
      .populate('walkinDriveId', 'startDate startTime role')
      .sort({ createdAt: -1 });
    res.status(200).json(applications);
  } catch (error) {
    console.error('Error fetching walkin applications:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * PATCH /api/walkin-drives/applications/:id/status
 * Updates the status of a walk-in application
 */
exports.updateWalkinApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const InternModel = req.models && req.models.Intern ? req.models.Intern : Intern;
    
    const application = await InternModel.findOneAndUpdate(
      { _id: req.params.id, companyId: req.tenant.companyId, isWalkinDrive: true },
      { status },
      { new: true }
    );
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }
    
    res.status(200).json({ message: 'Status updated successfully', application });
  } catch (error) {
    console.error('Error updating walkin application status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
