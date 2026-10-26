import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { InventoryItem } from '../types';
import { useToast } from './Toast';

interface CategoryManagerProps {
  /** Every category, in shelf order */
  names: string[];
  items: InventoryItem[];
  onAdd: (name: string) => Promise<boolean>;
  onRename: (from: string, to: string) => Promise<boolean>;
  onDelete: (name: string) => Promise<boolean>;
  onClose: () => void;
}

const inputClass =
  'w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm md:text-base font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors';

/** Add, rename and delete the store's product categories. */
export function CategoryManager({ names, items, onAdd, onRename, onDelete, onClose }: CategoryManagerProps) {
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  const countOf = (name: string) => items.filter((i) => i.category?.toLowerCase() === name.toLowerCase()).length;
  const exists = (name: string, except?: string) =>
    names.some((n) => n.toLowerCase() === name.toLowerCase() && n.toLowerCase() !== (except ?? '').toLowerCase());

  // Escape cancels a rename first, then closes the window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      if (editing !== null) setEditing(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, busy, onClose]);

  const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = clean(newName);
    if (!name) return setError('Type a category name.');
    if (exists(name)) return setError(`"${name}" already exists.`);
    setError('');
    setBusy(true);
    const ok = await onAdd(name);
    setBusy(false);
    if (ok) {
      setNewName('');
      addRef.current?.focus();
    }
  };

  const startEdit = (name: string) => {
    setEditing(name);
    setEditName(name);
    setError('');
  };

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing === null) return;
    const to = clean(editName);
    if (!to) return setError('Type the new name.');
    if (to === editing) return setEditing(null);
    if (exists(to, editing)) return setError(`"${to}" already exists. Pick a different name.`);
    setError('');
    setBusy(true);
    const ok = await onRename(editing, to);
    setBusy(false);
    if (ok) setEditing(null);
  };

  const remove = async (name: string) => {
    const count = countOf(name);
    const ok = await toast.confirm({
      title: `Delete "${name}"?`,
      message:
        count > 0
          ? `${count} ${count === 1 ? 'product is' : 'products are'} in it. They are not deleted, they just won't have a category.`
          : 'No products are in it.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    await onDelete(name);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-manager-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <h3 id="cat-manager-title" className="text-base font-black text-slate-800">Categories</h3>
            <p className="text-xs text-slate-600 mt-0.5">Renaming a category changes it on every product in it. Deleting one keeps the products.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submitAdd} className="px-5 pb-3 flex gap-2 shrink-0">
          <input
            ref={addRef}
            type="text"
            value={newName}
            maxLength={30}
            onChange={(e) => {
              setNewName(e.target.value);
              setError('');
            }}
            placeholder="New category, e.g. Frozen Fish"
            aria-label="New category name"
            className={inputClass}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 min-h-[44px] px-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>

        {error && (
          <p role="alert" className="mx-5 mb-3 text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 shrink-0">
            {error}
          </p>
        )}

        <ul className="overflow-auto flex-1 border-t border-slate-200 divide-y divide-slate-100">
          {names.length === 0 && <li className="p-8 text-center text-sm font-semibold text-slate-600">No categories yet. Add your first one above.</li>}
          {names.map((name) => {
            const count = countOf(name);
            return (
              <li key={name} className="px-5 py-2.5">
                {editing === name ? (
                  <form onSubmit={submitRename} className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={editName}
                      maxLength={30}
                      onChange={(e) => {
                        setEditName(e.target.value);
                        setError('');
                      }}
                      aria-label={`New name for ${name}`}
                      className={inputClass}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="shrink-0 min-h-[44px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-bold transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setError('');
                      }}
                      className="shrink-0 min-h-[44px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm md:text-base font-bold text-slate-800 truncate">{name}</div>
                      <div className="text-xs text-slate-600">
                        {count} {count === 1 ? 'product' : 'products'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(name)}
                      disabled={busy}
                      aria-label={`Rename ${name}`}
                      title="Rename"
                      className="min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      <span className="hidden sm:inline">Rename</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(name)}
                      disabled={busy}
                      aria-label={`Delete ${name}`}
                      title="Delete"
                      className="min-h-[44px] px-3 inline-flex items-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="p-4 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-full min-h-[46px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
