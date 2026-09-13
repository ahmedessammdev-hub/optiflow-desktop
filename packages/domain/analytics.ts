import { Store } from "../database/database";
import { Auth } from "./auth";
import { querySchema, type Page } from "../shared/schemas";
import { utcBoundary, addDays } from "../shared/dates";
import { activeBranchId } from "./stock";
export const analyticalReports = [
  "profit",
  "product_performance",
  "category_performance",
  "stock",
  "low_stock",
  "supplier_balances",
] as const;
export type AnalyticalReport = (typeof analyticalReports)[number];
export function analyticalReport(
  store: Store,
  auth: Auth,
  kind: AnalyticalReport,
  input: unknown,
  timezone: string,
  reorder: number,
): Page {
  auth.require(
    kind === "profit"
      ? "reports.profit"
      : kind === "stock" || kind === "low_stock"
        ? "inventory.view"
        : kind === "supplier_balances"
          ? "purchases.view"
          : "reports.view",
  );
  const q = querySchema.parse(input);
  const params: (string | number)[] = [];
  let sql: string;
  if (kind === "stock" || kind === "low_stock") {
    sql =
      "SELECT p.id,p.name,p.sku,p.type,COALESCE(s.quantity,0) stock_quantity,COALESCE(p.reorder_level,c.reorder_level,?) reorder_level FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN branch_stock s ON s.product_id=p.id AND s.branch_id=? WHERE p.archived_at IS NULL AND p.name LIKE ?";
    params.push(reorder, activeBranchId(store), `%${q.search}%`);
    if (kind === "low_stock") {
      sql +=
        " AND COALESCE(s.quantity,0)<=COALESCE(p.reorder_level,c.reorder_level,?)";
      params.push(reorder);
    }
  } else if (kind === "supplier_balances") {
    sql = `SELECT s.id,s.name,COALESCE(sum(p.total),0) total,COALESCE(sum(p.paid),0) paid,COALESCE(sum((p.total-p.paid)-COALESCE((SELECT sum(sr.total) FROM supplier_returns sr WHERE sr.purchase_id=p.id AND sr.status='posted'),0)),0) balance FROM suppliers s LEFT JOIN purchase_orders p ON p.supplier_id=s.id AND p.branch_id=? WHERE s.name LIKE ? GROUP BY s.id`;
    params.push(activeBranchId(store), `%${q.search}%`);
  } else {
    const clauses = ["name LIKE ?", "branch_id=?"];
    params.push(`%${q.search}%`, activeBranchId(store));
    if (q.from) {
      clauses.push("created_at>=?");
      params.push(utcBoundary(q.from, timezone));
    }
    if (q.to) {
      clauses.push("created_at<?");
      params.push(utcBoundary(addDays(q.to, 1), timezone));
    }
    for (const key of [
      "product_id",
      "customer_id",
      "employee_id",
      "category_id",
    ] as const)
      if (q[key]) {
        clauses.push(`${key}=?`);
        params.push(q[key]!);
      }
    const events = `SELECT i.product_id,i.product_name name,i.category_name category,i.category_id,s.customer_id,s.seller_id employee_id,s.branch_id,s.created_at,i.quantity quantity,i.net_total-i.tax_amount revenue,i.unit_cost*i.quantity cost,i.historical_cost_known known FROM sale_items i JOIN sales s ON s.id=i.sale_id UNION ALL SELECT i.product_id,i.product_name,i.category_name,i.category_id,s.customer_id,s.seller_id,s.branch_id,r.created_at,-ri.quantity,-(ri.amount-ri.tax_amount),-i.unit_cost*ri.quantity,i.historical_cost_known FROM return_items ri JOIN sale_items i ON i.id=ri.sale_item_id JOIN returns r ON r.id=ri.return_id JOIN sales s ON s.id=i.sale_id`;
    const group =
      kind === "category_performance"
        ? "category"
        : kind === "profit"
          ? "business_date(created_at,?)"
          : "product_id";
    if (kind === "profit") params.unshift(timezone);
    sql = `SELECT ${group} id,${kind === "category_performance" ? "category" : kind === "profit" ? "business_date(created_at,?)" : "name"} name,sum(quantity) quantity,sum(revenue) revenue,CASE WHEN min(known)=0 THEN NULL ELSE sum(cost) END cogs,CASE WHEN min(known)=0 THEN NULL ELSE sum(revenue-cost) END profit FROM (${events}) WHERE ${clauses.join(" AND ")} GROUP BY ${kind === "profit" ? "id" : group}`;
    if (kind === "profit") params.splice(1, 0, timezone);
  }
  const rows = store.all(
    `SELECT * FROM (${sql}) ORDER BY name ${q.direction},id LIMIT ? OFFSET ?`,
    ...params,
    q.page_size,
    (q.page - 1) * q.page_size,
  );
  if (!auth.require().permissions.includes("reports.profit"))
    rows.forEach((r) => {
      delete r.cogs;
      delete r.profit;
    });
  return {
    rows,
    total: Number(store.get(`SELECT count(*) n FROM (${sql})`, ...params)?.n),
    page: q.page,
    page_size: q.page_size,
  };
}
