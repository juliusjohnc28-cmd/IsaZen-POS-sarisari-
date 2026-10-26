import { createContext, useContext } from 'react';
import { DEFAULT_CATEGORY_NAMES, guessCategoryKey } from './categories';

export interface CategoriesValue {
  /** Every category the store has, in shelf order */
  names: string[];
  /** Best category for a product name, using the store's current category names */
  guess: (productName: string) => string | undefined;
  /** Open the window where categories are added, renamed and deleted */
  openManager: () => void;
}

const CategoriesContext = createContext<CategoriesValue>({
  names: DEFAULT_CATEGORY_NAMES,
  guess: guessCategoryKey,
  openManager: () => undefined,
});

export const CategoriesProvider = CategoriesContext.Provider;
export const useCategories = () => useContext(CategoriesContext);
