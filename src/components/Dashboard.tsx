import React, { CSSProperties, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Coins,
  Gem,
  HandCoins,
  ListOrdered,
  Package,
  Plus,
  Receipt,
  TrendingUp,
  Trash2,
  ArrowDown,
  ArrowUp,
  Wallet,
} from 'lucide-react';
import { Transaction, InventoryItem, UtangRecord, Expense } from '../types';
import { effectiveCategory } from '../utils/categories';
import { normalizeName } from '../utils/names';
import { isExpiringSoon, isLowStock, utangRemaining } from '../utils/stock';
import { KpiCard } from './dashboard/KpiCard';
import { DayPoint, PerformanceChart, RangeKey } from './dashboard/PerformanceChart';
import { Attention, AttentionItem, CategoryDonut, CategorySlice, SellerRow, TopSellers, UtangSnapshot } from './dashboard/Insights';
import { peso } from './dashboard/format';
import { Mascot } from './Mascot';

interface DashboardProps {
  transactions: Transaction[];
  items: InventoryItem[];
  utangs: UtangRecord[];
  expenses: Expense[];
  onAddExpense: (description: string, amount: number, category?: string) => void;
  onDeleteExpense: (id: string) => void;
  /** Jump to another screen from a card (optionally with the Inventory filter already set) */
  onNavigate?: (tab: 'inventory' | 'utang', inventoryFilter?: 'low' | 'expiring') => void;
}

const MAX_DAYS_SHOWN = 30;

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const round2 = (n: number) => Number(n.toFixed(2));
const rise = (i: number): CSSProperties => ({ ['--i' as string]: i } as CSSProperties);

const growthOf = (current: number, previous: number) => (previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0);

export function Dashboard({ transactions, items, utangs, expenses, onAddExpense, onDeleteExpense, onNavigate = () => undefined }: DashboardProps) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = addDays(todayStart, -1);
  const sevenDaysAgo = addDays(todayStart, -6);
  const fourteenDaysAgo = addDays(todayStart, -13);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const lastMonthStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
  const lastMonthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0);
  const daysInMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0).getDate();
  const dayOfMonth = todayStart.getDate();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Sales and profit are counted when the money comes in: cash sales (OUT) when they are made, and
  // utang when the customer PAYS it (PAYMENT). Utang that is still unpaid is money owed, not earned yet.
  const cashSales = useMemo(() => transactions.filter((t) => t.type === 'OUT'), [transactions]);
  const payments = useMemo(() => transactions.filter((t) => t.type === 'PAYMENT'), [transactions]);
  const utangById = useMemo(() => new Map(utangs.map((u) => [u.id, u])), [utangs]);

  // Profit inside one utang payment = what was paid minus the capital it pays back.
  // New payments carry that capital with them; older ones use the capital of their utang record.
  const paymentProfit = (t: Transaction): number | null => {
    if (t.cost !== undefined) return t.totalPrice - t.cost;
    const u = utangById.get(t.itemId);
    if (u && u.cost !== undefined && u.amount > 0) return t.totalPrice - (t.totalPrice * u.cost) / u.amount;
    return null; // the capital of this utang isn't known, so its profit can't be worked out
  };

  // Per-unit cost (Puhunan), following the sub-item -> parent-item relationship
  const costLookup = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      const parent = item.parentId ? items.find((i) => i.id === item.parentId) : null;
      const cost =
        item.parentId && item.piecesPerParent && parent && parent.costPrice ? parent.costPrice / item.piecesPerParent : item.costPrice ?? 0;
      map.set(item.id, cost);
    });
    return map;
  }, [items]);

  const profitOf = (t: Transaction) => t.totalPrice - (costLookup.get(t.itemId) ?? 0) * t.quantity;

  // One pass over everything: sales, profit and expenses for every calendar day
  const byDay = useMemo(() => {
    const m = new Map<string, { sales: number; profit: number; expenses: number }>();
    const bucket = (key: string) => {
      let b = m.get(key);
      if (!b) m.set(key, (b = { sales: 0, profit: 0, expenses: 0 }));
      return b;
    };
    cashSales.forEach((t) => {
      const b = bucket(dayKey(new Date(t.timestamp)));
      b.sales += t.totalPrice;
      b.profit += profitOf(t);
    });
    // utang payments land on the day the money was received
    payments.forEach((t) => {
      const b = bucket(dayKey(new Date(t.timestamp)));
      b.sales += t.totalPrice;
      b.profit += paymentProfit(t) ?? 0;
    });
    expenses.forEach((e) => {
      bucket(dayKey(new Date(e.date))).expenses += e.amount;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashSales, payments, expenses, costLookup, utangById]);

  // Payments whose capital isn't known yet count as sales but not as profit
  const paymentsWithoutCapital = payments.filter((t) => paymentProfit(t) === null).length;

  const sumDays = (from: Date, to: Date, key: 'sales' | 'profit' | 'expenses') => {
    let total = 0;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) total += byDay.get(dayKey(d))?.[key] ?? 0;
    return total;
  };
  const daysBetween = (from: Date, to: Date) => {
    const list: Date[] = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) list.push(new Date(d));
    return list;
  };

  // ----- headline numbers -----
  const todaySales = sumDays(todayStart, todayStart, 'sales');
  const yesterdaySales = sumDays(yesterdayStart, yesterdayStart, 'sales');
  const weekSales = sumDays(sevenDaysAgo, todayStart, 'sales');
  const prevWeekSales = sumDays(fourteenDaysAgo, addDays(sevenDaysAgo, -1), 'sales');
  const todayProfit = sumDays(todayStart, todayStart, 'profit');
  const yesterdayProfit = sumDays(yesterdayStart, yesterdayStart, 'profit');

  // Monthly profit: this month so far, compared with the same number of days last month
  const monthProfit = sumDays(monthStart, todayStart, 'profit');
  const monthExpenses = sumDays(monthStart, todayStart, 'expenses');
  const monthNet = monthProfit - monthExpenses;
  const lastMonthCompareEnd = new Date(Math.min(lastMonthEnd.getTime(), new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth(), dayOfMonth).getTime()));
  const prevMonthProfit = sumDays(lastMonthStart, lastMonthCompareEnd, 'profit');

  const todayExpenseTotal = sumDays(todayStart, todayStart, 'expenses');
  const weekExpenseTotal = sumDays(sevenDaysAgo, todayStart, 'expenses');

  // ----- trend lines for the cards -----
  const last7 = daysBetween(sevenDaysAgo, todayStart);
  const sparkTodaySales = last7.map((d) => byDay.get(dayKey(d))?.sales ?? 0);
  const sparkDailyProfit = last7.map((d) => byDay.get(dayKey(d))?.profit ?? 0);
  const sparkWeeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(todayStart, -7 * (7 - i));
    return sumDays(addDays(end, -6), end, 'sales');
  });
  const sparkMonth = (() => {
    let running = 0;
    const list = daysBetween(monthStart, todayStart).map((d) => (running += byDay.get(dayKey(d))?.profit ?? 0));
    return list.length === 1 ? [0, list[0]] : list;
  })();

  // ----- performance chart data for each range -----
  const ranges = useMemo((): Record<RangeKey, DayPoint[]> => {
    const point = (d: Date, label: string): DayPoint => {
      const b = byDay.get(dayKey(d));
      return {
        label,
        fullLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        Sales: round2(b?.sales ?? 0),
        Expenses: round2(b?.expenses ?? 0),
        Profit: round2(b?.profit ?? 0),
      };
    };
    const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      '7D': daysBetween(sevenDaysAgo, todayStart).map((d) => point(d, d.toLocaleDateString('en-US', { weekday: 'short' }))),
      '30D': daysBetween(addDays(todayStart, -29), todayStart).map((d) => point(d, short(d))),
      MONTH: daysBetween(monthStart, todayStart).map((d) => point(d, String(d.getDate()))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay, todayStart.getTime()]);

  // ----- this month: top sellers and sales by category -----
  const monthSalesTx = useMemo(
    () =>
      cashSales.filter((t) => {
        const d = startOfDay(new Date(t.timestamp));
        return d >= monthStart && d <= todayStart;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cashSales, monthStart.getTime(), todayStart.getTime()]
  );

  const topSellers = useMemo((): SellerRow[] => {
    const map = new Map<string, SellerRow>();
    monthSalesTx.forEach((t) => {
      const row = map.get(t.itemName) ?? { name: t.itemName, qty: 0, revenue: 0 };
      row.qty += t.quantity;
      row.revenue += t.totalPrice;
      map.set(t.itemName, row);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [monthSalesTx]);

  const categorySlices = useMemo((): CategorySlice[] => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const totals = new Map<string, number>();
    monthSalesTx.forEach((t) => {
      const item = byId.get(t.itemId);
      const name = (item && effectiveCategory(item, items)) || 'Others';
      totals.set(name, (totals.get(name) ?? 0) + t.totalPrice);
    });
    const sorted = [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    if (sorted.length <= 7) return sorted;
    const head = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((sum, s) => sum + s.value, 0);
    const others = head.find((s) => s.name === 'Others');
    if (others) others.value += rest;
    else head.push({ name: 'Others', value: rest });
    return head;
  }, [monthSalesTx, items]);

  // ----- needs attention + utang -----
  const attention: AttentionItem[] = [
    {
      key: 'low',
      label: 'Low stock',
      hint: 'Running low. Time to restock.',
      count: items.filter((i) => isLowStock(i) && i.quantity > 0).length,
      tone: 'warn',
      onOpen: () => onNavigate('inventory', 'low'),
    },
    {
      key: 'out',
      label: 'Out of stock',
      hint: "Can't be sold until restocked.",
      count: items.filter((i) => !i.parentId && i.quantity <= 0).length,
      tone: 'neg',
      onOpen: () => onNavigate('inventory', 'low'),
    },
    {
      key: 'expiring',
      label: 'Expiring soon',
      hint: 'Within 14 days, or already expired.',
      count: items.filter(isExpiringSoon).length,
      tone: 'warn',
      onOpen: () => onNavigate('inventory', 'expiring'),
    },
  ];

  const utangStats = useMemo(() => {
    const owing = utangs.filter((u) => u.status === 'UNPAID' && utangRemaining(u) > 0);
    const unpaid = owing.reduce((sum, u) => sum + utangRemaining(u), 0);
    const given = utangs.reduce((sum, u) => sum + u.amount, 0);
    const paidBack = utangs.reduce((sum, u) => sum + (u.status === 'PAID' ? u.amount : u.paidAmount ?? 0), 0);
    const oldest = owing.reduce<number | null>((min, u) => {
      const t = new Date(u.date).getTime();
      return min === null || t < min ? t : min;
    }, null);
    return {
      unpaid,
      customersOwing: new Set(owing.map((u) => normalizeName(u.customerName))).size,
      collectedShare: given > 0 ? Math.min(1, paidBack / given) : 1,
      oldestDays: oldest === null ? null : Math.max(0, Math.floor((todayStart.getTime() - startOfDay(new Date(oldest)).getTime()) / 86_400_000)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utangs, todayStart.getTime()]);

  // ----- Add expense form -----
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseError, setExpenseError] = useState('');

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (!expenseDesc.trim()) {
      setExpenseError('What was this expense for?');
      return;
    }
    if (!amt || amt <= 0) {
      setExpenseError('Enter an amount greater than ₱0.');
      return;
    }
    onAddExpense(expenseDesc.trim(), amt, expenseCategory.trim() || undefined);
    setExpenseDesc('');
    setExpenseAmount('');
    setExpenseCategory('');
    setExpenseError('');
    setShowExpenseForm(false);
  };

  const recentExpenses = useMemo(
    () => [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8),
    [expenses]
  );

  // ----- Daily Report: one entry per calendar day, newest first -----
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  interface LogEntry {
    id: string;
    time: string;
    kind: 'sale' | 'expense' | 'payment';
    label: string;
    detail: string;
    amount: number;
  }
  interface DayEntry {
    dateObj: Date;
    items: Map<string, number>;
    salesTotal: number;
    profitTotal: number;
    utangTotal: number;
    utangCount: number;
    collectedTotal: number;
    expenseTotal: number;
    log: LogEntry[];
  }

  const dailyReport = useMemo(() => {
    const map = new Map<string, DayEntry>();
    const keyOf = (d: Date) => d.toDateString();
    const emptyDay = (d: Date): DayEntry => ({
      dateObj: startOfDay(d),
      items: new Map(),
      salesTotal: 0,
      profitTotal: 0,
      utangTotal: 0,
      utangCount: 0,
      collectedTotal: 0,
      expenseTotal: 0,
      log: [],
    });

    cashSales.forEach((t) => {
      const d = new Date(t.timestamp);
      const key = keyOf(d);
      if (!map.has(key)) map.set(key, emptyDay(d));
      const entry = map.get(key)!;
      entry.salesTotal += t.totalPrice;
      entry.profitTotal += profitOf(t);
      entry.items.set(t.itemName, (entry.items.get(t.itemName) ?? 0) + t.quantity);
      entry.log.push({ id: t.id, time: d.toISOString(), kind: 'sale', label: t.itemName, detail: `×${t.quantity} sold`, amount: t.totalPrice });
    });

    // Money received from utang counts as sales and profit on the day it was paid
    payments.forEach((t) => {
      const d = new Date(t.timestamp);
      const key = keyOf(d);
      if (!map.has(key)) map.set(key, emptyDay(d));
      const entry = map.get(key)!;
      entry.salesTotal += t.totalPrice;
      entry.profitTotal += paymentProfit(t) ?? 0;
      entry.collectedTotal += t.totalPrice;
      entry.log.push({ id: t.id, time: d.toISOString(), kind: 'payment', label: t.itemName, detail: 'Utang payment', amount: t.totalPrice });
    });

    // Utang given out is listed for visibility, but only counts once it is paid
    utangs.forEach((u) => {
      const d = new Date(u.date);
      const key = keyOf(d);
      if (!map.has(key)) map.set(key, emptyDay(d));
      const entry = map.get(key)!;
      entry.utangTotal += u.amount;
      entry.utangCount += 1;
    });

    expenses.forEach((ex) => {
      const d = new Date(ex.date);
      const key = keyOf(d);
      if (!map.has(key)) map.set(key, emptyDay(d));
      const entry = map.get(key)!;
      entry.expenseTotal += ex.amount;
      entry.log.push({ id: ex.id, time: d.toISOString(), kind: 'expense', label: ex.description, detail: ex.category ? ex.category : 'Expense', amount: ex.amount });
    });

    map.forEach((entry) => entry.log.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()));
    return Array.from(map.values()).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashSales, payments, utangs, expenses, costLookup, utangById]);

  const visibleDays = dailyReport.slice(0, MAX_DAYS_SHOWN);
  const isToday = (d: Date) => d.getTime() === todayStart.getTime();
  const isYesterday = (d: Date) => d.getTime() === yesterdayStart.getTime();

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="dx flex-1 min-h-0 flex flex-col gap-5 overflow-y-auto pb-6 [&>*]:shrink-0">
      {/* Title: the hamster mascot watches your pointer next to the greeting */}
      <div className="dx-rise flex items-center justify-between gap-x-4 gap-y-2 flex-wrap px-0.5">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <Mascot />
          <div className="min-w-0">
            <p className="dx-label">Business overview</p>
            <h1 className="text-xl md:text-3xl font-black mt-0.5" style={{ color: 'var(--dx-text)', letterSpacing: '-0.02em' }}>
              {greeting}
            </h1>
            <p className="text-sm font-semibold dx-muted mt-0.5">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          index={0}
          label="Today's Sales"
          value={todaySales}
          icon={Coins}
          growth={growthOf(todaySales, yesterdaySales)}
          compareLabel={`vs yesterday ${peso(yesterdaySales)}`}
          spark={sparkTodaySales}
          accent={['#6366f1', '#8b5cf6']}
        />
        <KpiCard
          index={1}
          label="This Week's Sales"
          value={weekSales}
          icon={CalendarDays}
          growth={growthOf(weekSales, prevWeekSales)}
          compareLabel={`vs last week ${peso(prevWeekSales)}`}
          spark={sparkWeeks}
          accent={['#0ea5e9', '#06b6d4']}
        />
        <KpiCard
          index={2}
          label="Daily Profit"
          value={todayProfit}
          icon={TrendingUp}
          growth={growthOf(todayProfit, yesterdayProfit)}
          className="col-span-2 lg:col-span-1"
          compareLabel={`vs yesterday ${peso(yesterdayProfit)}`}
          spark={sparkDailyProfit}
          accent={['#10b981', '#34d399']}
        />
        <KpiCard
          hero
          index={3}
          className="col-span-2 lg:col-span-1 order-first lg:order-none"
          label={`${monthName} Profit`}
          value={monthProfit}
          icon={Gem}
          growth={growthOf(monthProfit, prevMonthProfit)}
          compareLabel={`vs same days last month ${peso(prevMonthProfit)}`}
          spark={sparkMonth}
          accent={['#fbbf24', '#f472b6']}
          extra={
            <div>
              <div className="flex items-center justify-between text-xs font-semibold dx-muted mb-1.5">
                <span>{monthLabel}</span>
                <span>
                  Day {dayOfMonth} of {daysInMonth}
                </span>
              </div>
              <div className="dx-progress" role="progressbar" aria-valuemin={0} aria-valuemax={daysInMonth} aria-valuenow={dayOfMonth} aria-label="Days into the month">
                <span style={{ width: `${(dayOfMonth / daysInMonth) * 100}%` }} />
              </div>
              <p className="text-xs font-semibold dx-muted mt-2">
                After {peso(monthExpenses)} expenses:{' '}
                <strong className="text-white dx-num" style={{ fontWeight: 800 }}>
                  {monthNet < 0 ? '-' : ''}
                  {peso(Math.abs(monthNet))}
                </strong>
              </p>
            </div>
          }
        />
      </div>
      <p className="text-xs font-semibold dx-muted -mt-2 px-0.5">
        These numbers count cash sales and utang payments received. Utang that is still unpaid is not counted until it is paid.
        {paymentsWithoutCapital > 0 && (
          <>
            {' '}
            {paymentsWithoutCapital} {paymentsWithoutCapital === 1 ? 'payment is' : 'payments are'} in sales but not in profit yet, because the capital of that utang isn't set.{' '}
            <button type="button" onClick={() => onNavigate('utang')} className="font-bold underline" style={{ color: 'var(--dx-accent)' }}>
              Set capital in Utang
            </button>
          </>
        )}
      </p>

      {/* Chart + what needs attention */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
        <div className="xl:col-span-2 min-w-0 flex">
          <PerformanceChart ranges={ranges} monthLabel={monthLabel} />
        </div>
        <div className="flex flex-col gap-4 md:gap-5 min-w-0">
          <Attention items={attention} />
          <UtangSnapshot stats={utangStats} onOpen={() => onNavigate('utang')} />
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <TopSellers rows={topSellers} monthLabel={monthName} />
        <CategoryDonut slices={categorySlices} monthLabel={monthName} />
      </div>

      {/* Expenses */}
      <div className="dx-card overflow-hidden dx-rise" style={rise(8)}>
        <div className="dx-head">
          <div>
            <h2 className="dx-title">Expenses</h2>
            <p className="dx-sub dx-num">
              Today {peso(todayExpenseTotal)} · This week {peso(weekExpenseTotal)} · {monthName} {peso(monthExpenses)}
            </p>
          </div>
          <button onClick={() => setShowExpenseForm((v) => !v)} className="dx-btn primary" aria-expanded={showExpenseForm}>
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>

        {showExpenseForm && (
          <form onSubmit={handleAddExpense} className="px-5 py-4 space-y-3" style={{ background: 'var(--dx-card-soft)', borderBottom: '1px solid var(--dx-border)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="ex-desc" className="dx-label">What was it for?</label>
                <input
                  id="ex-desc"
                  type="text"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder="e.g. Delivery fee, Ice, Electricity"
                  className="dx-input mt-1.5"
                />
              </div>
              <div>
                <label htmlFor="ex-amt" className="dx-label">Amount</label>
                <input
                  id="ex-amt"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="₱0.00"
                  className="dx-input mt-1.5"
                />
              </div>
            </div>
            <div>
              <label htmlFor="ex-cat" className="dx-label">Category (optional)</label>
              <input
                id="ex-cat"
                type="text"
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                placeholder="e.g. Utilities, Restock, Transport"
                className="dx-input mt-1.5"
              />
            </div>
            {expenseError && (
              <p role="alert" className="text-sm font-bold" style={{ color: 'var(--dx-neg)' }}>
                {expenseError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button type="submit" className="dx-btn primary">
                Save Expense
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExpenseForm(false);
                  setExpenseError('');
                }}
                className="dx-btn ghost"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {recentExpenses.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold dx-muted">No expenses recorded yet.</div>
        ) : (
          <ul className="dx-divide">
            {recentExpenses.map((ex) => (
              <li key={ex.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="dx-icon" style={{ background: 'var(--dx-neg-soft)', color: 'var(--dx-neg)', width: 34, height: 34, borderRadius: 11 }}>
                    <Receipt className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--dx-text)' }}>
                      {ex.description}
                    </p>
                    <p className="text-xs font-semibold dx-muted">
                      {new Date(ex.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {ex.category ? ` · ${ex.category}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-extrabold dx-num" style={{ color: 'var(--dx-neg)' }}>
                    -{peso(ex.amount)}
                  </span>
                  <button
                    onClick={() => onDeleteExpense(ex.id)}
                    className="p-2 rounded-lg dx-muted hover:text-rose-600 transition-colors"
                    title="Delete expense"
                    aria-label={`Delete expense ${ex.description}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Daily Report */}
      <div className="dx-card overflow-hidden dx-rise" style={rise(9)}>
        <div className="dx-head">
          <div>
            <h2 className="dx-title">Daily Report</h2>
            <p className="dx-sub">
              Items sold and profit per day, with expenses and a full transaction log. Utang counts as sales and profit on the day it is paid.
            </p>
          </div>
          {dailyReport.length > MAX_DAYS_SHOWN && <span className="dx-label">Showing most recent {MAX_DAYS_SHOWN} days</span>}
        </div>

        {visibleDays.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold dx-muted">No sales or utang recorded yet.</div>
        ) : (
          <ul className="dx-divide">
            {visibleDays.map((day) => {
              const itemEntries = Array.from(day.items.entries()).sort((a, b) => b[1] - a[1]);
              const dateLabel = isToday(day.dateObj)
                ? 'Today'
                : isYesterday(day.dateObj)
                ? 'Yesterday'
                : day.dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
              const open = expandedDay === day.dateObj.toISOString();

              return (
                <li key={day.dateObj.toISOString()} className="px-5 py-4">
                  <div className="flex items-start justify-between flex-wrap gap-2 mb-2.5">
                    <div>
                      <span className="font-extrabold text-sm" style={{ color: 'var(--dx-text)' }}>
                        {dateLabel}
                      </span>
                      <span className="text-xs font-semibold dx-muted ml-2 dx-num">{peso(day.salesTotal)} in sales</span>
                    </div>
                    <span className={`dx-pill ${day.profitTotal >= 0 ? 'pos' : 'neg'}`}>
                      {day.profitTotal >= 0 ? '+' : '-'}
                      {peso(Math.abs(day.profitTotal))} profit
                    </span>
                  </div>

                  {itemEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {itemEntries.map(([name, qty]) => (
                        <span key={name} className="dx-chip">
                          <Package className="w-3 h-3 dx-muted" />
                          {name} <span className="dx-muted">×{qty}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {day.collectedTotal > 0 && (
                      <div className="dx-notice pos">
                        <HandCoins className="w-3.5 h-3.5 shrink-0" />
                        {peso(day.collectedTotal)} collected from utang payments, included in sales and profit
                      </div>
                    )}
                    {day.utangCount > 0 && (
                      <div className="dx-notice warn">
                        <HandCoins className="w-3.5 h-3.5 shrink-0" />
                        {peso(day.utangTotal)} given as Utang ({day.utangCount} {day.utangCount === 1 ? 'record' : 'records'}), counted once it is paid
                      </div>
                    )}
                    {day.expenseTotal > 0 && (
                      <div className="dx-notice neg">
                        <Wallet className="w-3.5 h-3.5 shrink-0" />
                        {peso(day.expenseTotal)} spent on expenses
                      </div>
                    )}
                  </div>

                  {day.log.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedDay(open ? null : day.dateObj.toISOString())}
                        aria-expanded={open}
                        className="flex items-center gap-1.5 min-h-[36px] text-xs font-bold"
                        style={{ color: 'var(--dx-accent)' }}
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                        {open ? 'Hide transaction log' : `View transaction log (${day.log.length})`}
                        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {open && (
                        <ul className="mt-2 rounded-2xl overflow-hidden dx-divide" style={{ border: '1px solid var(--dx-border)', background: 'var(--dx-card-soft)' }}>
                          {day.log.map((entry) => (
                            <li key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="shrink-0 w-6 h-6 rounded-lg inline-flex items-center justify-center"
                                  style={entry.kind === 'expense' ? { background: 'var(--dx-neg-soft)', color: 'var(--dx-neg)' } : { background: 'var(--dx-pos-soft)', color: 'var(--dx-pos)' }}
                                >
                                  {entry.kind === 'expense' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate" style={{ color: 'var(--dx-text)' }}>
                                    {entry.label}
                                  </p>
                                  <p className="text-[11px] font-semibold dx-muted">
                                    {new Date(entry.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {entry.detail}
                                  </p>
                                </div>
                              </div>
                              <span className="shrink-0 text-xs font-extrabold dx-num" style={{ color: entry.kind === 'expense' ? 'var(--dx-neg)' : 'var(--dx-pos)' }}>
                                {entry.kind === 'expense' ? '-' : '+'}
                                {peso(entry.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
