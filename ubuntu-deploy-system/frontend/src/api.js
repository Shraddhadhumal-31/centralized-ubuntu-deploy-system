const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }

  async request(method, endpoint, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, opts);

    if (res.status === 401 || res.status === 403) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      if (!res.ok) {
        throw new Error(text || `Request failed with HTTP status ${res.status}`);
      }
      data = { raw: text };
    }

    if (!res.ok) {
      const errDetail = data?.detail || data?.message || data?.error || text || `Request failed (${res.status})`;
      throw new Error(typeof errDetail === 'object' ? JSON.stringify(errDetail) : String(errDetail));
    }

    return data;
  }

  get(ep) { return this.request('GET', ep); }
  post(ep, body) { return this.request('POST', ep, body); }
  put(ep, body) { return this.request('PUT', ep, body); }
  delete(ep) { return this.request('DELETE', ep); }

  async login(u, p) {
    const d = await this.post('/auth/login', { username: u, password: p });
    this.setToken(d.access_token);
    return d;
  }
  logout() { this.setToken(null); }

  // Dashboard
  getDashboard() { return this.get('/dashboard'); }
  resetCounters(scope = 'all') {
    return this.post('/dashboard/reset-counters', { scope });
  }
  getTasksByStatus(status, taskType = null, period = 'current') {
    let q = `/dashboard/tasks-by-status?status=${encodeURIComponent(status)}&period=${encodeURIComponent(period)}`;
    if (taskType) q += `&task_type=${encodeURIComponent(taskType)}`;
    return this.get(q);
  }

  // Computers & Roles
  getComputers() { return this.get('/computers'); }
  registerMasterPC(hostname, mac, imageId = 0) {
    return this.post('/computers/master', { hostname, mac, image_id: imageId });
  }
  registerComputer(hostname, mac, imageId = 0, role = 'client') {
    return this.post('/computers', { hostname, mac, image_id: imageId, role });
  }
  batchRegisterComputers(hosts) {
    return this.post('/computers/batch', { hosts });
  }
  getMasterPC() { return this.get('/computers/master'); }
  setMasterPC(hostId = null, hostname = null) {
    return this.post('/computers/master', { host_id: hostId, hostname });
  }
  updateComputerRole(hostId, role) {
    return this.put(`/computers/${hostId}/role`, { role });
  }
  deleteComputer(hostId) {
    return this.delete(`/computers/${hostId}`);
  }

  // Images
  getImages() { return this.get('/images'); }
  getUsableImages() { return this.get('/images/usable'); }
  createImage(name, path = '', description = '') {
    return this.post('/images', { name, path, description });
  }
  deleteImage(imageId) {
    return this.delete(`/images/${imageId}`);
  }
  captureImage(hostId, imageId = null, newImageName = null) {
    return this.post('/images/capture', {
      host_id: hostId,
      image_id: imageId,
      new_image_name: newImageName,
    });
  }

  // Deployments
  createDeployment(hostIds, imageId) {
    return this.post('/deployments', { host_ids: hostIds, image_id: imageId });
  }
  cancelDeployment(hostId) {
    return this.delete(`/deployments/cancel/${hostId}`);
  }
  clearDeploymentHistory() {
    return this.delete('/deployments/history/clear');
  }
  getActiveDeployments() { return this.get('/deployments/active'); }
  getDeploymentHistory(params = {}) {
    const q = new URLSearchParams();
    if (params.year) q.set('year', params.year);
    if (params.month) q.set('month', params.month);
    if (params.task_type) q.set('task_type', params.task_type);
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.page) q.set('page', params.page);
    if (params.page_size) q.set('page_size', params.page_size);
    const qs = q.toString();
    return this.get(`/deployments/history${qs ? `?${qs}` : ''}`);
  }

  // Tools
  sendWOL(macs) { return this.post('/wol', { mac_addresses: macs }); }
  getHealth() { return this.get('/health'); }
}

export const api = new ApiClient();
