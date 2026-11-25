import express, { type Request, type Response, type NextFunction } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

dotenv.config();

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

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

interface ServerProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  profit: number;
  description: string;
  primaryImage: string;
  extraImages: string[];
  images: string[];
}

interface OrderItemRecord {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unitProfitSnapshot: number;
  image?: string;
}

interface OrderRecord {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryNotes: string;
  paymentMethod: string;
  senderWalletPhone: string;
  receiptImageDataUrl: string;
  items: OrderItemRecord[];
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  totalProfit: number;
  status: 'Pending' | 'In Progress' | 'Finished' | 'Rejected';
  rejectionReason: string;
  isPaid: boolean;
  isArchived: boolean;
  isDeletedFromArchive: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface StoreSettingsRecord {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  customNote: string;
  deliveryFee: number;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  supportPhone: string;
  currency: string;
  brandName: string;
  updatedAt: string;
}

interface PersistedStore {
  settings: StoreSettingsRecord;
  orders: OrderRecord[];
  nextOrderSeq: number;
  analyticsBaselineAt: string | null;
  adminPinHash: string | null;
}

const DEFAULT_STORE: PersistedStore = {
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
    updatedAt: new Date().toISOString(),
  },
  orders: [],
  nextOrderSeq: 1001,
  analyticsBaselineAt: null,
  adminPinHash: null,
};

function loadStore(): PersistedStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedStore>;
      return {
        settings: {
          ...DEFAULT_STORE.settings,
          ...(parsed.settings || {}),
          supportPhone: SUPPORT_PHONE,
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

let store: PersistedStore = loadStore();

function saveStore(): void {
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

// Optional Supabase PostgREST synchronization when environment secrets are configured
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '') || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

async function supabaseFetch(table: string, method: string, query = '', body?: unknown): Promise<unknown> {
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
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function syncFromSupabaseOnBoot(): Promise<void> {
  if (!hasSupabase) return;
  try {
    const remoteSettings = (await supabaseFetch('store_settings', 'GET', '?id=eq.default&limit=1')) as
      | Array<Record<string, unknown>>
      | null;
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

    const remoteOrders = (await supabaseFetch('orders', 'GET', '?order=created_at.desc')) as
      | Array<Record<string, unknown>>
      | null;
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
        items: Array.isArray(row.items) ? (row.items as OrderItemRecord[]) : [],
        subtotal: Number(row.subtotal || 0),
        deliveryFee: Number(row.delivery_fee || 0),
        grandTotal: Number(row.grand_total || 0),
        totalProfit: Number(row.total_profit || 0),
        status: (row.status as OrderRecord['status']) || 'Pending',
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

async function syncSettingsToSupabase(settings: StoreSettingsRecord): Promise<void> {
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

async function syncOrderToSupabase(order: OrderRecord): Promise<void> {
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
function parseCsvRfc4180(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

function sanitizeImageCell(raw: string): string[] {
  const trimmed = (raw || '').trim();
  if (!trimmed) return [];
  // Ignore spreadsheet formulas such as =IMAGE(...)
  if (trimmed.startsWith('=')) return [];

  // Support comma/newline/space-separated URLs in Extra Images cells
  const candidates = trimmed
    .split(/[\n,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));

  return candidates;
}

function makeSlug(name: string, fallbackId: string): string {
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

function parseNumeric(raw: string | undefined): number {
  if (!raw) return NaN;
  const cleaned = raw.replace(/[^0-9.-]+/g, '');
  return cleaned ? Number(cleaned) : NaN;
}

interface CatalogCache {
  products: ServerProduct[];
  categories: string[];
  fetchedAt: number;
}

let catalogCache: CatalogCache = {
  products: [],
  categories: [],
  fetchedAt: 0,
};

const CACHE_TTL_MS = 15_000;

async function discoverSheetTabs(): Promise<Array<{ name: string; gid: string }>> {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/htmlview`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/items\.push\(\{name:\s*"([^"]+)"[\s\S]*?gid:\s*"(\d+)"/g)];
      if (matches.length > 0) {
        const seen = new Set<string>();
        const tabs: Array<{ name: string; gid: string }> = [];
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

async function fetchCatalog(forceFresh = false): Promise<CatalogCache> {
  const now = Date.now();
  if (!forceFresh && catalogCache.fetchedAt > 0 && now - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache;
  }

  const tabs = await discoverSheetTabs();
  const products: ServerProduct[] = [];
  const categories: string[] = [];
  const usedSlugs = new Set<string>();

  for (const tab of tabs) {
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(
        tab.gid
      )}`;
      const res = await fetch(csvUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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

        const extraImagesSet = new Set<string>();
        if (extraImgIdx >= 0) {
          for (let c = extraImgIdx; c < row.length; c++) {
            if (c === prevIdx) continue;
            for (const url of sanitizeImageCell(row[c] || '')) {
              if (url !== primaryImage) extraImagesSet.add(url);
            }
          }
        }
        // Also collect trailing image URLs after known headers, strictly excluding Prev
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

  catalogCache = {
    products,
    categories,
    fetchedAt: Date.now(),
  };
  return catalogCache;
}

function toPublicProduct(p: ServerProduct) {
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

function toPublicOrder(o: OrderRecord) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    deliveryNotes: o.deliveryNotes,
    paymentMethod: o.paymentMethod,
    senderWalletPhone: o.senderWalletPhone,
    items: o.items.map((item) => ({
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
function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPinHash(pin: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signSessionToken(ttlSeconds = 60 * 60 * 12): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ role: 'chef', exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!timingSafeCompare(sig, expectedSig)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === 'chef' && typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
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

function extractChefToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[CHEF_COOKIE_NAME];
}

function isSameOriginMutation(req: Request): boolean {
  const customHeader = req.headers['x-requested-with'];
  if (customHeader === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requireChefAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractChefToken(req);
  if (!verifySessionToken(token)) {
    res.status(401).json({ error: 'Unauthorized: Chef authentication required.' });
    return;
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.headers.authorization?.startsWith('Bearer ')) {
    if (!isSameOriginMutation(req)) {
      res.status(403).json({ error: 'Forbidden: Cross-origin request verification failed.' });
      return;
    }
  }
  next();
}

function setChefSessionCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${CHEF_COOKIE_NAME}=${encodeURIComponent(
      token
    )}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

function clearChefSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${CHEF_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

async function startServer() {
  await syncFromSupabaseOnBoot();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '20mb' }));

  // Public Storefront Endpoints
  app.get('/api/products', async (req: Request, res: Response) => {
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

  app.get('/api/settings', (_req: Request, res: Response) => {
    res.json(store.settings);
  });

  app.get('/api/orders', (req: Request, res: Response) => {
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

  app.post('/api/orders', async (req: Request, res: Response) => {
    if (!store.settings.isOpen) {
      res.status(403).json({
        error: 'The atelier store is currently closed and not accepting new orders.',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const customerName = String(body.customerName || '').trim();
    const customerPhone = String(body.customerPhone || '').trim();
    const deliveryAddress = String(body.deliveryAddress || '').trim();
    const deliveryNotes = String(body.deliveryNotes || '').trim();
    const paymentMethod = 'Pay on Delivery';
    const senderWalletPhone = '';
    const receiptImageDataUrl = '';
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
    const isCod = true;

    const catalog = await fetchCatalog(false);
    const catalogById = new Map(catalog.products.map((p) => [p.id, p]));
    const catalogBySlug = new Map(catalog.products.map((p) => [p.slug, p]));

    const orderItems: OrderItemRecord[] = [];
    let subtotal = 0;
    let totalProfit = 0;

    for (const raw of rawItems) {
      const entry = raw as Record<string, unknown>;
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
    const order: OrderRecord = {
      id: `${orderCode}-${crypto.randomBytes(3).toString('hex')}`,
      orderCode,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryNotes,
      paymentMethod,
      senderWalletPhone: isCod ? '' : senderWalletPhone,
      receiptImageDataUrl: isCod ? '' : receiptImageDataUrl,
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
    void syncOrderToSupabase(order);

    res.status(201).json({ order: toPublicOrder(order) });
  });

  // Chef / Admin Auth Endpoints
  app.get('/api/chef/auth-status', (req: Request, res: Response) => {
    const envPin = (process.env.CHEF_PIN || '').trim();
    const needsSetup = !envPin && !store.adminPinHash;
    const authenticated = verifySessionToken(extractChefToken(req));
    res.json({ authenticated, needsSetup });
  });

  app.post('/api/chef/setup-pin', (req: Request, res: Response) => {
    const envPin = (process.env.CHEF_PIN || '').trim();
    if (envPin || store.adminPinHash) {
      res.status(409).json({ error: 'Admin PIN is already configured.' });
      return;
    }
    const pin = String((req.body as Record<string, unknown>)?.pin || '').trim();
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

  app.post('/api/chef/auth', (req: Request, res: Response) => {
    const pin = String((req.body as Record<string, unknown>)?.pin || '').trim();
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

  app.post('/api/chef/logout', (_req: Request, res: Response) => {
    clearChefSessionCookie(res);
    res.json({ authenticated: false });
  });

  // Protected Chef / Admin Endpoints
  app.get('/api/chef/orders', requireChefAuth, (_req: Request, res: Response) => {
    const visible = store.orders
      .filter((o) => !o.isDeletedFromArchive)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      orders: visible,
      analyticsBaselineAt: store.analyticsBaselineAt,
    });
  });

  app.patch('/api/chef/orders/:id', requireChefAuth, (req: Request, res: Response) => {
    const order = store.orders.find((o) => o.id === req.params.id && !o.isDeletedFromArchive);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
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
      order.status = nextStatus as OrderRecord['status'];
      if (nextStatus === 'Rejected') {
        order.rejectionReason = rejectionReason || '';
      } else {
        order.rejectionReason = '';
      }
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
    void syncOrderToSupabase(order);
    res.json({ order });
  });

  app.delete('/api/chef/orders/:id', requireChefAuth, (req: Request, res: Response) => {
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    order.isDeletedFromArchive = true;
    order.isArchived = true;
    order.updatedAt = new Date().toISOString();
    saveStore();
    void syncOrderToSupabase(order);
    res.json({ deletedId: order.id });
  });

  app.post('/api/chef/orders/bulk-delete', requireChefAuth, (req: Request, res: Response) => {
    const body = req.body as { ids?: unknown[]; allArchived?: boolean };
    const nowIso = new Date().toISOString();
    let count = 0;

    if (body.allArchived) {
      for (const o of store.orders) {
        if (o.isArchived && !o.isDeletedFromArchive) {
          o.isDeletedFromArchive = true;
          o.updatedAt = nowIso;
          count++;
          void syncOrderToSupabase(o);
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
          void syncOrderToSupabase(o);
        }
      }
    }

    saveStore();
    res.json({ deletedCount: count });
  });

  app.put('/api/chef/settings', requireChefAuth, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
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
      updatedAt: new Date().toISOString(),
    };
    saveStore();
    void syncSettingsToSupabase(store.settings);
    res.json({ settings: store.settings });
  });

  app.post('/api/chef/sales-profits/reset', requireChefAuth, (_req: Request, res: Response) => {
    store.analyticsBaselineAt = new Date().toISOString();
    saveStore();
    res.json({ analyticsBaselineAt: store.analyticsBaselineAt });
  });

  app.get('/api/chef/products', requireChefAuth, async (req: Request, res: Response) => {
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

  // Vite Dev Middleware or Production Static Assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DR Premium Resin Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
