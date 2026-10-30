const coursesService = require('./courses.service');

const getMyCourses = async (req, res, next) => {
  try {
    const token = req.headers.authorization || '';
    const { status, data } = await coursesService.getMyCourses(token);
    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

const getCourseTimeline = async (req, res, next) => {
  try {
    const token = req.headers.authorization || '';
    const { id } = req.params;
    const { status, data } = await coursesService.getCourseTimeline(id, token);
    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

const updateProgress = async (req, res, next) => {
  try {
    const token = req.headers.authorization || '';
    const { id } = req.params;
    const { status, data } = await coursesService.updateVideoProgress(id, req.body, token);
    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

const getCourseNotes = async (req, res, next) => {
  try {
    const token = req.headers.authorization || '';
    const { id } = req.params;
    const { status, data } = await coursesService.getCourseNotes(id, token);
    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

const createCourseNote = async (req, res, next) => {
  try {
    const token = req.headers.authorization || '';
    const { id } = req.params;
    const { status, data } = await coursesService.createCourseNote(id, req.body, token);
    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

const deleteCourseNote = async (req, res, next) => {
  try {
    const token = req.headers.authorization || '';
    const { id, noteId } = req.params;
    const { status, data } = await coursesService.deleteCourseNote(id, noteId, token);
    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyCourses,
  getCourseTimeline,
  updateProgress,
  getCourseNotes,
  createCourseNote,
  deleteCourseNote,
};
