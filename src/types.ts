export interface InventoryItem {
  id: string;
  name: string;
  price: number; // Selling price
  costPrice?: number; // Cost / Capital price (Puhunan)
  quantity: number;
  unit?: string;
  parentId?: string;
  piecesPerParent?: number;
  imageUrl?: string; // Picture of the item (data URL or hosted URL)
  barcode?: string; // Scannable code (EAN/UPC/QR/etc.) used to find the item by scanning
  lowStockLevel?: number; // Warn when quantity is at or below this (default 5)
  expiryDate?: string; // YYYY-MM-DD
  isFavorite?: boolean; // Shown first in POS
  category?: string; // e.g. "Canned Goods", "Drinks"
}

export type TransactionType = 'IN' | 'OUT' | 'UTANG' | 'PAYMENT';

export interface Transaction {
  id: string;
  itemId: string;
  itemName: string;
  type: TransactionType;
  quantity: number;
  totalPrice: number;
  timestamp: string;
  /** For a utang PAYMENT: the part of it that pays back your capital (the rest is profit) */
  cost?: number;
}

export interface UtangRecord {
  id: string;
  customerName: string;
  itemsDescription: string;
  amount: number;
  paidAmount?: number; // How much has been paid so far (partial payments)
  cost?: number; // Capital (puhunan) of the goods given on utang. Empty = not known yet.
  date: string;
  status: 'UNPAID' | 'PAID';
}

export interface Expense {
  id: string;
  description: string;
  category?: string;
  amount: number;
  date: string;
}

export interface StoreSettings {
  storeName: string;
  ownerName: string;
  securityPin?: string;
  logoUrl?: string; // Store logo shown in the header (a small data: URL or an https link)
}

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}

/** One product category in the store's list, e.g. "Canned Goods". */
export interface StoreCategory {
  id: string;
  name: string;
  /** Which standard shelf it started as, so Auto-sort still knows it after a rename */
  builtinKey?: string;
}

/** Optional extra details when adding or editing an item. */
export interface ItemExtras {
  category?: string;
  barcode?: string;
  lowStockLevel?: number;
  expiryDate?: string;
}
