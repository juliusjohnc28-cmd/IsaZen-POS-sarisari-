import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus, Trash2, ChevronDown, ChevronUp, ScanBarcode, Star, Pencil } from 'lucide-react';
import { InventoryItem, CartItem, Transaction } from '../types';
import { isLowStock } from '../utils/stock';
import { categoriesInUse, effectiveCategory } from '../utils/categories';
import { useCategories } from '../utils/CategoriesContext';
import { useToast } from './Toast';
import { PosEmptyState } from './PosEmptyState';
import { QuickAddProductModal, QuickAddHandler } from './QuickAddProductModal';
import { capsWhileTyping, normalizeName } from '../utils/names';
import { BarcodeScanner, ScanStatus, ScanStatusBar } from './BarcodeScanner';

interface PosSystemProps {
  items: InventoryItem[];
  transactions: Transaction[];
  onCheckout: (cart: CartItem[], cashReceived?: number) => void;
  onCheckoutUtang: (cart: CartItem[], customerName: string) => void;
  onToggleFavorite: (itemId: string) => void;
  onAddItem: QuickAddHandler;
  customers: string[];
}

// Soft colors for the letter tile shown when an item has no photo
const TILE_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];
const tileColor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
};

const QUICK_CASH = [20, 50, 100, 200, 500, 1000];

export function PosSystem({ items, transactions, onCheckout, onCheckoutUtang, onToggleFavorite, onAddItem, customers }: PosSystemProps) {
  const toast = useToast();
  const [cashReceived, setCashReceived] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Which shelf is open ('' = everything, '__none__' = products without a category)
  const [categoryFilter, setCategoryFilter] = useState('');
  // Quick-create modal (opened from the empty state)
  const [quickAdd, setQuickAdd] = useState<{ name: string; barcode: string; category: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isUtangMode, setIsUtangMode] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [isCartMinimized, setIsCartMinimized] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>(null);

  // How many of each item sold in the last 30 days, so the best sellers can be shown first
  const salesCount = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts: Record<string, number> = {};
    for (const t of transactions) {
      if ((t.type === 'OUT' || t.type === 'UTANG') && new Date(t.timestamp).getTime() >= since) {
        counts[t.itemId] = (counts[t.itemId] || 0) + t.quantity;
      }
    }
    return counts;
  }, [transactions]);

  const favoriteCount = items.filter(i => i.isFavorite).length;

  // Keep the chosen shelf button in view when the row of buttons is wider than the screen
  useEffect(() => {
    document.querySelector('[role=tab][aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [categoryFilter, favoritesOnly]);

  // Shown in POS when it has stock, OR when it's a sub-item and its parent has stock
  const isSellable = (item: InventoryItem): boolean => {
    if (item.quantity > 0) return true;
    if (item.parentId) {
      const parent = items.find(i => i.id === item.parentId);
      if (parent && parent.quantity > 0) return true;
    }
    return false;
  };

  // Category buttons: only shelves that have something to sell
  const sellable = items.filter(isSellable);
  const { names: categoryNames, openManager } = useCategories();
  const categoryChips = categoriesInUse(sellable, categoryNames);
  const noCategoryCount = sellable.filter(i => !effectiveCategory(i, items)).length;

  const filteredItems = items.filter(item => {
    if (favoritesOnly && !item.isFavorite) return false;
    const q = searchQuery.trim();
    // Searching looks through every shelf, so the category button never hides a match
    if (categoryFilter && !q) {
      const c = effectiveCategory(item, items);
      if (categoryFilter === '__none__' ? c : c !== categoryFilter) return false;
    }
    if (!item.name.toLowerCase().includes(q.toLowerCase()) && !(item.barcode && q && item.barcode.includes(q))) return false;
    return isSellable(item);
  }).sort((a, b) =>
    Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) ||
    (salesCount[b.id] || 0) - (salesCount[a.id] || 0) ||
    a.name.localeCompare(b.name)
  );

  const getMaxQuantity = (item: InventoryItem) => {
    let max = item.quantity;
    if (item.parentId && item.piecesPerParent) {
      const parent = items.find(i => i.id === item.parentId);
      if (parent) {
        max += (parent.quantity * item.piecesPerParent);
      }
    }
    return max;
  };

  const addToCart = (item: InventoryItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id);
      const maxQty = getMaxQuantity(item);

      if (existing) {
        if (existing.quantity < maxQty) {
          return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
        }
        return prev;
      }
      return maxQty > 0 ? [...prev, { item, quantity: 1 }] : prev;
    });
  };

  // Adds the item with this barcode to the cart. Used by the camera scanner and by handheld scanners typing into the search box.
  const addByBarcode = (code: string): ScanStatus => {
    const item = items.find((i) => i.barcode === code);
    if (!item) return { kind: 'error', text: `${code} isn't in your inventory.` };
    const inCart = cart.find((c) => c.item.id === item.id)?.quantity || 0;
    if (getMaxQuantity(item) - inCart <= 0) {
      return { kind: 'error', text: inCart > 0 ? `No more ${item.name} in stock (${inCart} in cart).` : `${item.name} is out of stock.` };
    }
    addToCart(item);
    return { kind: 'ok', text: `Added ${item.name} (${inCart + 1} in cart)` };
  };

  const handleScanCart = (code: string) => setScanStatus(addByBarcode(code));

  const updateCartQty = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(c => {
        if (c.item.id === itemId) {
          const newQty = c.quantity + delta;
          const maxQty = getMaxQuantity(c.item);
          if (newQty > 0 && newQty <= maxQty) {
            return { ...c, quantity: newQty };
          }
        }
        return c;
      }).filter(c => c.quantity > 0);
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(c => c.item.id !== itemId));
  };

  const total = cart.reduce((sum, c) => sum + (c.item.price * c.quantity), 0);
  const cartCount = cart.reduce((a, b) => a + b.quantity, 0);
  const cashNumber = parseFloat(cashReceived) || 0;
  const isShort = !isUtangMode && cashNumber > 0 && cashNumber < total - 0.001;
  // Only offer bills that can actually pay for this sale
  const quickCash = QUICK_CASH.filter(v => v >= total - 0.001 && v > 0).slice(0, 4);

  const handleCheckoutClick = () => {
    if (cart.length > 0) {
      if (isUtangMode) {
        if (!customerName.trim()) {
          toast.error('Please enter a customer name for Utang.');
          return;
        }
        onCheckoutUtang(cart, normalizeName(customerName));
        setCustomerName('');
        setIsUtangMode(false);
      } else {
        if (cashNumber > 0 && cashNumber < total) {
          toast.error(`Cash received is short by ₱${(total - cashNumber).toFixed(2)}.`);
          return;
        }
        onCheckout(cart, cashNumber > 0 ? cashNumber : undefined);
        setCashReceived('');
      }
      setCart([]);
    }
  };

  return (
    <div className="relative h-full">
      {/* Product List — full width; right padding on desktop reserves room for the floating cart */}
      <div className="h-full bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden md:mr-[25rem]">
        <div className="p-3.5 border-b border-slate-200 shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                // A handheld scanner types the code and presses Enter: if it matches a barcode, add it straight to the cart.
                if (e.key !== 'Enter') return;
                const code = searchQuery.trim();
                if (code && items.some(i => i.barcode === code)) {
                  e.preventDefault();
                  addByBarcode(code);
                  setSearchQuery('');
                }
              }}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm md:text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setScanStatus(null);
              setScanOpen(true);
            }}
            aria-label="Scan a barcode"
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
          >
            <ScanBarcode className="w-5 h-5" />
            <span className="hidden sm:inline">Scan</span>
          </button>
        </div>
        <div className="border-b border-slate-200 shrink-0 flex items-center">
        <div className="flex-1 min-w-0 pl-3.5 pr-2 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible" role="tablist" aria-label="Categories">
          {(() => {
            const chip = (active: boolean, activeClass: string) =>
              `shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold border transition-colors inline-flex items-center gap-1 ${
                active ? activeClass : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`;
            const allActive = !favoritesOnly && !categoryFilter;
            return (
              <>
                <button
                  type="button"
                  role="tab"
                  aria-selected={allActive}
                  onClick={() => {
                    setFavoritesOnly(false);
                    setCategoryFilter('');
                  }}
                  className={chip(allActive, 'bg-indigo-600 text-white border-indigo-600')}
                >
                  All
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={favoritesOnly}
                  onClick={() => {
                    setFavoritesOnly(true);
                    setCategoryFilter('');
                  }}
                  className={chip(favoritesOnly, 'bg-amber-500 text-white border-amber-500')}
                >
                  <Star className="w-3.5 h-3.5" fill={favoritesOnly ? 'currentColor' : 'none'} />
                  Favorites ({favoriteCount})
                </button>
                {categoryChips.map(c => (
                  <button
                    key={c.name}
                    type="button"
                    role="tab"
                    aria-selected={categoryFilter === c.name}
                    onClick={() => {
                      setFavoritesOnly(false);
                      setCategoryFilter(c.name);
                    }}
                    className={chip(categoryFilter === c.name, 'bg-indigo-600 text-white border-indigo-600')}
                  >
                    {c.name} ({c.count})
                  </button>
                ))}
                {categoryChips.length > 0 && noCategoryCount > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={categoryFilter === '__none__'}
                    onClick={() => {
                      setFavoritesOnly(false);
                      setCategoryFilter('__none__');
                    }}
                    className={chip(categoryFilter === '__none__', 'bg-slate-700 text-white border-slate-700')}
                  >
                    Others ({noCategoryCount})
                  </button>
                )}
              </>
            );
          })()}
        </div>
          <button
            type="button"
            onClick={openManager}
            aria-label="Manage categories"
            title="Add or rename categories"
            className="shrink-0 mr-3 min-h-[40px] px-3 inline-flex items-center gap-1.5 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs sm:text-sm font-bold transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Categories</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 content-start pb-24 md:pb-3.5">
          {filteredItems.map(item => {
            const inCart = cart.find(c => c.item.id === item.id)?.quantity || 0;
            const maxQty = getMaxQuantity(item);
            const remaining = maxQty - inCart;
            const isSubItem = Boolean(item.parentId && item.piecesPerParent);

            const low = remaining > 0 && isLowStock(item);

            return (
              <div key={item.id} className="relative">
                <button
                  onClick={() => addToCart(item)}
                  disabled={remaining <= 0}
                  className={`w-full text-left border rounded-xl p-3 transition-all flex flex-col h-28 sm:h-32 shadow-xs active:scale-98 ${remaining <= 0 ? 'border-slate-300 bg-slate-200/80 opacity-50 cursor-not-allowed' : 'border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/70 bg-slate-50'}`}
                >
                  <div className="flex items-start gap-2 pr-6">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-base font-black ${tileColor(item.name)}`}
                      >
                        {item.name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                    )}
                    <span className="font-bold text-sm sm:text-base text-slate-800 line-clamp-2 leading-snug">{item.name}</span>
                  </div>
                  <div className="mt-auto flex justify-between items-end w-full">
                    <span className="font-mono text-indigo-700 font-black text-sm sm:text-base">₱{item.price.toFixed(2)}</span>
                    <div className="flex flex-col items-end">
                      {low && (
                        <span className="text-[11px] font-black uppercase tracking-wide text-red-700 bg-red-100 rounded px-1.5 py-0.5 leading-none mb-0.5">Low</span>
                      )}
                      <span className="text-xs text-slate-600 font-bold">{remaining} {item.unit || (remaining === 1 ? 'pc' : 'pcs')}</span>
                      {isSubItem && (
                        <span className="text-[11px] text-indigo-600 font-semibold leading-none mt-0.5" title="Includes stock from parent items">incl. broken</span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(item.id)}
                  aria-label={item.isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
                  aria-pressed={Boolean(item.isFavorite)}
                  className={`absolute top-1 right-1 p-1.5 rounded-full transition-colors ${
                    item.isFavorite ? 'text-amber-500 hover:bg-amber-100' : 'text-slate-300 hover:text-amber-500 hover:bg-slate-200'
                  }`}
                >
                  <Star className="w-4 h-4" fill={item.isFavorite ? 'currentColor' : 'none'} />
                </button>
                {inCart > 0 && (
                  <div className="absolute -top-2 -left-2 bg-indigo-600 text-white text-xs font-black px-2 py-0.5 min-w-[24px] h-6 flex items-center justify-center rounded-full shadow-md border-2 border-white pointer-events-none">
                    {inCart}
                  </div>
                )}
              </div>
            );
          })}
          {filteredItems.length === 0 && (
            <PosEmptyState
              reason={items.length === 0 ? 'no-inventory' : favoritesOnly && favoriteCount === 0 && !searchQuery.trim() ? 'no-favorites' : 'no-match'}
              searchQuery={searchQuery}
              onAddProduct={() => {
                // A typed number is most likely a barcode from a handheld scanner; anything else is a name
                const q = searchQuery.trim();
                const isCode = /^\d{6,}$/.test(q);
                setQuickAdd({ name: isCode ? '' : q, barcode: isCode ? q : '', // An open shelf pre-selects its category, but only when nothing was typed (a typed name gets its own guess)
                  category: !q && categoryFilter && categoryFilter !== '__none__' ? categoryFilter : '' });
              }}
              onShowAll={() => {
                setSearchQuery('');
                setFavoritesOnly(false);
                setCategoryFilter('');
              }}
            />
          )}
        </div>
      </div>

      {/* Cart — a bottom sheet on phones; on desktop it sits inside the POS layout, right next to the product list. */}
      {isCartMinimized ? (
        <button
          onClick={() => setIsCartMinimized(false)}
          className={`${cart.length === 0 ? 'max-md:hidden ' : ''}fixed z-40 bottom-[calc(var(--bottom-nav-h)+0.75rem)] md:bottom-4 right-4 md:right-6 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white pl-4 pr-3 py-3 rounded-full shadow-2xl transition-colors active:scale-95`}
        >
          <span className="font-bold text-sm whitespace-nowrap">
            View Cart{cart.length > 0 ? ` (${cartCount}) · ₱${total.toFixed(2)}` : ''}
          </span>
          <ChevronUp className="w-4 h-4" />
        </button>
      ) : (
        <div className={`${cart.length === 0 ? 'max-md:hidden ' : ''}fixed z-40 inset-x-0 bottom-[var(--bottom-nav-h)] rounded-t-2xl max-h-[70dvh] md:absolute md:z-10 md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-96 md:max-h-none md:rounded-xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden`}>
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 shrink-0 flex justify-between items-center">
            <h2 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-wider flex items-center gap-2">
              <span>Current Sale</span>
              <span className="text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full text-xs font-bold">
                {cartCount} items
              </span>
            </h2>
            <button
              onClick={() => setIsCartMinimized(true)}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
              title="Minimize Cart"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-3 bg-slate-50/50">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm md:text-base font-semibold">
                Cart is empty
              </div>
            ) : (
              <ul className="space-y-2.5">
                {cart.map(c => (
                  <li key={c.item.id} className="border border-slate-200 rounded-xl p-2.5 bg-white flex flex-col gap-2 shadow-xs">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-xs sm:text-sm text-slate-800 leading-tight">{c.item.name}</span>
                      <span className="font-mono font-bold text-xs sm:text-sm text-indigo-700 whitespace-nowrap ml-2">₱{(c.item.price * c.quantity).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-slate-50 p-1">
                        <button onClick={() => updateCartQty(c.item.id, -1)} className="w-7 h-7 flex items-center justify-center hover:bg-slate-200 rounded-md text-slate-700 transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-mono font-bold w-8 text-center">{c.quantity}</span>
                        <button onClick={() => updateCartQty(c.item.id, 1)} disabled={c.quantity >= getMaxQuantity(c.item)} className="w-7 h-7 flex items-center justify-center hover:bg-slate-200 rounded-md text-slate-700 disabled:opacity-30 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button onClick={() => removeFromCart(c.item.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 bg-white border-t border-slate-200 shrink-0">
            <div className="flex justify-between items-end mb-4">
              <span className="text-xs md:text-sm font-bold text-slate-600 uppercase tracking-wider">Total Due</span>
              <span className="text-2xl md:text-3xl font-black text-indigo-700 leading-none">₱{total.toFixed(2)}</span>
            </div>

            {!isUtangMode && cart.length > 0 && (
              <div className="mb-3">
                <label htmlFor="cash-received" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Cash received <span className="normal-case font-medium text-slate-600">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 font-bold">₱</span>
                  <input
                    id="cash-received"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setCashReceived(total.toFixed(2))}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs sm:text-sm font-bold transition-colors"
                  >
                    Exact
                  </button>
                  {quickCash.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCashReceived(String(v))}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs sm:text-sm font-bold transition-colors"
                    >
                      ₱{v}
                    </button>
                  ))}
                </div>
                {cashNumber > 0 && (
                  <div
                    role="status"
                    className={`mt-2.5 flex justify-between items-baseline rounded-xl px-3.5 py-2.5 border ${
                      isShort ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}
                  >
                    <span className="text-xs sm:text-sm font-bold uppercase tracking-wider">{isShort ? 'Short by' : 'Change'}</span>
                    <span className="text-xl sm:text-2xl font-black font-mono">₱{Math.abs(cashNumber - total).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="flex items-center space-x-2.5 text-sm md:text-base text-slate-800 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={isUtangMode}
                  onChange={(e) => setIsUtangMode(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-bold">Charge to Utang</span>
              </label>

              {isUtangMode && (
                <>
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(capsWhileTyping(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm md:text-base font-medium uppercase focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                    list="registeredCustomers"
                    autoFocus
                  />
                  <datalist id="registeredCustomers">
                    {Array.from(new Set(customers.map(normalizeName))).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </>
              )}
            </div>

            <button
              onClick={handleCheckoutClick}
              disabled={cart.length === 0 || isShort}
              className={`w-full ${isUtangMode ? 'bg-amber-700 hover:bg-amber-800' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm sm:text-base py-3.5 rounded-xl shadow-sm transition-colors active:scale-98`}
            >
              {isUtangMode ? 'Record Utang' : 'Complete Sale'}
            </button>
          </div>
        </div>
      )}

      {scanOpen && (
        <BarcodeScanner
          title="Scan to add to cart"
          closeLabel="Done"
          onDetect={handleScanCart}
          onClose={() => setScanOpen(false)}
        >
          <ScanStatusBar status={scanStatus} />
          <p className="text-xs font-bold text-slate-600 text-center">
            Cart: {cartCount} {cartCount === 1 ? 'item' : 'items'} · ₱{total.toFixed(2)}
          </p>
        </BarcodeScanner>
      )}

      {quickAdd && (
        <QuickAddProductModal
          items={items}
          initialName={quickAdd.name}
          initialBarcode={quickAdd.barcode}
          initialCategory={quickAdd.category}
          onAdd={(...args) => {
            setSearchQuery('');
            return onAddItem(...args);
          }}
          onClose={() => setQuickAdd(null)}
        />
      )}
    </div>
  );
}
