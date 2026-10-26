import { useEffect, useState } from 'react';
import { useCategories } from '../utils/CategoriesContext';

interface CategoryPickerProps {
  value: string;
  onChange: (category: string) => void;
  /** The product name typed so far. While the person has not picked anything, the category follows it. */
  suggestFrom?: string;
  id?: string;
}

const NEW = '__new__';

const fieldClass =
  'w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm md:text-base font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors';

/** Pick one of the store's categories, or type a new one. */
export function CategoryPicker({ value, onChange, suggestFrom, id = 'category-picker' }: CategoryPickerProps) {
  const { names, guess, openManager } = useCategories();
  const [creating, setCreating] = useState(false);
  // Until the person chooses something themselves, suggest a category from the product name
  const [auto, setAuto] = useState(!value);

  useEffect(() => {
    if (!auto || suggestFrom === undefined) return;
    onChange(guess(suggestFrom) ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestFrom, auto]);

  // A value that is not in the list (just typed, or removed since) still needs an option to show
  const options = value && !names.includes(value) && !creating ? [...names, value] : names;

  const manageLink = (
    <button type="button" onClick={openManager} className="mt-1.5 text-xs font-bold text-indigo-700 hover:underline">
      Manage categories
    </button>
  );

  if (creating) {
    return (
      <div>
        <input
          id={id}
          type="text"
          autoFocus
          maxLength={30}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Name of the new category"
          className={fieldClass}
        />
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            onChange('');
          }}
          className="mt-1.5 text-xs font-bold text-indigo-700 hover:underline"
        >
          Choose from the list instead
        </button>
      </div>
    );
  }

  return (
    <div>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          setAuto(false);
          if (e.target.value === NEW) {
            setCreating(true);
            onChange('');
          } else {
            onChange(e.target.value);
          }
        }}
        className={fieldClass}
      >
        <option value="">No category</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={NEW}>+ New category…</option>
      </select>
      {auto && value && <p className="mt-1.5 text-xs font-semibold text-slate-600">Suggested from the name. Change it if it's not right.</p>}
      {manageLink}
    </div>
  );
}
