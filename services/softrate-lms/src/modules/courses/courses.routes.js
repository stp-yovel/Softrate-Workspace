const express = require('express');
const {
  getMyCourses,
  getCourseTimeline,
  updateProgress,
  getCourseNotes,
  createCourseNote,
  deleteCourseNote,
} = require('./courses.controller');

const router = express.Router();

router.get('/my-courses', getMyCourses);
router.get('/:id/timeline', getCourseTimeline);
router.post('/:id/progress', updateProgress);

// Notes & Video Slices
router.get('/:id/notes', getCourseNotes);
router.post('/:id/notes', createCourseNote);
router.delete('/:id/notes/:noteId', deleteCourseNote);

module.exports = router;
