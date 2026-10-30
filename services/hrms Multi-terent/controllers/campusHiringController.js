const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sharp = require('sharp');
const College = require('../models/College');
const CampusDrive = require('../models/CampusDrive');
const CampusStudent = require('../models/CampusStudent');
const { getMasterConnection, getTenantConnection, waitForConnection } = require('../db');
const CompanyModelExport = require('../models/CompanyModel');
const { getModelsForConnection } = require('../utilities/modelLoader');

// Ensure uploads/campus directory exists
const campusUploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'campus');
if (!fs.existsSync(campusUploadsDir)) {
  fs.mkdirSync(campusUploadsDir, { recursive: true });
}

/**
 * Helper: Permanently delete candidate resume from storage and database
 */
function deleteStudentResume(student) {
  try {
    // 1. Delete physical file if resumeUrl points to a local upload
    if (student.resumeUrl && typeof student.resumeUrl === 'string') {
      const urlStr = student.resumeUrl.trim();
      if (urlStr.startsWith('/') || urlStr.includes('uploads/')) {
        const filePath = path.join(__dirname, '..', 'public', urlStr.replace(/^\//, ''));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // 2. Clear all resume fields from candidate document
    student.resumeBase64 = '';
    student.resumeUrl = '';
    if (student.candidateDetails) {
      if (student.candidateDetails.resume) delete student.candidateDetails.resume;
      if (student.candidateDetails.resumeBase64) delete student.candidateDetails.resumeBase64;
    }
  } catch (err) {
    console.warn(`Error deleting resume for student ${student.rollNumber}:`, err.message);
  }
}

/**
 * Onboard a new College
 */
exports.createCollege = async (req, res) => {
  try {
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const companyId = req.tenant ? req.tenant.companyId : null;
    if (!companyId) {
      return res.status(400).json({ message: 'Company identification required.' });
    }

    const {
      name,
      address,
      university,
      mouDriveLink,
      academicYear,
      academicYearNotes
    } = req.body;

    if (!name || !address) {
      return res.status(400).json({ message: 'College name and address are required.' });
    }

    // Check duplicate college name for tenant
    const existing = await CollegeModel.findOne({ companyId, name: new RegExp(`^${name.trim()}$`, 'i') });
    if (existing) {
      return res.status(400).json({ message: 'A college with this name already exists in your organization.' });
    }

    // Parse placement officer
    let placementOfficer = req.body.placementOfficer;
    if (typeof placementOfficer === 'string') {
      try {
        placementOfficer = JSON.parse(placementOfficer);
      } catch (err) {
        placementOfficer = null;
      }
    }
    if (!placementOfficer || !placementOfficer.name || !placementOfficer.email || !placementOfficer.phone) {
      // Fallback: check individual form fields
      placementOfficer = {
        name: req.body.officerName || (placementOfficer && placementOfficer.name) || '',
        designation: req.body.officerDesignation || (placementOfficer && placementOfficer.designation) || 'Placement Officer',
        email: req.body.officerEmail || (placementOfficer && placementOfficer.email) || '',
        phone: req.body.officerPhone || (placementOfficer && placementOfficer.phone) || '',
        alternatePhone: req.body.officerAlternatePhone || (placementOfficer && placementOfficer.alternatePhone) || '',
        linkedin: req.body.officerLinkedin || (placementOfficer && placementOfficer.linkedin) || ''
      };
    }

    if (!placementOfficer.name || !placementOfficer.email || !placementOfficer.phone) {
      return res.status(400).json({ message: 'Placement officer name, email, and phone are required.' });
    }

    // Parse secondary coordinators if present
    let secondaryCoordinators = [];
    if (req.body.secondaryCoordinators) {
      if (typeof req.body.secondaryCoordinators === 'string') {
        try {
          secondaryCoordinators = JSON.parse(req.body.secondaryCoordinators);
        } catch (e) {
          secondaryCoordinators = [];
        }
      } else if (Array.isArray(req.body.secondaryCoordinators)) {
        secondaryCoordinators = req.body.secondaryCoordinators;
      }
    }

    // Process files (Logo, Banner, MOU)
    let logoUrl = '';
    let bannerUrl = '';
    const mouDocument = {
      data: '',
      fileName: '',
      fileType: '',
      fileSize: 0,
      uploadedAt: null
    };

    const files = req.files || {};

    // 1. Logo downsampling with sharp (max 256x256 WebP)
    if (files.logo && files.logo[0]) {
      const logoFile = files.logo[0];
      const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const filePath = path.join(campusUploadsDir, fileName);

      await sharp(logoFile.buffer)
        .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(filePath);

      logoUrl = `/uploads/campus/${fileName}`;
    }

    // 2. Banner downsampling with sharp (max 1200x600 WebP)
    if (files.banner && files.banner[0]) {
      const bannerFile = files.banner[0];
      const fileName = `banner_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const filePath = path.join(campusUploadsDir, fileName);

      await sharp(bannerFile.buffer)
        .resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filePath);

      bannerUrl = `/uploads/campus/${fileName}`;
    }

    // 3. MOU Signed Document: Compressed base64 in MongoDB
    if (files.mouDocument && files.mouDocument[0]) {
      const mouFile = files.mouDocument[0];
      const compressedBuffer = zlib.deflateSync(mouFile.buffer);
      mouDocument.data = compressedBuffer.toString('base64');
      mouDocument.fileName = mouFile.originalname;
      mouDocument.fileType = mouFile.mimetype || 'application/pdf';
      mouDocument.fileSize = mouFile.size;
      mouDocument.uploadedAt = new Date();
    }

    // Academic years array
    const academicYears = [];
    if (academicYear && academicYear.trim()) {
      academicYears.push({
        year: academicYear.trim(),
        notes: academicYearNotes || '',
        createdAt: new Date()
      });
    }

    const newCollege = new CollegeModel({
      name: name.trim(),
      address: address.trim(),
      university: (university || '').trim(),
      placementOfficer,
      secondaryCoordinators,
      logoUrl,
      bannerUrl,
      mouDocument,
      mouDriveLink: (mouDriveLink || '').trim(),
      academicYears,
      companyId,
      createdBy: req.user ? req.user._id : null
    });

    await newCollege.save();

    // Remove base64 data from response for fast payload
    const responseData = newCollege.toObject();
    if (responseData.mouDocument) {
      responseData.mouDocument.hasDocument = !!responseData.mouDocument.data;
      delete responseData.mouDocument.data;
    }

    return res.status(201).json({
      message: 'College onboarded successfully',
      college: responseData
    });
  } catch (error) {
    console.error('Error onboarding college:', error);
    return res.status(500).json({ message: 'Server error while onboarding college', error: error.message });
  }
};

/**
 * Update an existing College
 */
exports.updateCollege = async (req, res) => {
  try {
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const companyId = req.tenant ? req.tenant.companyId : null;
    const { id } = req.params;

    const college = await CollegeModel.findOne({ _id: id, companyId });
    if (!college) {
      return res.status(404).json({ message: 'College not found.' });
    }

    const {
      name,
      address,
      university,
      status,
      mouDriveLink
    } = req.body;

    if (name && name.trim()) {
      const duplicate = await CollegeModel.findOne({
        _id: { $ne: id },
        companyId,
        name: new RegExp(`^${name.trim()}$`, 'i')
      });
      if (duplicate) {
        return res.status(400).json({ message: 'Another college with this name already exists in your organization.' });
      }
      college.name = name.trim();
    }

    if (address && address.trim()) college.address = address.trim();
    if (university !== undefined) college.university = university.trim();
    if (status && ['Active', 'Inactive', 'Archived'].includes(status)) college.status = status;
    if (mouDriveLink !== undefined) college.mouDriveLink = mouDriveLink.trim();

    // Update Placement Officer
    let placementOfficer = req.body.placementOfficer;
    if (typeof placementOfficer === 'string') {
      try {
        placementOfficer = JSON.parse(placementOfficer);
      } catch (err) {
        placementOfficer = null;
      }
    }
    if (placementOfficer) {
      if (placementOfficer.name) college.placementOfficer.name = placementOfficer.name.trim();
      if (placementOfficer.designation) college.placementOfficer.designation = placementOfficer.designation.trim();
      if (placementOfficer.email) college.placementOfficer.email = placementOfficer.email.trim().toLowerCase();
      if (placementOfficer.phone) college.placementOfficer.phone = placementOfficer.phone.trim();
      if (placementOfficer.alternatePhone !== undefined) college.placementOfficer.alternatePhone = placementOfficer.alternatePhone.trim();
      if (placementOfficer.linkedin !== undefined) college.placementOfficer.linkedin = placementOfficer.linkedin.trim();
    } else {
      if (req.body.officerName) college.placementOfficer.name = req.body.officerName.trim();
      if (req.body.officerDesignation) college.placementOfficer.designation = req.body.officerDesignation.trim();
      if (req.body.officerEmail) college.placementOfficer.email = req.body.officerEmail.trim().toLowerCase();
      if (req.body.officerPhone) college.placementOfficer.phone = req.body.officerPhone.trim();
      if (req.body.officerAlternatePhone !== undefined) college.placementOfficer.alternatePhone = req.body.officerAlternatePhone.trim();
      if (req.body.officerLinkedin !== undefined) college.placementOfficer.linkedin = req.body.officerLinkedin.trim();
    }

    // Process optional new files
    const files = req.files || {};
    if (files.logo && files.logo[0]) {
      const logoFile = files.logo[0];
      const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const filePath = path.join(campusUploadsDir, fileName);

      await sharp(logoFile.buffer)
        .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(filePath);

      college.logoUrl = `/uploads/campus/${fileName}`;
    }

    if (files.banner && files.banner[0]) {
      const bannerFile = files.banner[0];
      const fileName = `banner_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const filePath = path.join(campusUploadsDir, fileName);

      await sharp(bannerFile.buffer)
        .resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filePath);

      college.bannerUrl = `/uploads/campus/${fileName}`;
    }

    if (files.mouDocument && files.mouDocument[0]) {
      const mouFile = files.mouDocument[0];
      const compressedBuffer = zlib.deflateSync(mouFile.buffer);
      college.mouDocument = {
        data: compressedBuffer.toString('base64'),
        fileName: mouFile.originalname,
        fileType: mouFile.mimetype || 'application/pdf',
        fileSize: mouFile.size,
        uploadedAt: new Date()
      };
    }

    await college.save();

    // Cascade name changes if applicable
    if (name && name.trim()) {
      await Promise.all([
        CampusDriveModel.updateMany({ collegeId: id, companyId }, { $set: { collegeName: college.name } }),
        CampusStudentModel.updateMany({ collegeId: id, companyId }, { $set: { collegeName: college.name } })
      ]);
    }

    const responseData = college.toObject();
    responseData.hasMouDocument = !!(college.mouDocument && college.mouDocument.data);
    delete responseData.mouDocument;

    return res.status(200).json({
      message: 'College updated successfully.',
      college: responseData
    });
  } catch (err) {
    console.error('Update College Error:', err);
    return res.status(500).json({ message: 'Internal server error while updating college.', error: err.message });
  }
};

/**
 * Get all Colleges for tenant with aggregate counts
 */
exports.getColleges = async (req, res) => {
  try {
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const companyId = req.tenant ? req.tenant.companyId : null;

    if (!companyId) {
      return res.status(400).json({ message: 'Company identification required.' });
    }

    // Exclude large mouDocument.data field from listing
    const colleges = await CollegeModel.find({ companyId })
      .select('-mouDocument.data')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with drive & student counts
    const collegeIds = colleges.map(c => c._id);
    const [drives, students] = await Promise.all([
      CampusDriveModel.find({ companyId, collegeId: { $in: collegeIds } }).select('_id collegeId academicYear status').lean(),
      CampusStudentModel.find({ companyId, collegeId: { $in: collegeIds } }).select('_id collegeId overallStatus').lean()
    ]);

    const enriched = colleges.map(col => {
      const colIdStr = col._id.toString();
      const colDrives = drives.filter(d => d.collegeId.toString() === colIdStr);
      const colStudents = students.filter(s => s.collegeId.toString() === colIdStr);

      return {
        ...col,
        hasMouDocument: !!(col.mouDocument && col.mouDocument.fileName),
        totalDrives: colDrives.length,
        totalStudents: colStudents.length,
        selectedStudents: colStudents.filter(s => s.overallStatus === 'Selected').length
      };
    });

    return res.status(200).json(enriched);
  } catch (error) {
    console.error('Error fetching colleges:', error);
    return res.status(500).json({ message: 'Server error fetching colleges', error: error.message });
  }
};

/**
 * Get College Details by ID with Academic Years & Stats
 */
exports.getCollegeById = async (req, res) => {
  try {
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const companyId = req.tenant ? req.tenant.companyId : null;

    const college = await CollegeModel.findOne({ _id: req.params.id, companyId })
      .select('-mouDocument.data')
      .lean();

    if (!college) {
      return res.status(404).json({ message: 'College not found' });
    }

    // Fetch drives for this college
    const drives = await CampusDriveModel.find({ companyId, collegeId: college._id })
      .sort({ startDate: -1 })
      .lean();

    const driveIds = drives.map(d => d._id);
    const students = await CampusStudentModel.find({ companyId, driveId: { $in: driveIds } })
      .select('driveId overallStatus')
      .lean();

    // Map student counts per drive
    const drivesWithStats = drives.map(drive => {
      const driveStudents = students.filter(s => s.driveId.toString() === drive._id.toString());
      return {
        ...drive,
        totalStudents: driveStudents.length,
        selectedCount: driveStudents.filter(s => s.overallStatus === 'Selected').length,
        rejectedCount: driveStudents.filter(s => s.overallStatus === 'Rejected').length
      };
    });

    // Group stats by academic year
    const academicYearsWithStats = (college.academicYears || []).map(ay => {
      const yearDrives = drivesWithStats.filter(d => d.academicYear === ay.year);
      const totalYearStudents = yearDrives.reduce((sum, d) => sum + (d.totalStudents || 0), 0);
      const selectedYearStudents = yearDrives.reduce((sum, d) => sum + (d.selectedCount || 0), 0);

      // Determine date range from drives
      let earliestStart = null;
      let latestEnd = null;
      yearDrives.forEach(d => {
        if (d.startDate && (!earliestStart || new Date(d.startDate) < new Date(earliestStart))) {
          earliestStart = d.startDate;
        }
        if (d.endDate && (!latestEnd || new Date(d.endDate) > new Date(latestEnd))) {
          latestEnd = d.endDate;
        }
      });

      return {
        ...ay,
        drivesCount: yearDrives.length,
        studentsCount: totalYearStudents,
        selectedCount: selectedYearStudents,
        earliestStart,
        latestEnd,
        drives: yearDrives
      };
    });

    return res.status(200).json({
      ...college,
      hasMouDocument: !!(college.mouDocument && college.mouDocument.fileName),
      academicYearsWithStats,
      drives: drivesWithStats
    });
  } catch (error) {
    console.error('Error fetching college details:', error);
    return res.status(500).json({ message: 'Server error fetching college details', error: error.message });
  }
};

/**
 * Download / View Decompressed MOU Document
 */
exports.downloadMouDocument = async (req, res) => {
  try {
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const companyId = req.tenant ? req.tenant.companyId : null;

    const college = await CollegeModel.findOne({ _id: req.params.id, companyId });
    if (!college || !college.mouDocument || !college.mouDocument.data) {
      return res.status(404).json({ message: 'MOU document not found for this college.' });
    }

    // Decompress the stored base64 buffer
    const compressedBuffer = Buffer.from(college.mouDocument.data, 'base64');
    const decompressedBuffer = zlib.inflateSync(compressedBuffer);

    const fileName = college.mouDocument.fileName || 'Signed_MOU.pdf';
    const mimeType = college.mouDocument.fileType || 'application/pdf';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', decompressedBuffer.length);

    return res.send(decompressedBuffer);
  } catch (error) {
    console.error('Error downloading MOU document:', error);
    return res.status(500).json({ message: 'Error retrieving MOU document', error: error.message });
  }
};

/**
 * Add an Academic Year to a College
 */
exports.addAcademicYear = async (req, res) => {
  try {
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const companyId = req.tenant ? req.tenant.companyId : null;
    const { year, startDate, endDate, notes } = req.body;

    if (!year || !year.trim()) {
      return res.status(400).json({ message: 'Academic year string (e.g. 2025-2026) is required.' });
    }

    const college = await CollegeModel.findOne({ _id: req.params.id, companyId });
    if (!college) {
      return res.status(404).json({ message: 'College not found.' });
    }

    const exists = college.academicYears.some(ay => ay.year.toLowerCase() === year.trim().toLowerCase());
    if (exists) {
      return res.status(400).json({ message: `Academic year ${year} already exists for this college.` });
    }

    college.academicYears.push({
      year: year.trim(),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      notes: notes || '',
      createdAt: new Date()
    });

    await college.save();
    return res.status(200).json({ message: 'Academic year added successfully', academicYears: college.academicYears });
  } catch (error) {
    console.error('Error adding academic year:', error);
    return res.status(500).json({ message: 'Server error adding academic year', error: error.message });
  }
};

/**
 * Create a Campus Hiring Drive
 */
exports.createCampusDrive = async (req, res) => {
  try {
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const companyId = req.tenant ? req.tenant.companyId : null;

    const {
      collegeId,
      academicYear,
      title,
      roles,
      startDate,
      endDate,
      rounds,
      description
    } = req.body;

    if (!collegeId || !academicYear || !title || !startDate || !endDate) {
      return res.status(400).json({ message: 'College, Academic Year, Title, Start Date, and End Date are required.' });
    }

    const college = await CollegeModel.findOne({ _id: collegeId, companyId });
    if (!college) {
      return res.status(404).json({ message: 'College not found.' });
    }

    // Ensure academic year exists in college
    const hasYear = college.academicYears.some(ay => ay.year === academicYear);
    if (!hasYear) {
      college.academicYears.push({ year: academicYear, createdAt: new Date() });
      await college.save();
    }

    // Format & validate rounds
    let formattedRounds = [];
    if (rounds && Array.isArray(rounds) && rounds.length > 0) {
      formattedRounds = rounds.map((r, idx) => ({
        roundId: r.roundId || `round_${idx + 1}_${Date.now()}`,
        name: r.name || `Round ${idx + 1}`,
        order: typeof r.order === 'number' ? r.order : idx + 1,
        isActive: r.isActive !== false,
        description: r.description || '',
        isHireProLinked: Boolean(r.isHireProLinked),
        hireProExamMapping: Array.isArray(r.hireProExamMapping) ? r.hireProExamMapping.map(m => ({
          role: (m.role || '').trim(),
          examId: (m.examId || '').trim(),
          examTitle: (m.examTitle || '').trim()
        })) : []
      }));
    } else {
      formattedRounds = [
        { roundId: 'r_resume', name: 'Project Shortlisting from Resume', order: 1, isActive: true },
        { roundId: 'r_aptitude', name: 'Aptitude Test', order: 2, isActive: true },
        { roundId: 'r_gd', name: 'Group Discussion', order: 3, isActive: true },
        { roundId: 'r_interview', name: 'One-to-One Interview', order: 4, isActive: true },
        { roundId: 'r_task', name: 'Technical Task / Test', order: 5, isActive: true }
      ];
    }

    // Sort rounds by order
    formattedRounds.sort((a, b) => a.order - b.order);

    const newDrive = new CampusDriveModel({
      collegeId,
      academicYear: academicYear.trim(),
      title: title.trim(),
      roles: Array.isArray(roles) ? roles : [roles],
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      rounds: formattedRounds,
      status: 'Scheduled',
      description: description || '',
      companyId,
      createdBy: req.user ? req.user._id : null
    });

    await newDrive.save();
    return res.status(201).json({ message: 'Campus Drive created successfully', drive: newDrive });
  } catch (error) {
    console.error('Error creating campus drive:', error);
    return res.status(500).json({ message: 'Server error creating campus drive', error: error.message });
  }
};

/**
 * Get Drives for a College (optionally filtered by academic year)
 */
exports.getDrives = async (req, res) => {
  try {
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const companyId = req.tenant ? req.tenant.companyId : null;

    const query = { companyId };
    if (req.query.collegeId) query.collegeId = req.query.collegeId;
    if (req.query.academicYear) query.academicYear = req.query.academicYear;

    const drives = await CampusDriveModel.find(query).sort({ startDate: -1 }).lean();
    const driveIds = drives.map(d => d._id);

    const students = await CampusStudentModel.find({ companyId, driveId: { $in: driveIds } })
      .select('driveId currentRoundOrder overallStatus')
      .lean();

    const result = drives.map(drive => {
      const driveStudents = students.filter(s => s.driveId.toString() === drive._id.toString());
      return {
        ...drive,
        totalStudents: driveStudents.length,
        selectedCount: driveStudents.filter(s => s.overallStatus === 'Selected').length,
        rejectedCount: driveStudents.filter(s => s.overallStatus === 'Rejected').length,
        activeCount: driveStudents.filter(s => s.overallStatus === 'Active').length
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching drives:', error);
    return res.status(500).json({ message: 'Server error fetching drives', error: error.message });
  }
};

/**
 * Get Drive Details by ID
 */
exports.getDriveById = async (req, res) => {
  try {
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const CollegeModel = req.models && req.models.College ? req.models.College : College;
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const companyId = req.tenant ? req.tenant.companyId : null;

    const drive = await CampusDriveModel.findOne({ _id: req.params.id, companyId }).lean();
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    const college = await CollegeModel.findOne({ _id: drive.collegeId, companyId })
      .select('name logoUrl placementOfficer university address')
      .lean();

    const students = await CampusStudentModel.find({ companyId, driveId: drive._id })
      .select('currentRoundOrder currentRoundName overallStatus')
      .lean();

    // Round stats breakdown
    const activeRounds = (drive.rounds || []).filter(r => r.isActive);
    const roundStats = activeRounds.map(r => {
      const inThisRound = students.filter(s => s.currentRoundOrder === r.order && s.overallStatus === 'Active').length;
      return {
        roundId: r.roundId,
        order: r.order,
        name: r.name,
        candidateCount: inThisRound
      };
    });

    return res.status(200).json({
      ...drive,
      college,
      totalStudents: students.length,
      selectedCount: students.filter(s => s.overallStatus === 'Selected').length,
      rejectedCount: students.filter(s => s.overallStatus === 'Rejected').length,
      activeCount: students.filter(s => s.overallStatus === 'Active').length,
      roundStats
    });
  } catch (error) {
    console.error('Error fetching drive details:', error);
    return res.status(500).json({ message: 'Server error fetching drive details', error: error.message });
  }
};

/**
 * Import Students into Drive (via Excel Mapping)
 */
exports.importStudents = async (req, res) => {
  try {
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const companyId = req.tenant ? req.tenant.companyId : null;
    const { driveId } = req.params;
    const { students, conflictResolution } = req.body; // conflictResolution: 'skip' | 'update'

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'No student records provided for import.' });
    }

    const drive = await CampusDriveModel.findOne({ _id: driveId, companyId });
    if (!drive) {
      return res.status(404).json({ message: 'Campus Drive not found' });
    }

    const firstRound = (drive.rounds || []).find(r => r.isActive && r.order === 1) || drive.rounds[0] || {
      roundId: 'r_resume',
      name: 'Project Shortlisting from Resume',
      order: 1
    };

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const rollNumber = (s.rollNumber || '').toString().trim();
      const fullName = (s.fullName || s.name || '').toString().trim();
      const email = (s.email || s.mailId || '').toString().trim().toLowerCase();
      const phone = (s.phone || s.phoneNumber || s.mobile || '').toString().trim();

      if (!rollNumber || !fullName || !email) {
        errors.push(`Row ${i + 1}: Missing mandatory roll number, name, or email.`);
        skippedCount++;
        continue;
      }

      // Check existing student by rollNumber in this drive
      const existing = await CampusStudentModel.findOne({ companyId, driveId: drive._id, rollNumber });

      if (existing) {
        if (conflictResolution === 'update') {
          existing.fullName = fullName;
          existing.email = email;
          existing.phone = phone || existing.phone;
          if (s.dob) existing.dob = new Date(s.dob);
          if (s.department) existing.department = s.department;
          if (s.degree) existing.degree = s.degree;
          if (s.cgpa) existing.cgpa = s.cgpa.toString();
          if (s.resumeUrl) existing.resumeUrl = s.resumeUrl;
          await existing.save();
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        const newStudent = new CampusStudentModel({
          driveId: drive._id,
          collegeId: drive.collegeId,
          rollNumber,
          fullName,
          dob: s.dob ? new Date(s.dob) : undefined,
          email,
          phone: phone || '',
          department: s.department || '',
          degree: s.degree || '',
          cgpa: s.cgpa ? s.cgpa.toString() : '',
          resumeUrl: s.resumeUrl || '',
          appliedRoles: drive.roles || [],
          currentRoundOrder: firstRound.order,
          currentRoundName: firstRound.name,
          overallStatus: 'Active',
          roundHistory: [
            {
              roundId: firstRound.roundId,
              roundName: firstRound.name,
              roundOrder: firstRound.order,
              status: 'Pending',
              remarks: 'Imported from Excel',
              evaluatedAt: new Date()
            }
          ],
          companyId
        });

        await newStudent.save();
        insertedCount++;
      }
    }

    return res.status(200).json({
      message: `Import complete. ${insertedCount} added, ${updatedCount} updated, ${skippedCount} skipped.`,
      insertedCount,
      updatedCount,
      skippedCount,
      errors
    });
  } catch (error) {
    console.error('Error importing campus students:', error);
    return res.status(500).json({ message: 'Server error importing students', error: error.message });
  }
};

/**
 * Get Students in a Drive with Round & Status filters
 */
exports.getStudentsByDrive = async (req, res) => {
  try {
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const companyId = req.tenant ? req.tenant.companyId : null;
    const { driveId } = req.params;
    const { roundOrder, status, search } = req.query;

    const query = { companyId, driveId };

    if (roundOrder && roundOrder !== 'all') {
      query.currentRoundOrder = Number(roundOrder);
    }

    if (status && status !== 'all') {
      query.overallStatus = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { fullName: new RegExp(q, 'i') },
        { rollNumber: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { phone: new RegExp(q, 'i') },
        { department: new RegExp(q, 'i') }
      ];
    }

    const students = await CampusStudentModel.find(query).sort({ rollNumber: 1 }).lean();
    return res.status(200).json(students);
  } catch (error) {
    console.error('Error fetching drive students:', error);
    return res.status(500).json({ message: 'Server error fetching students', error: error.message });
  }
};

/**
 * Progress or Reject a Student in a Round
 */
exports.updateStudentRoundStatus = async (req, res) => {
  try {
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const companyId = req.tenant ? req.tenant.companyId : null;
    const { id } = req.params;
    const { action, remarks, score } = req.body; // action: 'clear_and_promote' | 'reject' | 'mark_selected'

    const student = await CampusStudentModel.findOne({ _id: id, companyId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const drive = await CampusDriveModel.findOne({ _id: student.driveId, companyId });
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found.' });
    }

    const activeRounds = (drive.rounds || []).filter(r => r.isActive).sort((a, b) => a.order - b.order);
    const currentIndex = activeRounds.findIndex(r => r.order === student.currentRoundOrder);
    const currentRound = activeRounds[currentIndex] || { roundId: 'curr', name: student.currentRoundName, order: student.currentRoundOrder };

    if (action === 'clear_and_promote') {
      // Disallow promotion if candidate has not filled the form
      if (!student.isFormSubmitted) {
        return res.status(400).json({
          message: `Cannot promote ${student.fullName}: Candidate has not submitted the application form yet.`
        });
      }

      // Find current round in history and update it
      const histItem = student.roundHistory.find(h => h.roundOrder === student.currentRoundOrder);
      if (histItem) {
        histItem.status = 'Cleared';
        histItem.remarks = remarks || histItem.remarks;
        if (score !== undefined) histItem.score = score;
        histItem.evaluatedBy = req.user ? req.user._id : null;
        histItem.evaluatedAt = new Date();
      }

      // Check if there is a next round
      if (currentIndex >= 0 && currentIndex < activeRounds.length - 1) {
        const nextRound = activeRounds[currentIndex + 1];
        student.currentRoundOrder = nextRound.order;
        student.currentRoundName = nextRound.name;
        student.roundHistory.push({
          roundId: nextRound.roundId,
          roundName: nextRound.name,
          roundOrder: nextRound.order,
          status: 'Pending',
          evaluatedAt: new Date()
        });
      } else {
        // Last round cleared -> student is Selected!
        student.overallStatus = 'Selected';
      }
    } else if (action === 'reject') {
      const histItem = student.roundHistory.find(h => h.roundOrder === student.currentRoundOrder);
      if (histItem) {
        histItem.status = 'Rejected';
        histItem.remarks = remarks || histItem.remarks;
        if (score !== undefined) histItem.score = score;
        histItem.evaluatedBy = req.user ? req.user._id : null;
        histItem.evaluatedAt = new Date();
      }
      student.overallStatus = 'Rejected';
      deleteStudentResume(student);
    } else if (action === 'mark_selected') {
      student.overallStatus = 'Selected';
    }

    await student.save();
    return res.status(200).json({ message: 'Student updated successfully', student });
  } catch (error) {
    console.error('Error updating student round status:', error);
    return res.status(500).json({ message: 'Server error updating student', error: error.message });
  }
};

/**
 * Bulk Action (Promote / Reject) on Students
 */
exports.bulkUpdateStudents = async (req, res) => {
  try {
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : CampusStudent;
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : CampusDrive;
    const companyId = req.tenant ? req.tenant.companyId : null;
    const { studentIds, action, remarks } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'Student IDs array required.' });
    }

    let successCount = 0;
    for (const sid of studentIds) {
      const student = await CampusStudentModel.findOne({ _id: sid, companyId });
      if (!student || student.overallStatus !== 'Active') continue;

      const drive = await CampusDriveModel.findOne({ _id: student.driveId, companyId });
      if (!drive) continue;

      const activeRounds = (drive.rounds || []).filter(r => r.isActive).sort((a, b) => a.order - b.order);
      const currentIndex = activeRounds.findIndex(r => r.order === student.currentRoundOrder);

      if (action === 'clear_and_promote') {
        // Disallow bulk promotion for candidates who have not filled the form
        if (!student.isFormSubmitted) {
          continue;
        }

        const histItem = student.roundHistory.find(h => h.roundOrder === student.currentRoundOrder);
        if (histItem) {
          histItem.status = 'Cleared';
          histItem.remarks = remarks || 'Bulk promoted';
          histItem.evaluatedAt = new Date();
        }

        if (currentIndex >= 0 && currentIndex < activeRounds.length - 1) {
          const nextRound = activeRounds[currentIndex + 1];
          student.currentRoundOrder = nextRound.order;
          student.currentRoundName = nextRound.name;
          student.roundHistory.push({
            roundId: nextRound.roundId,
            roundName: nextRound.name,
            roundOrder: nextRound.order,
            status: 'Pending',
            evaluatedAt: new Date()
          });
        } else {
          student.overallStatus = 'Selected';
        }
      } else if (action === 'reject') {
        const histItem = student.roundHistory.find(h => h.roundOrder === student.currentRoundOrder);
        if (histItem) {
          histItem.status = 'Rejected';
          histItem.remarks = remarks || 'Bulk rejected';
          histItem.evaluatedAt = new Date();
        }
        student.overallStatus = 'Rejected';
      deleteStudentResume(student);
      }

      await student.save();
      successCount++;
    }

    return res.status(200).json({ message: `Bulk action applied to ${successCount} candidates.` });
  } catch (error) {
    console.error('Error in bulk update:', error);
    return res.status(500).json({ message: 'Server error in bulk update', error: error.message });
  }
};

/**
 * Submit / Update Student Profile from Campus Registration Form
 * Does NOT save to intern db! Saves strictly in CampusStudent details.
 */
exports.submitCampusStudentProfile = async (req, res) => {
  try {
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : require('../models/CampusStudent');
    const CampusDriveModel = req.models && req.models.CampusDrive ? req.models.CampusDrive : require('../models/CampusDrive');
    const companyId = req.tenant ? req.tenant.companyId : null;

    const studentId = req.body.campusStudentId || req.body.studentId;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Campus Student ID is required.' });
    }

    const student = await CampusStudentModel.findOne({ _id: studentId, companyId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Campus student not found.' });
    }

    // Do not allow multiple submissions
    if (student.isFormSubmitted || student.isOnboarded) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_SUBMITTED',
        message: 'You have already submitted your application for this campus drive. Multiple submissions are not allowed.'
      });
    }

    // Check drive timeline expiration
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

    // Parse assessment answers if provided
    let assessmentAnswers = {};
    if (req.body.assessmentAnswers) {
      try {
        assessmentAnswers = typeof req.body.assessmentAnswers === 'string'
          ? JSON.parse(req.body.assessmentAnswers)
          : req.body.assessmentAnswers;
      } catch (_) { assessmentAnswers = {}; }
    }

    let projectLinks = [];
    if (req.body.projectLinks) {
      try {
        projectLinks = typeof req.body.projectLinks === 'string'
          ? JSON.parse(req.body.projectLinks)
          : req.body.projectLinks;
      } catch (_) { projectLinks = []; }
    }

    // Update student fields
    if (req.body.fullName) student.fullName = req.body.fullName.trim();
    if (req.body.phone || req.body.contact) student.phone = (req.body.phone || req.body.contact).trim();
    if (req.body.email) student.email = req.body.email.trim().toLowerCase();
    if (req.body.dob) {
      let parsedDob = null;
      if (typeof req.body.dob === 'string' && req.body.dob.includes('/')) {
        const parts = req.body.dob.trim().split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parseInt(parts[2], 10);
          const customDate = new Date(Date.UTC(y, m, d));
          if (!isNaN(customDate.getTime())) {
            parsedDob = customDate;
          }
        }
      }
      if (!parsedDob) {
        const p = new Date(req.body.dob);
        if (!isNaN(p.getTime())) {
          parsedDob = p;
        }
      }
      if (parsedDob) {
        student.dob = parsedDob;
      }
    }
    if (req.body.gender) student.gender = req.body.gender;
    if (req.body.location) student.location = req.body.location;
    if (req.body.degree) student.degree = req.body.degree;
    if (req.body.department) student.department = req.body.department;
    if (req.body.college) student.collegeName = req.body.college;
    if (req.body.cgpaOrPercentage || req.body.cgpa) student.cgpa = (req.body.cgpaOrPercentage || req.body.cgpa).toString();
    if (req.body.passingYear || req.body.graduationYear || req.body.year) {
      student.passingYear = (req.body.passingYear || req.body.graduationYear || req.body.year).toString();
    }
    if (req.body.linkedin) student.linkedin = req.body.linkedin;
    if (req.body.role) {
      student.selectedRole = req.body.role;
      if (!student.appliedRoles.includes(req.body.role)) {
        student.appliedRoles.push(req.body.role);
      }
    }
    if (req.body.resume) student.resumeBase64 = req.body.resume;
    student.assessmentAnswers = assessmentAnswers;
    student.projectLinks = projectLinks;
    student.candidateDetails = { ...req.body, resume: undefined };
    student.isFormSubmitted = true;
    student.formSubmittedAt = new Date();

    await student.save();

    return res.status(200).json({
      success: true,
      message: 'Campus student details saved successfully.',
      student
    });
  } catch (error) {
    console.error('Error submitting campus student profile:', error);
    return res.status(500).json({ success: false, message: 'Server error saving student details', error: error.message });
  }
};

/**
 * HR Action: Onboard a selected Campus Student to Intern database
 * Creates the Intern record & User account, marks student as onboarded.
 */
exports.onboardStudentAsIntern = async (req, res) => {
  try {
    const CampusStudentModel = req.models && req.models.CampusStudent ? req.models.CampusStudent : require('../models/CampusStudent');
    const InternModel = req.models && req.models.Intern ? req.models.Intern : require('../models/Intern');
    const UserModel = req.models && req.models.User ? req.models.User : require('../models/User');
    const companyId = req.tenant ? req.tenant.companyId : null;
    const { id } = req.params;

    const student = await CampusStudentModel.findOne({ _id: id, companyId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (student.isOnboarded) {
      return res.status(400).json({ success: false, message: 'Candidate is already onboarded as an Intern.' });
    }

    // Role & IDs
    const role = student.selectedRole || (student.appliedRoles && student.appliedRoles[0]) || 'Intern';
    const onboardingDate = new Date().toISOString().split('T')[0];
    const defaultPassword = (req.tenant && req.tenant.defaultPassword) || 'Softrate@123';

    // Generate unique sequential Intern ID (e.g. 261001)
    const CounterModel = req.models && req.models.Counter ? req.models.Counter : require('../models/counter.model');
    const year = new Date().getFullYear().toString().slice(-2);
    let counter;
    let internId;
    do {
      counter = await CounterModel.findOneAndUpdate(
        { companyId: companyId, type: 'intern', year: year },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      internId = `${year}1${String(counter.seq).padStart(3, "0")}`;
    } while (await InternModel.exists({ internid: internId, companyId: companyId }));

    // 1. Create or Find User
    let user = await UserModel.findOne({ email: student.email, companyId });
    if (!user) {
      const RoleModel = req.models && req.models.Role ? req.models.Role : (req.tenant?.connection ? req.tenant.connection.model('Role', require('../models/Role').schema) : null);
      let internRole = null;
      if (RoleModel) {
        internRole = await RoleModel.findOne({ name: 'intern', companyId });
        if (!internRole) {
          internRole = new RoleModel({
            name: 'intern',
            companyId,
            permissions: [],
            isSystemDefined: true
          });
          await internRole.save();
        }
      }

      const nameParts = (student.fullName || '').trim().split(' ');
      const firstName = nameParts[0] || 'Intern';
      const lastName = nameParts.slice(1).join(' ') || '';

      let dobDate = null;
      if (student.dob) {
        const parsed = new Date(student.dob);
        if (!isNaN(parsed.getTime())) {
          dobDate = parsed;
        }
      }

      user = new UserModel({
        companyId,
        employeeId: internId,
        email: student.email,
        phone: student.phone,
        password: defaultPassword,
        roleId: internRole?._id,
        profile: {
          firstName: student.fullName || firstName,
          lastName: lastName,
          phone: student.phone,
          dob: dobDate,
          gender: student.gender || '',
          maritalStatus: 'Single',
          address: student.location || '',
          emergencyContact: {
            name: student.fullName || firstName,
            phone: student.phone
          },
          linkedin: student.linkedin || ''
        },
        education: {
          qualification: student.degree || '',
          college: student.collegeName || '',
          passingYear: student.passingYear || '',
          specialization: student.department || ''
        },
        employment: {
          type: 'INTERN',
          designation: role,
          status: 'approved',
          joinedAt: onboardingDate
        },
        system: {
          onboardingStatus: 'completed'
        }
      });
      await user.save();
    } else {
      user.employment = user.employment || {};
      user.employment.type = 'INTERN';
      user.employment.designation = role;
      user.employment.status = 'approved';
      user.employment.joinedAt = onboardingDate;
      user.system = user.system || {};
      user.system.onboardingStatus = 'completed';
      await user.save();
    }

    let internDob = null;
    if (student.dob) {
      const parsed = new Date(student.dob);
      if (!isNaN(parsed.getTime())) {
        internDob = parsed;
      }
    }

    // 2. Create Intern record directly as Approved
    const newIntern = new InternModel({
      companyId,
      internid: internId,
      fullName: student.fullName,
      email: student.email,
      college: student.collegeName || 'Partner College',
      year: student.passingYear || student.year || new Date().getFullYear().toString(),
      department: student.department || 'General',
      role: role,
      contact: student.phone,
      emergencyContact: student.phone || '0000000000',
      onboardingDate,
      linkedin: student.linkedin && student.linkedin.trim() ? student.linkedin.trim() : 'https://linkedin.com',
      degree: student.degree || '',
      location: student.location || '',
      gender: student.gender || '',
      dob: internDob,
      assessmentAnswers: student.assessmentAnswers || {},
      projectLinks: student.projectLinks || [],
      campusStudentId: student._id,
      driveId: student.driveId,
      collegeId: student.collegeId,
      passingYear: student.passingYear || '',
      cgpaOrPercentage: student.cgpa || '',
      status: 'approved',
      password: defaultPassword
    });

    newIntern.resume = '';

    await newIntern.save();

    // 2.5 Initialize Leave Counters for the new intern
    try {
      const LeaveCounterModel = req.models && req.models.LeaveCounter ? req.models.LeaveCounter : require('../models/leaveCounter.model');
      const CompanyModelExport = require('../models/CompanyModel');
      const Company = req.tenant?.masterDb?.models?.Company || CompanyModelExport;
      const masterDb = getMasterConnection();
      await waitForConnection(masterDb);
      const CompanyModel = masterDb.models.Company || masterDb.model('Company', CompanyModelExport.schema);
      const company = await CompanyModel.findById(companyId);
      let policies = company?.leavePolicies;
      if (!policies || policies.length === 0) {
        policies = [
          { name: 'Sick Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' },
          { name: 'Casual Leave', allowance: 12, frequency: 'annual', appliesTo: 'both' }
        ];
      }

      const startDate = new Date();
      const leaveRecords = [];
      policies.forEach((policy) => {
        if (policy.appliesTo === 'both' || policy.appliesTo === 'intern') {
          let resetDate = new Date(startDate);
          if (policy.frequency === 'monthly') {
            resetDate.setMonth(resetDate.getMonth() + 1);
          } else {
            resetDate.setFullYear(resetDate.getFullYear() + 1);
          }
          leaveRecords.push({
            companyId,
            employeeId: internId,
            leaveType: policy.name,
            totalAllowed: policy.allowance,
            used: 0,
            balance: policy.allowance,
            cycleStartDate: startDate,
            nextResetDate: resetDate
          });
        }
      });

      if (leaveRecords.length > 0) {
        await LeaveCounterModel.insertMany(leaveRecords, { ordered: false });
      }
    } catch (lcErr) {
      console.error('Error initializing leave counters for campus intern:', lcErr.message);
    }

    // 3. Update CampusStudent and delete resume from database & storage upon onboarding
    deleteStudentResume(student);
    student.isOnboarded = true;
    student.onboardedAt = new Date();
    student.linkedCandidateId = newIntern._id;
    student.internId = internId;
    await student.save();

    // 4. Trigger Real-Time Notification
    const io = req.app.get('io');
    if (io) {
      io.emit('activity-updated', { type: 'new_intern', intern: newIntern });
    }

    return res.status(200).json({
      success: true,
      message: `Student ${student.fullName} has been successfully onboarded as an Approved Intern with ID ${internId}.`,
      intern: newIntern,
      student
    });
  } catch (error) {
    console.error('Error onboarding student as intern:', error);
    return res.status(500).json({ success: false, message: 'Server error onboarding student', error: error.message });
  }
};

/**
 * HR Action: Bulk Onboard Selected Students
 */
exports.bulkOnboardStudentsAsIntern = async (req, res) => {
  try {
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Student IDs array required.' });
    }

    let onboardedCount = 0;
    for (const sid of studentIds) {
      const mockReq = { ...req, params: { id: sid } };
      let responded = false;
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            if (code === 200 && data.success) onboardedCount++;
            responded = true;
          }
        }),
        json: (data) => {
          if (data && data.success) onboardedCount++;
          responded = true;
        }
      };
      try {
        await exports.onboardStudentAsIntern(mockReq, mockRes);
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      message: `Successfully onboarded ${onboardedCount} candidates as Interns.`
    });
  } catch (error) {
    console.error('Error in bulk onboarding:', error);
    return res.status(500).json({ success: false, message: 'Server error in bulk onboarding', error: error.message });
  }
};

/**
 * Helper: Find a campus student across tenant databases
 */
async function findStudentAcrossDrives(rollNumber, companyId, reqModels, driveCriteria) {
  const cleanRoll = (rollNumber || '').trim();
  if (!cleanRoll) return null;
  const rollRegex = new RegExp(`^${cleanRoll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

  async function checkModels(models) {
    if (!models || !models.CampusStudent) return null;
    let query = { rollNumber: rollRegex };
    if (driveCriteria && driveCriteria.driveId) {
      query.driveId = driveCriteria.driveId;
    }
    const students = await models.CampusStudent.find(query);
    if (!students || students.length === 0) return null;

    if (students.length === 1 && !driveCriteria?.driveName) {
      const s = students[0];
      const drive = await models.CampusDrive.findById(s.driveId);
      const college = await models.College.findById(s.collegeId);
      return { student: s, drive, college, models };
    }

    // Match by driveName if multiple or driveName filter provided
    for (const s of students) {
      const drive = await models.CampusDrive.findById(s.driveId);
      if (drive) {
        if (!driveCriteria?.driveName || drive.title?.trim().toLowerCase() === driveCriteria.driveName.trim().toLowerCase()) {
          const college = await models.College.findById(s.collegeId);
          return { student: s, drive, college, models };
        }
      }
    }

    // Fallback to first student if driveName didn't match strictly
    const fallbackStudent = students[0];
    const drive = await models.CampusDrive.findById(fallbackStudent.driveId);
    const college = await models.College.findById(fallbackStudent.collegeId);
    return { student: fallbackStudent, drive, college, models };
  }

  // 1. If tenant models are attached to req, check there first
  if (reqModels) {
    const res = await checkModels(reqModels);
    if (res) return res;
  }

  // 2. Query across tenant databases using master connection
  const masterDb = getMasterConnection();
  if (masterDb.readyState !== 1) await waitForConnection(masterDb);
  const Company = masterDb.models.Company || masterDb.model('Company', CompanyModelExport.schema);

  const filter = companyId ? { _id: companyId } : { subscriptionStatus: { $in: ['active', 'trial'] } };
  const companies = await Company.find(filter, { _id: 1, dbName: 1, companyCode: 1 });

  for (const comp of companies) {
    try {
      const dbName = comp.dbName || `hrdb_${comp.companyCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
      const tenantDb = getTenantConnection(dbName);
      if (tenantDb.readyState !== 1) await waitForConnection(tenantDb);
      const models = getModelsForConnection(tenantDb);
      if (models) {
        const res = await checkModels(models);
        if (res) return res;
      }
    } catch (e) {
      console.warn(`Error scanning tenant ${comp.companyCode}:`, e.message);
    }
  }

  return null;
}

/**
 * Integration: Get Available Exams from HirePro
 * Proxy endpoint to avoid CORS / direct network issues in frontend
 */
exports.getHireProExams = async (req, res) => {
  try {
    const hireProUrl = process.env.HIREPRO_API_URL || 'http://localhost:5002';
    const response = await fetch(`${hireProUrl}/api/exams/public-list`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`HirePro responded with HTTP ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json({ success: true, exams: data });
  } catch (err) {
    console.warn('Could not fetch exams from HirePro directly:', err.message);
    return res.status(200).json({
      success: true,
      exams: [],
      warning: `Unable to connect to HirePro at ${process.env.HIREPRO_API_URL || 'http://localhost:5002'}: ${err.message}`
    });
  }
};

/**
 * Integration: Real-Time Candidate Verification for HirePro Login
 * Called when a student enters their Roll Number and DOB/Password on HirePro
 */
exports.verifyHireProCandidate = async (req, res) => {
  try {
    const { rollNumber, password, companyCode, companyId } = req.body;
    if (!rollNumber) {
      return res.status(400).json({ success: false, message: 'Roll number is required.' });
    }

    const found = await findStudentAcrossDrives(rollNumber, companyId, req.models);
    if (!found || !found.student) {
      return res.status(404).json({
        success: false,
        message: `Candidate with roll number "${rollNumber}" was not found in any campus drive.`
      });
    }

    const { student, drive, college } = found;

    // Check candidate overall status
    if (student.overallStatus === 'Rejected' || student.overallStatus === 'Withdrawn') {
      return res.status(403).json({
        success: false,
        message: `Your application status is currently "${student.overallStatus}".`
      });
    }

    // Require form submission before taking HirePro assessment
    if (!student.isFormSubmitted) {
      return res.status(403).json({
        success: false,
        message: 'Please complete and submit your campus registration form before taking the HirePro assessment.'
      });
    }

    // Password verification: Validate against candidate DOB or Roll Number
    if (password) {
      const cleanPass = password.toString().trim().toLowerCase();
      const cleanRoll = student.rollNumber.toString().trim().toLowerCase();

      let dobMatches = false;
      if (student.dob) {
        const d = new Date(student.dob);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dobFormats = [
            `${yyyy}-${mm}-${dd}`,
            `${dd}-${mm}-${yyyy}`,
            `${yyyy}${mm}${dd}`,
            `${dd}${mm}${yyyy}`,
            `${dd}/${mm}/${yyyy}`,
            `${mm}/${dd}/${yyyy}`
          ];
          dobMatches = dobFormats.some(fmt => fmt.toLowerCase() === cleanPass);
        }
      }

      const rollMatches = cleanPass === cleanRoll;
      if (!dobMatches && !rollMatches) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password. Please enter your Date of Birth (YYYY-MM-DD or DD-MM-YYYY) or Roll Number.'
        });
      }
    }

    // Verify drive exists
    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Campus drive information could not be found for this candidate.'
      });
    }

    // Verify current round has HirePro integration enabled
    const activeRounds = (drive.rounds || []).filter(r => r.isActive).sort((a, b) => a.order - b.order);
    const currentRound = activeRounds.find(r => r.order === student.currentRoundOrder);

    if (!currentRound) {
      return res.status(403).json({
        success: false,
        message: `Candidate is currently in round order ${student.currentRoundOrder}, which is not active in this drive.`
      });
    }

    if (!currentRound.isHireProLinked) {
      return res.status(403).json({
        success: false,
        message: `Online assessment is not required for your current round: "${currentRound.name}".`
      });
    }

    // Map candidate's role to HirePro Exam
    const candidateRole = (student.selectedRole || (student.appliedRoles && student.appliedRoles[0]) || '').trim();
    const mappings = currentRound.hireProExamMapping || [];

    let matchedMapping = mappings.find(m => (m.role || '').toLowerCase() === candidateRole.toLowerCase());
    if (!matchedMapping && mappings.length > 0) {
      // Fallback to first mapping if single role drive
      matchedMapping = mappings[0];
    }

    if (!matchedMapping || !matchedMapping.examId) {
      return res.status(404).json({
        success: false,
        message: `No assessment exam has been configured for role "${candidateRole}". Please contact the placement cell.`
      });
    }

    return res.status(200).json({
      success: true,
      candidate: {
        studentId: student._id,
        rollNumber: student.rollNumber,
        name: student.fullName,
        email: student.email,
        mobile: student.phone,
        department: student.department || '',
        collegeName: (college && college.name) ? college.name : (student.collegeName || 'Campus College'),
        collegeId: student.collegeId,
        driveId: drive._id,
        driveTitle: drive.title,
        role: candidateRole || 'Candidate',
        examId: matchedMapping.examId,
        examTitle: matchedMapping.examTitle || '',
        currentRoundOrder: student.currentRoundOrder,
        currentRoundName: currentRound.name,
        companyId: student.companyId
      }
    });
  } catch (error) {
    console.error('Error verifying candidate for HirePro:', error);
    return res.status(500).json({ success: false, message: 'Server error verifying candidate', error: error.message });
  }
};

/**
 * Integration: Bulk Promote Candidates from HirePro Results
 * Called when admin clicks "Promote Selected to Next Round in PeopleSoft"
 */
exports.bulkPromoteFromHirePro = async (req, res) => {
  try {
    const rawStudents = req.body.students || req.body.updates;
    if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
      return res.status(400).json({ success: false, message: 'Students array required.' });
    }

    let promotedCount = 0;
    const promotedDetails = [];
    const errors = [];
    const processedStudentIds = new Set(); // Prevent duplicate promotion within the same batch

    for (const item of rawStudents) {
      const rollNumber = item.rollNumber;
      if (!rollNumber) continue;

      const driveCriteria = {
        driveId: item.driveId || undefined,
        driveName: item.driveName || undefined
      };

      const found = await findStudentAcrossDrives(rollNumber, null, req.models, driveCriteria);
      if (!found || !found.student) {
        errors.push({ rollNumber, error: 'Student not found in PeopleSoft' });
        continue;
      }

      const { student, drive } = found;
      if (!drive) {
        errors.push({ rollNumber, error: 'Drive not found' });
        continue;
      }

      // 1. Deduplication check: Skip if already processed in this batch
      const studentKey = student._id.toString();
      if (processedStudentIds.has(studentKey)) {
        continue;
      }
      processedStudentIds.add(studentKey);

      const activeRounds = (drive.rounds || []).filter(r => r.isActive).sort((a, b) => a.order - b.order);
      const currentIndex = activeRounds.findIndex(r => r.order === student.currentRoundOrder);
      const currentRound = activeRounds[currentIndex];

      if (!currentRound) {
        errors.push({ rollNumber, error: 'Current round not found in drive' });
        continue;
      }

      // 2. Idempotency Check: What if candidate has ALREADY cleared/progressed past the HirePro round?
      const hpRound = activeRounds.find(r => r.isHireProLinked);
      if (hpRound && student.currentRoundOrder > hpRound.order) {
        // Candidate was already promoted past the HirePro assessment round.
        // Update their score on the assessment round history record, but DO NOT advance round again!
        let hpHist = student.roundHistory.find(h => h.roundOrder === hpRound.order);
        if (hpHist) {
          hpHist.score = Math.max(hpHist.score || 0, Number(item.score) || 0);
          await student.save();
        }
        promotedDetails.push({ 
          rollNumber, 
          status: 'already_promoted', 
          message: `Candidate was already promoted past Round ${hpRound.order} (${hpRound.name}). Assessment score updated.` 
        });
        continue;
      }

      // 3. Current round must be linked with HirePro
      if (!currentRound.isHireProLinked) {
        errors.push({ rollNumber, error: `Candidate's current round "${currentRound.name}" is not linked with HirePro.` });
        continue;
      }

      // 4. Update current round history record
      let histItem = student.roundHistory.find(h => h.roundOrder === student.currentRoundOrder);
      if (!histItem) {
        histItem = {
          roundId: currentRound.roundId || `round_${student.currentRoundOrder}`,
          roundName: student.currentRoundName,
          roundOrder: student.currentRoundOrder,
          status: 'Cleared'
        };
        student.roundHistory.push(histItem);
      }
      histItem.status = 'Cleared';
      histItem.score = Number(item.score) || 0;
      histItem.remarks = item.remarks || `HirePro Assessment Score: ${item.score}/${item.totalMarks || 100} (Malpractice Warnings: ${item.warnings || 0})`;
      histItem.evaluatedAt = new Date();

      // 5. Advance to next round if available
      if (currentIndex >= 0 && currentIndex < activeRounds.length - 1) {
        const nextRound = activeRounds[currentIndex + 1];
        student.currentRoundOrder = nextRound.order;
        student.currentRoundName = nextRound.name;
        student.roundHistory.push({
          roundId: nextRound.roundId,
          roundName: nextRound.name,
          roundOrder: nextRound.order,
          status: 'Pending'
        });
        promotedDetails.push({ rollNumber, promotedTo: nextRound.name });
      } else {
        // Completed final round
        student.overallStatus = 'Selected';
        promotedDetails.push({ rollNumber, promotedTo: 'Selected' });
      }

      await student.save();
      promotedCount++;
    }

    return res.status(200).json({
      success: true,
      promotedCount,
      promotedDetails,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully processed ${promotedCount} candidate(s) in PeopleSoft.`
    });
  } catch (error) {
    console.error('Error in bulk promoting from HirePro:', error);
    return res.status(500).json({ success: false, message: 'Server error in bulk promotion', error: error.message });
  }
};


