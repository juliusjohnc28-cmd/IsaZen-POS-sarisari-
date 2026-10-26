import React from 'react';
import { Transaction } from '../types';

interface TransactionHistoryProps {
  transactions: Transaction[];
}

const TYPE_LABEL: Record<string, string> = { IN: 'Stock In', OUT: 'Sale', UTANG: 'Utang', PAYMENT: 'Payment' };

const TYPE_PILL: Record<string, string> = {
  IN: 'bg-indigo-100 text-indigo-800',
  OUT: 'bg-amber-100 text-amber-800',
  UTANG: 'bg-red-100 text-red-800',
  PAYMENT: 'bg-emerald-100 text-emerald-800',
};

// "Today", "Yesterday" or a short date, so a long list on a phone is easy to scan
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  // Group neighbouring transactions that happened on the same day
  const days: { label: string; items: Transaction[] }[] = [];
  for (const tx of transactions) {
    const label = dayLabel(tx.timestamp);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(tx);
    else days.push({ label, items: [tx] });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Phone layout: one row per transaction (the wide table below is for tablets and computers) */}
      <div className="md:hidden overflow-auto flex-grow" tabIndex={0} role="region" aria-label="Transaction history">
        {transactions.length === 0 ? (
          <p className="p-8 text-center text-sm font-semibold text-slate-600">No transactions yet.</p>
        ) : (
          days.map((day) => (
            <section key={day.label}>
              <h2 className="sticky top-0 z-10 px-4 py-2 bg-slate-100 border-y border-slate-200 text-xs font-black uppercase tracking-wider text-slate-700">
                {day.label}
              </h2>
              <ul className="divide-y divide-slate-200">
                {day.items.map((tx) => (
                  <li key={tx.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-base text-slate-800 leading-snug break-words">{tx.itemName}</div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 text-xs rounded-full font-extrabold uppercase tracking-wider ${TYPE_PILL[tx.type]}`}>
                          {TYPE_LABEL[tx.type]}
                        </span>
                        <span className="text-xs font-mono text-slate-600">
                          {new Date(tx.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-base text-slate-800">₱{tx.totalPrice.toFixed(2)}</div>
                      {tx.type !== 'PAYMENT' && (
                        <div className={`font-mono text-sm font-bold ${tx.type === 'IN' ? 'text-indigo-600' : 'text-amber-700'}`}>
                          {tx.type === 'IN' ? '+' : '-'}{tx.quantity} {tx.quantity === 1 ? 'pc' : 'pcs'}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="hidden md:block overflow-auto flex-grow" tabIndex={0} role="region" aria-label="Transaction history table">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="p-3 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider">Date & Time</th>
              <th className="p-3 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider">Item Name</th>
              <th className="p-3 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider">Type</th>
              <th className="p-3 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider text-right">Qty</th>
              <th className="p-3 md:p-4 text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wider text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm md:text-base font-semibold text-slate-600">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="p-3 md:p-4 font-mono text-xs sm:text-sm text-slate-600 font-medium whitespace-nowrap">
                    {new Date(tx.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3 md:p-4 font-bold text-xs sm:text-sm text-slate-800">{tx.itemName}</td>
                  <td className="p-3 md:p-4">
                    <span className={`px-2.5 py-1 text-xs rounded-full font-extrabold uppercase tracking-wider inline-block ${
                      tx.type === 'IN' ? 'bg-indigo-100 text-indigo-800' : 
                      tx.type === 'OUT' ? 'bg-amber-100 text-amber-800' :
                      tx.type === 'UTANG' ? 'bg-red-100 text-red-800' :
                      'bg-emerald-100 text-emerald-800'
                    }`}>
                      {tx.type === 'IN' ? 'Stock In' : tx.type === 'OUT' ? 'Sale' : tx.type === 'UTANG' ? 'Utang' : 'Payment'}
                    </span>
                  </td>
                  <td className={`p-3 md:p-4 font-mono text-xs sm:text-sm md:text-base font-bold text-right ${
                    tx.type === 'IN' ? 'text-indigo-600' : 
                    tx.type === 'PAYMENT' ? 'text-emerald-600' :
                    'text-amber-700'
                  }`}>
                    {tx.type === 'IN' ? '+' : tx.type === 'PAYMENT' ? ' ' : '-'}{tx.type === 'PAYMENT' ? '-' : tx.quantity}
                  </td>
                  <td className="p-3 md:p-4 font-mono text-xs sm:text-sm md:text-base font-black text-right text-slate-800">
                    ₱{tx.totalPrice.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
