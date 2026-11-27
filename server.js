import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const ROOT_DIR = process.cwd();
const PORT = Number(process.env.PORT || 3000);
const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || '1dr4wiPp1-1SgAj4v0j_8-8MD7OQhqrgKt8yOTHxR_v0';
const SUPPORT_PHONE = '0 12 74211223';
const CURRENCY = 'USD';
const BRAND_NAME = 'DR - Premium Resin Products';

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const DATA_DIR = path.resolve(ROOT_DIR, '.data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_STORE = {
  settings: {
    isOpen: true,
    openTime: '10:00 AM',
    closeTime: '11:00 PM',
    customNote: 'Handcrafted to order. Nationwide curated courier delivery.',
    deliveryFee: 15,
    heroEyebrow: 'DR-4802-OCN',
    heroTitle: 'NATURAL WALNUT & DEEP OCEAN EPOXY RESIN',
    heroSubtitle: 'DR - Premium Resin Products',
    supportPhone: SUPPORT_PHONE,
    currency: CURRENCY,
    brandName: BRAND_NAME,
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  orders: [],
  nextOrderSeq: 1001,
  analyticsBaselineAt: null,
  adminPinHash: null,
};

function loadStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        settings: {
          ...DEFAULT_STORE.settings,
          ...(parsed.settings || {}),
          currency: CURRENCY,
          brandName: BRAND_NAME,
        },
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        nextOrderSeq: typeof parsed.nextOrderSeq === 'number' ? parsed.nextOrderSeq : 1001,
        analyticsBaselineAt: parsed.analyticsBaselineAt || null,
        adminPinHash: parsed.adminPinHash || null,
      };
    }
  } catch (err) {
    console.error('Failed to read local store file:', err);
  }
  return structuredClone(DEFAULT_STORE);
}

let store = loadStore();

function saveStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Failed to persist store file:', err);
  }
}

// Server-side Firestore access using the Railway service-account secret.
// The service account stays on the server and bypasses client Firestore rules safely.
let firebasePublicConfig = null;
try {
  const cfgPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) firebasePublicConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
} catch { firebasePublicConfig = null; }

let firebaseServiceAccount = null;
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) firebaseServiceAccount = JSON.parse(raw);
} catch (err) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON:', err.message);
}

const FIREBASE_PROJECT_ID = firebasePublicConfig?.projectId || firebaseServiceAccount?.project_id || '';
const FIRESTORE_DATABASE_ID = firebasePublicConfig?.firestoreDatabaseId || '(default)';
let firebaseAccessToken = '';
let firebaseTokenExpiresAt = 0;
const hasFirebaseAdmin = Boolean(
  firebaseServiceAccount?.client_email &&
  firebaseServiceAccount?.private_key &&
  FIREBASE_PROJECT_ID &&
  (!firebaseServiceAccount.project_id || firebaseServiceAccount.project_id === FIREBASE_PROJECT_ID)
);

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getFirebaseAccessToken() {
  if (!hasFirebaseAdmin) throw new Error('Firebase service account is not configured or its project does not match firebase-applet-config.json.');
  if (firebaseAccessToken && Date.now() < firebaseTokenExpiresAt - 60_000) return firebaseAccessToken;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: firebaseServiceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: firebaseServiceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + '.' + claim;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + '.' + signer.sign(firebaseServiceAccount.private_key, 'base64url');
  const tokenUrl = firebaseServiceAccount.token_uri || 'https://oauth2.googleapis.com/token';
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error('Google OAuth token exchange failed: ' + (payload.error_description || payload.error || response.status));
  }
  firebaseAccessToken = payload.access_token;
  firebaseTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return firebaseAccessToken;
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) fields[key] = firestoreValue(entry);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

async function firestoreRequest(method, documentPath, body = undefined) {
  const token = await getFirebaseAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/${documentPath}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) return null;
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Firestore ${method} ${documentPath} failed (${response.status}): ${responseText.slice(0, 500)}`);
  return responseText ? JSON.parse(responseText) : {};
}

async function getFirestoreDocument(collectionName, documentId) {
  const doc = await firestoreRequest('GET', `${collectionName}/${encodeURIComponent(documentId)}`);
  return doc?.fields ? fromFirestoreFields(doc.fields) : null;
}

async function setFirestoreDocument(collectionName, documentId, data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) fields[key] = firestoreValue(value);
  }
  return firestoreRequest('PATCH', `${collectionName}/${encodeURIComponent(documentId)}`, { fields });
}

async function listFirestoreCollection(collectionName) {
  const all = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const result = await firestoreRequest('GET', `${collectionName}?${query.toString()}`);
    for (const doc of result?.documents || []) {
      const id = doc.name.split('/').pop();
      all.push({ id, ...fromFirestoreFields(doc.fields || {}) });
    }
    pageToken = result?.nextPageToken || '';
  } while (pageToken);
  return all;
}

function normalizeFirestoreSettings(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    isOpen: typeof data.isOpen === 'boolean' ? data.isOpen : store.settings.isOpen,
    openTime: String(data.openTime || store.settings.openTime).slice(0, 32),
    closeTime: String(data.closeTime || store.settings.closeTime).slice(0, 32),
    customNote: String(data.customNote ?? store.settings.customNote).slice(0, 500),
    deliveryFee: Number.isFinite(Number(data.deliveryFee)) ? Number(data.deliveryFee) : store.settings.deliveryFee,
    heroEyebrow: String(data.heroEyebrow ?? store.settings.heroEyebrow).slice(0, 120),
    heroTitle: String(data.heroTitle || store.settings.heroTitle).slice(0, 200),
    heroSubtitle: String(data.heroSubtitle ?? store.settings.heroSubtitle).slice(0, 300),
    supportPhone: String(data.supportPhone || store.settings.supportPhone || SUPPORT_PHONE).slice(0, 32),
    updatedAt: String(data.updatedAt || new Date().toISOString()),
  };
}

async function syncStoreSettingsFromFirestorePublicRest() {
  if (!hasFirebaseAdmin) return;
  try {
    const remote = await getFirestoreDocument('storeSettings', 'public');
    if (remote) store.settings = { ...store.settings, ...normalizeFirestoreSettings(remote) };
  } catch (err) {
    console.error('Firestore settings read failed:', err.message);
  }
}

async function syncSettingsToFirestore(settings) {
  if (!hasFirebaseAdmin) return;
  await setFirestoreDocument('storeSettings', 'public', {
    isOpen: Boolean(settings.isOpen),
    openTime: String(settings.openTime || '10:00 AM').slice(0, 32),
    closeTime: String(settings.closeTime || '11:00 PM').slice(0, 32),
    customNote: String(settings.customNote || '').slice(0, 500),
    deliveryFee: Number(settings.deliveryFee || 0),
    heroEyebrow: String(settings.heroEyebrow || '').slice(0, 120),
    heroTitle: String(settings.heroTitle || '').slice(0, 200),
    heroSubtitle: String(settings.heroSubtitle || '').slice(0, 300),
    supportPhone: String(settings.supportPhone || SUPPORT_PHONE).slice(0, 32),
    updatedAt: String(settings.updatedAt || new Date().toISOString()),
  });
}

function firestoreOrderPayload(order) {
  return {
    orderCode: String(order.orderCode || '').slice(0, 32),
    customerName: String(order.customerName || '').slice(0, 120),
    customerPhone: String(order.customerPhone || '').slice(0, 32),
    deliveryAddress: String(order.deliveryAddress || '').slice(0, 400),
    deliveryNotes: String(order.deliveryNotes || '').slice(0, 400),
    paymentMethod: String(order.paymentMethod || 'Pay on Delivery').slice(0, 64),
    senderWalletPhone: String(order.senderWalletPhone || '').slice(0, 32),
    items: Array.isArray(order.items) ? order.items.slice(0, 50) : [],
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    grandTotal: Number(order.grandTotal || 0),
    totalProfit: Number(order.totalProfit || 0),
    status: String(order.status || 'Pending'),
    rejectionReason: String(order.rejectionReason || '').slice(0, 400),
    isPaid: Boolean(order.isPaid),
    isArchived: Boolean(order.isArchived),
    isDeletedFromArchive: Boolean(order.isDeletedFromArchive),
    createdAt: String(order.createdAt || new Date().toISOString()),
    updatedAt: String(order.updatedAt || new Date().toISOString()),
    ...(order.completedAt ? { completedAt: String(order.completedAt) } : {}),
  };
}

async function syncOrderToFirestore(order) {
  if (!hasFirebaseAdmin) return;
  await setFirestoreDocument('orders', order.id, firestoreOrderPayload(order));
}

async function syncFirestoreOnBoot() {
  if (!hasFirebaseAdmin) {
    console.warn('Firebase Admin persistence is disabled: FIREBASE_SERVICE_ACCOUNT_JSON is unavailable or invalid.');
    return;
  }
  try {
    // Firestore is the source of truth. Import local records only when the remote collection is empty.
    const remoteSettings = await getFirestoreDocument('storeSettings', 'public');
    if (remoteSettings) {
      store.settings = { ...store.settings, ...normalizeFirestoreSettings(remoteSettings) };
    } else {
      await syncSettingsToFirestore(store.settings);
    }

    const remoteMeta = await getFirestoreDocument('chefMeta', 'analytics');
    if (remoteMeta?.analyticsBaselineAt) store.analyticsBaselineAt = remoteMeta.analyticsBaselineAt;

    const remoteOrders = await listFirestoreCollection('orders');
    if (remoteOrders.length) {
      store.orders = remoteOrders.map((row) => ({
        ...row,
        id: row.id,
        items: Array.isArray(row.items) ? row.items : [],
      })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const maxNum = store.orders.reduce((max, order) => {
        const number = Number(String(order.orderCode || '').replace(/\D/g, ''));
        return Number.isFinite(number) && number > max ? number : max;
      }, 1000);
      store.nextOrderSeq = Math.max(store.nextOrderSeq, maxNum + 1);
    } else {
      for (const order of store.orders) await syncOrderToFirestore(order);
    }
    saveStore();
    console.log(`Firebase Firestore connected: project=${FIREBASE_PROJECT_ID}, database=${FIRESTORE_DATABASE_ID}, orders=${store.orders.length}`);
  } catch (err) {
    console.error('Firebase Firestore initialization failed:', err.message);
  }
}

// Optional Supabase PostgREST synchronization when environment secrets are configured
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '') || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

async function supabaseFetch(table, method, query = '', body = undefined) {
  if (!hasSupabase) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=representation',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function syncFromSupabaseOnBoot() {
  if (!hasSupabase) return;
  try {
    const remoteSettings = await supabaseFetch('store_settings', 'GET', '?id=eq.default&limit=1');
    if (Array.isArray(remoteSettings) && remoteSettings[0]) {
      const s = remoteSettings[0];
      store.settings = {
        ...store.settings,
        isOpen: typeof s.is_open === 'boolean' ? s.is_open : store.settings.isOpen,
        openTime: typeof s.open_time === 'string' ? s.open_time : store.settings.openTime,
        closeTime: typeof s.close_time === 'string' ? s.close_time : store.settings.closeTime,
        customNote: typeof s.custom_note === 'string' ? s.custom_note : store.settings.customNote,
        deliveryFee: typeof s.delivery_fee === 'number' ? s.delivery_fee : store.settings.deliveryFee,
        heroEyebrow: typeof s.hero_eyebrow === 'string' ? s.hero_eyebrow : store.settings.heroEyebrow,
        heroTitle: typeof s.hero_title === 'string' ? s.hero_title : store.settings.heroTitle,
        heroSubtitle: typeof s.hero_subtitle === 'string' ? s.hero_subtitle : store.settings.heroSubtitle,
        updatedAt: typeof s.updated_at === 'string' ? s.updated_at : store.settings.updatedAt,
      };
    }

    const remoteOrders = await supabaseFetch('orders', 'GET', '?order=created_at.desc');
    if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
      store.orders = remoteOrders.map((row) => ({
        id: String(row.id),
        orderCode: String(row.order_code),
        customerName: String(row.customer_name || ''),
        customerPhone: String(row.customer_phone || ''),
        deliveryAddress: String(row.delivery_address || ''),
        deliveryNotes: String(row.delivery_notes || ''),
        paymentMethod: String(row.payment_method || ''),
        senderWalletPhone: String(row.sender_wallet_phone || ''),
        receiptImageDataUrl: String(row.receipt_image_data_url || ''),
        items: Array.isArray(row.items) ? row.items : [],
        subtotal: Number(row.subtotal || 0),
        deliveryFee: Number(row.delivery_fee || 0),
        grandTotal: Number(row.grand_total || 0),
        totalProfit: Number(row.total_profit || 0),
        status: row.status || 'Pending',
        rejectionReason: String(row.rejection_reason || ''),
        isPaid: Boolean(row.is_paid),
        isArchived: Boolean(row.is_archived),
        isDeletedFromArchive: Boolean(row.is_deleted_from_archive),
        createdAt: String(row.created_at || new Date().toISOString()),
        updatedAt: String(row.updated_at || new Date().toISOString()),
        completedAt: row.completed_at ? String(row.completed_at) : undefined,
      }));
      const maxNum = store.orders.reduce((max, o) => {
        const num = Number(o.orderCode.replace(/\D/g, ''));
        return Number.isFinite(num) && num > max ? num : max;
      }, 1000);
      store.nextOrderSeq = Math.max(store.nextOrderSeq, maxNum + 1);
    }
    saveStore();
  } catch {
    // Continue with local persistence seamlessly
  }
}

async function syncSettingsToSupabase(settings) {
  if (!hasSupabase) return;
  await supabaseFetch('store_settings', 'POST', '?on_conflict=id', {
    id: 'default',
    is_open: settings.isOpen,
    open_time: settings.openTime,
    close_time: settings.closeTime,
    custom_note: settings.customNote,
    delivery_fee: settings.deliveryFee,
    hero_eyebrow: settings.heroEyebrow,
    hero_title: settings.heroTitle,
    hero_subtitle: settings.heroSubtitle,
    updated_at: settings.updatedAt,
  });
}

async function syncOrderToSupabase(order) {
  if (!hasSupabase) return;
  await supabaseFetch('orders', 'POST', '?on_conflict=id', {
    id: order.id,
    order_code: order.orderCode,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    delivery_address: order.deliveryAddress,
    delivery_notes: order.deliveryNotes,
    payment_method: order.paymentMethod,
    sender_wallet_phone: order.senderWalletPhone,
    receipt_image_data_url: order.receiptImageDataUrl,
    items: order.items,
    subtotal: order.subtotal,
    delivery_fee: order.deliveryFee,
    grand_total: order.grandTotal,
    total_profit: order.totalProfit,
    status: order.status,
    rejection_reason: order.rejectionReason,
    is_paid: order.isPaid,
    is_archived: order.isArchived,
    is_deleted_from_archive: order.isDeletedFromArchive,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    completed_at: order.completedAt || null,
  });
}

// RFC-4180 compliant CSV parser
function parseCsvRfc4180(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function sanitizeImageCell(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('=')) return [];

  return trimmed
    .split(/[\n,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

function makeSlug(name, fallbackId) {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (cleaned && /[a-zA-Z0-9]/.test(cleaned)) {
    return cleaned;
  }
  const safeId = String(fallbackId || 'piece')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safeId || 'piece';
}

function parseNumeric(raw) {
  if (!raw) return NaN;
  const cleaned = String(raw).replace(/[^0-9.-]+/g, '');
  return cleaned ? Number(cleaned) : NaN;
}

let catalogCache = {
  products: [],
  categories: [],
  fetchedAt: 0,
};

const CACHE_TTL_MS = 15_000;

async function discoverSheetTabs() {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/htmlview`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/items\.push\(\{name:\s*"([^"]+)"[\s\S]*?gid:\s*"(\d+)"/g)];
      if (matches.length > 0) {
        const seen = new Set();
        const tabs = [];
        for (const m of matches) {
          const name = m[1].trim();
          const gid = m[2].trim();
          if (name && gid && !seen.has(gid)) {
            seen.add(gid);
            tabs.push({ name, gid });
          }
        }
        if (tabs.length > 0) return tabs;
      }
    }
  } catch (err) {
    console.warn('Sheet tab discovery fallback triggered:', err);
  }
  return [{ name: 'Collection', gid: '0' }];
}

async function fetchCatalog(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && catalogCache.fetchedAt > 0 && now - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache;
  }

  const tabs = await discoverSheetTabs();
  const products = [];
  const categories = [];
  const usedSlugs = new Set();

  for (const tab of tabs) {
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(
        tab.gid
      )}`;
      const res = await fetch(csvUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const csvText = await res.text();
      const rows = parseCsvRfc4180(csvText);
      if (rows.length < 2) continue;

      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h === 'product name' || h === 'name');
      const priceIdx = headers.findIndex((h) => h === 'price');
      const costIdx = headers.findIndex((h) => h === 'cost');
      const profitIdx = headers.findIndex((h) => h === 'profit');
      const descIdx = headers.findIndex((h) => h === 'description' || h === 'desc');
      const primaryImgIdx = headers.findIndex((h) => h === 'primary image' || h === 'image');
      const prevIdx = headers.findIndex((h) => h === 'prev');
      const extraImgIdx = headers.findIndex((h) => h === 'extra images' || h === 'extra image');

      if (nameIdx === -1 || priceIdx === -1) continue;

      let tabHasProducts = false;
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name = (row[nameIdx] || '').trim();
        if (!name) continue;

        const price = parseNumeric(row[priceIdx]);
        if (!Number.isFinite(price) || price < 0) continue;

        const rawCost = costIdx >= 0 ? parseNumeric(row[costIdx]) : NaN;
        const rawProfit = profitIdx >= 0 ? parseNumeric(row[profitIdx]) : NaN;
        const cost = Number.isFinite(rawCost) ? rawCost : 0;
        const profit = Number.isFinite(rawProfit)
          ? rawProfit
          : Number.isFinite(rawCost)
          ? Number((price - rawCost).toFixed(2))
          : 0;

        const description = descIdx >= 0 ? (row[descIdx] || '').trim() : '';
        const primaryImages = primaryImgIdx >= 0 ? sanitizeImageCell(row[primaryImgIdx] || '') : [];
        const primaryImage = primaryImages[0] || '';

        const extraImagesSet = new Set();
        if (extraImgIdx >= 0) {
          for (let c = extraImgIdx; c < row.length; c++) {
            if (c === prevIdx) continue;
            for (const url of sanitizeImageCell(row[c] || '')) {
              if (url !== primaryImage) extraImagesSet.add(url);
            }
          }
        }
        for (let c = 0; c < row.length; c++) {
          if (
            c === nameIdx ||
            c === priceIdx ||
            c === costIdx ||
            c === profitIdx ||
            c === descIdx ||
            c === primaryImgIdx ||
            c === prevIdx
          ) {
            continue;
          }
          for (const url of sanitizeImageCell(row[c] || '')) {
            if (url !== primaryImage) extraImagesSet.add(url);
          }
        }

        const extraImages = Array.from(extraImagesSet);
        const images = primaryImage ? [primaryImage, ...extraImages] : [...extraImages];
        const id = `${tab.gid}-${r}`;
        let slug = makeSlug(name, id);
        if (usedSlugs.has(slug.toLowerCase())) {
          slug = `${slug}-${r}`;
        }
        usedSlugs.add(slug.toLowerCase());

        products.push({
          id,
          slug,
          name,
          category: tab.name,
          price: Number(price.toFixed(2)),
          cost: Number(cost.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          description,
          primaryImage,
          extraImages,
          images,
        });
        tabHasProducts = true;
      }

      if (tabHasProducts && !categories.includes(tab.name)) {
        categories.push(tab.name);
      }
    } catch (err) {
      console.error(`Failed loading sheet tab ${tab.name}:`, err);
    }
  }

  if (products.length === 0 && catalogCache.products.length > 0) {
    return catalogCache;
  }

  catalogCache = {
    products,
    categories,
    fetchedAt: Date.now(),
  };
  return catalogCache;
}

function toPublicProduct(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    price: p.price,
    description: p.description,
    primaryImage: p.primaryImage,
    extraImages: p.extraImages,
    images: p.images,
  };
}

function toPublicOrder(o) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    deliveryNotes: o.deliveryNotes,
    paymentMethod: o.paymentMethod,
    senderWalletPhone: o.senderWalletPhone,
    items: (o.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      image: item.image,
    })),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    grandTotal: o.grandTotal,
    status: o.status,
    rejectionReason: o.rejectionReason,
    isPaid: o.isPaid,
    isArchived: o.isArchived,
    isDeletedFromArchive: o.isDeletedFromArchive,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    completedAt: o.completedAt,
  };
}

// Password/PIN Hashing & Session Token helpers
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPinHash(pin, storedHash) {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function timingSafeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signSessionToken(ttlSeconds = 60 * 60 * 12) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ role: 'chef', exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!timingSafeCompare(sig, expectedSig)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.role === 'chef' && typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

const CHEF_COOKIE_NAME = 'dr_chef_session';

function extractChefToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[CHEF_COOKIE_NAME];
}

function isSameOriginMutation(req) {
  const customHeader = req.headers['x-requested-with'];
  if (customHeader === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requireChefAuth(req, res, next) {
  const token = extractChefToken(req);
  if (!verifySessionToken(token)) {
    res.status(401).json({ error: 'Unauthorized: Chef authentication required.' });
    return;
  }
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    !req.headers.authorization?.startsWith('Bearer ')
  ) {
    if (!isSameOriginMutation(req)) {
      res.status(403).json({ error: 'Forbidden: Cross-origin request verification failed.' });
      return;
    }
  }
  next();
}

function setChefSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${CHEF_COOKIE_NAME}=${encodeURIComponent(
      token
    )}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

function clearChefSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${CHEF_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), firestore: hasFirebaseAdmin ? 'configured' : 'disabled' });
  });

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  // Public Storefront Endpoints
  app.get('/api/products', async (req, res) => {
    try {
      const forceFresh = req.query.fresh === '1';
      const catalog = await fetchCatalog(forceFresh);
      res.json({
        products: catalog.products.map(toPublicProduct),
        categories: catalog.categories,
        fetchedAt: catalog.fetchedAt,
      });
    } catch (err) {
      console.error('Error serving /api/products:', err);
      res.status(500).json({ error: 'Unable to sync catalog from Google Sheets.' });
    }
  });

  app.get('/api/settings', async (_req, res) => {
    await syncStoreSettingsFromFirestorePublicRest();
    res.json(store.settings);
  });

  app.get('/api/orders', (req, res) => {
    const codesParam = typeof req.query.codes === 'string' ? req.query.codes : '';
    const codeParam = typeof req.query.code === 'string' ? req.query.code : '';
    const phoneParam = typeof req.query.phone === 'string' ? req.query.phone : '';

    const codeSet = new Set(
      [...codesParam.split(','), codeParam]
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    );
    const normalizedPhone = phoneParam.replace(/\D/g, '');

    if (codeSet.size === 0 && !normalizedPhone) {
      res.json({ orders: [] });
      return;
    }

    const matched = store.orders
      .filter((o) => !o.isDeletedFromArchive)
      .filter((o) => {
        const matchesCode = codeSet.has(o.orderCode.toUpperCase());
        const matchesPhone =
          normalizedPhone.length >= 6 &&
          o.customerPhone.replace(/\D/g, '').includes(normalizedPhone);
        return matchesCode || matchesPhone;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(toPublicOrder);

    res.json({ orders: matched });
  });

  app.post('/api/orders', async (req, res) => {
    await syncStoreSettingsFromFirestorePublicRest();
    if (!store.settings.isOpen) {
      res.status(403).json({
        error: 'The atelier store is currently closed and not accepting new orders.',
      });
      return;
    }

    const body = req.body || {};
    const customerName = String(body.customerName || '').trim();
    const customerPhone = String(body.customerPhone || '').trim();
    const deliveryAddress = String(body.deliveryAddress || '').trim();
    const deliveryNotes = String(body.deliveryNotes || '').trim();
    const paymentMethod = 'Pay on Delivery';
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!customerName || customerName.length > 120) {
      res.status(400).json({ error: 'Valid full name is required.' });
      return;
    }
    if (!customerPhone || customerPhone.length < 6 || customerPhone.length > 32) {
      res.status(400).json({ error: 'Valid phone number is required.' });
      return;
    }
    if (!deliveryAddress || deliveryAddress.length < 4 || deliveryAddress.length > 400) {
      res.status(400).json({ error: 'Detailed delivery address is required.' });
      return;
    }
    if (rawItems.length === 0) {
      res.status(400).json({ error: 'Your cart is empty.' });
      return;
    }

    let catalog;
    try {
      catalog = await fetchCatalog(false);
    } catch (err) {
      console.error('Error fetching catalog during order creation:', err);
      res.status(503).json({ error: 'Catalog temporarily unavailable. Please try again shortly.' });
      return;
    }
    const catalogById = new Map(catalog.products.map((p) => [p.id, p]));
    const catalogBySlug = new Map(catalog.products.map((p) => [p.slug, p]));

    const orderItems = [];
    let subtotal = 0;
    let totalProfit = 0;

    for (const raw of rawItems) {
      const entry = raw || {};
      const productId = String(entry.productId || '');
      const slug = String(entry.slug || '');
      const qty = Math.floor(Number(entry.quantity || 0));
      if (qty < 1 || qty > 99) {
        res.status(400).json({ error: 'Invalid item quantity.' });
        return;
      }
      const product = catalogById.get(productId) || catalogBySlug.get(slug);
      if (!product) {
        res.status(400).json({ error: 'One or more items in your cart are no longer available in the catalog.' });
        return;
      }
      const lineTotal = Number((product.price * qty).toFixed(2));
      subtotal = Number((subtotal + lineTotal).toFixed(2));
      totalProfit = Number((totalProfit + product.profit * qty).toFixed(2));
      orderItems.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        quantity: qty,
        unitPrice: product.price,
        lineTotal,
        unitProfitSnapshot: product.profit,
        image: product.primaryImage || product.images[0] || '',
      });
    }

    const deliveryFee = Number(store.settings.deliveryFee || 0);
    const grandTotal = Number((subtotal + deliveryFee).toFixed(2));
    const nowIso = new Date().toISOString();
    const orderCode = `ORD-${store.nextOrderSeq++}`;
    const order = {
      id: `${orderCode}-${crypto.randomBytes(3).toString('hex')}`,
      orderCode,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryNotes,
      paymentMethod,
      senderWalletPhone: '',
      receiptImageDataUrl: '',
      items: orderItems,
      subtotal,
      deliveryFee,
      grandTotal,
      totalProfit,
      status: 'Pending',
      rejectionReason: '',
      isPaid: false,
      isArchived: false,
      isDeletedFromArchive: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.orders.unshift(order);
    saveStore();
    try {
      await syncOrderToFirestore(order);
    } catch (err) {
      console.error('Firestore order write failed; order remains in local recovery store:', err.message);
    }

    res.status(201).json({ order: toPublicOrder(order) });
  });

  // Chef / Admin Auth Endpoints
  app.get('/api/chef/auth-status', (req, res) => {
    const envPin = (process.env.CHEF_PIN || '').trim();
    const needsSetup = !envPin && !store.adminPinHash;
    const authenticated = verifySessionToken(extractChefToken(req));
    res.json({ authenticated, needsSetup });
  });

  app.post('/api/chef/setup-pin', (req, res) => {
    const envPin = (process.env.CHEF_PIN || '').trim();
    if (envPin || store.adminPinHash) {
      res.status(409).json({ error: 'Admin PIN is already configured.' });
      return;
    }
    const pin = String(req.body?.pin || '').trim();
    if (pin.length < 4 || pin.length > 64) {
      res.status(400).json({ error: 'PIN must be between 4 and 64 characters.' });
      return;
    }
    store.adminPinHash = hashPin(pin);
    saveStore();

    const token = signSessionToken();
    setChefSessionCookie(res, token);
    res.json({ authenticated: true, token });
  });

  app.post('/api/chef/auth', (req, res) => {
    const pin = String(req.body?.pin || '').trim();
    const envPin = (process.env.CHEF_PIN || '').trim();

    let valid = false;
    if (envPin) {
      valid = timingSafeCompare(pin, envPin);
    } else if (store.adminPinHash) {
      valid = verifyPinHash(pin, store.adminPinHash);
    } else {
      res.status(400).json({ error: 'Initial admin PIN setup required first.', needsSetup: true });
      return;
    }

    if (!valid) {
      res.status(401).json({ error: 'Invalid Chef PIN. Access denied.' });
      return;
    }

    const token = signSessionToken();
    setChefSessionCookie(res, token);
    res.json({ authenticated: true, token });
  });

  app.post('/api/chef/logout', (_req, res) => {
    clearChefSessionCookie(res);
    res.json({ authenticated: false });
  });

  // Protected Chef / Admin Endpoints
  app.get('/api/chef/orders', requireChefAuth, (_req, res) => {
    const visible = store.orders
      .filter((o) => !o.isDeletedFromArchive)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      orders: visible,
      analyticsBaselineAt: store.analyticsBaselineAt,
    });
  });

  app.patch('/api/chef/orders/:id', requireChefAuth, (req, res) => {
    const order = store.orders.find((o) => o.id === req.params.id && !o.isDeletedFromArchive);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const body = req.body || {};
    const nextStatus = typeof body.status === 'string' ? body.status : undefined;
    const nextArchived = typeof body.isArchived === 'boolean' ? body.isArchived : undefined;
    const rejectionReason =
      typeof body.rejectionReason === 'string' ? body.rejectionReason.trim() : undefined;

    if (nextStatus) {
      if (!['Pending', 'In Progress', 'Finished', 'Rejected'].includes(nextStatus)) {
        res.status(400).json({ error: 'Invalid order status.' });
        return;
      }
      if (nextStatus === 'Rejected' && !rejectionReason) {
        res.status(400).json({ error: 'A rejection reason is required.' });
        return;
      }
      order.status = nextStatus;
      order.rejectionReason = nextStatus === 'Rejected' ? rejectionReason || '' : '';
      if (nextStatus === 'Finished') {
        order.isPaid = true;
        order.completedAt = new Date().toISOString();
      }
    }

    if (nextArchived !== undefined) {
      order.isArchived = nextArchived;
    }

    order.updatedAt = new Date().toISOString();
    saveStore();
    void syncOrderToFirestore(order).catch((err) => console.error('Firestore order write failed:', err.message));
    res.json({ order });
  });

  app.delete('/api/chef/orders/:id', requireChefAuth, (req, res) => {
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    order.isDeletedFromArchive = true;
    order.isArchived = true;
    order.updatedAt = new Date().toISOString();
    saveStore();
    void syncOrderToFirestore(order).catch((err) => console.error('Firestore order write failed:', err.message));
    res.json({ deletedId: order.id });
  });

  app.post('/api/chef/orders/bulk-delete', requireChefAuth, (req, res) => {
    const body = req.body || {};
    const nowIso = new Date().toISOString();
    let count = 0;

    if (body.allArchived) {
      for (const o of store.orders) {
        if (o.isArchived && !o.isDeletedFromArchive) {
          o.isDeletedFromArchive = true;
          o.updatedAt = nowIso;
          count++;
          void syncOrderToFirestore(o).catch((err) => console.error('Firestore order update failed:', err.message));
        }
      }
    } else if (Array.isArray(body.ids)) {
      const idSet = new Set(body.ids.map((id) => String(id)));
      for (const o of store.orders) {
        if (idSet.has(o.id) && !o.isDeletedFromArchive) {
          o.isDeletedFromArchive = true;
          o.isArchived = true;
          o.updatedAt = nowIso;
          count++;
          void syncOrderToFirestore(o).catch((err) => console.error('Firestore order update failed:', err.message));
        }
      }
    }

    saveStore();
    res.json({ deletedCount: count });
  });

  app.put('/api/chef/settings', requireChefAuth, async (req, res) => {
    const body = req.body || {};
    const isOpen = typeof body.isOpen === 'boolean' ? body.isOpen : store.settings.isOpen;
    const openTime =
      typeof body.openTime === 'string' && body.openTime.trim()
        ? body.openTime.trim().slice(0, 32)
        : store.settings.openTime;
    const closeTime =
      typeof body.closeTime === 'string' && body.closeTime.trim()
        ? body.closeTime.trim().slice(0, 32)
        : store.settings.closeTime;
    const customNote =
      typeof body.customNote === 'string'
        ? body.customNote.trim().slice(0, 500)
        : store.settings.customNote;
    const rawFee = Number(body.deliveryFee);
    const deliveryFee =
      Number.isFinite(rawFee) && rawFee >= 0 && rawFee <= 100000
        ? Number(rawFee.toFixed(2))
        : store.settings.deliveryFee;
    const heroEyebrow =
      typeof body.heroEyebrow === 'string'
        ? body.heroEyebrow.trim().slice(0, 120)
        : store.settings.heroEyebrow;
    const heroTitle =
      typeof body.heroTitle === 'string' && body.heroTitle.trim()
        ? body.heroTitle.trim().slice(0, 200)
        : store.settings.heroTitle;
    const heroSubtitle =
      typeof body.heroSubtitle === 'string'
        ? body.heroSubtitle.trim().slice(0, 300)
        : store.settings.heroSubtitle;
    const requestedPhone = typeof body.supportPhone === 'string' ? body.supportPhone.trim().slice(0, 32) : store.settings.supportPhone;
    const phoneDigits = requestedPhone.replace(/\D/g, '');
    const supportPhone = phoneDigits.length >= 8 && phoneDigits.length <= 15 ? requestedPhone : store.settings.supportPhone;

    store.settings = {
      ...store.settings,
      isOpen,
      openTime,
      closeTime,
      customNote,
      deliveryFee,
      heroEyebrow,
      heroTitle,
      heroSubtitle,
      supportPhone,
      updatedAt: new Date().toISOString(),
    };
    saveStore();
    let globalSync = false;
    try {
      if (hasFirebaseAdmin) {
        await syncSettingsToFirestore(store.settings);
        globalSync = true;
      }
    } catch (err) {
      console.error('Firestore settings write failed:', err.message);
    }
    res.json({ settings: store.settings, globalSync });
  });

  app.post('/api/chef/sales-profits/reset', requireChefAuth, async (_req, res) => {
    store.analyticsBaselineAt = new Date().toISOString();
    saveStore();
    if (hasFirebaseAdmin) {
      try {
        await setFirestoreDocument('chefMeta', 'analytics', {
          analyticsBaselineAt: store.analyticsBaselineAt,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Firestore analytics baseline write failed:', err.message);
      }
    }
    res.json({ analyticsBaselineAt: store.analyticsBaselineAt });
  });

  app.get('/api/chef/products', requireChefAuth, async (req, res) => {
    try {
      const forceFresh = req.query.fresh === '1';
      const catalog = await fetchCatalog(forceFresh);
      res.json({
        products: catalog.products.map(toPublicProduct),
        categories: catalog.categories,
        fetchedAt: catalog.fetchedAt,
      });
    } catch (err) {
      console.error('Error fetching chef catalog preview:', err);
      res.status(500).json({ error: 'Unable to sync catalog.' });
    }
  });

  // Explicit Public Static Asset Mounts (strictly excludes .data/, server.js, .env, package.json)
  app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
  app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
  app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));

  app.get('/firebase-applet-config.json', (_req, res) => {
    const cfgPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      res.sendFile(cfgPath);
    } else {
      res.status(404).json({ error: 'Firebase configuration not found.' });
    }
  });

  // Chef / Admin Dashboard Entry (Secret Manager Route)
  app.get(['/999chef887', '/999chef887/', '/999chef887/index.html'], (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, '999chef887', 'index.html'));
  });

  // Storefront Root & Slug Fallback Routing
  app.get('/', (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
  });

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API endpoint not found.' });
      return;
    }
    if (
      req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/.data') ||
      req.path === '/server.js' ||
      req.path === '/package.json' ||
      req.path === '/.env'
    ) {
      res.status(404).send('Not found');
      return;
    }
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
  });

  // Global Express error handler to prevent malformed JSON or route errors from dropping sockets
  app.use((err, req, res, _next) => {
    console.error('Express error on', req.method, req.path, err);
    if (res.headersSent) return;
    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON request payload.' });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`DR Premium Resin Server running on http://0.0.0.0:${PORT}`);
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  await syncFirestoreOnBoot();
  void syncFromSupabaseOnBoot();
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
