import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, RefreshCw, AlertTriangle } from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { ORDERS_CHANNEL_NAME, formatPriceUSD } from '../lib/utils';

interface MyOrdersModalProps {
  isOpen: boolean;
  trackedCodes: string[];
  highlightedOrderCode?: string | null;
  onClose: () => void;
  onAddTrackedCode: (code: string) => void;
}

function statusBadgeStyle(status: string): string {
  switch (status) {
    case OrderStatus.PENDING:
      return 'bg-amber-950/60 border-amber-400/45 text-amber-200';
    case OrderStatus.IN_PROGRESS:
      return 'bg-cyan-950/60 border-cyan-400/45 text-cyan-200';
    case OrderStatus.FINISHED:
      return 'bg-emerald-950/60 border-emerald-400/45 text-emerald-200';
    case OrderStatus.REJECTED:
      return 'bg-rose-950/60 border-rose-400/45 text-rose-200';
    default:
      return 'bg-slate-900 border-slate-600 text-slate-200';
  }
}

export const MyOrdersModal: React.FC<MyOrdersModalProps> = ({
  isOpen,
  trackedCodes,
  highlightedOrderCode,
  onClose,
  onAddTrackedCode,
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [activePhoneQuery, setActivePhoneQuery] = useState('');

  const fetchOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (trackedCodes.length > 0) params.set('codes', trackedCodes.join(','));
    if (activePhoneQuery) params.set('phone', activePhoneQuery);
    if (!params.toString()) {
      setOrders([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      }
    } catch {
      // Keep existing state on transient error
    } finally {
      setLoading(false);
    }
  }, [trackedCodes, activePhoneQuery]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchOrders();
    const interval = window.setInterval(() => {
      void fetchOrders();
    }, 4000);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
      channel.onmessage = () => {
        void fetchOrders();
      };
    }

    return () => {
      window.clearInterval(interval);
      channel?.close();
    };
  }, [isOpen, fetchOrders]);

  if (!isOpen) return null;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = lookupInput.trim();
    if (!val) return;
    if (/^ORD-\d+/i.test(val)) {
      onAddTrackedCode(val.toUpperCase());
      setLookupInput('');
    } else {
      setActivePhoneQuery(val);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="My Orders"
    >
      <div
        className="ocean-glass-card w-full max-w-3xl max-h-[88vh] rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-cyan-300/15 bg-[#07131E] flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#7AD3EA]">
              Live Order Tracking
            </span>
            <h2 className="font-luxury-display text-xl text-white tracking-[0.04em]">My Orders</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchOrders()}
              aria-label="Refresh orders"
              className="w-9 h-9 rounded-full bg-[#0B1926] border border-cyan-300/25 text-[#D8EEF5] hover:border-cyan-300/65 flex items-center justify-center"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close my orders"
              className="w-9 h-9 rounded-full bg-[#0B1926] border border-cyan-300/25 text-[#D8EEF5] hover:border-cyan-300/65 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lookup Bar for cross-device / cross-session tracking */}
        <form
          onSubmit={handleLookup}
          className="px-6 py-3.5 border-b border-cyan-300/10 bg-[#050C14] flex flex-wrap sm:flex-nowrap items-center gap-2.5"
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#7C8C99] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Track by Order Code (ORD-1001) or Phone Number..."
              className="w-full bg-[#09131D] border border-cyan-300/20 focus:border-[#4CC9EA] rounded-full pl-9 pr-4 py-2 text-xs text-white placeholder-[#687A88] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="ocean-pill-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider text-white shrink-0"
          >
            Find Order
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {orders.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="font-luxury-display text-lg text-white">No Orders Tracked Yet</p>
              <p className="text-xs text-[#9BA9B4] max-w-sm mx-auto">
                Orders placed from this browser appear automatically. Enter an order code or your
                phone number above to retrieve orders from another device.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const isHighlighted =
                highlightedOrderCode && order.orderCode === highlightedOrderCode;
              return (
                <div
                  key={order.id}
                  className={`ocean-glass-card rounded-xl p-5 space-y-4 transition-all ${
                    isHighlighted ? 'ring-2 ring-[#4CC9EA]/70 border-[#4CC9EA]' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-luxury-display text-lg text-white tabular-nums">
                          {order.orderCode}
                        </span>
                        {isHighlighted && (
                          <span className="text-[10px] uppercase tracking-[0.16em] text-[#7AD3EA] bg-cyan-950/60 border border-cyan-300/35 px-2 py-0.5 rounded-full">
                            New Order
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#9BA9B4] mt-0.5">
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${statusBadgeStyle(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </span>
                      {order.status === OrderStatus.REJECTED && order.rejectionReason && (
                        <div className="flex items-start gap-1.5 text-xs text-rose-200 bg-rose-950/50 border border-rose-400/35 rounded-lg px-3 py-1.5 max-w-xs text-right">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
                          <span>Reason: {order.rejectionReason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Itemized Products */}
                  <div className="border-t border-b border-cyan-300/10 py-3 space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs gap-3">
                        <div className="text-[#D8EEF5]">
                          <span className="tabular-nums text-[#7AD3EA] font-semibold">
                            {item.quantity}×
                          </span>{' '}
                          {item.name}
                        </div>
                        <div className="tabular-nums text-white font-medium shrink-0">
                          {formatPriceUSD(item.lineTotal)} USD
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Payment & Delivery Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="text-[#7C8C99] uppercase tracking-wider text-[10px]">
                        Payment & Wallet
                      </div>
                      <div className="text-white">{order.paymentMethod}</div>
                      {order.senderWalletPhone && (
                        <div className="text-[#9BA9B4] tabular-nums">
                          Sender Wallet: {order.senderWalletPhone}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[#7C8C99] uppercase tracking-wider text-[10px]">
                        Delivery Address
                      </div>
                      <div className="text-[#D8EEF5]">{order.deliveryAddress}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-cyan-300/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-[#9BA9B4]">
                      Delivery Fee:{' '}
                      <span className="tabular-nums text-white">
                        {formatPriceUSD(order.deliveryFee)} USD
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      Grand Total:{' '}
                      <span className="tabular-nums text-[#7AD3EA]">
                        {formatPriceUSD(order.grandTotal)} USD
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
