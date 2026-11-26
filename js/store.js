import { CART_STORAGE_KEY, TRACKED_CODES_KEY } from './config.js';

export function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadTrackedCodes() {
  try {
    const raw = localStorage.getItem(TRACKED_CODES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrackedCodes(codes) {
  try {
    localStorage.setItem(TRACKED_CODES_KEY, JSON.stringify(codes));
  } catch {
    // Ignore storage quota errors
  }
}
