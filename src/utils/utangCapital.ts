import { InventoryItem } from '../types';

/**
 * Works out the capital (puhunan) of a utang that was typed in by hand, from the product names.
 * "2x Fort, Coke" looks up Fort and Coke in your inventory and uses their cost and price.
 * (A utang made from the POS already knows its exact capital, so this is only for typed ones.)
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9&\-.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** What one piece costs you. A single piece from a pack costs its share of the pack. */
export function unitCostOf(item: InventoryItem, all: InventoryItem[]): number {
  const parent = item.parentId ? all.find((i) => i.id === item.parentId) : undefined;
  return item.parentId && item.piecesPerParent && parent?.costPrice ? parent.costPrice / item.piecesPerParent : item.costPrice ?? 0;
}

interface Part {
  text: string;
  qty: number;
}

/** "2x Fort, Coke x3" -> [{fort, 2}, {coke, 3}] */
function splitParts(description: string): Part[] {
  return description
    .split(/[,;+&\n/]|\band\b/i)
    .map((p) => norm(p))
    .filter(Boolean)
    .map((text) => ({ text, qty: 1 }));
}

/** Items whose name matches this piece of text. An exact name wins; otherwise any name that contains it (or is contained in it). */
function candidatesFor(text: string, items: InventoryItem[]): InventoryItem[] {
  const usable = items.filter((i) => i.price > 0 && unitCostOf(i, items) > 0);
  const exact = usable.filter((i) => norm(i.name) === text);
  if (exact.length) return exact;
  if (text.length < 3) return [];
  return usable.filter((i) => {
    const name = norm(i.name);
    return name.includes(text) || (name.length >= 3 && text.includes(name));
  });
}

/** Each piece of text can be a name on its own ("555 tuna") or have a quantity around it ("2x fort", "fort x2", "3 pancit canton"). */
function resolvePart(part: Part, items: InventoryItem[]): { qty: number; matches: InventoryItem[] } | null {
  const whole = candidatesFor(part.text, items);
  if (whole.length) return { qty: 1, matches: whole };

  const leading = part.text.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|pcs?|pieces?)?\s*(.+)$/);
  if (leading) {
    const matches = candidatesFor(leading[2].trim(), items);
    if (matches.length) return { qty: parseFloat(leading[1]), matches };
  }
  const trailing = part.text.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/);
  if (trailing) {
    const matches = candidatesFor(trailing[1].trim(), items);
    if (matches.length) return { qty: parseFloat(trailing[2]), matches };
  }
  return null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The capital for a utang of `amount` pesos, or null when it can't be worked out
 * (an item isn't in your inventory, or its cost was never entered).
 * The share of the amount that is capital follows the cost-to-price ratio of the products.
 */
export function estimateCapital(description: string, amount: number, items: InventoryItem[]): number | null {
  if (!description.trim() || !(amount > 0)) return null;
  let priceTotal = 0;
  let costTotal = 0;
  const parts = splitParts(description);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const found = resolvePart(part, items);
    if (!found) return null; // one unknown item would make the whole estimate wrong
    priceTotal += found.qty * mean(found.matches.map((m) => m.price));
    costTotal += found.qty * mean(found.matches.map((m) => unitCostOf(m, items)));
  }
  if (priceTotal <= 0) return null;
  return Math.round(Math.min(amount, amount * (costTotal / priceTotal)) * 100) / 100;
}
