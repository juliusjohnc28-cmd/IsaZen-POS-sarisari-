/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function — handles everything under /api/*
// Bound to a D1 database via the `DB` binding (see wrangler.toml).

interface Env {
  DB: D1Database;
}

// ---- row <-> JS shape mapping ----
const toItem = (r: any) => ({
  id: r.id,
  name: r.name,
  price: r.price,
  costPrice: r.cost_price ?? 0,
  quantity: r.quantity,
  unit: r.unit ?? undefined,
  parentId: r.parent_id ?? undefined,
  piecesPerParent: r.pieces_per_parent ?? undefined,
  imageUrl: r.image_url ?? undefined,
  barcode: r.barcode ?? undefined,
  lowStockLevel: r.low_stock_level ?? undefined,
  expiryDate: r.expiry_date ?? undefined,
  isFavorite: r.is_favorite ? true : undefined,
  category: r.category ?? undefined,
});

const toTx = (r: any) => ({
  id: r.id,
  itemId: r.item_id,
  itemName: r.item_name,
  type: r.type,
  quantity: r.quantity,
  totalPrice: r.total_price,
  timestamp: r.timestamp,
  cost: r.cost ?? undefined,
});

const toUtang = (r: any) => ({
  id: r.id,
  customerName: r.customer_name,
  itemsDescription: r.items_description,
  amount: r.amount,
  paidAmount: r.paid_amount ?? (r.status === 'PAID' ? r.amount : 0),
  cost: r.cost ?? undefined,
  date: r.date,
  status: r.status,
});

const toExpense = (r: any) => ({
  id: r.id,
  description: r.description,
  category: r.category ?? undefined,
  amount: r.amount,
  date: r.date,
});

const toSettings = (r: any) => ({
  storeName: r.store_name,
  ownerName: r.owner_name ?? '',
  securityPin: r.security_pin ?? '',
  logoUrl: r.logo_url ?? '',
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const err = (message: string, status = 400) => json({ error: message }, status);

const uid = () => crypto.randomUUID();
// Customer names are always saved in ALL CAPS.
const cleanName = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').toUpperCase() : '');
const cleanBarcode = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t : null;
};
const now = () => new Date().toISOString();
const cleanDate = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};
const cleanLevel = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < 0 ? null : Math.floor(n);
};
// A product category such as "Canned Goods". Free text (so the owner can add their own), kept short.
const cleanCategory = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 30) : '';
  return t ? t : null;
};
const missingCategoryColumn = (e: any) => String(e?.message ?? e).includes('category');
// Capital on utang. An older database has no cost columns yet: everything still works, just without capital/profit.
const COST_WARNING = 'Your database needs the profit update. Run: npm run db:migrate:add-utang-profit:remote';
let costColumnsKnown = false;
async function hasCostColumns(db: D1Database): Promise<boolean> {
  if (costColumnsKnown) return true;
  try {
    await db.prepare('SELECT cost FROM utangs LIMIT 1').first();
    await db.prepare('SELECT cost FROM transactions LIMIT 1').first();
    costColumnsKnown = true;
    return true;
  } catch {
    return false;
  }
}
const cleanCost = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < 0 ? null : round2(n);
};
const CATEGORIES_TABLE_WARNING = 'Your database needs the categories update. Run: npm run db:migrate:add-categories-table:remote';
const missingTable = (e: any) => String(e?.message ?? e).includes('no such table');
// Remember a category typed in an item form, so it shows up in the list and can be renamed later (best effort)
async function registerCategory(db: D1Database, name: string | null) {
  if (!name) return;
  try {
    const row: any = await db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM categories').first();
    await db
      .prepare('INSERT OR IGNORE INTO categories (id, name, builtin_key, position) VALUES (?, ?, NULL, ?)')
      .bind(crypto.randomUUID(), name, (row?.p ?? 0) + 1)
      .run();
  } catch {
    /* an older database has no categories table yet */
  }
}
const CATEGORY_WARNING = 'Your database needs the category update. Run: npm run db:migrate:add-category:remote';
const round2 = (n: number) => Math.round(n * 100) / 100;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  // strip /api prefix, split into segments
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    // GET /api/state  -> bootstrap everything the app needs
    if (method === 'GET' && parts[0] === 'state') {
      // The list of categories; an older database without the table just uses the standard shelves in the app
      let categories: any[] | undefined;
      try {
        categories = ((await db.prepare('SELECT id, name, builtin_key FROM categories ORDER BY position, name').all()).results ?? []) as any[];
      } catch {
        categories = undefined;
      }
      const [items, txs, utangs, customers, expenses, settings] = await Promise.all([
        db.prepare('SELECT * FROM inventory_items').all(),
        db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC').all(),
        db.prepare('SELECT * FROM utangs ORDER BY date DESC').all(),
        db.prepare('SELECT name FROM customers ORDER BY name').all(),
        db.prepare('SELECT * FROM expenses ORDER BY date DESC').all(),
        db.prepare('SELECT * FROM store_settings WHERE id = 1').first(),
      ]);
      return json({
        items: (items.results ?? []).map(toItem),
        transactions: (txs.results ?? []).map(toTx),
        utangs: (utangs.results ?? []).map(toUtang),
        customers: (customers.results ?? []).map((r: any) => r.name),
        expenses: (expenses.results ?? []).map(toExpense),
        settings: settings ? toSettings(settings) : { storeName: "Nanay's Sari-Sari Store", ownerName: '', securityPin: '', logoUrl: '' },
        categories: categories?.map((r) => ({ id: r.id, name: r.name, builtinKey: r.builtin_key ?? undefined })),
      });
    }

    // ---- items ----
    if (parts[0] === 'items') {
      // POST /api/items  { name, price, costPrice, quantity, unit, parentId, piecesPerParent }
      if (method === 'POST' && parts.length === 1) {
        const b = await request.json<any>();
        const id = uid();
        const barcode = cleanBarcode(b.barcode);
        if (barcode) {
          const dup: any = await db.prepare('SELECT name FROM inventory_items WHERE barcode = ?').bind(barcode).first();
          if (dup) return err(`That barcode is already used by "${dup.name}"`, 409);
        }
        const category = cleanCategory(b.category);
        let warning: string | undefined;
        const baseValues = [id, b.name, b.price, b.costPrice ?? 0, b.quantity ?? 0, b.unit ?? null, b.parentId ?? null, b.piecesPerParent ?? null, b.imageUrl ?? null, barcode, cleanLevel(b.lowStockLevel), cleanDate(b.expiryDate)];
        try {
          await db
            .prepare(
              `INSERT INTO inventory_items (id, name, price, cost_price, quantity, unit, parent_id, pieces_per_parent, image_url, barcode, low_stock_level, expiry_date, is_favorite, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
            )
            .bind(...baseValues, category)
            .run();
        } catch (e: any) {
          // Database made before categories existed: still add the product and say what to run
          if (!missingCategoryColumn(e)) throw e;
          await db
            .prepare(
              `INSERT INTO inventory_items (id, name, price, cost_price, quantity, unit, parent_id, pieces_per_parent, image_url, barcode, low_stock_level, expiry_date, is_favorite)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
            )
            .bind(...baseValues)
            .run();
          warning = category ? CATEGORY_WARNING : undefined;
        }

        let transaction = null;
        if (b.quantity > 0) {
          const txId = uid();
          const ts = now();
          await db
            .prepare(
              `INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp)
               VALUES (?, ?, ?, 'IN', ?, ?, ?)`
            )
            .bind(txId, id, b.name, b.quantity, b.price * b.quantity, ts)
            .run();
          transaction = { id: txId, itemId: id, itemName: b.name, type: 'IN', quantity: b.quantity, totalPrice: b.price * b.quantity, timestamp: ts };
        }

        const item = await db.prepare('SELECT * FROM inventory_items WHERE id = ?').bind(id).first();
        await registerCategory(db, category);
        return json({ item: toItem(item), transaction, warning }, 201);
      }

      // POST /api/items/categories  { updates: [{ id, category }] }   (sort many products at once)
      if (method === 'POST' && parts.length === 2 && parts[1] === 'categories') {
        const b = await request.json<any>();
        const updates: { id: string; category: string | null }[] = (Array.isArray(b.updates) ? b.updates : [])
          .filter((u: any) => u && typeof u.id === 'string')
          .slice(0, 500)
          .map((u: any) => ({ id: u.id, category: cleanCategory(u.category) }));
        if (!updates.length) return err('Nothing to update');
        try {
          await db.batch(updates.map((u) => db.prepare('UPDATE inventory_items SET category = ? WHERE id = ?').bind(u.category, u.id)));
        } catch (e: any) {
          if (missingCategoryColumn(e)) return err(CATEGORY_WARNING, 409);
          throw e;
        }
        for (const name of new Set(updates.map((u) => u.category))) await registerCategory(db, name);
        return json({ updated: updates.length, updates });
      }

      // POST /api/items/:id/stock  { type: 'IN'|'OUT', quantity }
      if (method === 'POST' && parts.length === 3 && parts[2] === 'stock') {
        const id = parts[1];
        const b = await request.json<any>();
        const row: any = await db.prepare('SELECT * FROM inventory_items WHERE id = ?').bind(id).first();
        if (!row) return err('Item not found', 404);
        const delta = b.type === 'IN' ? b.quantity : -b.quantity;
        const newQty = row.quantity + delta;
        if (newQty < 0) return err('Insufficient stock', 400);

        const ts = now();
        const txId = uid();
        await db.batch([
          db.prepare('UPDATE inventory_items SET quantity = ? WHERE id = ?').bind(newQty, id),
          db
            .prepare(
              `INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(txId, id, row.name, b.type, b.quantity, row.price * b.quantity, ts),
        ]);

        const updated = await db.prepare('SELECT * FROM inventory_items WHERE id = ?').bind(id).first();
        return json({
          item: toItem(updated),
          transaction: { id: txId, itemId: id, itemName: row.name, type: b.type, quantity: b.quantity, totalPrice: row.price * b.quantity, timestamp: ts },
        });
      }

      // PATCH /api/items/:id  { name, quantity, price, costPrice, imageUrl, barcode, lowStockLevel, expiryDate, isFavorite }  (absolute edit, records IN/OUT diff for quantity)
      if (method === 'PATCH' && parts.length === 2) {
        const id = parts[1];
        const b = await request.json<any>();
        const row: any = await db.prepare('SELECT * FROM inventory_items WHERE id = ?').bind(id).first();
        if (!row) return err('Item not found', 404);

        const newName = b.name !== undefined ? b.name : row.name;
        const newQuantity = b.quantity ?? row.quantity;
        const newPrice = b.price ?? row.price;
        const newCostPrice = b.costPrice !== undefined ? b.costPrice : row.cost_price;
        const newImageUrl = b.imageUrl !== undefined ? (b.imageUrl || null) : row.image_url;
        const newBarcode = b.barcode !== undefined ? cleanBarcode(b.barcode) : (row.barcode ?? null);
        if (newBarcode && newBarcode !== (row.barcode ?? null)) {
          const dup: any = await db
            .prepare('SELECT name FROM inventory_items WHERE barcode = ? AND id != ?')
            .bind(newBarcode, id)
            .first();
          if (dup) return err(`That barcode is already used by "${dup.name}"`, 409);
        }
        const newLowLevel = b.lowStockLevel !== undefined ? cleanLevel(b.lowStockLevel) : (row.low_stock_level ?? null);
        const newExpiry = b.expiryDate !== undefined ? cleanDate(b.expiryDate) : (row.expiry_date ?? null);
        const newFavorite = b.isFavorite !== undefined ? (b.isFavorite ? 1 : 0) : (row.is_favorite ? 1 : 0);
        const newCategory = b.category !== undefined ? cleanCategory(b.category) : (row.category ?? null);
        const diff = newQuantity - row.quantity;

        // Old databases (made before categories) have no category column: leave it out and say what to run
        const hasCategoryColumn = 'category' in row;
        const stmts: D1PreparedStatement[] = [
          hasCategoryColumn
            ? db
                .prepare('UPDATE inventory_items SET name = ?, quantity = ?, price = ?, cost_price = ?, image_url = ?, barcode = ?, low_stock_level = ?, expiry_date = ?, is_favorite = ?, category = ? WHERE id = ?')
                .bind(newName, newQuantity, newPrice, newCostPrice, newImageUrl, newBarcode, newLowLevel, newExpiry, newFavorite, newCategory, id)
            : db
                .prepare('UPDATE inventory_items SET name = ?, quantity = ?, price = ?, cost_price = ?, image_url = ?, barcode = ?, low_stock_level = ?, expiry_date = ?, is_favorite = ? WHERE id = ?')
                .bind(newName, newQuantity, newPrice, newCostPrice, newImageUrl, newBarcode, newLowLevel, newExpiry, newFavorite, id),
        ];
        const categoryWarning = !hasCategoryColumn && b.category !== undefined && newCategory ? CATEGORY_WARNING : undefined;

        let transaction = null;
        if (diff !== 0) {
          const type = diff > 0 ? 'IN' : 'OUT';
          const absDiff = Math.abs(diff);
          const txId = uid();
          const ts = now();
          stmts.push(
            db
              .prepare(
                `INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(txId, id, row.name, type, absDiff, newPrice * absDiff, ts)
          );
          transaction = { id: txId, itemId: id, itemName: row.name, type, quantity: absDiff, totalPrice: newPrice * absDiff, timestamp: ts };
        }

        await db.batch(stmts);
        const updated = await db.prepare('SELECT * FROM inventory_items WHERE id = ?').bind(id).first();
        if (b.category !== undefined) await registerCategory(db, newCategory);
        return json({ item: toItem(updated), transaction, warning: categoryWarning });
      }

      // DELETE /api/items/:id
      if (method === 'DELETE' && parts.length === 2) {
        await db.prepare('DELETE FROM inventory_items WHERE id = ?').bind(parts[1]).run();
        return json({ ok: true });
      }
    }

    // ---- undo a recent sale ----
    // POST /api/checkout/undo  { transactionIds: string[], utangId?: string }
    if (method === 'POST' && parts[0] === 'checkout' && parts[1] === 'undo') {
      const b = await request.json<any>();
      const ids: string[] = Array.isArray(b.transactionIds) ? b.transactionIds.filter((x: unknown) => typeof x === 'string') : [];
      if (!ids.length) return err('Nothing to undo');
      const placeholders = ids.map(() => '?').join(',');
      const txRes = await db
        .prepare(`SELECT * FROM transactions WHERE id IN (${placeholders}) AND type IN ('OUT','UTANG')`)
        .bind(...ids)
        .all();
      const txRows = (txRes.results ?? []) as any[];
      if (!txRows.length) return err('That sale was already undone', 404);
      const oldest = Math.min(...txRows.map((t) => new Date(t.timestamp).getTime()));
      if (Date.now() - oldest > 15 * 60 * 1000) return err('Undo is only available for 15 minutes after a sale');

      const stmts: D1PreparedStatement[] = [];
      if (b.utangId) {
        const u: any = await db.prepare('SELECT * FROM utangs WHERE id = ?').bind(b.utangId).first();
        if (u) {
          if ((u.paid_amount ?? 0) > 0) return err('This utang already has a payment, so it cannot be undone');
          stmts.push(db.prepare('DELETE FROM utangs WHERE id = ?').bind(b.utangId));
        }
      }
      for (const t of txRows) {
        stmts.push(db.prepare('UPDATE inventory_items SET quantity = quantity + ? WHERE id = ?').bind(t.quantity, t.item_id));
        stmts.push(db.prepare('DELETE FROM transactions WHERE id = ?').bind(t.id));
      }
      await db.batch(stmts);
      const refreshed = await db.prepare('SELECT * FROM inventory_items').all();
      return json({ items: (refreshed.results ?? []).map(toItem), removedTransactionIds: txRows.map((t) => t.id) });
    }

    // ---- checkout (POS) ----
    // POST /api/checkout  { cart: [{ itemId, quantity }], isUtang, customerName? }
    if (method === 'POST' && parts[0] === 'checkout') {
      const b = await request.json<any>();
      const cart: { itemId: string; quantity: number }[] = b.cart ?? [];
      if (!cart.length) return err('Cart is empty');

      const allItemsRes = await db.prepare('SELECT * FROM inventory_items').all();
      const items = (allItemsRes.results ?? []) as any[];
      const byId = new Map(items.map((i) => [i.id, { ...i }]));
      let saleCost = 0;

      const stmts: D1PreparedStatement[] = [];
      const newTxs: any[] = [];
      const ts = now();
      const txType = b.isUtang ? 'UTANG' : 'OUT';

      for (const cartItem of cart) {
        const item = byId.get(cartItem.itemId);
        if (!item) continue;

        // break a parent pack if this item doesn't have enough loose stock
        if (item.parent_id && item.pieces_per_parent && item.quantity < cartItem.quantity) {
          const needed = cartItem.quantity - item.quantity;
          const parentsToBreak = Math.ceil(needed / item.pieces_per_parent);
          const parent = byId.get(item.parent_id);
          if (parent && parent.quantity >= parentsToBreak) {
            parent.quantity -= parentsToBreak;
            item.quantity += parentsToBreak * item.pieces_per_parent;
          }
        }

        item.quantity = Math.max(0, item.quantity - cartItem.quantity);

        // capital of what is being sold (a single piece from a pack costs its share of the pack)
        const parentItem = item.parent_id ? byId.get(item.parent_id) : undefined;
        const unitCost =
          item.parent_id && item.pieces_per_parent && parentItem && parentItem.cost_price
            ? parentItem.cost_price / item.pieces_per_parent
            : item.cost_price ?? 0;
        saleCost += unitCost * cartItem.quantity;

        const txId = uid();
        const totalPrice = item.price * cartItem.quantity;
        newTxs.push({ id: txId, itemId: item.id, itemName: item.name, type: txType, quantity: cartItem.quantity, totalPrice, timestamp: ts });
        stmts.push(
          db
            .prepare(`INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(txId, item.id, item.name, txType, cartItem.quantity, totalPrice, ts)
        );
      }

      for (const item of byId.values()) {
        stmts.push(db.prepare('UPDATE inventory_items SET quantity = ? WHERE id = ?').bind(item.quantity, item.id));
      }

      let utang = null;
      if (b.isUtang) {
        const customerName = cleanName(b.customerName);
        if (!customerName) return err('Customer name is required for utang');
        const totalAmount = newTxs.reduce((s, t) => s + t.totalPrice, 0);
        const itemsDescription = newTxs.map((t) => `${t.quantity}x ${t.itemName}`).join(', ');
        const utangId = uid();
        const cost = round2(saleCost);
        const costSaved = await hasCostColumns(db);
        if (costSaved) {
          stmts.push(
            db
              .prepare(`INSERT INTO utangs (id, customer_name, items_description, amount, cost, date, status) VALUES (?, ?, ?, ?, ?, ?, 'UNPAID')`)
              .bind(utangId, customerName, itemsDescription, totalAmount, cost, ts)
          );
        } else {
          stmts.push(
            db
              .prepare(`INSERT INTO utangs (id, customer_name, items_description, amount, date, status) VALUES (?, ?, ?, ?, ?, 'UNPAID')`)
              .bind(utangId, customerName, itemsDescription, totalAmount, ts)
          );
        }
        utang = { id: utangId, customerName, itemsDescription, amount: totalAmount, cost: costSaved ? cost : undefined, date: ts, status: 'UNPAID' };
      }

      await db.batch(stmts);
      const refreshed = await db.prepare('SELECT * FROM inventory_items').all();
      return json({ items: (refreshed.results ?? []).map(toItem), transactions: newTxs, utang });
    }

    // ---- utangs ----
    if (parts[0] === 'utangs') {
      // POST /api/utangs  { customerName, itemsDescription, amount }
      if (method === 'POST' && parts.length === 1) {
        const b = await request.json<any>();
        const id = uid();
        const date = now();
        const customerName = cleanName(b.customerName);
        if (!customerName) return err('Customer name is required');
        const cost = cleanCost(b.cost);
        let warning: string | undefined;
        if (await hasCostColumns(db)) {
          await db
            .prepare(`INSERT INTO utangs (id, customer_name, items_description, amount, cost, date, status) VALUES (?, ?, ?, ?, ?, ?, 'UNPAID')`)
            .bind(id, customerName, b.itemsDescription ?? '', b.amount, cost, date)
            .run();
        } else {
          await db
            .prepare(`INSERT INTO utangs (id, customer_name, items_description, amount, date, status) VALUES (?, ?, ?, ?, ?, 'UNPAID')`)
            .bind(id, customerName, b.itemsDescription ?? '', b.amount, date)
            .run();
          warning = cost !== null ? COST_WARNING : undefined;
        }
        return json({ utang: { id, customerName, itemsDescription: b.itemsDescription ?? '', amount: b.amount, cost: cost ?? undefined, date, status: 'UNPAID' }, warning }, 201);
      }

      // PUT /api/utangs/:id/cost  { cost }   (set or clear the capital of one utang)
      if (method === 'PUT' && parts.length === 3 && parts[2] === 'cost') {
        const b = await request.json<any>();
        if (!(await hasCostColumns(db))) return err(COST_WARNING, 409);
        await db.prepare('UPDATE utangs SET cost = ? WHERE id = ?').bind(cleanCost(b.cost), parts[1]).run();
        return json({ ok: true, cost: cleanCost(b.cost) ?? undefined });
      }

      // POST /api/utangs/costs  { updates: [{ id, cost }] }   (fill in the capital of many utang records)
      if (method === 'POST' && parts.length === 2 && parts[1] === 'costs') {
        const b = await request.json<any>();
        if (!(await hasCostColumns(db))) return err(COST_WARNING, 409);
        const updates: { id: string; cost: number | null }[] = (Array.isArray(b.updates) ? b.updates : [])
          .filter((u: any) => u && typeof u.id === 'string')
          .slice(0, 500)
          .map((u: any) => ({ id: u.id, cost: cleanCost(u.cost) }));
        if (!updates.length) return err('Nothing to update');
        await db.batch(updates.map((u) => db.prepare('UPDATE utangs SET cost = ? WHERE id = ?').bind(u.cost, u.id)));
        return json({ updated: updates.length, updates });
      }

      // DELETE /api/utangs/:id   (removes one utang record; payments already received stay in History)
      if (method === 'DELETE' && parts.length === 2) {
        await db.prepare('DELETE FROM utangs WHERE id = ?').bind(parts[1]).run();
        return json({ ok: true });
      }

      // POST /api/utangs/:id/pay  { amount? }   (amount defaults to the full remaining balance)
      if (method === 'POST' && parts.length === 3 && parts[2] === 'pay') {
        const id = parts[1];
        const body: any = await request.json().catch(() => ({}));
        const row: any = await db.prepare('SELECT * FROM utangs WHERE id = ?').bind(id).first();
        if (!row) return err('Utang not found', 404);
        const paidSoFar = row.status === 'PAID' ? row.amount : row.paid_amount ?? 0;
        const remaining = round2(row.amount - paidSoFar);
        if (remaining <= 0) return json({ alreadyPaid: true });

        const pay = body.amount === undefined || body.amount === null ? remaining : round2(Number(body.amount));
        if (!Number.isFinite(pay) || pay <= 0) return err('Enter an amount greater than 0');
        if (pay > remaining + 0.001) return err(`That is more than the balance (₱${remaining.toFixed(2)})`);

        const newPaid = round2(paidSoFar + pay);
        const done = newPaid >= row.amount - 0.001;
        const txId = uid();
        const ts = now();
        // the part of this payment that pays back your capital; the rest is profit (empty when the capital isn't known)
        const txCost = row.cost != null && row.amount > 0 ? round2((pay * row.cost) / row.amount) : null;
        const withCost = await hasCostColumns(db);
        await db.batch([
          db.prepare('UPDATE utangs SET paid_amount = ?, status = ? WHERE id = ?').bind(done ? row.amount : newPaid, done ? 'PAID' : 'UNPAID', id),
          withCost
            ? db
                .prepare(`INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp, cost) VALUES (?, ?, ?, 'PAYMENT', 1, ?, ?, ?)`)
                .bind(txId, row.id, `Utang Payment: ${row.customer_name}`, pay, ts, txCost)
            : db
                .prepare(`INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp) VALUES (?, ?, ?, 'PAYMENT', 1, ?, ?)`)
                .bind(txId, row.id, `Utang Payment: ${row.customer_name}`, pay, ts),
        ]);
        return json({
          utang: toUtang({ ...row, paid_amount: done ? row.amount : newPaid, status: done ? 'PAID' : 'UNPAID' }),
          transaction: { id: txId, itemId: row.id, itemName: `Utang Payment: ${row.customer_name}`, type: 'PAYMENT', quantity: 1, totalPrice: pay, timestamp: ts, cost: withCost ? txCost ?? undefined : undefined },
        });
      }

      // POST /api/utangs/pay-customer  { customerName, amount }   (spread over the oldest unpaid records first)
      if (method === 'POST' && parts.length === 2 && parts[1] === 'pay-customer') {
        const body: any = await request.json();
        const name = cleanName(body.customerName);
        let left = round2(Number(body.amount));
        if (!name) return err('Customer name is required');
        if (!Number.isFinite(left) || left <= 0) return err('Enter an amount greater than 0');

        const res = await db
          .prepare(`SELECT * FROM utangs WHERE UPPER(TRIM(customer_name)) = ? AND status = 'UNPAID' ORDER BY date ASC`)
          .bind(name)
          .all();
        const rows = (res.results ?? []) as any[];
        const totalOwed = round2(rows.reduce((sum, r) => sum + (r.amount - (r.paid_amount ?? 0)), 0));
        if (totalOwed <= 0) return err('This customer has nothing left to pay');
        if (left > totalOwed + 0.001) return err(`That is more than the balance (₱${totalOwed.toFixed(2)})`);

        const stmts: D1PreparedStatement[] = [];
        const utangsOut: any[] = [];
        const txsOut: any[] = [];
        const ts = now();
        const withCost = await hasCostColumns(db);
        for (const r of rows) {
          if (left <= 0) break;
          const remaining = round2(r.amount - (r.paid_amount ?? 0));
          const pay = Math.min(left, remaining);
          left = round2(left - pay);
          const newPaid = round2((r.paid_amount ?? 0) + pay);
          const done = newPaid >= r.amount - 0.001;
          const txId = uid();
          stmts.push(db.prepare('UPDATE utangs SET paid_amount = ?, status = ? WHERE id = ?').bind(done ? r.amount : newPaid, done ? 'PAID' : 'UNPAID', r.id));
          const txCost = r.cost != null && r.amount > 0 ? round2((pay * r.cost) / r.amount) : null;
          stmts.push(
            withCost
              ? db
                  .prepare(`INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp, cost) VALUES (?, ?, ?, 'PAYMENT', 1, ?, ?, ?)`)
                  .bind(txId, r.id, `Utang Payment: ${r.customer_name}`, pay, ts, txCost)
              : db
                  .prepare(`INSERT INTO transactions (id, item_id, item_name, type, quantity, total_price, timestamp) VALUES (?, ?, ?, 'PAYMENT', 1, ?, ?)`)
                  .bind(txId, r.id, `Utang Payment: ${r.customer_name}`, pay, ts)
          );
          utangsOut.push(toUtang({ ...r, paid_amount: done ? r.amount : newPaid, status: done ? 'PAID' : 'UNPAID' }));
          txsOut.push({ id: txId, itemId: r.id, itemName: `Utang Payment: ${r.customer_name}`, type: 'PAYMENT', quantity: 1, totalPrice: pay, timestamp: ts, cost: withCost ? txCost ?? undefined : undefined });
        }
        await db.batch(stmts);
        return json({ utangs: utangsOut, transactions: txsOut });
      }
    }

    // ---- categories ----
    if (parts[0] === 'categories') {
      const nextPosition = async () => {
        const row: any = await db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM categories').first();
        return (row?.p ?? 0) + 1;
      };

      // POST /api/categories  { name }   (add a category)
      if (method === 'POST' && parts.length === 1) {
        const b = await request.json<any>();
        const name = cleanCategory(b.name);
        if (!name) return err('Type a category name');
        try {
          const exists: any = await db.prepare('SELECT name FROM categories WHERE name = ? COLLATE NOCASE').bind(name).first();
          if (exists) return err(`"${exists.name}" already exists`, 409);
          const id = uid();
          await db
            .prepare('INSERT INTO categories (id, name, builtin_key, position) VALUES (?, ?, NULL, ?)')
            .bind(id, name, await nextPosition())
            .run();
          return json({ category: { id, name } }, 201);
        } catch (e: any) {
          if (missingTable(e)) return err(CATEGORIES_TABLE_WARNING, 409);
          throw e;
        }
      }

      // PUT /api/categories/rename  { from, to }   (every product in it moves to the new name)
      if (method === 'PUT' && parts.length === 2 && parts[1] === 'rename') {
        const b = await request.json<any>();
        const from = cleanCategory(b.from);
        const to = cleanCategory(b.to);
        if (!from || !to) return err('Type the new name');
        if (from === to) return json({ ok: true, from, to });
        try {
          const clash: any = await db
            .prepare('SELECT name FROM categories WHERE name = ? COLLATE NOCASE AND name != ? COLLATE NOCASE')
            .bind(to, from)
            .first();
          if (clash) return err(`"${clash.name}" already exists. Pick a different name.`, 409);
          const existing: any = await db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').bind(from).first();
          const stmts: D1PreparedStatement[] = [];
          if (existing) {
            stmts.push(db.prepare('UPDATE categories SET name = ? WHERE id = ?').bind(to, existing.id));
          } else {
            // A category that only existed on products (typed in a form before the list existed)
            stmts.push(
              db.prepare('INSERT OR IGNORE INTO categories (id, name, builtin_key, position) VALUES (?, ?, NULL, ?)').bind(uid(), to, await nextPosition())
            );
          }
          stmts.push(db.prepare('UPDATE inventory_items SET category = ? WHERE category = ? COLLATE NOCASE').bind(to, from));
          await db.batch(stmts);
          return json({ ok: true, from, to });
        } catch (e: any) {
          if (missingTable(e)) return err(CATEGORIES_TABLE_WARNING, 409);
          throw e;
        }
      }

      // DELETE /api/categories/:name   (its products stay, they just have no category)
      if (method === 'DELETE' && parts.length === 2) {
        const name = cleanCategory(decodeURIComponent(parts[1]));
        if (!name) return err('Category not found', 404);
        try {
          await db.batch([
            db.prepare('DELETE FROM categories WHERE name = ? COLLATE NOCASE').bind(name),
            db.prepare('UPDATE inventory_items SET category = NULL WHERE category = ? COLLATE NOCASE').bind(name),
          ]);
          return json({ ok: true });
        } catch (e: any) {
          if (missingTable(e)) return err(CATEGORIES_TABLE_WARNING, 409);
          throw e;
        }
      }
    }

    // ---- customers ----
    if (parts[0] === 'customers') {
      // POST /api/customers  { name }
      if (method === 'POST' && parts.length === 1) {
        const b = await request.json<any>();
        const name = cleanName(b.name);
        if (!name) return err('Customer name is required');
        await db.prepare('INSERT OR IGNORE INTO customers (name) VALUES (?)').bind(name).run();
        return json({ ok: true }, 201);
      }
      // DELETE /api/customers/:name            -> removes the name from the ledger list
      // DELETE /api/customers/:name?records=1  -> also removes all of that customer's utang records
      if (method === 'DELETE' && parts.length === 2) {
        const name = cleanName(decodeURIComponent(parts[1]));
        if (!name) return err('Customer name is required');
        const stmts = [db.prepare('DELETE FROM customers WHERE UPPER(TRIM(name)) = ?').bind(name)];
        if (url.searchParams.get('records') === '1') {
          stmts.push(db.prepare('DELETE FROM utangs WHERE UPPER(TRIM(customer_name)) = ?').bind(name));
        }
        await db.batch(stmts);
        return json({ ok: true });
      }
    }

    // ---- expenses ----
    if (parts[0] === 'expenses') {
      // POST /api/expenses  { description, category?, amount, date? }
      if (method === 'POST' && parts.length === 1) {
        const b = await request.json<any>();
        if (!b.description || !(b.amount > 0)) return err('Description and a positive amount are required');
        const id = uid();
        const date = b.date ?? now();
        await db
          .prepare('INSERT INTO expenses (id, description, category, amount, date) VALUES (?, ?, ?, ?, ?)')
          .bind(id, b.description, b.category ?? null, b.amount, date)
          .run();
        return json({ expense: { id, description: b.description, category: b.category ?? undefined, amount: b.amount, date } }, 201);
      }

      // DELETE /api/expenses/:id
      if (method === 'DELETE' && parts.length === 2) {
        await db.prepare('DELETE FROM expenses WHERE id = ?').bind(parts[1]).run();
        return json({ ok: true });
      }
    }

    // ---- settings ----
    if (method === 'PUT' && parts[0] === 'settings') {
      const b = await request.json<any>();
      const logoUrl = typeof b.logoUrl === 'string' ? b.logoUrl : '';
      // The logo is a small picture saved as text (a data: URL) or a normal https link. Keep it small and safe.
      if (logoUrl && !/^(data:image\/(png|jpeg|webp|gif);base64,|https?:\/\/)/i.test(logoUrl)) {
        return err('The logo must be an image');
      }
      if (logoUrl.length > 600_000) return err('That logo is too big. Please choose a smaller picture.');
      try {
        await db
          .prepare('UPDATE store_settings SET store_name = ?, owner_name = ?, security_pin = ?, logo_url = ? WHERE id = 1')
          .bind(b.storeName, b.ownerName ?? '', b.securityPin ?? '', logoUrl)
          .run();
      } catch (e: any) {
        // Database made before the logo column existed: still save the other settings, and say what is missing
        if (!String(e?.message ?? e).includes('logo_url')) throw e;
        await db
          .prepare('UPDATE store_settings SET store_name = ?, owner_name = ?, security_pin = ? WHERE id = 1')
          .bind(b.storeName, b.ownerName ?? '', b.securityPin ?? '')
          .run();
        return json({ settings: { ...b, logoUrl: '' }, warning: 'Your database needs the logo update. Run: npm run db:migrate:add-logo:remote' });
      }
      return json({ settings: { ...b, logoUrl } });
    }

    // ---- danger zone ----
    if (method === 'POST' && parts[0] === 'clear') {
      await db.batch([
        db.prepare('DELETE FROM inventory_items'),
        db.prepare('DELETE FROM transactions'),
        db.prepare('DELETE FROM utangs'),
        db.prepare('DELETE FROM customers'),
        db.prepare('DELETE FROM expenses'),
      ]);
      return json({ ok: true });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e?.message ?? 'Internal error', 500);
  }
};
