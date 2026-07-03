/**
 * Thin API wrappers grouped by feature.
 * Pages should always go through these (not raw axios) so the
 * URL surface is consistent and easy to refactor.
 */
import api from './api.js';

export const authApi = {
  login: (data) => api.post('/auth/login', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout'),
};

export const patientsApi = {
  search:  (params) => api.get('/patients', { params }).then((r) => r.data),
  get:     (id)     => api.get(`/patients/${id}`).then((r) => r.data),
  history: (id)     => api.get(`/patients/${id}/history`).then((r) => r.data),
  createNew:    (data) => api.post('/patients', data).then((r) => r.data),
  // Pass `{ force: true }` to bypass the "already in queue today" 409.
  createOldCase:(id, data, opts = {}) =>
    api.post(`/patients/${id}/old-case`, { ...(data || {}), ...(opts.force ? { force: true } : {}) })
       .then((r) => r.data),
  updateDemographics: (id, data) => api.put(`/patients/${id}/demographics`, data).then((r) => r.data),
  remove:  (id) => api.delete(`/patients/${id}`),
};

export const visitsApi = {
  get:    (id)     => api.get(`/visits/${id}`).then((r) => r.data),
  search: (params) => api.get('/visits/search', { params }).then((r) => r.data),
  cancel: (id)     => api.post(`/visits/${id}/cancel`),
};

export const moApi = {
  queue: () => api.get('/mo/queue').then((r) => r.data),
  save:  (visitId, data) => api.post(`/mo/${visitId}`, data).then((r) => r.data),
  stats: (params) => api.get('/mo/stats', { params }).then((r) => r.data),
};

export const doctorApi = {
  queue: () => api.get('/doctor/queue').then((r) => r.data),
  save:  (visitId, data) => api.post(`/doctor/${visitId}`, data).then((r) => r.data),
};

export const mastersApi = {
  list:   (key, params) => api.get(`/masters/${key}`, { params }).then((r) => r.data),
  create: (key, data)   => api.post(`/masters/${key}`, data).then((r) => r.data),
  update: (key, id, data) => api.put(`/masters/${key}/${id}`, data).then((r) => r.data),
  remove: (key, id)     => api.delete(`/masters/${key}/${id}`),
};

export const reportsApi = {
  upload: (patientId, visitId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('patientId', patientId);
    if (visitId) fd.append('visitId', visitId);
    return api.post('/reports/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  listForPatient: (patientId) => api.get(`/reports/patient/${patientId}`).then((r) => r.data),
  remove: (id) => api.delete(`/reports/${id}`),
};

export const dashboardApi = {
  summary: () => api.get('/dashboard').then((r) => r.data),
};

export const printApi = {
  prescriptionUrl: (visitId) => `/api/print/prescription/${visitId}`,
  billUrl:         (billId)  => `/api/print/bill/${billId}`,
};

export const billsApi = {
  listAuto:  (params) => api.get('/bills/auto',  { params }).then((r) => r.data),
  listFinal: (params) => api.get('/bills/final', { params }).then((r) => r.data),
  get:       (id)     => api.get(`/bills/${id}`).then((r) => r.data),
  convertToFinal: (id) => api.post(`/bills/${id}/convert`).then((r) => r.data),
  update:    (id, data) => api.put(`/bills/${id}`, data).then((r) => r.data),
  lock:      (id)     => api.post(`/bills/${id}/lock`).then((r) => r.data),
};

export const settingsApi = {
  get:    () => api.get('/settings').then((r) => r.data),
  update: (data) => api.put('/settings', data).then((r) => r.data),
  uploadLogo: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/settings/logo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  logoUrl: () => `/api/settings/logo?ts=${Date.now()}`,
};

export const billingApi = {
  list:   (visitId) => api.get(`/billing/visit/${visitId}`).then((r) => r.data),
  add:    (visitId, data) => api.post(`/billing/visit/${visitId}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/billing/${id}`),
};

export const usersApi = {
  list:   () => api.get('/users').then((r) => r.data),
  create: (data) => api.post('/users', data).then((r) => r.data),
  update: (id, data) => api.put(`/users/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`),
};

export const ipdApi = {
  wards: {
    list:   (params) => api.get('/ipd/wards', { params }).then((r) => r.data),
    create: (data)   => api.post('/ipd/wards', data).then((r) => r.data),
    update: (id, d)  => api.put(`/ipd/wards/${id}`, d).then((r) => r.data),
    remove: (id)     => api.delete(`/ipd/wards/${id}`),
  },
  beds: {
    list:   (params) => api.get('/ipd/beds', { params }).then((r) => r.data),
    create: (data)   => api.post('/ipd/beds', data).then((r) => r.data),
    bulkCreate: (data) => api.post('/ipd/beds/bulk', data).then((r) => r.data),
    update: (id, d)  => api.put(`/ipd/beds/${id}`, d).then((r) => r.data),
    remove: (id)     => api.delete(`/ipd/beds/${id}`),
  },
  admissions: {
    list:      (params) => api.get('/ipd/admissions', { params }).then((r) => r.data),
    get:       (id)     => api.get(`/ipd/admissions/${id}`).then((r) => r.data),
    request:   (data)   => api.post('/ipd/admissions', data).then((r) => r.data),
    assignBed: (id, bedId) =>
      api.post(`/ipd/admissions/${id}/assign-bed`, { bedId }).then((r) => r.data),
    discharge: (id, notes) =>
      api.post(`/ipd/admissions/${id}/discharge`, { notes }).then((r) => r.data),
    cancel:    (id) => api.post(`/ipd/admissions/${id}/cancel`),
  },
  indoorSheet: {
    get:       (admissionId)          => api.get(`/ipd/admissions/${admissionId}/indoor-sheet`).then((r) => r.data),
    save:      (admissionId, days)    => api.put(`/ipd/admissions/${admissionId}/indoor-sheet`, { days }).then((r) => r.data),
    deleteDay: (admissionId, date)    =>
      api.delete(`/ipd/admissions/${admissionId}/indoor-sheet/day`, { params: { date } }).then((r) => r.data),
    pdfUrl:    (admissionId)          => `/api/ipd/admissions/${admissionId}/indoor-sheet/pdf`,
    // Admin dashboard — everything edited in the last N hours across all patients.
    recent:      (params)             => api.get('/ipd/indoor-sheet/recent', { params }).then((r) => r.data),
    recentCount: (params)             => api.get('/ipd/indoor-sheet/recent-count', { params }).then((r) => r.data),
  },
};

export const diseaseTemplatesApi = {
  listDiseases: () => api.get('/disease-templates').then((r) => r.data),
  get:          (diseaseId) => api.get(`/disease-templates/${diseaseId}`).then((r) => r.data),
  replace:      (diseaseId, items) =>
    api.put(`/disease-templates/${diseaseId}`, { items }).then((r) => r.data),
};

export const registersApi = {
  threeC: (fromDate, toDate, mode = 'day') =>
    api.get('/registers/3c', { params: { fromDate, toDate, mode } }).then((r) => r.data),
  threeCPdfUrl: (fromDate, toDate, mode = 'day') =>
    `/api/registers/3c/pdf?fromDate=${fromDate}&toDate=${toDate}&mode=${mode}`,
  // Save (or clear with amount === null) a manual per-day amount override.
  setThreeCAmount: (date, amount) =>
    api.put('/registers/3c/amount', { date, amount }).then((r) => r.data),
  ipd: {
    list:   (params)  => api.get('/registers/3c-ipd', { params }).then((r) => r.data),
    create: (data)    => api.post('/registers/3c-ipd', data).then((r) => r.data),
    update: (id, d)   => api.put(`/registers/3c-ipd/${id}`, d).then((r) => r.data),
    remove: (id)      => api.delete(`/registers/3c-ipd/${id}`),
    pdfUrl: (fromDate, toDate) =>
      `/api/registers/3c-ipd/pdf?fromDate=${fromDate || ''}&toDate=${toDate || ''}`,
  },
};

export const remindersApi = {
  list:        (params) => api.get('/reminders', { params }).then((r) => r.data),
  listActive:  () => api.get('/reminders', { params: { active: 1 } }).then((r) => r.data),
  create: (data)      => api.post('/reminders', data).then((r) => r.data),
  update: (id, data)  => api.put(`/reminders/${id}`, data).then((r) => r.data),
  complete:   (id)    => api.post(`/reminders/${id}/complete`).then((r) => r.data),
  uncomplete: (id)    => api.post(`/reminders/${id}/uncomplete`).then((r) => r.data),
  remove: (id)        => api.delete(`/reminders/${id}`),
};
