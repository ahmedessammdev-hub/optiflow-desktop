import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "../database/database";
import { Auth } from "./auth";
import { Finance, cashEntry } from "./finance";
import {
  id,
  money,
  methods,
  querySchema,
  text,
  type Page,
  type Row,
} from "../shared/schemas";
import { totals } from "../shared/money";
import { activeBranchId, moveStock } from "./stock";
type WorkflowKind =
  "appointments" | "lab_orders" | "repairs" | "customer_followups";
const states = {
  appointments: ["scheduled", "confirmed", "completed", "cancelled", "no_show"],
  lab_orders: [
    "draft",
    "sent",
    "in_progress",
    "ready",
    "delivered",
    "cancelled",
  ],
  repairs: [
    "received",
    "diagnosing",
    "waiting_parts",
    "ready",
    "delivered",
    "cancelled",
  ],
  customer_followups: ["pending", "completed", "cancelled"],
} as const;
const base = z.object({ id: id.optional(), customer_id: id });
const schemas = {
  appointments: base.extend({
    starts_at: z.string().datetime(),
    status: z.enum(states.appointments).default("scheduled"),
    purpose: text.min(1),
    reminder_at: z.string().datetime().nullable().default(null),
    notes: text.default(""),
  }),
  lab_orders: base.extend({
    sale_id: id.nullable().default(null),
    prescription_id: id.nullable().default(null),
    lab_name: text.min(1),
    status: z.enum(states.lab_orders).default("draft"),
    expected_at: z.string().datetime().nullable().default(null),
    cost: money,
    notes: text.default(""),
  }),
  repairs: base.extend({
    sale_id: id.nullable().default(null),
    status: z.enum(states.repairs).default("received"),
    item_description: text.min(1),
    issue: text.min(1),
    resolution: text.default(""),
    cost: money,
    received_at: z.string().datetime(),
    due_at: z.string().datetime().nullable().default(null),
    delivered_at: z.string().datetime().nullable().default(null),
    warranty_until: z.string().date().nullable().default(null),
    notes: text.default(""),
  }),
  customer_followups: base.extend({
    type: z.enum(["exam", "collection", "lens_replacement", "other"]),
    due_at: z.string().datetime(),
    status: z.enum(states.customer_followups).default("pending"),
    notes: text.default(""),
  }),
};
const transitions: Record<WorkflowKind, Record<string, string[]>> = {
  appointments: {
    scheduled: ["confirmed", "cancelled"],
    confirmed: ["completed", "cancelled", "no_show"],
    completed: [],
    cancelled: [],
    no_show: [],
  },
  lab_orders: {
    draft: ["sent", "cancelled"],
    sent: ["in_progress", "ready", "cancelled"],
    in_progress: ["ready", "cancelled"],
    ready: ["delivered"],
    delivered: [],
    cancelled: [],
  },
  repairs: {
    received: ["diagnosing", "cancelled"],
    diagnosing: ["waiting_parts", "ready", "cancelled"],
    waiting_parts: ["ready", "cancelled"],
    ready: ["delivered"],
    delivered: [],
    cancelled: [],
  },
  customer_followups: {
    pending: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  },
};
export class Expansion {
  constructor(
    private store: Store,
    private auth: Auth,
    private finance: Finance,
  ) {}
  private customer(customerId: string) {
    if (
      !this.store.get(
        "SELECT id FROM customers WHERE id=? AND archived_at IS NULL",
        customerId,
      )
    )
      throw new Error("Customer not found");
  }
  saveWorkflow(kind: WorkflowKind, input: unknown) {
    const user = this.auth.require("customers.update");
    const data = schemas[kind].parse(input);
    this.customer(data.customer_id);
    return this.store.tx(() => {
      const now = new Date().toISOString();
      const entityId = data.id ?? randomUUID();
      const before = data.id
        ? this.store.get(`SELECT * FROM ${kind} WHERE id=?`, entityId)
        : undefined;
      if (data.id && !before) throw new Error("Record not found");
      if (
        before &&
        String(before.status) !== data.status &&
        !transitions[kind][String(before.status)]?.includes(data.status)
      )
        throw new Error("Invalid status transition");
      const values: Row = { ...data, id: entityId, updated_at: now };
      delete values.id;
      if (kind === "appointments")
        values.reminder_sent_at =
          before?.reminder_at === values.reminder_at
            ? (before?.reminder_sent_at ?? null)
            : null;
      if (kind === "customer_followups") {
        delete values.updated_at;
        values.reminder_sent_at =
          before?.due_at === values.due_at
            ? (before?.reminder_sent_at ?? null)
            : null;
        if (data.status === "completed" && !before?.completed_at)
          values.completed_at = now;
      }
      if (data.id)
        this.store.run(
          `UPDATE ${kind} SET ${Object.keys(values)
            .map((k) => `${k}=?`)
            .join(",")} WHERE id=?`,
          ...Object.values(values),
          entityId,
        );
      else
        this.store.insert(kind, {
          id: entityId,
          ...values,
          branch_id: activeBranchId(this.store),
          created_by: user.id,
          created_at: now,
        });
      this.store.audit(
        user.id,
        data.id ? "update" : "create",
        kind,
        entityId,
        before ?? null,
        data,
      );
      return entityId;
    });
  }
  list(
    kind:
      | WorkflowKind
      | "quotes"
      | "stocktakes"
      | "supplier_returns"
      | "branches"
      | "transfers",
    input: unknown,
  ): Page {
    this.auth.require(
      kind === "stocktakes" || kind === "transfers" || kind === "branches"
        ? "inventory.view"
        : kind === "supplier_returns"
          ? "purchases.view"
          : "customers.view",
    );
    const q = querySchema.parse(input);
    const source: Record<string, string> = {
      appointments: "appointments a JOIN customers c ON c.id=a.customer_id",
      lab_orders: "lab_orders a JOIN customers c ON c.id=a.customer_id",
      repairs: "repairs a JOIN customers c ON c.id=a.customer_id",
      customer_followups:
        "customer_followups a JOIN customers c ON c.id=a.customer_id",
      quotes: "quotes a LEFT JOIN customers c ON c.id=a.customer_id",
      stocktakes: "stocktakes a",
      supplier_returns:
        "supplier_returns a JOIN suppliers c ON c.id=a.supplier_id",
      branches: "branches a",
      transfers: "inventory_transfers a",
    };
    const customerKinds = new Set([
      "appointments",
      "lab_orders",
      "repairs",
      "customer_followups",
      "quotes",
      "supplier_returns",
    ]);
    const name = customerKinds.has(kind)
      ? "COALESCE(c.name,'')"
      : kind === "branches"
        ? "a.name"
        : "''";
    const searchable =
      kind === "branches"
        ? "a.name||' '||a.code||' '||a.address"
        : kind === "supplier_returns"
          ? "c.name||' '||a.status||' '||a.reason"
          : `COALESCE(${name},'')||' '||a.status||' '||COALESCE(a.notes,'')`;
    const scoped = new Set([
        "appointments",
        "lab_orders",
        "repairs",
        "customer_followups",
        "quotes",
        "stocktakes",
        "supplier_returns",
      ]),
      branchId = activeBranchId(this.store),
      where = `${searchable} LIKE ?${scoped.has(kind) ? " AND a.branch_id=?" : kind === "transfers" ? " AND (a.from_branch_id=? OR a.to_branch_id=?)" : ""}`;
    const sql = `SELECT a.*,${name} customer_name FROM ${source[kind]} WHERE ${where} ORDER BY ${kind === "appointments" ? "a.starts_at" : "a.created_at"} DESC,a.id LIMIT ? OFFSET ?`;
    const params = [
      `%${q.search}%`,
      ...(scoped.has(kind)
        ? [branchId]
        : kind === "transfers"
          ? [branchId, branchId]
          : []),
    ];
    return {
      rows: this.store.all(
        sql,
        ...params,
        q.page_size,
        (q.page - 1) * q.page_size,
      ),
      total: Number(
        this.store.get(
          `SELECT count(*) n FROM ${source[kind]} WHERE ${where}`,
          ...params,
        )?.n,
      ),
      page: q.page,
      page_size: q.page_size,
    };
  }
  createQuote(input: unknown) {
    const user = this.auth.require("sales.create");
    const data = z
      .object({
        customer_id: id,
        expires_at: z.string().date().nullable().default(null),
        discount: money.default(0),
        tax: money.default(0),
        notes: text.default(""),
        reserve_stock: z.boolean().default(false),
        items: z
          .array(
            z.object({
              product_id: id,
              quantity: z.number().int().min(1),
              unit_price: money.optional(),
            }),
          )
          .min(1)
          .max(300),
      })
      .parse(input);
    this.customer(data.customer_id);
    return this.store.tx(() => {
      const products = data.items.map((item) => {
        const p = this.store.get(
          "SELECT * FROM products WHERE id=? AND archived_at IS NULL",
          item.product_id,
        );
        if (!p) throw new Error("Product not found");
        return {
          p,
          item,
          quantity: item.quantity,
          unit_price: item.unit_price ?? Number(p.unit_price),
        };
      });
      const amount = totals(products, data.discount, data.tax);
      if (data.discount) this.auth.require("sales.discount");
      for (const product of products)
        if (product.unit_price !== Number(product.p.unit_price))
          this.auth.require("sales.override_price");
      const entityId = randomUUID(),
        now = new Date().toISOString(),
        branchId = activeBranchId(this.store),
        next = Number(this.store.get("SELECT count(*) n FROM quotes")?.n) + 1;
      if (data.reserve_stock) {
        const requested = new Map<string, number>();
        for (const product of products)
          requested.set(
            String(product.p.id),
            (requested.get(String(product.p.id)) ?? 0) + product.quantity,
          );
        for (const [productId, quantity] of requested) {
          const available = Number(
            this.store.get(
              "SELECT COALESCE(bs.quantity,0)-COALESCE((SELECT sum(quantity) FROM stock_reservations WHERE branch_id=? AND product_id=? AND status='active'),0) n FROM products p LEFT JOIN branch_stock bs ON bs.product_id=p.id AND bs.branch_id=? WHERE p.id=?",
              branchId,
              productId,
              branchId,
              productId,
            )?.n,
          );
          if (available < quantity)
            throw new Error("Insufficient stock available to reserve");
        }
      }
      this.store.insert("quotes", {
        id: entityId,
        quote_number: `Q-${String(next).padStart(7, "0")}`,
        customer_id: data.customer_id,
        customer_snapshot: JSON.stringify(
          this.store.get(
            "SELECT name,phone,address FROM customers WHERE id=?",
            data.customer_id,
          ),
        ),
        status: "draft",
        ...amount,
        deposit: 0,
        reserved: data.reserve_stock ? 1 : 0,
        expires_at: data.expires_at,
        notes: data.notes,
        created_by: user.id,
        created_at: now,
        converted_sale_id: null,
        branch_id: branchId,
      });
      for (const p of products)
        this.store.insert("quote_items", {
          id: randomUUID(),
          quote_id: entityId,
          product_id: p.p.id,
          product_snapshot: JSON.stringify({ name: p.p.name, sku: p.p.sku }),
          quantity: p.quantity,
          unit_price: p.unit_price,
          subtotal: p.quantity * p.unit_price,
        });
      if (data.reserve_stock)
        for (const p of products)
          this.store.insert("stock_reservations", {
            id: randomUUID(),
            quote_id: entityId,
            branch_id: branchId,
            product_id: p.p.id,
            quantity: p.quantity,
            status: "active",
            expires_at: data.expires_at,
            created_at: now,
          });
      this.store.audit(user.id, "create", "quotes", entityId, null, data);
      return entityId;
    });
  }
  quoteDetail(input: unknown) {
    this.auth.require("sales.view");
    const quoteId = id.parse(input),
      quote = this.store.get("SELECT * FROM quotes WHERE id=?", quoteId);
    if (!quote) throw new Error("Quote not found");
    return {
      quote,
      items: this.store.all(
        "SELECT * FROM quote_items WHERE quote_id=?",
        quoteId,
      ),
      payments: this.store.all(
        "SELECT * FROM quote_payments WHERE quote_id=? ORDER BY created_at",
        quoteId,
      ),
      refunds: this.store.all(
        "SELECT * FROM quote_refunds WHERE quote_id=? ORDER BY created_at",
        quoteId,
      ),
    };
  }
  quoteDeposit(input: unknown) {
    const user = this.auth.require("payments.create");
    const data = z
      .object({
        quote_id: id,
        amount: money.refine((n) => n > 0),
        method: z.enum(methods),
        notes: text.default(""),
      })
      .parse(input);
    this.store.tx(() => {
      const q = this.store.get(
        "SELECT * FROM quotes WHERE id=? AND status IN ('draft','accepted')",
        data.quote_id,
      );
      if (!q) throw new Error("Quote cannot accept a deposit");
      const paid = Number(
        this.store.get(
          "SELECT COALESCE(sum(amount),0) n FROM quote_payments WHERE quote_id=?",
          data.quote_id,
        )?.n,
      );
      if (paid + data.amount > Number(q.total))
        throw new Error("Payment exceeds quote total");
      if (data.method === "cash")
        cashEntry(
          this.store,
          data.amount,
          "quote_deposit",
          data.quote_id,
          data.notes,
          user.id,
        );
      this.store.insert("quote_payments", {
        id: randomUUID(),
        quote_id: data.quote_id,
        amount: data.amount,
        method: data.method,
        notes: data.notes,
        user_id: user.id,
        created_at: new Date().toISOString(),
      });
      this.store.run(
        "UPDATE quotes SET deposit=?,status='accepted' WHERE id=?",
        paid + data.amount,
        data.quote_id,
      );
      this.store.audit(user.id, "deposit", "quotes", data.quote_id, null, data);
    });
  }
  convertQuote(input: unknown) {
    const user = this.auth.require("sales.create");
    const data = z
      .object({
        quote_id: id,
        prescription_id: id.nullable().default(null),
        payments: z
          .array(
            z.object({
              amount: money.refine((n) => n > 0),
              method: z.enum(methods),
              notes: text.default(""),
            }),
          )
          .max(20)
          .default([]),
      })
      .parse(input);
    return this.store.tx(() => {
      const detail = this.quoteDetail(data.quote_id),
        q = detail.quote;
      if (!["draft", "accepted"].includes(String(q.status)))
        throw new Error("Quote cannot be converted");
      this.store.run(
        "UPDATE stock_reservations SET status='fulfilled' WHERE quote_id=? AND status='active'",
        data.quote_id,
      );
      const deposits = detail.payments.reduce(
          (n, p) => n + Number(p.amount),
          0,
        ),
        extra = data.payments.reduce((n, p) => n + p.amount, 0);
      if (deposits + extra > Number(q.total))
        throw new Error("Payment exceeds quote total");
      const saleId = this.finance.checkout({
        request_id: randomUUID(),
        customer_id: q.customer_id,
        prescription_id: data.prescription_id,
        items: detail.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        discount: q.discount,
        tax: q.tax,
        payments: data.payments,
        notes: `Converted from ${q.quote_number}`,
      });
      for (const p of detail.payments)
        this.store.insert("payments", {
          id: randomUUID(),
          sale_id: saleId,
          amount: p.amount,
          method: p.method,
          notes: `Transferred from ${q.quote_number}`,
          user_id: user.id,
          reversal_of: null,
          created_at: new Date().toISOString(),
        });
      this.store.run(
        "UPDATE quotes SET status='converted',converted_sale_id=? WHERE id=?",
        saleId,
        data.quote_id,
      );
      this.store.audit(user.id, "convert", "quotes", data.quote_id, q, {
        sale_id: saleId,
      });
      return saleId;
    });
  }
  cancelQuote(input: unknown) {
    const user = this.auth.require("sales.create"),
      quoteId = id.parse(input);
    this.store.tx(() => {
      const quote = this.store.get(
        "SELECT * FROM quotes WHERE id=? AND status IN ('draft','accepted')",
        quoteId,
      );
      if (!quote) throw new Error("Quote cannot be cancelled");
      const payments = this.store.all(
        "SELECT * FROM quote_payments WHERE quote_id=?",
        quoteId,
      );
      for (const payment of payments) {
        if (payment.method === "cash")
          cashEntry(
            this.store,
            -Number(payment.amount),
            "quote_refund",
            quoteId,
            `Cancelled ${quote.quote_number}`,
            user.id,
          );
        this.store.insert("quote_refunds", {
          id: randomUUID(),
          quote_id: quoteId,
          quote_payment_id: payment.id,
          amount: payment.amount,
          method: payment.method,
          user_id: user.id,
          created_at: new Date().toISOString(),
        });
      }
      this.store.run(
        "UPDATE quotes SET status='cancelled' WHERE id=?",
        quoteId,
      );
      this.store.run(
        "UPDATE stock_reservations SET status='released' WHERE quote_id=? AND status='active'",
        quoteId,
      );
      this.store.audit(user.id, "cancel", "quotes", quoteId, quote);
    });
  }
  startStocktake(input: unknown) {
    const user = this.auth.require("inventory.adjust"),
      notes = text.parse(input ?? "");
    return this.store.tx(() => {
      if (this.store.get("SELECT id FROM stocktakes WHERE status='counting'"))
        throw new Error("A stocktake is already in progress");
      const entityId = randomUUID(),
        now = new Date().toISOString(),
        branchId = activeBranchId(this.store);
      this.store.insert("stocktakes", {
        id: entityId,
        status: "counting",
        notes,
        started_by: user.id,
        started_at: now,
        posted_by: null,
        posted_at: null,
        branch_id: branchId,
      });
      for (const p of this.store.all(
        "SELECT p.id,COALESCE(s.quantity,0) stock_quantity FROM products p LEFT JOIN branch_stock s ON s.product_id=p.id AND s.branch_id=? WHERE p.archived_at IS NULL",
        branchId,
      ))
        this.store.insert("stocktake_items", {
          stocktake_id: entityId,
          product_id: p.id,
          expected_quantity: p.stock_quantity,
          counted_quantity: null,
        });
      this.store.audit(user.id, "start", "stocktakes", entityId);
      return entityId;
    });
  }
  countStock(input: unknown) {
    const user = this.auth.require("inventory.adjust");
    const data = z
      .object({
        stocktake_id: id,
        product_id: id,
        counted_quantity: z.number().int().min(0),
      })
      .parse(input);
    const result = this.store.run(
      "UPDATE stocktake_items SET counted_quantity=? WHERE stocktake_id=? AND product_id=? AND EXISTS(SELECT 1 FROM stocktakes WHERE id=? AND status='counting')",
      data.counted_quantity,
      data.stocktake_id,
      data.product_id,
      data.stocktake_id,
    );
    if (result.changes !== 1)
      throw new Error("Stocktake item not found or session closed");
    this.store.audit(
      user.id,
      "count",
      "stocktakes",
      data.stocktake_id,
      null,
      data,
    );
  }
  stocktakeDetail(input: unknown) {
    this.auth.require("inventory.view");
    const stocktakeId = id.parse(input),
      session = this.store.get(
        "SELECT * FROM stocktakes WHERE id=?",
        stocktakeId,
      );
    if (!session) throw new Error("Stocktake not found");
    return {
      session,
      items: this.store.all(
        "SELECT i.*,p.name,p.sku FROM stocktake_items i JOIN products p ON p.id=i.product_id WHERE i.stocktake_id=? ORDER BY p.name",
        stocktakeId,
      ),
    };
  }
  postStocktake(input: unknown) {
    const user = this.auth.require("inventory.adjust"),
      stocktakeId = id.parse(input);
    this.store.tx(() => {
      const s = this.store.get(
        "SELECT * FROM stocktakes WHERE id=? AND status='counting'",
        stocktakeId,
      );
      if (!s) throw new Error("Stocktake is not open");
      const items = this.store.all(
        "SELECT * FROM stocktake_items WHERE stocktake_id=?",
        stocktakeId,
      );
      if (items.some((i) => i.counted_quantity === null))
        throw new Error("Count every product before posting");
      for (const i of items) {
        const current = Number(
            this.store.get(
              "SELECT quantity stock_quantity FROM branch_stock WHERE branch_id=? AND product_id=?",
              s.branch_id,
              i.product_id,
            )?.stock_quantity,
          ),
          delta = Number(i.counted_quantity) - current;
        if (delta)
          moveStock(
            this.store,
            String(i.product_id),
            delta,
            "stocktake",
            stocktakeId,
            "Posted physical count",
            user.id,
            String(s.branch_id),
          );
      }
      this.store.run(
        "UPDATE stocktakes SET status='posted',posted_by=?,posted_at=? WHERE id=?",
        user.id,
        new Date().toISOString(),
        stocktakeId,
      );
      this.store.audit(user.id, "post", "stocktakes", stocktakeId, s);
    });
  }
  supplierReturn(input: unknown) {
    const user = this.auth.require("purchases.create");
    const data = z
      .object({
        purchase_id: id,
        reason: text.min(1),
        items: z
          .array(
            z.object({
              purchase_item_id: id,
              quantity: z.number().int().min(1),
            }),
          )
          .min(1),
      })
      .parse(input);
    return this.store.tx(() => {
      const purchase = this.store.get(
        "SELECT * FROM purchase_orders WHERE id=? AND status='received'",
        data.purchase_id,
      );
      if (!purchase) throw new Error("Only received purchases can be returned");
      let total = 0;
      const rows = data.items.map((item) => {
        const row = this.store.get(
          "SELECT * FROM purchase_items WHERE id=? AND purchase_id=?",
          item.purchase_item_id,
          data.purchase_id,
        );
        if (!row) throw new Error("Purchase item not found");
        const returned = Number(
          this.store.get(
            "SELECT COALESCE(sum(sri.quantity),0) n FROM supplier_return_items sri JOIN supplier_returns sr ON sr.id=sri.supplier_return_id WHERE sri.purchase_item_id=? AND sr.status='posted'",
            item.purchase_item_id,
          )?.n,
        );
        if (returned + item.quantity > Number(row.quantity))
          throw new Error("Supplier return exceeds purchased quantity");
        total += item.quantity * Number(row.unit_cost);
        return { row, item };
      });
      const entityId = randomUUID(),
        now = new Date().toISOString();
      this.store.insert("supplier_returns", {
        id: entityId,
        purchase_id: data.purchase_id,
        supplier_id: purchase.supplier_id,
        status: "posted",
        total,
        reason: data.reason,
        created_by: user.id,
        created_at: now,
        branch_id: purchase.branch_id,
      });
      for (const { row, item } of rows) {
        moveStock(
          this.store,
          String(row.product_id),
          -item.quantity,
          "supplier_return",
          entityId,
          data.reason,
          user.id,
          String(purchase.branch_id),
        );
        this.store.insert("supplier_return_items", {
          id: randomUUID(),
          supplier_return_id: entityId,
          purchase_item_id: row.id,
          product_id: row.product_id,
          quantity: item.quantity,
          unit_cost: row.unit_cost,
        });
      }
      this.store.audit(
        user.id,
        "post",
        "supplier_returns",
        entityId,
        null,
        data,
      );
      return entityId;
    });
  }
  branches() {
    this.auth.require("inventory.view");
    return this.store.all("SELECT * FROM branches ORDER BY name");
  }
  activeBranch() {
    this.auth.require();
    const branchId = activeBranchId(this.store);
    return this.store.get("SELECT * FROM branches WHERE id=?", branchId);
  }
  selectBranch(input: unknown) {
    const user = this.auth.require("inventory.view"),
      branchId = id.parse(input),
      branch = this.store.get(
        "SELECT * FROM branches WHERE id=? AND is_active=1",
        branchId,
      );
    if (!branch) throw new Error("Branch not found");
    const before = this.activeBranch();
    this.store.tx(() => {
      this.store.run(
        "INSERT INTO app_settings(key,value) VALUES ('active_branch_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        JSON.stringify(branchId),
      );
      this.store.audit(
        user.id,
        "select",
        "branches",
        branchId,
        before ?? null,
        branch,
      );
    });
    return branch;
  }
  createBranch(input: unknown) {
    const user = this.auth.require("settings.manage");
    const data = z
        .object({
          code: z
            .string()
            .trim()
            .min(1)
            .max(20)
            .regex(/^[A-Z0-9_-]+$/),
          name: text.min(1),
          address: text.default(""),
          phone: text.default(""),
        })
        .parse(input),
      entityId = randomUUID();
    this.store.tx(() => {
      this.store.insert("branches", {
        id: entityId,
        ...data,
        is_active: 1,
        created_at: new Date().toISOString(),
      });
      for (const p of this.store.all("SELECT id FROM products"))
        this.store.insert("branch_stock", {
          branch_id: entityId,
          product_id: p.id,
          quantity: 0,
        });
      this.store.audit(user.id, "create", "branches", entityId, null, data);
    });
    return entityId;
  }
  transfer(input: unknown) {
    const user = this.auth.require("inventory.adjust");
    const data = z
      .object({
        from_branch_id: id,
        to_branch_id: id,
        notes: text.default(""),
        items: z
          .array(
            z.object({ product_id: id, quantity: z.number().int().min(1) }),
          )
          .min(1),
      })
      .parse(input);
    if (data.from_branch_id === data.to_branch_id)
      throw new Error("Choose different branches");
    return this.store.tx(() => {
      const entityId = randomUUID(),
        now = new Date().toISOString();
      for (const b of [data.from_branch_id, data.to_branch_id])
        if (
          !this.store.get(
            "SELECT id FROM branches WHERE id=? AND is_active=1",
            b,
          )
        )
          throw new Error("Branch not found");
      for (const i of data.items) {
        const before = Number(
          this.store.get(
            "SELECT quantity FROM branch_stock WHERE branch_id=? AND product_id=?",
            data.from_branch_id,
            i.product_id,
          )?.quantity ?? 0,
        );
        if (before < i.quantity) throw new Error("Insufficient branch stock");
        const reserved = Number(
          this.store.get(
            "SELECT COALESCE(sum(quantity),0) n FROM stock_reservations WHERE branch_id=? AND product_id=? AND status='active'",
            data.from_branch_id,
            i.product_id,
          )?.n,
        );
        if (before - reserved < i.quantity)
          throw new Error("Stock is reserved for an active quote");
        this.store.run(
          "UPDATE branch_stock SET quantity=quantity-? WHERE branch_id=? AND product_id=?",
          i.quantity,
          data.from_branch_id,
          i.product_id,
        );
        this.store.run(
          "INSERT INTO branch_stock VALUES (?,?,?) ON CONFLICT(branch_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity",
          data.to_branch_id,
          i.product_id,
          i.quantity,
        );
      }
      this.store.insert("inventory_transfers", {
        id: entityId,
        from_branch_id: data.from_branch_id,
        to_branch_id: data.to_branch_id,
        status: "posted",
        notes: data.notes,
        created_by: user.id,
        created_at: now,
      });
      for (const i of data.items)
        this.store.insert("inventory_transfer_items", {
          id: randomUUID(),
          transfer_id: entityId,
          ...i,
        });
      this.store.audit(
        user.id,
        "post",
        "inventory_transfers",
        entityId,
        null,
        data,
      );
      return entityId;
    });
  }
  branchStock(input: unknown) {
    this.auth.require("inventory.view");
    const branchId = id.parse(input);
    return this.store.all(
      "SELECT p.id,p.name,p.sku,COALESCE(s.quantity,0) quantity FROM products p LEFT JOIN branch_stock s ON s.product_id=p.id AND s.branch_id=? WHERE p.archived_at IS NULL ORDER BY p.name",
      branchId,
    );
  }
}
