import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// Sportchining o'z ma'lumotlari (shaxsiy kabinet)
export const athleteSelfAPI = {
  verify: () => api.get('/athlete/verify'),     // profil
  history: () => api.get('/athlete/history'),   // mashg'ulot tarixi
  team: () => api.get('/athlete/team'),         // jamoam (trenerlar + jamoadoshlar)
};

// Admin
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getAuditLog: (params) => api.get('/admin/audit-log', { params }),
  getUsers: (params) => api.get('/admin/users', { params }),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  resetPassword: (id, data) => api.post(`/admin/users/${id}/reset-password`, data),
};

// Athletes
export const athletesAPI = {
  getAll: (params) => api.get('/athletes', { params }),
  getById: (id) => api.get(`/athletes/${id}`),
  getSessions: (id) => api.get(`/athletes/${id}/sessions`),
  create: (data) => api.post('/athletes', data),
  update: (id, data) => api.put(`/athletes/${id}`, data),
  delete: (id) => api.delete(`/athletes/${id}`),
};

// Teams (Jamoalar) — ko'p trener, ixtiyoriy filial
export const teamsAPI = {
  getAll: () => api.get('/teams'),
  getById: (id) => api.get(`/teams/${id}`),
  create: (data) => api.post('/teams', data),
  update: (id, data) => api.put(`/teams/${id}`, data),
  delete: (id) => api.delete(`/teams/${id}`),
  getCoaches: () => api.get('/teams/coaches'),
  addAthlete: (id, athlete_id) => api.post(`/teams/${id}/athletes`, { athlete_id }),
  removeAthlete: (id, athlete_id) => api.delete(`/teams/${id}/athletes/${athlete_id}`),
};

// Sessions
export const sessionsAPI = {
  getAll: (params) => api.get('/sessions', { params }),
  getById: (id) => api.get(`/sessions/${id}`),
  create: (data) => api.post('/sessions', data),
  saveSensorData: (id, data) => api.post(`/sessions/${id}/sensor-data`, data),
  complete: (id) => api.post(`/sessions/${id}/complete`),
  validate: (id) => api.post(`/sessions/${id}/validate`),
};

// Analytics
export const analyticsAPI = {
  getSports: () => api.get('/analytics/sports'),
  createSport: (data) => api.post('/analytics/sports', data),
  updateSport: (id, data) => api.put(`/analytics/sports/${id}`, data),
  deleteSport: (id) => api.delete(`/analytics/sports/${id}`),
  getTeams: (params) => api.get('/analytics/teams', { params }),
  getProtocols: () => api.get('/analytics/protocols'),
  createProtocol: (data) => api.post('/analytics/protocols', data),
  getDynamics: (athleteId, params) => api.get(`/analytics/dynamics/${athleteId}`, { params }),
  getPrePost: (athleteId, params) => api.get(`/analytics/pre-post/${athleteId}`, { params }),
  getGroupComparison: (params) => api.get('/analytics/group-comparison', { params }),
  getRecommendation: (athleteId) => api.get(`/analytics/recommendation/${athleteId}`),
};

export default api;
