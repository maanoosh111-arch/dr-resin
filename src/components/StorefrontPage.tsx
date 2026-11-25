import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  X,
  ShoppingBag,
  ClipboardList,
  RefreshCw,
  ArrowUpRight,
  ArrowUp,
  Copy,
  Check,
  MessageCircle,
  Clock,
  Lock,
} from 'lucide-react';
import type { CartItem, Order, Product, StoreSettings } from '../types';
import {
  BESPOKE_BANNER_URL,
  BRAND_LOGO_URL,
  HERO_FALLBACK_URL,
  HERO_SHOWCASE_URL,
  STORY_ARCHIVE_URL,
  STORY_ARTISANSHIP_URL,
  STORY_MATERIAL_URL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_RAW,
  formatPriceUSD,
  formatWhatsAppUrl,
} from '../lib/utils';
import { ProductCard } from './ProductCard';
import { ProductDetailModal } from './ProductDetailModal';
import { CartCheckoutDrawer } from './CartCheckoutDrawer';
import { MyOrdersModal } from './MyOrdersModal';

const CART_STORAGE_KEY = 'dr_resin_cart_v1';
const TRACKED_CODES_KEY = 'dr_resin_order_codes_v1';

const DEFAULT_SETTINGS: StoreSettings = {
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
  updatedAt: new Date().toISOString(),
};

function readInitialSlug(): string {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path || path === 'chef') return '';
  return decodeURIComponent(path);
}

export const StorefrontPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  const [trackedCodes, setTrackedCodes] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(TRACKED_CODES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string>(readInitialSlug);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [highlightedOrderCode, setHighlightedOrderCode] = useState<string | null>(null);

  const [heroImgSrc, setHeroImgSrc] = useState<string>(HERO_SHOWCASE_URL);
  const [copiedFooterPhone, setCopiedFooterPhone] = useState(false);

  // Persist cart & tracked order codes
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(TRACKED_CODES_KEY, JSON.stringify(trackedCodes));
    } catch {
      // Ignore
    }
  }, [trackedCodes]);

  const fetchCatalog = useCallback(async (fresh = false) => {
    if (fresh) setCatalogRefreshing(true);
    else setCatalogLoading(true);
    setCatalogError('');

    try {
      const res = await fetch(`/api/products${fresh ? '?fresh=1' : ''}`);
      if (!res.ok) throw new Error('Catalog fetch failed');
      const data = await res.json();
      setProducts(Array.isArray(data.products) ? data.products : []);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch {
      setCatalogError('Unable to sync catalog right now. Please refresh.');
    } finally {
      setCatalogLoading(false);
      setCatalogRefreshing(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = (await res.json()) as StoreSettings;
        setSettings(data);
      }
    } catch {
      // Retain current settings on transient offline error
    }
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    void fetchCatalog(false);
    void fetchSettings();
    const timer = window.setInterval(() => {
      void fetchSettings();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchCatalog, fetchSettings]);

  // Open direct product slug URL once catalog finishes loading
  useEffect(() => {
    if (!catalogLoading && pendingSlug && products.length > 0) {
      const match = products.find(
        (p) => p.slug.toLowerCase() === pendingSlug.toLowerCase() || p.id === pendingSlug
      );
      if (match) {
        setActiveProduct(match);
      }
      setPendingSlug('');
    }
  }, [catalogLoading, pendingSlug, products]);

  // Browser back/forward navigation support
  useEffect(() => {
    const onPopState = () => {
      const slug = readInitialSlug();
      if (!slug) {
        setActiveProduct(null);
        return;
      }
      const match = products.find(
        (p) => p.slug.toLowerCase() === slug.toLowerCase() || p.id === slug
      );
      setActiveProduct(match || null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [products]);

  const openProductDetail = (product: Product) => {
    setActiveProduct(product);
    const targetUrl = `/${product.slug}`;
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({ productSlug: product.slug }, '', targetUrl);
    }
  };

  const closeProductDetail = () => {
    setActiveProduct(null);
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  };

  const handleResetHome = () => {
    setSelectedCategory('ALL');
    setSearchQuery('');
    if (activeProduct) closeProductDetail();
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: Math.min(99, i.quantity + quantity) }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          category: product.category,
          description: product.description,
          unitPrice: product.price,
          quantity,
          image: product.primaryImage || product.images[0] || '',
        },
      ];
    });
  };

  const buyNow = (product: Product, quantity = 1) => {
    addToCart(product, quantity);
    setActiveProduct(null);
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setDrawerStep('checkout');
    setDrawerOpen(true);
  };

  const updateCartQty = (productId: string, qty: number) => {
    setCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i))
    );
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  const clearCart = () => setCart([]);

  const handleOrderCreated = (order: Order) => {
    setTrackedCodes((prev) =>
      prev.includes(order.orderCode) ? prev : [order.orderCode, ...prev]
    );
    setHighlightedOrderCode(order.orderCode);
  };

  const handleAddTrackedCode = (code: string) => {
    setTrackedCodes((prev) => (prev.includes(code) ? prev : [code, ...prev]));
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const catMatch = selectedCategory === 'ALL' || p.category === selectedCategory;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, searchQuery]);

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCopyFooterPhone = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_PHONE_RAW);
      setCopiedFooterPhone(true);
      window.setTimeout(() => setCopiedFooterPhone(false), 1800);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#05090F] text-[#F4F7F9] flex flex-col">
      {/* Closed-Store Top Alert */}
      {!settings.isOpen && (
        <div
          role="alert"
          className="bg-amber-950/90 border-b border-amber-400/40 px-4 py-2.5 text-center text-xs text-amber-100"
        >
          <span className="font-semibold uppercase tracking-[0.16em]">Store Currently Closed</span>
          <span className="mx-2 text-amber-300/70">·</span>
          <span>Reopens at {settings.openTime}</span>
          {settings.customNote && (
            <>
              <span className="mx-2 text-amber-300/70">·</span>
              <span className="text-amber-200/90">{settings.customNote}</span>
            </>
          )}
        </div>
      )}

      {/* Sticky Translucent Ocean-Glass Header */}
      <header className="sticky top-0 z-40 bg-[#050C14]/85 backdrop-blur-xl border-b border-cyan-300/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
          {/* Brand Crest & Logo */}
          <button
            type="button"
            onClick={handleResetHome}
            className="flex items-center gap-2.5 shrink-0 text-left group focus-visible:outline-none"
          >
            <img
              src={BRAND_LOGO_URL}
              alt="DR Premium Resin Logo"
              referrerPolicy="no-referrer"
              className="w-10 h-10 object-contain transition-transform duration-200 group-hover:scale-105"
            />
            <div className="hidden sm:block">
              <span className="font-luxury-display text-base tracking-[0.18em] text-white block leading-none">
                DR
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#7AD3EA] block mt-0.5">
                Resin Atelier
              </span>
            </div>
          </button>

          {/* Live Search */}
          <div className="flex items-center flex-1 max-w-md justify-center">
            <div className="relative flex-1 min-w-[140px] max-w-md">
              <Search className="w-3.5 h-3.5 text-[#7C8C99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pieces, categories..."
                aria-label="Search resin pieces"
                className="w-full bg-[#09141F]/90 border border-cyan-300/20 focus:border-[#4CC9EA] rounded-full pl-8 pr-8 py-1.5 text-xs text-white placeholder-[#687A88] focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA9B4] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline-flex px-2.5 py-1 rounded-full text-[11px] tracking-[0.14em] uppercase bg-[#091520] border border-cyan-300/20 text-[#9BA9B4]">
              USD
            </span>
            <button
              type="button"
              onClick={() => setMyOrdersOpen(true)}
              className="px-3 py-1.5 rounded-full bg-[#091520] border border-cyan-300/25 hover:border-cyan-300/65 text-xs text-[#D8EEF5] flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <ClipboardList className="w-3.5 h-3.5 text-[#7AD3EA]" />
              <span className="hidden sm:inline">My Orders</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawerStep('cart');
                setDrawerOpen(true);
              }}
              aria-label="Open shopping cart"
              className="relative ocean-pill-btn px-3.5 py-1.5 rounded-full text-xs text-white flex items-center gap-1.5 whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#7AD3EA]" />
              <span className="hidden sm:inline">Bag</span>
              {totalCartItems > 0 && (
                <span className="tabular-nums min-w-[18px] h-[18px] px-1 rounded-full bg-[#2AA7C9] text-[#040910] text-[10px] font-bold flex items-center justify-center">
                  {totalCartItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION — Full-Bleed Reference Replication */}
      <section className="relative overflow-hidden border-b border-cyan-300/15 bg-[#05090F]">
        {/* Full-Bleed Main Hero Background Image */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={heroImgSrc}
            alt="DR Premium Walnut and Deep Ocean Epoxy Resin Showcase"
            referrerPolicy="no-referrer"
            onError={() => {
              if (heroImgSrc !== HERO_FALLBACK_URL) {
                setHeroImgSrc(HERO_FALLBACK_URL);
              }
            }}
            className="w-full h-full object-cover object-center animate-hero-reveal"
          />
          {/* Studio Vignette & Legibility Scrim */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 58% 60% at 52% 40%, rgba(5, 12, 20, 0.12) 0%, rgba(5, 11, 18, 0.62) 64%, rgba(5, 9, 15, 0.94) 100%), linear-gradient(90deg, rgba(5, 9, 15, 0.78) 0%, rgba(5, 9, 15, 0.18) 45%, rgba(5, 9, 15, 0.45) 100%), linear-gradient(180deg, rgba(5, 11, 18, 0.35) 0%, rgba(5, 9, 15, 0.08) 45%, rgba(5, 9, 15, 0.92) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-10">
          {/* Editorial Hero Headline over Full-Bleed Background */}
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-8 lg:gap-4 min-h-[360px] sm:min-h-[420px]">
            <div className="lg:col-span-6 text-center lg:text-left space-y-4 z-10">
              {settings.heroEyebrow?.trim() && (
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#7AD3EA]">
                  {settings.heroEyebrow}
                </div>
              )}
              <h1 className="font-luxury-display text-3xl sm:text-4xl xl:text-[44px] font-normal tracking-[0.04em] text-white leading-[1.14] text-balance drop-shadow-[0_2px_18px_rgba(0,0,0,0.85)]">
                {settings.heroTitle || DEFAULT_SETTINGS.heroTitle}
              </h1>
              {settings.heroSubtitle?.trim() && (
                <p className="text-sm text-[#C7D8E2] tracking-wide drop-shadow-[0_1px_10px_rgba(0,0,0,0.9)]">
                  {settings.heroSubtitle}
                </p>
              )}
              <div className="pt-1 flex justify-center lg:justify-start">
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="ocean-pill-btn inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.16em] text-white"
                >
                  <span>Discover Pieces</span>
                  <ArrowUpRight className="w-4 h-4 text-[#7AD3EA]" />
                </button>
              </div>
            </div>
          </div>

          {/* 3-Card Bottom Hero Strip (ARTISANSHIP · THE MATERIAL · THE ARCHIVE) */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() =>
                document.getElementById('bespoke')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="group relative h-28 sm:h-32 rounded-xl overflow-hidden border border-cyan-300/20 hover:border-cyan-300/50 transition-all text-left"
            >
              <img
                src={STORY_ARTISANSHIP_URL}
                alt="Artisanship"
                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#040910] via-[#040910]/40 to-transparent" />
              <div className="absolute bottom-3 left-4 font-luxury-display text-sm tracking-[0.16em] text-white">
                ARTISANSHIP
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedCategory('ALL');
                document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="group relative h-28 sm:h-32 rounded-xl overflow-hidden border border-cyan-300/20 hover:border-cyan-300/50 transition-all text-left"
            >
              <img
                src={STORY_MATERIAL_URL}
                alt="The Material"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#040910] via-[#040910]/35 to-transparent" />
              <div className="absolute bottom-3 left-4 font-luxury-display text-sm tracking-[0.16em] text-white">
                THE MATERIAL
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMyOrdersOpen(true)}
              className="group relative h-28 sm:h-32 rounded-xl overflow-hidden border border-cyan-300/20 hover:border-cyan-300/50 transition-all text-left"
            >
              <img
                src={STORY_ARCHIVE_URL}
                alt="The Archive"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#040910] via-[#040910]/35 to-transparent" />
              <div className="absolute bottom-3 left-4 font-luxury-display text-sm tracking-[0.16em] text-white">
                THE ARCHIVE
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* STORE CLOSED PANEL OR LIVE CATALOG */}
      {!settings.isOpen ? (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 w-full">
          <div className="ocean-glass-card rounded-2xl p-8 sm:p-10 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-amber-950/50 border border-amber-400/40 text-amber-300 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <span className="block text-xs uppercase tracking-[0.22em] text-[#7AD3EA]">
              Atelier Temporarily Closed
            </span>
            <h2 className="font-luxury-display text-2xl sm:text-3xl text-white">
              Catalog &amp; Orders Paused
            </h2>
            <p className="text-sm text-[#B8C5CE] max-w-md mx-auto leading-relaxed">
              {settings.customNote ||
                'Our workshop is currently closed while we prepare commissioned pieces.'}
            </p>
            <div className="inline-flex flex-wrap items-center justify-center gap-4 px-5 py-3 rounded-xl bg-[#050C14] border border-cyan-300/20 text-xs text-[#D8EEF5]">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#7AD3EA]" />
                Opens: <strong className="text-white">{settings.openTime}</strong>
              </span>
              <span className="text-cyan-300/30">|</span>
              <span>
                Closes: <strong className="text-white">{settings.closeTime}</strong>
              </span>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Sticky Category Navigation Bar */}
          <div className="sticky top-16 z-30 bg-[#05090F]/90 backdrop-blur-lg border-b border-cyan-300/12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.15em] whitespace-nowrap shrink-0 transition-all border ${
                    selectedCategory === 'ALL'
                      ? 'ocean-pill-btn text-white -translate-y-0.5 border-[#4CC9EA]'
                      : 'bg-[#08121B] border-cyan-300/20 text-[#9BA9B4] hover:text-white hover:border-cyan-300/45'
                  }`}
                >
                  All Products
                </button>

                {categories.map((cat) => {
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.15em] whitespace-nowrap shrink-0 transition-all border ${
                        active
                          ? 'ocean-pill-btn text-white -translate-y-0.5 border-[#4CC9EA]'
                          : 'bg-[#08121B] border-cyan-300/20 text-[#9BA9B4] hover:text-white hover:border-cyan-300/45'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void fetchCatalog(true)}
                disabled={catalogRefreshing}
                className="px-3.5 py-1.5 rounded-full bg-[#08121B] border border-cyan-300/25 hover:border-cyan-300/65 text-xs text-[#D8EEF5] flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#7AD3EA] ${
                    catalogRefreshing ? 'animate-spin' : ''
                  }`}
                />
                <span className="hidden sm:inline">Refresh Catalog</span>
              </button>
            </div>
          </div>

          {/* CURATED COLLECTION SECTION */}
          <main id="collection" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 w-full flex-1">
            <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
              <h2 className="font-luxury-display text-3xl sm:text-4xl font-normal tracking-[0.08em] text-white">
                CURATED COLLECTION
              </h2>
              <p className="mt-2.5 text-sm text-[#9BA9B4]">
                The fusion of natural edge walnut and vibrant ocean resin
              </p>
            </div>

            {catalogLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <div
                    key={n}
                    className="ocean-glass-card rounded-2xl overflow-hidden animate-pulse"
                  >
                    <div className="aspect-[4/3] bg-[#0B1722]" />
                    <div className="p-5 space-y-3">
                      <div className="h-5 w-2/3 bg-[#102130] rounded" />
                      <div className="h-3.5 w-full bg-[#0D1B27] rounded" />
                      <div className="h-8 w-full bg-[#0D1B27] rounded-full mt-4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : catalogError ? (
              <div className="ocean-glass-card rounded-2xl p-10 text-center max-w-lg mx-auto space-y-4">
                <p className="text-sm text-rose-200">{catalogError}</p>
                <button
                  type="button"
                  onClick={() => void fetchCatalog(true)}
                  className="ocean-pill-btn px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.16em] text-white inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Sync</span>
                </button>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="ocean-glass-card rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
                <img
                  src={BRAND_LOGO_URL}
                  alt="DR Resin"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 mx-auto object-contain opacity-65"
                />
                <h3 className="font-luxury-display text-xl text-white">
                  {products.length === 0 ? 'Catalog Currently Empty' : 'No Matching Pieces'}
                </h3>
                <p className="text-xs text-[#9BA9B4] leading-relaxed">
                  {products.length === 0
                    ? 'No products were found in the synced Google Sheets catalog right now.'
                    : 'Try clearing your search filter or selecting another category.'}
                </p>
                <div className="flex items-center justify-center gap-3 pt-1">
                  {searchQuery || selectedCategory !== 'ALL' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('ALL');
                      }}
                      className="ocean-pill-btn px-5 py-2 rounded-full text-xs uppercase tracking-wider text-white"
                    >
                      Show All Pieces
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void fetchCatalog(true)}
                    className="px-5 py-2 rounded-full bg-[#0B1926] border border-cyan-300/30 text-xs uppercase tracking-wider text-[#D8EEF5] inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Sheet</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpenDetail={openProductDetail}
                    onAddToCart={(p) => addToCart(p, 1)}
                    onBuyNow={(p) => buyNow(p, 1)}
                  />
                ))}
              </div>
            )}
          </main>
        </>
      )}

      {/* BESPOKE COMMISSIONS BANNER — Matching Reference */}
      <section id="bespoke" className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 w-full">
        <div className="relative rounded-2xl overflow-hidden border border-cyan-300/25 bg-[#07131D] min-h-[260px] flex items-center">
          <img
            src={BESPOKE_BANNER_URL}
            alt="Bespoke Epoxy Resin Pouring Workshop"
            className="absolute inset-0 w-full h-full object-cover object-right opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050C14] via-[#050C14]/88 to-transparent" />
          <div className="relative z-10 p-8 sm:p-12 max-w-xl space-y-4">
            <h2 className="font-luxury-display text-2xl sm:text-3xl font-normal tracking-[0.06em] text-white">
              BESPOKE COMMISSIONS
            </h2>
            <p className="text-sm text-[#B8C5CE] leading-relaxed">
              Collaborate with our artisans to design a custom walnut and deep ocean epoxy
              masterpiece tailored to your space.
            </p>
            <div className="pt-1">
              <a
                href={formatWhatsAppUrl(
                  SUPPORT_PHONE_RAW,
                  'Hello DR Atelier, I would like to inquire about a bespoke resin commission.'
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="ocean-pill-btn inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full text-xs uppercase tracking-[0.16em] text-white"
              >
                <span>Begin Your Commission</span>
                <ArrowUpRight className="w-4 h-4 text-[#7AD3EA]" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* DARK FOOTER (Zero /chef links!) */}
      <footer
        className="bg-[#04070C] border-t border-cyan-300/15 pt-12 pb-8 mt-auto"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Brand Column */}
            <div className="md:col-span-4 space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src={BRAND_LOGO_URL}
                  alt="DR Resin Logo"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 object-contain"
                />
                <div>
                  <div className="font-luxury-display text-lg tracking-[0.16em] text-white">
                    DR RESIN
                  </div>
                  <div className="text-xs text-[#7AD3EA]">DR - Premium Resin Products</div>
                </div>
              </div>
              <p className="text-xs text-[#8A99A5] leading-relaxed max-w-xs">
                Museum-grade walnut wood and deep ocean epoxy resin wall clocks, live-edge tables,
                and collector pieces crafted for enduring luxury.
              </p>
            </div>

            {/* Customer Service & Complaints Card */}
            <div className="md:col-span-5">
              <div className="ocean-glass-card rounded-xl p-5 space-y-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#7AD3EA]">
                  Customer Service &amp; Complaints
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <a
                      href={`tel:${SUPPORT_PHONE_RAW}`}
                      className="tabular-nums text-lg font-semibold text-white hover:text-[#7AD3EA] transition-colors"
                    >
                      {SUPPORT_PHONE_DISPLAY}
                    </a>
                    <div className="text-[11px] text-[#7C8C99]">
                      Daily {settings.openTime} – {settings.closeTime}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyFooterPhone}
                      className="px-3 py-1.5 rounded-full bg-[#0B1926] border border-cyan-300/30 text-xs text-[#D8EEF5] hover:border-cyan-300/70 flex items-center gap-1.5"
                    >
                      {copiedFooterPhone ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <a
                      href={formatWhatsAppUrl(SUPPORT_PHONE_RAW, 'Hello DR Customer Service')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-400/40 text-xs text-emerald-200 hover:border-emerald-300 flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery & Payment Summary + Back to Top */}
            <div className="md:col-span-3 flex flex-col justify-between gap-4 md:items-end">
              <div className="space-y-2 md:text-right">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#7C8C99]">
                  Delivery &amp; Settlement
                </div>
                <div className="flex flex-wrap md:justify-end gap-2 text-xs text-[#C7D8E2]">
                  <span className="px-2.5 py-1 rounded-full bg-[#09131C] border border-cyan-300/20 tabular-nums">
                    Delivery: {formatPriceUSD(settings.deliveryFee)} USD
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-[#09131C] border border-cyan-300/20">
                    Pay on Delivery
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label="Scroll to top"
                className="w-10 h-10 rounded-full bg-[#09131C] border border-cyan-300/30 hover:border-cyan-300/75 text-[#D8EEF5] flex items-center justify-center transition-colors"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-cyan-300/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-[#687A88]">
            <span>© {new Date().getFullYear()} DR - PREMIUM RESIN PRODUCTS. ALL RIGHTS RESERVED.</span>
            <span>HANDCRAFTED WALNUT &amp; DEEP OCEAN EPOXY</span>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ProductDetailModal
        product={activeProduct}
        onClose={closeProductDetail}
        onAddToCart={addToCart}
        onBuyNow={buyNow}
      />

      <CartCheckoutDrawer
        isOpen={drawerOpen}
        initialStep={drawerStep}
        cart={cart}
        settings={settings}
        onClose={() => setDrawerOpen(false)}
        onUpdateQty={updateCartQty}
        onRemoveItem={removeCartItem}
        onClearCart={clearCart}
        onOrderCreated={handleOrderCreated}
        onOpenMyOrders={() => setMyOrdersOpen(true)}
      />

      <MyOrdersModal
        isOpen={myOrdersOpen}
        trackedCodes={trackedCodes}
        highlightedOrderCode={highlightedOrderCode}
        onClose={() => setMyOrdersOpen(false)}
        onAddTrackedCode={handleAddTrackedCode}
      />
    </div>
  );
};
