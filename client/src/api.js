// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const TOKEN_KEY = 'onyx.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
};

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth && token) {
    setToken(null);
    window.dispatchEvent(new Event('onyx:signed-out'));
  }
  if (!res.ok) throw new ApiError(data?.error?.message || `Request failed with ${res.status}`, res.status, data?.error);
  return data;
}

export const api = {
  get: (path) => request(`/dashboard${path}`),
  post: (path, body) => request(`/dashboard${path}`, { method: 'POST', body: body || {} }),
  del: (path) => request(`/dashboard${path}`, { method: 'DELETE' }),
};

export const checkoutApi = {
  get: (id, secret) => request(`/checkout/${id}?secret=${encodeURIComponent(secret)}`, { auth: false }),
  confirm: (id, secret, body) => request(`/checkout/${id}/confirm?secret=${encodeURIComponent(secret)}`, { method: 'POST', body, auth: false }),
};
