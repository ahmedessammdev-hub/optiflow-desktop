import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { Store } from "../database/database";
import { Auth } from "./auth";
import { minor, allocate } from "../shared/money";
import { prescriptionSchema, productTypes, type Row } from "../shared/schemas";
import { moveStock } from "./stock";
const legacyId = z.union([z.string(), z.number().int()]).transform(String);
const record = z.record(z.string(), z.unknown());
const schema = z.object({
  customers: z.array(record).default([]),
  products: z.array(record).default([]),
  categories: z.array(record).default([]),
  invoices: z.array(record).default([]),
  invoice_items: z.array(record).default([]),
  payments: z.array(record).default([]),
  users: z.array(record).default([]),
});
export type ImportReport = {
  imported: number;
  skipped: number;
  failed: number;
  duplicate: number;
  warnings: string[];
  fingerprint: string;
};
function amount(value: unknown) {
  return minor(String(value ?? "0"));
}
function timestamp(value: unknown) {
  const text = String(value ?? "");
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) ||
    Number.isNaN(Date.parse(text))
  )
    throw new Error(
      "Legacy timestamps must be exported as ISO timestamps with timezone",
    );
  return new Date(text).toISOString();
}
function type(value: unknown) {
  const aliases: Record<string, string> = {
    others: "other",
    contactLens: "contact_lenses",
  };
  return z.enum(productTypes).parse(aliases[String(value)] ?? value);
}
export class LegacyImporter {
  constructor(
    private store: Store,
    private auth: Auth,
  ) {}
  import(raw: string, backupProof: string): ImportReport {
    const user = this.auth.require("backup.manage");
    const proof = this.store.get(
      "SELECT checksum FROM backup_history WHERE file_name=?",
      basename(backupProof),
    );
    if (
      !proof ||
      !existsSync(backupProof) ||
      createHash("sha256").update(readFileSync(backupProof)).digest("hex") !==
        proof.checksum
    )
      throw new Error("A verified target backup is required before import");
    if (raw.length > 100_000_000) throw new Error("Legacy export too large");
    const data = schema.parse(JSON.parse(raw));
    const fingerprint = createHash("sha256").update(raw).digest("hex");
    if (
      this.store.get(
        "SELECT fingerprint FROM import_history WHERE fingerprint=?",
        fingerprint,
      )
    )
      return {
        imported: 0,
        skipped: 0,
        failed: 0,
        duplicate: 1,
        warnings: ["This exact export was already imported"],
        fingerprint,
      };
    const report: ImportReport = {
      imported: 0,
      skipped: data.users.length,
      failed: 0,
      duplicate: 0,
      warnings: [],
      fingerprint,
    };
    if (data.users.length)
      report.warnings.push(
        "Legacy users were preserved in the source archive but not activated. Create accounts with new passwords.",
      );
    const customerMap = new Map<string, string>(),
      productMap = new Map<string, string>(),
      categoryMap = new Map<string, string>(),
      saleMap = new Map<string, string>();
    // Validate and commit as one transaction: no partial financial migration.
    return this.store.tx(() => {
      const saveSource = (kind: string, row: Record<string, unknown>) => {
        const key = `${kind}:${legacyId.parse(row.id)}`;
        if (
          this.store.get(
            "SELECT source_key FROM legacy_source_records WHERE source_key=?",
            key,
          )
        )
          throw new Error(`Legacy ID already imported: ${key}`);
        this.store.insert("legacy_source_records", {
          source_key: key,
          raw_json: JSON.stringify(row),
        });
      };
      for (const c of data.categories) {
        saveSource("categories", c);
        const key = legacyId.parse(c.id),
          newId = randomUUID();
        this.store.insert("categories", {
          id: newId,
          name: String(c.name),
          type: type(c.type),
          reorder_level: Number(c.alert_quantity ?? 5),
          created_at: timestamp(c.created_at),
        });
        categoryMap.set(key, newId);
        report.imported++;
      }
      for (const c of data.customers) {
        saveSource("customers", c);
        const key = legacyId.parse(c.id),
          newId = randomUUID();
        const name = z.string().min(1).parse(c.name);
        const phone = String(c.phone ?? "").replace(/[\s()-]/g, "");
        if (
          phone &&
          this.store.get("SELECT id FROM customers WHERE phone=?", phone)
        ) {
          report.duplicate++;
          report.warnings.push(
            `Customer ${key} shares an existing phone; preserved separately.`,
          );
        }
        this.store.insert("customers", {
          id: newId,
          customer_code: `LEGACY-${key}`,
          name,
          phone,
          address: String(c.address ?? ""),
          created_at: timestamp(c.created_at),
          updated_at: timestamp(c.updated_at ?? c.created_at),
          legacy_id: key,
        });
        customerMap.set(key, newId);
        report.imported++;
        if (c.medical_info) {
          const medical = record.parse(
            typeof c.medical_info === "string"
              ? JSON.parse(c.medical_info)
              : c.medical_info,
          );
          const eye = (value: unknown) => {
            const row = record.parse(value ?? {});
            const number = (f: string) =>
              row[f] === undefined || row[f] === null || row[f] === ""
                ? null
                : Number(row[f]);
            return {
              sph: number("sph"),
              cyl: number("cyl"),
              axis: number("axis"),
              add: number("add"),
              pd: number("pd"),
            };
          };
          const rx = prescriptionSchema.parse({
            customer_id: newId,
            exam_date: null,
            od: eye(medical.od),
            os: eye(medical.os),
            ipd:
              medical.ipd === "" ||
              medical.ipd === null ||
              medical.ipd === undefined
                ? null
                : Number(medical.ipd),
            notes:
              "Imported current medical_info; examination date unknown. Not evidence of historical invoice prescription.",
          });
          const rxId = randomUUID();
          this.store.insert("prescriptions", {
            id: rxId,
            customer_id: newId,
            exam_date: null,
            data: JSON.stringify(rx),
            created_by: user.id,
            created_at: new Date().toISOString(),
            legacy_id: key,
          });
          report.imported++;
          report.warnings.push(
            `Customer ${key}: prescription exam date unknown; PD preserved.`,
          );
        }
      }
      for (const p of data.products) {
        saveSource("products", p);
        const key = legacyId.parse(p.id),
          newId = randomUUID();
        const category =
          p.category_id === null || p.category_id === undefined
            ? null
            : categoryMap.get(String(p.category_id));
        if (p.category_id && !category)
          throw new Error(`Missing category for product ${key}`);
        const quantity = z
          .number()
          .int()
          .min(0)
          .parse(Number(p.stock_quantity));
        this.store.insert("products", {
          id: newId,
          name:
            String(p.name ?? `${p.brand ?? ""} ${p.model_code ?? ""}`).trim() ||
            `Legacy product ${key}`,
          sku: `LEGACY-${key}`,
          barcode: p.barcode ? String(p.barcode) : null,
          type: type(p.type),
          category_id: category ?? null,
          brand: String(p.brand ?? ""),
          model_code: String(p.model_code ?? ""),
          material: String(p.material ?? ""),
          unit_cost: amount(p.wholesale_price),
          unit_price: amount(p.price),
          reorder_level: Number(p.alert_quantity ?? 5),
          notes: String(p.customer_notes ?? ""),
          created_at: timestamp(p.created_at),
          updated_at: timestamp(p.updated_at ?? p.created_at),
          legacy_id: key,
        });
        if (quantity)
          moveStock(
            this.store,
            newId,
            quantity,
            "opening_stock",
            fingerprint,
            "Imported current stock; historical sales must not deduct again",
            user.id,
          );
        productMap.set(key, newId);
        report.imported++;
        if (p.image_path)
          report.warnings.push(
            `Product ${key}: image path preserved in raw source; copy the actual image through managed attachments.`,
          );
      }
      for (const s of data.invoices) {
        saveSource("invoices", s);
        const key = legacyId.parse(s.id),
          newId = randomUUID();
        const customer = s.customer_id
          ? customerMap.get(String(s.customer_id))
          : null;
        if (s.customer_id && !customer)
          throw new Error(`Missing customer for invoice ${key}`);
        const lines = data.invoice_items.filter(
          (i) => String(i.invoice_id) === key,
        );
        if (!lines.length) throw new Error(`Invoice ${key} has no items`);
        const subtotal = amount(s.subtotal),
          discount = amount(s.discount),
          tax = amount(s.tax),
          total = amount(s.total);
        if (total !== subtotal - discount + tax || discount > subtotal)
          throw new Error(`Invoice ${key} totals do not reconcile`);
        const weights = lines.map((i) => amount(i.price) * Number(i.quantity));
        if (weights.reduce((a, b) => a + b, 0) !== subtotal)
          throw new Error(`Invoice ${key} item totals do not reconcile`);
        const paid = data.payments
          .filter((p) => String(p.invoice_id) === key)
          .reduce((sum, p) => sum + amount(p.amount), 0);
        if (paid !== amount(s.amount_paid) || paid > total)
          throw new Error(
            `Invoice ${key} payment ledger does not reconcile; correct the export before import`,
          );
        const customerRecord = customer
          ? this.store.get(
              "SELECT name,phone,address FROM customers WHERE id=?",
              customer,
            )
          : { name: "Legacy guest", phone: "", address: "" };
        this.store.insert("sales", {
          id: newId,
          request_id: randomUUID(),
          invoice_number: `LEGACY-${key}`,
          customer_id: customer ?? null,
          prescription_id: null,
          customer_snapshot: JSON.stringify(customerRecord),
          prescription_snapshot: null,
          seller_id: user.id,
          subtotal,
          discount,
          tax,
          total,
          notes: `Imported invoice. Legacy seller: ${String(s.user_id ?? "unknown")}. Prescription and original product descriptions/costs not available.`,
          created_at: timestamp(s.created_at),
          legacy_id: key,
          provenance: "legacy_current_description_unknown_cost",
        });
        saleMap.set(key, newId);
        const discounts = allocate(discount, weights),
          taxes = allocate(tax, weights);
        lines.forEach((line, index) => {
          saveSource("invoice_items", line);
          const productId = productMap.get(String(line.product_id));
          if (!productId) throw new Error(`Missing product for invoice ${key}`);
          const p = this.store.get(
            "SELECT * FROM products WHERE id=?",
            productId,
          )!;
          this.store.insert("sale_items", {
            id: randomUUID(),
            sale_id: newId,
            product_id: productId,
            product_name: p.name,
            product_type: p.type,
            brand: p.brand,
            model_code: p.model_code,
            barcode: p.barcode,
            category_name: "",
            unit_price: amount(line.price),
            unit_cost: 0,
            historical_cost_known: 0,
            quantity: z.number().int().min(1).parse(Number(line.quantity)),
            subtotal: weights[index],
            net_total: weights[index] - discounts[index] + taxes[index],
            discount_amount: discounts[index],
            tax_amount: taxes[index],
            notes: String(line.lens_notes ?? ""),
          });
          report.imported++;
        });
        report.imported++;
        report.warnings.push(
          `Invoice ${key}: historical cost and prescription unknown. Profit must remain unavailable.`,
        );
      }
      for (const p of data.payments) {
        saveSource("payments", p);
        if (!p.invoice_id) {
          report.skipped++;
          report.warnings.push(
            `Manual payment ${String(p.id)} preserved as source only: no reliable historical cash session.`,
          );
          continue;
        }
        const saleId = saleMap.get(String(p.invoice_id));
        if (!saleId) throw new Error("Payment references missing invoice");
        this.store.insert("payments", {
          id: randomUUID(),
          sale_id: saleId,
          amount: amount(p.amount),
          method: String(p.payment_method ?? "other"),
          notes: String(
            p.notes ?? "Imported payment; not part of current cash drawer",
          ),
          user_id: user.id,
          created_at: timestamp(p.created_at),
        });
        report.imported++;
      }
      for (const userRecord of data.users) {
        const safe: Row = {
          id: String(userRecord.id),
          name: String(userRecord.name ?? ""),
          email: String(userRecord.email ?? ""),
          role: String(userRecord.role ?? ""),
        };
        saveSource("users", safe);
      }
      this.store.insert("import_history", {
        fingerprint,
        report: JSON.stringify(report),
        created_at: new Date().toISOString(),
      });
      this.store.audit(user.id, "import", "legacy", fingerprint, null, report);
      return report;
    });
  }
}
