import { InventoryItem, UtangRecord } from '../types';

export const DEFAULT_LOW_STOCK = 5;

export const lowLevel = (item: InventoryItem): number => item.lowStockLevel ?? DEFAULT_LOW_STOCK;

// Sub-items (like a single stick from a pack) restock by opening their parent pack, so they are never flagged as low.
export const isLowStock = (item: InventoryItem): boolean =>
  !(item.parentId && item.piecesPerParent) && item.quantity <= lowLevel(item);

/** Whole days from today until the item expires (negative = already expired). undefined = no expiry date. */
export const daysUntilExpiry = (item: InventoryItem): number | undefined => {
  if (!item.expiryDate) return undefined;
  const [y, m, d] = item.expiryDate.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const expiry = new Date(y, m - 1, d).getTime();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((expiry - start) / 86_400_000);
};

export const EXPIRY_WARNING_DAYS = 14;

export const isExpiringSoon = (item: InventoryItem): boolean => {
  const d = daysUntilExpiry(item);
  return d !== undefined && d <= EXPIRY_WARNING_DAYS;
};

/** What a customer still owes on one utang record. */
export const utangRemaining = (u: UtangRecord): number =>
  u.status === 'PAID' ? 0 : Math.max(0, Math.round((u.amount - (u.paidAmount ?? 0)) * 100) / 100);
