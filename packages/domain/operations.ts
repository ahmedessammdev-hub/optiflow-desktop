import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "../database/database";
import { Auth } from "./auth";
import { id, money, methods, text, type Row } from "../shared/schemas";
import { checked } from "../shared/money";
import { cashEntry } from "./finance";
import { activeBranchId, moveStock } from "./stock";
export class Operations {
  constructor(
    private store: Store,
    private auth: Auth,
  ) {}
  adjust(input: unknown) {
    const user = this.auth.require("inventory.adjust");
    const data = z
      .object({
        product_id: id,
        quantity: z
          .number()
          .int()
          .min(-100000)
          .max(100000)
          .refine((n) => n !== 0),
        reason: text.min(1),
        type: z.enum(["opening_stock", "manual_adjustment", "damage", "loss"]),
      })
      .parse(input);
    if (["damage", "loss"].includes(data.type) && data.quantity > 0)
      throw new Error("Damage or loss must reduce stock");
    this.store.tx(() => {
      if (
        !this.store.get(
          "SELECT id FROM products WHERE id=? AND archived_at IS NULL",
          data.product_id,
        )
      )
        throw new Error("Product not found");
      moveStock(
        this.store,
        data.product_id,
        data.quantity,
        data.type,
        randomUUID(),
        data.reason,
        user.id,
      );
      this.store.audit(
        user.id,
        "adjust",
        "products",
        data.product_id,
        null,
        data,
      );
    });
  }
  openCash(input: unknown) {
    const user = this.auth.require("cash.manage");
    const amount = money.parse(input);
    const sessionId = randomUUID();
    this.store.tx(() => {
      this.store.insert("cash_sessions", {
        id: sessionId,
        opened_by: user.id,
        opening_balance: amount,
        opened_at: new Date().toISOString(),
        branch_id: activeBranchId(this.store),
      });
      cashEntry(
        this.store,
        amount,
        "opening_balance",
        sessionId,
        "Opening balance",
        user.id,
      );
      this.store.audit(user.id, "open", "cash_sessions", sessionId, null, {
        amount,
      });
    });
    return sessionId;
  }
  cash() {
    this.auth.require("cash.view");
    const session = this.store.get(
      "SELECT * FROM cash_sessions WHERE closed_at IS NULL AND branch_id=?",
      activeBranchId(this.store),
    );
    return {
      session: session ?? null,
      expected: session
        ? Number(
            this.store.get(
              "SELECT COALESCE(sum(amount),0) n FROM cash_transactions WHERE session_id=?",
              String(session.id),
            )?.n,
          )
        : 0,
    };
  }
  closeCash(input: unknown) {
    const user = this.auth.require("cash.manage");
    const actual = money.parse(input);
    this.store.tx(() => {
      const current = this.cash();
      if (!current.session) throw new Error("No open cash drawer");
      this.store.run(
        "UPDATE cash_sessions SET closed_at=?,closed_by=?,expected_balance=?,actual_balance=?,difference=? WHERE id=?",
        new Date().toISOString(),
        user.id,
        current.expected,
        actual,
        actual - current.expected,
        String(current.session.id),
      );
      this.store.audit(
        user.id,
        "close",
        "cash_sessions",
        String(current.session.id),
        current,
        { actual, difference: actual - current.expected },
      );
    });
  }
  cashAdjust(input: unknown) {
    const user = this.auth.require("cash.manage");
    const data = z
      .object({
        amount: z
          .number()
          .int()
          .min(-1_000_000_000)
          .max(1_000_000_000)
          .refine((n) => n !== 0),
        reason: text.min(1),
      })
      .parse(input);
    this.store.tx(() => {
      cashEntry(
        this.store,
        data.amount,
        data.amount > 0 ? "cash_in" : "cash_out",
        randomUUID(),
        data.reason,
        user.id,
      );
      this.store.audit(
        user.id,
        "adjust",
        "cash_sessions",
        "drawer",
        null,
        data,
      );
    });
  }
  expense(input: unknown) {
    const user = this.auth.require("expenses.create");
    const data = z
      .object({
        category: text.min(1),
        amount: money.refine((n) => n > 0),
        method: z.enum(methods),
        description: text.min(1),
      })
      .parse(input);
    const expenseId = randomUUID();
    this.store.tx(() => {
      this.store.insert("expenses", {
        id: expenseId,
        ...data,
        user_id: user.id,
        created_at: new Date().toISOString(),
        branch_id: activeBranchId(this.store),
      });
      if (data.method === "cash")
        cashEntry(
          this.store,
          -data.amount,
          "expense",
          expenseId,
          data.description,
          user.id,
        );
      this.store.audit(user.id, "create", "expenses", expenseId, null, data);
    });
    return expenseId;
  }
  purchase(input: unknown) {
    const user = this.auth.require("purchases.create");
    const data = z
      .object({
        supplier_id: id,
        invoice_number: text.min(1),
        paid: money,
        method: z.enum(methods),
        notes: text.default(""),
        items: z
          .array(
            z.object({
              product_id: id,
              quantity: z.number().int().min(1).max(100000),
              unit_cost: money,
            }),
          )
          .min(1)
          .max(300),
      })
      .parse(input);
    const purchaseId = randomUUID();
    return this.store.tx(() => {
      if (
        !this.store.get(
          "SELECT id FROM suppliers WHERE id=? AND archived_at IS NULL",
          data.supplier_id,
        )
      )
        throw new Error("Supplier not found");
      const total = checked(
        data.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0),
      );
      if (data.paid > total) throw new Error("Supplier payment exceeds total");
      this.store.insert("purchase_orders", {
        id: purchaseId,
        supplier_id: data.supplier_id,
        supplier_snapshot: JSON.stringify(
          this.store.get(
            "SELECT name,phone,address FROM suppliers WHERE id=?",
            data.supplier_id,
          ),
        ),
        invoice_number: data.invoice_number,
        status: "draft",
        total,
        paid: data.paid,
        method: data.method,
        notes: data.notes,
        created_by: user.id,
        created_at: new Date().toISOString(),
        branch_id: activeBranchId(this.store),
      });
      for (const item of data.items) {
        const product = this.store.get(
          "SELECT name,sku FROM products WHERE id=? AND archived_at IS NULL",
          item.product_id,
        );
        if (!product) throw new Error("Product not found");
        this.store.insert("purchase_items", {
          id: randomUUID(),
          purchase_id: purchaseId,
          product_snapshot: JSON.stringify(product),
          ...item,
        });
      }
      if (data.paid)
        this.store.insert("supplier_payments", {
          id: randomUUID(),
          purchase_id: purchaseId,
          amount: data.paid,
          method: data.method,
          notes: data.notes,
          user_id: user.id,
          created_at: new Date().toISOString(),
        });
      if (data.method === "cash" && data.paid)
        cashEntry(
          this.store,
          -data.paid,
          "supplier_payment",
          purchaseId,
          data.notes,
          user.id,
        );
      this.store.audit(user.id, "create", "purchase_orders", purchaseId, null, {
        total,
      });
      return purchaseId;
    });
  }
  receive(input: unknown) {
    const user = this.auth.require("purchases.create");
    const purchaseId = id.parse(input);
    this.store.tx(() => {
      const purchase = this.store.get(
        "SELECT * FROM purchase_orders WHERE id=? AND status='draft'",
        purchaseId,
      );
      if (!purchase) throw new Error("Purchase is not a draft");
      for (const item of this.store.all(
        "SELECT * FROM purchase_items WHERE purchase_id=?",
        purchaseId,
      )) {
        moveStock(
          this.store,
          String(item.product_id),
          Number(item.quantity),
          "purchase",
          purchaseId,
          "Purchase receipt",
          user.id,
          String(purchase.branch_id ?? activeBranchId(this.store)),
        );
        this.store.run(
          "UPDATE products SET unit_cost=? WHERE id=?",
          item.unit_cost,
          item.product_id,
        );
      }
      this.store.run(
        "UPDATE purchase_orders SET status='received',received_at=? WHERE id=?",
        new Date().toISOString(),
        purchaseId,
      );
      this.store.audit(
        user.id,
        "receive",
        "purchase_orders",
        purchaseId,
        purchase,
      );
    });
  }
  paySupplier(input: unknown) {
    const user = this.auth.require("purchases.create");
    const data = z
      .object({
        purchase_id: id,
        amount: money.refine((n) => n > 0),
        method: z.enum(methods),
        notes: text.default(""),
      })
      .parse(input);
    this.store.tx(() => {
      const purchase = this.store.get(
        "SELECT * FROM purchase_orders WHERE id=?",
        data.purchase_id,
      );
      if (!purchase) throw new Error("Purchase not found");
      const paid = Number(
        this.store.get(
          "SELECT COALESCE(sum(amount),0) n FROM supplier_payments WHERE purchase_id=?",
          data.purchase_id,
        )?.n,
      );
      const returned = Number(
        this.store.get(
          "SELECT COALESCE(sum(total),0) n FROM supplier_returns WHERE purchase_id=? AND status='posted'",
          data.purchase_id,
        )?.n,
      );
      if (data.amount > Number(purchase.total) - returned - paid)
        throw new Error("Supplier payment exceeds balance");
      const paymentId = randomUUID();
      this.store.insert("supplier_payments", {
        id: paymentId,
        ...data,
        user_id: user.id,
        created_at: new Date().toISOString(),
      });
      if (data.method === "cash")
        cashEntry(
          this.store,
          -data.amount,
          "supplier_payment",
          paymentId,
          data.notes,
          user.id,
        );
      this.store.run(
        "UPDATE purchase_orders SET paid=? WHERE id=?",
        paid + data.amount,
        data.purchase_id,
      );
      this.store.audit(
        user.id,
        "payment",
        "purchase_orders",
        data.purchase_id,
        null,
        data,
      );
    });
  }
  purchaseDetail(input: unknown) {
    this.auth.require("purchases.view");
    const purchaseId = id.parse(input);
    const purchase = this.store.get(
      "SELECT * FROM purchase_orders WHERE id=?",
      purchaseId,
    );
    if (!purchase) throw new Error("Purchase not found");
    const purchaseWithReturns: Row = {
      ...purchase,
      returned: Number(
        this.store.get(
          "SELECT COALESCE(sum(total),0) n FROM supplier_returns WHERE purchase_id=? AND status='posted'",
          purchaseId,
        )?.n,
      ),
    };
    return {
      purchase: purchaseWithReturns,
      items: this.store.all(
        "SELECT * FROM purchase_items WHERE purchase_id=?",
        purchaseId,
      ),
      payments: this.store.all(
        "SELECT * FROM supplier_payments WHERE purchase_id=? ORDER BY created_at",
        purchaseId,
      ),
      returns: this.store.all(
        "SELECT * FROM supplier_returns WHERE purchase_id=? ORDER BY created_at",
        purchaseId,
      ),
    };
  }
}
