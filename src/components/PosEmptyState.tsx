import { PackagePlus, SearchX, Star } from 'lucide-react';

interface PosEmptyStateProps {
  /** Why the product grid is empty */
  reason: 'no-inventory' | 'no-favorites' | 'no-match';
  /** What was typed in the search box (shown in the "no match" message) */
  searchQuery?: string;
  onAddProduct: () => void;
  onShowAll?: () => void;
}

/** Shown in the POS product grid when there is nothing to sell yet. */
export function PosEmptyState({ reason, searchQuery = '', onAddProduct, onShowAll }: PosEmptyStateProps) {
  const query = searchQuery.trim();

  const content = {
    'no-inventory': {
      icon: <PackagePlus className="w-8 h-8" />,
      title: 'No products yet',
      text: 'Add your first product to start selling. It only takes a few seconds.',
      button: '+ Add Product',
    },
    'no-favorites': {
      icon: <Star className="w-8 h-8" />,
      title: 'No favorites yet',
      text: 'Tap the star on a product to keep it at the top of this list.',
      button: '+ Add Product',
    },
    'no-match': {
      icon: <SearchX className="w-8 h-8" />,
      title: query ? `Nothing matches “${query}”` : 'No products found or in stock',
      text: query ? 'Check the spelling, or add it as a new product.' : 'Products that are out of stock are hidden here.',
      button: query ? `+ Add “${query.length > 24 ? query.slice(0, 24) + '…' : query}”` : '+ Add Product',
    },
  }[reason];

  return (
    <div className="col-span-full flex justify-center py-6 md:py-10">
      <div
        role="status"
        className="w-full max-w-md flex flex-col items-center text-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8"
      >
        <span className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center" aria-hidden="true">
          {content.icon}
        </span>
        <div>
          <h3 className="text-base md:text-lg font-black text-slate-800">{content.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{content.text}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          <button
            type="button"
            onClick={onAddProduct}
            className="min-h-[44px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-xs transition-colors"
          >
            {content.button}
          </button>
          {reason !== 'no-inventory' && onShowAll && (
            <button
              type="button"
              onClick={onShowAll}
              className="min-h-[44px] px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-sm font-bold transition-colors"
            >
              {reason === 'no-favorites' ? 'Show all products' : 'Clear search'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
