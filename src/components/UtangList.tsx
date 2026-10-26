import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, FileText, Trash2, Printer, Copy, Share2 } from 'lucide-react';
import { UtangRecord } from '../types';
import { capsWhileTyping, normalizeName } from '../utils/names';
import { utangRemaining } from '../utils/stock';
import { estimateCapital } from '../utils/utangCapital';
import { InventoryItem } from '../types';
import { useToast } from './Toast';

interface UtangListProps {
  utangs: UtangRecord[];
  onAddUtang: (customerName: string, itemsDescription: string, amount: number, cost?: number) => void;
  /** Set (or clear, with null) the capital of one utang record */
  onSetCost: (id: string, cost: number | null) => Promise<boolean>;
  /** Fill in the capital of many utang records at once */
  onBulkCosts: (updates: { id: string; cost: number }[]) => Promise<boolean>;
  /** Your products, used to work out the capital of utang that was typed in by hand */
  items: InventoryItem[];
  /** Receive a payment on one record. No amount = pay the whole remaining balance. Resolves true when it saved. */
  onPay: (id: string, amount?: number) => Promise<boolean>;
  /** Receive a payment from a customer; applied to their oldest unpaid records first. */
  onPayCustomer: (customerName: string, amount: number) => Promise<boolean>;
  /** Delete one utang record. Resolves true when it worked. */
  onDeleteUtang: (id: string) => Promise<boolean>;
  customers: string[];
  onAddCustomer: (name: string) => void;
  /** Delete a ledger name. withRecords also removes all of that customer's utang records. Resolves true when it worked. */
  onDeleteCustomer: (customerName: string, withRecords: boolean) => Promise<boolean>;
  storeName: string;
}

type Totals = {
  total: number;
  paid: number;
  unpaid: number;
  /** Capital (puhunan) of the utang whose capital is known */
  capital: number;
  /** Profit on that same utang (amount minus capital) */
  profit: number;
  /** The part of the capital that has not been paid back yet */
  capitalOut: number;
  /** The part of the profit already collected */
  profitIn: number;
  /** How many records have no capital yet */
  unknown: number;
};

/** Boxes for: all utang given, paid, unpaid, and the capital and profit inside it. */
function TotalsStrip({ total, paid, unpaid, capital, profit, capitalOut, profitIn, unknown, label }: Totals & { label?: string }) {
  const box = (name: React.ReactNode, value: string, tone: string, span: string, sub?: string) => (
    <div className={`${span} min-w-0 bg-white border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600 truncate">{name}</div>
      <div className={`font-mono font-black whitespace-nowrap text-[13px] sm:text-base ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] font-semibold text-slate-600 truncate">{sub}</div>}
    </div>
  );
  const known = unknown === 0 || capital > 0 || profit !== 0;
  const peso2 = (n: number) => `₱${n.toFixed(2)}`;
  return (
    <div aria-label={label ?? 'Utang totals'} className="grid grid-cols-6 md:grid-cols-5 gap-2">
      {box(<><span className="sm:hidden">Total</span><span className="hidden sm:inline">Total utang</span></>, peso2(total), 'text-slate-800', 'col-span-2 md:col-span-1')}
      {box('Paid', peso2(paid), 'text-emerald-700', 'col-span-2 md:col-span-1')}
      {box('Unpaid', peso2(unpaid), unpaid > 0 ? 'text-red-600' : 'text-slate-600', 'col-span-2 md:col-span-1')}
      {box('Capital', known ? peso2(capital) : '—', 'text-slate-800', 'col-span-3 md:col-span-1', known ? `${peso2(capitalOut)} not paid back` : 'not set yet')}
      {box('Profit', known ? peso2(profit) : '—', profit >= 0 ? 'text-emerald-700' : 'text-red-600', 'col-span-3 md:col-span-1', known ? `${peso2(profitIn)} collected` : 'not set yet')}
    </div>
  );
}

/** "Capital ₱65.00 · Profit ₱35.00" under a utang record. Tap it to change the capital. */
function CapitalLine({ utang, onEdit, className = '' }: { utang: UtangRecord; onEdit: () => void; className?: string }) {
  if (utang.cost === undefined) {
    return (
      <button type="button" onClick={onEdit} className={`tap-compact text-[11px] sm:text-xs font-bold text-indigo-700 hover:underline ${className}`}>
        + Add capital
      </button>
    );
  }
  const profit = utang.amount - utang.cost;
  return (
    <button type="button" onClick={onEdit} title="Change the capital" className={`tap-compact text-[11px] sm:text-xs font-semibold text-slate-600 hover:underline ${className}`}>
      Capital ₱{utang.cost.toFixed(2)} ·{' '}
      <span className={`font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>Profit ₱{profit.toFixed(2)}</span>
    </button>
  );
}

// Soft colors for the round letter badge on each customer card
const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];
const avatarColor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export function UtangList({ utangs, onAddUtang, onPay, onPayCustomer, onDeleteUtang, onSetCost, onBulkCosts, items, customers, onAddCustomer, onDeleteCustomer, storeName }: UtangListProps) {
  const toast = useToast();
  const itemsInputRef = useRef<HTMLInputElement>(null);
  // Phones: the new-utang form opens as a bottom sheet instead of taking space all the time
  const [showNewUtang, setShowNewUtang] = useState(false);
  const [newCustomer, setNewCustomer] = useState('');
  const [newItems, setNewItems] = useState('');
  const [newAmount, setNewAmount] = useState('');
  // Capital of what is being recorded: worked out from your products while you type, unless you type your own
  const [newCapital, setNewCapital] = useState('');
  const [capitalTouched, setCapitalTouched] = useState(false);
  const [costBannerHidden, setCostBannerHidden] = useState(false);
  const [capEdit, setCapEdit] = useState<{ id: string; label: string; amount: number; current?: number; suggested: number | null } | null>(null);
  const [capValue, setCapValue] = useState('');
  const [capSaving, setCapSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'ALL' | 'OWING'>('ALL');
  const [recordQuery, setRecordQuery] = useState('');
  const [recordFilter, setRecordFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');

  // Payment dialog: pays one record, or spreads a payment over everything a customer owes
  const [payTarget, setPayTarget] = useState<
    { kind: 'record'; id: string; title: string; remaining: number } | { kind: 'customer'; name: string; title: string; remaining: number } | null
  >(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  // Itemized list (statement) of one customer's utang
  const [showStatement, setShowStatement] = useState(false);
  const [statementScope, setStatementScope] = useState<'UNPAID' | 'ALL'>('UNPAID');

  // Names are grouped in ALL CAPS, so "juan" and "JUAN" are the same customer.
  // Registered names (+ Ledger) are listed too, even before they have any utang.
  const customerSummary: Record<string, { totalUnpaid: number; count: number; latestDate: string | null }> = {};
  for (const c of customers) {
    const key = normalizeName(c);
    if (key && !customerSummary[key]) customerSummary[key] = { totalUnpaid: 0, count: 0, latestDate: null };
  }
  for (const utang of utangs) {
    const key = normalizeName(utang.customerName);
    if (!customerSummary[key]) customerSummary[key] = { totalUnpaid: 0, count: 0, latestDate: null };
    const entry = customerSummary[key];
    entry.count++;
    entry.totalUnpaid += utangRemaining(utang);
    if (!entry.latestDate || new Date(utang.date) > new Date(entry.latestDate)) entry.latestDate = utang.date;
  }

  // Every word you type must appear in the name, in any order ("de la cruz" finds "JUAN DE LA CRUZ").
  const nameTokens = normalizeName(searchQuery).split(' ').filter(Boolean);
  const allNames = Object.keys(customerSummary);
  const owingCount = allNames.filter((n) => customerSummary[n].totalUnpaid > 0).length;

  const filteredCustomers = allNames
    .filter((name) => nameTokens.every((t) => name.includes(t)))
    .filter((name) => balanceFilter === 'ALL' || customerSummary[name].totalUnpaid > 0)
    .sort((a, b) => customerSummary[b].totalUnpaid - customerSummary[a].totalUnpaid || a.localeCompare(b));

  const customerUtangs = utangs.filter((utang) => normalizeName(utang.customerName) === selectedCustomer);
  const unpaidCount = customerUtangs.filter((u) => u.status === 'UNPAID').length;
  const paidCount = customerUtangs.length - unpaidCount;
  const selectedUnpaidTotal = selectedCustomer ? customerSummary[selectedCustomer]?.totalUnpaid ?? 0 : 0;

  const recordTokens = recordQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredUtangs = customerUtangs
    .filter((u) => recordFilter === 'ALL' || u.status === recordFilter)
    .filter((u) => {
      if (recordTokens.length === 0) return true;
      const haystack = `${u.itemsDescription} ${u.amount} ${u.amount.toFixed(2)} ${new Date(u.date).toLocaleDateString()} ${u.status}`.toLowerCase();
      return recordTokens.every((t) => haystack.includes(t));
    });

  const openPayRecord = (utang: { id: string; itemsDescription: string; amount: number; status: 'UNPAID' | 'PAID'; paidAmount?: number }) => {
    const remaining = utangRemaining(utang as any);
    setPayTarget({ kind: 'record', id: utang.id, title: utang.itemsDescription || 'This utang', remaining });
    setPayAmount(remaining.toFixed(2));
  };

  const openPayCustomer = () => {
    if (!selectedCustomer) return;
    setPayTarget({ kind: 'customer', name: selectedCustomer, title: `All unpaid records of ${selectedCustomer}`, remaining: selectedUnpaidTotal });
    setPayAmount(selectedUnpaidTotal.toFixed(2));
  };

  const payNumber = parseFloat(payAmount);
  const payValid = Boolean(payTarget) && Number.isFinite(payNumber) && payNumber > 0 && payNumber <= (payTarget?.remaining ?? 0) + 0.001;
  const payLeftAfter = payTarget && payValid ? Math.max(0, payTarget.remaining - payNumber) : payTarget?.remaining ?? 0;

  const confirmPayment = async () => {
    if (!payTarget || !payValid || paying) return;
    setPaying(true);
    const full = payNumber >= payTarget.remaining - 0.001;
    const ok =
      payTarget.kind === 'record'
        ? await onPay(payTarget.id, full ? undefined : payNumber)
        : await onPayCustomer(payTarget.name, payNumber);
    setPaying(false);
    if (ok) setPayTarget(null);
  };

  // ----- Delete a ledger name -----
  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;
    const count = customerUtangs.length;
    const owed = selectedUnpaidTotal;
    const message =
      count === 0
        ? 'This removes the name from your list.'
        : owed > 0
        ? `${selectedCustomer} still owes ₱${owed.toFixed(2)}. Deleting removes the name and all ${count} utang ${count === 1 ? 'record' : 'records'}, so that debt will be lost. This cannot be undone.`
        : `This removes the name and ${count} fully paid utang ${count === 1 ? 'record' : 'records'}. Your sales history stays. This cannot be undone.`;
    const ok = await toast.confirm({
      title: `Delete ${selectedCustomer}?`,
      message,
      confirmLabel: owed > 0 ? 'Delete anyway' : 'Delete',
      danger: true,
    });
    if (!ok) return;
    const done = await onDeleteCustomer(selectedCustomer, count > 0);
    if (done) {
      setSelectedCustomer(null);
      setNewCustomer('');
      setRecordQuery('');
      setRecordFilter('ALL');
    }
  };

  // ----- Itemized list (statement) -----
  const paidOf = (u: UtangRecord) => (u.status === 'PAID' ? u.amount : u.paidAmount ?? 0);
  const statementRecords = customerUtangs
    .filter((u) => statementScope === 'ALL' || u.status === 'UNPAID')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const stmtTotal = statementRecords.reduce((sum, u) => sum + u.amount, 0);
  const stmtPaid = statementRecords.reduce((sum, u) => sum + paidOf(u), 0);
  const stmtBalance = statementRecords.reduce((sum, u) => sum + utangRemaining(u), 0);
  const stmtDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const totalsOf = (list: UtangRecord[]): Totals => {
    const withCapital = list.filter((u) => u.cost !== undefined && u.amount > 0);
    // capital and profit are split across payments in the same proportion as the utang itself
    const share = (u: UtangRecord) => Math.min(1, (u.cost ?? 0) / u.amount);
    return {
      total: list.reduce((sum, u) => sum + u.amount, 0),
      paid: list.reduce((sum, u) => sum + paidOf(u), 0),
      unpaid: list.reduce((sum, u) => sum + utangRemaining(u), 0),
      capital: withCapital.reduce((sum, u) => sum + (u.cost ?? 0), 0),
      profit: withCapital.reduce((sum, u) => sum + (u.amount - (u.cost ?? 0)), 0),
      capitalOut: withCapital.reduce((sum, u) => sum + utangRemaining(u) * share(u), 0),
      profitIn: withCapital.reduce((sum, u) => sum + paidOf(u) * (1 - share(u)), 0),
      unknown: list.length - withCapital.length,
    };
  };
  const allTotals = totalsOf(utangs);
  const customerTotals = totalsOf(customerUtangs);

  const handleDeleteRecord = async (u: UtangRecord) => {
    const paid = paidOf(u);
    const ok = await toast.confirm({
      title: 'Delete this utang?',
      message:
        `${selectedCustomer ?? u.customerName}: ${u.itemsDescription || 'no items'} (₱${u.amount.toFixed(2)}). ` +
        (paid > 0 ? `The ₱${paid.toFixed(2)} already paid stays in your History. ` : '') +
        'Stock is not returned. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await onDeleteUtang(u.id);
  };

  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const statementText = () => {
    const lines = statementRecords.map(
      (u, i) =>
        `${i + 1}. ${shortDate(u.date)} - ${u.itemsDescription || '-'}: ₱${u.amount.toFixed(2)}` +
        (paidOf(u) > 0 ? ` (paid ₱${paidOf(u).toFixed(2)}, balance ₱${utangRemaining(u).toFixed(2)})` : '')
    );
    return [
      `${storeName} - UTANG STATEMENT`,
      `Customer: ${selectedCustomer}`,
      `Date: ${stmtDate}`,
      statementScope === 'UNPAID' ? 'Showing: unpaid items' : 'Showing: all items',
      '',
      ...(lines.length ? lines : ['(no items)']),
      '',
      `Total: ₱${stmtTotal.toFixed(2)}`,
      `Paid: ₱${stmtPaid.toFixed(2)}`,
      `BALANCE DUE: ₱${stmtBalance.toFixed(2)}`,
    ].join('\n');
  };

  const copyStatement = async () => {
    try {
      await navigator.clipboard.writeText(statementText());
      toast.success('Statement copied. You can paste it in a message.');
    } catch {
      toast.error("Couldn't copy. Try Share or Print instead.");
    }
  };

  const shareStatement = async () => {
    try {
      await navigator.share({ title: `Utang statement - ${selectedCustomer}`, text: statementText() });
    } catch {
      /* the person closed the share sheet */
    }
  };

  // Quick-pick names for the phone form: people who owe the most first
  const typedTokens = normalizeName(newCustomer).split(' ').filter(Boolean);
  const nameSuggestions = [...allNames]
    .sort((a, b) => customerSummary[b].totalUnpaid - customerSummary[a].totalUnpaid || a.localeCompare(b))
    .filter((n) => n !== normalizeName(newCustomer) && typedTokens.every((t) => n.includes(t)))
    .slice(0, 6);

  // ----- Capital: records with none yet, and what can be worked out from your products -----
  const scopeUtangs = selectedCustomer ? customerUtangs : utangs;
  const autoCostable = useMemo(
    () =>
      scopeUtangs
        .filter((u) => u.cost === undefined)
        .map((u) => ({ u, cost: estimateCapital(u.itemsDescription, u.amount, items) }))
        .filter((x): x is { u: UtangRecord; cost: number } => x.cost !== null),
    [scopeUtangs, items]
  );

  const handleAutoCompute = async () => {
    const capital = autoCostable.reduce((sum, x) => sum + x.cost, 0);
    const profit = autoCostable.reduce((sum, x) => sum + (x.u.amount - x.cost), 0);
    const missing = scopeUtangs.filter((u) => u.cost === undefined).length;
    const ok = await toast.confirm({
      title: `Work out capital for ${autoCostable.length} of ${missing} records?`,
      message: `Capital ₱${capital.toFixed(2)}, profit ₱${profit.toFixed(2)}. It is an estimate from each record's item names and your products' prices and costs, so you can change any record later. Records it can't match stay empty.`,
      confirmLabel: 'Work it out',
    });
    if (ok) await onBulkCosts(autoCostable.map((x) => ({ id: x.u.id, cost: x.cost })));
  };

  const openCapEdit = (u: UtangRecord) => {
    setCapEdit({ id: u.id, label: u.itemsDescription || 'This utang', amount: u.amount, current: u.cost, suggested: estimateCapital(u.itemsDescription, u.amount, items) });
    setCapValue(u.cost !== undefined ? u.cost.toFixed(2) : '');
  };
  const capNumber = parseFloat(capValue);
  const capValid = capValue !== '' && Number.isFinite(capNumber) && capNumber >= 0 && capNumber <= (capEdit?.amount ?? 0) + 0.001;
  const saveCap = async (value: number | null) => {
    if (!capEdit || capSaving) return;
    setCapSaving(true);
    const ok = await onSetCost(capEdit.id, value);
    setCapSaving(false);
    if (ok) setCapEdit(null);
  };

  const openCustomer = (name: string) => {
    setSelectedCustomer(name);
    setNewCustomer(name);
    setRecordQuery('');
    setRecordFilter('ALL');
  };

  const registeredNames = Array.from(new Set(customers.map(normalizeName).filter(Boolean))).sort();

  // Work out the capital of what is being recorded while it is typed, unless a capital was typed in
  useEffect(() => {
    if (capitalTouched) return;
    const guess = estimateCapital(newItems, parseFloat(newAmount), items);
    setNewCapital(guess === null ? '' : guess.toFixed(2));
  }, [newItems, newAmount, capitalTouched, items]);

  const handleAddUtang = (e: React.FormEvent) => {
    e.preventDefault();
    // Inside a customer's ledger the utang always goes to that customer
    const name = selectedCustomer ?? normalizeName(newCustomer);
    if (name && newAmount) {
      const amount = parseFloat(newAmount);
      const capital = parseFloat(newCapital);
      onAddUtang(name, newItems, amount, Number.isFinite(capital) && capital >= 0 ? Math.min(capital, amount) : undefined);
      if (!registeredNames.includes(name)) {
        onAddCustomer(name);
      }
      // Keep the name when recording inside a ledger, so the next utang can be added right away
      if (!selectedCustomer) setNewCustomer('');
      setNewItems('');
      setNewAmount('');
      setNewCapital('');
      setCapitalTouched(false);
      setShowNewUtang(false);
      if (selectedCustomer) itemsInputRef.current?.focus();
    }
  };

  const handleRegisterLedger = (e: React.FormEvent) => {
    e.preventDefault();
    const name = normalizeName(registerName);
    if (!name) return;
    if (customerSummary[name]) {
      toast.info(`${name} is already in your list.`);
      setRegisterName('');
      setShowRegisterForm(false);
      setSearchQuery(name);
      return;
    }
    onAddCustomer(name);
    toast.success(`${name} added to your list.`);
    setRegisterName('');
    setShowRegisterForm(false);
    // Make sure the new name is visible, not hidden by an old search or the "May utang" filter
    setSearchQuery('');
    setBalanceFilter('ALL');
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
      <div className="p-3 md:p-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className={`relative ${selectedCustomer ? 'w-auto shrink-0' : 'w-full'} sm:max-w-md flex items-center gap-2`}>
          {selectedCustomer ? (
            <button 
              onClick={() => { setSelectedCustomer(null); setNewCustomer(''); setRecordQuery(''); setRecordFilter('ALL'); }}
              className="text-slate-700 hover:text-indigo-700 font-bold text-xs sm:text-sm bg-slate-100 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors min-h-[40px] border border-slate-200 flex items-center gap-1"
            >
              <span className="sm:hidden" aria-label="Back to customers">&larr;<span className="sr-only">Back to customers</span></span>
              <span className="hidden sm:inline">&larr; Back to Customers</span>
            </button>
          ) : showRegisterForm ? (
            <form onSubmit={handleRegisterLedger} className="flex w-full items-center gap-2">
              <input
                type="text"
                placeholder="NEW LEDGER NAME..."
                value={registerName}
                onChange={(e) => setRegisterName(capsWhileTyping(e.target.value))}
                autoFocus
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3.5 text-sm md:text-base font-medium uppercase focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-colors"
              />
              <button 
                type="submit"
                className="bg-indigo-600 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap min-h-[40px]"
              >
                Save
              </button>
              <button 
                type="button"
                onClick={() => setShowRegisterForm(false)}
                className="text-slate-600 hover:text-slate-800 font-bold text-xs sm:text-sm px-3 py-2"
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(capsWhileTyping(e.target.value))}
                  className="pl-10 pr-9 w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3.5 text-sm md:text-base font-medium uppercase placeholder:normal-case focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button 
                onClick={() => setShowRegisterForm(true)}
                className="text-indigo-700 font-bold text-xs sm:text-sm whitespace-nowrap bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2 rounded-xl transition-colors border border-indigo-200 shrink-0 min-h-[40px]"
              >
                + Ledger
              </button>
            </>
          )}
        </div>
        {selectedCustomer && (
          <div className="flex-1 min-w-0 text-right text-base md:text-base font-black text-slate-800 truncate pl-3">
            {selectedCustomer}<span className="hidden sm:inline"> · UTANG</span>
          </div>
        )}
      </div>
      
      <div className="overflow-auto flex-grow">
        {/* On phones these scroll away with the list to leave room for customers; on bigger screens they stay in view */}
        <div className="md:sticky md:top-0 md:z-10">
      {!showRegisterForm && autoCostable.length > 0 && !costBannerHidden && (
        <div className="px-3 md:px-4 py-2.5 border-b border-indigo-200 bg-indigo-50 flex items-center gap-2 flex-wrap shrink-0">
          <p className="text-xs sm:text-sm font-semibold text-indigo-800 flex-1 min-w-[180px]">
            {autoCostable.length} {autoCostable.length === 1 ? 'utang record has' : 'utang records have'} no capital yet. Work it out from your products?
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setCostBannerHidden(true)}
              className="min-h-[40px] px-3 rounded-lg text-indigo-700 hover:bg-indigo-100 text-xs sm:text-sm font-bold transition-colors"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleAutoCompute}
              className="min-h-[40px] px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
            >
              Auto-compute
            </button>
          </div>
        </div>
      )}

      {!selectedCustomer && !showRegisterForm && utangs.length > 0 && (
        <div className="px-3 md:px-4 pt-2.5 pb-1.5 bg-slate-50 border-b border-slate-200 shrink-0">
          <TotalsStrip {...allTotals} label="Totals for all customers" />
        </div>
      )}

      {/* Quick filters + search */}
      {!selectedCustomer && !showRegisterForm && allNames.length > 0 && (
        <div className="px-3 md:px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2 flex-wrap shrink-0">
          {([
            ['ALL', `All (${allNames.length})`],
            ['OWING', `May utang (${owingCount})`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setBalanceFilter(value)}
              className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold border transition-colors ${
                balanceFilter === value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-xs font-bold text-slate-600 ml-auto">
            {filteredCustomers.length} shown
          </span>
        </div>
      )}

      {selectedCustomer && (
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-col gap-2 shrink-0">
          <TotalsStrip {...customerTotals} label={`Totals for ${selectedCustomer}`} />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search items, amount, or date..."
              value={recordQuery}
              onChange={(e) => setRecordQuery(e.target.value)}
              className="pl-9 pr-9 w-full bg-white border border-slate-300 rounded-xl py-2 px-3.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
            />
            {recordQuery && (
              <button
                type="button"
                onClick={() => setRecordQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              ['ALL', `All (${customerUtangs.length})`],
              ['UNPAID', `Unpaid (${unpaidCount})`],
              ['PAID', `Paid (${paidCount})`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRecordFilter(value)}
                className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold border transition-colors ${
                  recordFilter === value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_1.5fr_auto] sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setShowStatement(true)}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs sm:text-sm font-bold transition-colors"
            >
              <FileText className="w-4 h-4 shrink-0" />
              Item list
            </button>
            <button
              type="button"
              onClick={openPayCustomer}
              disabled={selectedUnpaidTotal <= 0}
              className="min-h-[44px] px-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold shadow-xs transition-colors whitespace-nowrap"
            >
              Receive payment
            </button>
            <button
              type="button"
              onClick={handleDeleteCustomer}
              aria-label="Delete name"
              title="Delete name"
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs sm:text-sm font-bold transition-colors"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Delete name</span>
            </button>
          </div>
        </div>
      )}
        </div>

        {!selectedCustomer ? (
          <>
            {/* Phone layout: one card per customer */}
            <ul className="md:hidden p-2.5 space-y-2">
              {filteredCustomers.length === 0 ? (
                <li className="py-10 text-center text-sm font-semibold text-slate-600">
                  {allNames.length === 0 ? 'No customers yet. Tap "+ Ledger" to add one.' : balanceFilter === 'OWING' && !searchQuery ? 'Nobody owes anything right now.' : 'No customer found matching your search.'}
                </li>
              ) : (
                filteredCustomers.map((name) => {
                  const summary = customerSummary[name];
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => openCustomer(name)}
                        className={`w-full text-left rounded-xl border shadow-sm bg-white px-3 py-2.5 flex items-center gap-3 min-h-[64px] active:scale-[0.99] transition-transform ${
                          summary.totalUnpaid > 0 ? 'border-red-200' : 'border-slate-200'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-base font-black ${avatarColor(name)}`}
                        >
                          {name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-base text-slate-800 leading-snug truncate">{name}</span>
                          <span className="block text-xs text-slate-600 mt-0.5 whitespace-nowrap">
                            {summary.count === 0
                              ? 'No utang yet'
                              : `${summary.count} ${summary.count === 1 ? 'record' : 'records'} · ${new Date(summary.latestDate as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className={`block font-mono font-black text-lg leading-tight ${summary.totalUnpaid > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                            ₱{summary.totalUnpaid.toFixed(2)}
                          </span>
                          <span
                            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide ${
                              summary.totalUnpaid > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {summary.totalUnpaid > 0 ? 'Unpaid' : 'Settled'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

          <table className="hidden md:table w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider">Customer Name</th>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider text-center">Total Records</th>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider">Last Activity</th>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider text-right">Total Unpaid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm md:text-base font-semibold text-slate-600">
                    {allNames.length === 0 ? 'No customers yet. Tap "+ Ledger" to add one.' : balanceFilter === 'OWING' && !searchQuery ? 'Nobody owes anything right now.' : 'No customer found matching your search.'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((name) => {
                  const summary = customerSummary[name];
                  return (
                    <tr 
                      key={name} 
                      onClick={() => openCustomer(name)}
                      className={`hover:bg-slate-50 cursor-pointer ${summary.totalUnpaid > 0 ? 'bg-red-50/20' : ''}`}
                    >
                      <td className="p-3.5 md:p-4 font-bold text-xs sm:text-sm md:text-base text-indigo-700">{name}</td>
                      <td className="p-3.5 md:p-4 text-center text-xs sm:text-sm md:text-base text-slate-700 font-mono font-bold">{summary.count}</td>
                      <td className="p-3.5 md:p-4 font-mono text-xs sm:text-sm text-slate-600">{summary.latestDate ? new Date(summary.latestDate).toLocaleDateString() : 'No utang yet'}</td>
                      <td className={`p-3.5 md:p-4 font-mono text-xs sm:text-sm md:text-base font-black text-right ${summary.totalUnpaid > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        ₱{summary.totalUnpaid.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </>
        ) : (
          <>
            {/* Phone layout: one card per utang record */}
            <ul className="md:hidden p-3 space-y-2.5">
              {filteredUtangs.length === 0 ? (
                <li className="py-10 text-center text-sm font-semibold text-slate-600 px-4">
                  {customerUtangs.length === 0 ? 'No utang yet. Use "New Utang" at the bottom to add one.' : 'No records match your search.'}
                </li>
              ) : (
                filteredUtangs.map((utang) => {
                  const partial = utang.status === 'UNPAID' && (utang.paidAmount ?? 0) > 0;
                  return (
                    <li
                      key={utang.id}
                      className={`rounded-xl border shadow-sm bg-white p-3.5 ${utang.status === 'UNPAID' ? 'border-red-200' : 'border-slate-200'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-slate-600">{new Date(utang.date).toLocaleDateString()}</div>
                          <div className="font-semibold text-base text-slate-800 break-words mt-0.5">{utang.itemsDescription || '-'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-mono font-black text-lg ${utang.status === 'PAID' ? 'text-slate-600' : 'text-red-600'}`}>
                            ₱{utang.amount.toFixed(2)}
                          </div>
                          <span className={`inline-block mt-1 px-2.5 py-0.5 text-xs rounded-full font-black uppercase tracking-wider ${
                            utang.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : partial
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {partial ? 'PARTIAL' : utang.status}
                          </span>
                        </div>
                      </div>
                      {partial && (
                        <div className="mt-2 text-xs font-bold text-emerald-700">
                          Paid ₱{(utang.paidAmount ?? 0).toFixed(2)} · Balance ₱{utangRemaining(utang).toFixed(2)}
                        </div>
                      )}
                      <CapitalLine utang={utang} onEdit={() => openCapEdit(utang)} className="mt-2" />
                      <div className="mt-3 flex gap-2">
                        {utang.status === 'UNPAID' ? (
                          <button
                            type="button"
                            onClick={() => openPayRecord(utang)}
                            className="flex-1 min-h-[44px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-bold rounded-lg border border-indigo-200 transition-colors"
                          >
                            Receive payment
                          </button>
                        ) : (
                          <div className="flex-1 flex items-center text-xs font-semibold text-slate-600">Fully paid</div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(utang)}
                          aria-label={`Delete utang ${utang.itemsDescription || ''}`}
                          className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-bold rounded-lg border border-rose-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>

          <table className="hidden md:table w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider">Date</th>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider">Items / Description</th>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider text-right">Amount</th>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider text-center">Status</th>
                <th className="p-3.5 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUtangs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm md:text-base font-semibold text-slate-600">
                    {customerUtangs.length === 0 ? 'No utang yet. Use "New Utang" at the bottom to add one.' : 'No records match your search.'}
                  </td>
                </tr>
              ) : (
                filteredUtangs.map((utang) => (
                  <tr key={utang.id} className={`hover:bg-slate-50 ${utang.status === 'UNPAID' ? 'bg-red-50/30' : ''}`}>
                    <td className="p-3.5 md:p-4 font-mono text-xs sm:text-sm text-slate-600 font-medium whitespace-nowrap">{new Date(utang.date).toLocaleDateString()}</td>
                    <td className="p-3.5 md:p-4 text-xs sm:text-sm font-semibold text-slate-800">{utang.itemsDescription || '-'}</td>
                    <td className="p-3.5 md:p-4 font-mono text-xs sm:text-sm md:text-base text-right whitespace-nowrap">
                      <div className={`font-black ${utang.status === 'PAID' ? 'text-slate-600' : 'text-red-600'}`}>₱{utang.amount.toFixed(2)}</div>
                      {utang.status === 'UNPAID' && (utang.paidAmount ?? 0) > 0 && (
                        <div className="text-[11px] sm:text-xs font-bold text-emerald-700 mt-0.5">
                          Paid ₱{(utang.paidAmount ?? 0).toFixed(2)} · Balance ₱{utangRemaining(utang).toFixed(2)}
                        </div>
                      )}
                      <CapitalLine utang={utang} onEdit={() => openCapEdit(utang)} className="mt-0.5" />
                    </td>
                    <td className="p-3.5 md:p-4 text-center">
                      <span className={`px-2.5 py-1 text-xs rounded-full font-black uppercase tracking-wider ${
                        utang.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : (utang.paidAmount ?? 0) > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {utang.status === 'UNPAID' && (utang.paidAmount ?? 0) > 0 ? 'PARTIAL' : utang.status}
                      </span>
                    </td>
                    <td className="p-3.5 md:p-4">
                      <div className="flex items-center justify-center gap-2">
                        {utang.status === 'UNPAID' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); openPayRecord(utang); }}
                            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs md:text-sm font-bold rounded-lg border border-indigo-200 transition-colors whitespace-nowrap"
                          >
                            Receive payment
                          </button>
                        ) : (
                          <span className="text-slate-500 text-xs md:text-sm font-bold">Settled</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteRecord(utang); }}
                          title="Delete this utang"
                          aria-label={`Delete utang ${utang.itemsDescription || ''}`}
                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Quick Add Footer */}
      <div className="md:hidden shrink-0 border-t border-slate-200 bg-slate-50 p-2.5">
        <button
          type="button"
          onClick={() => setShowNewUtang(true)}
          className="w-full min-h-[46px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-base font-bold shadow-sm transition-colors truncate"
        >
          + New Utang{selectedCustomer ? ` for ${selectedCustomer}` : ''}
        </button>
      </div>

      <div className="hidden md:flex mt-auto border-t border-slate-200 p-3 md:p-5 bg-slate-50 items-center shrink-0">
        <form onSubmit={handleAddUtang} className="flex flex-grow items-center gap-2.5 md:gap-3 w-full flex-wrap sm:flex-nowrap">
          <p className="text-xs md:text-sm font-black uppercase text-slate-600 mr-1 hidden sm:block whitespace-nowrap">New Utang:</p>
          {selectedCustomer ? (
            <div
              className="w-full md:w-48 min-h-[42px] flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5"
              title={`Utang will be recorded for ${selectedCustomer}`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 shrink-0">For</span>
              <span className="font-black text-sm md:text-base text-indigo-800 truncate">{selectedCustomer}</span>
            </div>
          ) : (
            <>
              <input
                type="text"
                required
                value={newCustomer}
                onChange={(e) => setNewCustomer(capsWhileTyping(e.target.value))}
                placeholder="CUSTOMER NAME"
                list="quickUtangCustomers"
                className="w-full md:w-48 bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm md:text-base font-medium uppercase focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <datalist id="quickUtangCustomers">
                {registeredNames.map(c => <option key={c} value={c} />)}
              </datalist>
            </>
          )}
          <input
            ref={itemsInputRef}
            type="text"
            value={newItems}
            onChange={(e) => setNewItems(e.target.value)}
            placeholder="Items (Optional)"
            className="w-full sm:w-auto sm:flex-grow sm:min-w-[120px] bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm md:text-base font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="₱ Amount"
            className="w-28 md:w-32 bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm md:text-base font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={newCapital}
            onChange={(e) => {
              setNewCapital(e.target.value);
              setCapitalTouched(true);
            }}
            placeholder="₱ Capital (auto)"
            title="Capital (puhunan) of these items. It fills in by itself from your products when it can, or type your own."
            aria-label="Capital"
            className="w-28 md:w-44 bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm md:text-base font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            type="submit"
            className="flex-1 sm:flex-none bg-red-600 text-white px-4 md:px-7 py-2.5 rounded-xl text-sm md:text-base font-bold shadow-sm hover:bg-red-700 transition-colors whitespace-nowrap min-h-[42px]"
          >
            Record
          </button>
        </form>
      </div>

      {showNewUtang && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end justify-center md:hidden" onClick={() => setShowNewUtang(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-utang-title"
            onSubmit={handleAddUtang}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full rounded-t-2xl shadow-2xl p-5 space-y-3.5 max-h-[92dvh] overflow-auto"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex items-center justify-between">
              <h3 id="new-utang-title" className="text-base font-black text-slate-800">New utang</h3>
              <button
                type="button"
                onClick={() => setShowNewUtang(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedCustomer ? (
              <div className="min-h-[44px] flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 shrink-0">For</span>
                <span className="font-black text-base text-indigo-800 truncate">{selectedCustomer}</span>
              </div>
            ) : (
              <div>
                <label htmlFor="nu-name" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Customer name</label>
                <input
                  id="nu-name"
                  type="text"
                  required
                  autoFocus
                  autoComplete="off"
                  value={newCustomer}
                  onChange={(e) => setNewCustomer(capsWhileTyping(e.target.value))}
                  placeholder="TYPE OR PICK A NAME"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-base font-medium uppercase focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                {nameSuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {nameSuggestions.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNewCustomer(n)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="nu-items" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Items <span className="normal-case font-medium text-slate-500">(optional)</span>
              </label>
              <input
                id="nu-items"
                type="text"
                autoFocus={Boolean(selectedCustomer)}
                value={newItems}
                onChange={(e) => setNewItems(e.target.value)}
                placeholder="e.g. 2x Lucky Me, 1 Coke"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-base font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label htmlFor="nu-amount" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Amount ₱</label>
              <input
                id="nu-amount"
                type="number"
                inputMode="decimal"
                required
                min="0"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label htmlFor="nu-capital" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Capital ₱ <span className="normal-case font-medium text-slate-500">(fills in by itself)</span>
              </label>
              <input
                id="nu-capital"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={newCapital}
                onChange={(e) => {
                  setNewCapital(e.target.value);
                  setCapitalTouched(true);
                }}
                placeholder="Not known"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-base font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {newCapital !== '' && newAmount !== '' && Number.isFinite(parseFloat(newCapital)) && Number.isFinite(parseFloat(newAmount)) && (
                <p className="mt-1.5 text-xs font-bold text-emerald-700">
                  Profit ₱{Math.max(0, parseFloat(newAmount) - Math.min(parseFloat(newCapital), parseFloat(newAmount))).toFixed(2)}
                  {!capitalTouched ? ' (worked out from your products)' : ''}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full min-h-[50px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-base font-bold shadow-sm transition-colors"
            >
              Record utang
            </button>
          </form>
        </div>
      )}

      {showStatement && selectedCustomer && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowStatement(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="statement-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <h3 id="statement-title" className="text-base font-black text-slate-800">Utang item list</h3>
                <p className="text-sm font-bold text-indigo-700 break-words">{selectedCustomer}</p>
                <p className="text-xs text-slate-600">{stmtDate}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowStatement(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-2.5 border-b border-slate-200 flex items-center gap-2 shrink-0">
              {([
                ['UNPAID', 'Unpaid items'],
                ['ALL', 'All items'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatementScope(value)}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold border transition-colors ${
                    statementScope === value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <ul className="overflow-auto flex-1 divide-y divide-slate-100">
              {statementRecords.length === 0 ? (
                <li className="p-8 text-center text-sm font-semibold text-slate-600">
                  {statementScope === 'UNPAID' ? 'Nothing unpaid. All settled!' : 'No utang records yet.'}
                </li>
              ) : (
                statementRecords.map((u, i) => (
                  <li key={u.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-slate-600">{i + 1}. {shortDate(u.date)}</div>
                      <div className="text-sm font-semibold text-slate-800 break-words">{u.itemsDescription || '-'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-sm text-slate-800">₱{u.amount.toFixed(2)}</div>
                      {paidOf(u) > 0 && (
                        <div className="text-[11px] font-bold text-emerald-700">
                          {u.status === 'PAID' ? 'Paid' : `Paid ₱${paidOf(u).toFixed(2)} · Bal ₱${utangRemaining(u).toFixed(2)}`}
                        </div>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0 space-y-1">
              <div className="flex justify-between text-xs sm:text-sm text-slate-600 font-semibold">
                <span>Total</span>
                <span className="font-mono">₱{stmtTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm text-slate-600 font-semibold">
                <span>Paid</span>
                <span className="font-mono">₱{stmtPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline text-slate-800 font-black">
                <span className="text-sm uppercase tracking-wide">Balance due</span>
                <span className="font-mono text-xl text-red-600">₱{stmtBalance.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 grid grid-cols-3 gap-2 shrink-0">
              <button
                type="button"
                onClick={copyStatement}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
                <button
                  type="button"
                  onClick={shareStatement}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowStatement(false)}
                  className="min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-colors"
                >
                  Close
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print / PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What gets printed (hidden on screen). Black on white, one clean page for the customer. */}
      {showStatement && selectedCustomer &&
        createPortal(
          <div id="print-root">
            <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>{storeName}</h1>
            <p style={{ margin: '2px 0 12px', fontSize: '13px' }}>UTANG STATEMENT</p>
            <p style={{ margin: 0, fontSize: '14px' }}><strong>Customer:</strong> {selectedCustomer}</p>
            <p style={{ margin: '0 0 12px', fontSize: '14px' }}><strong>Date:</strong> {stmtDate} ({statementScope === 'UNPAID' ? 'unpaid items' : 'all items'})</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['#', 'Date', 'Items', 'Amount', 'Paid', 'Balance'].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', borderBottom: '2px solid #000', padding: '6px 4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statementRecords.map((u, i) => (
                  <tr key={u.id}>
                    <td style={{ borderBottom: '1px solid #bbb', padding: '6px 4px' }}>{i + 1}</td>
                    <td style={{ borderBottom: '1px solid #bbb', padding: '6px 4px', whiteSpace: 'nowrap' }}>{shortDate(u.date)}</td>
                    <td style={{ borderBottom: '1px solid #bbb', padding: '6px 4px' }}>{u.itemsDescription || '-'}</td>
                    <td style={{ borderBottom: '1px solid #bbb', padding: '6px 4px', textAlign: 'right' }}>₱{u.amount.toFixed(2)}</td>
                    <td style={{ borderBottom: '1px solid #bbb', padding: '6px 4px', textAlign: 'right' }}>₱{paidOf(u).toFixed(2)}</td>
                    <td style={{ borderBottom: '1px solid #bbb', padding: '6px 4px', textAlign: 'right' }}>₱{utangRemaining(u).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ padding: '8px 4px', fontWeight: 800 }}>TOTAL</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 800 }}>₱{stmtTotal.toFixed(2)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 800 }}>₱{stmtPaid.toFixed(2)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 800 }}>₱{stmtBalance.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <p style={{ marginTop: '16px', fontSize: '16px', fontWeight: 800 }}>BALANCE DUE: ₱{stmtBalance.toFixed(2)}</p>
          </div>,
          document.body
        )}

      {capEdit && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !capSaving && setCapEdit(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="cap-title"
            onSubmit={(e) => {
              e.preventDefault();
              if (capValid) saveCap(capNumber);
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="cap-title" className="text-base font-black text-slate-800">Capital (puhunan)</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 truncate">{capEdit.label} · utang ₱{capEdit.amount.toFixed(2)}</p>
              </div>
              <button type="button" onClick={() => setCapEdit(null)} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label htmlFor="cap-amount" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mt-4 mb-1.5">What the goods cost you</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₱</span>
              <input
                id="cap-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                autoFocus
                value={capValue}
                onChange={(e) => setCapValue(e.target.value)}
                className="w-full pl-8 pr-3.5 py-3 bg-white border border-slate-300 rounded-xl text-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {capEdit.suggested !== null && (
              <button
                type="button"
                onClick={() => setCapValue(capEdit.suggested!.toFixed(2))}
                className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs sm:text-sm font-bold transition-colors"
              >
                Use the estimate: ₱{capEdit.suggested.toFixed(2)}
              </button>
            )}
            <p className={`mt-3 text-xs sm:text-sm font-bold ${capValid || capValue === '' ? 'text-slate-600' : 'text-rose-600'}`}>
              {capValue === ''
                ? 'Type the capital to see the profit.'
                : capValid
                ? `Profit on this utang: ₱${(capEdit.amount - capNumber).toFixed(2)}`
                : capNumber > capEdit.amount
                ? 'The capital cannot be more than the utang amount.'
                : 'Enter 0 or more.'}
            </p>

            <div className="mt-4 flex gap-2">
              {capEdit.current !== undefined && (
                <button type="button" onClick={() => saveCap(null)} disabled={capSaving} className="min-h-[46px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-bold transition-colors">
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setCapEdit(null)} disabled={capSaving} className="flex-1 min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={!capValid || capSaving} className="flex-1 min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors">
                {capSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {payTarget && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => !paying && setPayTarget(null)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-title"
            onSubmit={(e) => {
              e.preventDefault();
              confirmPayment();
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="pay-title" className="text-base font-black text-slate-800">Receive payment</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 truncate">{payTarget.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 flex justify-between items-baseline bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Balance</span>
              <span className="text-lg font-black font-mono text-red-600">₱{payTarget.remaining.toFixed(2)}</span>
            </div>

            <label htmlFor="pay-amount" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mt-4 mb-1.5">
              Amount received
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 font-bold">₱</span>
              <input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                autoFocus
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full pl-8 pr-3.5 py-3 bg-white border border-slate-300 rounded-xl text-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setPayAmount(payTarget.remaining.toFixed(2))}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs sm:text-sm font-bold transition-colors"
              >
                Pay full balance
              </button>
              {payTarget.remaining > 1 && (
                <button
                  type="button"
                  onClick={() => setPayAmount((Math.round(payTarget.remaining * 50) / 100).toFixed(2))}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs sm:text-sm font-bold transition-colors"
                >
                  Half
                </button>
              )}
            </div>

            <p className={`mt-3 text-xs sm:text-sm font-bold ${payValid || !payAmount ? 'text-slate-600' : 'text-rose-600'}`}>
              {!payAmount
                ? 'Enter how much the customer paid.'
                : payValid
                ? payLeftAfter <= 0.001
                  ? 'This settles the utang completely.'
                  : `Balance left after this: ₱${payLeftAfter.toFixed(2)}`
                : payNumber > payTarget.remaining
                ? `That is more than the balance (₱${payTarget.remaining.toFixed(2)}).`
                : 'Enter an amount greater than 0.'}
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                disabled={paying}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!payValid || paying}
                className="flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
              >
                {paying ? 'Saving…' : payValid ? `Receive ₱${payNumber.toFixed(2)}` : 'Receive'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
