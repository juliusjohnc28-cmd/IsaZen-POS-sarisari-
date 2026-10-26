import { useState, useEffect, useMemo, useCallback } from 'react';
import { LayoutDashboard, History, FileText, ShoppingCart, Settings as SettingsIcon, BarChart2, Loader2, WifiOff } from 'lucide-react';
import { InventoryItem, Transaction, UtangRecord, CartItem, StoreSettings, Expense, ItemExtras, StoreCategory } from './types';
import { normalizeName } from './utils/names';
import { isLowStock, isExpiringSoon, utangRemaining } from './utils/stock';
import { useOnline, useTheme } from './utils/device';
import { useToast } from './components/Toast';
import { AppHeader } from './components/AppHeader';
import { CategoryManager } from './components/CategoryManager';
import { CategoriesProvider } from './utils/CategoriesContext';
import { DEFAULT_CATEGORY_NAMES, guessCategoryKey } from './utils/categories';
import { InventoryList } from './components/InventoryList';
import { TransactionHistory } from './components/TransactionHistory';
import { UtangList } from './components/UtangList';
import { PosSystem } from './components/PosSystem';
import { Settings } from './components/Settings';
import { Dashboard } from './components/Dashboard';
import { CustomerUtangPortal } from './components/CustomerUtangPortal';
import { LoginSelection } from './components/LoginSelection';
import { api, AppState } from './api';

const DEFAULT_SETTINGS: StoreSettings = { storeName: "Nanay's Sari-Sari Store", ownerName: '' };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [utangs, setUtangs] = useState<UtangRecord[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // The store's own list of categories. undefined = an older database without the table (the standard shelves are used).
  const [categories, setCategories] = useState<StoreCategory[] | undefined>(undefined);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);

  type Tab = 'dashboard' | 'pos' | 'inventory' | 'history' | 'utang' | 'settings';
  const TAB_IDS: Tab[] = ['dashboard', 'pos', 'inventory', 'history', 'utang', 'settings'];

  // Refreshing the page keeps the same tab open
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem('activeTab') as Tab | null;
      return saved && TAB_IDS.includes(saved) ? saved : 'pos';
    } catch {
      return 'pos';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('activeTab', activeTab);
    } catch {
      /* storage blocked: the tab just resets on refresh */
    }
  }, [activeTab]);

  // The owner stays logged in after a refresh for 12 hours on this device. Logout ends it right away.
  const SESSION_KEY = 'adminSessionUntil';
  const SESSION_MS = 12 * 60 * 60 * 1000;
  const sessionActive = (): boolean => {
    try {
      return Number(localStorage.getItem(SESSION_KEY)) > Date.now();
    } catch {
      return false;
    }
  };
  // A customer who is signed in to their ledger stays there after a refresh too
  const customerSignedIn = (): boolean => {
    try {
      return Boolean(localStorage.getItem('sariSariPortalCustomer'));
    } catch {
      return false;
    }
  };
  const [userRole, setUserRole] = useState<'none' | 'admin' | 'customer'>(() =>
    sessionActive() ? 'admin' : customerSignedIn() ? 'customer' : 'none'
  );
  useEffect(() => {
    try {
      if (userRole === 'admin') {
        if (!sessionActive()) localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_MS));
      } else {
        localStorage.removeItem(SESSION_KEY);
        // Leaving to the role screen also signs the customer out of the portal
        if (userRole === 'none') localStorage.removeItem('sariSariPortalCustomer');
      }
    } catch {
      /* storage blocked: login simply isn't remembered */
    }
  }, [userRole]);

  // True when the numbers on screen come from the last saved copy because the store database could not be reached.
  const [usingSavedData, setUsingSavedData] = useState(false);

  const applyState = (state: AppState) => {
    setItems(state.items);
    setTransactions(state.transactions);
    setUtangs(state.utangs);
    setCustomers(state.customers);
    setExpenses(state.expenses);
    setSettings(state.settings);
    setCategories(state.categories);
  };

  // Load everything from D1 (via the /api/state endpoint) on first mount.
  // The last good copy is kept on this device, so the app can still open when the signal is gone.
  useEffect(() => {
    let cancelled = false;
    api
      .getState()
      .then((state) => {
        if (cancelled) return;
        applyState(state);
        setUsingSavedData(false);
        try {
          localStorage.setItem('lastStoreState', JSON.stringify(state));
        } catch {
          /* too big or blocked: the app simply won't have an offline copy */
        }
      })
      .catch((e) => {
        if (cancelled) return;
        try {
          const saved = localStorage.getItem('lastStoreState');
          if (saved) {
            applyState(JSON.parse(saved));
            setUsingSavedData(true);
            return;
          }
        } catch {
          /* fall through to the error screen */
        }
        setLoadError(e.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = settings.storeName ? `${settings.storeName} POS` : 'Store POS';
  }, [settings.storeName]);

  const toast = useToast();
  const online = useOnline();

  // Some phone browsers keep a toolbar over the bottom of the page. Follow the height you can actually see,
  // so the bottom bar and buttons are never hidden behind it.
  useEffect(() => {
    const setHeight = () => document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
    setHeight();
    window.addEventListener('resize', setHeight);
    window.addEventListener('orientationchange', setHeight);
    window.visualViewport?.addEventListener('resize', setHeight);
    return () => {
      window.removeEventListener('resize', setHeight);
      window.removeEventListener('orientationchange', setHeight);
      window.visualViewport?.removeEventListener('resize', setHeight);
    };
  }, []);
  useEffect(() => {
    if (!online || !usingSavedData) return;
    api
      .getState()
      .then((state) => {
        applyState(state);
        setUsingSavedData(false);
        try {
          localStorage.setItem('lastStoreState', JSON.stringify(state));
        } catch {
          /* ignore */
        }
        toast.success('Back online. Your store data is up to date.');
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, usingSavedData]);
  const { theme, toggleTheme } = useTheme();
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low' | 'expiring'>('all');

  // Every category in shelf order: the store's list first, then any that only exist on products
  const categoryNames = useMemo(() => {
    const base = categories ? categories.map((c) => c.name) : DEFAULT_CATEGORY_NAMES;
    const used: string[] = items.map((i) => i.category).filter((c): c is string => Boolean(c));
    const extra = Array.from(new Set<string>(used))
      .filter((n) => !base.some((b) => b.toLowerCase() === n.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    return [...base, ...extra];
  }, [categories, items]);

  // Auto-sort and name suggestions find a standard shelf, then use whatever the store now calls it
  const guessCategory = useCallback(
    (productName: string): string | undefined => {
      const key = guessCategoryKey(productName);
      if (!key) return undefined;
      if (!categories) return key;
      return categories.find((c) => c.builtinKey === key)?.name;
    },
    [categories]
  );

  const categoriesValue = useMemo(
    () => ({ names: categoryNames, guess: guessCategory, openManager: () => setShowCategoryManager(true) }),
    [categoryNames, guessCategory]
  );

  const money = (n: number) => `₱${n.toFixed(2)}`;

  // Put a recent sale back: stock returns and the sale (or its utang) disappears from the records.
  const undoSale = (transactionIds: string[], utangId?: string) => {
    api
      .undoCheckout(transactionIds, utangId)
      .then(({ items: fresh, removedTransactionIds }) => {
        setItems((prev) => prev.map((i) => fresh.find((u) => u.id === i.id) ?? i));
        setTransactions((prev) => prev.filter((t) => !removedTransactionIds.includes(t.id)));
        if (utangId) setUtangs((prev) => prev.filter((u) => u.id !== utangId));
        toast.info('Sale undone. The stock was put back.');
      })
      .catch((e) => toast.error(`Couldn't undo: ${e.message}`));
  };

  const handleCheckout = (cart: CartItem[], isUtang: boolean = false, customerName?: string, cashReceived?: number) => {
    api
      .checkout(
        cart.map((c) => ({ itemId: c.item.id, quantity: c.quantity })),
        isUtang,
        customerName ? normalizeName(customerName) : customerName
      )
      .then(({ items: updatedItems, transactions: newTxs, utang }) => {
        setItems((prev) => prev.map((i) => updatedItems.find((u) => u.id === i.id) ?? i));
        setTransactions((prev) => [...newTxs, ...prev]);
        if (utang) setUtangs((prev) => [utang, ...prev]);

        const total = newTxs.reduce((sum, t) => sum + t.totalPrice, 0);
        const change = cashReceived !== undefined ? cashReceived - total : undefined;
        const text = utang
          ? `Utang recorded: ${utang.customerName} · ${money(total)}`
          : change !== undefined && change > 0
          ? `Sale ${money(total)} · Change ${money(change)}`
          : `Sale completed · ${money(total)}`;
        toast.success(text, {
          actionLabel: 'Undo',
          onAction: () => undoSale(newTxs.map((t) => t.id), utang?.id),
        });
      })
      .catch((e) => toast.error(`Checkout failed: ${e.message}`));
  };

  const handleCheckoutUtang = (cart: CartItem[], customerName: string) => {
    handleCheckout(cart, true, customerName);
  };

  const handleAddUtang = (customerName: string, itemsDescription: string, amount: number, cost?: number) => {
    api
      .addUtang(normalizeName(customerName), itemsDescription, amount, cost)
      .then(({ utang, warning }) => {
        setUtangs((prev) => [utang, ...prev]);
        if (warning) toast.error(`Utang recorded for ${utang.customerName}, but not its capital. ${warning}`, { duration: 10000 });
        else toast.success(`Utang recorded for ${utang.customerName}`);
      })
      .catch((e) => toast.error(`Failed to add utang: ${e.message}`));
  };

  // Set (or clear) the capital of one utang record
  const handleSetUtangCost = (id: string, cost: number | null): Promise<boolean> =>
    api
      .setUtangCost(id, cost)
      .then(() => {
        setUtangs((prev) => prev.map((u) => (u.id === id ? { ...u, cost: cost ?? undefined } : u)));
        toast.success(cost === null ? 'Capital cleared' : 'Capital saved');
        return true;
      })
      .catch((e) => {
        toast.error(e.message, { duration: 10000 });
        return false;
      });

  // Fill in the capital of many utang records at once
  const handleBulkUtangCosts = (updates: { id: string; cost: number }[]): Promise<boolean> =>
    api
      .setUtangCosts(updates)
      .then(() => {
        setUtangs((prev) =>
          prev.map((u) => {
            const found = updates.find((x) => x.id === u.id);
            return found ? { ...u, cost: found.cost } : u;
          })
        );
        toast.success(`Capital filled in for ${updates.length} ${updates.length === 1 ? 'record' : 'records'}`);
        return true;
      })
      .catch((e) => {
        toast.error(e.message, { duration: 10000 });
        return false;
      });

  // Delete one utang record. Payments already received stay in History.
  const handleDeleteUtang = (id: string): Promise<boolean> =>
    api
      .deleteUtang(id)
      .then(() => {
        setUtangs((prev) => prev.filter((u) => u.id !== id));
        toast.success('Utang deleted');
        return true;
      })
      .catch((e) => {
        toast.error(`Couldn't delete utang: ${e.message}`);
        return false;
      });

  // Receive a payment on ONE utang record. No amount = pay the whole remaining balance.
  const handlePayUtang = (id: string, amount?: number): Promise<boolean> =>
    api
      .payUtang(id, amount)
      .then(({ utang, transaction }) => {
        if (utang) setUtangs((prev) => prev.map((u) => (u.id === id ? utang : u)));
        if (transaction) {
          setTransactions((prev) => [transaction, ...prev]);
          toast.success(`Payment received · ${money(transaction.totalPrice)}`);
        }
        return true;
      })
      .catch((e) => {
        toast.error(`Payment failed: ${e.message}`);
        return false;
      });

  // Receive a payment from a customer; it is applied to the oldest unpaid records first.
  const handlePayCustomer = (customerName: string, amount: number): Promise<boolean> =>
    api
      .payCustomerUtang(customerName, amount)
      .then(({ utangs: changed, transactions: newTxs }) => {
        setUtangs((prev) => prev.map((u) => changed.find((c) => c.id === u.id) ?? u));
        setTransactions((prev) => [...newTxs, ...prev]);
        toast.success(`Payment received from ${customerName} · ${money(amount)}`);
        return true;
      })
      .catch((e) => {
        toast.error(`Payment failed: ${e.message}`);
        return false;
      });

  const handleAddItem = (
    name: string,
    price: number,
    initialQuantity: number,
    unit: string,
    parentId?: string,
    piecesPerParent?: number,
    costPrice?: number,
    extras?: ItemExtras
  ): Promise<boolean> =>
    api
      .addItem({ name, price, quantity: initialQuantity, unit, parentId, piecesPerParent, costPrice, ...extras })
      .then(({ item, transaction, warning }) => {
        setItems((prev) => [...prev, item]);
        if (transaction) setTransactions((prev) => [transaction, ...prev]);
        if (warning) toast.error(`${item.name} added, but not its category. ${warning}`, { duration: 10000 });
        else toast.success(`${item.name} added`);
        return true;
      })
      .catch((e) => {
        toast.error(`Failed to add item: ${e.message}`);
        return false;
      });

  // Resolves true when the stock change saved, false when it failed (so the barcode scanner can show the result).
  const handleTransaction = (itemId: string, type: 'IN' | 'OUT', quantity: number): Promise<boolean> =>
    api
      .stockTransaction(itemId, type, quantity)
      .then(({ item, transaction }) => {
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
        setTransactions((prev) => [transaction, ...prev]);
        return true;
      })
      .catch((e) => {
        toast.error(`Transaction failed: ${e.message}`);
        return false;
      });

  const handleUpdateItem = (itemId: string, newQuantity: number, newPrice: number, newCostPrice?: number) => {
    api
      .updateItem(itemId, { quantity: newQuantity, price: newPrice, costPrice: newCostPrice })
      .then(({ item, transaction }) => {
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
        if (transaction) setTransactions((prev) => [transaction, ...prev]);
        toast.success('Saved');
      })
      .catch((e) => toast.error(`Update failed: ${e.message}`));
  };

  const handleUpdateItemDetails = (itemId: string, details: ItemExtras & { name: string; imageUrl?: string }) => {
    api
      .updateItem(itemId, {
        name: details.name,
        imageUrl: details.imageUrl ?? '',
        barcode: details.barcode ?? '',
        category: details.category ?? null,
        lowStockLevel: details.lowStockLevel ?? null,
        expiryDate: details.expiryDate ?? null,
      })
      .then(({ item, warning }) => {
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
        if (warning) toast.error(warning, { duration: 10000 });
        else toast.success('Saved');
      })
      .catch((e) => toast.error(`Failed to save item details: ${e.message}`));
  };

  // ----- Manage categories (add / rename / delete) -----
  const handleAddCategory = (name: string): Promise<boolean> =>
    api
      .addCategory(name)
      .then(({ category }) => {
        setCategories((prev) => [...(prev ?? []), category]);
        toast.success(`${category.name} added`);
        return true;
      })
      .catch((e) => {
        toast.error(e.message, { duration: 8000 });
        return false;
      });

  const handleRenameCategory = (from: string, to: string): Promise<boolean> =>
    api
      .renameCategory(from, to)
      .then(() => {
        const same = (a?: string) => (a ?? '').toLowerCase() === from.toLowerCase();
        setCategories((prev) => {
          const list = prev ?? [];
          // A category that only existed on products gets its own entry in the list
          return list.some((c) => same(c.name))
            ? list.map((c) => (same(c.name) ? { ...c, name: to } : c))
            : [...list, { id: `new-${to}`, name: to }];
        });
        setItems((prev) => prev.map((i) => (same(i.category) ? { ...i, category: to } : i)));
        toast.success(`Renamed to ${to}`);
        return true;
      })
      .catch((e) => {
        toast.error(e.message, { duration: 8000 });
        return false;
      });

  const handleDeleteCategory = (name: string): Promise<boolean> =>
    api
      .deleteCategory(name)
      .then(() => {
        const same = (a?: string) => (a ?? '').toLowerCase() === name.toLowerCase();
        setCategories((prev) => prev?.filter((c) => !same(c.name)));
        setItems((prev) => prev.map((i) => (same(i.category) ? { ...i, category: undefined } : i)));
        toast.success(`${name} deleted`);
        return true;
      })
      .catch((e) => {
        toast.error(e.message, { duration: 8000 });
        return false;
      });

  // Give many products a category at once (Inventory > Auto-sort)
  const handleBulkCategory = (updates: { id: string; category: string }[]): Promise<boolean> =>
    api
      .setCategories(updates)
      .then(() => {
        setItems((prev) =>
          prev.map((i) => {
            const u = updates.find((x) => x.id === i.id);
            return u ? { ...i, category: u.category } : i;
          })
        );
        toast.success(`${updates.length} ${updates.length === 1 ? 'product' : 'products'} sorted into categories`);
        return true;
      })
      .catch((e) => {
        toast.error(`Couldn't sort: ${e.message}`, { duration: 10000 });
        return false;
      });

  const handleToggleFavorite = (itemId: string) => {
    const current = items.find((i) => i.id === itemId);
    if (!current) return;
    const next = !current.isFavorite;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, isFavorite: next } : i)));
    api.updateItem(itemId, { isFavorite: next }).catch((e) => {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, isFavorite: !next } : i)));
      toast.error(`Couldn't save favorite: ${e.message}`);
    });
  };

  const handleDeleteItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    api.deleteItem(itemId).catch((e) => toast.error(`Delete failed: ${e.message}`));
  };

  const handleAddCustomer = (rawName: string) => {
    const name = normalizeName(rawName);
    if (!name) return;
    setCustomers((prev) => (prev.includes(name) ? prev : [...prev, name]));
    api.addCustomer(name).catch((e) => toast.error(`Failed to add customer: ${e.message}`));
  };

  // Delete a ledger name. withRecords also removes that customer's utang records.
  const handleDeleteCustomer = (rawName: string, withRecords: boolean): Promise<boolean> => {
    const name = normalizeName(rawName);
    return api
      .removeCustomer(name, withRecords)
      .then(() => {
        setCustomers((prev) => prev.filter((c) => normalizeName(c) !== name));
        if (withRecords) setUtangs((prev) => prev.filter((u) => normalizeName(u.customerName) !== name));
        toast.success(`${name} deleted`);
        return true;
      })
      .catch((e) => {
        toast.error(`Couldn't delete ${name}: ${e.message}`);
        return false;
      });
  };

  const handleAddExpense = (description: string, amount: number, category?: string) => {
    api
      .addExpense({ description, amount, category })
      .then(({ expense }) => {
        setExpenses((prev) => [expense, ...prev]);
        toast.success('Expense added');
      })
      .catch((e) => toast.error(`Failed to add expense: ${e.message}`));
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    api.deleteExpense(id).catch((e) => toast.error(`Failed to delete expense: ${e.message}`));
  };

  const handleSaveSettings = (newSettings: StoreSettings) => {
    setSettings(newSettings);
    api
      .saveSettings(newSettings)
      .then(({ settings: saved, warning }) => {
        if (saved) setSettings(saved);
        if (warning) toast.error(warning, { duration: 10000 });
        else toast.success('Settings saved');
      })
      .catch((e) => toast.error(`Failed to save settings: ${e.message}`));
  };

  const handleClearData = () => {
    setItems([]);
    setTransactions([]);
    setUtangs([]);
    setCustomers([]);
    setExpenses([]);
    api
      .clearAll()
      .then(() => toast.info('All data cleared'))
      .catch((e) => toast.error(`Failed to clear data: ${e.message}`));
  };

  // Calculate some simple stats
  const totalItems = items.length;
  const lowStockItems = items.filter(isLowStock).length;
  const expiringItems = items.filter(isExpiringSoon).length;
  const totalUnpaidUtang = utangs.reduce((sum, u) => sum + utangRemaining(u), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3 text-slate-300">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm font-semibold">Loading store data…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3 text-slate-300 px-6 text-center">
        <p className="text-base font-bold text-red-400">Couldn't reach the store database.</p>
        <p className="text-sm text-slate-500 max-w-md">{loadError}</p>
        <button onClick={() => window.location.reload()} className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (userRole === 'none') {
    return (
      <LoginSelection
        settings={settings}
        onLoginAsAdmin={() => setUserRole('admin')}
        onOpenCustomerPortal={() => setUserRole('customer')}
      />
    );
  }

  if (userRole === 'customer') {
    return (
      <CustomerUtangPortal
        utangs={utangs}
        customers={customers}
        storeName={settings.storeName}
        onSwitchToAdmin={() => setUserRole('none')}
        onAddCustomer={handleAddCustomer}
      />
    );
  }

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'pos', label: 'POS', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory', icon: LayoutDashboard },
    { id: 'history', label: 'History', icon: History },
    { id: 'utang', label: 'Utang', icon: FileText },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ] as const;

  // Small red number on a tab (low stock on Inventory)
  const tabBadge = (id: string) => (id === 'inventory' && lowStockItems > 0 ? lowStockItems : 0);

  return (
    <CategoriesProvider value={categoriesValue}>
    <div className="app-shell flex flex-col h-[var(--app-h,100dvh)] overflow-hidden bg-slate-100 text-slate-900 font-sans">
      {/* Top Header */}
      <AppHeader settings={settings} theme={theme} onToggleTheme={toggleTheme} onLogout={() => setUserRole('none')} />

      {(!online || usingSavedData) && (
        <div role="status" className="shrink-0 bg-slate-800 text-white text-xs sm:text-sm font-bold text-center py-2 px-3 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          {usingSavedData
            ? "You're offline. Showing the last saved data. Selling and saving need a connection."
            : "You're offline. Reconnect to save changes."}
        </div>
      )}

      {/* Desktop / tablet tabs (phones use the bar at the bottom) */}
      <div className="hidden md:block bg-white border-b border-slate-200 px-6 py-2.5 shrink-0 shadow-sm">
        <nav className="flex space-x-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative px-4 py-2.5 rounded-xl text-sm lg:text-base font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap min-h-[44px] ${
                activeTab === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
              title={label}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
              {tabBadge(id) > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">
                  {tabBadge(id)}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Key Metrics Row (Inventory screen only) */}
      {activeTab === 'inventory' && (
        <section aria-label="Inventory summary" className="grid grid-cols-3 gap-2.5 md:gap-4 p-3 md:p-6 shrink-0">
          <div className="bg-white p-3 md:p-5 rounded-xl border border-slate-200 border-l-4 border-l-indigo-500 shadow-sm flex flex-col justify-between min-w-0">
            <p className="text-[11px] sm:text-xs md:text-sm text-slate-600 font-bold uppercase tracking-wider truncate">Total Items</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800 mt-1">{totalItems}</p>
          </div>
          <button
            type="button"
            onClick={() => setInventoryFilter(inventoryFilter === 'low' ? 'all' : 'low')}
            className={`text-left bg-white p-3 md:p-5 rounded-xl border border-slate-200 border-l-4 border-l-red-500 shadow-sm flex flex-col justify-between min-w-0 transition-all hover:shadow-md ${
              inventoryFilter === 'low' ? 'ring-2 ring-red-400' : ''
            }`}
            title="Tap to show only low stock items"
          >
            <p className="text-[11px] sm:text-xs md:text-sm text-red-600 font-bold uppercase tracking-wider truncate">Low Stock</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-black text-red-600 mt-1">{lowStockItems}</p>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('utang')}
            className="text-left bg-white p-3 md:p-5 rounded-xl border border-slate-200 border-l-4 border-l-amber-500 shadow-sm flex flex-col justify-between min-w-0 transition-all hover:shadow-md"
            title="Open Utang"
          >
            <p className="text-[11px] sm:text-xs md:text-sm text-amber-700 font-bold uppercase tracking-wider truncate"><span className="min-[420px]:hidden">Utang</span><span className="hidden min-[420px]:inline">Unpaid Utang</span></p>
            <p className="text-lg sm:text-2xl md:text-3xl font-black text-amber-800 mt-1 truncate">₱{totalUnpaidUtang.toFixed(2)}</p>
          </button>
        </section>
      )}

      {/* Main Content Area */}
      <main className={`flex-grow px-3 sm:px-4 md:px-6 pb-3 md:pb-6 overflow-hidden flex flex-col min-h-0 ${activeTab === 'inventory' ? '' : 'pt-3 md:pt-6'}`}>
        {activeTab === 'dashboard' && (
          <Dashboard
            transactions={transactions}
            items={items}
            utangs={utangs}
            expenses={expenses}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
            onNavigate={(tab, filter) => {
              if (filter) setInventoryFilter(filter);
              setActiveTab(tab);
            }}
          />
        )}
        {activeTab === 'pos' && (
          <PosSystem
            items={items}
            transactions={transactions}
            onCheckout={(cart, cashReceived) => handleCheckout(cart, false, undefined, cashReceived)}
            onCheckoutUtang={handleCheckoutUtang}
            onToggleFavorite={handleToggleFavorite}
            onAddItem={handleAddItem}
            customers={customers}
          />
        )}
        {activeTab === 'inventory' && (
          <InventoryList
            items={items}
            stockFilter={inventoryFilter}
            onStockFilterChange={setInventoryFilter}
            expiringCount={expiringItems}
            onAddItem={handleAddItem}
            onTransaction={handleTransaction}
            onUpdateItem={handleUpdateItem}
            onUpdateItemDetails={handleUpdateItemDetails}
            onBulkCategory={handleBulkCategory}
            onDeleteItem={handleDeleteItem}
          />
        )}
        {activeTab === 'history' && (
          <TransactionHistory transactions={transactions} />
        )}
        {activeTab === 'utang' && (
          <UtangList
            utangs={utangs}
            onAddUtang={handleAddUtang}
            onPay={handlePayUtang}
            onPayCustomer={handlePayCustomer}
            onDeleteUtang={handleDeleteUtang}
            onSetCost={handleSetUtangCost}
            onBulkCosts={handleBulkUtangCosts}
            items={items}
            customers={customers}
            onAddCustomer={handleAddCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            storeName={settings.storeName}
          />
        )}
        {activeTab === 'settings' && (
          <Settings
            settings={settings}
            onSave={handleSaveSettings}
            onClearData={handleClearData}
          />
        )}
      </main>

      {/* Phone navigation: thumb-friendly bar at the bottom */}
      <nav
        className="md:hidden shrink-0 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] grid grid-cols-6"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Main"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] font-bold transition-colors ${
                active ? 'text-indigo-700' : 'text-slate-600'
              }`}
            >
              {active && <span className="absolute top-0 inset-x-3 h-[3px] rounded-b-full bg-indigo-600" />}
              <span className="relative">
                <Icon className="w-6 h-6" />
                {tabBadge(id) > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">
                    {tabBadge(id)}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      {showCategoryManager && (
        <CategoryManager
          names={categoryNames}
          items={items}
          onAdd={handleAddCategory}
          onRename={handleRenameCategory}
          onDelete={handleDeleteCategory}
          onClose={() => setShowCategoryManager(false)}
        />
      )}
    </div>
    </CategoriesProvider>
  );
}
