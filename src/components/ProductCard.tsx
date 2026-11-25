import React, { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Check, Plus, ArrowUpRight } from 'lucide-react';
import type { Product } from '../types';
import { BRAND_LOGO_URL, formatPriceUSD } from '../lib/utils';

interface ProductCardProps {
  product: Product;
  onOpenDetail: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onOpenDetail,
  onAddToCart,
  onBuyNow,
}) => {
  const images = product.images.length > 0 ? product.images : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [justAdded, setJustAdded] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const currentUrl = images[activeIndex] || '';
  const isBroken = !currentUrl || failedUrls[currentUrl];

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % images.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || images.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 36) {
      if (delta < 0) {
        setActiveIndex((prev) => (prev + 1) % images.length);
      } else {
        setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
      }
    }
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart(product);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1400);
  };

  const handleBuy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBuyNow(product);
  };

  return (
    <article
      onClick={() => onOpenDetail(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(product);
        }
      }}
      className="group ocean-glass-card ocean-glass-card-hover rounded-2xl overflow-hidden flex flex-col cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2AA7C9]"
    >
      {/* Full-Size Image Showcase */}
      <div
        className="relative aspect-[4/3] w-full overflow-hidden bg-[#040910] flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {!isBroken ? (
          <img
            src={currentUrl}
            alt={product.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() =>
              setFailedUrls((prev) => ({
                ...prev,
                [currentUrl]: true,
              }))
            }
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A1A26] via-[#060E16] to-[#04080D] p-6">
            <img
              src={BRAND_LOGO_URL}
              alt="DR Resin"
              referrerPolicy="no-referrer"
              className="w-16 h-16 object-contain opacity-75 mb-2"
            />
            <span className="text-[11px] tracking-[0.18em] uppercase text-[#7C8C99]">
              {product.category}
            </span>
          </div>
        )}

        {/* Subtle bottom edge blend */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#07111A]/80 to-transparent" />

        {/* Category + Price top bar */}
        <div className="absolute top-2 inset-x-2 sm:top-3 sm:inset-x-3 flex items-center justify-between gap-1.5 sm:gap-2">
          <span className="text-[9px] sm:text-[11px] uppercase tracking-[0.12em] sm:tracking-[0.16em] text-[#B8D7E2] bg-[#050C14]/75 backdrop-blur-sm px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-cyan-300/20 truncate max-w-[52%]">
            {product.category}
          </span>
          <span className="tabular-nums text-[11px] sm:text-sm font-semibold text-white bg-[#050C14]/80 backdrop-blur-sm px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border border-cyan-300/25 whitespace-nowrap">
            {formatPriceUSD(product.price)}{' '}
            <span className="text-[9px] sm:text-[10px] font-normal text-[#9BA9B4]">USD</span>
          </span>
        </div>

        {/* Hover navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous product image"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#050C14]/80 border border-cyan-300/30 text-white flex items-center justify-center hover:border-cyan-300/70"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next product image"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#050C14]/80 border border-cyan-300/30 text-white flex items-center justify-center hover:border-cyan-300/70"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </>
        )}

        {/* Pagination dots */}
        {images.length > 1 && (
          <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`View image ${idx + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(idx);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  idx === activeIndex ? 'w-4 sm:w-5 bg-[#4CC9EA]' : 'w-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-3 sm:p-4 lg:p-4 flex-1 flex flex-col justify-between gap-3 bg-[#07111A]/90">
        <div>
          <h3 className="font-luxury-display text-sm sm:text-base font-medium tracking-[0.04em] text-[#F4F7F9] leading-snug line-clamp-1">
            {product.name}
          </h3>
          <p className="mt-1 sm:mt-1.5 text-xs sm:text-[13px] text-[#9BA9B4] leading-relaxed line-clamp-2 min-h-[2.25rem] sm:min-h-[2.5rem]">
            {product.description || 'Handcrafted natural wood and deep ocean epoxy resin piece.'}
          </p>
        </div>

        <div className="pt-2.5 sm:pt-3 border-t border-cyan-300/10 flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[#7C8C99]">
              Price
            </span>
            <div className="tabular-nums text-sm sm:text-base font-semibold text-white">
              {formatPriceUSD(product.price)}{' '}
              <span className="text-[10px] sm:text-xs font-medium text-[#7AD3EA]">USD</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className={`flex-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full text-[10px] sm:text-xs font-medium tracking-wider uppercase border transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
                justAdded
                  ? 'bg-emerald-950/70 border-emerald-400/60 text-emerald-200'
                  : 'bg-[#0C1D2A] border-cyan-300/30 text-[#D8EEF5] hover:border-cyan-300/70 hover:bg-[#112838]'
              }`}
            >
              {justAdded ? (
                <>
                  <span>Added</span>
                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </>
              ) : (
                <>
                  <span>Add</span>
                  <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleBuy}
              className="flex-1 ocean-pill-btn px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full text-[10px] sm:text-xs font-medium tracking-wider uppercase text-white flex items-center justify-center gap-1 whitespace-nowrap"
            >
              <span>Buy Now</span>
              <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#67D4F0]" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
