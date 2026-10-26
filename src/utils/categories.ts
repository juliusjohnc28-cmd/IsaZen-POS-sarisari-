import { InventoryItem } from '../types';

export interface CategoryDef {
  name: string;
  /** Words that tell us a product belongs here. Short words (4 letters or fewer) must match a whole word. */
  keywords: string[];
}

/**
 * The usual shelves of a sari-sari store. The order matters when guessing:
 * the first category whose keyword appears in the product name wins.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    name: 'Canned Goods',
    keywords: ['sardine', 'sardinas', 'corned', 'carne norte', 'meat loaf', 'meatloaf', 'beef loaf', 'tuna', 'mackerel', 'luncheon', 'spam', 'liver spread', 'ligo', '555', 'pork and beans', 'vienna', 'chicken spread'],
  },
  {
    name: 'Noodles',
    keywords: ['pancit', 'canton', 'lucky me', 'nissin', 'cup noodle', 'noodle', 'payless', 'mami', 'bihon', 'sotanghon', 'miki', 'spaghetti', 'pasta', 'macaroni'],
  },
  {
    name: 'Alcohol',
    keywords: ['tanduay', 'gin', 'ginebra', 'beer', 'red horse', 'san mig', 'san miguel', 'pale pilsen', 'emperador', 'brandy', 'rum', 'whisky', 'whiskey', 'vodka', 'alfonso', 'fundador', 'empi', 'lambanog', 'smirnoff', 'johnnie walker', 'jack daniel'],
  },
  {
    name: 'Cigarettes',
    keywords: ['cigarette', 'yosi', 'marlboro', 'winston', 'philip morris', 'camel', 'lucky strike', 'tobacco', 'vape', 'lighter', 'posporo', 'matches'],
  },
  {
    name: 'Drinks',
    keywords: ['coke', 'coca cola', 'sprite', 'royal', 'pepsi', 'mountain dew', 'mismo', 'c2', 'juice', 'tang', 'zesto', 'zest-o', 'water', 'gatorade', 'pocari', 'red bull', 'cobra', 'sting', 'energy drink', 'kopiko', 'nescafe', 'coffee', '3in1', '3-in-1', 'milo', 'ovaltine', 'milk', 'bear brand', 'birch tree', 'yakult', 'iced tea', 'tea', 'lipton', 'soda', 'minute maid', 'cola'],
  },
  {
    name: 'Snacks',
    keywords: ['chips', 'piattos', 'nova', 'chippy', 'oishi', 'mang juan', 'boy bawang', 'chicharon', 'cracklings', 'biscuit', 'cracker', 'skyflakes', 'fita', 'rebisco', 'nagaraya', 'cloud 9', 'pillows', 'popcorn', 'pretzel', 'tostillas', 'clover', 'v-cut', 'roller coaster', 'hansel', 'magic flakes', 'cookie', 'wafer', 'bread', 'tinapay', 'pandesal', 'cake', 'junk food'],
  },
  {
    name: 'Candies',
    keywords: ['candy', 'candies', 'chocolate', 'lollipop', 'bonbon', 'mentos', 'hany', 'maxx', 'frutos', 'storck', 'jelly', 'gum', 'chewing', 'yema', 'polvoron', 'flat tops', 'curly tops', 'kisses', 'snickers', 'nips', 'sugus', 'pastillas', 'choco'],
  },
  {
    name: 'Condiments & Cooking',
    keywords: ['toyo', 'soy sauce', 'suka', 'vinegar', 'patis', 'fish sauce', 'mantika', 'cooking oil', 'oil', 'asin', 'salt', 'sugar', 'asukal', 'ketchup', 'catsup', 'mayonnaise', 'mayo', 'tomato sauce', 'knorr', 'maggi', 'magic sarap', 'ajinomoto', 'vetsin', 'seasoning', 'bagoong', 'sinigang', 'gravy', 'spice', 'pepper', 'paminta', 'garlic', 'bawang', 'onion', 'sibuyas', 'baking', 'margarine', 'peanut butter', 'jam', 'condensed', 'evaporated', 'creamer', 'carnation', 'ulam', 'mix'],
  },
  {
    name: 'Rice & Grains',
    keywords: ['bigas', 'rice', 'sinandomeng', 'jasmine', 'dinorado', 'well milled', 'glutinous', 'malagkit', 'oats', 'grain', 'mais', 'monggo', 'mungbean', 'beans', 'lentil'],
  },
  {
    name: 'Medicine',
    keywords: ['biogesic', 'paracetamol', 'neozep', 'bioflu', 'alaxan', 'decolgen', 'medicol', 'ibuprofen', 'advil', 'mefenamic', 'diatabs', 'loperamide', 'kremil', 'gaviscon', 'lagundi', 'vicks', 'katinko', 'efficascent', 'omega', 'salonpas', 'band aid', 'betadine', 'rubbing alcohol', 'ethyl', 'isopropyl', 'cough', 'tablet', 'capsule', 'syrup', 'vitamin', 'ascorbic', 'cherifer', 'conzace', 'enervon', 'cetirizine'],
  },
  {
    name: 'Toiletries',
    keywords: ['shampoo', 'conditioner', 'head & shoulders', 'pantene', 'palmolive', 'sunsilk', 'creamsilk', 'soap', 'safeguard', 'dove', 'lux', 'kojic', 'toothpaste', 'colgate', 'close up', 'hapee', 'toothbrush', 'deodorant', 'rexona', 'tawas', 'napkin', 'modess', 'whisper', 'sofy', 'tissue', 'toilet paper', 'wipes', 'cologne', 'perfume', 'baby powder', 'face powder', 'talc', 'johnson', 'lotion', 'vaseline', 'razor', 'gillette', 'cotton', 'diaper', 'pampers', 'eq', 'sanitary'],
  },
  {
    name: 'Household & Cleaning',
    keywords: ['zonrox', 'bleach', 'detergent', 'surf', 'tide', 'ariel', 'breeze', 'pride', 'joy', 'dishwashing', 'dishwash', 'fabcon', 'downy', 'comfort', 'domex', 'harpic', 'muriatic', 'baygon', 'insecticide', 'mosquito', 'katol', 'mop', 'walis', 'broom', 'trash bag', 'garbage', 'plastic', 'foil', 'candle', 'kandila', 'battery', 'baterya', 'bulb', 'sando bag', 'sponge', 'scouring'],
  },
  {
    name: 'Eggs & Frozen',
    keywords: ['egg', 'itlog', 'hotdog', 'tocino', 'longganisa', 'bacon', 'ham', 'nuggets', 'ice cream', 'ice', 'selecta', 'magnolia', 'frozen', 'fish ball', 'kikiam', 'squid ball', 'chicken', 'pork', 'meat', 'tilapia', 'bangus', 'galunggong', 'tuyo', 'daing'],
  },
  {
    name: 'School Supplies',
    keywords: ['ballpen', 'ballpoint', 'pen', 'pencil', 'notebook', 'paper', 'intermediate', 'yellow pad', 'crayon', 'eraser', 'sharpener', 'ruler', 'scissors', 'glue', 'envelope', 'folder', 'marker'],
  },
];

/** The standard shelves of a sari-sari store (used until the store has its own list) */
export const DEFAULT_CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9&\-\s]/g, ' ').replace(/\s+/g, ' ').trim();

function hasKeyword(text: string, kw: string): boolean {
  const k = escapeRe(kw);
  // Short words must be a whole word ("gin" must not match "ginger"); longer ones may continue ("sardine" matches "sardines")
  const re = kw.length <= 4 ? new RegExp(`(^|[^a-z0-9])${k}($|[^a-z0-9])`) : new RegExp(`(^|[^a-z0-9])${k}`);
  return re.test(text);
}

/**
 * Best guess of the standard shelf from a product name, or undefined when nothing matches.
 * The result is a shelf key; the app turns it into the store's current name for that shelf.
 */
export function guessCategoryKey(productName: string): string | undefined {
  const text = normalize(productName);
  if (!text) return undefined;
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => hasKeyword(text, kw))) return cat.name;
  }
  return undefined;
}

/** A sub-item (a single piece from a pack) without its own category uses the pack's category. */
export function effectiveCategory(item: InventoryItem, all: InventoryItem[]): string | undefined {
  if (item.category) return item.category;
  if (item.parentId) return all.find((i) => i.id === item.parentId)?.category;
  return undefined;
}

/**
 * Categories that have products, with how many each has.
 * Follows the store's own order (`names`); any category only found on products comes last, A to Z.
 */
export function categoriesInUse(items: InventoryItem[], names: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const c = effectiveCategory(item, items);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const listed = names.filter((n) => counts.has(n)).map((name) => ({ name, count: counts.get(name)! }));
  const extra = [...counts.keys()]
    .filter((n) => !names.includes(n))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, count: counts.get(name)! }));
  return [...listed, ...extra];
}
