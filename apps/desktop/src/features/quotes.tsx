import { useState } from "react";
import { api, client, useApp, useData, useDebounce } from "../lib";
import { DataTable, Modal, Money, PageHeader, RecordForm } from "../components";
import { minor } from "../../../../packages/shared/money";
import type { Row } from "../../../../packages/shared/schemas";
const ZERO = "00000000-0000-4000-8000-000000000000";
type Line = { product: Row; quantity: number; unit_price: string };
export function QuotesPage() {
  const { t, run } = useApp();
  const [search, setSearch] = useState(""),
    [customerSearch, setCustomerSearch] = useState(""),
    [productSearch, setProductSearch] = useState(""),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [customer, setCustomer] = useState(""),
    [lines, setLines] = useState<Line[]>([]);
  const list = useData("extensions.list", {
    kind: "quotes",
    query: { search: useDebounce(search), page_size: 100 },
  });
  const customers = useData("customers.list", {
    search: useDebounce(customerSearch),
    page_size: 30,
  });
  const products = useData("products.list", {
    search: useDebounce(productSearch),
    page_size: 30,
  });
  const detail = useData("quotes.get", selected ?? ZERO, Boolean(selected));
  function add(product: Row) {
    setLines((current) =>
      current.some((l) => l.product.id === product.id)
        ? current.map((l) =>
            l.product.id === product.id
              ? { ...l, quantity: l.quantity + 1 }
              : l,
          )
        : [
            ...current,
            {
              product,
              quantity: 1,
              unit_price: String(Number(product.unit_price) / 100),
            },
          ],
    );
  }
  return (
    <>
      <PageHeader title={t("Quotes & reservations", "عروض الأسعار والحجوزات")}>
        <button className="primary" onClick={() => setCreating(true)}>
          + {t("New quote", "عرض جديد")}
        </button>
      </PageHeader>
      <div className="toolbar">
        <input
          placeholder={t("Search quotes", "بحث العروض")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <DataTable
        rows={list.data?.rows ?? []}
        columns={[
          { key: "quote_number", label: t("Quote", "العرض") },
          { key: "customer_name", label: t("Customer", "العميل") },
          { key: "status", label: t("Status", "الحالة") },
          {
            key: "total",
            label: t("Total", "الإجمالي"),
            render: (r) => <Money value={r.total} />,
          },
          {
            key: "deposit",
            label: t("Deposit", "العربون"),
            render: (r) => <Money value={r.deposit} />,
          },
        ]}
        actions={(r) => (
          <button onClick={() => setSelected(String(r.id))}>
            {t("Open", "فتح")}
          </button>
        )}
      />
      {creating && (
        <Modal
          title={t("New quote", "عرض سعر جديد")}
          onClose={() => setCreating(false)}
        >
          <div className="toolbar">
            <input
              placeholder={t("Search customer", "بحث العميل")}
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="">{t("Choose customer", "اختر العميل")}</option>
              {customers.data?.rows.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar">
            <input
              placeholder={t("Search products", "بحث المنتجات")}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {products.data?.rows.map((p) => (
              <button key={String(p.id)} onClick={() => add(p)}>
                + {p.name}
              </button>
            ))}
          </div>
          <DataTable
            rows={lines.map((l, i) => ({
              id: String(i),
              name: l.product.name,
              quantity: l.quantity,
              unit_price: minor(l.unit_price),
            }))}
            columns={[
              { key: "name", label: t("Product", "المنتج") },
              { key: "quantity", label: t("Quantity", "الكمية") },
              {
                key: "unit_price",
                label: t("Price", "السعر"),
                render: (r) => <Money value={r.unit_price} />,
              },
            ]}
            actions={(r) => (
              <button
                onClick={() =>
                  setLines((v) => v.filter((_, i) => String(i) !== r.id))
                }
              >
                {t("Remove", "حذف")}
              </button>
            )}
          />
          <RecordForm
            fields={[
              {
                name: "expires_at",
                en: "Expires on",
                ar: "صالح حتى",
                type: "date",
              },
              { name: "discount", en: "Discount", ar: "الخصم" },
              { name: "tax", en: "Tax", ar: "الضريبة" },
              {
                name: "reserve_stock",
                en: "Reserve stock",
                ar: "حجز الكمية من المخزون",
                type: "checkbox",
              },
              { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
            ]}
            initial={{ discount: "0", tax: "0" }}
            onSubmit={async (v) => {
              if (!customer || !lines.length)
                throw new Error(
                  t(
                    "Choose a customer and at least one product",
                    "اختر عميلًا ومنتجًا واحدًا على الأقل",
                  ),
                );
              await api("quotes.create", {
                customer_id: customer,
                expires_at: v.expires_at || null,
                discount: minor(String(v.discount || "0")),
                tax: minor(String(v.tax || "0")),
                reserve_stock: Boolean(v.reserve_stock),
                notes: v.notes,
                items: lines.map((l) => ({
                  product_id: l.product.id,
                  quantity: l.quantity,
                  unit_price: minor(l.unit_price),
                })),
              });
              await client.invalidateQueries();
              setCreating(false);
              setLines([]);
              setCustomer("");
            }}
          />
        </Modal>
      )}
      {selected && detail.data && (
        <Modal
          title={String(detail.data.quote.quote_number)}
          onClose={() => setSelected(null)}
        >
          <DataTable
            rows={detail.data.items}
            columns={[
              {
                key: "product_snapshot",
                label: t("Product", "المنتج"),
                render: (r) => JSON.parse(String(r.product_snapshot)).name,
              },
              { key: "quantity", label: t("Quantity", "الكمية") },
              {
                key: "subtotal",
                label: t("Amount", "المبلغ"),
                render: (r) => <Money value={r.subtotal} />,
              },
            ]}
          />
          <p>
            {t("Total", "الإجمالي")}: <Money value={detail.data.quote.total} />{" "}
            · {t("Deposit", "العربون")}:{" "}
            <Money value={detail.data.quote.deposit} />
          </p>
          {["draft", "accepted"].includes(String(detail.data.quote.status)) && (
            <>
              <h3>{t("Record deposit", "تسجيل عربون")}</h3>
              <RecordForm
                fields={[
                  {
                    name: "amount",
                    en: "Amount",
                    ar: "المبلغ",
                    required: true,
                  },
                  {
                    name: "method",
                    en: "Method",
                    ar: "الطريقة",
                    type: "select",
                    options: [
                      "cash",
                      "card",
                      "bank_transfer",
                      "wallet",
                      "other",
                    ].map((v) => ({ value: v, label: v })),
                  },
                  { name: "notes", en: "Notes", ar: "ملاحظات" },
                ]}
                onSubmit={async (v) => {
                  await api("quotes.deposit", {
                    quote_id: selected,
                    amount: minor(String(v.amount)),
                    method: v.method,
                    notes: v.notes,
                  });
                  await client.invalidateQueries();
                }}
              />
              <h3>{t("Convert to sale", "تحويل إلى فاتورة")}</h3>
              <RecordForm
                fields={[
                  {
                    name: "amount",
                    en: "Additional payment",
                    ar: "دفعة إضافية",
                  },
                  {
                    name: "method",
                    en: "Method",
                    ar: "الطريقة",
                    type: "select",
                    options: [
                      "cash",
                      "card",
                      "bank_transfer",
                      "wallet",
                      "other",
                    ].map((v) => ({ value: v, label: v })),
                  },
                  {
                    name: "prescription_id",
                    en: "Prescription ID (optional)",
                    ar: "معرف الوصفة (اختياري)",
                  },
                ]}
                initial={{ amount: "0" }}
                submitLabel={t("Convert", "تحويل")}
                onSubmit={async (v) => {
                  const amount = minor(String(v.amount || "0"));
                  const sale = await api("quotes.convert", {
                    quote_id: selected,
                    prescription_id: v.prescription_id || null,
                    payments: amount ? [{ amount, method: v.method }] : [],
                  });
                  await client.invalidateQueries();
                  run(async () => sale, t("Quote converted", "تم تحويل العرض"));
                  setSelected(null);
                }}
              />
              <button
                className="danger"
                onClick={() =>
                  run(
                    async () => {
                      await api("quotes.cancel", selected);
                      await client.invalidateQueries();
                      setSelected(null);
                    },
                    t(
                      "Quote cancelled and deposit refunded",
                      "تم إلغاء العرض ورد العربون",
                    ),
                  )
                }
              >
                {t("Cancel quote & refund", "إلغاء العرض ورد العربون")}
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
