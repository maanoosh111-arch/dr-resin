import {
  BRAND_LOGO_URL,
  DEFAULT_SETTINGS,
  ORDERS_CHANNEL_NAME,
  OrderStatus,
} from './config.js';
import {
  bulkDeleteChefOrders,
  deleteChefOrder,
  fetchChefOrders,
  fetchChefProducts,
  fetchStoreSettings,
  getChefAuthStatus,
  logoutChef,
  patchChefOrder,
  resetChefAnalyticsBaseline,
  saveChefSettings,
  submitChefAuth,
} from './api.js';
import { createIcon } from './icons.js';
import {
  broadcastOrdersUpdate,
  clearNode,
  el,
  formatStorePrice,
  playNewOrderChime,
  sanitizeImageUrl,
  unlockAudioContext,
} from './utils.js';

function formatChefPrice(amount) {
  return formatStorePrice(amount, state.settings?.currency || state.formCurrency || 'EUR', state.settings?.eurToUsdRate || 1.09);
}

function getChefCurrencyCode() {
  return state.settings?.currency || state.formCurrency || 'EUR';
}

const state = {
  authChecking: true,
  authenticated: false,
  needsSetup: false,
  bearerToken: '',
  pinInput: '',
  showPin: false,
  authError: '',
  authSubmitting: false,

  activeTab: 'active', // 'active' | 'archived' | 'analytics' | 'settings'
  statusFilter: 'ALL',

  orders: [],
  analyticsBaselineAt: null,
  settings: null,
  products: [],
  catalogRefreshing: false,

  // Store Control & Hero Text form
  formIsOpen: DEFAULT_SETTINGS.isOpen,
  formOpenTime: DEFAULT_SETTINGS.openTime,
  formCloseTime: DEFAULT_SETTINGS.closeTime,
  formNote: DEFAULT_SETTINGS.customNote,
  formDeliveryFee: String(DEFAULT_SETTINGS.deliveryFee),
  formHeroEyebrow: DEFAULT_SETTINGS.heroEyebrow,
  formHeroTitle: DEFAULT_SETTINGS.heroTitle,
  formHeroSubtitle: DEFAULT_SETTINGS.heroSubtitle,
  formSupportPhone: DEFAULT_SETTINGS.supportPhone,
  formCurrency: DEFAULT_SETTINGS.currency,
  settingsDirty: false,
  settingsSaving: false,
  settingsSavedToast: '',

  // Audio & toast
  muted: false,
  toastMessage: '',
  knownOrderIds: null,

  // Modals & printing
  receiptOrder: null,
  rejectTarget: null,
  rejectReason: '',
  printOrder: null,

  // Archive selection & confirm delete modal
  selectedArchiveIds: new Set(),
  confirmDeleteAction: null,

  // Analytics
  period: 'today', // 'today' | '7d' | '30d'
  analyticsSubTab: 'orders', // 'orders' | 'products'

};

let pollIntervalId = null;
let ordersChannel = null;
let toastTimerId = null;
let savedToastTimerId = null;

const appRoot = document.getElementById('chef-app');
const printRoot = document.getElementById('printable-receipt-container');

function statusBadgeClass(status) {
  switch (status) {
    case OrderStatus.PENDING:
      return 'status-badge status-badge--pending';
    case OrderStatus.IN_PROGRESS:
      return 'status-badge status-badge--progress';
    case OrderStatus.FINISHED:
      return 'status-badge status-badge--finished';
    case OrderStatus.REJECTED:
      return 'status-badge status-badge--rejected';
    default:
      return 'status-badge';
  }
}

function showToast(msg) {
  state.toastMessage = msg;
  renderToast();
  if (toastTimerId) window.clearTimeout(toastTimerId);
  toastTimerId = window.setTimeout(() => {
    if (state.toastMessage === msg) {
      state.toastMessage = '';
      renderToast();
    }
  }, 4500);
}

function getActiveOrders() {
  return state.orders.filter((o) => !o.isArchived);
}

function getArchivedOrders() {
  return state.orders.filter((o) => o.isArchived);
}

function getStatusCounts(activeOrders) {
  const counts = {
    ALL: activeOrders.length,
    [OrderStatus.PENDING]: 0,
    [OrderStatus.IN_PROGRESS]: 0,
    [OrderStatus.FINISHED]: 0,
    [OrderStatus.REJECTED]: 0,
  };
  for (const o of activeOrders) {
    if (o.status in counts) {
      counts[o.status] += 1;
    }
  }
  return counts;
}

function computeAnalyticsData() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const periodMs =
    state.period === 'today'
      ? startOfToday
      : state.period === '7d'
      ? now.getTime() - 7 * 86400 * 1000
      : now.getTime() - 30 * 86400 * 1000;
  const baselineMs = state.analyticsBaselineAt ? new Date(state.analyticsBaselineAt).getTime() : 0;
  const cutoff = Math.max(periodMs, baselineMs);

  const finished = state.orders.filter((o) => {
    if (o.status !== OrderStatus.FINISHED || o.isDeletedFromArchive) return false;
    const t = new Date(o.completedAt || o.updatedAt || o.createdAt).getTime();
    return t >= cutoff;
  });

  let totalRevenue = 0;
  let totalNetProfit = 0;
  let totalItemsSold = 0;
  const soldRows = [];

  for (const o of finished) {
    totalRevenue += o.grandTotal;
    const soldAt = o.completedAt || o.updatedAt || o.createdAt;
    for (const item of o.items || []) {
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
}

function renderThermalReceipt(order) {
  if (!printRoot) return;
  clearNode(printRoot);
  if (!order) {
    printRoot.setAttribute('aria-hidden', 'true');
    return;
  }
  printRoot.setAttribute('aria-hidden', 'false');

  const header = el(
    'div',
    {
      style: {
        textAlign: 'center',
        marginBottom: '8px',
        borderBottom: '1px dashed #000',
        paddingBottom: '6px',
      },
    },
    [
      el('div', { style: { fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px' } }, 'DR - PREMIUM RESIN'),
      el('div', { style: { fontSize: '10px' } }, 'Handcrafted Wood & Epoxy Atelier'),
      el('div', { style: { fontSize: '10px' } }, `Support: ${(state.settings?.supportPhone || DEFAULT_SETTINGS.supportPhone)}`),
    ]
  );

  const orderMeta = el('div', { style: { marginBottom: '6px', fontSize: '11px' } }, [
    el('div', null, [el('strong', null, 'Order: '), order.orderCode]),
    el('div', null, [el('strong', null, 'Date: '), new Date(order.createdAt).toLocaleString()]),
    el('div', null, [el('strong', null, 'Status: '), order.status]),
  ]);

  const customerBlock = el(
    'div',
    {
      style: {
        borderTop: '1px dashed #000',
        borderBottom: '1px dashed #000',
        padding: '5px 0',
        marginBottom: '6px',
      },
    },
    [
      el('div', null, [el('strong', null, 'Customer: '), order.customerName]),
      el('div', null, [el('strong', null, 'Phone: '), order.customerPhone]),
      el('div', null, [el('strong', null, 'Address: '), order.deliveryAddress]),
      order.deliveryNotes ? el('div', null, [el('strong', null, 'Notes: '), order.deliveryNotes]) : null,
    ]
  );

  const paymentBlock = el('div', { style: { marginBottom: '6px' } }, [
    el('div', null, [el('strong', null, 'Payment: '), order.paymentMethod]),
    order.senderWalletPhone ? el('div', null, [el('strong', null, 'Wallet: '), order.senderWalletPhone]) : null,
  ]);

  const itemsTable = el(
    'table',
    {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        borderTop: '1px dashed #000',
        borderBottom: '1px dashed #000',
        marginBottom: '6px',
      },
    },
    [
      el('thead', null, [
        el('tr', null, [
          el('th', { style: { textAlign: 'left', padding: '3px 0' } }, 'Item'),
          el('th', { style: { textAlign: 'center', padding: '3px 0' } }, 'Qty'),
          el('th', { style: { textAlign: 'right', padding: '3px 0' } }, 'Total'),
        ]),
      ]),
      el(
        'tbody',
        null,
        (order.items || []).map((item) =>
          el('tr', null, [
            el('td', { style: { padding: '2px 0' } }, item.name),
            el('td', { style: { textAlign: 'center', padding: '2px 0' } }, String(item.quantity)),
            el('td', { style: { textAlign: 'right', padding: '2px 0' } }, formatChefPrice(item.lineTotal)),
          ])
        )
      ),
    ]
  );

  const totals = el('div', { style: { fontSize: '11px', marginBottom: '8px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [
      el('span', null, 'Subtotal:'),
      el('span', null, `${formatChefPrice(order.subtotal)} ${getChefCurrencyCode()}`),
    ]),
    el('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [
      el('span', null, 'Delivery Fee:'),
      el('span', null, `${formatChefPrice(order.deliveryFee)} ${getChefCurrencyCode()}`),
    ]),
    el(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 'bold',
          fontSize: '13px',
          marginTop: '4px',
          borderTop: '1px solid #000',
          paddingTop: '4px',
        },
      },
      [
        el('span', null, 'GRAND TOTAL:'),
        el('span', null, `${formatChefPrice(order.grandTotal)} ${getChefCurrencyCode()}`),
      ]
    ),
  ]);

  const footer = el(
    'div',
    {
      style: {
        textAlign: 'center',
        fontSize: '10px',
        borderTop: '1px dashed #000',
        paddingTop: '6px',
      },
    },
    [
      el('div', null, 'Thank you for choosing DR Resin'),
      el('div', null, `Customer Care: ${(state.settings?.supportPhone || DEFAULT_SETTINGS.supportPhone)}`),
    ]
  );

  printRoot.append(header, orderMeta, customerBlock, paymentBlock, itemsTable, totals, footer);
}

function handlePrintOrder(order) {
  state.printOrder = order;
  renderThermalReceipt(order);
  window.setTimeout(() => {
    window.print();
  }, 80);
}

async function refreshOrders() {
  if (!state.authenticated) return;
  try {
    const res = await fetchChefOrders(state.bearerToken);
    if (res.status === 401) {
      state.authenticated = false;
      stopBackgroundSync();
      render();
      return;
    }
    if (!res.ok || !res.data) return;

    const serverOrders = Array.isArray(res.data.orders) ? res.data.orders : [];
    state.orders = serverOrders;
    state.analyticsBaselineAt = res.data.analyticsBaselineAt || null;

    if (state.knownOrderIds === null) {
      state.knownOrderIds = new Set(serverOrders.map((o) => o.id));
    } else {
      const prevIds = state.knownOrderIds;
      const brandNew = serverOrders.filter((o) => !prevIds.has(o.id));
      if (brandNew.length > 0) {
        state.knownOrderIds = new Set(serverOrders.map((o) => o.id));
        showToast(`New order received: ${brandNew[0].orderCode}`);
        if (!state.muted) void playNewOrderChime();
      }
    }
    updateDashboardAfterPoll();
  } catch {
    // Ignore transient network failures.
  }
}

async function refreshSettings() {
  try {
    // Server-side Firebase Admin reads the shared settings document.
    const chosen = await fetchStoreSettings();
    if (!chosen) return;

    state.settings = chosen;
    if (!state.settingsDirty) {
      state.formIsOpen = Boolean(chosen.isOpen);
      state.formOpenTime = chosen.openTime || DEFAULT_SETTINGS.openTime;
      state.formCloseTime = chosen.closeTime || DEFAULT_SETTINGS.closeTime;
      state.formNote = chosen.customNote ?? '';
      state.formDeliveryFee = String(chosen.deliveryFee ?? 15);
      state.formHeroEyebrow = chosen.heroEyebrow ?? DEFAULT_SETTINGS.heroEyebrow;
      state.formHeroTitle = chosen.heroTitle ?? DEFAULT_SETTINGS.heroTitle;
      state.formHeroSubtitle = chosen.heroSubtitle ?? DEFAULT_SETTINGS.heroSubtitle;
      state.formSupportPhone = chosen.supportPhone ?? DEFAULT_SETTINGS.supportPhone;
      state.formCurrency = chosen.currency === 'USD' ? 'USD' : 'EUR';
    }
    updateChromeOnly();
  } catch {
    // Ignore
  }
}

async function refreshChefProducts(fresh = false) {
  if (!state.authenticated) return;
  if (fresh) {
    state.catalogRefreshing = true;
    if (state.activeTab === 'settings') renderMainSection();
  }
  try {
    const res = await fetchChefProducts(fresh, state.bearerToken);
    if (res.ok && res.data) {
      state.products = Array.isArray(res.data.products) ? res.data.products : [];
    }
  } catch {
    // Ignore
  } finally {
    state.catalogRefreshing = false;
    if (state.activeTab === 'settings') renderMainSection();
  }
}

function startBackgroundSync() {
  stopBackgroundSync();
  void refreshOrders();
  void refreshSettings();
  void refreshChefProducts(false);

  pollIntervalId = window.setInterval(() => {
    void refreshOrders();
    void refreshSettings();
  }, 4000);

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      ordersChannel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
      ordersChannel.onmessage = () => {
        void refreshOrders();
      };
    } catch {
      ordersChannel = null;
    }
  }
}

function stopBackgroundSync() {
  if (pollIntervalId) {
    window.clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  if (ordersChannel) {
    ordersChannel.close();
    ordersChannel = null;
  }
}

async function updateOrder(orderId, patch) {
  const res = await patchChefOrder(orderId, patch, state.bearerToken);
  const updated = res.ok && res.data?.order ? res.data.order : null;
  if (!updated) {
    showToast('Unable to update this order. Please refresh and try again.');
    return;
  }
  state.orders = state.orders.map((o) => (o.id === updated.id ? updated : o));
  broadcastOrdersUpdate({ orderId: updated.id });
  updateChromeOnly();
  renderMainSection();
}

async function executeDeleteOrder() {
  const action = state.confirmDeleteAction;
  if (!action) return;

  if (action.type === 'single') {
    const res = await deleteChefOrder(action.order.id, state.bearerToken);
    if (res.ok) {
      state.orders = state.orders.filter((o) => o.id !== action.order.id);
      state.selectedArchiveIds.delete(action.order.id);
      broadcastOrdersUpdate();
    } else {
      showToast('Unable to delete this order. Please try again.');
    }
  } else if (action.type === 'bulk') {
    const res = await bulkDeleteChefOrders({ ids: action.ids }, state.bearerToken);
    if (res.ok) {
      const idSet = new Set(action.ids);
      state.orders = state.orders.filter((o) => !idSet.has(o.id));
      state.selectedArchiveIds.clear();
      broadcastOrdersUpdate();
    } else {
      showToast('Unable to delete the selected orders. Please try again.');
    }
  } else if (action.type === 'clearAll') {
    const res = await bulkDeleteChefOrders({ allArchived: true }, state.bearerToken);
    if (res.ok) {
      state.orders = state.orders.filter((o) => !o.isArchived);
      state.selectedArchiveIds.clear();
      broadcastOrdersUpdate();
    } else {
      showToast('Unable to clear the archive. Please try again.');
    }
  }

  state.confirmDeleteAction = null;
  renderModals();
  updateChromeOnly();
  renderMainSection();
}

async function handleSaveSettings(e) {
  e.preventDefault();
  state.settingsSaving = true;
  renderMainSection();
  try {
    const res = await saveChefSettings(
      {
        isOpen: state.formIsOpen,
        openTime: state.formOpenTime,
        closeTime: state.formCloseTime,
        customNote: state.formNote,
        deliveryFee: Number(state.formDeliveryFee || 0),
        heroEyebrow: state.formHeroEyebrow,
        heroTitle: state.formHeroTitle,
        heroSubtitle: state.formHeroSubtitle,
        supportPhone: state.formSupportPhone,
        currency: state.formCurrency,
      },
      state.bearerToken
    );

    if (res.ok && res.data?.settings) {
      const saved = res.data.settings;
      state.settings = { ...state.settings, ...saved };
      state.settingsDirty = false;

      state.formSupportPhone = saved.supportPhone || DEFAULT_SETTINGS.supportPhone;
      state.formCurrency = saved.currency === 'USD' ? 'USD' : 'EUR';
      state.settingsSavedToast = res.data.globalSync
        ? 'Saved and published globally. Changes will appear for storefront visitors worldwide.'
        : 'Saved on this server, but global Firestore sync is unavailable. Check the server Firebase configuration.';

      if (savedToastTimerId) window.clearTimeout(savedToastTimerId);
      savedToastTimerId = window.setTimeout(() => {
        state.settingsSavedToast = '';
        if (state.activeTab === 'settings') renderMainSection();
      }, 4500);
    }
  } finally {
    state.settingsSaving = false;
    updateChromeOnly();
    if (state.activeTab === 'settings') renderMainSection();
  }
}

async function handleResetAnalyticsBaseline() {
  const res = await resetChefAnalyticsBaseline(state.bearerToken);
  if (res.ok && res.data) {
    state.analyticsBaselineAt = res.data.analyticsBaselineAt || new Date().toISOString();
    showToast('Analytics period baseline reset.');
    if (state.activeTab === 'analytics') renderMainSection();
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  state.authError = '';
  state.authSubmitting = true;
  render();
  try {
    const res = await submitChefAuth(state.needsSetup, state.pinInput);
    if (!res.ok) {
      state.authError = res.data?.error || 'Authentication failed.';
      if (res.data?.needsSetup) state.needsSetup = true;
      return;
    }
    state.bearerToken = res.data?.token || '';
    state.authenticated = true;
    state.needsSetup = false;
    state.pinInput = '';
    void unlockAudioContext();
    render();
    startBackgroundSync();
  } catch {
    state.authError = 'Unable to verify PIN right now.';
  } finally {
    state.authSubmitting = false;
    if (!state.authenticated) render();
  }
}

async function handleLogout() {
  await logoutChef(state.bearerToken);
  stopBackgroundSync();
  state.authenticated = false;
  state.bearerToken = '';
  state.knownOrderIds = null;
  render();
}

async function toggleMute() {
  state.muted = !state.muted;
  updateChromeOnly();
  if (!state.muted) {
    await unlockAudioContext();
    await playNewOrderChime();
  }
}

function renderToast() {
  const slot = document.getElementById('chef-toast-slot');
  if (!slot) return;
  clearNode(slot);
  if (!state.toastMessage) return;

  slot.appendChild(
    el('div', { className: 'chef-toast', role: 'status' }, [
      el(
        'span',
        {
          style: {
            color: 'var(--accent-soft)',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.6875rem',
          },
        },
        'Notice'
      ),
      el('span', null, state.toastMessage),
    ])
  );
}

function renderLoginScreen() {
  clearNode(appRoot);

  const logo = el('img', {
    src: BRAND_LOGO_URL,
    alt: 'DR Crest',
    referrerpolicy: 'no-referrer',
    className: 'chef-login-logo',
  });

  const pinInputNode = el('input', {
    id: 'chef-pin-input',
    type: state.showPin ? 'text' : 'password',
    required: true,
    value: state.pinInput,
    placeholder: 'Enter PIN',
    className: 'chef-pin-input',
    onInput: (e) => {
      state.pinInput = e.target.value;
    },
  });

  const toggleBtn = el(
    'button',
    {
      type: 'button',
      'aria-label': state.showPin ? 'Hide PIN' : 'Show PIN',
      className: 'chef-pin-toggle',
      onClick: () => {
        state.showPin = !state.showPin;
        pinInputNode.type = state.showPin ? 'text' : 'password';
        toggleBtn.setAttribute('aria-label', state.showPin ? 'Hide PIN' : 'Show PIN');
        clearNode(toggleBtn);
        toggleBtn.appendChild(createIcon(state.showPin ? 'eyeOff' : 'eye', 'icon-md'));
      },
    },
    createIcon(state.showPin ? 'eyeOff' : 'eye', 'icon-md')
  );

  const form = el(
    'form',
    {
      style: { display: 'flex', flexDirection: 'column', gap: '1rem' },
      onSubmit: handleAuthSubmit,
    },
    [
      state.authError ? el('div', { className: 'alert-rose' }, state.authError) : null,
      el('div', null, [
        el(
          'label',
          { for: 'chef-pin-input', className: 'field-label' },
          state.needsSetup ? 'Create Admin PIN (4+ characters)' : 'Chef Access PIN'
        ),
        el('div', { className: 'chef-pin-wrap' }, [pinInputNode, toggleBtn]),
      ]),
      el(
        'button',
        {
          type: 'submit',
          disabled: state.authSubmitting,
          className: 'gallery-btn-primary',
          style: {
            width: '100%',
            height: '2.75rem',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
          },
        },
        state.authSubmitting
          ? 'Verifying...'
          : state.needsSetup
          ? 'Save PIN & Enter Console'
          : 'Unlock Console'
      ),
    ]
  );

  const card = el('div', { className: 'chef-login-card' }, [
    el('div', { style: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' } }, [
      logo,
      el(
        'span',
        {
          style: {
            fontSize: '0.6875rem',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: 'var(--accent-warm)',
            fontWeight: '600',
          },
        },
        'Private Atelier Console'
      ),
      el(
        'h1',
        {
          className: 'font-luxury-display',
          style: { fontSize: '1.875rem', color: '#ffffff', fontWeight: '500' },
        },
        state.needsSetup ? 'Set Chef Access PIN' : 'Chef Dashboard Login'
      ),
      el(
        'p',
        { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)' } },
        state.needsSetup
          ? 'No CHEF_PIN environment secret is configured yet. Claim your initial admin PIN below.'
          : 'Enter your private Chef PIN to manage orders, receipts, and store availability.'
      ),
    ]),
    form,
    el(
      'div',
      {
        style: {
          paddingTop: '1rem',
          borderTop: '1px solid var(--hairline)',
          textAlign: 'center',
        },
      },
      el(
        'a',
        {
          href: '/',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.75rem',
            color: 'var(--ink-secondary)',
          },
        },
        [createIcon('arrowLeft', 'icon-sm'), el('span', null, 'Back to Storefront')]
      )
    ),
  ]);

  appRoot.appendChild(el('div', { className: 'chef-auth-center' }, card));
}

function getWorkspaceNavItems() {
  const activeOrders = getActiveOrders();
  const archivedOrders = getArchivedOrders();
  return [
    { id: 'active', label: 'Active Orders', icon: 'clipboardList', count: activeOrders.length },
    { id: 'archived', label: 'Archived Orders', icon: 'archive', count: archivedOrders.length },
    { id: 'analytics', label: 'Sales & Profits', icon: 'barChart', count: null },
    { id: 'settings', label: 'Settings & Catalog', icon: 'sliders', count: null },
  ];
}

function selectWorkspaceTab(tabId) {
  state.activeTab = tabId;
  updateChromeOnly();
  renderMainSection();
}

function buildSidebarNode() {
  const isOpen = Boolean(state.settings?.isOpen);
  const navItems = getWorkspaceNavItems();

  return el('aside', { id: 'chef-sidebar', className: 'chef-sidebar' }, [
    el('div', null, [
      el('div', { className: 'chef-sidebar-brand' }, [
        el('img', {
          src: BRAND_LOGO_URL,
          alt: 'DR Crest',
          referrerpolicy: 'no-referrer',
          className: 'chef-brand-logo',
        }),
        el('div', null, [
          el('div', { className: 'chef-sidebar-title' }, 'DR ATELIER'),
          el('div', { className: 'chef-sidebar-status' }, [
            el('span', {
              className: `chef-status-dot ${isOpen ? 'chef-status-dot--open' : 'chef-status-dot--closed'}`,
            }),
            el('span', null, isOpen ? 'Store Open' : 'Store Closed'),
          ]),
        ]),
      ]),
      el(
        'nav',
        { className: 'chef-sidebar-nav', 'aria-label': 'Workspace navigation' },
        navItems.map((item) =>
          el(
            'button',
            {
              type: 'button',
              className: `chef-nav-item ${state.activeTab === item.id ? 'active' : ''}`,
              onClick: () => selectWorkspaceTab(item.id),
            },
            [
              el('span', { className: 'chef-nav-label' }, [
                createIcon(item.icon, 'icon-sm'),
                el('span', null, item.label),
              ]),
              item.count !== null
                ? el('span', { className: 'chef-nav-count tabular-nums' }, String(item.count))
                : null,
            ]
          )
        )
      ),
    ]),

    el('div', { className: 'chef-sidebar-footer' }, [
      el(
        'a',
        { href: '/', className: 'chef-pill-btn', style: { width: '100%', justifyContent: 'center' } },
        [createIcon('arrowLeft', 'icon-sm'), el('span', null, 'Back to Store')]
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'chef-logout-btn',
          style: { width: '100%', justifyContent: 'center' },
          onClick: () => void handleLogout(),
        },
        [createIcon('logOut', 'icon-sm'), el('span', null, 'Logout')]
      ),
    ]),
  ]);
}

function buildTopbarNode() {
  const activeOrders = getActiveOrders();
  const navItems = getWorkspaceNavItems();
  const currentMeta = navItems.find((n) => n.id === state.activeTab) || navItems[0];

  return el('header', { id: 'chef-topbar', className: 'chef-topbar' }, [
    el('div', { className: 'chef-topbar-inner' }, [
      el('div', { className: 'chef-topbar-left' }, [
        el('div', { className: 'chef-mobile-brand' }, [
          el('img', {
            src: BRAND_LOGO_URL,
            alt: 'DR Crest',
            referrerpolicy: 'no-referrer',
            className: 'chef-brand-logo',
          }),
        ]),
        el('div', null, [
          el('h1', { className: 'chef-page-heading' }, currentMeta.label),
          el(
            'div',
            { className: 'tabular-nums', style: { fontSize: '0.75rem', color: 'var(--ink-muted)' } },
            `${state.settings?.isOpen ? 'Store Open' : 'Store Closed'} · ${activeOrders.length} Active Orders`
          ),
        ]),
      ]),

      el('div', { className: 'chef-topbar-actions' }, [
        el(
          'button',
          {
            type: 'button',
            className: `chef-pill-btn ${state.muted ? 'chef-sound-muted' : 'chef-sound-on'}`,
            onClick: () => void toggleMute(),
          },
          [
            createIcon(
              state.muted ? 'volumeX' : 'volume2',
              state.muted ? 'icon-sm' : 'icon-sm text-cyan-accent'
            ),
            el('span', { className: 'hide-xs' }, state.muted ? 'Muted' : 'Sound On'),
          ]
        ),
        el(
          'a',
          { href: '/', className: 'chef-pill-btn chef-mobile-brand' },
          [createIcon('arrowLeft', 'icon-sm'), el('span', { className: 'hide-xs' }, 'Store')]
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'chef-logout-btn chef-mobile-brand',
            onClick: () => void handleLogout(),
          },
          [createIcon('logOut', 'icon-sm')]
        ),
      ]),
    ]),

    el(
      'div',
      { className: 'chef-mobile-tabs no-scrollbar' },
      navItems.map((item) =>
        el(
          'button',
          {
            type: 'button',
            className: `category-pill tabular-nums ${state.activeTab === item.id ? 'active' : ''}`,
            onClick: () => selectWorkspaceTab(item.id),
          },
          item.count !== null ? `${item.label} (${item.count})` : item.label
        )
      )
    ),

  ]);
}

function updateChromeOnly() {
  const existingSidebar = document.getElementById('chef-sidebar');
  if (existingSidebar?.parentNode) {
    existingSidebar.replaceWith(buildSidebarNode());
  }
  const existingTopbar = document.getElementById('chef-topbar');
  if (existingTopbar?.parentNode) {
    existingTopbar.replaceWith(buildTopbarNode());
  }
}

function buildActiveOrdersTab() {
  const activeOrders = getActiveOrders();
  const counts = getStatusCounts(activeOrders);
  const filtered =
    state.statusFilter === 'ALL'
      ? activeOrders
      : activeOrders.filter((o) => o.status === state.statusFilter);

  const filters = [
    { id: 'ALL', label: 'All', count: counts.ALL },
    { id: OrderStatus.PENDING, label: 'Pending', count: counts[OrderStatus.PENDING] },
    { id: OrderStatus.IN_PROGRESS, label: 'In Progress', count: counts[OrderStatus.IN_PROGRESS] },
    { id: OrderStatus.FINISHED, label: 'Finished', count: counts[OrderStatus.FINISHED] },
    { id: OrderStatus.REJECTED, label: 'Rejected', count: counts[OrderStatus.REJECTED] },
  ];

  const filterRow = el(
    'div',
    { className: 'chef-filter-row' },
    filters.map((f) =>
      el(
        'button',
        {
          type: 'button',
          className: `category-pill tabular-nums ${state.statusFilter === f.id ? 'active' : ''}`,
          onClick: () => {
            state.statusFilter = f.id;
            renderMainSection();
          },
        },
        `${f.label} (${f.count})`
      )
    )
  );

  let body;
  if (filtered.length === 0) {
    body = el('div', { className: 'chef-empty-box' }, 'No orders match this status filter.');
  } else {
    body = el(
      'div',
      { className: 'chef-orders-grid' },
      filtered.map((order) => {
        const payMethod = String(order.paymentMethod || '');
        const isCod =
          payMethod.toLowerCase() === 'cash on delivery' ||
          payMethod.toLowerCase() === 'pay on delivery';

        return el('article', { className: 'chef-order-card' }, [
          el('div', { className: 'chef-card-top' }, [
            el('div', null, [
              el('div', { className: 'chef-badge-row' }, [
                el(
                  'span',
                  {
                    className: 'font-luxury-display tabular-nums',
                    style: { fontSize: '1.25rem', fontWeight: '600', color: '#ffffff' },
                  },
                  order.orderCode
                ),
                el('span', { className: statusBadgeClass(order.status) }, order.status),
                order.isPaid ? el('span', { className: 'chef-badge-paid' }, 'Paid') : null,
              ]),
              el(
                'div',
                { style: { fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.25rem' } },
                new Date(order.createdAt).toLocaleString()
              ),
            ]),

            el(
              'button',
              {
                type: 'button',
                className: 'chef-pill-btn',
                onClick: () => handlePrintOrder(order),
              },
              [createIcon('printer', 'icon-sm text-cyan-accent'), el('span', null, 'Print')]
            ),
          ]),

          el('div', { className: 'chef-customer-box' }, [
            el('div', null, [
              el(
                'div',
                { style: { color: 'var(--ink-muted)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em' } },
                'Customer'
              ),
              el('div', { style: { color: '#ffffff', fontWeight: '600', marginTop: '0.15rem' } }, order.customerName),
              el(
                'a',
                {
                  href: `tel:${order.customerPhone}`,
                  className: 'tabular-nums text-cyan-accent',
                  style: { display: 'inline-block', marginTop: '0.15rem' },
                },
                order.customerPhone
              ),
            ]),
            el('div', null, [
              el(
                'div',
                { style: { color: 'var(--ink-muted)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em' } },
                'Address'
              ),
              el('div', { style: { color: 'var(--ink)', marginTop: '0.15rem' } }, order.deliveryAddress),
              order.deliveryNotes
                ? el(
                    'div',
                    { style: { color: '#fde68a', marginTop: '0.25rem' } },
                    `Note: ${order.deliveryNotes}`
                  )
                : null,
            ]),
          ]),

          order.status === OrderStatus.REJECTED && order.rejectionReason
            ? el('div', { className: 'chef-reject-note' }, [
                el('strong', null, 'Rejection Reason: '),
                order.rejectionReason,
              ])
            : null,

          el(
            'div',
            { className: 'chef-items-list' },
            (order.items || []).map((item) =>
              el('div', { className: 'chef-item-row' }, [
                el('span', { style: { color: 'var(--ink)' } }, [
                  el('strong', { className: 'tabular-nums text-cyan-accent' }, `${item.quantity}×`),
                  ` ${item.name}`,
                ]),
                el(
                  'span',
                  { className: 'tabular-nums', style: { color: '#ffffff', fontWeight: '500' } },
                  `${formatChefPrice(item.lineTotal)} ${getChefCurrencyCode()}`
                ),
              ])
            )
          ),

          el(
            'div',
            {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                fontSize: '0.75rem',
              },
            },
            [
              el('div', null, [
                el('div', { style: { color: '#ffffff', fontWeight: '500' } }, payMethod),
                !isCod && order.senderWalletPhone
                  ? el('div', { className: 'tabular-nums', style: { color: 'var(--ink-secondary)' } }, `Wallet: ${order.senderWalletPhone}`)
                  : null,
              ]),

              el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } }, [
                isCod
                  ? el('span', { className: 'chef-badge-cod' }, 'COD')
                  : order.receiptImageDataUrl
                  ? el(
                      'button',
                      {
                        type: 'button',
                        className: 'chef-badge-receipt',
                        onClick: () => {
                          state.receiptOrder = order;
                          renderModals();
                        },
                      },
                      [createIcon('fileImage', 'icon-sm'), el('span', null, 'Inspect Receipt')]
                    )
                  : el('span', { className: 'chef-badge-missing' }, 'Missing Receipt'),
              ]),
            ]
          ),

          el('div', { className: 'chef-order-footer' }, [
            el('div', { style: { fontSize: '0.75rem', color: 'var(--ink-secondary)' } }, [
              'Delivery: ',
              el('span', { className: 'tabular-nums', style: { color: '#ffffff' } }, formatChefPrice(order.deliveryFee)),
              ' · Total: ',
              el(
                'span',
                {
                  className: 'tabular-nums text-cyan-accent',
                  style: { fontSize: '0.9375rem', fontWeight: '700' },
                },
                `${formatChefPrice(order.grandTotal)} ${getChefCurrencyCode()}`
              ),
            ]),

            el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' } }, [
              order.status === OrderStatus.PENDING
                ? [
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'gallery-btn-primary',
                        style: { height: '2.125rem', padding: '0 0.875rem', fontSize: '0.75rem' },
                        onClick: () => void updateOrder(order.id, { status: OrderStatus.IN_PROGRESS }),
                      },
                      'Start Preparing'
                    ),
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'btn-reject-order',
                        onClick: () => {
                          state.rejectTarget = order;
                          state.rejectReason = '';
                          renderModals();
                        },
                      },
                      'Reject'
                    ),
                  ]
                : null,

              order.status === OrderStatus.IN_PROGRESS
                ? [
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'btn-finish-order',
                        onClick: () => void updateOrder(order.id, { status: OrderStatus.FINISHED }),
                      },
                      [createIcon('checkCircle2', 'icon-sm'), el('span', null, 'Confirm Finished & Delivered')]
                    ),
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'btn-reject-order',
                        onClick: () => {
                          state.rejectTarget = order;
                          state.rejectReason = '';
                          renderModals();
                        },
                      },
                      'Reject'
                    ),
                  ]
                : null,

              order.status === OrderStatus.FINISHED || order.status === OrderStatus.REJECTED
                ? el(
                    'button',
                    {
                      type: 'button',
                      className: 'chef-pill-btn',
                      onClick: () => void updateOrder(order.id, { isArchived: true }),
                    },
                    [createIcon('archive', 'icon-sm text-cyan-accent'), el('span', null, 'Archive Order')]
                  )
                : null,
            ]),
          ]),
        ]);
      })
    );
  }

  return el('div', { className: 'chef-tab-stack' }, [filterRow, body]);
}

function buildArchivedOrdersTab() {
  const archivedOrders = getArchivedOrders();
  const validIds = new Set(archivedOrders.map((o) => o.id));
  for (const id of Array.from(state.selectedArchiveIds)) {
    if (!validIds.has(id)) state.selectedArchiveIds.delete(id);
  }

  const toolbar = el('div', { className: 'chef-toolbar-row' }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } }, [
      state.selectedArchiveIds.size > 0
        ? el(
            'button',
            {
              type: 'button',
              className: 'chef-logout-btn',
              onClick: () => {
                state.confirmDeleteAction = {
                  type: 'bulk',
                  ids: Array.from(state.selectedArchiveIds),
                };
                renderModals();
              },
            },
            [createIcon('trash2', 'icon-sm'), el('span', null, `Delete Selected (${state.selectedArchiveIds.size})`)]
          )
        : null,
    ]),

    archivedOrders.length > 0
      ? el(
          'button',
          {
            type: 'button',
            className: 'chef-logout-btn',
            onClick: () => {
              state.confirmDeleteAction = { type: 'clearAll' };
              renderModals();
            },
          },
          [createIcon('trash2', 'icon-sm'), el('span', null, 'Clear All Archive')]
        )
      : null,
  ]);

  const selectAllCheckbox = el('input', {
    type: 'checkbox',
    'aria-label': 'Select all archived orders',
    checked: archivedOrders.length > 0 && state.selectedArchiveIds.size === archivedOrders.length,
    onChange: (e) => {
      if (e.target.checked) {
        state.selectedArchiveIds = new Set(archivedOrders.map((o) => o.id));
      } else {
        state.selectedArchiveIds = new Set();
      }
      renderMainSection();
    },
  });

  const rows =
    archivedOrders.length === 0
      ? [
          el('tr', null, [
            el(
              'td',
              { colSpan: 8, style: { padding: '2.5rem', textAlign: 'center', color: 'var(--ink-secondary)' } },
              'No archived orders yet.'
            ),
          ]),
        ]
      : archivedOrders.map((order) =>
          el('tr', null, [
            el('td', null, [
              el('input', {
                type: 'checkbox',
                'aria-label': `Select ${order.orderCode}`,
                checked: state.selectedArchiveIds.has(order.id),
                onChange: (e) => {
                  if (e.target.checked) state.selectedArchiveIds.add(order.id);
                  else state.selectedArchiveIds.delete(order.id);
                  renderMainSection();
                },
              }),
            ]),
            el('td', { className: 'font-luxury-display tabular-nums', style: { color: '#ffffff', fontWeight: '600' } }, order.orderCode),
            el('td', null, [
              el('div', { style: { color: '#ffffff' } }, order.customerName),
              el('div', { className: 'tabular-nums', style: { color: 'var(--ink-muted)', fontSize: '0.75rem' } }, order.customerPhone),
            ]),
            el('td', null, el('span', { className: statusBadgeClass(order.status) }, order.status)),
            el('td', null, [
              el('div', null, order.paymentMethod),
              order.senderWalletPhone
                ? el('div', { className: 'tabular-nums', style: { color: 'var(--ink-muted)', fontSize: '0.75rem' } }, order.senderWalletPhone)
                : null,
            ]),
            el(
              'td',
              { className: 'tabular-nums text-cyan-accent', style: { fontWeight: '600' } },
              `${formatChefPrice(order.grandTotal)} ${getChefCurrencyCode()}`
            ),
            el('td', { style: { color: 'var(--ink-secondary)' } }, new Date(order.createdAt).toLocaleDateString()),
            el('td', { style: { textAlign: 'right' } }, [
              el('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem' } }, [
                order.receiptImageDataUrl
                  ? el(
                      'button',
                      {
                        type: 'button',
                        title: 'Inspect Receipt',
                        className: 'chef-icon-btn chef-icon-btn--cyan',
                        onClick: () => {
                          state.receiptOrder = order;
                          renderModals();
                        },
                      },
                      createIcon('fileImage', 'icon-sm')
                    )
                  : null,
                el(
                  'button',
                  {
                    type: 'button',
                    title: 'Print Receipt',
                    className: 'chef-icon-btn',
                    onClick: () => handlePrintOrder(order),
                  },
                  createIcon('printer', 'icon-sm')
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    title: 'Delete Permanently',
                    className: 'chef-icon-btn chef-icon-btn--danger',
                    onClick: () => {
                      state.confirmDeleteAction = { type: 'single', order };
                      renderModals();
                    },
                  },
                  createIcon('trash2', 'icon-sm')
                ),
              ]),
            ]),
          ])
        );

  const tableCard = el('div', { className: 'chef-table-wrap' }, [
    el('table', { className: 'chef-table' }, [
      el('thead', null, [
        el('tr', null, [
          el('th', { style: { width: '2.5rem' } }, selectAllCheckbox),
          el('th', null, 'Order Code'),
          el('th', null, 'Customer'),
          el('th', null, 'Status'),
          el('th', null, 'Payment / Wallet'),
          el('th', null, 'Total'),
          el('th', null, 'Date'),
          el('th', { style: { textAlign: 'right' } }, 'Actions'),
        ]),
      ]),
      el('tbody', null, rows),
    ]),
  ]);

  return el('div', { className: 'chef-tab-stack' }, [toolbar, tableCard]);
}

function buildAnalyticsTab() {
  const analyticsData = computeAnalyticsData();

  const periods = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
  ];

  const topBar = el('div', { className: 'chef-toolbar-row' }, [
    el(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.375rem' } },
      periods.map((p) =>
        el(
          'button',
          {
            type: 'button',
            className: `category-pill ${state.period === p.id ? 'active' : ''}`,
            onClick: () => {
              state.period = p.id;
              renderMainSection();
            },
          },
          p.label
        )
      )
    ),

    el(
      'button',
      {
        type: 'button',
        className: 'chef-pill-btn',
        onClick: () => void handleResetAnalyticsBaseline(),
      },
      [createIcon('rotateCcw', 'icon-sm text-cyan-accent'), el('span', null, 'Reset Analytics Baseline')]
    ),
  ]);

  const kpis = [
    { label: 'Total Sales Revenue', value: formatChefPrice(analyticsData.totalRevenue), color: '#ffffff' },
    { label: 'Total Net Profit', value: formatChefPrice(analyticsData.totalNetProfit), color: 'var(--emerald)' },
    { label: 'Profit Margin', value: `${analyticsData.marginPct.toFixed(1)}%`, color: 'var(--accent-soft)' },
    { label: 'Completed Orders', value: String(analyticsData.completedCount), color: '#ffffff' },
    { label: 'Total Items Sold', value: String(analyticsData.totalItemsSold), color: '#ffffff' },
  ];

  const kpiGrid = el(
    'div',
    { className: 'chef-kpi-grid' },
    kpis.map((k) =>
      el('div', { className: 'chef-kpi-card' }, [
        el(
          'div',
          {
            style: {
              fontSize: '0.6875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--ink-muted)',
            },
          },
          k.label
        ),
        el(
          'div',
          {
            className: 'font-luxury-display tabular-nums',
            style: { marginTop: '0.5rem', fontSize: '1.75rem', fontWeight: '600', color: k.color, lineHeight: '1.1' },
          },
          k.value
        ),
      ])
    )
  );

  const subTabs = el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' } }, [
    el(
      'button',
      {
        type: 'button',
        className: `category-pill ${state.analyticsSubTab === 'orders' ? 'active' : ''}`,
        onClick: () => {
          state.analyticsSubTab = 'orders';
          renderMainSection();
        },
      },
      'Completed Orders Table'
    ),
    el(
      'button',
      {
        type: 'button',
        className: `category-pill ${state.analyticsSubTab === 'products' ? 'active' : ''}`,
        onClick: () => {
          state.analyticsSubTab = 'products';
          renderMainSection();
        },
      },
      'Sold Products Log Table'
    ),
  ]);

  let tableCard;
  if (state.analyticsSubTab === 'orders') {
    const orderRows =
      analyticsData.finishedOrders.length === 0
        ? [
            el('tr', null, [
              el(
                'td',
                { colSpan: 7, style: { padding: '2.5rem', textAlign: 'center', color: 'var(--ink-secondary)' } },
                'No completed orders in this period.'
              ),
            ]),
          ]
        : analyticsData.finishedOrders.map((o) =>
            el('tr', null, [
              el('td', { className: 'font-luxury-display tabular-nums', style: { color: '#ffffff', fontWeight: '600' } }, o.orderCode),
              el('td', null, [
                el('div', { style: { color: '#ffffff' } }, o.customerName),
                el('div', { className: 'tabular-nums', style: { color: 'var(--ink-muted)', fontSize: '0.75rem' } }, o.customerPhone),
              ]),
              el(
                'td',
                { style: { color: 'var(--ink)' } },
                (o.items || []).map((i) => `${i.quantity}× ${i.name}`).join(', ')
              ),
              el('td', null, [
                el('div', null, o.paymentMethod),
                o.senderWalletPhone
                  ? el('div', { className: 'tabular-nums', style: { color: 'var(--ink-muted)', fontSize: '0.75rem' } }, o.senderWalletPhone)
                  : null,
              ]),
              el(
                'td',
                { className: 'tabular-nums text-cyan-accent', style: { fontWeight: '600' } },
                `${formatChefPrice(o.grandTotal)} ${getChefCurrencyCode()}`
              ),
              el(
                'td',
                { style: { color: 'var(--ink-secondary)' } },
                new Date(o.completedAt || o.updatedAt).toLocaleString()
              ),
              el('td', { style: { textAlign: 'right' } }, [
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'chef-pill-btn',
                    onClick: () => handlePrintOrder(o),
                  },
                  [createIcon('printer', 'icon-sm'), el('span', null, 'Print')]
                ),
              ]),
            ])
          );

    tableCard = el('div', { className: 'chef-table-wrap' }, [
      el('table', { className: 'chef-table' }, [
        el('thead', null, [
          el('tr', null, [
            el('th', null, 'Order Code'),
            el('th', null, 'Customer & Phone'),
            el('th', null, 'Sold Items'),
            el('th', null, 'Payment / Wallet'),
            el('th', null, 'Total'),
            el('th', null, 'Completed At'),
            el('th', { style: { textAlign: 'right' } }, 'Receipt'),
          ]),
        ]),
        el('tbody', null, orderRows),
      ]),
    ]);
  } else {
    const productRows =
      analyticsData.soldRows.length === 0
        ? [
            el('tr', null, [
              el(
                'td',
                { colSpan: 8, style: { padding: '2.5rem', textAlign: 'center', color: 'var(--ink-secondary)' } },
                'No sold products logged in this period.'
              ),
            ]),
          ]
        : analyticsData.soldRows.map((r) =>
            el('tr', null, [
              el('td', { style: { color: '#ffffff', fontWeight: '500' } }, r.productName),
              el('td', { style: { color: 'var(--ink-secondary)' } }, r.category),
              el('td', { className: 'tabular-nums' }, String(r.quantity)),
              el('td', { className: 'tabular-nums' }, formatChefPrice(r.unitPrice)),
              el('td', { className: 'tabular-nums', style: { color: '#ffffff' } }, formatChefPrice(r.lineTotal)),
              el(
                'td',
                { className: 'tabular-nums text-emerald-accent' },
                `${formatChefPrice(r.unitProfit)} / ${formatChefPrice(r.totalProfit)}`
              ),
              el('td', { className: 'tabular-nums text-cyan-accent' }, r.orderCode),
              el('td', { style: { color: 'var(--ink-secondary)' } }, new Date(r.soldAt).toLocaleString()),
            ])
          );

    const totalLineSum = analyticsData.soldRows.reduce((s, r) => s + r.lineTotal, 0);

    const tfoot =
      analyticsData.soldRows.length > 0
        ? el('tfoot', null, [
            el('tr', null, [
              el('td', { colSpan: 2, style: { color: '#ffffff' } }, 'Totals'),
              el('td', { className: 'tabular-nums', style: { color: '#ffffff' } }, String(analyticsData.totalItemsSold)),
              el('td', null),
              el('td', { className: 'tabular-nums text-cyan-accent' }, `${formatChefPrice(totalLineSum)} ${getChefCurrencyCode()}`),
              el(
                'td',
                { colSpan: 3, className: 'tabular-nums text-emerald-accent' },
                `Net Profit: ${formatChefPrice(analyticsData.totalNetProfit)} ${getChefCurrencyCode()}`
              ),
            ]),
          ])
        : null;

    tableCard = el('div', { className: 'chef-table-wrap' }, [
      el('table', { className: 'chef-table' }, [
        el('thead', null, [
          el('tr', null, [
            el('th', null, 'Product Name'),
            el('th', null, 'Category'),
            el('th', null, 'Qty'),
            el('th', null, 'Unit Price'),
            el('th', null, 'Line Total'),
            el('th', null, 'Unit / Total Profit'),
            el('th', null, 'Order'),
            el('th', null, 'Sale Date'),
          ]),
        ]),
        el('tbody', null, productRows),
        tfoot,
      ]),
    ]);
  }

  return el('div', { className: 'chef-tab-stack' }, [topBar, kpiGrid, subTabs, tableCard]);
}

function buildSettingsTab() {
  const toggleBtn = el(
    'button',
    {
      type: 'button',
      className: `btn-store-toggle ${state.formIsOpen ? 'open' : 'closed'}`,
      onClick: () => {
        state.formIsOpen = !state.formIsOpen;
        state.settingsDirty = true;
        toggleBtn.className = `btn-store-toggle ${state.formIsOpen ? 'open' : 'closed'}`;
        toggleBtn.textContent = state.formIsOpen
          ? 'Store Open · Click to Close'
          : 'Store Closed · Click to Open';
      },
    },
    state.formIsOpen ? 'Store Open · Click to Close' : 'Store Closed · Click to Open'
  );

  const form = el(
    'form',
    {
      className: 'chef-settings-form',
      onSubmit: handleSaveSettings,
    },
    [
      el('div', { className: 'chef-settings-head' }, [
        el('div', null, [
          el(
            'h2',
            { className: 'font-luxury-display', style: { fontSize: '1.375rem', color: '#ffffff', fontWeight: '500' } },
            'Store Control'
          ),
          el(
            'p',
            { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)', marginTop: '0.25rem' } },
            'Changes are saved securely on the server and published through Firestore for every visitor.'
          ),
        ]),
        toggleBtn,
      ]),

      state.settingsSavedToast
        ? el('div', { className: 'chef-saved-toast' }, state.settingsSavedToast)
        : null,

      el('div', { className: 'chef-form-grid-3' }, [
        el('div', null, [
          el('label', { for: 'setting-currency', className: 'field-label' }, 'Storefront Currency'),
          el('select', {
            id: 'setting-currency',
            className: 'dark-input',
            value: state.formCurrency,
            onChange: (e) => {
              state.formCurrency = e.target.value === 'EUR' ? 'EUR' : 'USD';
              state.settingsDirty = true;
            },
          }, [
            el('option', { value: 'USD' }, 'USD — US Dollar'),
            el('option', { value: 'EUR' }, 'EUR — Euro'),
          ]),
          el('p', { style: { fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.35rem' } }, 'Google Sheets product prices are maintained in EUR. Choose EUR or USD for customer-facing display; USD uses the latest EUR/USD exchange rate.'),
        ]),
        el('div', null, [
          el('label', { for: 'setting-open-time', className: 'field-label' }, 'Opening Time'),
          el('input', {
            id: 'setting-open-time',
            type: 'text',
            value: state.formOpenTime,
            className: 'dark-input',
            onInput: (e) => {
              state.formOpenTime = e.target.value;
              state.settingsDirty = true;
            },
          }),
        ]),
        el('div', null, [
          el('label', { for: 'setting-close-time', className: 'field-label' }, 'Closing Time'),
          el('input', {
            id: 'setting-close-time',
            type: 'text',
            value: state.formCloseTime,
            className: 'dark-input',
            onInput: (e) => {
              state.formCloseTime = e.target.value;
              state.settingsDirty = true;
            },
          }),
        ]),
        el('div', null, [
          el('label', { for: 'setting-delivery-fee', className: 'field-label' }, 'Home Delivery Fee (base EUR)'),
          el('input', {
            id: 'setting-delivery-fee',
            type: 'number',
            min: '0',
            step: '0.5',
            value: state.formDeliveryFee,
            className: 'dark-input tabular-nums',
            onInput: (e) => {
              state.formDeliveryFee = e.target.value;
              state.settingsDirty = true;
            },
          }),
        ]),
      ]),

      el('div', null, [
        el('label', { for: 'setting-support-phone', className: 'field-label' }, 'Customer Support Phone'),
        el('input', {
          id: 'setting-support-phone',
          type: 'tel',
          maxlength: '32',
          value: state.formSupportPhone,
          placeholder: 'e.g. 0 12 74211223',
          className: 'dark-input',
          onInput: (e) => {
            state.formSupportPhone = e.target.value;
            state.settingsDirty = true;
          },
        }),
        el('p', { style: { fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.35rem' } }, 'Used for storefront contact details, copy buttons, and WhatsApp links.'),
      ]),

      el('div', null, [
        el(
          'label',
          { for: 'setting-custom-note', className: 'field-label' },
          'Customer Announcement / Closed-Store Note'
        ),
        el('textarea', {
          id: 'setting-custom-note',
          rows: '2',
          value: state.formNote,
          className: 'dark-textarea',
          onInput: (e) => {
            state.formNote = e.target.value;
            state.settingsDirty = true;
          },
        }),
      ]),

      el('div', { className: 'chef-hero-editor-section' }, [
        el('div', null, [
          el(
            'h3',
            { className: 'font-luxury-display', style: { fontSize: '1.125rem', color: '#ffffff', fontWeight: '500' } },
            'Hero Section Text'
          ),
          el(
            'p',
            { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)', marginTop: '0.15rem' } },
            'Customize the headline, eyebrow code, and subtitle shown over the main hero showcase.'
          ),
        ]),

        el('div', { className: 'chef-form-grid-2' }, [
          el('div', null, [
            el('label', { for: 'setting-hero-eyebrow', className: 'field-label' }, 'Hero Eyebrow / Code'),
            el('input', {
              id: 'setting-hero-eyebrow',
              type: 'text',
              maxlength: '120',
              value: state.formHeroEyebrow,
              placeholder: 'e.g. DR-4802-OCN',
              className: 'dark-input',
              onInput: (e) => {
                state.formHeroEyebrow = e.target.value;
                state.settingsDirty = true;
              },
            }),
          ]),
          el('div', null, [
            el('label', { for: 'setting-hero-subtitle', className: 'field-label' }, 'Hero Subtitle'),
            el('input', {
              id: 'setting-hero-subtitle',
              type: 'text',
              maxlength: '300',
              value: state.formHeroSubtitle,
              placeholder: 'e.g. DR - Premium Resin Products',
              className: 'dark-input',
              onInput: (e) => {
                state.formHeroSubtitle = e.target.value;
                state.settingsDirty = true;
              },
            }),
          ]),
        ]),

        el('div', null, [
          el('label', { for: 'setting-hero-title', className: 'field-label' }, 'Hero Main Headline *'),
          el('input', {
            id: 'setting-hero-title',
            type: 'text',
            required: true,
            maxlength: '200',
            value: state.formHeroTitle,
            placeholder: 'e.g. NATURAL WALNUT & DEEP OCEAN EPOXY RESIN',
            className: 'dark-input',
            onInput: (e) => {
              state.formHeroTitle = e.target.value;
              state.settingsDirty = true;
            },
          }),
        ]),
      ]),

      el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, [
        el(
          'button',
          {
            type: 'submit',
            disabled: state.settingsSaving,
            className: 'gallery-btn-primary',
            style: {
              height: '2.625rem',
              padding: '0 1.5rem',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            },
          },
          state.settingsSaving ? 'Saving...' : 'Save Store Settings'
        ),
      ]),
    ]
  );

  const catalogPreview = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '1rem' } }, [
    el('div', { className: 'chef-toolbar-row' }, [
      el('div', null, [
        el(
          'h3',
          { className: 'font-luxury-display', style: { fontSize: '1.375rem', color: '#ffffff', fontWeight: '500' } },
          `Synced Catalog Preview (${state.products.length})`
        ),
        el(
          'p',
          { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)' } },
          'Live Google Sheets synchronization across all discovered category tabs.'
        ),
      ]),
      el(
        'button',
        {
          type: 'button',
          disabled: state.catalogRefreshing,
          className: 'gallery-btn-primary',
          style: {
            height: '2.375rem',
            padding: '0 1rem',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          },
          onClick: () => void refreshChefProducts(true),
        },
        [
          createIcon('refreshCw', `icon-sm ${state.catalogRefreshing ? 'animate-spin' : ''}`),
          el('span', null, 'Refresh from Google Sheets'),
        ]
      ),
    ]),

    el('div', { className: 'chef-table-wrap' }, [
      el('table', { className: 'chef-table' }, [
        el('thead', null, [
          el('tr', null, [
            el('th', null, 'Piece'),
            el('th', null, 'Category'),
            el('th', null, 'Price'),
            el('th', null, 'Description'),
          ]),
        ]),
        el(
          'tbody',
          null,
          state.products.map((p) => {
            const imgSrc = sanitizeImageUrl(p.primaryImage) || BRAND_LOGO_URL;
            return el('tr', null, [
              el('td', null, [
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' } }, [
                  el('img', {
                    src: imgSrc,
                    alt: p.name,
                    referrerpolicy: 'no-referrer',
                    className: 'chef-catalog-thumb',
                  }),
                  el('span', { style: { color: '#ffffff', fontWeight: '500' } }, p.name),
                ]),
              ]),
              el('td', { style: { color: 'var(--accent-warm)', fontWeight: '500' } }, p.category),
              el(
                'td',
                { className: 'tabular-nums', style: { fontWeight: '600', color: '#ffffff' } },
                `${formatChefPrice(p.price)} ${getChefCurrencyCode()}`
              ),
              el(
                'td',
                {
                  style: {
                    color: 'var(--ink-secondary)',
                    maxWidth: '28rem',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: '2',
                    WebkitBoxOrient: 'vertical',
                  },
                },
                p.description || ''
              ),
            ]);
          })
        ),
      ]),
    ]),
  ]);

  return el('div', { className: 'chef-settings-stack' }, [form, catalogPreview]);
}

function renderMainSection() {
  const main = document.getElementById('chef-main');
  if (!main) return;
  clearNode(main);

  if (state.activeTab === 'active') {
    main.appendChild(buildActiveOrdersTab());
  } else if (state.activeTab === 'archived') {
    main.appendChild(buildArchivedOrdersTab());
  } else if (state.activeTab === 'analytics') {
    main.appendChild(buildAnalyticsTab());
  } else {
    main.appendChild(buildSettingsTab());
  }
}

function updateDashboardAfterPoll() {
  updateChromeOnly();
  // Never clobber Settings form inputs while editing
  if (state.activeTab === 'settings') {
    return;
  }
  renderMainSection();
}

function renderModals() {
  const modalRoot = document.getElementById('chef-modals-root');
  if (!modalRoot) return;
  clearNode(modalRoot);

  // 1. Receipt Inspection Modal
  if (state.receiptOrder) {
    const order = state.receiptOrder;
    const safeReceipt = sanitizeImageUrl(order.receiptImageDataUrl);
    modalRoot.appendChild(
      el(
        'div',
        {
          className: 'modal-backdrop',
          onClick: () => {
            state.receiptOrder = null;
            renderModals();
          },
        },
        [
          el(
            'div',
            {
              className: 'chef-modal-lg',
              onClick: (e) => e.stopPropagation(),
            },
            [
              el('div', { className: 'chef-modal-header' }, [
                el('div', null, [
                  el(
                    'span',
                    {
                      style: {
                        fontSize: '0.6875rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.16em',
                        color: 'var(--accent-warm)',
                      },
                    },
                    'Payment Verification'
                  ),
                  el(
                    'h3',
                    { className: 'font-luxury-display tabular-nums', style: { fontSize: '1.25rem', color: '#ffffff', fontWeight: '500' } },
                    `${order.orderCode} · Expected ${formatChefPrice(order.grandTotal)} ${getChefCurrencyCode()}`
                  ),
                ]),
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'icon-circle-btn',
                    'aria-label': 'Close receipt modal',
                    onClick: () => {
                      state.receiptOrder = null;
                      renderModals();
                    },
                  },
                  createIcon('x', 'icon-md')
                ),
              ]),

              el('div', { className: 'chef-modal-body' }, [
                el(
                  'div',
                  {
                    style: {
                      fontSize: '0.75rem',
                      color: 'var(--ink-secondary)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    },
                  },
                  [
                    el('span', null, `Method: ${order.paymentMethod}`),
                    el('span', null, `Sender Wallet: ${order.senderWalletPhone || ''}`),
                  ]
                ),
                safeReceipt
                  ? el('img', {
                      src: safeReceipt,
                      alt: `Receipt for ${order.orderCode}`,
                      style: {
                        width: '100%',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--hairline)',
                      },
                    })
                  : null,
              ]),

              el('div', { className: 'chef-modal-footer' }, [
                safeReceipt
                  ? el(
                      'a',
                      {
                        href: safeReceipt,
                        download: `receipt-${order.orderCode}.png`,
                        className: 'gallery-btn-primary',
                        style: {
                          height: '2.25rem',
                          padding: '0 1rem',
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        },
                      },
                      [createIcon('download', 'icon-sm'), el('span', null, 'Download Image')]
                    )
                  : null,
              ]),
            ]
          ),
        ]
      )
    );
  }

  // 2. Reject Order Modal
  if (state.rejectTarget) {
    const target = state.rejectTarget;
    const confirmBtn = el(
      'button',
      {
        type: 'button',
        disabled: !state.rejectReason.trim(),
        className: 'chef-btn-reject-confirm',
        onClick: () => {
          const reason = state.rejectReason.trim();
          if (!reason) return;
          state.rejectTarget = null;
          state.rejectReason = '';
          renderModals();
          void updateOrder(target.id, {
            status: OrderStatus.REJECTED,
            rejectionReason: reason,
          });
        },
      },
      'Confirm Rejection'
    );

    const textarea = el('textarea', {
      rows: '3',
      required: true,
      value: state.rejectReason,
      placeholder: 'e.g., Delivery area unreachable or piece out of stock',
      className: 'dark-textarea',
      onInput: (e) => {
        state.rejectReason = e.target.value;
        confirmBtn.disabled = !state.rejectReason.trim();
      },
    });

    modalRoot.appendChild(
      el(
        'div',
        {
          className: 'modal-backdrop',
          onClick: () => {
            state.rejectTarget = null;
            renderModals();
          },
        },
        [
          el(
            'div',
            {
              className: 'chef-modal-sm',
              onClick: (e) => e.stopPropagation(),
            },
            [
              el('div', { className: 'text-rose-accent', style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } }, [
                createIcon('xCircle', 'icon-lg'),
                el(
                  'h3',
                  { className: 'font-luxury-display', style: { fontSize: '1.25rem', color: '#ffffff', fontWeight: '500' } },
                  `Reject Order ${target.orderCode}`
                ),
              ]),
              el(
                'p',
                { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)' } },
                'Provide a clear reason. The customer will see this exact note in My Orders.'
              ),
              textarea,
              el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' } }, [
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'chef-pill-btn',
                    onClick: () => {
                      state.rejectTarget = null;
                      renderModals();
                    },
                  },
                  'Cancel'
                ),
                confirmBtn,
              ]),
            ]
          ),
        ]
      )
    );
  }

  // 3. Permanent Delete Confirmation Modal
  if (state.confirmDeleteAction) {
    const action = state.confirmDeleteAction;
    const msg =
      action.type === 'single'
        ? `Permanently delete ${action.order.orderCode}? This removes the order from both the Archive and the customer's My Orders history.`
        : action.type === 'bulk'
        ? `Permanently delete ${action.ids.length} selected archived orders?`
        : 'Permanently delete ALL archived orders? This action cannot be undone.';

    modalRoot.appendChild(
      el(
        'div',
        {
          className: 'modal-backdrop',
          onClick: () => {
            state.confirmDeleteAction = null;
            renderModals();
          },
        },
        [
          el(
            'div',
            {
              className: 'chef-modal-sm',
              onClick: (e) => e.stopPropagation(),
            },
            [
              el(
                'h3',
                { className: 'font-luxury-display', style: { fontSize: '1.25rem', color: '#ffffff', fontWeight: '500' } },
                'Confirm Permanent Deletion'
              ),
              el(
                'p',
                { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)', lineHeight: '1.6' } },
                msg
              ),
              el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' } }, [
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'chef-pill-btn',
                    onClick: () => {
                      state.confirmDeleteAction = null;
                      renderModals();
                    },
                  },
                  'Cancel'
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'chef-btn-reject-confirm',
                    onClick: () => void executeDeleteOrder(),
                  },
                  'Delete Permanently'
                ),
              ]),
            ]
          ),
        ]
      )
    );
  }
}

function render() {
  if (state.authChecking) {
    clearNode(appRoot);
    appRoot.appendChild(
      el('div', { className: 'chef-auth-center' }, [
        el('div', { className: 'hero-eyebrow' }, 'Initializing Atelier Console...'),
      ])
    );
    return;
  }

  if (!state.authenticated) {
    renderLoginScreen();
    return;
  }

  clearNode(appRoot);
  appRoot.append(
    el('div', { id: 'chef-toast-slot' }),
    el('div', { className: 'chef-workspace' }, [
      buildSidebarNode(),
      el('div', { className: 'chef-workspace-body' }, [
        buildTopbarNode(),
        el('main', { id: 'chef-main', className: 'chef-main' }),
      ]),
    ]),
    el('div', { id: 'chef-modals-root' })
  );

  renderToast();
  renderMainSection();
  renderModals();
}

async function initChefDashboard() {
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });

  window.addEventListener(
    'pointerdown',
    () => {
      void unlockAudioContext();
    },
    { once: true }
  );

  try {
    const status = await getChefAuthStatus();
    state.authenticated = Boolean(status.authenticated);
    state.needsSetup = Boolean(status.needsSetup);
  } catch {
    // Ignore transient errors
  } finally {
    state.authChecking = false;
  }

  render();
  if (state.authenticated) {
    startBackgroundSync();
  }
}

void initChefDashboard();
