import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Eye,
  EyeOff,
  LogOut,
  ArrowLeft,
  Volume2,
  VolumeX,
  Printer,
  CheckCircle2,
  XCircle,
  Archive,
  Trash2,
  Download,
  RefreshCw,
  FileImage,
  X,
  RotateCcw,
  Cloud,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { Order, OrderStatus, Product, StoreSettings } from '../types';
import {
  BRAND_LOGO_URL,
  ORDERS_CHANNEL_NAME,
  broadcastOrdersUpdate,
  formatPriceUSD,
  playNewOrderChime,
  unlockAudioContext,
} from '../lib/utils';
import {
  auth,
  googleAuthProvider,
  syncOrderToFirestore,
  syncSettingsToFirestore,
} from '../lib/firebase';
import { ThermalReceiptPrint } from './ThermalReceiptPrint';

type ChefTab = 'active' | 'archived' | 'analytics' | 'settings';
type AnalyticsPeriod = 'today' | '7d' | '30d';
type AnalyticsSubTab = 'orders' | 'products';

export const ChefDashboardPage: React.FC = () => {
  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [bearerToken, setBearerToken] = useState<string>('');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<ChefTab>('active');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [orders, setOrders] = useState<Order[]>([]);
  const [analyticsBaselineAt, setAnalyticsBaselineAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);

  // Settings form state with dirty protection so polling never overwrites active edits
  const [formIsOpen, setFormIsOpen] = useState(true);
  const [formOpenTime, setFormOpenTime] = useState('10:00 AM');
  const [formCloseTime, setFormCloseTime] = useState('11:00 PM');
  const [formNote, setFormNote] = useState('');
  const [formDeliveryFee, setFormDeliveryFee] = useState('15');
  const [formHeroEyebrow, setFormHeroEyebrow] = useState('DR-4802-OCN');
  const [formHeroTitle, setFormHeroTitle] = useState('NATURAL WALNUT & DEEP OCEAN EPOXY RESIN');
  const [formHeroSubtitle, setFormHeroSubtitle] = useState('DR - Premium Resin Products');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSavedToast, setSettingsSavedToast] = useState('');

  // Audio notification & toast state
  const [muted, setMuted] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const knownOrderIdsRef = useRef<Set<string> | null>(null);

  // Modals & Printing
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  // Archive selection & confirm delete modal
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(new Set());
  const [confirmDeleteAction, setConfirmDeleteAction] = useState<
    | { type: 'single'; order: Order }
    | { type: 'bulk'; ids: string[] }
    | { type: 'clearAll' }
    | null
  >(null);

  // Analytics state
  const [period, setPeriod] = useState<AnalyticsPeriod>('today');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTab>('orders');

  // Optional Firebase Google Sync state
  const [firebaseUserEmail, setFirebaseUserEmail] = useState<string | null>(
    () => auth.currentUser?.email || null
  );

  const authHeaders = useCallback(
    (extra?: Record<string, string>) => {
      const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
        ...extra,
      };
      if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
      }
      return headers;
    },
    [bearerToken]
  );

  // Unlock Web Audio API on first user click
  useEffect(() => {
    const unlock = () => {
      void unlockAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/chef/auth-status');
        if (res.ok) {
          const data = await res.json();
          setAuthenticated(Boolean(data.authenticated));
          setNeedsSetup(Boolean(data.needsSetup));
        }
      } catch {
        // Ignore
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? '' : curr));
    }, 4500);
  }, []);

  const fetchChefOrders = useCallback(async () => {
    if (!authenticated) return;
    try {
      const res = await fetch('/api/chef/orders', { headers: authHeaders() });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const incomingOrders = (Array.isArray(data.orders) ? data.orders : []) as Order[];
      setOrders(incomingOrders);
      setAnalyticsBaselineAt(data.analyticsBaselineAt || null);

      // Detect newly arrived Pending orders
      if (knownOrderIdsRef.current === null) {
        knownOrderIdsRef.current = new Set(incomingOrders.map((o) => o.id));
      } else {
        const prevIds = knownOrderIdsRef.current;
        const brandNew = incomingOrders.filter((o) => !prevIds.has(o.id));
        if (brandNew.length > 0) {
          knownOrderIdsRef.current = new Set(incomingOrders.map((o) => o.id));
          showToast(`New order received: ${brandNew[0].orderCode}`);
          if (!muted) {
            void playNewOrderChime();
          }
        }
      }
    } catch {
      // Ignore transient network failures
    }
  }, [authenticated, authHeaders, muted, showToast]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const s = (await res.json()) as StoreSettings;
      setSettings(s);
      if (!settingsDirty) {
        setFormIsOpen(s.isOpen);
        setFormOpenTime(s.openTime);
        setFormCloseTime(s.closeTime);
        setFormNote(s.customNote);
        setFormDeliveryFee(String(s.deliveryFee));
        setFormHeroEyebrow(s.heroEyebrow ?? 'DR-4802-OCN');
        setFormHeroTitle(s.heroTitle ?? 'NATURAL WALNUT & DEEP OCEAN EPOXY RESIN');
        setFormHeroSubtitle(s.heroSubtitle ?? 'DR - Premium Resin Products');
      }
    } catch {
      // Ignore
    }
  }, [settingsDirty]);

  const fetchChefProducts = useCallback(
    async (fresh = false) => {
      if (!authenticated) return;
      if (fresh) setCatalogRefreshing(true);
      try {
        const res = await fetch(`/api/chef/products${fresh ? '?fresh=1' : ''}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setProducts(Array.isArray(data.products) ? data.products : []);
        }
      } catch {
        // Ignore
      } finally {
        setCatalogRefreshing(false);
      }
    },
    [authenticated, authHeaders]
  );

  useEffect(() => {
    if (!authenticated) return;
    void fetchChefOrders();
    void fetchSettings();
    void fetchChefProducts(false);

    const interval = window.setInterval(() => {
      void fetchChefOrders();
      void fetchSettings();
    }, 4000);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
      channel.onmessage = () => {
        void fetchChefOrders();
      };
    }

    return () => {
      window.clearInterval(interval);
      channel?.close();
    };
  }, [authenticated, fetchChefOrders, fetchSettings, fetchChefProducts]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const endpoint = needsSetup ? '/api/chef/setup-pin' : '/api/chef/auth';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
        if (data.needsSetup) setNeedsSetup(true);
        return;
      }
      setBearerToken(data.token || '');
      setAuthenticated(true);
      setNeedsSetup(false);
      setPinInput('');
      void unlockAudioContext();
    } catch {
      setAuthError('Unable to verify PIN right now.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/chef/logout', { method: 'POST', headers: authHeaders() });
    setAuthenticated(false);
    setBearerToken('');
    knownOrderIdsRef.current = null;
  };

  const toggleMute = async () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!nextMuted) {
      await unlockAudioContext();
      await playNewOrderChime();
    }
  };

  const updateOrder = async (
    orderId: string,
    patch: { status?: string; rejectionReason?: string; isArchived?: boolean }
  ) => {
    const res = await fetch(`/api/chef/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      const updated = data.order as Order;
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      broadcastOrdersUpdate({ orderId: updated.id });
      if (auth.currentUser?.emailVerified) {
        void syncOrderToFirestore(updated).catch(() => undefined);
      }
    }
  };

  const executeDeleteOrder = async () => {
    if (!confirmDeleteAction) return;
    if (confirmDeleteAction.type === 'single') {
      const res = await fetch(
        `/api/chef/orders/${encodeURIComponent(confirmDeleteAction.order.id)}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== confirmDeleteAction.order.id));
        broadcastOrdersUpdate();
      }
    } else if (confirmDeleteAction.type === 'bulk') {
      const res = await fetch('/api/chef/orders/bulk-delete', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids: confirmDeleteAction.ids }),
      });
      if (res.ok) {
        const idSet = new Set(confirmDeleteAction.ids);
        setOrders((prev) => prev.filter((o) => !idSet.has(o.id)));
        setSelectedArchiveIds(new Set());
        broadcastOrdersUpdate();
      }
    } else if (confirmDeleteAction.type === 'clearAll') {
      const res = await fetch('/api/chef/orders/bulk-delete', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ allArchived: true }),
      });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => !o.isArchived));
        setSelectedArchiveIds(new Set());
        broadcastOrdersUpdate();
      }
    }
    setConfirmDeleteAction(null);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      const res = await fetch('/api/chef/settings', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          isOpen: formIsOpen,
          openTime: formOpenTime,
          closeTime: formCloseTime,
          customNote: formNote,
          deliveryFee: Number(formDeliveryFee || 0),
          heroEyebrow: formHeroEyebrow,
          heroTitle: formHeroTitle,
          heroSubtitle: formHeroSubtitle,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const saved = data.settings as StoreSettings;
        setSettings(saved);
        setSettingsDirty(false);
        setSettingsSavedToast('Store settings saved and live across storefront.');
        window.setTimeout(() => setSettingsSavedToast(''), 3500);
        if (auth.currentUser?.emailVerified) {
          void syncSettingsToFirestore(saved).catch(() => undefined);
        }
      }
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResetAnalyticsBaseline = async () => {
    const res = await fetch('/api/chef/sales-profits/reset', {
      method: 'POST',
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setAnalyticsBaselineAt(data.analyticsBaselineAt || new Date().toISOString());
      showToast('Analytics period baseline reset.');
    }
  };

  const handlePrintOrder = (order: Order) => {
    setPrintOrder(order);
    window.setTimeout(() => {
      window.print();
    }, 80);
  };

  const handleGoogleCloudConnect = async () => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      setFirebaseUserEmail(cred.user.email);
      if (settings) {
        await syncSettingsToFirestore(settings);
      }
      showToast(`Cloud sync connected as ${cred.user.email}`);
    } catch {
      showToast('Google sign-in was cancelled or blocked.');
    }
  };

  // Derived lists
  const activeOrders = useMemo(() => orders.filter((o) => !o.isArchived), [orders]);
  const archivedOrders = useMemo(() => orders.filter((o) => o.isArchived), [orders]);

  const statusCounts = useMemo(() => {
    const counts = {
      ALL: activeOrders.length,
      [OrderStatus.PENDING]: 0,
      [OrderStatus.IN_PROGRESS]: 0,
      [OrderStatus.FINISHED]: 0,
      [OrderStatus.REJECTED]: 0,
    };
    for (const o of activeOrders) {
      if (o.status in counts) {
        counts[o.status as keyof typeof counts]++;
      }
    }
    return counts;
  }, [activeOrders]);

  const filteredActiveOrders = useMemo(() => {
    if (statusFilter === 'ALL') return activeOrders;
    return activeOrders.filter((o) => o.status === statusFilter);
  }, [activeOrders, statusFilter]);

  // Analytics calculations (Finished orders ONLY!)
  const analyticsData = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const periodMs =
      period === 'today'
        ? startOfToday
        : period === '7d'
        ? now.getTime() - 7 * 86400 * 1000
        : now.getTime() - 30 * 86400 * 1000;
    const baselineMs = analyticsBaselineAt ? new Date(analyticsBaselineAt).getTime() : 0;
    const cutoff = Math.max(periodMs, baselineMs);

    const finished = orders.filter((o) => {
      if (o.status !== OrderStatus.FINISHED || o.isDeletedFromArchive) return false;
      const t = new Date(o.completedAt || o.updatedAt || o.createdAt).getTime();
      return t >= cutoff;
    });

    let totalRevenue = 0;
    let totalNetProfit = 0;
    let totalItemsSold = 0;

    interface SoldProductRow {
      orderCode: string;
      productName: string;
      category: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      unitProfit: number;
      totalProfit: number;
      soldAt: string;
    }

    const soldRows: SoldProductRow[] = [];

    for (const o of finished) {
      totalRevenue += o.grandTotal;
      const soldAt = o.completedAt || o.updatedAt || o.createdAt;
      for (const item of o.items) {
        const unitProfit = item.unitProfitSnapshot ?? 0;
        const lineProfit = unitProfit * item.quantity;
        totalNetProfit += lineProfit;
        totalItemsSold += item.quantity;
        soldRows.push({
          orderCode: o.orderCode,
          productName: item.name,
          category: item.category,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          unitProfit,
          totalProfit: lineProfit,
          soldAt,
        });
      }
    }

    const marginPct = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

    return {
      finishedOrders: finished,
      soldRows,
      totalRevenue,
      totalNetProfit,
      marginPct,
      completedCount: finished.length,
      totalItemsSold,
    };
  }, [orders, period, analyticsBaselineAt]);

  if (authChecking) {
    return (
      <div className="min-h-screen ocean-vignette flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7AD3EA]">
          Initializing Atelier Console...
        </div>
      </div>
    );
  }

  // LOGIN / FIRST-RUN PIN SCREEN
  if (!authenticated) {
    return (
      <div className="min-h-screen ocean-vignette flex flex-col items-center justify-center p-4">
        <div className="ocean-glass-card w-full max-w-md rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <img
              src={BRAND_LOGO_URL}
              alt="DR Crest"
              referrerPolicy="no-referrer"
              className="w-14 h-14 mx-auto object-contain"
            />
            <span className="block text-[11px] uppercase tracking-[0.22em] text-[#7AD3EA]">
              Private Atelier Console
            </span>
            <h1 className="font-luxury-display text-2xl text-white tracking-[0.06em]">
              {needsSetup ? 'Set Chef Access PIN' : 'Chef Dashboard Login'}
            </h1>
            <p className="text-xs text-[#9BA9B4]">
              {needsSetup
                ? 'No CHEF_PIN environment secret is configured yet. Claim your initial admin PIN below.'
                : 'Enter your private Chef PIN to manage orders, receipts, and store availability.'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authError && (
              <div className="p-3 rounded-xl bg-rose-950/55 border border-rose-400/40 text-xs text-rose-200">
                {authError}
              </div>
            )}

            <div>
              <label className="block text-xs text-[#9BA9B4] mb-1.5">
                {needsSetup ? 'Create Admin PIN (4+ characters)' : 'Chef PIN'}
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  required
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter PIN"
                  className="w-full bg-[#040A10] border border-cyan-300/25 focus:border-[#4CC9EA] rounded-xl pl-4 pr-11 py-3 text-sm text-white placeholder-[#566673] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((s) => !s)}
                  aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9BA9B4] hover:text-white"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full ocean-pill-btn py-3 rounded-full text-xs uppercase tracking-[0.18em] font-semibold text-white disabled:opacity-50"
            >
              {authSubmitting
                ? 'Verifying...'
                : needsSetup
                ? 'Save PIN & Enter Dashboard'
                : 'Unlock Dashboard'}
            </button>
          </form>

          <div className="pt-4 border-t border-cyan-300/15 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[#9BA9B4] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Storefront</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05090F] text-[#F4F7F9] flex flex-col">
      {/* Real-time Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 ocean-glass-card border-[#4CC9EA] rounded-xl px-4 py-3 text-xs text-white shadow-2xl flex items-center gap-2.5">
          <span className="text-[#7AD3EA] font-semibold uppercase tracking-wider">Notice</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Chef Header */}
      <header className="sticky top-0 z-40 bg-[#050C14]/90 backdrop-blur-xl border-b border-cyan-300/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_URL}
              alt="DR Crest"
              referrerPolicy="no-referrer"
              className="w-9 h-9 object-contain"
            />
            <div>
              <h1 className="font-luxury-display text-base sm:text-lg tracking-[0.12em] text-white leading-none">
                DR ATELIER CONSOLE
              </h1>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[#7AD3EA]">
                <span>{settings?.isOpen ? 'Store Open' : 'Store Closed'}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{activeOrders.length} Active Orders</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGoogleCloudConnect}
              className="px-3 py-1.5 rounded-full bg-[#091520] border border-cyan-300/25 hover:border-cyan-300/60 text-xs text-[#D8EEF5] flex items-center gap-1.5"
              title="Optional Cloud Sync via Google Sign-In"
            >
              <Cloud className="w-3.5 h-3.5 text-[#7AD3EA]" />
              <span className="hidden md:inline">
                {firebaseUserEmail ? 'Cloud Synced' : 'Cloud Sync'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void toggleMute()}
              className={`px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5 ${
                muted
                  ? 'bg-[#08121B] border-cyan-300/20 text-[#8A99A5]'
                  : 'ocean-pill-btn text-white border-[#4CC9EA]/50'
              }`}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-[#7AD3EA]" />}
              <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound On'}</span>
            </button>

            <a
              href="/"
              className="px-3 py-1.5 rounded-full bg-[#091520] border border-cyan-300/25 hover:border-cyan-300/65 text-xs text-[#D8EEF5] flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Store</span>
            </a>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="px-3 py-1.5 rounded-full bg-rose-950/40 border border-rose-400/35 hover:border-rose-400/70 text-xs text-rose-200 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'active', label: `Active Orders (${activeOrders.length})` },
              { id: 'archived', label: `Archived Orders (${archivedOrders.length})` },
              { id: 'analytics', label: 'Sales & Profits' },
              { id: 'settings', label: 'Store Settings & Catalog' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.14em] whitespace-nowrap shrink-0 border transition-all ${
                activeTab === t.id
                  ? 'ocean-pill-btn text-white border-[#4CC9EA]'
                  : 'bg-[#08121B] border-cyan-300/20 text-[#9BA9B4] hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full flex-1 space-y-6">
        {/* TAB 1: ACTIVE ORDERS */}
        {activeTab === 'active' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'ALL', label: 'All', count: statusCounts.ALL },
                  { id: OrderStatus.PENDING, label: 'Pending', count: statusCounts[OrderStatus.PENDING] },
                  {
                    id: OrderStatus.IN_PROGRESS,
                    label: 'In Progress',
                    count: statusCounts[OrderStatus.IN_PROGRESS],
                  },
                  {
                    id: OrderStatus.FINISHED,
                    label: 'Finished',
                    count: statusCounts[OrderStatus.FINISHED],
                  },
                  {
                    id: OrderStatus.REJECTED,
                    label: 'Rejected',
                    count: statusCounts[OrderStatus.REJECTED],
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs border tabular-nums transition-all ${
                    statusFilter === f.id
                      ? 'ocean-pill-btn text-white border-[#4CC9EA]'
                      : 'bg-[#08121B] border-cyan-300/20 text-[#9BA9B4] hover:text-white'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {filteredActiveOrders.length === 0 ? (
              <div className="ocean-glass-card rounded-2xl p-12 text-center text-sm text-[#9BA9B4]">
                No orders match this status filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {filteredActiveOrders.map((order) => {
                  const isCod =
                    order.paymentMethod.toLowerCase() === 'cash on delivery' ||
                    order.paymentMethod.toLowerCase() === 'pay on delivery';
                  return (
                    <div key={order.id} className="ocean-glass-card rounded-2xl p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-luxury-display text-lg text-white tabular-nums">
                              {order.orderCode}
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#0C1D2A] border border-cyan-300/30 text-[#D8EEF5]">
                              {order.status}
                            </span>
                            {order.isPaid && (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-400/40 text-emerald-200">
                                Paid
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#7C8C99] mt-0.5">
                            {new Date(order.createdAt).toLocaleString()}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePrintOrder(order)}
                          className="px-3 py-1.5 rounded-full bg-[#091520] border border-cyan-300/25 hover:border-cyan-300/65 text-xs text-[#D8EEF5] flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-[#7AD3EA]" />
                          <span>Print</span>
                        </button>
                      </div>

                      {/* Customer Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#050C14]/80 rounded-xl p-3.5 border border-cyan-300/12">
                        <div>
                          <div className="text-[#7C8C99] text-[10px] uppercase tracking-wider">
                            Customer
                          </div>
                          <div className="text-white font-medium mt-0.5">{order.customerName}</div>
                          <a
                            href={`tel:${order.customerPhone}`}
                            className="text-[#7AD3EA] hover:underline tabular-nums inline-block mt-0.5"
                          >
                            {order.customerPhone}
                          </a>
                        </div>
                        <div>
                          <div className="text-[#7C8C99] text-[10px] uppercase tracking-wider">
                            Address
                          </div>
                          <div className="text-[#D8EEF5] mt-0.5">{order.deliveryAddress}</div>
                          {order.deliveryNotes && (
                            <div className="text-amber-200/80 mt-1">Note: {order.deliveryNotes}</div>
                          )}
                        </div>
                      </div>

                      {order.status === OrderStatus.REJECTED && order.rejectionReason && (
                        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-400/35 text-xs text-rose-200">
                          <strong>Rejection Reason:</strong> {order.rejectionReason}
                        </div>
                      )}

                      {/* Itemized Products */}
                      <div className="space-y-1.5 border-t border-b border-cyan-300/12 py-3 text-xs">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between gap-2">
                            <span className="text-[#D8EEF5]">
                              <strong className="text-[#7AD3EA] tabular-nums">
                                {item.quantity}×
                              </strong>{' '}
                              {item.name}
                            </span>
                            <span className="tabular-nums text-white">
                              {formatPriceUSD(item.lineTotal)} USD
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Payment Verification */}
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <div className="text-white font-medium">{order.paymentMethod}</div>
                          {!isCod && order.senderWalletPhone && (
                            <div className="text-[#9BA9B4] tabular-nums">
                              Wallet: {order.senderWalletPhone}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isCod ? (
                            <span className="px-2.5 py-1 rounded-full bg-[#091520] border border-cyan-300/25 text-[#9BA9B4]">
                              COD
                            </span>
                          ) : order.receiptImageDataUrl ? (
                            <button
                              type="button"
                              onClick={() => setReceiptOrder(order)}
                              className="px-3 py-1.5 rounded-full bg-cyan-950/50 border border-cyan-400/40 text-cyan-200 hover:border-cyan-300 flex items-center gap-1.5"
                            >
                              <FileImage className="w-3.5 h-3.5" />
                              <span>Inspect Receipt</span>
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-400/40 text-amber-200">
                              Missing Receipt
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Totals + Order Actions */}
                      <div className="pt-3 border-t border-cyan-300/12 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-[#9BA9B4]">
                          Delivery:{' '}
                          <span className="tabular-nums text-white">
                            {formatPriceUSD(order.deliveryFee)}
                          </span>{' '}
                          · Total:{' '}
                          <span className="tabular-nums text-sm font-semibold text-[#7AD3EA]">
                            {formatPriceUSD(order.grandTotal)} USD
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {order.status === OrderStatus.PENDING && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void updateOrder(order.id, { status: OrderStatus.IN_PROGRESS })
                                }
                                className="ocean-pill-btn px-3.5 py-1.5 rounded-full text-xs text-white"
                              >
                                Start Preparing
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(order);
                                  setRejectReason('');
                                }}
                                className="px-3.5 py-1.5 rounded-full bg-rose-950/50 border border-rose-400/40 text-xs text-rose-200"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {order.status === OrderStatus.IN_PROGRESS && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void updateOrder(order.id, { status: OrderStatus.FINISHED })
                                }
                                className="px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-400/50 text-xs text-emerald-200 flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirm Finished &amp; Delivered</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(order);
                                  setRejectReason('');
                                }}
                                className="px-3.5 py-1.5 rounded-full bg-rose-950/50 border border-rose-400/40 text-xs text-rose-200"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {(order.status === OrderStatus.FINISHED ||
                            order.status === OrderStatus.REJECTED) && (
                            <button
                              type="button"
                              onClick={() => void updateOrder(order.id, { isArchived: true })}
                              className="px-3.5 py-1.5 rounded-full bg-[#091520] border border-cyan-300/30 text-xs text-[#D8EEF5] flex items-center gap-1.5"
                            >
                              <Archive className="w-3.5 h-3.5 text-[#7AD3EA]" />
                              <span>Archive Order</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ARCHIVED ORDERS */}
        {activeTab === 'archived' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {selectedArchiveIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDeleteAction({
                        type: 'bulk',
                        ids: Array.from(selectedArchiveIds),
                      })
                    }
                    className="px-4 py-2 rounded-full bg-rose-950/60 border border-rose-400/45 text-xs text-rose-200 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedArchiveIds.size})</span>
                  </button>
                )}
              </div>

              {archivedOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAction({ type: 'clearAll' })}
                  className="px-4 py-2 rounded-full bg-rose-950/40 border border-rose-400/35 text-xs text-rose-200 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All Archive</span>
                </button>
              )}
            </div>

            <div className="ocean-glass-card rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-cyan-300/15 bg-[#07131E] text-[#9BA9B4] uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-4 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all archived orders"
                        checked={
                          archivedOrders.length > 0 &&
                          selectedArchiveIds.size === archivedOrders.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedArchiveIds(new Set(archivedOrders.map((o) => o.id)));
                          } else {
                            setSelectedArchiveIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="p-4">Order Code</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Payment / Wallet</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Date</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-300/10">
                  {archivedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-[#9BA9B4]">
                        No archived orders yet.
                      </td>
                    </tr>
                  ) : (
                    archivedOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#0B1824]/60">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${order.orderCode}`}
                            checked={selectedArchiveIds.has(order.id)}
                            onChange={(e) => {
                              setSelectedArchiveIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(order.id);
                                else next.delete(order.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="p-4 font-luxury-display text-white tabular-nums">
                          {order.orderCode}
                        </td>
                        <td className="p-4">
                          <div className="text-white">{order.customerName}</div>
                          <div className="text-[#7C8C99] tabular-nums">{order.customerPhone}</div>
                        </td>
                        <td className="p-4">{order.status}</td>
                        <td className="p-4">
                          <div>{order.paymentMethod}</div>
                          {order.senderWalletPhone && (
                            <div className="text-[#7C8C99] tabular-nums">
                              {order.senderWalletPhone}
                            </div>
                          )}
                        </td>
                        <td className="p-4 tabular-nums font-semibold text-[#7AD3EA]">
                          {formatPriceUSD(order.grandTotal)} USD
                        </td>
                        <td className="p-4 text-[#9BA9B4]">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {order.receiptImageDataUrl && (
                              <button
                                type="button"
                                onClick={() => setReceiptOrder(order)}
                                title="Inspect Receipt"
                                className="p-1.5 rounded-lg bg-[#091520] border border-cyan-300/25 text-[#7AD3EA]"
                              >
                                <FileImage className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handlePrintOrder(order)}
                              title="Print Receipt"
                              className="p-1.5 rounded-lg bg-[#091520] border border-cyan-300/25 text-[#D8EEF5]"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAction({ type: 'single', order })}
                              title="Delete Permanently"
                              className="p-1.5 rounded-lg bg-rose-950/40 border border-rose-400/35 text-rose-200"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SALES & PROFITS ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: '7d', label: 'Last 7 Days' },
                    { id: '30d', label: 'Last 30 Days' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={`px-4 py-1.5 rounded-full text-xs border ${
                      period === p.id
                        ? 'ocean-pill-btn text-white border-[#4CC9EA]'
                        : 'bg-[#08121B] border-cyan-300/20 text-[#9BA9B4]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleResetAnalyticsBaseline()}
                className="px-4 py-1.5 rounded-full bg-[#091520] border border-cyan-300/25 hover:border-cyan-300/60 text-xs text-[#D8EEF5] flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#7AD3EA]" />
                <span>Reset Analytics Baseline</span>
              </button>
            </div>

            {/* 5 Unified KPIs (Finished Orders Only) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="ocean-glass-card rounded-xl p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#9BA9B4]">
                  Total Sales Revenue
                </div>
                <div className="mt-2 font-luxury-display text-2xl text-white tabular-nums">
                  {formatPriceUSD(analyticsData.totalRevenue)}
                </div>
              </div>
              <div className="ocean-glass-card rounded-xl p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#9BA9B4]">
                  Total Net Profit
                </div>
                <div className="mt-2 font-luxury-display text-2xl text-emerald-300 tabular-nums">
                  {formatPriceUSD(analyticsData.totalNetProfit)}
                </div>
              </div>
              <div className="ocean-glass-card rounded-xl p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#9BA9B4]">
                  Profit Margin
                </div>
                <div className="mt-2 font-luxury-display text-2xl text-[#7AD3EA] tabular-nums">
                  {analyticsData.marginPct.toFixed(1)}%
                </div>
              </div>
              <div className="ocean-glass-card rounded-xl p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#9BA9B4]">
                  Completed Orders
                </div>
                <div className="mt-2 font-luxury-display text-2xl text-white tabular-nums">
                  {analyticsData.completedCount}
                </div>
              </div>
              <div className="ocean-glass-card rounded-xl p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#9BA9B4]">
                  Total Items Sold
                </div>
                <div className="mt-2 font-luxury-display text-2xl text-white tabular-nums">
                  {analyticsData.totalItemsSold}
                </div>
              </div>
            </div>

            {/* Sub-Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnalyticsSubTab('orders')}
                className={`px-4 py-1.5 rounded-full text-xs border ${
                  analyticsSubTab === 'orders'
                    ? 'ocean-pill-btn text-white border-[#4CC9EA]'
                    : 'bg-[#08121B] border-cyan-300/20 text-[#9BA9B4]'
                }`}
              >
                Completed Orders Table
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsSubTab('products')}
                className={`px-4 py-1.5 rounded-full text-xs border ${
                  analyticsSubTab === 'products'
                    ? 'ocean-pill-btn text-white border-[#4CC9EA]'
                    : 'bg-[#08121B] border-cyan-300/20 text-[#9BA9B4]'
                }`}
              >
                Sold Products Log Table
              </button>
            </div>

            {analyticsSubTab === 'orders' ? (
              <div className="ocean-glass-card rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-cyan-300/15 bg-[#07131E] text-[#9BA9B4] uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-4">Order Code</th>
                      <th className="p-4">Customer &amp; Phone</th>
                      <th className="p-4">Sold Items</th>
                      <th className="p-4">Payment / Wallet</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Completed At</th>
                      <th className="p-4 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-300/10">
                    {analyticsData.finishedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-10 text-center text-[#9BA9B4]">
                          No completed orders in this period.
                        </td>
                      </tr>
                    ) : (
                      analyticsData.finishedOrders.map((o) => (
                        <tr key={o.id}>
                          <td className="p-4 font-luxury-display text-white tabular-nums">
                            {o.orderCode}
                          </td>
                          <td className="p-4">
                            <div className="text-white">{o.customerName}</div>
                            <div className="text-[#7C8C99] tabular-nums">{o.customerPhone}</div>
                          </td>
                          <td className="p-4 text-[#D8EEF5]">
                            {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                          </td>
                          <td className="p-4">
                            <div>{o.paymentMethod}</div>
                            {o.senderWalletPhone && (
                              <div className="text-[#7C8C99] tabular-nums">
                                {o.senderWalletPhone}
                              </div>
                            )}
                          </td>
                          <td className="p-4 tabular-nums font-semibold text-[#7AD3EA]">
                            {formatPriceUSD(o.grandTotal)} USD
                          </td>
                          <td className="p-4 text-[#9BA9B4]">
                            {new Date(o.completedAt || o.updatedAt).toLocaleString()}
                          </td>
                          <td className="p-4 text-right">
                            <button
                              type="button"
                              onClick={() => handlePrintOrder(o)}
                              className="px-3 py-1 rounded-full bg-[#091520] border border-cyan-300/25 text-[#D8EEF5] inline-flex items-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ocean-glass-card rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-cyan-300/15 bg-[#07131E] text-[#9BA9B4] uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-4">Product Name</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Qty</th>
                      <th className="p-4">Unit Price</th>
                      <th className="p-4">Line Total</th>
                      <th className="p-4">Unit / Total Profit</th>
                      <th className="p-4">Order</th>
                      <th className="p-4">Sale Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-300/10">
                    {analyticsData.soldRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-10 text-center text-[#9BA9B4]">
                          No sold products logged in this period.
                        </td>
                      </tr>
                    ) : (
                      analyticsData.soldRows.map((r, idx) => (
                        <tr key={idx}>
                          <td className="p-4 text-white font-medium">{r.productName}</td>
                          <td className="p-4 text-[#9BA9B4]">{r.category}</td>
                          <td className="p-4 tabular-nums">{r.quantity}</td>
                          <td className="p-4 tabular-nums">{formatPriceUSD(r.unitPrice)}</td>
                          <td className="p-4 tabular-nums text-white">
                            {formatPriceUSD(r.lineTotal)}
                          </td>
                          <td className="p-4 tabular-nums text-emerald-300">
                            {formatPriceUSD(r.unitProfit)} / {formatPriceUSD(r.totalProfit)}
                          </td>
                          <td className="p-4 tabular-nums text-[#7AD3EA]">{r.orderCode}</td>
                          <td className="p-4 text-[#9BA9B4]">
                            {new Date(r.soldAt).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {analyticsData.soldRows.length > 0 && (
                    <tfoot className="border-t border-cyan-300/25 bg-[#07131E] font-semibold">
                      <tr>
                        <td className="p-4 text-white" colSpan={2}>
                          Totals
                        </td>
                        <td className="p-4 tabular-nums text-white">
                          {analyticsData.totalItemsSold}
                        </td>
                        <td className="p-4" />
                        <td className="p-4 tabular-nums text-[#7AD3EA]">
                          {formatPriceUSD(
                            analyticsData.soldRows.reduce((s, r) => s + r.lineTotal, 0)
                          )}{' '}
                          USD
                        </td>
                        <td className="p-4 tabular-nums text-emerald-300" colSpan={3}>
                          Net Profit: {formatPriceUSD(analyticsData.totalNetProfit)} USD
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: STORE SETTINGS & CATALOG PREVIEW */}
        {activeTab === 'settings' && (
          <div className="space-y-8">
            <form
              onSubmit={handleSaveSettings}
              className="ocean-glass-card rounded-2xl p-6 sm:p-8 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-cyan-300/15">
                <div>
                  <h2 className="font-luxury-display text-xl text-white">Store Control</h2>
                  <p className="text-xs text-[#9BA9B4] mt-1">
                    Changes propagate live to storefront status, cart, checkout invoice, and footer.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormIsOpen((v) => !v);
                    setSettingsDirty(true);
                  }}
                  className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.16em] font-semibold border transition-all ${
                    formIsOpen
                      ? 'bg-emerald-950/60 border-emerald-400/55 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-400/55 text-rose-200'
                  }`}
                >
                  {formIsOpen ? 'Store Open · Click to Close' : 'Store Closed · Click to Open'}
                </button>
              </div>

              {settingsSavedToast && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-400/40 text-xs text-emerald-200">
                  {settingsSavedToast}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#9BA9B4] mb-1.5">Opening Time</label>
                  <input
                    type="text"
                    value={formOpenTime}
                    onChange={(e) => {
                      setFormOpenTime(e.target.value);
                      setSettingsDirty(true);
                    }}
                    className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-[#4CC9EA] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9BA9B4] mb-1.5">Closing Time</label>
                  <input
                    type="text"
                    value={formCloseTime}
                    onChange={(e) => {
                      setFormCloseTime(e.target.value);
                      setSettingsDirty(true);
                    }}
                    className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-[#4CC9EA] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9BA9B4] mb-1.5">
                    Home Delivery Fee (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formDeliveryFee}
                    onChange={(e) => {
                      setFormDeliveryFee(e.target.value);
                      setSettingsDirty(true);
                    }}
                    className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl px-3.5 py-2.5 text-sm text-white tabular-nums focus:border-[#4CC9EA] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#9BA9B4] mb-1.5">
                  Customer Announcement / Closed-Store Note
                </label>
                <textarea
                  rows={2}
                  value={formNote}
                  onChange={(e) => {
                    setFormNote(e.target.value);
                    setSettingsDirty(true);
                  }}
                  className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-[#4CC9EA] focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-cyan-300/15 space-y-4">
                <div>
                  <h3 className="font-luxury-display text-base text-white">Hero Section Text</h3>
                  <p className="text-xs text-[#9BA9B4] mt-0.5">
                    Customize the headline, eyebrow code, and subtitle shown over the main hero showcase.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#9BA9B4] mb-1.5">
                      Hero Eyebrow / Code
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={formHeroEyebrow}
                      onChange={(e) => {
                        setFormHeroEyebrow(e.target.value);
                        setSettingsDirty(true);
                      }}
                      placeholder="e.g. DR-4802-OCN"
                      className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-[#4CC9EA] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#9BA9B4] mb-1.5">
                      Hero Subtitle
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={formHeroSubtitle}
                      onChange={(e) => {
                        setFormHeroSubtitle(e.target.value);
                        setSettingsDirty(true);
                      }}
                      placeholder="e.g. DR - Premium Resin Products"
                      className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-[#4CC9EA] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#9BA9B4] mb-1.5">
                    Hero Main Headline *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={formHeroTitle}
                    onChange={(e) => {
                      setFormHeroTitle(e.target.value);
                      setSettingsDirty(true);
                    }}
                    placeholder="e.g. NATURAL WALNUT & DEEP OCEAN EPOXY RESIN"
                    className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-[#4CC9EA] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="ocean-pill-btn px-6 py-2.5 rounded-full text-xs uppercase tracking-[0.16em] text-white"
                >
                  {settingsSaving ? 'Saving...' : 'Save Store Settings'}
                </button>
              </div>
            </form>

            {/* Synced Catalog Table */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-luxury-display text-xl text-white">
                    Synced Catalog Preview ({products.length})
                  </h3>
                  <p className="text-xs text-[#9BA9B4]">
                    Live Google Sheets synchronization across all discovered category tabs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchChefProducts(true)}
                  disabled={catalogRefreshing}
                  className="ocean-pill-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider text-white flex items-center gap-2"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#7AD3EA] ${
                      catalogRefreshing ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Refresh from Google Sheets</span>
                </button>
              </div>

              <div className="ocean-glass-card rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-cyan-300/15 bg-[#07131E] text-[#9BA9B4] uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-4">Piece</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Price</th>
                      <th className="p-4">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-300/10">
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.primaryImage || BRAND_LOGO_URL}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              className="w-12 h-9 rounded-lg object-cover bg-[#040A10] border border-cyan-300/15 shrink-0"
                            />
                            <span className="text-white font-medium">{p.name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-[#7AD3EA]">{p.category}</td>
                        <td className="p-4 tabular-nums font-semibold text-white">
                          {formatPriceUSD(p.price)} USD
                        </td>
                        <td className="p-4 text-[#9BA9B4] max-w-md line-clamp-2">
                          {p.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Receipt Inspection Modal */}
      {receiptOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setReceiptOrder(null)}
        >
          <div
            className="ocean-glass-card w-full max-w-lg max-h-[90vh] rounded-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-cyan-300/15 flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-[#7AD3EA]">
                  Payment Verification
                </span>
                <h3 className="font-luxury-display text-lg text-white tabular-nums">
                  {receiptOrder.orderCode} · Expected {formatPriceUSD(receiptOrder.grandTotal)} USD
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="w-8 h-8 rounded-full bg-[#091520] border border-cyan-300/25 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div className="text-xs text-[#B8C5CE] flex flex-wrap justify-between gap-2">
                <span>Method: {receiptOrder.paymentMethod}</span>
                <span>Sender Wallet: {receiptOrder.senderWalletPhone}</span>
              </div>
              <img
                src={receiptOrder.receiptImageDataUrl}
                alt={`Receipt for ${receiptOrder.orderCode}`}
                className="w-full rounded-xl border border-cyan-300/20"
              />
            </div>
            <div className="px-6 py-4 border-t border-cyan-300/15 flex justify-end">
              <a
                href={receiptOrder.receiptImageDataUrl}
                download={`receipt-${receiptOrder.orderCode}.png`}
                className="ocean-pill-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider text-white inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Image</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="ocean-glass-card w-full max-w-md rounded-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-300">
              <XCircle className="w-5 h-5" />
              <h3 className="font-luxury-display text-lg text-white">
                Reject Order {rejectTarget.orderCode}
              </h3>
            </div>
            <p className="text-xs text-[#9BA9B4]">
              Provide a clear reason. The customer will see this exact note in My Orders.
            </p>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Transfer receipt mismatch or item out of stock"
              className="w-full bg-[#040A10] border border-cyan-300/25 rounded-xl p-3 text-sm text-white focus:border-rose-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-full bg-[#091520] border border-cyan-300/25 text-xs text-[#D8EEF5]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim()}
                onClick={() => {
                  const target = rejectTarget;
                  const reason = rejectReason.trim();
                  setRejectTarget(null);
                  void updateOrder(target.id, {
                    status: OrderStatus.REJECTED,
                    rejectionReason: reason,
                  });
                }}
                className="px-5 py-2 rounded-full bg-rose-950/70 border border-rose-400/60 text-xs text-rose-100 disabled:opacity-45"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {confirmDeleteAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setConfirmDeleteAction(null)}
        >
          <div
            className="ocean-glass-card w-full max-w-md rounded-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-luxury-display text-lg text-white">Confirm Permanent Deletion</h3>
            <p className="text-xs text-[#9BA9B4] leading-relaxed">
              {confirmDeleteAction.type === 'single'
                ? `Permanently delete ${confirmDeleteAction.order.orderCode}? This removes the order from both the Archive and the customer's My Orders history.`
                : confirmDeleteAction.type === 'bulk'
                ? `Permanently delete ${confirmDeleteAction.ids.length} selected archived orders?`
                : 'Permanently delete ALL archived orders? This action cannot be undone.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAction(null)}
                className="px-4 py-2 rounded-full bg-[#091520] border border-cyan-300/25 text-xs text-[#D8EEF5]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteOrder()}
                className="px-5 py-2 rounded-full bg-rose-950/80 border border-rose-400/65 text-xs text-rose-100"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden 80mm Thermal Receipt Print Container */}
      <ThermalReceiptPrint order={printOrder} />
    </div>
  );
};
