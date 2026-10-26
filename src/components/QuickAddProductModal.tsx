import React, { useEffect, useRef, useState } from 'react';
import { PackagePlus, X } from 'lucide-react';
import { InventoryItem, ItemExtras } from '../types';
import { CategoryPicker } from './CategoryPicker';

export type QuickAddHandler = (
  name: string,
  price: number,
  initialQuantity: number,
  unit: string,
  parentId?: string,
  piecesPerParent?: number,
  costPrice?: number,
  extras?: ItemExtras
) => Promise<boolean> | void;

interface QuickAddProductModalProps {
  items: InventoryItem[];
  /** Filled in when the modal opens from a search that found nothing */
  initialName?: string;
  initialBarcode?: string;
  /** Filled in when opened from a category button */
  initialCategory?: string;
  onAdd: QuickAddHandler;
  onClose: () => void;
}

const fieldClass =
  'w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm md:text-base font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors';
const labelClass = 'block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5';

/** A small form to add a product without leaving the POS screen. */
export function QuickAddProductModal({ items, initialName = '', initialBarcode = '', initialCategory = '', onAdd, onClose }: QuickAddProductModalProps) {
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode);
  const [category, setCategory] = useState(initialCategory);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  // Start typing right away: the name if it is empty, otherwise the price
  useEffect(() => {
    (initialName ? priceRef.current : nameRef.current)?.focus();
  }, [initialName]);

  // Remove the red message as soon as the person starts fixing the form
  useEffect(() => setError(''), [name, price, cost, stock, barcode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const priceNum = parseFloat(price);
  const costNum = parseFloat(cost);
  const profit = Number.isFinite(priceNum) && Number.isFinite(costNum) ? priceNum - costNum : null;
  const sameName = name.trim() && items.find((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
  const stockNum = stock === '' ? NaN : parseInt(stock, 10);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const cleanName = name.trim();
    const code = barcode.trim();
    if (!cleanName) return setError('Give the product a name.');
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setError('Enter the selling price (Benta).');
    if (cost !== '' && (!Number.isFinite(costNum) || costNum < 0)) return setError('Cost cannot be negative.');
    if (!Number.isFinite(stockNum) || stockNum < 0) return setError('Enter how many you have in stock.');
    const owner = code ? items.find((i) => i.barcode === code) : undefined;
    if (owner) return setError(`That barcode is already used by "${owner.name}".`);

    setError('');
    setSaving(true);
    const ok = await onAdd(cleanName, priceNum, stockNum, 'pcs', undefined, undefined, Number.isFinite(costNum) ? costNum : 0, {
      barcode: code || undefined,
      category: category.trim() || undefined,
    });
    setSaving(false);
    if (ok !== false) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !saving && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-auto"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0" aria-hidden="true">
              <PackagePlus className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 id="quick-add-title" className="text-base font-black text-slate-800">Add Product</h3>
              <p className="text-xs text-slate-600">Quick add. You can add a photo and more details later in Inventory.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div>
            <label htmlFor="qa-name" className={labelClass}>Product name</label>
            <input
              ref={nameRef}
              id="qa-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lucky Me Pancit Canton"
              className={fieldClass}
              autoComplete="off"
            />
            {sameName && (
              <p className="mt-1.5 text-xs font-semibold text-amber-700">You already have "{sameName.name}". Add it again only if it is a different product.</p>
            )}
          </div>

          <div>
            <label htmlFor="qa-category" className={labelClass}>
              Category <span className="normal-case font-medium text-slate-500">(optional)</span>
            </label>
            <CategoryPicker id="qa-category" value={category} onChange={setCategory} suggestFrom={name} />
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label htmlFor="qa-price" className={labelClass}>Sell price (Benta) ₱</label>
              <input
                ref={priceRef}
                id="qa-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="qa-cost" className={labelClass}>
                Cost (Puhunan) ₱ <span className="normal-case font-medium text-slate-500">(optional)</span>
              </label>
              <input
                id="qa-cost"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
                className={`${fieldClass} font-mono`}
              />
            </div>
          </div>

          {profit !== null && (
            <p className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {profit >= 0 ? `Profit: ₱${profit.toFixed(2)} each` : `Selling ₱${Math.abs(profit).toFixed(2)} below cost`}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label htmlFor="qa-stock" className={labelClass}>Stock on hand</label>
              <input
                id="qa-stock"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="e.g. 12"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="qa-barcode" className={labelClass}>
                Barcode <span className="normal-case font-medium text-slate-500">(optional)</span>
              </label>
              <input
                id="qa-barcode"
                type="text"
                inputMode="numeric"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type"
                className={`${fieldClass} font-mono`}
                autoComplete="off"
              />
            </div>
          </div>
          {stock === '0' && (
            <p className="text-xs font-semibold text-slate-600">With 0 stock the product stays hidden in POS until you add stock.</p>
          )}

          {error && (
            <p role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold shadow-xs transition-colors"
            >
              {saving ? 'Saving…' : 'Add Product'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
