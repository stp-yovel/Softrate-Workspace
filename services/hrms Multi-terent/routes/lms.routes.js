const express = require('express');
const router = express.Router();
const multer = require('multer');
const lmsController = require('../controllers/LMSController');
const verifyTenant = require('../middleware/tenant.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// All LMS endpoints require authenticated tenant session
router.use(verifyTenant);

// Course seeding & listing
router.post('/seed', lmsController.seedDefaultCourse);
router.get('/courses', lmsController.getAllCourses);
router.post('/courses', upload.single('banner'), lmsController.createCourse);

// HR Mapping
router.post('/assign', lmsController.assignCourse);
router.get('/user/:userId', lmsController.getUserCourses);

// Learner endpoints
router.get('/my-courses', lmsController.getMyCourses);
router.get('/courses/:courseId/timeline', lmsController.getCourseTimeline);
router.post('/courses/:courseId/progress', lmsController.updateVideoProgress);

// Notes & Video Slices
router.get('/courses/:courseId/notes', lmsController.getCourseNotes);
router.post('/courses/:courseId/notes', lmsController.createCourseNote);
router.delete('/courses/:courseId/notes/:noteId', lmsController.deleteCourseNote);

module.exports = router;
