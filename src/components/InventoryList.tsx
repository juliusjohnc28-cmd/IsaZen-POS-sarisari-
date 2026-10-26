import React, { useRef, useState } from 'react';
import { Package, PlusCircle, Search, Trash2, X, Boxes, PackagePlus, Pencil, ImagePlus, ImageOff, ScanBarcode, ClipboardList, Minus, Plus, Copy, AlertTriangle } from 'lucide-react';
import { InventoryItem, ItemExtras } from '../types';
import { daysUntilExpiry, isExpiringSoon, isLowStock, lowLevel } from '../utils/stock';
import { useToast } from './Toast';
import { resizeImageFile } from '../utils/image';
import { CategoryPicker } from './CategoryPicker';
import { categoriesInUse, effectiveCategory } from '../utils/categories';
import { useCategories } from '../utils/CategoriesContext';
import { BarcodeScanner, ScanStatus, ScanStatusBar } from './BarcodeScanner';

interface InventoryListProps {
  items: InventoryItem[];
  stockFilter: 'all' | 'low' | 'expiring';
  onStockFilterChange: (filter: 'all' | 'low' | 'expiring') => void;
  expiringCount: number;
  onAddItem: (name: string, price: number, initialQuantity: number, unit: string, parentId?: string, piecesPerParent?: number, costPrice?: number, extras?: ItemExtras) => void;
  onTransaction: (itemId: string, type: 'IN' | 'OUT', quantity: number) => Promise<boolean> | void;
  onUpdateItem: (itemId: string, newQuantity: number, newPrice: number, newCostPrice?: number) => void;
  onUpdateItemDetails: (itemId: string, details: ItemExtras & { name: string; imageUrl?: string }) => void;
  /** Give many products a category at once (Auto-sort) */
  onBulkCategory: (updates: { id: string; category: string }[]) => Promise<boolean> | void;
  onDeleteItem: (itemId: string) => void;
}

const UNIT_OPTIONS = ['pcs', 'pack', 'box', 'rim', 'bottle', 'sack'];

export function InventoryList({ items, onAddItem, onTransaction, onUpdateItem, onUpdateItemDetails, onDeleteItem, stockFilter, onStockFilterChange, expiringCount, onBulkCategory }: InventoryListProps) {
  const toast = useToast();
  // ----- Add Item modal state -----
  const [showAddModal, setShowAddModal] = useState(false);
  const [itemKind, setItemKind] = useState<'whole' | 'sub'>('whole');

  const [newItemName, setNewItemName] = useState('');
  const [newItemCostPrice, setNewItemCostPrice] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('pcs');
  const [newItemBarcode, setNewItemBarcode] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemLowLevel, setNewItemLowLevel] = useState('');
  const [newItemExpiry, setNewItemExpiry] = useState('');

  const [subItemParentId, setSubItemParentId] = useState('');
  const [subItemPieces, setSubItemPieces] = useState('');

  const [formError, setFormError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>('');
  const [editCostPrice, setEditCostPrice] = useState<string>('');
  const [editPrice, setEditPrice] = useState<string>('');

  // ----- Edit Item Details modal state (name + picture) -----
  const [editingDetailsItem, setEditingDetailsItem] = useState<InventoryItem | null>(null);
  const [detailsName, setDetailsName] = useState('');
  const [detailsImageUrl, setDetailsImageUrl] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const [detailsImageLoading, setDetailsImageLoading] = useState(false);
  const detailsFileInputRef = useRef<HTMLInputElement>(null);
  const [detailsBarcode, setDetailsBarcode] = useState('');
  const [detailsCategory, setDetailsCategory] = useState('');
  const [detailsLowLevel, setDetailsLowLevel] = useState('');
  const [detailsExpiry, setDetailsExpiry] = useState('');

  // ----- Barcode scanning -----
  // scanMode: the stock scanner (Scan In / Scan Out) is open. scanTarget: a one-shot scan to fill a barcode field in a form.
  const [scanMode, setScanMode] = useState<'IN' | 'OUT' | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [linkItemId, setLinkItemId] = useState('');
  const [scanTarget, setScanTarget] = useState<'add' | 'details' | null>(null);
  const [scanQty, setScanQty] = useState(1);

  // Category filter ('' = all, '__none__' = products without a category) and the Auto-sort banner
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBannerHidden, setSortBannerHidden] = useState(false);

  // Shopping list of low stock items
  const [showShopping, setShowShopping] = useState(false);
  const [shoppingSort, setShoppingSort] = useState<'urgent' | 'name'>('urgent');
  const [boughtIds, setBoughtIds] = useState<string[]>([]);

  const openEditDetails = (item: InventoryItem) => {
    setEditingDetailsItem(item);
    setDetailsName(item.name);
    setDetailsImageUrl(item.imageUrl ?? '');
    setDetailsBarcode(item.barcode ?? '');
    setDetailsCategory(item.category ?? '');
    setDetailsLowLevel(item.lowStockLevel !== undefined ? String(item.lowStockLevel) : '');
    setDetailsExpiry(item.expiryDate ?? '');
    setDetailsError('');
  };

  const closeEditDetails = () => {
    setEditingDetailsItem(null);
    setDetailsName('');
    setDetailsImageUrl('');
    setDetailsBarcode('');
    setDetailsCategory('');
    setDetailsLowLevel('');
    setDetailsExpiry('');
    setDetailsError('');
    setDetailsImageLoading(false);
  };

  const handleDetailsImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDetailsError('');
    setDetailsImageLoading(true);
    try {
      const dataUrl = await resizeImageFile(file);
      setDetailsImageUrl(dataUrl);
    } catch (err: any) {
      setDetailsError(err?.message ?? 'Could not process that image.');
    } finally {
      setDetailsImageLoading(false);
    }
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDetailsItem) return;
    if (!detailsName.trim()) {
      setDetailsError('Give the item a name first.');
      return;
    }
    const level = parseInt(detailsLowLevel, 10);
    onUpdateItemDetails(editingDetailsItem.id, {
      name: detailsName.trim(),
      imageUrl: detailsImageUrl || undefined,
      barcode: detailsBarcode.trim() || undefined,
      category: detailsCategory.trim() || undefined,
      lowStockLevel: Number.isFinite(level) && level >= 0 ? level : undefined,
      expiryDate: detailsExpiry || undefined,
    });
    closeEditDetails();
  };

  const lowStockList = items.filter(isLowStock);
  const matchesSearch = (item: InventoryItem) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.barcode ?? '').includes(searchQuery.trim());

  const filteredItems = items
    .filter(matchesSearch)
    .filter(item => {
      if (!categoryFilter) return true;
      const c = effectiveCategory(item, items);
      return categoryFilter === '__none__' ? !c : c === categoryFilter;
    })
    .filter(item => stockFilter === 'all' || (stockFilter === 'low' ? isLowStock(item) : isExpiringSoon(item)))
    .sort((a, b) =>
      stockFilter === 'low'
        ? a.quantity - b.quantity || a.name.localeCompare(b.name)
        : stockFilter === 'expiring'
        ? (daysUntilExpiry(a) ?? 0) - (daysUntilExpiry(b) ?? 0)
        : 0
    );

  const shoppingItems = [...lowStockList].sort((a, b) =>
    shoppingSort === 'urgent' ? a.quantity - b.quantity || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)
  );

  // ----- Categories: counts for the filter, and Auto-sort for products that have none yet -----
  const { names: categoryNames, guess: guessCategory, openManager } = useCategories();
  const categoryList = categoriesInUse(items, categoryNames);
  const noCategoryCount = items.filter(i => !effectiveCategory(i, items)).length;
  const sortable = items
    .filter(i => !effectiveCategory(i, items) && !i.parentId)
    .map(i => ({ id: i.id, category: guessCategory(i.name) }))
    .filter((x): x is { id: string; category: string } => Boolean(x.category));

  const handleAutoSort = async () => {
    const counts = new Map<string, number>();
    sortable.forEach(x => counts.set(x.category, (counts.get(x.category) ?? 0) + 1));
    const summary = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, n]) => `${name} ${n}`)
      .join(', ');
    const ok = await toast.confirm({
      title: `Sort ${sortable.length} of ${noCategoryCount} products?`,
      message: `${summary}${counts.size > 6 ? ' and more' : ''}. It's a guess from each product's name, so you can change any of them later. Products it can't guess stay without a category.`,
      confirmLabel: 'Sort them',
    });
    if (ok) await onBulkCategory(sortable);
  };

  const copyShoppingList = async () => {
    const lines = shoppingItems
      .filter(i => !boughtIds.includes(i.id))
      .map(i => `- ${i.name}: ${i.quantity} left (alert at ${lowLevel(i)})`);
    if (lines.length === 0) {
      toast.info('Everything on the list is ticked off.');
      return;
    }
    const text = `Shopping list\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Shopping list copied');
    } catch {
      toast.error("Couldn't copy. Select the list and copy it by hand.");
    }
  };

  const handleModifyClick = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setEditQuantity(item.quantity.toString());

    const parentItem = item.parentId ? items.find(i => i.id === item.parentId) : null;
    const computedCost = (item.parentId && item.piecesPerParent && parentItem && parentItem.costPrice)
      ? (parentItem.costPrice / item.piecesPerParent)
      : (item.costPrice ?? 0);

    setEditCostPrice(computedCost.toFixed(2));
    setEditPrice(item.price.toString());
  };

  const handleSaveModify = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    const parsedQuantity = parseInt(editQuantity, 10);
    const parsedPrice = parseFloat(editPrice);
    const parsedCostPrice = parseFloat(editCostPrice);

    if (!isNaN(parsedPrice) && parsedPrice >= 0) {
      onUpdateItem(
        itemId,
        item?.parentId ? item.quantity : (!isNaN(parsedQuantity) && parsedQuantity >= 0 ? parsedQuantity : 0),
        parsedPrice,
        !isNaN(parsedCostPrice) && parsedCostPrice >= 0 ? parsedCostPrice : 0
      );
    }
    setEditingItemId(null);
  };

  const resetAddForm = () => {
    setItemKind('whole');
    setNewItemName('');
    setNewItemCostPrice('');
    setNewItemPrice('');
    setNewItemQuantity('');
    setNewItemUnit('pcs');
    setNewItemBarcode('');
    setNewItemCategory('');
    setNewItemLowLevel('');
    setNewItemExpiry('');
    setSubItemParentId('');
    setSubItemPieces('');
    setFormError('');
  };

  const openAddModal = (prefillBarcode?: string) => {
    resetAddForm();
    if (prefillBarcode) setNewItemBarcode(prefillBarcode);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    resetAddForm();
  };

  // Auto computed cost price for sub-item entry (e.g. 1 stick from a pack)
  const parentForForm = itemKind === 'sub' && subItemParentId ? items.find(i => i.id === subItemParentId) : null;
  const autoCostForForm = (parentForForm && parentForForm.costPrice && subItemPieces && parseInt(subItemPieces, 10) > 0)
    ? (parentForForm.costPrice / parseInt(subItemPieces, 10))
    : 0;

  const effectiveCost = newItemCostPrice
    ? parseFloat(newItemCostPrice) || 0
    : autoCostForForm;
  const effectivePrice = parseFloat(newItemPrice) || 0;
  const previewProfit = effectivePrice - effectiveCost;
  const previewMargin = effectiveCost > 0 ? (previewProfit / effectiveCost) * 100 : null;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newItemName.trim()) {
      setFormError('Give the item a name first.');
      return;
    }
    if (!newItemPrice || parseFloat(newItemPrice) < 0) {
      setFormError('Enter a valid selling price.');
      return;
    }
    if (itemKind === 'whole' && (!newItemQuantity || parseInt(newItemQuantity, 10) < 0)) {
      setFormError('Enter how many you have in stock.');
      return;
    }
    if (itemKind === 'sub' && !subItemParentId) {
      setFormError('Choose which item this piece comes from.');
      return;
    }
    if (itemKind === 'sub' && (!subItemPieces || parseInt(subItemPieces, 10) <= 0)) {
      setFormError('Enter how many pieces are in one whole unit.');
      return;
    }

    let finalCostPrice = newItemCostPrice ? parseFloat(newItemCostPrice) : 0;

    // Auto compute cost price from the parent item when adding a sub-item
    if (itemKind === 'sub' && subItemParentId && subItemPieces) {
      const parentItem = items.find(i => i.id === subItemParentId);
      const pieces = parseInt(subItemPieces, 10);
      if (parentItem && parentItem.costPrice && pieces > 0 && (!newItemCostPrice || parseFloat(newItemCostPrice) === 0)) {
        finalCostPrice = parentItem.costPrice / pieces;
      }
    }

    onAddItem(
      newItemName.trim(),
      parseFloat(newItemPrice),
      itemKind === 'sub' ? 0 : parseInt(newItemQuantity, 10),
      newItemUnit,
      itemKind === 'sub' && subItemParentId ? subItemParentId : undefined,
      itemKind === 'sub' && subItemPieces ? parseInt(subItemPieces, 10) : undefined,
      finalCostPrice,
      {
        // A single piece from a pack uses the pack's category
        category: itemKind === 'whole' ? newItemCategory.trim() || undefined : items.find(i => i.id === subItemParentId)?.category,
        barcode: newItemBarcode.trim() || undefined,
        lowStockLevel: itemKind === 'whole' && newItemLowLevel !== '' && parseInt(newItemLowLevel, 10) >= 0 ? parseInt(newItemLowLevel, 10) : undefined,
        expiryDate: itemKind === 'whole' && newItemExpiry ? newItemExpiry : undefined,
      }
    );

    closeAddModal();
  };

  // ----- Scan In / Scan Out -----
  const closeStockScanner = () => {
    setScanMode(null);
    setScanStatus(null);
    setUnknownCode(null);
    setLinkItemId('');
  };

  const handleScanStock = async (code: string) => {
    if (!scanMode) return;
    setUnknownCode(null);
    const item = items.find((i) => i.barcode === code);
    if (!item) {
      setUnknownCode(code);
      setLinkItemId('');
      setScanStatus({ kind: 'info', text: `${code} isn't in your inventory yet.` });
      return;
    }
    if (scanMode === 'OUT' && item.quantity < scanQty) {
      setScanStatus({
        kind: 'error',
        text: item.quantity < 1 ? `${item.name} has no stock left to take out.` : `${item.name} only has ${item.quantity} left (you set ${scanQty} per scan).`,
      });
      return;
    }
    const ok = await onTransaction(item.id, scanMode, scanQty);
    if (ok === false) {
      setScanStatus({ kind: 'error', text: `Couldn't save ${item.name}. Try again.` });
      return;
    }
    const after = item.quantity + (scanMode === 'IN' ? scanQty : -scanQty);
    setScanStatus({
      kind: 'ok',
      text: `${scanMode === 'IN' ? 'Stock in' : 'Stock out'} ${scanQty > 1 ? `×${scanQty} ` : ''}· ${item.name} (now ${after} ${item.unit || 'pcs'})`,
    });
  };

  const handleLinkBarcode = () => {
    const target = items.find((i) => i.id === linkItemId);
    if (!target || !unknownCode) return;
    onUpdateItemDetails(target.id, {
      name: target.name,
      imageUrl: target.imageUrl,
      barcode: unknownCode,
      category: target.category,
      lowStockLevel: target.lowStockLevel,
      expiryDate: target.expiryDate,
    });
    setScanStatus({ kind: 'ok', text: `Linked to ${target.name}. Scan it again to count it.` });
    setUnknownCode(null);
    setLinkItemId('');
  };

  const addFromScan = () => {
    const code = unknownCode;
    closeStockScanner();
    if (code) openAddModal(code);
  };

  const unlinkedItems = items
    .filter((i) => !i.barcode)
    .sort((a, b) => a.name.localeCompare(b.name));

  // One-shot scan that fills the barcode field in the Add / Edit forms
  const handleScanIntoForm = (code: string) => {
    const owner = items.find((i) => i.barcode === code && i.id !== editingDetailsItem?.id);
    if (scanTarget === 'add') {
      if (owner) setFormError(`That barcode is already used by "${owner.name}".`);
      else {
        setFormError('');
        setNewItemBarcode(code);
      }
    } else if (scanTarget === 'details') {
      if (owner) setDetailsError(`That barcode is already used by "${owner.name}".`);
      else {
        setDetailsError('');
        setDetailsBarcode(code);
      }
    }
    setScanTarget(null);
  };

  // Calculate inventory valuation totals
  const totalCostValuation = items.reduce((sum, item) => {
    const parentItem = item.parentId ? items.find(i => i.id === item.parentId) : null;
    const cost = (item.parentId && item.piecesPerParent && parentItem && parentItem.costPrice)
      ? (parentItem.costPrice / item.piecesPerParent)
      : (item.costPrice ?? 0);
    return sum + (cost * item.quantity);
  }, 0);

  const totalSellingValuation = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalPotentialProfit = totalSellingValuation - totalCostValuation;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Search & Valuation Summary Bar */}
      <div className="p-2.5 md:p-3 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between shrink-0 gap-2 md:gap-3">
        <div className="relative w-full sm:max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <Search className="h-3.5 w-3.5 md:h-4 md:w-4 text-slate-500" />
          </div>
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2.5 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Valuation Pills */}
          <div className="flex items-center gap-2 text-xs overflow-x-auto pb-1 sm:pb-0" tabIndex={0} role="group" aria-label="Inventory totals">
            <div className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg flex flex-col whitespace-nowrap shadow-2xs">
              <span className="text-[11px] sm:text-[11px] text-slate-600 font-bold uppercase">Total Capital</span>
              <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm">₱{totalCostValuation.toFixed(2)}</span>
            </div>
            <div className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg flex flex-col whitespace-nowrap shadow-2xs">
              <span className="text-[11px] sm:text-[11px] text-indigo-600 font-bold uppercase">Total Value</span>
              <span className="font-mono font-bold text-indigo-700 text-xs sm:text-sm">₱{totalSellingValuation.toFixed(2)}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex flex-col whitespace-nowrap shadow-2xs">
              <span className="text-[11px] sm:text-[11px] text-emerald-700 font-bold uppercase">Potential Profit</span>
              <span className="font-mono font-bold text-emerald-800 text-xs sm:text-sm">₱{totalPotentialProfit.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => {
              setScanStatus(null);
              setScanQty(1);
              setScanMode('IN');
            }}
            className="shrink-0 inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold shadow-xs transition-colors whitespace-nowrap"
          >
            <ScanBarcode className="w-4 h-4" />
            Scan
          </button>

          <button
            onClick={() => openAddModal()}
            className="shrink-0 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold shadow-xs transition-colors whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            Add New Item
          </button>
        </div>
      </div>

      {sortable.length > 0 && !sortBannerHidden && (
        <div className="px-3 sm:px-4 py-2.5 border-b border-indigo-200 bg-indigo-50 flex items-center gap-2 flex-wrap shrink-0">
          <p className="text-xs sm:text-sm font-semibold text-indigo-800 flex-1 min-w-[180px]">
            {noCategoryCount} {noCategoryCount === 1 ? 'product has' : 'products have'} no category. Sort them like store shelves?
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setSortBannerHidden(true)}
              className="min-h-[40px] px-3 rounded-lg text-indigo-700 hover:bg-indigo-100 text-xs sm:text-sm font-bold transition-colors"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleAutoSort}
              className="min-h-[40px] px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
            >
              Auto-sort
            </button>
          </div>
        </div>
      )}

      <div className="px-3 sm:px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2 flex-wrap shrink-0">
        {([
          ['all', `All (${items.length})`],
          ['low', `Low stock (${lowStockList.length})`],
          ['expiring', `Expiring soon (${expiringCount})`],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onStockFilterChange(value)}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold border transition-colors ${
              stockFilter === value
                ? value === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : value === 'low'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={openManager}
          aria-label="Manage categories"
          className="min-h-[40px] px-3 inline-flex items-center gap-1.5 rounded-full text-xs sm:text-sm font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Categories
        </button>
        {(categoryList.length > 0 || noCategoryCount > 0) && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="px-3 rounded-full text-xs sm:text-sm font-bold border border-slate-300 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All categories</option>
            {categoryList.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
            {noCategoryCount > 0 && <option value="__none__">No category ({noCategoryCount})</option>}
          </select>
        )}
        {lowStockList.length > 0 && (
          <button
            type="button"
            onClick={() => setShowShopping(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            Shopping list
          </button>
        )}
      </div>

      {/* Phone layout: one card per item, with big buttons (the wide table below is for tablets and computers) */}
      <div className="md:hidden overflow-auto flex-grow p-3 space-y-3" tabIndex={0} role="region" aria-label="Product list">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-slate-600 py-10">
            <Package className="w-8 h-8" />
            <p className="text-sm font-semibold text-center">
              {items.length === 0 ? 'No items in inventory yet.' : 'No items found matching your search.'}
            </p>
            {items.length === 0 && (
              <button
                onClick={() => openAddModal()}
                className="mt-1 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-xs transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Add your first item
              </button>
            )}
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSubItem = Boolean(item.parentId && item.piecesPerParent);
            const parentItem = isSubItem ? items.find(i => i.id === item.parentId) : null;
            const cost = (isSubItem && parentItem && parentItem.costPrice)
              ? (parentItem.costPrice / item.piecesPerParent!)
              : (item.costPrice ?? 0);
            const profit = item.price - cost;
            const marginPercent = cost > 0 ? ((profit / cost) * 100).toFixed(0) : '0';
            const editing = editingItemId === item.id;
            const low = isLowStock(item);
            const days = daysUntilExpiry(item);
            const stockNow = isSubItem
              ? item.quantity + ((parentItem?.quantity || 0) * item.piecesPerParent!)
              : item.quantity;
            const childItem = !item.parentId ? items.find(i => i.parentId === item.id) : undefined;
            const totalPieces = childItem && childItem.piecesPerParent
              ? (item.quantity * childItem.piecesPerParent) + childItem.quantity
              : null;

            return (
              <div
                key={item.id}
                className={`rounded-xl border shadow-sm bg-white ${low ? 'border-red-200' : 'border-slate-200'}`}
              >
                <div className="p-3 flex items-start gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-slate-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base text-slate-800 leading-snug break-words">{item.name}</div>
                    {effectiveCategory(item, items) && (
                      <div className="text-xs font-semibold text-slate-600 mt-0.5">
                        {effectiveCategory(item, items)}
                      </div>
                    )}
                    {item.barcode && (
                      <div className="text-xs text-slate-600 font-mono mt-0.5 flex items-center gap-1 break-all">
                        <ScanBarcode className="w-3 h-3 shrink-0" />
                        {item.barcode}
                      </div>
                    )}
                    {days !== undefined && days <= 14 && (
                      <div
                        className={`inline-flex items-center gap-1 mt-1 text-xs font-bold rounded px-1.5 py-0.5 ${
                          days < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {days < 0 ? 'Expired' : days === 0 ? 'Expires today' : `Expires in ${days} ${days === 1 ? 'day' : 'days'}`}
                      </div>
                    )}
                    {isSubItem && (
                      <div className="text-xs text-indigo-600 font-semibold mt-0.5">
                        {item.piecesPerParent} {item.unit || 'pcs'} / {parentItem?.name || 'Parent'}
                      </div>
                    )}
                  </div>
                  {!editing && (
                    <div className="text-right shrink-0">
                      <div className={`text-2xl font-black font-mono leading-none ${low ? 'text-red-600' : 'text-slate-800'}`}>{stockNow}</div>
                      <div className="text-xs font-semibold text-slate-600 mt-1">
                        {item.unit || (stockNow === 1 ? 'pc' : 'pcs')}
                        {totalPieces !== null && <span className="ml-1">({totalPieces})</span>}
                      </div>
                      {low && (
                        <span className="inline-block mt-1 text-[11px] font-black uppercase tracking-wide text-red-700 bg-red-100 rounded px-1.5 py-0.5 leading-none">
                          Low
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {editing ? (
                  <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Stock</span>
                      {isSubItem ? (
                        <span className="text-xs font-bold text-indigo-600 py-2.5">Auto from {parentItem?.name || 'parent'}</span>
                      ) : (
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="w-full px-2 py-2 border border-slate-300 rounded-lg text-base font-bold font-mono"
                          autoFocus
                        />
                      )}
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Puhunan ₱</span>
                      {isSubItem ? (
                        <span className="text-xs font-bold text-indigo-600 py-2.5">Auto ₱{cost.toFixed(2)}</span>
                      ) : (
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={editCostPrice}
                          onChange={(e) => setEditCostPrice(e.target.value)}
                          className="w-full px-2 py-2 border border-slate-300 rounded-lg text-base font-bold font-mono"
                        />
                      )}
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Benta ₱</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-full px-2 py-2 border border-slate-300 rounded-lg text-base font-bold font-mono"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Puhunan</div>
                      <div className="font-mono font-bold text-sm text-slate-700">₱{cost.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Benta</div>
                      <div className="font-mono font-bold text-sm text-indigo-700">₱{item.price.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Profit</div>
                      <div className={`font-mono font-bold text-sm ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {profit >= 0 ? '+' : ''}₱{profit.toFixed(2)}
                      </div>
                      {cost > 0 && <div className="text-[11px] font-semibold text-slate-600">{marginPercent}%</div>}
                    </div>
                  </div>
                )}

                {editing ? (
                  <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                    <button
                      onClick={() => setEditingItemId(null)}
                      className="min-h-[44px] bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveModify(item.id)}
                      className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-lg shadow-xs transition-colors"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 px-3 pb-3">
                    <button
                      onClick={() => onTransaction(item.id, 'IN', 1)}
                      className="min-h-[44px] px-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 transition-colors"
                    >
                      + Stock
                    </button>
                    <button
                      onClick={() => handleModifyClick(item)}
                      className="min-h-[44px] px-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold border border-amber-200 transition-colors"
                    >
                      Modify
                    </button>
                    <button
                      onClick={() => openEditDetails(item)}
                      className="min-h-[44px] px-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 transition-colors inline-flex items-center justify-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await toast.confirm({
                          title: `Delete ${item.name}?`,
                          message: 'This removes it from your inventory. It cannot be undone.',
                          confirmLabel: 'Delete',
                          danger: true,
                        });
                        if (ok) onDeleteItem(item.id);
                      }}
                      aria-label={`Delete ${item.name}`}
                      className="min-h-[44px] px-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold border border-rose-200 transition-colors inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block overflow-auto flex-grow" tabIndex={0} role="region" aria-label="Product table">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="p-2 md:p-2.5 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider">Item Name</th>
              <th className="p-2 md:p-2.5 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider">Current Stock</th>
              <th className="p-2 md:p-2.5 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Cost (Puhunan)</th>
              <th className="p-2 md:p-2.5 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Sell Price (Benta)</th>
              <th className="p-2 md:p-2.5 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider text-right hidden md:table-cell">Profit / Unit</th>
              <th className="p-2 md:p-2.5 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Package className="w-8 h-8" />
                    <p className="text-xs sm:text-sm font-semibold">
                      {items.length === 0 ? 'No items in inventory yet.' : 'No items found matching your search.'}
                    </p>
                    {items.length === 0 && (
                      <button
                        onClick={() => openAddModal()}
                        className="mt-1 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Add your first item
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isSubItem = Boolean(item.parentId && item.piecesPerParent);
                const parentItem = isSubItem ? items.find(i => i.id === item.parentId) : null;
                const cost = (isSubItem && parentItem && parentItem.costPrice)
                  ? (parentItem.costPrice / item.piecesPerParent!)
                  : (item.costPrice ?? 0);
                const profit = item.price - cost;
                const marginPercent = cost > 0 ? ((profit / cost) * 100).toFixed(0) : '0';

                return (
                  <tr key={item.id} className={`hover:bg-slate-50 ${isLowStock(item) ? 'bg-red-50/40' : ''}`}>
                    <td className="p-2 md:p-2.5">
                      <div className="flex items-center gap-2.5">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-slate-300" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-xs sm:text-sm text-slate-800">{item.name}</div>
                          {effectiveCategory(item, items) && (
                            <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-0.5">
                              {effectiveCategory(item, items)}
                            </div>
                          )}
                          {item.barcode && (
                            <div className="text-[11px] sm:text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                              <ScanBarcode className="w-3 h-3" />
                              {item.barcode}
                            </div>
                          )}
                          {(() => {
                            const days = daysUntilExpiry(item);
                            if (days === undefined || days > 14) return null;
                            return (
                              <div
                                className={`inline-flex items-center gap-1 mt-0.5 text-[11px] font-bold rounded px-1.5 py-0.5 ${
                                  days < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                {days < 0 ? 'Expired' : days === 0 ? 'Expires today' : `Expires in ${days} ${days === 1 ? 'day' : 'days'}`}
                              </div>
                            );
                          })()}
                          {isSubItem && (
                            <div className="text-[11px] sm:text-xs text-indigo-600 font-semibold mt-0.5">
                              {item.piecesPerParent} {item.unit || 'pcs'} / {parentItem?.name || 'Parent'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`p-2 md:p-2.5 font-mono text-xs sm:text-sm ${isLowStock(item) ? 'text-red-600 font-black' : 'font-bold text-slate-800'}`}>
                      {editingItemId === item.id ? (
                        isSubItem ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {item.quantity + ((parentItem?.quantity || 0) * item.piecesPerParent!)} {item.unit || 'pcs'}
                            </span>
                            <span className="text-[11px] text-indigo-600 font-bold">(Auto from {parentItem?.name || 'Mother'})</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            className="w-16 px-2 py-1 border border-slate-300 rounded text-xs font-bold"
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                            autoFocus
                          />
                        )
                      ) : (
                        <div className="flex flex-col">
                          <span>
                            {isSubItem ? (
                              item.quantity + ((parentItem?.quantity || 0) * item.piecesPerParent!)
                            ) : (
                              item.quantity
                            )} <span className="text-[11px] font-semibold text-slate-600">{item.unit || (item.quantity === 1 ? 'pc' : 'pcs')}</span>
                            {!item.parentId && (() => {
                              const childItem = items.find(i => i.parentId === item.id);
                              if (childItem && childItem.piecesPerParent) {
                                const totalPieces = (item.quantity * childItem.piecesPerParent) + childItem.quantity;
                                return <span className="text-slate-600 ml-1 font-normal text-[11px]">({totalPieces})</span>;
                              }
                              return null;
                            })()}
                          </span>
                        </div>
                      )}
                    </td>
                    {/* Cost Price (Puhunan) */}
                    <td className="p-2 md:p-2.5 font-mono text-xs sm:text-sm text-slate-700 font-bold text-right">
                      {editingItemId === item.id ? (
                        isSubItem ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-bold text-xs text-slate-800">₱{cost.toFixed(2)}</span>
                            <span className="text-[11px] text-indigo-600 font-bold">(Auto: ₱{(parentItem?.costPrice ?? 0).toFixed(2)} / {item.piecesPerParent})</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end">
                            <span className="mr-0.5 text-slate-600 font-bold">₱</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-18 px-1.5 py-1 border border-slate-300 rounded text-xs font-bold text-right"
                              value={editCostPrice}
                              onChange={(e) => setEditCostPrice(e.target.value)}
                            />
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-end">
                          <span>₱{cost.toFixed(2)}</span>
                          {isSubItem && parentItem && (
                            <span className="text-[11px] text-indigo-600 font-bold">(Auto from {parentItem.name})</span>
                          )}
                        </div>
                      )}
                    </td>
                    {/* Sell Price (Benta) */}
                    <td className="p-2 md:p-2.5 font-mono text-xs sm:text-sm text-indigo-700 font-bold text-right">
                      {editingItemId === item.id ? (
                        <div className="flex items-center justify-end">
                          <span className="mr-0.5 text-slate-600 font-bold">₱</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-18 px-1.5 py-1 border border-slate-300 rounded text-xs font-bold text-right"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                          />
                        </div>
                      ) : (
                        <span>₱{item.price.toFixed(2)}</span>
                      )}
                    </td>
                    {/* Profit per unit */}
                    <td className="p-2 md:p-2.5 font-mono text-xs text-right hidden md:table-cell">
                      <span className={profit >= 0 ? "text-emerald-700 font-bold" : "text-rose-600 font-bold"}>
                        {profit >= 0 ? '+' : ''}₱{profit.toFixed(2)}
                      </span>
                      {cost > 0 && (
                        <span className="text-[11px] text-slate-600 font-semibold ml-1">({marginPercent}%)</span>
                      )}
                    </td>
                    <td className="p-2 md:p-2.5 text-center">
                      {editingItemId === item.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSaveModify(item.id)}
                            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded shadow-xs transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingItemId(null)}
                            className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            onClick={() => onTransaction(item.id, 'IN', 1)}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] sm:text-xs font-bold border border-indigo-200 transition-colors"
                          >
                            + Stock
                          </button>
                          <button
                            onClick={() => handleModifyClick(item)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded text-[11px] sm:text-xs font-bold border border-amber-200 transition-colors"
                          >
                            Modify
                          </button>
                          <button
                            onClick={() => openEditDetails(item)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] sm:text-xs font-bold border border-slate-300 transition-colors inline-flex items-center gap-0.5"
                            title="Edit name & picture"
                          >
                            <Pencil className="w-3 h-3" />
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                          <button
                            onClick={async () => {
                              const ok = await toast.confirm({
                                title: `Delete ${item.name}?`,
                                message: 'This removes it from your inventory. It cannot be undone.',
                                confirmLabel: 'Delete',
                                danger: true,
                              });
                              if (ok) onDeleteItem(item.id);
                            }}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[11px] sm:text-xs font-bold border border-rose-200 transition-colors inline-flex items-center gap-0.5"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add New Item Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50"
          onClick={closeAddModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">Add New Item</h2>
                  <p className="text-xs text-slate-600">Fill in the details below</p>
                </div>
              </div>
              <button
                onClick={closeAddModal}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="p-5 flex flex-col gap-5">
              {/* Step 1: Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  1. What's the item called?
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Marlboro Red, Lucky Me Pancit Canton"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                />
              </div>

              {/* Barcode (optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Barcode <span className="normal-case font-medium text-slate-500">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newItemBarcode}
                    onChange={(e) => setNewItemBarcode(e.target.value)}
                    placeholder="Scan or type the code on the package"
                    className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setScanTarget('add')}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors"
                  >
                    <ScanBarcode className="w-4 h-4" />
                    Scan
                  </button>
                </div>
              </div>

              {itemKind === 'whole' && (
                <div>
                  <label htmlFor="new-category" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Category <span className="normal-case font-medium text-slate-400">(optional)</span>
                  </label>
                  <CategoryPicker id="new-category" value={newItemCategory} onChange={setNewItemCategory} suggestFrom={newItemName} />
                </div>
              )}

              {itemKind === 'whole' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="new-low-level" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Low stock at <span className="normal-case font-medium text-slate-500">(default 5)</span>
                    </label>
                    <input
                      id="new-low-level"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={newItemLowLevel}
                      onChange={(e) => setNewItemLowLevel(e.target.value)}
                      placeholder="5"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-expiry" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Expiry date <span className="normal-case font-medium text-slate-500">(optional)</span>
                    </label>
                    <input
                      id="new-expiry"
                      type="date"
                      value={newItemExpiry}
                      onChange={(e) => setNewItemExpiry(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Kind of item */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  2. What kind of item is this?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setItemKind('whole')}
                    className={`text-left p-3 rounded-xl border-2 transition-colors flex items-start gap-2.5 ${
                      itemKind === 'whole'
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Boxes className={`w-5 h-5 mt-0.5 shrink-0 ${itemKind === 'whole' ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-800">A whole item</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">Sold on its own, e.g. a can, a bottle, a pack</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemKind('sub')}
                    className={`text-left p-3 rounded-xl border-2 transition-colors flex items-start gap-2.5 ${
                      itemKind === 'sub'
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Package className={`w-5 h-5 mt-0.5 shrink-0 ${itemKind === 'sub' ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-800">A piece from a pack</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">e.g. 1 stick sold from a pack of cigarettes</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Step 3a: Whole item details */}
              {itemKind === 'whole' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      3. How many in stock?
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newItemQuantity}
                      onChange={(e) => setNewItemQuantity(e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Unit
                    </label>
                    <select
                      value={newItemUnit}
                      onChange={(e) => setNewItemUnit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Step 3b: Sub-item details */}
              {itemKind === 'sub' && (
                <div className="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      3. Which item does it come from?
                    </label>
                    <select
                      value={subItemParentId}
                      onChange={(e) => setSubItemParentId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    >
                      <option value="">Select the parent item...</option>
                      {items.filter((i) => !i.parentId).map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    {items.filter((i) => !i.parentId).length === 0 && (
                      <p className="text-[11px] text-amber-600 font-semibold mt-1">
                        Add the whole pack first, then come back to add pieces from it.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      How many pieces make one whole {parentForForm?.name || 'item'}?
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={subItemPieces}
                      onChange={(e) => setSubItemPieces(e.target.value)}
                      placeholder="e.g. 20"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    />
                    {autoCostForForm > 0 && (
                      <p className="text-[11px] text-indigo-600 font-semibold mt-1">
                        Cost per piece will be auto-set to ₱{autoCostForForm.toFixed(2)} (you can override below)
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Pricing */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  {itemKind === 'sub' ? '4.' : '4.'} Pricing
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                      Cost / Puhunan {itemKind === 'sub' ? '(optional, auto-filled)' : '(optional)'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">₱</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newItemCostPrice}
                        onChange={(e) => setNewItemCostPrice(e.target.value)}
                        placeholder={autoCostForForm > 0 ? autoCostForForm.toFixed(2) : '0.00'}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                      Selling / Benta price
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">₱</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newItemPrice}
                        onChange={(e) => setNewItemPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Live profit preview */}
                {effectivePrice > 0 && (
                  <div className={`mt-2.5 flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold ${
                    previewProfit >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'
                  }`}>
                    <span>You'll earn {previewProfit >= 0 ? '' : '-'}₱{Math.abs(previewProfit).toFixed(2)} per unit</span>
                    {previewMargin !== null && (
                      <span>{previewMargin.toFixed(0)}% margin</span>
                    )}
                  </div>
                )}
              </div>

              {formError && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Details Modal (name + picture) */}
      {editingDetailsItem && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50"
          onClick={closeEditDetails}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">Edit Item</h2>
                  <p className="text-xs text-slate-600">Update the name or picture</p>
                </div>
              </div>
              <button
                onClick={closeEditDetails}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="p-5 flex flex-col gap-5">
              {/* Picture */}
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-28 h-28 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative">
                  {detailsImageUrl ? (
                    <img src={detailsImageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-9 h-9 text-slate-300" />
                  )}
                  {detailsImageLoading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-[11px] font-bold text-slate-600">
                      Processing…
                    </div>
                  )}
                </div>

                <input
                  ref={detailsFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleDetailsImageChange}
                  className="hidden"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => detailsFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 transition-colors"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {detailsImageUrl ? 'Change Picture' : 'Add Picture'}
                  </button>
                  {detailsImageUrl && (
                    <button
                      type="button"
                      onClick={() => setDetailsImageUrl('')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold border border-rose-200 transition-colors"
                    >
                      <ImageOff className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="w-full flex items-center gap-2">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <input
                  type="url"
                  value={detailsImageUrl.startsWith('data:') ? '' : detailsImageUrl}
                  onChange={(e) => setDetailsImageUrl(e.target.value)}
                  placeholder="Paste an image URL (https://...)"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Item Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={detailsName}
                  onChange={(e) => setDetailsName(e.target.value)}
                  placeholder="e.g. Marlboro Red"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                />
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Barcode <span className="normal-case font-medium text-slate-500">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={detailsBarcode}
                    onChange={(e) => setDetailsBarcode(e.target.value)}
                    placeholder="Scan or type the code on the package"
                    className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setScanTarget('details')}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors"
                  >
                    <ScanBarcode className="w-4 h-4" />
                    Scan
                  </button>
                </div>
              </div>

              {!(editingDetailsItem?.parentId && editingDetailsItem?.piecesPerParent) && (
                <div>
                  <label htmlFor="details-category" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Category</label>
                  <CategoryPicker id="details-category" value={detailsCategory} onChange={setDetailsCategory} />
                </div>
              )}

              {!(editingDetailsItem?.parentId && editingDetailsItem?.piecesPerParent) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="details-low-level" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Low stock at <span className="normal-case font-medium text-slate-500">(default 5)</span>
                    </label>
                    <input
                      id="details-low-level"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={detailsLowLevel}
                      onChange={(e) => setDetailsLowLevel(e.target.value)}
                      placeholder="5"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="details-expiry" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Expiry date
                    </label>
                    <input
                      id="details-expiry"
                      type="date"
                      value={detailsExpiry}
                      onChange={(e) => setDetailsExpiry(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {detailsError && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {detailsError}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEditDetails}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={detailsImageLoading}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showShopping && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowShopping(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shopping-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h3 id="shopping-title" className="text-base font-black text-slate-800">Shopping list</h3>
                <p className="text-xs text-slate-600">{shoppingItems.length} {shoppingItems.length === 1 ? 'item is' : 'items are'} running low. Tick what you bought.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowShopping(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-2.5 border-b border-slate-200 flex items-center gap-2 shrink-0">
              {([
                ['urgent', 'Most urgent'],
                ['name', 'A–Z'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setShoppingSort(value)}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold border transition-colors ${
                    shoppingSort === value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <ul className="overflow-auto flex-1 divide-y divide-slate-100">
              {shoppingItems.length === 0 ? (
                <li className="p-8 text-center text-sm font-semibold text-slate-600">Nothing is running low.</li>
              ) : (
                shoppingItems.map((item) => {
                  const bought = boughtIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={bought}
                          onChange={() => setBoughtIds((prev) => (bought ? prev.filter((id) => id !== item.id) : [...prev, item.id]))}
                          className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                        />
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-bold truncate ${bought ? 'line-through text-slate-500' : 'text-slate-800'}`}>{item.name}</span>
                          <span className="block text-xs text-slate-600">Alert at {lowLevel(item)} {item.unit || 'pcs'}</span>
                        </span>
                        <span className={`shrink-0 text-sm font-black font-mono ${item.quantity === 0 ? 'text-red-600' : 'text-amber-700'}`}>
                          {item.quantity === 0 ? 'OUT' : `${item.quantity} left`}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowShopping(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={copyShoppingList}
                disabled={shoppingItems.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy list
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan In / Scan Out */}
      {scanMode && (
        <BarcodeScanner title="Scan items in or out" onDetect={handleScanStock} onClose={closeStockScanner}>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setScanMode('IN')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                scanMode === 'IN' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Stock In (+{scanQty})
            </button>
            <button
              type="button"
              onClick={() => setScanMode('OUT')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                scanMode === 'OUT' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Stock Out (−{scanQty})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0">Per scan</span>
            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setScanQty((q) => Math.max(1, q - 1))}
                aria-label="Fewer per scan"
                className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={scanQty}
                onChange={(e) => setScanQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                aria-label="Quantity per scan"
                className="w-14 text-center py-2 text-sm font-black font-mono outline-none"
              />
              <button
                type="button"
                onClick={() => setScanQty((q) => q + 1)}
                aria-label="More per scan"
                className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-1.5 ml-auto">
              {[1, 6, 12, 24].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScanQty(n)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    scanQty === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <ScanStatusBar status={scanStatus} />

          {unknownCode && (
            <div className="flex flex-col gap-2 border border-amber-200 bg-amber-50/60 rounded-xl p-3">
              <button
                type="button"
                onClick={addFromScan}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition-colors"
              >
                Add as a new item
              </button>
              {unlinkedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={linkItemId}
                    onChange={(e) => setLinkItemId(e.target.value)}
                    className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-2 py-2 text-xs sm:text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Or link to an item you already have…</option>
                    {unlinkedItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleLinkBarcode}
                    disabled={!linkItemId}
                    className="shrink-0 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold transition-colors"
                  >
                    Link
                  </button>
                </div>
              )}
            </div>
          )}
        </BarcodeScanner>
      )}

      {/* One-shot scan that fills a barcode field in the Add / Edit forms */}
      {scanTarget && (
        <BarcodeScanner
          title="Scan the item's barcode"
          closeLabel="Cancel"
          onDetect={handleScanIntoForm}
          onClose={() => setScanTarget(null)}
        />
      )}
    </div>
  );
}
