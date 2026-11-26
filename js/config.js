export const API_BASE_URL = (typeof window !== 'undefined' && window.DR_API_BASE_URL) ? String(window.DR_API_BASE_URL).replace(/\/+$/, '') : '';

export const BRAND_LOGO_URL =
  'https://res.cloudinary.com/rn7rovnn/image/upload/v1795612692/watermarked_img_7354890140086322614-Photoroom.png';

export const HERO_SHOWCASE_URL =
  'https://res.cloudinary.com/rn7rovnn/image/upload/v1795616597/0a47c2be-8507-4a39-8895-be5352c6ee9f.webp';

export const HERO_FALLBACK_URL = '/assets/images/hero_resin_clock_1795617283221.jpg';
export const STORY_ARTISANSHIP_URL = '/assets/images/story_artisanship_1795617284103.jpg';
export const STORY_MATERIAL_URL = '/assets/images/story_material_1795617284295.jpg';
export const STORY_ARCHIVE_URL = '/assets/images/story_archive_1795617284285.jpg';
export const BESPOKE_BANNER_URL = '/assets/images/banner_bespoke_commission_1795617285711.jpg';

export const SUPPORT_PHONE_DISPLAY = '0 12 74211223';
export const SUPPORT_PHONE_RAW = '01274211223';
export const SUPPORT_WHATSAPP_INTL = '201274211223';

export const ORDERS_CHANNEL_NAME = 'dr-resin-orders-sync';
export const CART_STORAGE_KEY = 'dr_resin_cart_v1';
export const TRACKED_CODES_KEY = 'dr_resin_order_codes_v1';

export const OrderStatus = Object.freeze({
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  FINISHED: 'Finished',
  REJECTED: 'Rejected',
});

export const PaymentMethod = Object.freeze({
  VODAFONE_CASH: 'Vodafone Cash',
  INSTAPAY: 'InstaPay',
  ORANGE_CASH: 'Orange Cash',
  ETISALAT_CASH: 'Etisalat Cash',
  COD: 'Pay on Delivery',
});

export const DEFAULT_SETTINGS = Object.freeze({
  isOpen: true,
  openTime: '10:00 AM',
  closeTime: '11:00 PM',
  customNote: 'Handcrafted to order. Nationwide curated courier delivery.',
  deliveryFee: 15,
  heroEyebrow: 'DR-4802-OCN',
  heroTitle: 'NATURAL WALNUT & DEEP OCEAN EPOXY RESIN',
  heroSubtitle: 'DR - Premium Resin Products',
  supportPhone: SUPPORT_PHONE_DISPLAY,
  currency: 'USD',
  brandName: 'DR - Premium Resin Products',
  updatedAt: '1970-01-01T00:00:00.000Z',
});
