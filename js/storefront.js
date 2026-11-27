import {
  BESPOKE_BANNER_URL,
  BRAND_LOGO_URL,
  DEFAULT_SETTINGS,
  HERO_FALLBACK_URL,
  HERO_SHOWCASE_URL,
  ORDERS_CHANNEL_NAME,
  PaymentMethod,
} from './config.js';
import {
  fetchProducts,
  fetchStoreSettings,
  lookupCustomerOrders,
  submitCustomerOrder,
} from './api.js';
import { createIcon } from './icons.js';
import {
  loadCart,
  loadTrackedCodes,
  saveCart,
  saveTrackedCodes,
} from './store.js';
import {
  broadcastOrdersUpdate,
  clearNode,
  copyToClipboard,
  el,
  formatStorePrice,
  formatWhatsAppUrl,
  sanitizeImageUrl,
} from './utils.js';

function formatStoreMoney(amount) {
  return formatStorePrice(amount, state.settings?.currency || getStoreCurrencyCode(), state.settings?.usdToEurRate || 0.92);
}

function getStoreCurrencyCode() {
  return state.settings?.currency || getStoreCurrencyCode();
}

function getSupportPhoneDisplay() {
  return String(state.settings?.supportPhone || DEFAULT_SETTINGS.supportPhone || '0 12 74211223').trim();
}

function getSupportPhoneDigits() {
  return getSupportPhoneDisplay().replace(/\D/g, '');
}

function getSupportWhatsAppNumber() {
  const digits = getSupportPhoneDigits();
  return digits.startsWith('0') ? `2${digits.slice(1)}` : digits;
}

function readInitialSlug() {
  const params = new URLSearchParams(window.location.search);
  const querySlug = params.get('product');
  if (querySlug) return querySlug.trim();
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path || path === '999chef887' || path === 'index.html') return '';
  return decodeURIComponent(path);
}

const state = {
  products: [],
  categories: [],
  catalogLoading: true,
  catalogRefreshing: false,
  catalogError: '',
  settings: { ...DEFAULT_SETTINGS },
  selectedCategory: 'ALL',
  searchQuery: '',
  cart: loadCart(),
  trackedCodes: loadTrackedCodes(),
  activeProduct: null,
  detailImgIdx: 0,
  detailQty: 1,
  detailCopied: false,
  detailAdded: false,
  pendingSlug: readInitialSlug(),
  drawerOpen: false,
  drawerStep: 'cart',
  checkoutForm: {
    customerName: '',
    customerPhone: '',
    deliveryAddress: '',
    deliveryNotes: '',
  },
  checkoutSubmitting: false,
  checkoutError: '',
  placedOrder: null,
  myOrdersOpen: false,
  myOrders: [],
  myOrdersLoading: false,
  myOrdersLookupInput: '',
  myOrdersPhoneQuery: '',
  highlightedOrderCode: null,
  copiedFooterPhone: false,
};

let myOrdersIntervalId = null;
let myOrdersChannel = null;

const dom = {
  closedAlertBar: document.getElementById('closed-alert-bar'),
  brandResetBtn: document.getElementById('brand-reset-btn'),
  searchInput: document.getElementById('search-input'),
  searchClearBtn: document.getElementById('search-clear-btn'),
  openOrdersBtn: document.getElementById('open-orders-btn'),
  openBagBtn: document.getElementById('open-bag-btn'),
  bagCountBadge: document.getElementById('bag-count-badge'),
  heroBgImg: document.getElementById('hero-bg-img'),
  heroEyebrow: document.getElementById('hero-eyebrow'),
  heroTitle: document.getElementById('hero-title'),
  heroSubtitle: document.getElementById('hero-subtitle'),
  discoverPiecesBtn: document.getElementById('discover-pieces-btn'),
  storyArtisanshipBtn: document.getElementById('story-artisanship-btn'),
  storyMaterialBtn: document.getElementById('story-material-btn'),
  storyArchiveBtn: document.getElementById('story-archive-btn'),
  closedStorePanel: document.getElementById('closed-store-panel'),
  closedStoreNote: document.getElementById('closed-store-note'),
  closedOpenTime: document.getElementById('closed-open-time'),
  closedCloseTime: document.getElementById('closed-close-time'),
  liveCatalogWrapper: document.getElementById('live-catalog-wrapper'),
  categoryPillsRow: document.getElementById('category-pills-row'),
  catalogCountLabel: document.getElementById('catalog-count-label'),
  refreshCatalogBtn: document.getElementById('refresh-catalog-btn'),
  refreshCatalogIcon: document.getElementById('refresh-catalog-icon'),
  catalogGridContainer: document.getElementById('catalog-grid-container'),
  bespokeWhatsappLink: document.getElementById('bespoke-whatsapp-link'),
  footerHours: document.getElementById('footer-hours'),
  footerCopyPhoneBtn: document.getElementById('footer-copy-phone-btn'),
  footerPhoneLink: document.querySelector('.footer-phone-link'),
  footerWhatsappLink: document.getElementById('footer-whatsapp-link'),
  footerDeliveryChip: document.getElementById('footer-delivery-chip'),
  backToTopBtn: document.getElementById('back-to-top-btn'),
  footerCopyright: document.getElementById('footer-copyright'),
  productDetailRoot: document.getElementById('product-detail-root'),
  cartDrawerRoot: document.getElementById('cart-drawer-root'),
  myOrdersRoot: document.getElementById('my-orders-root'),
};

function initStaticChrome() {
  document.getElementById('header-search-icon')?.appendChild(createIcon('search', 'icon-sm'));
  dom.searchClearBtn?.appendChild(createIcon('x', 'icon-sm'));
  document
    .getElementById('header-orders-icon')
    ?.appendChild(createIcon('clipboardList', 'icon-sm text-cyan-accent'));
  document.getElementById('header-bag-icon')?.appendChild(createIcon('shoppingBag', 'icon-sm'));
  document
    .getElementById('discover-pieces-icon')
    ?.appendChild(createIcon('arrowUpRight', 'icon-md'));
  document.getElementById('closed-lock-icon')?.appendChild(createIcon('lock', 'icon-xl'));
  document
    .getElementById('closed-clock-icon')
    ?.appendChild(createIcon('clock', 'icon-sm text-cyan-accent'));
  dom.refreshCatalogIcon?.appendChild(createIcon('refreshCw', 'icon-sm text-cyan-accent'));
  document.getElementById('bespoke-arrow-icon')?.appendChild(createIcon('arrowUpRight', 'icon-md'));
  document.getElementById('footer-wa-icon')?.appendChild(createIcon('messageCircle', 'icon-sm'));
  dom.backToTopBtn?.appendChild(createIcon('arrowUp', 'icon-md'));

  if (dom.heroBgImg) {
    dom.heroBgImg.addEventListener('error', () => {
      if (dom.heroBgImg.getAttribute('src') !== HERO_FALLBACK_URL) {
        dom.heroBgImg.src = HERO_FALLBACK_URL;
      }
    });
    if (dom.heroBgImg.complete && dom.heroBgImg.naturalWidth === 0) {
      dom.heroBgImg.src = HERO_FALLBACK_URL;
    } else if (!dom.heroBgImg.getAttribute('src')) {
      dom.heroBgImg.src = HERO_SHOWCASE_URL;
    }
  }

  if (dom.bespokeWhatsappLink) {
    dom.bespokeWhatsappLink.href = formatWhatsAppUrl(
      getSupportWhatsAppNumber(),
      'Hello DR Atelier, I would like to inquire about a bespoke resin commission.'
    );
  }
  const bespokeBannerImg = document.querySelector('.bespoke-banner-img');
  if (bespokeBannerImg) bespokeBannerImg.src = BESPOKE_BANNER_URL;

  if (dom.footerWhatsappLink) {
    dom.footerWhatsappLink.href = formatWhatsAppUrl(
      getSupportWhatsAppNumber(),
      'Hello DR Customer Service'
    );
  }
  if (dom.footerCopyright) {
    dom.footerCopyright.textContent = `© ${new Date().getFullYear()} DR - PREMIUM RESIN PRODUCTS. ALL RIGHTS RESERVED.`;
  }

  renderFooterPhoneButton();
  renderBagBadge();
}

function renderFooterPhoneButton() {
  if (!dom.footerCopyPhoneBtn) return;
  clearNode(dom.footerCopyPhoneBtn);
  if (state.copiedFooterPhone) {
    dom.footerCopyPhoneBtn.append(
      createIcon('check', 'icon-sm text-emerald-accent'),
      el('span', null, 'Copied')
    );
  } else {
    dom.footerCopyPhoneBtn.append(
      createIcon('copy', 'icon-sm'),
      el('span', null, 'Copy')
    );
  }
}

function renderBagBadge() {
  if (!dom.bagCountBadge) return;
  const total = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (total > 0) {
    dom.bagCountBadge.textContent = String(total);
    dom.bagCountBadge.classList.remove('hidden');
  } else {
    dom.bagCountBadge.classList.add('hidden');
  }
}

function renderSettingsUI() {
  const s = state.settings;

  if (dom.closedAlertBar) {
    if (!s.isOpen) {
      clearNode(dom.closedAlertBar);
      dom.closedAlertBar.append(
        el('span', { className: 'closed-alert-title' }, 'Store Currently Closed'),
        el('span', { className: 'closed-alert-sep' }, '·'),
        el('span', null, `Reopens at ${s.openTime}`)
      );
      if (s.customNote) {
        dom.closedAlertBar.append(
          el('span', { className: 'closed-alert-sep' }, '·'),
          el('span', { className: 'closed-alert-note' }, s.customNote)
        );
      }
      dom.closedAlertBar.classList.remove('hidden');
    } else {
      dom.closedAlertBar.classList.add('hidden');
    }
  }

  if (dom.heroEyebrow) {
    const eyebrow = (s.heroEyebrow || '').trim();
    dom.heroEyebrow.textContent = eyebrow;
    dom.heroEyebrow.classList.toggle('hidden', !eyebrow);
  }
  if (dom.heroTitle) {
    dom.heroTitle.textContent = (s.heroTitle || '').trim() || DEFAULT_SETTINGS.heroTitle;
  }
  if (dom.heroSubtitle) {
    const sub = (s.heroSubtitle || '').trim();
    dom.heroSubtitle.textContent = sub;
    dom.heroSubtitle.classList.toggle('hidden', !sub);
  }

  if (dom.closedStorePanel && dom.liveCatalogWrapper) {
    dom.closedStorePanel.classList.toggle('hidden', Boolean(s.isOpen));
    dom.liveCatalogWrapper.classList.toggle('hidden', !s.isOpen);
  }
  if (dom.closedStoreNote) {
    dom.closedStoreNote.textContent =
      s.customNote || 'Our workshop is currently closed while we prepare commissioned pieces.';
  }
  if (dom.closedOpenTime) dom.closedOpenTime.textContent = s.openTime || '10:00 AM';
  if (dom.closedCloseTime) dom.closedCloseTime.textContent = s.closeTime || '11:00 PM';

  if (dom.footerHours) {
    dom.footerHours.textContent = `Daily ${s.openTime} – ${s.closeTime}`;
  }
  const supportDisplay = getSupportPhoneDisplay();
  const supportDigits = getSupportPhoneDigits();
  if (dom.footerPhoneLink) {
    dom.footerPhoneLink.textContent = supportDisplay;
    dom.footerPhoneLink.href = `tel:${supportDigits}`;
  }
  if (dom.bespokeWhatsappLink) {
    dom.bespokeWhatsappLink.href = formatWhatsAppUrl(getSupportWhatsAppNumber(), 'Hello DR Atelier, I would like to inquire about a bespoke resin commission.');
  }
  if (dom.footerWhatsappLink) {
    dom.footerWhatsappLink.href = formatWhatsAppUrl(getSupportWhatsAppNumber(), 'Hello DR Customer Service');
  }
  if (dom.footerDeliveryChip) {
    dom.footerDeliveryChip.textContent = `Delivery: ${formatStoreMoney(s.deliveryFee)} ${getStoreCurrencyCode()}`;
  }
}

function renderCategories() {
  if (!dom.categoryPillsRow) return;
  clearNode(dom.categoryPillsRow);

  const makeTab = (label, value) =>
    el(
      'button',
      {
        type: 'button',
        className: `category-pill ${state.selectedCategory === value ? 'active' : ''}`,
        onClick: () => {
          state.selectedCategory = value;
          renderCategories();
          renderCatalog();
        },
      },
      label
    );

  dom.categoryPillsRow.appendChild(makeTab('All Products', 'ALL'));
  for (const cat of state.categories) {
    dom.categoryPillsRow.appendChild(makeTab(cat, cat));
  }
}

function getFilteredProducts() {
  const q = state.searchQuery.trim().toLowerCase();
  return state.products.filter((p) => {
    const catMatch = state.selectedCategory === 'ALL' || p.category === state.selectedCategory;
    if (!catMatch) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });
}

function createProductCard(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  let activeIndex = 0;
  const failedUrls = new Set();
  let touchStartX = null;

  const mediaStage = el('div', { className: 'product-media' });
  const dotsWrap = images.length > 1 ? el('div', { className: 'carousel-dots' }) : null;

  const renderMedia = () => {
    clearNode(mediaStage);
    const currentUrl = sanitizeImageUrl(images[activeIndex] || '');
    const isBroken = !currentUrl || failedUrls.has(currentUrl);

    if (!isBroken) {
      const img = el('img', {
        src: currentUrl,
        alt: product.name,
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
        className: 'product-media-img',
      });
      img.addEventListener('error', () => {
        failedUrls.add(currentUrl);
        renderMedia();
      });
      mediaStage.appendChild(img);
    } else {
      mediaStage.appendChild(
        el('div', { className: 'product-media-fallback' }, [
          el('img', { src: BRAND_LOGO_URL, alt: 'DR Resin', referrerpolicy: 'no-referrer' }),
          el('span', null, product.category),
        ])
      );
    }

    if (images.length > 1) {
      const prevBtn = el(
        'button',
        {
          type: 'button',
          className: 'carousel-arrow carousel-arrow--prev',
          'aria-label': 'Previous product image',
          onClick: (e) => {
            e.stopPropagation();
            activeIndex = (activeIndex - 1 + images.length) % images.length;
            renderMedia();
          },
        },
        createIcon('chevronLeft', 'icon-sm')
      );
      const nextBtn = el(
        'button',
        {
          type: 'button',
          className: 'carousel-arrow carousel-arrow--next',
          'aria-label': 'Next product image',
          onClick: (e) => {
            e.stopPropagation();
            activeIndex = (activeIndex + 1) % images.length;
            renderMedia();
          },
        },
        createIcon('chevronRight', 'icon-sm')
      );
      mediaStage.append(prevBtn, nextBtn);

      clearNode(dotsWrap);
      images.forEach((_, idx) => {
        dotsWrap.appendChild(
          el('button', {
            type: 'button',
            className: `carousel-dot ${idx === activeIndex ? 'active' : ''}`,
            'aria-label': `View image ${idx + 1}`,
            onClick: (e) => {
              e.stopPropagation();
              activeIndex = idx;
              renderMedia();
            },
          })
        );
      });
      mediaStage.appendChild(dotsWrap);
    }
  };

  mediaStage.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.touches[0]?.clientX ?? null;
    },
    { passive: true }
  );
  mediaStage.addEventListener(
    'touchend',
    (e) => {
      if (touchStartX === null || images.length <= 1) return;
      const endX = e.changedTouches[0]?.clientX ?? touchStartX;
      const delta = endX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) > 36) {
        activeIndex =
          delta < 0
            ? (activeIndex + 1) % images.length
            : (activeIndex - 1 + images.length) % images.length;
        renderMedia();
      }
    },
    { passive: true }
  );

  renderMedia();

  const addBtn = el('button', { type: 'button', className: 'btn-card-add' });
  const renderAddBtn = (justAdded) => {
    clearNode(addBtn);
    addBtn.classList.toggle('added', justAdded);
    if (justAdded) {
      addBtn.append(createIcon('check', 'icon-xs'), el('span', null, 'Added'));
    } else {
      addBtn.append(createIcon('plus', 'icon-xs'), el('span', null, 'Add'));
    }
  };
  renderAddBtn(false);

  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addToCart(product, 1);
    renderAddBtn(true);
    window.setTimeout(() => renderAddBtn(false), 1400);
  });

  const buyBtn = el(
    'button',
    {
      type: 'button',
      className: 'gallery-btn-primary btn-card-buy',
      onClick: (e) => {
        e.stopPropagation();
        buyNow(product, 1);
      },
    },
    [el('span', null, 'Buy Now'), createIcon('arrowUpRight', 'icon-xs')]
  );

  return el(
    'article',
    {
      className: 'product-card',
      role: 'button',
      tabindex: '0',
      onClick: () => openProductDetail(product),
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openProductDetail(product);
        }
      },
    },
    [
      mediaStage,
      el('div', { className: 'product-card-body' }, [
        el('div', null, [
          el('div', { className: 'product-card-meta' }, [
            el('span', { className: 'product-card-meta-cat' }, product.category),
            el('span', { 'aria-hidden': 'true' }, '·'),
            el('span', null, 'Handcrafted'),
          ]),
          el('h3', { className: 'product-card-title' }, product.name),
          el(
            'p',
            { className: 'product-card-desc' },
            product.description || 'Handcrafted natural walnut wood and deep ocean epoxy resin piece.'
          ),
        ]),
        el('div', { className: 'product-card-footer' }, [
          el('div', { className: 'product-card-price-row' }, [
            el('span', { className: 'product-price-label' }, 'Atelier Price'),
            el('div', { className: 'product-price-value tabular-nums' }, [
              `${formatStoreMoney(product.price)} `,
              el('span', { className: 'product-price-currency' }, getStoreCurrencyCode()),
            ]),
          ]),
          el('div', { className: 'product-actions-row' }, [addBtn, buyBtn]),
        ]),
      ]),
    ]
  );
}

function renderCatalog() {
  if (!dom.catalogGridContainer) return;
  clearNode(dom.catalogGridContainer);

  if (state.catalogLoading) {
    if (dom.catalogCountLabel) dom.catalogCountLabel.textContent = 'Syncing...';
    const grid = el('div', { className: 'products-grid' });
    for (let i = 0; i < 8; i++) {
      grid.appendChild(
        el('div', { className: 'skeleton-card animate-pulse' }, [
          el('div', { className: 'skeleton-media' }),
          el('div', { className: 'skeleton-body' }, [
            el('div', { className: 'skeleton-line skeleton-line--title' }),
            el('div', { className: 'skeleton-line' }),
            el('div', { className: 'skeleton-line skeleton-line--btn' }),
          ]),
        ])
      );
    }
    dom.catalogGridContainer.appendChild(grid);
    return;
  }

  if (state.catalogError) {
    if (dom.catalogCountLabel) dom.catalogCountLabel.textContent = '';
    dom.catalogGridContainer.appendChild(
      el('div', { className: 'gallery-surface empty-state-card' }, [
        el('p', { style: { fontSize: '0.875rem', color: '#fecdd3' } }, state.catalogError),
        el(
          'button',
          {
            type: 'button',
            className: 'gallery-btn-primary',
            style: { padding: '0.625rem 1.25rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em' },
            onClick: () => void loadCatalog(true),
          },
          [createIcon('refreshCw', 'icon-sm'), el('span', null, 'Retry Sync')]
        ),
      ])
    );
    return;
  }

  const filtered = getFilteredProducts();
  if (dom.catalogCountLabel) {
    dom.catalogCountLabel.textContent = `${filtered.length} ${filtered.length === 1 ? 'piece' : 'pieces'}`;
  }

  if (filtered.length === 0) {
    const actions = el('div', { className: 'empty-state-actions' });
    if (state.searchQuery || state.selectedCategory !== 'ALL') {
      actions.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: 'gallery-btn-primary',
            style: { padding: '0.5rem 1.125rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
            onClick: () => {
              state.searchQuery = '';
              state.selectedCategory = 'ALL';
              if (dom.searchInput) dom.searchInput.value = '';
              dom.searchClearBtn?.classList.add('hidden');
              renderCategories();
              renderCatalog();
            },
          },
          'Show All Pieces'
        )
      );
    }
    actions.appendChild(
      el(
        'button',
        {
          type: 'button',
          className: 'gallery-btn-secondary',
          style: { padding: '0.5rem 1.125rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
          onClick: () => void loadCatalog(true),
        },
        [createIcon('refreshCw', 'icon-sm'), el('span', null, 'Refresh Sheet')]
      )
    );

    dom.catalogGridContainer.appendChild(
      el('div', { className: 'gallery-surface empty-state-card' }, [
        el('img', {
          src: BRAND_LOGO_URL,
          alt: 'DR Resin',
          referrerpolicy: 'no-referrer',
          style: { width: '3.25rem', height: '3.25rem', objectFit: 'contain', opacity: '0.7' },
        }),
        el(
          'h3',
          { className: 'font-luxury-display', style: { fontSize: '1.5rem', color: '#ffffff' } },
          state.products.length === 0 ? 'Catalog Currently Empty' : 'No Matching Pieces'
        ),
        el(
          'p',
          { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)', lineHeight: '1.6' } },
          state.products.length === 0
            ? 'No products were found in the synced Google Sheets catalog right now.'
            : 'Try clearing your search filter or selecting another category.'
        ),
        actions,
      ])
    );
    return;
  }

  const grid = el('div', { className: 'products-grid' });
  for (const product of filtered) {
    grid.appendChild(createProductCard(product));
  }
  dom.catalogGridContainer.appendChild(grid);
}

/* Cart Actions */
function addToCart(product, quantity = 1) {
  const existing = state.cart.find((i) => i.productId === product.id);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + quantity);
  } else {
    state.cart.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      category: product.category,
      description: product.description,
      unitPrice: product.price,
      quantity,
      image: product.primaryImage || (product.images && product.images[0]) || '',
    });
  }
  saveCart(state.cart);
  renderBagBadge();
  if (state.drawerOpen) renderCartDrawer();
}

function updateCartQty(productId, qty) {
  state.cart = state.cart.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i));
  saveCart(state.cart);
  renderBagBadge();
  renderCartDrawer();
}

function removeCartItem(productId) {
  state.cart = state.cart.filter((i) => i.productId !== productId);
  saveCart(state.cart);
  renderBagBadge();
  renderCartDrawer();
}

function clearCart() {
  state.cart = [];
  saveCart(state.cart);
  renderBagBadge();
  renderCartDrawer();
}

function buyNow(product, quantity = 1) {
  addToCart(product, quantity);
  if (state.activeProduct) {
    closeProductDetail();
  }
  state.drawerStep = 'checkout';
  state.checkoutError = '';
  state.drawerOpen = true;
  renderCartDrawer();
}

/* Product Detail Modal */
function openProductDetail(product) {
  state.activeProduct = product;
  state.detailImgIdx = 0;
  state.detailQty = 1;
  state.detailCopied = false;
  state.detailAdded = false;

  const targetUrl = `/${product.slug}`;
  if (window.location.pathname !== targetUrl) {
    try {
      window.history.pushState({ productSlug: product.slug }, '', targetUrl);
    } catch {
      // Ignore if restricted
    }
  }
  renderProductDetailModal();
}

function closeProductDetail() {
  state.activeProduct = null;
  if (window.location.pathname !== '/') {
    try {
      window.history.pushState({}, '', '/');
    } catch {
      // Ignore
    }
  }
  renderProductDetailModal();
}

function renderProductDetailModal() {
  if (!dom.productDetailRoot) return;
  clearNode(dom.productDetailRoot);
  const product = state.activeProduct;
  if (!product) return;

  const images = Array.isArray(product.images) ? product.images : [];
  const failedUrls = new Set();
  const shareUrl = `${window.location.origin}/${product.slug}`;

  const stage = el('div', { className: 'detail-stage' });
  const thumbsWrap = images.length > 1 ? el('div', { className: 'detail-thumbs no-scrollbar' }) : null;
  const qtyValEl = el('span', { className: 'qty-step-val tabular-nums' }, String(state.detailQty));
  const lineTotalEl = el('span', {
    className: 'tabular-nums',
    style: {
      marginTop: '0.25rem',
      display: 'block',
      fontSize: '1.375rem',
      fontWeight: '700',
      color: 'var(--accent-soft)',
    },
  });

  const updateLineTotal = () => {
    clearNode(lineTotalEl);
    lineTotalEl.append(
      `${formatStoreMoney(product.price * state.detailQty)} `,
      el('span', { style: { fontSize: '0.75rem', fontWeight: '500', color: 'var(--ink-secondary)' } }, getStoreCurrencyCode())
    );
  };
  updateLineTotal();

  const renderGallery = () => {
    clearNode(stage);
    const activeUrl = sanitizeImageUrl(images[state.detailImgIdx] || '');
    const isBroken = !activeUrl || failedUrls.has(activeUrl);

    if (!isBroken) {
      const img = el('img', {
        src: activeUrl,
        alt: `${product.name} view ${state.detailImgIdx + 1}`,
        referrerpolicy: 'no-referrer',
        className: 'detail-stage-img',
      });
      img.addEventListener('error', () => {
        failedUrls.add(activeUrl);
        renderGallery();
      });
      stage.appendChild(img);
    } else {
      stage.appendChild(
        el(
          'div',
          {
            style: {
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
            },
          },
          [
            el('img', {
              src: BRAND_LOGO_URL,
              alt: 'DR Resin',
              referrerpolicy: 'no-referrer',
              style: { width: '5rem', height: '5rem', objectFit: 'contain', opacity: '0.8', marginBottom: '0.75rem' },
            }),
            el(
              'span',
              {
                style: {
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  color: 'var(--ink-muted)',
                },
              },
              product.category
            ),
          ]
        )
      );
    }

    if (images.length > 1) {
      stage.append(
        el(
          'button',
          {
            type: 'button',
            className: 'detail-arrow',
            style: { left: '0.75rem' },
            'aria-label': 'Previous image',
            onClick: () => {
              state.detailImgIdx = (state.detailImgIdx - 1 + images.length) % images.length;
              renderGallery();
            },
          },
          createIcon('chevronLeft', 'icon-lg')
        ),
        el(
          'button',
          {
            type: 'button',
            className: 'detail-arrow',
            style: { right: '0.75rem' },
            'aria-label': 'Next image',
            onClick: () => {
              state.detailImgIdx = (state.detailImgIdx + 1) % images.length;
              renderGallery();
            },
          },
          createIcon('chevronRight', 'icon-lg')
        )
      );

      clearNode(thumbsWrap);
      images.forEach((url, idx) => {
        const safeThumb = sanitizeImageUrl(url) || BRAND_LOGO_URL;
        thumbsWrap.appendChild(
          el(
            'button',
            {
              type: 'button',
              className: `detail-thumb-btn ${idx === state.detailImgIdx ? 'active' : ''}`,
              onClick: () => {
                state.detailImgIdx = idx;
                renderGallery();
              },
            },
            el('img', { src: safeThumb, alt: `Thumbnail ${idx + 1}`, referrerpolicy: 'no-referrer' })
          )
        );
      });
    }
  };
  renderGallery();

  const copyBtn = el('button', { type: 'button', className: 'share-copy-btn' });
  const renderCopyBtn = () => {
    clearNode(copyBtn);
    if (state.detailCopied) {
      copyBtn.append(createIcon('check', 'icon-sm text-emerald-accent'), el('span', null, 'Copied'));
    } else {
      copyBtn.append(createIcon('copy', 'icon-sm'), el('span', null, 'Copy'));
    }
  };
  renderCopyBtn();
  copyBtn.addEventListener('click', async () => {
    await copyToClipboard(shareUrl);
    state.detailCopied = true;
    renderCopyBtn();
    window.setTimeout(() => {
      state.detailCopied = false;
      renderCopyBtn();
    }, 1800);
  });

  const addBtn = el('button', { type: 'button', className: 'btn-detail-add' });
  const renderAddCartBtn = () => {
    clearNode(addBtn);
    if (state.detailAdded) {
      addBtn.append(createIcon('check', 'icon-md text-emerald-accent'), el('span', null, 'Added to Bag'));
    } else {
      addBtn.append(createIcon('shoppingBag', 'icon-md'), el('span', null, 'Add to Cart'));
    }
  };
  renderAddCartBtn();
  addBtn.addEventListener('click', () => {
    addToCart(product, state.detailQty);
    state.detailAdded = true;
    renderAddCartBtn();
    window.setTimeout(() => {
      state.detailAdded = false;
      renderAddCartBtn();
    }, 1500);
  });

  const galleryCol = el('div', { className: 'detail-gallery-col' }, [stage]);
  if (thumbsWrap) galleryCol.appendChild(thumbsWrap);

  const infoCol = el('div', { className: 'detail-info-col' }, [
    el('div', null, [
      el('div', { className: 'detail-kicker' }, [
        el('span', null, product.category),
        el('span', { 'aria-hidden': 'true' }, '·'),
        el('span', null, 'DR Atelier'),
      ]),
      el('h2', { className: 'detail-title' }, product.name),
      el('div', { className: 'detail-price-row' }, [
        el('span', { className: 'tabular-nums detail-price' }, formatStoreMoney(product.price)),
        el(
          'span',
          { style: { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-muted)' } },
          getStoreCurrencyCode()
        ),
      ]),
      el(
        'p',
        { className: 'detail-desc' },
        product.description || 'Handcrafted from figured natural walnut and museum-grade deep ocean epoxy resin.'
      ),
      el('div', { className: 'detail-share-box' }, [
        el('label', { className: 'field-label-caps' }, 'Shareable Piece Link'),
        el('div', { className: 'share-input-row' }, [
          el('input', {
            type: 'text',
            readOnly: true,
            value: shareUrl,
            'aria-label': 'Shareable product URL',
            className: 'share-input',
          }),
          copyBtn,
        ]),
      ]),
    ]),
    el('div', { className: 'detail-purchase-box' }, [
      el('div', { className: 'qty-line-row' }, [
        el('div', null, [
          el('span', { className: 'field-label-caps', style: { marginBottom: '0' } }, 'Quantity'),
          el('div', { className: 'qty-stepper' }, [
            el(
              'button',
              {
                type: 'button',
                className: 'qty-step-btn',
                'aria-label': 'Decrease quantity',
                onClick: () => {
                  state.detailQty = Math.max(1, state.detailQty - 1);
                  qtyValEl.textContent = String(state.detailQty);
                  updateLineTotal();
                },
              },
              createIcon('minus', 'icon-sm')
            ),
            qtyValEl,
            el(
              'button',
              {
                type: 'button',
                className: 'qty-step-btn',
                'aria-label': 'Increase quantity',
                onClick: () => {
                  state.detailQty = Math.min(99, state.detailQty + 1);
                  qtyValEl.textContent = String(state.detailQty);
                  updateLineTotal();
                },
              },
              createIcon('plus', 'icon-sm')
            ),
          ]),
        ]),
        el('div', { style: { textAlign: 'right' } }, [
          el('span', { className: 'field-label-caps', style: { marginBottom: '0' } }, 'Line Total'),
          lineTotalEl,
        ]),
      ]),
      el('div', { className: 'detail-actions-grid' }, [
        addBtn,
        el(
          'button',
          {
            type: 'button',
            className: 'gallery-btn-primary btn-detail-buy',
            onClick: () => buyNow(product, state.detailQty),
          },
          [el('span', null, 'Buy Now'), createIcon('arrowUpRight', 'icon-md')]
        ),
      ]),
    ]),
  ]);

  const modalCard = el(
    'div',
    {
      className: 'gallery-surface detail-modal-card',
      onClick: (e) => e.stopPropagation(),
    },
    [
      el(
        'button',
        {
          type: 'button',
          className: 'modal-close-float',
          'aria-label': 'Close product details',
          onClick: closeProductDetail,
        },
        createIcon('x', 'icon-lg')
      ),
      el('div', { className: 'detail-grid' }, [galleryCol, infoCol]),
    ]
  );

  dom.productDetailRoot.appendChild(
    el(
      'div',
      {
        className: 'modal-backdrop',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': product.name,
        onClick: closeProductDetail,
      },
      modalCard
    )
  );
}

/* Cart & Checkout Drawer */
function closeDrawer() {
  state.drawerOpen = false;
  renderCartDrawer();
}

function renderCartDrawer() {
  if (!dom.cartDrawerRoot) return;
  clearNode(dom.cartDrawerRoot);
  if (!state.drawerOpen) return;

  const subtotal = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const deliveryFee = Number(state.settings.deliveryFee || 0);
  const grandTotal = subtotal + deliveryFee;

  const headerKicker =
    state.drawerStep === 'cart'
      ? 'Atelier Bag'
      : state.drawerStep === 'checkout'
      ? 'Courier Settlement'
      : 'Order Recorded';

  const headerTitle =
    state.drawerStep === 'cart'
      ? 'Your Selection'
      : state.drawerStep === 'checkout'
      ? 'Delivery & Checkout'
      : 'Order Confirmed';

  const stepsRail = el('div', { className: 'drawer-steps-rail' }, [
    el(
      'div',
      {
        className: `drawer-step-item ${
          state.drawerStep === 'cart' ? 'active' : 'done'
        }`,
      },
      '01 · Bag'
    ),
    el(
      'div',
      {
        className: `drawer-step-item ${
          state.drawerStep === 'checkout'
            ? 'active'
            : state.drawerStep === 'success'
            ? 'done'
            : ''
        }`,
      },
      '02 · Delivery'
    ),
    el(
      'div',
      {
        className: `drawer-step-item ${state.drawerStep === 'success' ? 'active' : ''}`,
      },
      '03 · Confirmed'
    ),
  ]);

  const body = el('div', { className: 'drawer-body' });

  if (!state.settings.isOpen && state.drawerStep !== 'success') {
    body.appendChild(
      el('div', { className: 'alert-amber' }, [
        createIcon('alertCircle', 'icon-md text-amber-accent'),
        el('div', null, [
          el(
            'p',
            { style: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' } },
            'Store Currently Closed'
          ),
          el(
            'p',
            { style: { marginTop: '0.25rem', opacity: '0.9' } },
            `Checkout is temporarily paused until ${state.settings.openTime}. ${state.settings.customNote}`
          ),
        ]),
      ])
    );
  }

  if (state.drawerStep === 'cart') {
    if (state.cart.length === 0) {
      body.appendChild(
        el(
          'div',
          {
            style: {
              padding: '3.5rem 0',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            },
          },
          [
            el('img', {
              src: BRAND_LOGO_URL,
              alt: 'DR Resin',
              referrerpolicy: 'no-referrer',
              style: { width: '3.75rem', height: '3.75rem', objectFit: 'contain', opacity: '0.65' },
            }),
            el('h3', { className: 'font-luxury-display', style: { fontSize: '1.5rem', color: '#ffffff' } }, 'Your Bag is Empty'),
            el(
              'p',
              { style: { fontSize: '0.875rem', color: 'var(--ink-secondary)', maxWidth: '20rem' } },
              'Explore our walnut and deep ocean resin collection to add pieces to your order.'
            ),
            el(
              'button',
              {
                type: 'button',
                className: 'gallery-btn-primary',
                style: {
                  padding: '0.6875rem 1.5rem',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                },
                onClick: closeDrawer,
              },
              'Browse Collection'
            ),
          ]
        )
      );
    } else {
      const totalSelected = state.cart.reduce((s, i) => s + i.quantity, 0);
      body.appendChild(
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
          el(
            'span',
            { style: { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-muted)' } },
            `${totalSelected} ${totalSelected === 1 ? 'Piece' : 'Pieces'} Selected`
          ),
          el(
            'button',
            {
              type: 'button',
              style: {
                fontSize: '0.75rem',
                color: 'var(--rose)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              },
              onClick: clearCart,
            },
            [createIcon('trash2', 'icon-sm'), el('span', null, 'Clear Cart')]
          ),
        ])
      );

      const itemsList = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } });
      for (const item of state.cart) {
        const thumbSrc = sanitizeImageUrl(item.image) || BRAND_LOGO_URL;
        itemsList.appendChild(
          el('div', { className: 'cart-item-card' }, [
            el('div', { className: 'cart-item-thumb' }, [
              el('img', { src: thumbSrc, alt: item.name, referrerpolicy: 'no-referrer' }),
            ]),
            el('div', { style: { flex: '1 1 0%', minWidth: '0' } }, [
              el('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' } }, [
                el('div', { style: { minWidth: '0' } }, [
                  el(
                    'span',
                    { style: { fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent-warm)', fontWeight: '600' } },
                    item.category
                  ),
                  el(
                    'h4',
                    {
                      className: 'font-luxury-display',
                      style: {
                        fontSize: '1rem',
                        fontWeight: '600',
                        color: '#ffffff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      },
                    },
                    item.name
                  ),
                ]),
                el(
                  'button',
                  {
                    type: 'button',
                    'aria-label': `Remove ${item.name}`,
                    style: { color: 'var(--ink-muted)', padding: '0.25rem' },
                    onClick: () => removeCartItem(item.productId),
                  },
                  createIcon('trash2', 'icon-sm')
                ),
              ]),
              el(
                'div',
                { style: { marginTop: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                [
                  el('div', { className: 'qty-stepper-sm' }, [
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'qty-step-btn-sm',
                        'aria-label': 'Decrease item quantity',
                        onClick: () =>
                          item.quantity > 1
                            ? updateCartQty(item.productId, item.quantity - 1)
                            : removeCartItem(item.productId),
                      },
                      createIcon('minus', 'icon-xs')
                    ),
                    el(
                      'span',
                      { className: 'tabular-nums', style: { width: '1.75rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#ffffff' } },
                      String(item.quantity)
                    ),
                    el(
                      'button',
                      {
                        type: 'button',
                        className: 'qty-step-btn-sm',
                        'aria-label': 'Increase item quantity',
                        onClick: () => updateCartQty(item.productId, Math.min(99, item.quantity + 1)),
                      },
                      createIcon('plus', 'icon-xs')
                    ),
                  ]),
                  el('div', { className: 'tabular-nums', style: { fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' } }, [
                    `${formatStoreMoney(item.unitPrice * item.quantity)} `,
                    el('span', { style: { fontSize: '0.625rem', fontWeight: '500', color: 'var(--ink-muted)' } }, getStoreCurrencyCode()),
                  ]),
                ]
              ),
            ]),
          ])
        );
      }
      body.appendChild(itemsList);

      body.appendChild(
        el('div', { className: 'invoice-box' }, [
          el('div', { className: 'invoice-row' }, [
            el('span', null, 'Subtotal'),
            el('span', { className: 'tabular-nums', style: { color: '#ffffff' } }, `${formatStoreMoney(subtotal)} ${getStoreCurrencyCode()}`),
          ]),
          el('div', { className: 'invoice-row' }, [
            el('span', null, 'Home Delivery Fee'),
            el('span', { className: 'tabular-nums', style: { color: '#ffffff' } }, `${formatStoreMoney(deliveryFee)} ${getStoreCurrencyCode()}`),
          ]),
          el('div', { className: 'invoice-total-row' }, [
            el('span', null, 'Estimated Total'),
            el('span', { className: 'tabular-nums', style: { color: 'var(--accent-soft)' } }, `${formatStoreMoney(grandTotal)} ${getStoreCurrencyCode()}`),
          ]),
        ])
      );
    }
  } else if (state.drawerStep === 'checkout') {
    const form = el('form', {
      id: 'checkout-form',
      style: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
      onSubmit: async (e) => {
        e.preventDefault();
        state.checkoutError = '';

        if (!state.settings.isOpen) {
          state.checkoutError = 'Store is currently closed. Checkout is temporarily disabled.';
          renderCartDrawer();
          return;
        }
        const { customerName, customerPhone, deliveryAddress, deliveryNotes } = state.checkoutForm;
        if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
          state.checkoutError = 'Please complete all required delivery details.';
          renderCartDrawer();
          return;
        }

        state.checkoutSubmitting = true;
        renderCartDrawer();

        try {
          const { ok, data } = await submitCustomerOrder({
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            deliveryAddress: deliveryAddress.trim(),
            deliveryNotes: deliveryNotes.trim(),
            paymentMethod: PaymentMethod.COD,
            senderWalletPhone: '',
            receiptImageDataUrl: '',
            items: state.cart.map((item) => ({
              productId: item.productId,
              slug: item.slug,
              quantity: item.quantity,
            })),
          });

          if (!ok) {
            state.checkoutError = data.error || 'Could not place order. Please review your details.';
            return;
          }

          const created = data.order;
          state.placedOrder = created;
          if (!state.trackedCodes.includes(created.orderCode)) {
            state.trackedCodes = [created.orderCode, ...state.trackedCodes];
            saveTrackedCodes(state.trackedCodes);
          }
          state.highlightedOrderCode = created.orderCode;
          state.cart = [];
          saveCart(state.cart);
          renderBagBadge();
          broadcastOrdersUpdate({ orderCode: created.orderCode });
          state.drawerStep = 'success';
        } catch {
          state.checkoutError = 'Network error while submitting your order. Please try again.';
        } finally {
          state.checkoutSubmitting = false;
          renderCartDrawer();
        }
      },
    });

    if (state.checkoutError) {
      form.appendChild(
        el('div', { className: 'alert-rose' }, [
          createIcon('alertCircle', 'icon-md text-rose-accent'),
          el('span', null, state.checkoutError),
        ])
      );
    }

    const nameInput = el('input', {
      type: 'text',
      required: true,
      value: state.checkoutForm.customerName,
      placeholder: 'Full Name',
      className: 'dark-input',
      onInput: (e) => {
        state.checkoutForm.customerName = e.target.value;
      },
    });
    const phoneInput = el('input', {
      type: 'tel',
      required: true,
      value: state.checkoutForm.customerPhone,
      placeholder: '01XXXXXXXXX',
      className: 'dark-input',
      onInput: (e) => {
        state.checkoutForm.customerPhone = e.target.value;
      },
    });
    const addressInput = el('textarea', {
      required: true,
      rows: '2',
      value: state.checkoutForm.deliveryAddress,
      placeholder: 'Street, building, floor, apartment, and nearby landmark',
      className: 'dark-textarea',
      onInput: (e) => {
        state.checkoutForm.deliveryAddress = e.target.value;
      },
    });
    const notesInput = el('input', {
      type: 'text',
      value: state.checkoutForm.deliveryNotes,
      placeholder: 'Preferred delivery window or gate instructions',
      className: 'dark-input',
      onInput: (e) => {
        state.checkoutForm.deliveryNotes = e.target.value;
      },
    });

    form.appendChild(
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.875rem' } }, [
        el(
          'h3',
          {
            style: { fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent-warm)' },
          },
          'Recipient Details'
        ),
        el('div', { className: 'chef-form-grid-2' }, [
          el('div', null, [el('label', { className: 'field-label' }, 'Full Name *'), nameInput]),
          el('div', null, [el('label', { className: 'field-label' }, 'Phone Number *'), phoneInput]),
        ]),
        el('div', null, [el('label', { className: 'field-label' }, 'Detailed Delivery Address *'), addressInput]),
        el('div', null, [el('label', { className: 'field-label' }, 'Delivery Notes (Optional)'), notesInput]),
      ])
    );

    form.appendChild(
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.625rem' } }, [
        el(
          'h3',
          {
            style: { fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent-warm)' },
          },
          'Payment Method'
        ),
        el('div', { className: 'cod-card' }, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' } }, [
            el('div', { className: 'cod-badge' }, 'COD'),
            el('div', null, [
              el('div', { style: { fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' } }, 'Pay on Delivery'),
              el('div', { style: { fontSize: '0.75rem', color: 'var(--ink-secondary)' } }, [
                'Pay ',
                el('span', { className: 'tabular-nums', style: { fontWeight: '600', color: '#ffffff' } }, `${formatStoreMoney(grandTotal)} ${getStoreCurrencyCode()}`),
                ' upon courier delivery (includes ',
                el('span', { className: 'tabular-nums' }, `${formatStoreMoney(deliveryFee)} ${getStoreCurrencyCode()}`),
                ' shipping)',
              ]),
            ]),
          ]),
          createIcon('shieldCheck', 'icon-lg text-cyan-accent'),
        ]),
      ])
    );

    form.appendChild(
      el('div', { className: 'invoice-box' }, [
        el('div', { className: 'invoice-row' }, [
          el('span', null, 'Items Subtotal'),
          el('span', { className: 'tabular-nums', style: { color: '#ffffff' } }, `${formatStoreMoney(subtotal)} ${getStoreCurrencyCode()}`),
        ]),
        el('div', { className: 'invoice-row' }, [
          el('span', null, 'Home Delivery Fee'),
          el('span', { className: 'tabular-nums', style: { color: '#ffffff' } }, `${formatStoreMoney(deliveryFee)} ${getStoreCurrencyCode()}`),
        ]),
        el('div', { className: 'invoice-total-row' }, [
          el('span', null, 'Grand Total'),
          el('span', { className: 'tabular-nums', style: { color: 'var(--accent-soft)' } }, `${formatStoreMoney(grandTotal)} ${getStoreCurrencyCode()}`),
        ]),
      ])
    );

    body.appendChild(form);
  } else if (state.drawerStep === 'success' && state.placedOrder) {
    const order = state.placedOrder;
    let copiedSupport = false;
    const supportCopyBtn = el('button', { type: 'button', className: 'btn-copy-dark' });
    const renderSupportCopy = () => {
      clearNode(supportCopyBtn);
      if (copiedSupport) {
        supportCopyBtn.append(createIcon('check', 'icon-sm text-emerald-accent'), el('span', null, 'Copied'));
      } else {
        supportCopyBtn.append(createIcon('copy', 'icon-sm'), el('span', null, 'Copy'));
      }
    };
    renderSupportCopy();
    supportCopyBtn.addEventListener('click', async () => {
      await copyToClipboard(getSupportPhoneDigits());
      copiedSupport = true;
      renderSupportCopy();
      window.setTimeout(() => {
        copiedSupport = false;
        renderSupportCopy();
      }, 1800);
    });

    body.appendChild(
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' } }, [
        el('div', { style: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' } }, [
          el(
            'div',
            {
              style: {
                width: '3rem',
                height: '3rem',
                borderRadius: '9999px',
                backgroundColor: 'var(--emerald-bg)',
                border: '1px solid var(--emerald-border)',
                color: 'var(--emerald)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
            },
            createIcon('check', 'icon-xl')
          ),
          el(
            'span',
            { style: { fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent-warm)', fontWeight: '600' } },
            'Commission Recorded'
          ),
          el('h3', { className: 'font-luxury-display tabular-nums', style: { fontSize: '2.25rem', color: '#ffffff', lineHeight: '1' } }, order.orderCode),
          el(
            'p',
            { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)' } },
            `Thank you, ${order.customerName}. Your order has been transmitted to the atelier.`
          ),
        ]),
        el('div', { className: 'invoice-box' }, [
          el('div', { className: 'invoice-row' }, [
            el('span', null, 'Payment Method'),
            el('span', { style: { color: '#ffffff', fontWeight: '500' } }, order.paymentMethod),
          ]),
          el('div', { className: 'invoice-row' }, [
            el('span', null, 'Delivery Address'),
            el('span', { style: { color: '#ffffff', textAlign: 'right', maxWidth: '60%' } }, order.deliveryAddress),
          ]),
          el('div', { className: 'invoice-row' }, [
            el('span', null, 'Delivery Fee'),
            el('span', { className: 'tabular-nums', style: { color: '#ffffff' } }, `${formatStoreMoney(order.deliveryFee)} ${getStoreCurrencyCode()}`),
          ]),
          el('div', { className: 'invoice-total-row' }, [
            el('span', null, 'Grand Total'),
            el('span', { className: 'tabular-nums', style: { color: 'var(--accent-soft)' } }, `${formatStoreMoney(order.grandTotal)} ${getStoreCurrencyCode()}`),
          ]),
        ]),
        el('div', { className: 'gallery-surface footer-service-card', style: { padding: '1rem' } }, [
          el(
            'div',
            { style: { fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent-warm)' } },
            'Customer Service Assistance'
          ),
          el('div', { className: 'footer-service-row' }, [
            el('span', { className: 'tabular-nums', style: { fontSize: '0.9375rem', fontWeight: '600', color: '#ffffff' } }, getSupportPhoneDisplay()),
            el('div', { className: 'footer-service-btns' }, [
              supportCopyBtn,
              el(
                'a',
                {
                  href: formatWhatsAppUrl(
                    getSupportWhatsAppNumber(),
                    `Hello DR Atelier, regarding my order ${order.orderCode}`
                  ),
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  className: 'btn-whatsapp-pill',
                },
                [createIcon('messageCircle', 'icon-sm'), el('span', null, 'WhatsApp')]
              ),
            ]),
          ]),
        ]),
        el('div', { className: 'detail-actions-grid' }, [
          el(
            'button',
            {
              type: 'button',
              className: 'gallery-btn-primary',
              style: {
                height: '2.75rem',
                padding: '0 1rem',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              },
              onClick: () => {
                closeDrawer();
                openMyOrdersModal();
              },
            },
            [createIcon('clipboardList', 'icon-md'), el('span', null, 'Track Order')]
          ),
          el(
            'button',
            {
              type: 'button',
              className: 'gallery-btn-secondary',
              style: {
                height: '2.75rem',
                padding: '0 1rem',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              },
              onClick: closeDrawer,
            },
            'Continue Shopping'
          ),
        ]),
      ])
    );
  }

  const panelChildren = [
    el('div', { className: 'drawer-header' }, [
      el('div', null, [
        el('span', { className: 'drawer-kicker' }, headerKicker),
        el('h2', { className: 'drawer-title' }, headerTitle),
      ]),
      el(
        'button',
        {
          type: 'button',
          className: 'icon-circle-btn',
          'aria-label': 'Close bag drawer',
          onClick: closeDrawer,
        },
        createIcon('x', 'icon-md')
      ),
    ]),
    stepsRail,
    body,
  ];

  if (state.drawerStep === 'cart' && state.cart.length > 0) {
    panelChildren.push(
      el('div', { className: 'drawer-footer' }, [
        el(
          'button',
          {
            type: 'button',
            disabled: !state.settings.isOpen,
            className: 'gallery-btn-primary',
            style: {
              width: '100%',
              height: '2.875rem',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
            },
            onClick: () => {
              state.drawerStep = 'checkout';
              renderCartDrawer();
            },
          },
          [el('span', null, 'Proceed to Checkout'), createIcon('arrowRight', 'icon-md')]
        ),
      ])
    );
  } else if (state.drawerStep === 'checkout') {
    panelChildren.push(
      el('div', { className: 'drawer-footer' }, [
        el(
          'button',
          {
            type: 'button',
            className: 'gallery-btn-secondary',
            style: { height: '2.75rem', padding: '0 1.25rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' },
            onClick: () => {
              state.drawerStep = 'cart';
              renderCartDrawer();
            },
          },
          'Back'
        ),
        el(
          'button',
          {
            type: 'submit',
            form: 'checkout-form',
            disabled: state.checkoutSubmitting || !state.settings.isOpen,
            className: 'gallery-btn-primary',
            style: {
              flex: '1 1 0%',
              height: '2.75rem',
              padding: '0 1rem',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            },
          },
          el(
            'span',
            null,
            state.checkoutSubmitting
              ? 'Submitting Order...'
              : `Confirm Order · ${formatStoreMoney(grandTotal)} ${getStoreCurrencyCode()}`
          )
        ),
      ])
    );
  }

  dom.cartDrawerRoot.appendChild(
    el(
      'div',
      {
        className: 'drawer-backdrop',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Shopping Bag and Checkout',
        onClick: closeDrawer,
      },
      el('div', { className: 'drawer-panel', onClick: (e) => e.stopPropagation() }, panelChildren)
    )
  );
}

/* My Orders Modal */
function statusBadgeClass(status) {
  switch (status) {
    case 'Pending':
      return 'status-badge status-badge--pending';
    case 'In Progress':
      return 'status-badge status-badge--progress';
    case 'Finished':
      return 'status-badge status-badge--finished';
    case 'Rejected':
      return 'status-badge status-badge--rejected';
    default:
      return 'status-badge';
  }
}

async function refreshCustomerOrders() {
  if (!state.trackedCodes.length && !state.myOrdersPhoneQuery) {
    state.myOrders = [];
    renderMyOrdersList();
    return;
  }
  state.myOrdersLoading = true;
  updateMyOrdersSpinner();
  try {
    const data = await lookupCustomerOrders(state.trackedCodes, state.myOrdersPhoneQuery);
    state.myOrders = Array.isArray(data.orders) ? data.orders : [];
  } catch {
    // Keep existing orders on transient failure
  } finally {
    state.myOrdersLoading = false;
    updateMyOrdersSpinner();
    renderMyOrdersList();
  }
}

function updateMyOrdersSpinner() {
  const icon = document.getElementById('my-orders-refresh-icon');
  if (icon) {
    icon.classList.toggle('animate-spin', state.myOrdersLoading);
  }
}

function renderMyOrdersList() {
  const listWrap = document.getElementById('my-orders-list-body');
  if (!listWrap) return;
  clearNode(listWrap);

  if (state.myOrders.length === 0) {
    listWrap.appendChild(
      el('div', { style: { padding: '3rem 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' } }, [
        el('p', { className: 'font-luxury-display', style: { fontSize: '1.375rem', color: '#ffffff' } }, 'No Orders Tracked Yet'),
        el(
          'p',
          { style: { fontSize: '0.8125rem', color: 'var(--ink-secondary)', maxWidth: '24rem', margin: '0 auto' } },
          'Orders placed from this browser appear automatically. Enter an order code or your phone number above to retrieve orders from another device.'
        ),
      ])
    );
    return;
  }

  for (const order of state.myOrders) {
    const isHighlighted = state.highlightedOrderCode && order.orderCode === state.highlightedOrderCode;
    const card = el('div', {
      className: 'gallery-surface',
      style: {
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
        ...(isHighlighted
          ? { borderColor: 'var(--accent-bright)', boxShadow: '0 0 0 1px var(--accent-bright)' }
          : {}),
      },
    });

    const titleRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.625rem' } }, [
      el('span', { className: 'font-luxury-display tabular-nums', style: { fontSize: '1.25rem', fontWeight: '600', color: '#ffffff' } }, order.orderCode),
    ]);
    if (isHighlighted) {
      titleRow.appendChild(
        el(
          'span',
          {
            style: {
              fontSize: '0.625rem',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--accent-soft)',
              fontWeight: '600',
            },
          },
          '· Recent'
        )
      );
    }

    const statusCol = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' } }, [
      el('span', { className: statusBadgeClass(order.status) }, order.status),
    ]);
    if (order.status === 'Rejected' && order.rejectionReason) {
      statusCol.appendChild(
        el('div', { className: 'rejection-note-box' }, [
          createIcon('alertTriangle', 'icon-sm text-rose-accent'),
          el('span', null, `Reason: ${order.rejectionReason}`),
        ])
      );
    }

    const itemsBox = el('div', {
      style: {
        borderTop: '1px solid var(--hairline)',
        borderBottom: '1px solid var(--hairline)',
        padding: '0.75rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      },
    });
    for (const item of order.items || []) {
      itemsBox.appendChild(
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8125rem', gap: '0.75rem' } }, [
          el('div', { style: { color: 'var(--ink)' } }, [
            el('span', { className: 'tabular-nums', style: { color: 'var(--accent-soft)', fontWeight: '600' } }, `${item.quantity}×`),
            ` ${item.name}`,
          ]),
          el('div', { className: 'tabular-nums', style: { color: '#ffffff', fontWeight: '500', flexShrink: '0' } }, `${formatStoreMoney(item.lineTotal)} ${getStoreCurrencyCode()}`),
        ])
      );
    }

    card.append(
      el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' } }, [
        el('div', null, [
          titleRow,
          el('div', { style: { fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.125rem' } }, new Date(order.createdAt).toLocaleString()),
        ]),
        statusCol,
      ]),
      itemsBox,
      el('div', { className: 'chef-form-grid-2', style: { fontSize: '0.75rem' } }, [
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' } }, [
          el('div', { style: { color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.625rem' } }, 'Payment & Settlement'),
          el('div', { style: { color: '#ffffff' } }, order.paymentMethod),
        ]),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' } }, [
          el('div', { style: { color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.625rem' } }, 'Delivery Address'),
          el('div', { style: { color: 'var(--ink-secondary)' } }, order.deliveryAddress),
        ]),
      ]),
      el(
        'div',
        {
          style: {
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--hairline)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            fontSize: '0.75rem',
          },
        },
        [
          el('div', { style: { color: 'var(--ink-secondary)' } }, [
            'Delivery Fee: ',
            el('span', { className: 'tabular-nums', style: { color: '#ffffff' } }, `${formatStoreMoney(order.deliveryFee)} ${getStoreCurrencyCode()}`),
          ]),
          el('div', { style: { fontSize: '0.875rem', fontWeight: '600', color: '#ffffff' } }, [
            'Grand Total: ',
            el('span', { className: 'tabular-nums', style: { color: 'var(--accent-soft)' } }, `${formatStoreMoney(order.grandTotal)} ${getStoreCurrencyCode()}`),
          ]),
        ]
      )
    );

    listWrap.appendChild(card);
  }
}

function openMyOrdersModal() {
  state.myOrdersOpen = true;
  renderMyOrdersModal();
  void refreshCustomerOrders();

  if (myOrdersIntervalId) window.clearInterval(myOrdersIntervalId);
  myOrdersIntervalId = window.setInterval(() => void refreshCustomerOrders(), 4000);

  if (typeof BroadcastChannel !== 'undefined') {
    myOrdersChannel?.close();
    myOrdersChannel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
    myOrdersChannel.onmessage = () => void refreshCustomerOrders();
  }
}

function closeMyOrdersModal() {
  state.myOrdersOpen = false;
  if (myOrdersIntervalId) {
    window.clearInterval(myOrdersIntervalId);
    myOrdersIntervalId = null;
  }
  myOrdersChannel?.close();
  myOrdersChannel = null;
  renderMyOrdersModal();
}

function renderMyOrdersModal() {
  if (!dom.myOrdersRoot) return;
  clearNode(dom.myOrdersRoot);
  if (!state.myOrdersOpen) return;

  const lookupInput = el('input', {
    type: 'text',
    value: state.myOrdersLookupInput,
    placeholder: 'Track by Order Code (ORD-1001) or Phone Number...',
    className: 'orders-lookup-input',
    onInput: (e) => {
      state.myOrdersLookupInput = e.target.value;
    },
  });

  const refreshIcon = createIcon('refreshCw', 'icon-md');
  refreshIcon.id = 'my-orders-refresh-icon';

  const modal = el(
    'div',
    {
      className: 'gallery-surface orders-modal-card',
      onClick: (e) => e.stopPropagation(),
    },
    [
      el('div', { className: 'drawer-header' }, [
        el('div', null, [
          el('span', { className: 'drawer-kicker' }, 'Live Order Tracking'),
          el('h2', { className: 'drawer-title' }, 'My Orders'),
        ]),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } }, [
          el(
            'button',
            {
              type: 'button',
              className: 'icon-circle-btn',
              'aria-label': 'Refresh orders',
              onClick: () => void refreshCustomerOrders(),
            },
            refreshIcon
          ),
          el(
            'button',
            {
              type: 'button',
              className: 'icon-circle-btn',
              'aria-label': 'Close my orders',
              onClick: closeMyOrdersModal,
            },
            createIcon('x', 'icon-md')
          ),
        ]),
      ]),
      el(
        'form',
        {
          className: 'orders-lookup-bar',
          onSubmit: (e) => {
            e.preventDefault();
            const val = state.myOrdersLookupInput.trim();
            if (!val) return;
            if (/^ORD-\d+/i.test(val)) {
              const code = val.toUpperCase();
              if (!state.trackedCodes.includes(code)) {
                state.trackedCodes = [code, ...state.trackedCodes];
                saveTrackedCodes(state.trackedCodes);
              }
              state.myOrdersLookupInput = '';
              lookupInput.value = '';
            } else {
              state.myOrdersPhoneQuery = val;
            }
            void refreshCustomerOrders();
          },
        },
        [
          el('div', { className: 'orders-lookup-input-wrap' }, [
            createIcon('search', 'icon-sm search-icon'),
            lookupInput,
          ]),
          el(
            'button',
            {
              type: 'submit',
              className: 'gallery-btn-primary',
              style: {
                height: '2.375rem',
                padding: '0 1rem',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                flexShrink: '0',
              },
            },
            'Find Order'
          ),
        ]
      ),
      el('div', {
        id: 'my-orders-list-body',
        style: { flex: '1 1 0%', overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
      }),
    ]
  );

  dom.myOrdersRoot.appendChild(
    el(
      'div',
      {
        className: 'modal-backdrop',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'My Orders',
        onClick: closeMyOrdersModal,
      },
      modal
    )
  );

  renderMyOrdersList();
}

/* Data Loaders */
async function loadCatalog(fresh = false) {
  if (fresh) {
    state.catalogRefreshing = true;
    dom.refreshCatalogIcon?.querySelector('svg')?.classList.add('animate-spin');
  } else {
    state.catalogLoading = true;
  }
  state.catalogError = '';
  if (!fresh) renderCatalog();

  try {
    const data = await fetchProducts(fresh);
    state.products = Array.isArray(data.products) ? data.products : [];
    state.categories = Array.isArray(data.categories) ? data.categories : [];

    if (state.pendingSlug && state.products.length > 0) {
      const target = state.pendingSlug.toLowerCase();
      const match = state.products.find(
        (p) => p.slug.toLowerCase() === target || p.id === state.pendingSlug
      );
      if (match) {
        openProductDetail(match);
      }
      state.pendingSlug = '';
    }
  } catch {
    state.catalogError = 'Unable to sync catalog right now. Please refresh.';
  } finally {
    state.catalogLoading = false;
    state.catalogRefreshing = false;
    dom.refreshCatalogIcon?.querySelector('svg')?.classList.remove('animate-spin');
    renderCategories();
    renderCatalog();
  }
}

function applySettingsIfNewer(candidate) {
  if (!candidate || typeof candidate !== 'object') return;
  const nextMs = Date.parse(candidate.updatedAt || '1970-01-01T00:00:00.000Z');
  const currMs = Date.parse(state.settings?.updatedAt || '1970-01-01T00:00:00.000Z');
  if (Number.isFinite(nextMs) && Number.isFinite(currMs) && nextMs < currMs) {
    return;
  }
  state.settings = { ...DEFAULT_SETTINGS, ...candidate };
  renderSettingsUI();
}

async function loadSettings() {
  try {
    const settings = await fetchStoreSettings();
    if (settings) applySettingsIfNewer(settings);
  } catch {
    // Keep last known settings during temporary network failures.
  }
}

/* Event Bindings & Boot */
function bindEvents() {
  dom.brandResetBtn?.addEventListener('click', () => {
    state.selectedCategory = 'ALL';
    state.searchQuery = '';
    if (dom.searchInput) dom.searchInput.value = '';
    dom.searchClearBtn?.classList.add('hidden');
    if (state.activeProduct) closeProductDetail();
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    renderCategories();
    renderCatalog();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  dom.searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    dom.searchClearBtn?.classList.toggle('hidden', !state.searchQuery);
    renderCatalog();
  });

  dom.searchClearBtn?.addEventListener('click', () => {
    state.searchQuery = '';
    if (dom.searchInput) dom.searchInput.value = '';
    dom.searchClearBtn.classList.add('hidden');
    renderCatalog();
  });

  dom.openOrdersBtn?.addEventListener('click', openMyOrdersModal);
  dom.openBagBtn?.addEventListener('click', () => {
    state.drawerStep = 'cart';
    state.drawerOpen = true;
    renderCartDrawer();
  });

  dom.discoverPiecesBtn?.addEventListener('click', () => {
    document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
  });
  dom.storyArtisanshipBtn?.addEventListener('click', () => {
    document.getElementById('bespoke')?.scrollIntoView({ behavior: 'smooth' });
  });
  dom.storyMaterialBtn?.addEventListener('click', () => {
    state.selectedCategory = 'ALL';
    renderCategories();
    renderCatalog();
    document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
  });
  dom.storyArchiveBtn?.addEventListener('click', openMyOrdersModal);

  dom.refreshCatalogBtn?.addEventListener('click', () => void loadCatalog(true));

  dom.footerCopyPhoneBtn?.addEventListener('click', async () => {
    await copyToClipboard(getSupportPhoneDigits());
    state.copiedFooterPhone = true;
    renderFooterPhoneButton();
    window.setTimeout(() => {
      state.copiedFooterPhone = false;
      renderFooterPhoneButton();
    }, 1800);
  });

  dom.backToTopBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.activeProduct) closeProductDetail();
      else if (state.drawerOpen) closeDrawer();
      else if (state.myOrdersOpen) closeMyOrdersModal();
    }
  });

  window.addEventListener('popstate', () => {
    const slug = readInitialSlug();
    if (!slug) {
      state.activeProduct = null;
      renderProductDetailModal();
      return;
    }
    const match = state.products.find(
      (p) => p.slug.toLowerCase() === slug.toLowerCase() || p.id === slug
    );
    state.activeProduct = match || null;
    if (state.activeProduct) {
      state.detailImgIdx = 0;
      state.detailQty = 1;
    }
    renderProductDetailModal();
  });
}

function initCreditBadge() {
  const wrap = document.getElementById('floating-credit-wrap');
  const card = document.getElementById('floating-credit-card');
  const closeBtn = document.getElementById('credit-close-btn');
  const reopenTab = document.getElementById('credit-reopen-tab');
  if (!wrap || !card || !closeBtn || !reopenTab) return;

  const setCollapsed = (collapsed) => {
    wrap.classList.toggle('is-collapsed', collapsed);
    card.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    closeBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    reopenTab.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
    reopenTab.tabIndex = collapsed ? 0 : -1;
  };

  closeBtn.addEventListener('click', () => setCollapsed(true));
  reopenTab.addEventListener('click', () => setCollapsed(false));
}

function boot() {
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  initStaticChrome();
  initCreditBadge();
  bindEvents();
  renderSettingsUI();
  renderCategories();
  renderCatalog();
  void loadCatalog(false);
  void loadSettings();
  // Poll server-backed Firestore settings so open storefronts receive updates.
  window.setInterval(() => void loadSettings(), 5000);
}

boot();
