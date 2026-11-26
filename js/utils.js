import { ORDERS_CHANNEL_NAME } from './config.js';

export function formatPriceUSD(amount) {
  const num = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateProductSlug(name, fallbackId) {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (cleaned && /[a-zA-Z0-9]/.test(cleaned)) {
    return cleaned;
  }

  const safeId = String(fallbackId || 'item')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safeId || 'item';
}

export function formatWhatsAppUrl(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  const intl = digits.startsWith('0') ? `20${digits.slice(1)}` : digits;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${intl}${query}`;
}

export function sanitizeImageUrl(url) {
  const val = String(url || '').trim();
  if (!val) return '';
  if (/^https?:\/\//i.test(val) || val.startsWith('/assets/') || /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(val)) {
    return val;
  }
  return '';
}

export function broadcastOrdersUpdate(payload = {}) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
    channel.postMessage({ type: 'ORDERS_UPDATED', timestamp: Date.now(), ...payload });
    channel.close();
  } catch {
    // Ignore channel errors in restricted browsing contexts
  }
}

let sharedAudioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

export async function unlockAudioContext() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

export async function playNewOrderChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const now = ctx.currentTime;
  const notes = [
    { freq: 659.25, start: 0, dur: 0.16 },
    { freq: 880.0, start: 0.14, dur: 0.28 },
  ];

  notes.forEach(({ freq, start, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + start);

    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  });
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(String(text || ''));
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = String(text || '');
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function clearNode(node) {
  while (node && node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

/**
 * Safe DOM element builder (uses textContent for text, preventing XSS).
 */
export function el(tag, attrs = null, children = null) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (val === undefined || val === null || val === false) continue;
      if (key === 'className') {
        node.className = String(val);
      } else if (key === 'dataset' && typeof val === 'object') {
        for (const [dk, dv] of Object.entries(val)) {
          if (dv !== undefined && dv !== null) {
            node.dataset[dk] = String(dv);
          }
        }
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(node.style, val);
      } else if (key.startsWith('on') && typeof val === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'checked' || key === 'disabled' || key === 'required' || key === 'readOnly') {
        node[key] = Boolean(val);
      } else if (key === 'value') {
        node.value = String(val);
      } else {
        node.setAttribute(key, val === true ? '' : String(val));
      }
    }
  }

  const appendChild = (child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(appendChild);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  };

  appendChild(children);
  return node;
}
