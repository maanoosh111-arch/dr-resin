import { API_BASE_URL } from './config.js';

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export async function fetchProducts(fresh = false) {
  const res = await fetch(apiUrl(`/api/products${fresh ? '?fresh=1' : ''}`));
  if (!res.ok) throw new Error('Catalog fetch failed');
  return res.json();
}

export async function fetchStoreSettings() {
  const res = await fetch(apiUrl('/api/settings'));
  if (!res.ok) throw new Error('Settings fetch failed');
  return res.json();
}

export async function lookupCustomerOrders(trackedCodes = [], phoneQuery = '') {
  const params = new URLSearchParams();
  if (trackedCodes.length > 0) params.set('codes', trackedCodes.join(','));
  if (phoneQuery) params.set('phone', phoneQuery);
  if (!params.toString()) return { orders: [] };
  const res = await fetch(apiUrl(`/api/orders?${params.toString()}`));
  if (!res.ok) throw new Error('Orders lookup failed');
  return res.json();
}

export async function submitCustomerOrder(payload) {
  const res = await fetch(apiUrl('/api/orders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function getChefAuthStatus(bearerToken = '') {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl('/api/chef/auth-status'), { headers });
  if (!res.ok) throw new Error('Auth status check failed');
  return res.json();
}

export async function submitChefAuth(needsSetup, pin) {
  const endpoint = needsSetup ? '/api/chef/setup-pin' : '/api/chef/auth';
  const res = await fetch(apiUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function logoutChef(bearerToken = '') {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  await fetch(apiUrl('/api/chef/logout'), { method: 'POST', headers });
}

export async function fetchChefOrders(bearerToken = '') {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl('/api/chef/orders'), { headers });
  const data = res.ok ? await res.json() : null;
  return { ok: res.ok, status: res.status, data };
}

export async function patchChefOrder(orderId, patch, bearerToken = '') {
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl(`/api/chef/orders/${encodeURIComponent(orderId)}`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  const data = res.ok ? await res.json() : null;
  return { ok: res.ok, status: res.status, data };
}

export async function deleteChefOrder(orderId, bearerToken = '') {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl(`/api/chef/orders/${encodeURIComponent(orderId)}`), {
    method: 'DELETE',
    headers,
  });
  return { ok: res.ok, status: res.status };
}

export async function bulkDeleteChefOrders(payload, bearerToken = '') {
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl('/api/chef/orders/bulk-delete'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status };
}

export async function saveChefSettings(payload, bearerToken = '') {
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl('/api/chef/settings'), {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  const data = res.ok ? await res.json() : null;
  return { ok: res.ok, status: res.status, data };
}

export async function resetChefAnalyticsBaseline(bearerToken = '') {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl('/api/chef/sales-profits/reset'), {
    method: 'POST',
    headers,
  });
  const data = res.ok ? await res.json() : null;
  return { ok: res.ok, status: res.status, data };
}

export async function fetchChefProducts(fresh = false, bearerToken = '') {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const res = await fetch(apiUrl(`/api/chef/products${fresh ? '?fresh=1' : ''}`), { headers });
  const data = res.ok ? await res.json() : null;
  return { ok: res.ok, status: res.status, data };
}
