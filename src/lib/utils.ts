export const BRAND_LOGO_URL =
  'https://res.cloudinary.com/rn7rovnn/image/upload/v1795612692/watermarked_img_7354890140086322614-Photoroom.png';

export const HERO_SHOWCASE_URL =
  'https://res.cloudinary.com/rn7rovnn/image/upload/v1795616597/0a47c2be-8507-4a39-8895-be5352c6ee9f.webp';

export const HERO_FALLBACK_URL =
  '/src/assets/images/hero_resin_clock_1795617283221.jpg';

export const STORY_ARTISANSHIP_URL =
  '/src/assets/images/story_artisanship_1795617284103.jpg';

export const STORY_MATERIAL_URL =
  '/src/assets/images/story_material_1795617284295.jpg';

export const STORY_ARCHIVE_URL =
  '/src/assets/images/story_archive_1795617284285.jpg';

export const BESPOKE_BANNER_URL =
  '/src/assets/images/banner_bespoke_commission_1795617285711.jpg';

export const SUPPORT_PHONE_DISPLAY = '0 12 74211223';
export const SUPPORT_PHONE_RAW = '01274211223';
export const SUPPORT_WHATSAPP_INTL = '201274211223';

export function formatPriceUSD(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateProductSlug(name: string, fallbackId: string): string {
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

export function formatWhatsAppUrl(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('0') ? `20${digits.slice(1)}` : digits;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${intl}${query}`;
}

export const ORDERS_CHANNEL_NAME = 'dr-resin-orders-sync';

export function broadcastOrdersUpdate(payload?: Record<string, unknown>): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
    channel.postMessage({ type: 'ORDERS_UPDATED', timestamp: Date.now(), ...payload });
    channel.close();
  } catch {
    // Ignore channel errors in restricted browsing contexts
  }
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

export async function unlockAudioContext(): Promise<boolean> {
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

export async function playNewOrderChime(): Promise<void> {
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
