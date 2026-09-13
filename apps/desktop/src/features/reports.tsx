import { ReportFilters, type Filters } from "./report-filters";
import { Administration } from "./administration";
import { PurchaseDetail } from "./purchase-detail";
import { useState } from "react";
import { api, client, useApp, useData, useDebounce } from "../lib";
import {
  DataTable,
  Modal,
  PageHeader,
  RecordForm,
  Money,
  type Column,
  type Field,
} from "../components";
import type { Report } from "../../../../packages/domain/queries";
import { methods, type Row } from "../../../../packages/shared/schemas";
import { minor } from "../../../../packages/shared/money";
import { InvoiceDetail } from "./invoices";
const definitions: Record<
  Report,
  { en: string; ar: string; columns: string[] }
> = {
  profit: {
    en: "Profit report",
    ar: "تقرير الأرباح",
    columns: ["name", "revenue", "cogs", "profit"],
  },
  product_performance: {
    en: "Product performance",
    ar: "أداء المنتجات",
    columns: ["name", "quantity", "revenue", "profit"],
  },
  category_performance: {
    en: "Category performance",
    ar: "أداء الفئات",
    columns: ["name", "quantity", "revenue", "profit"],
  },
  stock: {
    en: "Inventory report",
    ar: "تقرير المخزون",
    columns: ["name", "sku", "stock_quantity", "reorder_level"],
  },
  low_stock: {
    en: "Reorder report",
    ar: "تقرير إعادة الطلب",
    columns: ["name", "sku", "stock_quantity", "reorder_level"],
  },
  supplier_balances: {
    en: "Supplier balances",
    ar: "أرصدة الموردين",
    columns: ["name", "total", "paid", "balance"],
  },
  sales: {
    en: "Invoices",
    ar: "الفواتير",
    columns: [
      "invoice_number",
      "customer_name",
      "total",
      "balance",
      "created_at",
    ],
  },
  payments: {
    en: "Payments",
    ar: "الدفعات",
    columns: ["invoice_number", "amount", "method", "notes", "created_at"],
  },
  expenses: {
    en: "Expenses",
    ar: "المصروفات",
    columns: ["category", "amount", "method", "description", "created_at"],
  },
  inventory: {
    en: "Stock movements",
    ar: "حركات المخزون",
    columns: [
      "name",
      "type",
      "quantity_change",
      "quantity_before",
      "quantity_after",
      "reason",
      "created_at",
    ],
  },
  purchases: {
    en: "Purchases",
    ar: "المشتريات",
    columns: [
      "invoice_number",
      "supplier_name",
      "status",
      "total",
      "paid",
      "created_at",
    ],
  },
  returns: {
    en: "Returns",
    ar: "المرتجعات",
    columns: ["invoice_number", "total", "reason", "created_at"],
  },
  cash: {
    en: "Cash transactions",
    ar: "حركات الخزينة",
    columns: ["type", "amount", "reason", "created_at"],
  },
  audit: {
    en: "Audit history",
    ar: "سجل التدقيق",
    columns: ["action", "entity", "entity_id", "created_at"],
  },
  debts: {
    en: "Customer debts",
    ar: "مديونيات العملاء",
    columns: ["invoice_number", "customer_name", "balance", "created_at"],
  },
  users: {
    en: "Users",
    ar: "المستخدمون",
    columns: ["name", "username", "roles", "created_at"],
  },
  backups: {
    en: "Backup history",
    ar: "سجل النسخ الاحتياطية",
    columns: ["file_name", "created_at"],
  },
  sessions: {
    en: "Cash sessions",
    ar: "جلسات الخزينة",
    columns: [
      "opened_at",
      "closed_at",
      "expected_balance",
      "actual_balance",
      "difference",
    ],
  },
};
const arabic: Record<string, string> = {
  revenue: "الإيرادات",
  cogs: "تكلفة البضاعة",
  profit: "الربح",
  quantity: "الكمية",
  stock_quantity: "المخزون",
  reorder_level: "حد إعادة الطلب",
  sku: "رمز المنتج",
  invoice_number: "رقم الفاتورة",
  customer_name: "العميل",
  total: "الإجمالي",
  balance: "المتبقي",
  created_at: "التاريخ",
  amount: "المبلغ",
  method: "الطريقة",
  notes: "ملاحظات",
  category: "الفئة",
  description: "الوصف",
  name: "الاسم",
  type: "النوع",
  quantity_change: "التغير",
  quantity_before: "قبل",
  quantity_after: "بعد",
  reason: "السبب",
  supplier_name: "المورد",
  status: "الحالة",
  paid: "المدفوع",
  action: "الإجراء",
  entity: "الكيان",
  entity_id: "المعرف",
  username: "اسم المستخدم",
  roles: "الأدوار",
  file_name: "اسم الملف",
  opened_at: "وقت الفتح",
  closed_at: "وقت الإغلاق",
  expected_balance: "الرصيد المتوقع",
  actual_balance: "الرصيد الفعلي",
  difference: "الفرق",
};
export function ReportPage({
  kind,
  allowSelect = false,
}: {
  kind: Report;
  allowSelect?: boolean;
}) {
  const { t, can, run } = useApp();
  const [selected, setSelected] = useState<Report>(kind);
  const current = allowSelect ? selected : kind;
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<string | null>(null);
  const [reverse, setReverse] = useState<string | null>(null);
  const query = {
    ...filters,
    search: useDebounce(search),
    page,
    from: from || undefined,
    to: to || undefined,
  };
  const data = useData("report.list", { kind: current, query });
  const definition = definitions[current];
  const columns: Column[] = definition.columns.map((key) => ({
    key,
    label: t(key.replaceAll("_", " "), arabic[key] ?? key),
    ...([
      "total",
      "amount",
      "balance",
      "paid",
      "expected_balance",
      "actual_balance",
      "difference",
      "revenue",
      "cogs",
      "profit",
    ].includes(key)
      ? {
          render: (row: Row) =>
            row[key] === null ? "—" : <Money value={row[key]} />,
        }
      : {}),
  }));
  const permission =
    current === "inventory"
      ? "inventory.adjust"
      : current === "users"
        ? "users.manage"
        : `${current}.create`;
  return (
    <>
      <PageHeader title={t(definition.en, definition.ar)}>
        <button
          onClick={() => run(() => api("export.csv", { kind: current, query }))}
        >
          {t("Export CSV", "تصدير CSV")}
        </button>
        {["expenses", "inventory", "users", "purchases"].includes(current) &&
          can(permission) && (
            <button className="primary" onClick={() => setForm(true)}>
              + {t("New record", "سجل جديد")}
            </button>
          )}
      </PageHeader>
      <div className="toolbar">
        {allowSelect && (
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value as Report);
              setFilters({});
              setPage(1);
            }}
          >
            {(
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
                "profit",
                "product_performance",
                "category_performance",
                "stock",
                "low_stock",
                "supplier_balances",
              ] as Report[]
            ).map((k) => (
              <option value={k} key={k}>
                {t(definitions[k].en, definitions[k].ar)}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder={t("Search records", "بحث السجلات")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <label>
          {t("From", "من")}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {t("To", "إلى")}
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <ReportFilters
        kind={current}
        value={filters}
        onChange={(value) => {
          setFilters(value);
          setPage(1);
        }}
      />
      {data.error && <p className="error">{data.error.message}</p>}
      <DataTable
        rows={data.data?.rows ?? []}
        columns={columns}
        actions={(row) => (
          <>
            {current === "purchases" && (
              <button onClick={() => setPurchase(String(row.id))}>
                {t("Details / payments", "التفاصيل / الدفعات")}
              </button>
            )}
            {current === "returns" && (
              <button
                onClick={() =>
                  run(() =>
                    api("print.preview", { kind: "return", id: row.id }),
                  )
                }
              >
                {t("Print preview", "معاينة الطباعة")}
              </button>
            )}
            {["sales", "debts"].includes(current) && (
              <button onClick={() => setInvoice(String(row.id))}>
                {t("Open invoice", "فتح الفاتورة")}
              </button>
            )}
            {current === "purchases" &&
              row.status === "draft" &&
              can("purchases.create") && (
                <button
                  onClick={() =>
                    run(
                      () => api("purchases.receive", row.id),
                      t("Stock received", "تم استلام المخزون"),
                    )
                  }
                >
                  {t("Receive stock", "استلام المخزون")}
                </button>
              )}
            {current === "payments" &&
              Number(row.amount) > 0 &&
              can("payments.reverse") && (
                <button onClick={() => setReverse(String(row.id))}>
                  {t("Reverse payment", "عكس الدفعة")}
                </button>
              )}
          </>
        )}
      />
      <div className="pagination">
        <span>
          {data.data?.total ?? 0} {t("records", "سجل")}
        </span>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          {t("Previous", "السابق")}
        </button>
        {page}
        <button
          disabled={page * 20 >= (data.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          {t("Next", "التالي")}
        </button>
      </div>
      {current === "users" && <Administration />}
      {purchase && (
        <PurchaseDetail
          purchaseId={purchase}
          onClose={() => setPurchase(null)}
        />
      )}
      {form &&
        (current === "purchases" ? (
          <PurchaseForm onClose={() => setForm(false)} />
        ) : (
          <OperationForm kind={current} onClose={() => setForm(false)} />
        ))}
      {invoice && (
        <InvoiceDetail saleId={invoice} onClose={() => setInvoice(null)} />
      )}
      {reverse && (
        <Modal
          title={t("Reverse payment", "عكس الدفعة")}
          onClose={() => setReverse(null)}
        >
          <RecordForm
            fields={[
              { name: "reason", en: "Reason", ar: "السبب", required: true },
            ]}
            onSubmit={async (values) => {
              await api("payments.reverse", {
                payment_id: reverse,
                reason: values.reason,
              });
              await client.invalidateQueries();
              setReverse(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
function OperationForm({
  kind,
  onClose,
}: {
  kind: Report;
  onClose: () => void;
}) {
  const { t } = useApp();
  const [search, setSearch] = useState("");
  const products = useData(
    "products.list",
    { search: useDebounce(search), page_size: 100 },
    kind === "inventory",
  );
  let fields: Field[] = [];
  if (kind === "expenses")
    fields = [
      { name: "category", en: "Category", ar: "الفئة", required: true },
      { name: "amount", en: "Amount", ar: "المبلغ", required: true },
      {
        name: "method",
        en: "Method",
        ar: "طريقة الدفع",
        type: "select",
        options: methods.map((m) => ({ value: m, label: m })),
      },
      { name: "description", en: "Description", ar: "الوصف", required: true },
    ];
  if (kind === "inventory")
    fields = [
      {
        name: "product_id",
        en: "Product",
        ar: "المنتج",
        type: "select",
        required: true,
        options: products.data?.rows.map((p) => ({
          value: String(p.id),
          label: String(p.name),
        })),
      },
      {
        name: "quantity",
        en: "Quantity change (negative reduces stock)",
        ar: "تغير الكمية (سالب لتقليل المخزون)",
        type: "number",
        required: true,
      },
      {
        name: "type",
        en: "Movement type",
        ar: "نوع الحركة",
        type: "select",
        options: ["opening_stock", "manual_adjustment", "damage", "loss"].map(
          (m) => ({ value: m, label: m }),
        ),
      },
      { name: "reason", en: "Reason", ar: "السبب", required: true },
    ];
  if (kind === "users")
    fields = [
      { name: "name", en: "Name", ar: "الاسم", required: true },
      { name: "username", en: "Username", ar: "اسم المستخدم", required: true },
      {
        name: "password",
        en: "Password (10+ characters)",
        ar: "كلمة المرور (10 أحرف على الأقل)",
        type: "password",
        required: true,
      },
      {
        name: "role",
        en: "Role",
        ar: "الدور",
        type: "select",
        options: ["sales", "cashier", "inventory", "manager", "admin"].map(
          (m) => ({ value: m, label: m }),
        ),
      },
    ];
  return (
    <Modal title={t("New record", "سجل جديد")} onClose={onClose}>
      {kind === "inventory" && (
        <input
          placeholder={t("Search all products", "بحث جميع المنتجات")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <RecordForm
        fields={fields}
        onSubmit={async (values) => {
          if (kind === "inventory")
            await api("inventory.adjust", {
              ...values,
              quantity: Number(values.quantity),
            });
          if (kind === "expenses")
            await api("expenses.create", {
              ...values,
              amount: minor(String(values.amount)),
            });
          if (kind === "users") await api("users.create", values);
          await client.invalidateQueries();
          onClose();
        }}
      />
    </Modal>
  );
}
function PurchaseForm({ onClose }: { onClose: () => void }) {
  const { t, notify } = useApp();
  const [search, setSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const products = useData("products.list", {
    search: useDebounce(search),
    page_size: 20,
  });
  const suppliers = useData("suppliers.list", {
    search: useDebounce(supplierSearch),
    page_size: 20,
  });
  const [items, setItems] = useState<
    { product: Row; quantity: number; cost: string }[]
  >([]);
  return (
    <Modal title={t("New purchase order", "طلب شراء جديد")} onClose={onClose}>
      <input
        placeholder={t("Search supplier", "بحث المورد")}
        value={supplierSearch}
        onChange={(e) => setSupplierSearch(e.target.value)}
      />
      <input
        placeholder={t("Search product to add", "بحث منتج لإضافته")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="search-results">
        {products.data?.rows.map((p) => (
          <button
            key={String(p.id)}
            onClick={() =>
              setItems([
                ...items,
                {
                  product: p,
                  quantity: 1,
                  cost: String(Number(p.unit_cost ?? 0) / 100),
                },
              ])
            }
          >
            + {p.name}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div className="payment-row" key={i}>
          <span>{item.product.name}</span>
          <input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) =>
              setItems(
                items.map((v, j) =>
                  j === i ? { ...v, quantity: Number(e.target.value) } : v,
                ),
              )
            }
          />
          <input
            value={item.cost}
            onChange={(e) =>
              setItems(
                items.map((v, j) =>
                  j === i ? { ...v, cost: e.target.value } : v,
                ),
              )
            }
          />
          <button onClick={() => setItems(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <RecordForm
        initial={{ paid: "0", method: "cash" }}
        fields={[
          {
            name: "supplier_id",
            en: "Supplier",
            ar: "المورد",
            type: "select",
            required: true,
            options: suppliers.data?.rows.map((s) => ({
              value: String(s.id),
              label: String(s.name),
            })),
          },
          {
            name: "invoice_number",
            en: "Supplier invoice/reference",
            ar: "مرجع فاتورة المورد",
            required: true,
          },
          { name: "paid", en: "Paid amount", ar: "المدفوع", required: true },
          {
            name: "method",
            en: "Payment method",
            ar: "طريقة الدفع",
            type: "select",
            options: methods.map((m) => ({ value: m, label: m })),
          },
          { name: "notes", en: "Notes", ar: "ملاحظات" },
        ]}
        onSubmit={async (values) => {
          if (!items.length) {
            notify(t("Add purchase items first", "أضف منتجات الشراء أولًا"));
            return;
          }
          await api("purchases.create", {
            ...values,
            paid: minor(String(values.paid)),
            items: items.map((item) => ({
              product_id: item.product.id,
              quantity: item.quantity,
              unit_cost: minor(item.cost),
            })),
          });
          await client.invalidateQueries();
          onClose();
        }}
      />
    </Modal>
  );
}
