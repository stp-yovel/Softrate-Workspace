const express = require('express');
const router = express.Router();
const multer = require('multer');
const campusHiringController = require('../controllers/campusHiringController');
const verifyTenant = require('../middleware/tenant.middleware');
const verifyPublicTenant = require('../middleware/publicTenant.middleware');

// Memory storage for multer so sharp and zlib can process buffers directly
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

// College routes
router.post(
  '/colleges',
  verifyTenant,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'mouDocument', maxCount: 1 }
  ]),
  campusHiringController.createCollege
);
router.put(
  '/colleges/:id',
  verifyTenant,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'mouDocument', maxCount: 1 }
  ]),
  campusHiringController.updateCollege
);
router.get('/colleges', verifyTenant, campusHiringController.getColleges);
router.get('/colleges/:id', verifyTenant, campusHiringController.getCollegeById);
router.get('/colleges/:id/mou-download', verifyTenant, campusHiringController.downloadMouDocument);
router.post('/colleges/:id/academic-years', verifyTenant, campusHiringController.addAcademicYear);

// Campus Drive routes
router.post('/drives', verifyTenant, campusHiringController.createCampusDrive);
router.get('/drives', verifyTenant, campusHiringController.getDrives);
router.get('/drives/:id', verifyTenant, campusHiringController.getDriveById);

// Student Candidate routes
router.post('/public/student-submit', verifyPublicTenant, campusHiringController.submitCampusStudentProfile);
router.post('/drives/:driveId/import-students', verifyTenant, campusHiringController.importStudents);
router.get('/drives/:driveId/students', verifyTenant, campusHiringController.getStudentsByDrive);
router.patch('/students/:id/round-status', verifyTenant, campusHiringController.updateStudentRoundStatus);
router.post('/students/bulk-update', verifyTenant, campusHiringController.bulkUpdateStudents);
router.post('/students/:id/onboard-intern', verifyTenant, campusHiringController.onboardStudentAsIntern);
router.post('/students/bulk-onboard', verifyTenant, campusHiringController.bulkOnboardStudentsAsIntern);

// HirePro Integration routes
router.get('/hirepro/exams', campusHiringController.getHireProExams);
router.post('/hirepro/verify-candidate', campusHiringController.verifyHireProCandidate);
router.post('/hirepro/bulk-promote', campusHiringController.bulkPromoteFromHirePro);

module.exports = router;

