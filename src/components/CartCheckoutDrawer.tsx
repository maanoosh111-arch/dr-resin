import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Minus,
  Plus,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  MessageCircle,
  ClipboardList,
  AlertCircle,
} from 'lucide-react';
import { CartItem, Order, PaymentMethod, StoreSettings } from '../types';
import {
  BRAND_LOGO_URL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_RAW,
  broadcastOrdersUpdate,
  formatPriceUSD,
  formatWhatsAppUrl,
} from '../lib/utils';

type DrawerStep = 'cart' | 'checkout' | 'success';

interface CartCheckoutDrawerProps {
  isOpen: boolean;
  initialStep: DrawerStep;
  cart: CartItem[];
  settings: StoreSettings;
  onClose: () => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onOrderCreated: (order: Order) => void;
  onOpenMyOrders: () => void;
}

export const CartCheckoutDrawer: React.FC<CartCheckoutDrawerProps> = ({
  isOpen,
  initialStep,
  cart,
  settings,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderCreated,
  onOpenMyOrders,
}) => {
  const [step, setStep] = useState<DrawerStep>(initialStep);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [copiedSupport, setCopiedSupport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      setErrorMsg('');
    }
  }, [isOpen, initialStep]);

  if (!isOpen) return null;

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const deliveryFee = settings.deliveryFee || 0;
  const grandTotal = subtotal + deliveryFee;

  const handleCopySupport = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_PHONE_RAW);
      setCopiedSupport(true);
      window.setTimeout(() => setCopiedSupport(false), 1800);
    } catch {
      // Ignore
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!settings.isOpen) {
      setErrorMsg('Store is currently closed. Checkout is temporarily disabled.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      setErrorMsg('Please complete all required delivery details.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          deliveryNotes: deliveryNotes.trim(),
          paymentMethod: PaymentMethod.COD,
          senderWalletPhone: '',
          receiptImageDataUrl: '',
          items: cart.map((item) => ({
            productId: item.productId,
            slug: item.slug,
            quantity: item.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not place order. Please review your details.');
        return;
      }
      const created = data.order as Order;
      setPlacedOrder(created);
      onOrderCreated(created);
      onClearCart();
      broadcastOrdersUpdate({ orderCode: created.orderCode });
      setStep('success');
    } catch {
      setErrorMsg('Network error while submitting your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Bag and Checkout"
    >
      <div
        className="w-full max-w-xl h-full bg-[#060E16] border-l border-cyan-300/25 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-cyan-300/15 flex items-center justify-between bg-[#07131E]">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#7AD3EA]">
              {step === 'cart'
                ? 'Step 01 · Your Selection'
                : step === 'checkout'
                ? 'Step 02 · Delivery & Settlement'
                : 'Step 03 · Atelier Confirmation'}
            </span>
            <h2 className="font-luxury-display text-xl font-medium text-white tracking-[0.04em]">
              {step === 'cart'
                ? 'Curated Bag'
                : step === 'checkout'
                ? 'Checkout Invoice'
                : 'Order Confirmed'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bag drawer"
            className="w-9 h-9 rounded-full bg-[#0B1926] border border-cyan-300/25 text-[#D8EEF5] hover:border-cyan-300/70 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!settings.isOpen && step !== 'success' && (
            <div className="p-4 rounded-xl bg-amber-950/35 border border-amber-400/35 text-amber-100 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold uppercase tracking-wider">Store Currently Closed</p>
                <p className="mt-1 text-amber-200/80">
                  Checkout is temporarily paused until {settings.openTime}. {settings.customNote}
                </p>
              </div>
            </div>
          )}

          {step === 'cart' && (
            <>
              {cart.length === 0 ? (
                <div className="py-16 text-center space-y-4">
                  <img
                    src={BRAND_LOGO_URL}
                    alt="DR Resin"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 mx-auto object-contain opacity-60"
                  />
                  <h3 className="font-luxury-display text-xl text-white">Your Bag is Empty</h3>
                  <p className="text-sm text-[#9BA9B4] max-w-xs mx-auto">
                    Explore our walnut and deep ocean resin collection to add pieces to your order.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="ocean-pill-btn px-6 py-2.5 rounded-full text-xs uppercase tracking-[0.16em] text-white"
                  >
                    Browse Collection
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.16em] text-[#9BA9B4]">
                      {cart.reduce((s, i) => s + i.quantity, 0)} Pieces Selected
                    </span>
                    <button
                      type="button"
                      onClick={onClearCart}
                      className="text-xs uppercase tracking-wider text-rose-300/80 hover:text-rose-200 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Cart</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.productId}
                        className="ocean-glass-card rounded-xl p-3.5 flex gap-3.5 items-start"
                      >
                        <div className="w-20 h-16 rounded-lg overflow-hidden bg-[#040A10] border border-cyan-300/15 shrink-0">
                          <img
                            src={item.image || BRAND_LOGO_URL}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.16em] text-[#7AD3EA]">
                                {item.category}
                              </span>
                              <h4 className="font-luxury-display text-sm font-medium text-white truncate">
                                {item.name}
                              </h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(item.productId)}
                              aria-label={`Remove ${item.name}`}
                              className="text-[#7C8C99] hover:text-rose-300 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-[#9BA9B4] line-clamp-1 mt-0.5">
                            {item.description}
                          </p>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="inline-flex items-center rounded-full bg-[#040A10] border border-cyan-300/20 px-1 py-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  item.quantity > 1
                                    ? onUpdateQty(item.productId, item.quantity - 1)
                                    : onRemoveItem(item.productId)
                                }
                                aria-label="Decrease item quantity"
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[#B8D7E2] hover:bg-cyan-400/10"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="tabular-nums w-7 text-center text-xs font-semibold text-white">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
                                aria-label="Increase item quantity"
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[#B8D7E2] hover:bg-cyan-400/10"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="tabular-nums text-sm font-semibold text-white">
                              {formatPriceUSD(item.unitPrice * item.quantity)}{' '}
                              <span className="text-[10px] font-normal text-[#9BA9B4]">USD</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Invoice Summary */}
                  <div className="ocean-glass-card rounded-xl p-4 space-y-2.5 text-sm">
                    <div className="flex justify-between text-[#9BA9B4]">
                      <span>Subtotal</span>
                      <span className="tabular-nums text-white">{formatPriceUSD(subtotal)} USD</span>
                    </div>
                    <div className="flex justify-between text-[#9BA9B4]">
                      <span>Home Delivery Fee</span>
                      <span className="tabular-nums text-white">
                        {formatPriceUSD(deliveryFee)} USD
                      </span>
                    </div>
                    <div className="pt-2.5 border-t border-cyan-300/15 flex justify-between text-base font-semibold text-white">
                      <span>Estimated Total</span>
                      <span className="tabular-nums text-[#7AD3EA]">
                        {formatPriceUSD(grandTotal)} USD
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handleSubmitOrder} className="space-y-6">
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-400/40 text-rose-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Customer Delivery Fields */}
              <div className="space-y-4">
                <h3 className="font-luxury-display text-sm uppercase tracking-[0.18em] text-[#7AD3EA]">
                  Recipient Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs text-[#9BA9B4] mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full bg-[#040A10] border border-cyan-300/25 focus:border-[#4CC9EA] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#566673] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#9BA9B4] mb-1.5">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full bg-[#040A10] border border-cyan-300/25 focus:border-[#4CC9EA] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#566673] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#9BA9B4] mb-1.5">
                    Detailed Delivery Address *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Street, building, floor, apartment, and nearby landmark"
                    className="w-full bg-[#040A10] border border-cyan-300/25 focus:border-[#4CC9EA] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#566673] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9BA9B4] mb-1.5">
                    Delivery Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="Preferred delivery window or gate instructions"
                    className="w-full bg-[#040A10] border border-cyan-300/25 focus:border-[#4CC9EA] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#566673] focus:outline-none"
                  />
                </div>
              </div>

              {/* Sole Payment Method: Pay on Delivery */}
              <div className="space-y-3">
                <h3 className="font-luxury-display text-sm uppercase tracking-[0.18em] text-[#7AD3EA]">
                  Payment Method
                </h3>
                <div className="w-full p-4 rounded-xl border border-[#4CC9EA] bg-cyan-950/35 shadow-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#040A10] border border-cyan-300/30 flex items-center justify-center text-xs font-bold text-[#7AD3EA]">
                      COD
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Pay on Delivery</div>
                      <div className="text-xs text-[#9BA9B4]">
                        Pay{' '}
                        <span className="tabular-nums font-semibold text-white">
                          {formatPriceUSD(grandTotal)} USD
                        </span>{' '}
                        directly upon delivery (includes{' '}
                        <span className="tabular-nums">{formatPriceUSD(deliveryFee)} USD</span>{' '}
                        courier fee)
                      </div>
                    </div>
                  </div>
                  <ShieldCheck className="w-5 h-5 text-[#4CC9EA] shrink-0" />
                </div>
              </div>

              {/* Live Invoice */}
              <div className="ocean-glass-card rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-[#9BA9B4]">
                  <span>Items Subtotal</span>
                  <span className="tabular-nums text-white">{formatPriceUSD(subtotal)} USD</span>
                </div>
                <div className="flex justify-between text-[#9BA9B4]">
                  <span>Home Delivery Fee</span>
                  <span className="tabular-nums text-white">{formatPriceUSD(deliveryFee)} USD</span>
                </div>
                <div className="pt-2 border-t border-cyan-300/15 flex justify-between text-base font-semibold text-white">
                  <span>Grand Total</span>
                  <span className="tabular-nums text-[#7AD3EA]">
                    {formatPriceUSD(grandTotal)} USD
                  </span>
                </div>
              </div>
            </form>
          )}

          {step === 'success' && placedOrder && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-400/50 text-emerald-300 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <span className="block text-xs uppercase tracking-[0.22em] text-[#7AD3EA]">
                  Commission Recorded
                </span>
                <h3 className="font-luxury-display text-3xl text-white tabular-nums">
                  {placedOrder.orderCode}
                </h3>
                <p className="text-xs text-[#9BA9B4]">
                  Thank you, {placedOrder.customerName}. Your order has been transmitted to the
                  atelier.
                </p>
              </div>

              <div className="ocean-glass-card rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9BA9B4]">Payment Method</span>
                  <span className="text-white font-medium">{placedOrder.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9BA9B4]">Delivery Address</span>
                  <span className="text-white text-right max-w-[60%]">
                    {placedOrder.deliveryAddress}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9BA9B4]">Delivery Fee</span>
                  <span className="tabular-nums text-white">
                    {formatPriceUSD(placedOrder.deliveryFee)} USD
                  </span>
                </div>
                <div className="pt-2 border-t border-cyan-300/15 flex justify-between text-sm font-semibold">
                  <span className="text-white">Grand Total</span>
                  <span className="tabular-nums text-[#7AD3EA]">
                    {formatPriceUSD(placedOrder.grandTotal)} USD
                  </span>
                </div>
              </div>

              {/* Customer Service Card */}
              <div className="ocean-glass-card rounded-xl p-4 space-y-3">
                <div className="text-xs uppercase tracking-[0.16em] text-[#7AD3EA]">
                  Customer Service Assistance
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="tabular-nums text-sm font-semibold text-white">
                    {SUPPORT_PHONE_DISPLAY}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopySupport}
                      className="px-3 py-1.5 rounded-full bg-[#0C1D2A] border border-cyan-300/30 text-xs text-[#D8EEF5] flex items-center gap-1"
                    >
                      {copiedSupport ? (
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
                      href={formatWhatsAppUrl(
                        SUPPORT_PHONE_RAW,
                        `Hello DR Atelier, regarding my order ${placedOrder.orderCode}`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-400/40 text-xs text-emerald-200 flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMyOrders();
                  }}
                  className="ocean-pill-btn px-4 py-3 rounded-full text-xs uppercase tracking-[0.14em] text-white flex items-center justify-center gap-2"
                >
                  <ClipboardList className="w-4 h-4 text-[#67D4F0]" />
                  <span>Track in My Orders</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-3 rounded-full bg-[#0C1D2A] border border-cyan-300/30 text-xs uppercase tracking-[0.14em] text-[#D8EEF5] hover:border-cyan-300/65"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        {step === 'cart' && cart.length > 0 && (
          <div className="p-6 border-t border-cyan-300/15 bg-[#07131E]">
            <button
              type="button"
              disabled={!settings.isOpen}
              onClick={() => setStep('checkout')}
              className="w-full ocean-pill-btn py-3.5 rounded-full text-xs uppercase tracking-[0.18em] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4 text-[#67D4F0]" />
            </button>
          </div>
        )}

        {step === 'checkout' && (
          <div className="p-6 border-t border-cyan-300/15 bg-[#07131E] flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep('cart')}
              className="px-5 py-3 rounded-full bg-[#0B1926] border border-cyan-300/25 text-xs uppercase tracking-[0.14em] text-[#C7D8E2]"
            >
              Back
            </button>
            <button
              type="submit"
              form="checkout-form"
              disabled={submitting || !settings.isOpen}
              className="flex-1 ocean-pill-btn py-3 rounded-full text-xs uppercase tracking-[0.18em] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{submitting ? 'Submitting Order...' : `Confirm Order · ${formatPriceUSD(grandTotal)} USD`}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
