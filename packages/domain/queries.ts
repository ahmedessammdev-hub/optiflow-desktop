import {
  analyticalReport,
  analyticalReports,
  type AnalyticalReport,
} from "./analytics";
import { z } from "zod";
import { Store } from "../database/database";
import { Auth } from "./auth";
import {
  querySchema,
  settingsSchema,
  id,
  type Settings,
  type Page,
} from "../shared/schemas";
import { periodRange, periods } from "../shared/dates";
import { growth } from "../shared/money";
import { defaultSettings } from "../shared/defaults";
import { activeBranchId } from "./stock";
const balanceSql = `s.total-COALESCE((SELECT sum(total) FROM returns WHERE sale_id=s.id),0)-COALESCE((SELECT sum(amount) FROM payments WHERE sale_id=s.id),0)+COALESCE((SELECT sum(amount) FROM refunds WHERE sale_id=s.id),0)`;
const reports = {
  sales: {
    permission: "sales.view",
    sql: `SELECT s.*,json_extract(customer_snapshot,'$.name') customer_name,${balanceSql} balance FROM sales s`,
    search: ["invoice_number", "customer_name"],
    date: "created_at",
  },
  payments: {
    permission: "payments.view",
    sql: "SELECT p.*,s.customer_id,s.seller_id employee_id,s.invoice_number,s.branch_id FROM payments p JOIN sales s ON s.id=p.sale_id",
    search: ["invoice_number", "method", "notes"],
    date: "created_at",
  },
  expenses: {
    permission: "expenses.view",
    sql: "SELECT * FROM expenses",
    search: ["category", "description", "method"],
    date: "created_at",
  },
  inventory: {
    permission: "inventory.view",
    sql: "SELECT m.*,p.name FROM inventory_movements m JOIN products p ON p.id=m.product_id",
    search: ["name", "type", "reason"],
    date: "created_at",
  },
  purchases: {
    permission: "purchases.view",
    sql: "SELECT p.*,s.name supplier_name FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id",
    search: ["invoice_number", "supplier_name", "status"],
    date: "created_at",
  },
  returns: {
    permission: "sales.view",
    sql: "SELECT r.*,s.invoice_number,s.branch_id FROM returns r JOIN sales s ON s.id=r.sale_id",
    search: ["invoice_number", "reason"],
    date: "created_at",
  },
  cash: {
    permission: "cash.view",
    sql: "SELECT t.*,s.branch_id FROM cash_transactions t JOIN cash_sessions s ON s.id=t.session_id",
    search: ["type", "reason"],
    date: "created_at",
  },
  audit: {
    permission: "audit.view",
    sql: "SELECT * FROM audit_logs",
    search: ["action", "entity", "entity_id"],
    date: "created_at",
  },
  debts: {
    permission: "reports.view",
    sql: `SELECT s.id,s.invoice_number,s.customer_id,s.branch_id,json_extract(customer_snapshot,'$.name') customer_name,${balanceSql} balance,s.created_at FROM sales s WHERE (${balanceSql})>0`,
    search: ["invoice_number", "customer_name"],
    date: "created_at",
  },
  users: {
    permission: "users.manage",
    sql: "SELECT u.id,u.name,u.username,u.created_at,u.archived_at,group_concat(ur.role_id) roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id GROUP BY u.id",
    search: ["name", "username"],
    date: "created_at",
  },
  backups: {
    permission: "backup.manage",
    sql: "SELECT * FROM backup_history",
    search: ["file_name"],
    date: "created_at",
  },
  sessions: {
    permission: "cash.view",
    sql: "SELECT *,opened_at created_at FROM cash_sessions",
    search: ["id"],
    date: "created_at",
  },
} as const;
export type Report = keyof typeof reports | AnalyticalReport;
export class Queries {
  constructor(
    private store: Store,
    private auth: Auth,
  ) {}
  settings(): Settings {
    this.auth.require();
    return this.readSettings();
  }
  readSettings(): Settings {
    const value = this.store.get(
      "SELECT value FROM app_settings WHERE key='settings'",
    )?.value;
    return value
      ? settingsSchema.parse(JSON.parse(String(value)))
      : defaultSettings;
  }
  saveSettings(input: unknown) {
    const user = this.auth.require("settings.manage");
    const data = settingsSchema.parse(input);
    this.store.tx(() => {
      const before = this.readSettings();
      this.store.run(
        "INSERT INTO app_settings VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        JSON.stringify(data),
      );
      this.store.audit(user.id, "update", "settings", "settings", before, data);
    });
  }
  list(kind: Report, input: unknown): Page {
    if (analyticalReports.includes(kind as AnalyticalReport))
      return analyticalReport(
        this.store,
        this.auth,
        kind as AnalyticalReport,
        input,
        this.readSettings().timezone,
        this.readSettings().reorder_level,
      );
    const report = reports[kind as keyof typeof reports];
    if (!report) throw new Error("Unknown report");
    this.auth.require(report.permission);
    const q = querySchema.parse(input);
    const clauses = [
      `(${report.search.map((k) => `${k} LIKE ?`).join(" OR ")})`,
    ];
    const params: (string | number)[] = report.search.map(
      () => `%${q.search}%`,
    );
    if (q.from) {
      clauses.push(`${report.date}>=?`);
      params.push(
        periodRange("custom", this.readSettings().timezone, new Date(), {
          from: q.from,
          to: q.from,
        }).start,
      );
    }
    if (q.to) {
      clauses.push(`${report.date}<?`);
      params.push(
        periodRange("custom", this.readSettings().timezone, new Date(), {
          from: q.to,
          to: q.to,
        }).end,
      );
    }
    if (q.customer_id && ["sales", "debts", "payments"].includes(kind)) {
      clauses.push("customer_id=?");
      params.push(q.customer_id);
    }
    if (q.method && ["payments", "expenses"].includes(kind)) {
      clauses.push("method=?");
      params.push(q.method);
    }
    if (q.supplier_id && kind === "purchases") {
      clauses.push("supplier_id=?");
      params.push(q.supplier_id);
    }
    if (q.product_id && kind === "inventory") {
      clauses.push("product_id=?");
      params.push(q.product_id);
    }
    if (q.employee_id && kind === "sales") {
      clauses.push("seller_id=?");
      params.push(q.employee_id);
    }
    if (
      [
        "sales",
        "payments",
        "expenses",
        "inventory",
        "purchases",
        "returns",
        "cash",
        "debts",
        "sessions",
      ].includes(kind)
    ) {
      clauses.push("branch_id=?");
      params.push(activeBranchId(this.store));
    }
    const sql = `SELECT * FROM (${report.sql}) WHERE ${clauses.join(" AND ")}`;
    return {
      rows: this.store.all(
        `${sql} ORDER BY ${report.date} ${q.direction},id LIMIT ? OFFSET ?`,
        ...params,
        q.page_size,
        (q.page - 1) * q.page_size,
      ),
      total: Number(
        this.store.get(`SELECT count(*) n FROM (${sql})`, ...params)?.n,
      ),
      page: q.page,
      page_size: q.page_size,
    };
  }
  lowStock() {
    this.auth.require("inventory.view");
    return this.store.all(
      "SELECT p.id,p.name,p.sku,COALESCE(s.quantity,0) stock_quantity,COALESCE(p.reorder_level,c.reorder_level,?) reorder_level FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN branch_stock s ON s.product_id=p.id AND s.branch_id=? WHERE p.archived_at IS NULL AND COALESCE(s.quantity,0)<=COALESCE(p.reorder_level,c.reorder_level,?) ORDER BY stock_quantity LIMIT 100",
      this.readSettings().reorder_level,
      activeBranchId(this.store),
      this.readSettings().reorder_level,
    );
  }
  dashboard(input: unknown) {
    this.auth.require("dashboard.view");
    const data = z
      .object({
        period: z.enum(periods),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
      })
      .parse(input);
    const range = periodRange(
      data.period,
      this.readSettings().timezone,
      new Date(),
      data.from && data.to ? { from: data.from, to: data.to } : undefined,
    );
    const branchId = activeBranchId(this.store);
    const aggregate = (start: string, end: string) => {
      const sale = this.store.get(
        "SELECT COALESCE(sum(total-tax),0) revenue,count(*) sales,COALESCE(sum(total),0) invoiced FROM sales WHERE created_at>=? AND created_at<? AND branch_id=?",
        start,
        end,
        branchId,
      )!;
      const cost = Number(
        this.store.get(
          "SELECT COALESCE(sum(i.unit_cost*i.quantity),0) n FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.created_at>=? AND s.created_at<? AND s.branch_id=?",
          start,
          end,
          branchId,
        )?.n,
      );
      const returned = this.store.get(
        "SELECT COALESCE(sum(ri.amount),0) total,COALESCE(sum(si.unit_cost*ri.quantity),0) cost FROM return_items ri JOIN returns r ON r.id=ri.return_id JOIN sale_items si ON si.id=ri.sale_item_id JOIN sales s ON s.id=si.sale_id WHERE r.created_at>=? AND r.created_at<? AND s.branch_id=?",
        start,
        end,
        branchId,
      )!;
      const returnRevenue = Number(
        this.store.get(
          "SELECT COALESCE(sum(ri.amount-ri.tax_amount),0) n FROM return_items ri JOIN returns r ON r.id=ri.return_id JOIN sale_items si ON si.id=ri.sale_item_id JOIN sales s ON s.id=si.sale_id WHERE r.created_at>=? AND r.created_at<? AND s.branch_id=?",
          start,
          end,
          branchId,
        )?.n,
      );
      const revenue = Number(sale.revenue) - returnRevenue;
      const cogs = cost - Number(returned.cost);
      const sum = (
        table: "payments" | "expenses" | "refunds" | "cash_transactions",
      ) =>
        Number(
          this.store.get(
            table === "expenses"
              ? "SELECT COALESCE(sum(amount),0) n FROM expenses WHERE created_at>=? AND created_at<? AND branch_id=?"
              : table === "cash_transactions"
                ? "SELECT COALESCE(sum(t.amount),0) n FROM cash_transactions t JOIN cash_sessions cs ON cs.id=t.session_id WHERE t.created_at>=? AND t.created_at<? AND cs.branch_id=?"
                : `SELECT COALESCE(sum(t.amount),0) n FROM ${table} t JOIN sales s ON s.id=t.sale_id WHERE t.created_at>=? AND t.created_at<? AND s.branch_id=?`,
            start,
            end,
            branchId,
          )?.n,
        );
      return {
        revenue,
        cogs,
        profit: revenue - cogs,
        sales: Number(sale.sales),
        average_order: Number(sale.sales)
          ? Math.round(Number(sale.invoiced) / Number(sale.sales))
          : 0,
        collected: sum("payments"),
        expenses: sum("expenses"),
        refunds: sum("refunds"),
        cash_movement: sum("cash_transactions"),
        new_customers: Number(
          this.store.get(
            "SELECT count(*) n FROM customers WHERE created_at>=? AND created_at<?",
            start,
            end,
          )?.n,
        ),
      };
    };
    const current = aggregate(range.start, range.end);
    const previous = aggregate(range.previous_start, range.previous_end);
    const profitAllowed = this.auth
      .require()
      .permissions.includes("reports.profit");
    const metrics: Record<string, number | null> = {
      ...current,
      debt: Number(
        this.store.get(
          `SELECT COALESCE(sum(${balanceSql}),0) n FROM sales s WHERE s.branch_id=?`,
          branchId,
        )?.n,
      ),
      revenue_growth: growth(current.revenue, previous.revenue),
    };
    const unknownCosts = Number(
      this.store.get(
        "SELECT count(*) n FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.branch_id=? AND i.historical_cost_known=0 AND ((s.created_at>=? AND s.created_at<?) OR EXISTS (SELECT 1 FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.sale_item_id=i.id AND r.created_at>=? AND r.created_at<?))",
        branchId,
        range.previous_start,
        range.end,
        range.previous_start,
        range.end,
      )?.n,
    );
    if (profitAllowed) {
      metrics.profit_growth = unknownCosts
        ? null
        : growth(current.profit, previous.profit);
      if (unknownCosts) {
        metrics.profit = null;
        metrics.cogs = null;
      }
    } else {
      delete metrics.profit;
      delete metrics.cogs;
    }
    const timezone = this.readSettings().timezone;
    const lineEvents = `SELECT i.product_id,i.product_name name,i.category_name category,s.branch_id,s.created_at,i.net_total-i.tax_amount revenue,i.unit_cost*i.quantity cost,i.historical_cost_known known FROM sale_items i JOIN sales s ON s.id=i.sale_id UNION ALL SELECT i.product_id,i.product_name,i.category_name,s.branch_id,r.created_at,-(ri.amount-ri.tax_amount),-i.unit_cost*ri.quantity,i.historical_cost_known FROM return_items ri JOIN sale_items i ON i.id=ri.sale_item_id JOIN returns r ON r.id=ri.return_id JOIN sales s ON s.id=i.sale_id`;
    const permissions = this.auth.require().permissions;
    metrics.appointments_today = Number(
      this.store.get(
        "SELECT count(*) n FROM appointments WHERE starts_at>=? AND starts_at<? AND branch_id=? AND status NOT IN ('cancelled','no_show')",
        range.start,
        range.end,
        branchId,
      )?.n,
    );
    metrics.lab_pending = Number(
      this.store.get(
        "SELECT count(*) n FROM lab_orders WHERE branch_id=? AND status NOT IN ('delivered','cancelled')",
        branchId,
      )?.n,
    );
    return {
      range,
      metrics,
      unknown_costs: unknownCosts,
      profit_trend: profitAllowed
        ? this.store.all(
            `SELECT business_date(created_at,?) day,CASE WHEN min(known)=0 THEN NULL ELSE sum(revenue-cost) END amount FROM (${lineEvents}) WHERE created_at>=? AND created_at<? AND branch_id=? GROUP BY day ORDER BY day`,
            timezone,
            range.start,
            range.end,
            branchId,
          )
        : [],
      top_products: this.store.all(
        `SELECT product_id id,name,sum(revenue) amount FROM (${lineEvents}) WHERE created_at>=? AND created_at<? AND branch_id=? GROUP BY product_id ORDER BY amount DESC,id LIMIT 10`,
        range.start,
        range.end,
        branchId,
      ),
      top_categories: this.store.all(
        `SELECT COALESCE(category,'—') name,sum(revenue) amount FROM (${lineEvents}) WHERE created_at>=? AND created_at<? AND branch_id=? GROUP BY category ORDER BY amount DESC,name LIMIT 10`,
        range.start,
        range.end,
        branchId,
      ),
      recent_sales: permissions.includes("sales.view")
        ? this.store.all(
            `SELECT id,invoice_number,total FROM sales WHERE created_at>=? AND created_at<? AND branch_id=? ORDER BY created_at DESC,id LIMIT 10`,
            range.start,
            range.end,
            branchId,
          )
        : [],
      recent_payments: permissions.includes("payments.view")
        ? this.store.all(
            `SELECT p.id,s.invoice_number,p.method,p.amount FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.created_at>=? AND p.created_at<? AND s.branch_id=? ORDER BY p.created_at DESC,p.id LIMIT 10`,
            range.start,
            range.end,
            branchId,
          )
        : [],
      outstanding: permissions.includes("reports.view")
        ? this.store.all(
            `SELECT c.id,c.name,sum(${balanceSql}) balance FROM sales s JOIN customers c ON c.id=s.customer_id WHERE s.branch_id=? GROUP BY c.id HAVING balance>0 ORDER BY balance DESC,c.id LIMIT 10`,
            branchId,
          )
        : [],
      trend: this.store.all(
        "SELECT business_date(created_at,?) day,sum(revenue) revenue,sum(sales_count) sales FROM (SELECT branch_id,created_at,total-tax revenue,1 sales_count FROM sales UNION ALL SELECT s.branch_id,r.created_at,-sum(ri.amount-ri.tax_amount) revenue,0 sales_count FROM returns r JOIN return_items ri ON ri.return_id=r.id JOIN sales s ON s.id=r.sale_id GROUP BY r.id) WHERE created_at>=? AND created_at<? AND branch_id=? GROUP BY business_date(created_at,?) ORDER BY day",
        timezone,
        range.start,
        range.end,
        branchId,
        timezone,
      ),
      by_type: this.store.all(
        "SELECT name,sum(amount) amount FROM (SELECT i.product_type name,i.net_total-i.tax_amount amount,s.branch_id,s.created_at FROM sale_items i JOIN sales s ON s.id=i.sale_id UNION ALL SELECT i.product_type,-(ri.amount-ri.tax_amount),s.branch_id,r.created_at FROM return_items ri JOIN sale_items i ON i.id=ri.sale_item_id JOIN returns r ON r.id=ri.return_id JOIN sales s ON s.id=i.sale_id) WHERE created_at>=? AND created_at<? AND branch_id=? GROUP BY name",
        range.start,
        range.end,
        branchId,
      ),
      payment_methods: this.store.all(
        "SELECT p.method name,sum(p.amount) amount FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.created_at>=? AND p.created_at<? AND s.branch_id=? GROUP BY p.method",
        range.start,
        range.end,
        branchId,
      ),
    };
  }
  statement(input: unknown) {
    this.auth.require("customers.view");
    this.auth.require("payments.view");
    const customerId = id.parse(input);
    const rows = this.store.all(
      `SELECT id,created_at,'invoice' type,total debit,0 credit FROM sales WHERE customer_id=? UNION ALL SELECT p.id,p.created_at,'payment',0,p.amount FROM payments p JOIN sales s ON s.id=p.sale_id WHERE s.customer_id=? UNION ALL SELECT r.id,r.created_at,'return',0,r.total FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=? UNION ALL SELECT r.id,r.created_at,'refund',r.amount,0 FROM refunds r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=? ORDER BY created_at,id`,
      customerId,
      customerId,
      customerId,
      customerId,
    );
    let balance = 0;
    return rows.map((r) => {
      balance += Number(r.debit) - Number(r.credit);
      return { ...r, balance };
    });
  }
}
