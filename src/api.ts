import { InventoryItem, Transaction, UtangRecord, StoreSettings, Expense, StoreCategory } from './types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface AppState {
  items: InventoryItem[];
  transactions: Transaction[];
  utangs: UtangRecord[];
  customers: string[];
  expenses: Expense[];
  settings: StoreSettings;
  /** undefined on an older database that has no categories table yet */
  categories?: StoreCategory[];
}

export const api = {
  getState: () => request<AppState>('/state'),

  addItem: (data: {
    name: string;
    price: number;
    costPrice?: number;
    quantity: number;
    unit?: string;
    parentId?: string;
    piecesPerParent?: number;
    imageUrl?: string;
    barcode?: string;
    lowStockLevel?: number;
    expiryDate?: string;
    category?: string;
  }) => request<{ item: InventoryItem; transaction: Transaction | null; warning?: string }>('/items', { method: 'POST', body: JSON.stringify(data) }),

  updateItem: (
    id: string,
    data: {
      name?: string;
      quantity?: number;
      price?: number;
      costPrice?: number;
      imageUrl?: string;
      barcode?: string;
      lowStockLevel?: number | null;
      expiryDate?: string | null;
      isFavorite?: boolean;
      category?: string | null;
    }
  ) => request<{ item: InventoryItem; transaction: Transaction | null; warning?: string }>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  addCategory: (name: string) => request<{ category: StoreCategory }>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),

  renameCategory: (from: string, to: string) =>
    request<{ ok: true; from: string; to: string }>('/categories/rename', { method: 'PUT', body: JSON.stringify({ from, to }) }),

  deleteCategory: (name: string) => request<{ ok: true }>(`/categories/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  // Give many products a category in one go (used by "Auto-sort")
  setCategories: (updates: { id: string; category: string | null }[]) =>
    request<{ updated: number }>('/items/categories', { method: 'POST', body: JSON.stringify({ updates }) }),

  stockTransaction: (id: string, type: 'IN' | 'OUT', quantity: number) =>
    request<{ item: InventoryItem; transaction: Transaction }>(`/items/${id}/stock`, { method: 'POST', body: JSON.stringify({ type, quantity }) }),

  deleteItem: (id: string) => request<{ ok: true }>(`/items/${id}`, { method: 'DELETE' }),

  checkout: (cart: { itemId: string; quantity: number }[], isUtang: boolean, customerName?: string) =>
    request<{ items: InventoryItem[]; transactions: Transaction[]; utang: UtangRecord | null }>('/checkout', {
      method: 'POST',
      body: JSON.stringify({ cart, isUtang, customerName }),
    }),

  addUtang: (customerName: string, itemsDescription: string, amount: number, cost?: number) =>
    request<{ utang: UtangRecord; warning?: string }>('/utangs', { method: 'POST', body: JSON.stringify({ customerName, itemsDescription, amount, cost }) }),

  // Set (or clear, with null) the capital of one utang record
  setUtangCost: (id: string, cost: number | null) =>
    request<{ ok: true; cost?: number }>(`/utangs/${id}/cost`, { method: 'PUT', body: JSON.stringify({ cost }) }),

  // Fill in the capital of many utang records at once (Auto-compute)
  setUtangCosts: (updates: { id: string; cost: number | null }[]) =>
    request<{ updated: number }>('/utangs/costs', { method: 'POST', body: JSON.stringify({ updates }) }),

  deleteUtang: (id: string) => request<{ ok: true }>(`/utangs/${id}`, { method: 'DELETE' }),

  undoCheckout: (transactionIds: string[], utangId?: string) =>
    request<{ items: InventoryItem[]; removedTransactionIds: string[] }>('/checkout/undo', {
      method: 'POST',
      body: JSON.stringify({ transactionIds, utangId }),
    }),

  payUtang: (id: string, amount?: number) =>
    request<{ utang: UtangRecord; transaction?: Transaction; alreadyPaid?: boolean }>(`/utangs/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify(amount === undefined ? {} : { amount }),
    }),

  payCustomerUtang: (customerName: string, amount: number) =>
    request<{ utangs: UtangRecord[]; transactions: Transaction[] }>('/utangs/pay-customer', {
      method: 'POST',
      body: JSON.stringify({ customerName, amount }),
    }),

  addCustomer: (name: string) => request<{ ok: true }>('/customers', { method: 'POST', body: JSON.stringify({ name }) }),

  removeCustomer: (name: string, withRecords = false) =>
    request<{ ok: true }>(`/customers/${encodeURIComponent(name)}${withRecords ? '?records=1' : ''}`, { method: 'DELETE' }),

  addExpense: (data: { description: string; category?: string; amount: number; date?: string }) =>
    request<{ expense: Expense }>('/expenses', { method: 'POST', body: JSON.stringify(data) }),

  deleteExpense: (id: string) => request<{ ok: true }>(`/expenses/${id}`, { method: 'DELETE' }),

  saveSettings: (settings: StoreSettings) =>
    request<{ settings: StoreSettings; warning?: string }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  clearAll: () => request<{ ok: true }>('/clear', { method: 'POST' }),
};
