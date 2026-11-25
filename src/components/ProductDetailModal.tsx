import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Minus,
  Plus,
  ShoppingBag,
  ArrowUpRight,
} from 'lucide-react';
import type { Product } from '../types';
import { BRAND_LOGO_URL, formatPriceUSD } from '../lib/utils';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
}) => {
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setActiveImgIndex(0);
    setQuantity(1);
    setCopiedUrl(false);
    setAddedFeedback(false);
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);

  if (!product) return null;

  const images = product.images;
  const activeUrl = images[activeImgIndex] || '';
  const isBroken = !activeUrl || failedUrls[activeUrl];
  const shareUrl = `${window.location.origin}/${product.slug}`;
  const lineTotal = product.price * quantity;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleAdd = () => {
    onAddToCart(product, quantity);
    setAddedFeedback(true);
    window.setTimeout(() => setAddedFeedback(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="ocean-glass-card w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close product details"
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-[#061019]/90 border border-cyan-300/30 text-[#D8EEF5] hover:text-white hover:border-cyan-300/70 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Gallery */}
          <div className="lg:col-span-7 p-5 sm:p-7 bg-[#060E17]/80 border-b lg:border-b-0 lg:border-r border-cyan-300/15">
            <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-[#040910] border border-cyan-300/20">
              {!isBroken ? (
                <img
                  src={activeUrl}
                  alt={`${product.name} view ${activeImgIndex + 1}`}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedUrls((prev) => ({
                      ...prev,
                      [activeUrl]: true,
                    }))
                  }
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8">
                  <img
                    src={BRAND_LOGO_URL}
                    alt="DR Resin"
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 object-contain opacity-80 mb-3"
                  />
                  <span className="text-xs uppercase tracking-[0.2em] text-[#7C8C99]">
                    {product.category}
                  </span>
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous image"
                    onClick={() =>
                      setActiveImgIndex((prev) => (prev - 1 + images.length) % images.length)
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#050C14]/85 border border-cyan-300/35 text-white flex items-center justify-center hover:border-cyan-300/80"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={() => setActiveImgIndex((prev) => (prev + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#050C14]/85 border border-cyan-300/35 text-white flex items-center justify-center hover:border-cyan-300/80"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="mt-4 flex items-center gap-3 overflow-x-auto pb-1">
                {images.map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    onClick={() => setActiveImgIndex(idx)}
                    className={`relative w-20 h-16 rounded-lg overflow-hidden shrink-0 border transition-all ${
                      idx === activeImgIndex
                        ? 'border-[#4CC9EA] ring-2 ring-[#4CC9EA]/30'
                        : 'border-cyan-300/20 opacity-65 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={url}
                      alt={`Thumbnail ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Purchase Details */}
          <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#7AD3EA]">
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span>DR Atelier</span>
              </div>

              <h2 className="mt-2 font-luxury-display text-2xl sm:text-3xl font-medium tracking-[0.04em] text-white leading-tight">
                {product.name}
              </h2>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="tabular-nums text-3xl font-semibold text-white">
                  {formatPriceUSD(product.price)}
                </span>
                <span className="text-xs uppercase tracking-[0.16em] text-[#9BA9B4]">USD</span>
              </div>

              <p className="mt-5 text-sm sm:text-[15px] text-[#B8C5CE] leading-relaxed whitespace-pre-line">
                {product.description ||
                  'Handcrafted from figured natural walnut and museum-grade deep ocean epoxy resin.'}
              </p>

              {/* Shareable URL */}
              <div className="mt-6 pt-5 border-t border-cyan-300/15">
                <label className="block text-[11px] uppercase tracking-[0.16em] text-[#7C8C99] mb-2">
                  Shareable Piece Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    aria-label="Shareable product URL"
                    className="flex-1 min-w-0 bg-[#040A10] border border-cyan-300/20 rounded-lg px-3 py-2 text-xs text-[#C7D8E2] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="px-3.5 py-2 rounded-lg bg-[#0C1D2A] border border-cyan-300/30 text-xs font-medium text-[#D8EEF5] hover:border-cyan-300/70 flex items-center gap-1.5 shrink-0"
                  >
                    {copiedUrl ? (
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
                </div>
              </div>
            </div>

            {/* Quantity + Line Total + Buy/Add Actions */}
            <div className="pt-5 border-t border-cyan-300/15 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-[#7C8C99]">
                    Quantity
                  </span>
                  <div className="mt-1.5 inline-flex items-center rounded-full bg-[#050C14] border border-cyan-300/25 p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[#B8D7E2] hover:bg-cyan-400/10"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="tabular-nums w-10 text-center text-sm font-semibold text-white">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                      aria-label="Increase quantity"
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[#B8D7E2] hover:bg-cyan-400/10"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-[#7C8C99]">
                    Line Total
                  </span>
                  <span className="mt-1 block tabular-nums text-2xl font-semibold text-[#7AD3EA]">
                    {formatPriceUSD(lineTotal)}{' '}
                    <span className="text-xs font-normal text-[#9BA9B4]">USD</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-5 py-3 rounded-full bg-[#0C1D2A] border border-cyan-300/35 hover:border-cyan-300/75 text-xs uppercase tracking-[0.16em] font-medium text-[#E5F4F8] flex items-center justify-center gap-2 transition-all"
                >
                  {addedFeedback ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Added to Bag</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Add to Cart</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onBuyNow(product, quantity)}
                  className="ocean-pill-btn px-5 py-3 rounded-full text-xs uppercase tracking-[0.16em] font-semibold text-white flex items-center justify-center gap-2"
                >
                  <span>Buy Now</span>
                  <ArrowUpRight className="w-4 h-4 text-[#67D4F0]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
