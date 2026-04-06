import axios from 'axios';

const API_BASE_URL=import.meta.env.VITE_API_BASE_URL || '/api/v1';

const api=axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
    try {
        const clerk=window.Clerk;
        if (clerk?.session) {
            const token=await clerk.session.getToken();
            if (token) config.headers.Authorization=`Bearer ${token}`;
        }
    } catch (err) {
        console.warn('[ModelMesh] Could not attach Clerk token:', err.message);
    }
    return config;
});

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status=== 401) {
            console.warn('[ModelMesh] 401 Unauthorized €” session may have expired.');
        }
        return Promise.reject(err);
    }
);

export default api;

export const authApi={
    me: () => api.get('/auth/me'),
    sync: () => api.post('/auth/sync'),
};

export const baseModelsApi={
    list: () => api.get('/base-models'),
    catalogue: () => api.get('/base-models/catalogue'),
};

export const modelsApi={
    list: (params) => api.get('/models', { params }),
    get: (id) => api.get(`/models/${id}`),
    delete: (id) => api.delete(`/models/${id}`),

    publish: (formData) => api.post('/models/publish', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: formData._onProgress || undefined,
    }),
};

export const versionsApi={
    list: (modelId) => api.get(`/models/${modelId}/versions`),
    get: (modelId, verId) => api.get(`/models/${modelId}/versions/${verId}`),
    upload: (modelId, formData) => api.post(`/models/${modelId}/versions/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const sessionsApi={
    create: (data) => api.post('/sessions', data),
    list: (params) => api.get('/sessions', { params }),
    get: (key) => api.get(`/sessions/${key}`),
    start: (key, data={ confirm_min_clients: true }) => api.post(`/sessions/${key}/start`, data),
    publishFinal: (key) => api.post(`/sessions/${key}/publish-final`),
    requestAccess: (id, data={}) => api.post(`/sessions/${id}/request-access`, data),
    approveRequest: (id, requestUserId) => api.post(`/sessions/${id}/requests/${requestUserId}/approve`),
    lockJoin: (id) => api.post(`/sessions/${id}/lock-join`),
    delete: (id) => api.delete(`/sessions/${id}`),
    clearEvents: (key) => api.delete(`/sessions/${key}/clear-events`),
};
