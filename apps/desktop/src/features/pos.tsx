import { translateValue } from "../../../../packages/shared/i18n";
import { useEffect, useRef, useState } from "react";
import { api, client, useApp, useData, useDebounce } from "../lib";
import { PageHeader, Money, Modal, RecordForm } from "../components";
import { PrescriptionView } from "../../../../packages/ui/PrescriptionView";
import {
  methods,
  productTypes,
  type Row,
} from "../../../../packages/shared/schemas";
import { minor, totals } from "../../../../packages/shared/money";
import { InvoiceDetail } from "./invoices";
type CartLine = { product: Row; quantity: number; unit_price: number };
export function POS() {
  const { t, settings, can, notify } = useApp();
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [type, setType] = useState("");
  const [customer, setCustomer] = useState<Row | null>(null);
  const [prescriptionId, setPrescriptionId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState<
    { amount: string; method: (typeof methods)[number] }[]
  >([{ amount: "", method: "cash" }]);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [quickCustomer, setQuickCustomer] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const products = useData("products.list", {
    search: useDebounce(search),
    type,
    page_size: 40,
  });
  const customers = useData(
    "customers.list",
    { search: useDebounce(customerSearch), page_size: 10 },
    customerSearch.length > 0 && !customer,
  );
  const profile = useData("customers.profile", customer?.id, Boolean(customer));
  const prescription = profile.data?.prescriptions.find(
    (p) => p.id === prescriptionId,
  );
  let amount = { subtotal: 0, discount: 0, tax: 0, total: 0 };
  let invalid = "";
  try {
    amount = totals(cart, minor(discount || "0"), minor(tax || "0"));
  } catch (error) {
    invalid = String(error);
  }
  function add(product: Row) {
    setCart((current) => {
      const line = current.find((l) => l.product.id === product.id);
      if ((line?.quantity ?? 0) >= Number(product.stock_quantity)) {
        notify(t("Insufficient stock", "المخزون غير كافٍ"));
        return current;
      }
      return line
        ? current.map((l) =>
            l.product.id === product.id
              ? { ...l, quantity: l.quantity + 1 }
              : l,
          )
        : [
            ...current,
            { product, quantity: 1, unit_price: Number(product.unit_price) },
          ];
    });
    searchRef.current?.focus();
  }
  async function checkout() {
    if (busy || !cart.length || invalid) return;
    setBusy(true);
    try {
      const saleId = await api("sales.create", {
        request_id: requestId.current,
        customer_id: customer?.id ?? null,
        prescription_id: prescriptionId || null,
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
        discount: amount.discount,
        tax: amount.tax,
        payments: payments
          .filter((p) => p.amount !== "" && p.amount !== "0")
          .map((p) => ({ amount: minor(p.amount), method: p.method })),
        notes,
      });
      setInvoice(saleId);
      setCart([]);
      setPayments([{ amount: "", method: "cash" }]);
      setCustomer(null);
      setCustomerSearch("");
      setPrescriptionId("");
      setDiscount("0");
      setTax("0");
      setNotes("");
      requestId.current = crypto.randomUUID();
      await client.invalidateQueries();
      notify(t("Sale completed", "اكتملت عملية البيع"));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const checkoutRef = useRef(checkout);
  checkoutRef.current = checkout;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "F4") {
        event.preventDefault();
        customerRef.current?.focus();
      }
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        void checkoutRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <PageHeader
        title={t("Point of sale", "نقطة البيع")}
        subtitle={t(
          "F2 product search · F4 customer search · Ctrl+Enter checkout",
          "F2 بحث المنتجات · F4 بحث العملاء · Ctrl+Enter إتمام البيع",
        )}
      />
      <div className="pos-layout">
        <section>
          <div className="toolbar">
            <input
              ref={searchRef}
              autoFocus
              placeholder={t(
                "Scan barcode or search products",
                "امسح الباركود أو ابحث عن منتج",
              )}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const result = await api("products.list", {
                    search,
                    page_size: 100,
                  });
                  const product = result.rows.find(
                    (p) => p.barcode === search || p.sku === search,
                  );
                  if (product) {
                    add(product);
                    setSearch("");
                  }
                }
              }}
            />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t("All products", "كل المنتجات")}</option>
              {productTypes.map((v) => (
                <option key={v} value={v}>
                  {translateValue(v, settings.language)}
                </option>
              ))}
            </select>
          </div>
          {products.error && <p className="error">{products.error.message}</p>}
          <div className="product-grid">
            {products.data?.rows.map((p) => (
              <button
                className="product-card"
                key={String(p.id)}
                disabled={Number(p.stock_quantity) < 1}
                onClick={() => add(p)}
              >
                <div className="product-symbol">
                  {p.type === "frames" || p.type === "sunglasses" ? "◎—◎" : "◉"}
                </div>
                <small>
                  {p.brand} ·{" "}
                  {translateValue(String(p.type), settings.language)}
                </small>
                <strong>{p.name}</strong>
                <span>{p.sku}</span>
                <div>
                  <Money value={p.unit_price} />
                  <small>
                    {p.stock_quantity} {t("in stock", "متاح")}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </section>
        <aside className="cart">
          <h2>{t("Current sale", "البيع الحالي")}</h2>
          <div className="customer-search">
            <input
              ref={customerRef}
              placeholder={t("Search customer", "ابحث عن عميل")}
              value={customer ? String(customer.name) : customerSearch}
              onChange={(e) => {
                setCustomer(null);
                setPrescriptionId("");
                setCustomerSearch(e.target.value);
              }}
            />
            {can("customers.create") && (
              <button onClick={() => setQuickCustomer(true)}>+</button>
            )}
          </div>
          {!customer && customerSearch && (
            <div className="search-results">
              {customers.data?.rows.map((c) => (
                <button
                  key={String(c.id)}
                  onClick={() => {
                    setCustomer(c);
                    setCustomerSearch("");
                  }}
                >
                  {c.name} · {c.phone}
                </button>
              ))}
            </div>
          )}
          {customer && (
            <select
              value={prescriptionId}
              onChange={(e) => setPrescriptionId(e.target.value)}
            >
              <option value="">
                {t("No prescription selected", "لم يتم اختيار وصفة")}
              </option>
              {profile.data?.prescriptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.exam_date ?? t("Unknown exam date", "تاريخ غير معروف")}
                </option>
              ))}
            </select>
          )}
          {prescription && (
            <PrescriptionView
              prescription={prescription}
              language={settings.language}
              mode="compact"
            />
          )}
          <div className="cart-lines">
            {!cart.length && (
              <p className="empty">
                {t("Choose a product to begin.", "اختر منتجًا للبدء.")}
              </p>
            )}
            {cart.map((line) => (
              <div className="cart-line" key={String(line.product.id)}>
                <div>
                  <strong>{line.product.name}</strong>
                  <small>{line.product.sku}</small>
                </div>
                <input
                  aria-label={t("Quantity", "الكمية")}
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) =>
                    setCart(
                      cart.map((l) =>
                        l.product.id === line.product.id
                          ? { ...l, quantity: Number(e.target.value) }
                          : l,
                      ),
                    )
                  }
                />
                {can("sales.override_price") ? (
                  <input
                    aria-label={t("Unit price", "سعر الوحدة")}
                    value={String(line.unit_price / 100)}
                    onChange={(e) => {
                      try {
                        const price = minor(e.target.value);
                        setCart(
                          cart.map((l) =>
                            l.product.id === line.product.id
                              ? { ...l, unit_price: price }
                              : l,
                          ),
                        );
                      } catch {
                        /* The last valid amount remains visible. */
                      }
                    }}
                  />
                ) : (
                  <Money value={line.unit_price} />
                )}
                <button
                  aria-label="Remove"
                  onClick={() =>
                    setCart(
                      cart.filter((l) => l.product.id !== line.product.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="form-grid">
            {can("sales.discount") && (
              <label>
                {t("Discount", "الخصم")}
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
            )}
            <label>
              {t("Tax amount", "مبلغ الضريبة")}
              <input value={tax} onChange={(e) => setTax(e.target.value)} />
            </label>
          </div>
          <div className="total-row">
            <span>{t("Total", "الإجمالي")}</span>
            <strong>
              <Money value={amount.total} />
            </strong>
          </div>
          {invalid && <p className="error">{invalid}</p>}
          <h3>{t("Payments", "الدفعات")}</h3>
          {payments.map((payment, i) => (
            <div className="payment-row" key={i}>
              <select
                value={payment.method}
                onChange={(e) =>
                  setPayments(
                    payments.map((p, j) =>
                      i === j
                        ? {
                            ...p,
                            method: e.target.value as (typeof methods)[number],
                          }
                        : p,
                    ),
                  )
                }
              >
                {methods.map((method) => (
                  <option key={method} value={method}>
                    {translateValue(method, settings.language)}
                  </option>
                ))}
              </select>
              <input
                placeholder={t("Amount", "المبلغ")}
                value={payment.amount}
                onChange={(e) =>
                  setPayments(
                    payments.map((p, j) =>
                      i === j ? { ...p, amount: e.target.value } : p,
                    ),
                  )
                }
              />
              <button
                onClick={() => setPayments(payments.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <div className="actions">
            <button
              onClick={() =>
                setPayments([...payments, { amount: "", method: "card" }])
              }
            >
              {t("Split payment", "دفعة إضافية")}
            </button>
            <button
              onClick={() =>
                setPayments([
                  { amount: String(amount.total / 100), method: "cash" },
                ])
              }
            >
              {t("Pay in full", "دفع كامل")}
            </button>
          </div>
          <textarea
            placeholder={t("Sale notes", "ملاحظات البيع")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            className="primary checkout"
            disabled={busy || !cart.length || Boolean(invalid)}
            onClick={() => void checkout()}
          >
            {busy
              ? t("Processing…", "جارٍ التنفيذ…")
              : t("Complete sale", "إتمام البيع")}
          </button>
          <small>
            {t(
              "Leave payments empty to record the full amount as customer debt.",
              "اترك الدفعات فارغة لتسجيل المبلغ بالكامل كمديونية للعميل.",
            )}
          </small>
        </aside>
      </div>
      {invoice && (
        <InvoiceDetail saleId={invoice} onClose={() => setInvoice(null)} />
      )}
      {quickCustomer && (
        <Modal
          title={t("Quick add customer", "إضافة عميل")}
          onClose={() => setQuickCustomer(false)}
        >
          <RecordForm
            fields={[
              { name: "name", en: "Name", ar: "الاسم", required: true },
              { name: "phone", en: "Phone", ar: "الهاتف" },
            ]}
            onSubmit={async (values) => {
              const customerId = await api("customers.save", { data: values });
              const profile = await api("customers.profile", customerId);
              setCustomer(profile.customer);
              setQuickCustomer(false);
              await client.invalidateQueries();
            }}
          />
        </Modal>
      )}
    </>
  );
}
