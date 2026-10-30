const config = require('../../config');

const coursesService = {
  /**
   * Helper to proxy authenticated requests to PeopleSoft HRMS LMS API
   */
  async callPeopleSoft(endpoint, method = 'GET', body = null, token = '') {
    const url = `${config.peopleSoftApiUrl}/api/lms${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    };
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    try {
      const options = {
        method,
        headers,
      };
      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({
        success: false,
        message: 'Invalid response from PeopleSoft LMS server',
      }));

      return {
        status: response.status,
        data,
      };
    } catch (error) {
      console.error(`[coursesService] Error connecting to PeopleSoft API at ${url}:`, error.message);
      return {
        status: 503,
        data: {
          success: false,
          message: `PeopleSoft LMS backend unavailable (${error.message})`,
        },
      };
    }
  },

  /**
   * Get courses mapped to the logged-in user
   */
  async getMyCourses(token) {
    return this.callPeopleSoft('/my-courses', 'GET', null, token);
  },

  /**
   * Get course timeline and video details
   */
  async getCourseTimeline(courseId, token) {
    return this.callPeopleSoft(`/courses/${courseId}/timeline`, 'GET', null, token);
  },

  /**
   * Update video progress & unlock next lesson
   */
  async updateVideoProgress(courseId, payload, token) {
    return this.callPeopleSoft(`/courses/${courseId}/progress`, 'POST', payload, token);
  },

  /**
   * Get notes and video slices for a course
   */
  async getCourseNotes(courseId, token) {
    return this.callPeopleSoft(`/courses/${courseId}/notes`, 'GET', null, token);
  },

  /**
   * Create a new note or video slice
   */
  async createCourseNote(courseId, payload, token) {
    return this.callPeopleSoft(`/courses/${courseId}/notes`, 'POST', payload, token);
  },

  /**
   * Delete a note or video slice
   */
  async deleteCourseNote(courseId, noteId, token) {
    return this.callPeopleSoft(`/courses/${courseId}/notes/${noteId}`, 'DELETE', null, token);
  },
};

module.exports = coursesService;
