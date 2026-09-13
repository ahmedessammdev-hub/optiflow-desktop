import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "../database/database";
import { Auth } from "./auth";
import {
  customerSchema,
  productSchema,
  prescriptionSchema,
  id,
  text,
  querySchema,
  type Row,
  type Page,
  type Prescription,
} from "../shared/schemas";
export class Catalog {
  constructor(
    private store: Store,
    private auth: Auth,
  ) {}
  save(
    kind: "customers" | "products" | "suppliers" | "categories",
    input: unknown,
  ) {
    const envelope = z
      .object({
        id: id.optional(),
        data: z.unknown(),
        allow_duplicate: z.boolean().default(false),
      })
      .parse(input);
    const permission =
      kind === "suppliers"
        ? "purchases.create"
        : kind === "categories"
          ? "products.update"
          : `${kind}.${envelope.id ? "update" : "create"}`;
    const user = this.auth.require(permission);
    const schema =
      kind === "customers"
        ? customerSchema
        : kind === "products"
          ? productSchema
          : kind === "categories"
            ? z.object({
                name: text.min(1),
                type: z.enum([
                  "frames",
                  "sunglasses",
                  "lenses",
                  "contact_lenses",
                  "accessories",
                  "other",
                ]),
                reorder_level: z.number().int().min(0).nullable(),
              })
            : z.object({
                name: text.min(1),
                phone: text.default(""),
                email: text.default(""),
                address: text.default(""),
                tax_number: text.default(""),
                contact_person: text.default(""),
                notes: text.default(""),
              });
    const values: Row = schema.parse(envelope.data);
    if (kind === "customers")
      values.phone = String(values.phone)
        .replace(/[\s()-]/g, "")
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    return this.store.tx(() => {
      if (
        kind === "customers" &&
        values.phone &&
        !envelope.allow_duplicate &&
        this.store.get(
          "SELECT id FROM customers WHERE phone=? AND id<>? AND archived_at IS NULL",
          values.phone,
          envelope.id ?? "",
        )
      )
        throw new Error(
          "Duplicate phone: review the existing customer before explicitly allowing a duplicate",
        );
      if (kind === "products") {
        for (const [field, table] of [
          ["category_id", "categories"],
          ["supplier_id", "suppliers"],
        ])
          if (
            values[field] &&
            !this.store.get(
              `SELECT id FROM ${table} WHERE id=? AND archived_at IS NULL`,
              values[field],
            )
          )
            throw new Error("Invalid category or supplier");
      }
      const entityId = envelope.id ?? randomUUID();
      const now = new Date().toISOString();
      const before = envelope.id
        ? this.store.get(
            `SELECT * FROM ${kind} WHERE id=? AND archived_at IS NULL`,
            entityId,
          )
        : null;
      if (envelope.id && !before)
        throw new Error("Record not found or archived");
      if (envelope.id) {
        if (kind !== "categories") values.updated_at = now;
        this.store.run(
          `UPDATE ${kind} SET ${Object.keys(values)
            .map((k) => `${k}=?`)
            .join(",")} WHERE id=?`,
          ...Object.values(values),
          entityId,
        );
      } else {
        const extra: Row = { id: entityId, created_at: now };
        if (kind !== "categories") extra.updated_at = now;
        if (kind === "customers")
          extra.customer_code = `C-${entityId.slice(0, 8).toUpperCase()}`;
        this.store.insert(kind, { ...values, ...extra });
      }
      this.store.audit(
        user.id,
        envelope.id ? "update" : "create",
        kind,
        entityId,
        before,
        values,
      );
      return entityId;
    });
  }
  archive(kind: "customers" | "products" | "suppliers", input: unknown) {
    const entityId = id.parse(input);
    const user = this.auth.require(
      kind === "suppliers" ? "purchases.create" : `${kind}.archive`,
    );
    this.store.tx(() => {
      const record = this.store.get(
        `SELECT * FROM ${kind} WHERE id=?`,
        entityId,
      );
      if (!record) throw new Error("Record not found");
      this.store.run(
        `UPDATE ${kind} SET archived_at=? WHERE id=?`,
        new Date().toISOString(),
        entityId,
      );
      this.store.audit(user.id, "archive", kind, entityId, record);
    });
  }
  list(
    kind: "customers" | "products" | "suppliers" | "categories",
    input: unknown,
  ): Page {
    this.auth.require(
      kind === "suppliers"
        ? "purchases.view"
        : kind === "categories"
          ? "products.view"
          : `${kind}.view`,
    );
    const q = querySchema.parse(input);
    const searchFields =
      kind === "customers"
        ? ["name", "phone", "customer_code"]
        : kind === "products"
          ? ["name", "sku", "barcode", "brand", "model_code", "type"]
          : ["name"];
    const terms = [
      `archived_at IS ${q.archived ? "NOT " : ""}NULL`,
      `(${searchFields.map((f) => `${f} LIKE ?`).join(" OR ")})`,
    ];
    const params: (string | number)[] = searchFields.map(() => `%${q.search}%`);
    if (q.type && (kind === "products" || kind === "categories")) {
      terms.push("type=?");
      params.push(q.type);
    }
    const where = terms.join(" AND ");
    const sort =
      q.sort === "name" ||
      q.sort === "created_at" ||
      (q.sort === "stock_quantity" && kind === "products")
        ? q.sort
        : "created_at";
    const rows = this.store.all(
      `SELECT * FROM ${kind} WHERE ${where} ORDER BY ${kind === "products" && q.search ? "CASE WHEN barcode=? OR sku=? THEN 0 ELSE 1 END," : ""}${sort} ${q.direction},id LIMIT ? OFFSET ?`,
      ...params,
      ...(kind === "products" && q.search ? [q.search, q.search] : []),
      q.page_size,
      (q.page - 1) * q.page_size,
    );
    if (
      kind === "products" &&
      !this.auth.require().permissions.includes("reports.profit")
    )
      rows.forEach((r) => {
        delete r.unit_cost;
      });
    return {
      rows,
      total: Number(
        this.store.get(
          `SELECT count(*) n FROM ${kind} WHERE ${where}`,
          ...params,
        )?.n,
      ),
      page: q.page,
      page_size: q.page_size,
    };
  }
  prescription(input: unknown) {
    const user = this.auth.require("prescriptions.create");
    const data = prescriptionSchema.parse(input);
    const entityId = randomUUID();
    return this.store.tx(() => {
      if (
        !this.store.get(
          "SELECT id FROM customers WHERE id=? AND archived_at IS NULL",
          data.customer_id,
        )
      )
        throw new Error("Customer not found");
      this.store.insert("prescriptions", {
        id: entityId,
        customer_id: data.customer_id,
        exam_date: data.exam_date,
        data: JSON.stringify(data),
        created_by: user.id,
        created_at: new Date().toISOString(),
      });
      this.store.audit(
        user.id,
        "create",
        "prescriptions",
        entityId,
        null,
        data,
      );
      return entityId;
    });
  }
  profile(input: unknown) {
    this.auth.require("customers.view");
    const entityId = id.parse(input);
    const customer = this.store.get(
      "SELECT * FROM customers WHERE id=?",
      entityId,
    );
    if (!customer) throw new Error("Customer not found");
    const canRead = this.auth
      .require()
      .permissions.includes("prescriptions.view");
    const prescriptions: Prescription[] = canRead
      ? this.store
          .all(
            "SELECT * FROM prescriptions WHERE customer_id=? ORDER BY exam_date DESC,created_at DESC",
            entityId,
          )
          .map(
            (r) =>
              ({
                ...JSON.parse(String(r.data)),
                id: r.id,
                created_by: r.created_by,
                created_at: r.created_at,
              }) as Prescription,
          )
      : [];
    return { customer, prescriptions };
  }
}
