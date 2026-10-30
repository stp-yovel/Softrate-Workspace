const API_BASE_URL = import.meta.env.VITE_API_URL || '';

function getAuthHeaders(token) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
  if (token) {
    headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  return headers;
}

export async function fetchMyCourses(token) {
  const response = await fetch(`${API_BASE_URL}/api/courses/my-courses`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  return response.json();
}

export async function fetchCourseTimeline(courseId, token) {
  const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/timeline`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  return response.json();
}

export async function updateVideoProgress(courseId, payload, token) {
  const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/progress`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  return response.json();
}

export async function fetchCourseNotes(courseId, token) {
  const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/notes`, {
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  return response.json();
}

export async function createCourseNote(courseId, payload, token) {
  const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/notes`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  return response.json();
}

export async function deleteCourseNote(courseId, noteId, token) {
  const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/notes/${noteId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
    cache: 'no-store',
  });
  return response.json();
}
