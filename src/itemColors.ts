// Shared background color-coding for inventory items, used on both the Inventory table rows
// and the POS product cards so a given item's color stays consistent everywhere. Every class
// string here is written out in full (not template-built) so Tailwind's JIT scanner picks
// them all up at build time.
export const ITEM_ROW_COLOR_STYLES = {
  none: { bg: '', card: 'bg-slate-50', dot: 'bg-white border border-slate-300' },
  indigo: { bg: 'bg-indigo-50', card: 'bg-indigo-50', dot: 'bg-indigo-500' },
  teal: { bg: 'bg-teal-50', card: 'bg-teal-50', dot: 'bg-teal-500' },
  rose: { bg: 'bg-rose-50', card: 'bg-rose-50', dot: 'bg-rose-500' },
  emerald: { bg: 'bg-emerald-50', card: 'bg-emerald-50', dot: 'bg-emerald-500' },
  purple: { bg: 'bg-purple-50', card: 'bg-purple-50', dot: 'bg-purple-500' },
  blue: { bg: 'bg-blue-50', card: 'bg-blue-50', dot: 'bg-blue-500' },
  amber: { bg: 'bg-amber-50', card: 'bg-amber-50', dot: 'bg-amber-500' },
  pink: { bg: 'bg-pink-50', card: 'bg-pink-50', dot: 'bg-pink-500' },
  cyan: { bg: 'bg-cyan-50', card: 'bg-cyan-50', dot: 'bg-cyan-500' },
  orange: { bg: 'bg-orange-50', card: 'bg-orange-50', dot: 'bg-orange-500' },
} as const;

export type ItemRowColor = keyof typeof ITEM_ROW_COLOR_STYLES;
export const ITEM_ROW_COLOR_KEYS = Object.keys(ITEM_ROW_COLOR_STYLES) as ItemRowColor[];

export const ITEM_COLORS_STORAGE_KEY = 'izstorepos_item_row_colors';

export const loadItemColors = (): Record<string, ItemRowColor> => {
  try {
    const raw = localStorage.getItem(ITEM_COLORS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const saveItemColors = (colors: Record<string, ItemRowColor>) => {
  try {
    localStorage.setItem(ITEM_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // localStorage unavailable — color choice just won't persist across reloads
  }
};
