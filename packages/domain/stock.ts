import { randomUUID } from "node:crypto";
import { Store } from "../database/database";
export function moveStock(
  store: Store,
  productId: string,
  delta: number,
  type: string,
  reference: string,
  reason: string,
  userId: string,
) {
  if (!store.db.inTransaction)
    throw new Error("Stock changes require a transaction");
  if (!Number.isSafeInteger(delta) || delta === 0)
    throw new Error("Invalid stock quantity");
  const p = store.get(
    "SELECT stock_quantity FROM products WHERE id=?",
    productId,
  );
  if (!p) throw new Error("Product not found");
  const before = Number(p.stock_quantity);
  const after = before + delta;
  if (after < 0 || !Number.isSafeInteger(after))
    throw new Error("Insufficient stock");
  const result = store.run(
    "UPDATE products SET stock_quantity=? WHERE id=? AND stock_quantity=?",
    after,
    productId,
    before,
  );
  if (result.changes !== 1)
    throw new Error("Stock conflict; retry the operation");
  store.insert("inventory_movements", {
    id: randomUUID(),
    product_id: productId,
    type,
    quantity_change: delta,
    quantity_before: before,
    quantity_after: after,
    reference_type: type,
    reference_id: reference,
    reason,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
}
