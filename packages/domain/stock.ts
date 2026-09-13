import { randomUUID } from "node:crypto";
import { Store } from "../database/database";
export const MAIN_BRANCH_ID = "00000000-0000-4000-8000-000000000010";
export function activeBranchId(store: Store) {
  const value = store.get(
    "SELECT value FROM app_settings WHERE key='active_branch_id'",
  )?.value;
  if (!value) return MAIN_BRANCH_ID;
  try {
    return String(JSON.parse(String(value)));
  } catch {
    return MAIN_BRANCH_ID;
  }
}
export function moveStock(
  store: Store,
  productId: string,
  delta: number,
  type: string,
  reference: string,
  reason: string,
  userId: string,
  branchId = activeBranchId(store),
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
  const branchBefore = Number(
    store.get(
      "SELECT quantity FROM branch_stock WHERE branch_id=? AND product_id=?",
      branchId,
      productId,
    )?.quantity ?? 0,
  );
  const branchAfter = branchBefore + delta;
  if (branchAfter < 0) throw new Error("Insufficient stock in active branch");
  if (delta < 0) {
    const reserved = Number(
      store.get(
        "SELECT COALESCE(sum(quantity),0) n FROM stock_reservations WHERE branch_id=? AND product_id=? AND status='active'",
        branchId,
        productId,
      )?.n,
    );
    if (branchAfter < reserved)
      throw new Error("Stock is reserved for an active quote");
  }
  store.run(
    "INSERT INTO branch_stock(branch_id,product_id,quantity) VALUES (?,?,?) ON CONFLICT(branch_id,product_id) DO UPDATE SET quantity=excluded.quantity",
    branchId,
    productId,
    branchAfter,
  );
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
    branch_id: branchId,
  });
}
