import { useState } from "react";
import { api, client, useApp, useData, useDebounce } from "../lib";
import { DataTable, Modal, Money, PageHeader, RecordForm } from "../components";
const ZERO = "00000000-0000-4000-8000-000000000000";
type Tab = "stocktakes" | "supplier_returns" | "branches" | "labels";
export function InventoryControlPage() {
  const { t, run } = useApp();
  const [tab, setTab] = useState<Tab>("stocktakes"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [purchaseId, setPurchaseId] = useState("");
  const list = useData(
    "extensions.list",
    {
      kind:
        tab === "labels" ? "stocktakes" : tab === "branches" ? "branches" : tab,
      query: { search: useDebounce(search), page_size: 100 },
    },
    tab !== "labels",
  );
  const stocktake = useData(
    "stocktakes.get",
    selected ?? ZERO,
    tab === "stocktakes" && Boolean(selected),
  );
  const purchases = useData(
    "report.list",
    { kind: "purchases", query: { page_size: 100 } },
    tab === "supplier_returns",
  );
  const purchase = useData(
    "purchases.get",
    purchaseId || ZERO,
    Boolean(purchaseId),
  );
  const branches = useData("branches.list");
  const activeBranch = useData("branches.active", undefined);
  const products = useData(
    "products.list",
    { search: useDebounce(search), page_size: 100 },
    tab === "branches" || tab === "labels",
  );
  const tabs: Record<Tab, [string, string]> = {
    stocktakes: ["Stocktakes", "الجرد الفعلي"],
    supplier_returns: ["Supplier returns", "مرتجعات المورد"],
    branches: ["Branches & transfers", "الفروع والتحويلات"],
    labels: ["Barcode labels", "ملصقات الباركود"],
  };
  return (
    <>
      <PageHeader title={t("Inventory control", "الرقابة على المخزون")}>
        <select
          value={tab}
          onChange={(e) => {
            setTab(e.target.value as Tab);
            setSelected(null);
            setModal("");
          }}
        >
          {(Object.keys(tabs) as Tab[]).map((k) => (
            <option key={k} value={k}>
              {t(...tabs[k])}
            </option>
          ))}
        </select>
        {tab === "stocktakes" && (
          <button className="primary" onClick={() => setModal("stocktake")}>
            + {t("Start stocktake", "بدء جرد")}
          </button>
        )}
        {tab === "supplier_returns" && (
          <button className="primary" onClick={() => setModal("return")}>
            + {t("New supplier return", "مرتجع مورد جديد")}
          </button>
        )}
        {tab === "branches" && (
          <>
            <button onClick={() => setModal("branch")}>
              + {t("Branch", "فرع")}
            </button>
            <button className="primary" onClick={() => setModal("transfer")}>
              + {t("Transfer", "تحويل")}
            </button>
          </>
        )}
      </PageHeader>
      <div className="toolbar">
        <label>
          {t("Active branch", "الفرع النشط")}
          <select
            value={String(activeBranch.data?.id ?? "")}
            onChange={(event) =>
              run(async () => {
                await api("branches.select", event.target.value);
                await client.invalidateQueries();
              })
            }
          >
            {(branches.data ?? []).map((branch) => (
              <option key={String(branch.id)} value={String(branch.id)}>
                {String(branch.name)}
              </option>
            ))}
          </select>
        </label>
        <input
          placeholder={t("Search", "بحث")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {tab === "labels" ? (
        <DataTable
          rows={products.data?.rows ?? []}
          columns={[
            { key: "name", label: t("Product", "المنتج") },
            { key: "sku", label: "SKU" },
            { key: "barcode", label: t("Barcode", "الباركود") },
            {
              key: "unit_price",
              label: t("Price", "السعر"),
              render: (r) => <Money value={r.unit_price} />,
            },
          ]}
          actions={(r) => (
            <button
              onClick={() =>
                run(() => api("print.preview", { kind: "labels", id: r.id }))
              }
            >
              {t("Print 12 labels", "طباعة 12 ملصق")}
            </button>
          )}
        />
      ) : (
        <DataTable
          rows={list.data?.rows ?? []}
          columns={
            tab === "stocktakes"
              ? [
                  { key: "started_at", label: t("Started", "بدأ") },
                  { key: "status", label: t("Status", "الحالة") },
                  { key: "notes", label: t("Notes", "ملاحظات") },
                ]
              : tab === "supplier_returns"
                ? [
                    { key: "customer_name", label: t("Supplier", "المورد") },
                    {
                      key: "total",
                      label: t("Credit", "الرصيد الدائن"),
                      render: (r) => <Money value={r.total} />,
                    },
                    { key: "reason", label: t("Reason", "السبب") },
                    { key: "created_at", label: t("Date", "التاريخ") },
                  ]
                : [
                    { key: "code", label: t("Code", "الكود") },
                    { key: "customer_name", label: t("Branch", "الفرع") },
                    { key: "address", label: t("Address", "العنوان") },
                  ]
          }
          actions={
            tab === "stocktakes"
              ? (r) => (
                  <button onClick={() => setSelected(String(r.id))}>
                    {t("Count", "العد")}
                  </button>
                )
              : undefined
          }
        />
      )}{" "}
      {modal === "stocktake" && (
        <Modal
          title={t("Start stocktake", "بدء جرد")}
          onClose={() => setModal("")}
        >
          <RecordForm
            fields={[{ name: "notes", en: "Notes", ar: "ملاحظات" }]}
            onSubmit={async (v) => {
              const id = await api("stocktakes.start", v.notes);
              await client.invalidateQueries();
              setSelected(id);
              setModal("");
            }}
          />
        </Modal>
      )}
      {selected && stocktake.data && (
        <Modal
          title={t("Physical count", "العد الفعلي")}
          onClose={() => setSelected(null)}
        >
          <p>
            {t(
              "Enter every counted quantity. Posting creates audited adjustments.",
              "أدخل كل الكميات الفعلية. الاعتماد ينشئ تسويات مسجلة.",
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t("Product", "المنتج")}</th>
                <th>{t("Expected", "المتوقع")}</th>
                <th>{t("Counted", "الفعلي")}</th>
              </tr>
            </thead>
            <tbody>
              {stocktake.data.items.map((i) => (
                <tr key={String(i.product_id)}>
                  <td>
                    {i.name} · {i.sku}
                  </td>
                  <td>{i.expected_quantity}</td>
                  <td>
                    <input
                      aria-label={`${t("Counted", "الفعلي")} ${i.name}`}
                      type="number"
                      min="0"
                      defaultValue={i.counted_quantity ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== "")
                          void run(() =>
                            api("stocktakes.count", {
                              stocktake_id: selected,
                              product_id: i.product_id,
                              counted_quantity: Number(e.target.value),
                            }),
                          );
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="primary"
            onClick={() =>
              run(
                async () => {
                  await api("stocktakes.post", selected);
                  setSelected(null);
                },
                t("Stocktake posted", "تم اعتماد الجرد"),
              )
            }
          >
            {t("Post stocktake", "اعتماد الجرد")}
          </button>
        </Modal>
      )}
      {modal === "return" && (
        <Modal
          title={t("Supplier return", "مرتجع المورد")}
          onClose={() => setModal("")}
        >
          <select
            value={purchaseId}
            onChange={(e) => setPurchaseId(e.target.value)}
          >
            <option value="">
              {t("Choose received purchase", "اختر فاتورة مشتريات مستلمة")}
            </option>
            {purchases.data?.rows
              .filter((p) => p.status === "received")
              .map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {p.invoice_number} · {p.supplier_name}
                </option>
              ))}
          </select>
          {purchase.data && (
            <RecordForm
              key={purchaseId}
              fields={[
                ...purchase.data.items.map((i) => ({
                  name: `q_${i.id}`,
                  en: `${JSON.parse(String(i.product_snapshot)).name} · max ${i.quantity}`,
                  ar: `${JSON.parse(String(i.product_snapshot)).name} · الحد ${i.quantity}`,
                  type: "number" as const,
                  min: 0,
                  max: Number(i.quantity),
                })),
                { name: "reason", en: "Reason", ar: "السبب", required: true },
              ]}
              onSubmit={async (v) => {
                const items = purchase.data.items
                  .map((i) => ({
                    purchase_item_id: i.id,
                    quantity: Number(v[`q_${i.id}`] || 0),
                  }))
                  .filter((i) => i.quantity > 0);
                if (!items.length)
                  throw new Error(
                    t(
                      "Enter at least one quantity",
                      "أدخل كمية واحدة على الأقل",
                    ),
                  );
                await api("supplier_returns.create", {
                  purchase_id: purchaseId,
                  reason: v.reason,
                  items,
                });
                await client.invalidateQueries();
                setModal("");
                setPurchaseId("");
              }}
            />
          )}
        </Modal>
      )}
      {modal === "branch" && (
        <Modal title={t("New branch", "فرع جديد")} onClose={() => setModal("")}>
          <RecordForm
            fields={[
              {
                name: "code",
                en: "Code (A-Z / 0-9)",
                ar: "الكود (إنجليزي/أرقام)",
                required: true,
              },
              {
                name: "name",
                en: "Branch name",
                ar: "اسم الفرع",
                required: true,
              },
              { name: "address", en: "Address", ar: "العنوان" },
              { name: "phone", en: "Phone", ar: "الهاتف" },
            ]}
            onSubmit={async (v) => {
              await api("branches.create", {
                ...v,
                code: String(v.code).toUpperCase(),
              });
              await client.invalidateQueries();
              setModal("");
            }}
          />
        </Modal>
      )}
      {modal === "transfer" && (
        <Modal
          title={t("Branch transfer", "تحويل بين الفروع")}
          onClose={() => setModal("")}
        >
          <RecordForm
            fields={[
              {
                name: "from",
                en: "From branch",
                ar: "من فرع",
                type: "select",
                options: (branches.data ?? []).map((b) => ({
                  value: String(b.id),
                  label: String(b.name),
                })),
                required: true,
              },
              {
                name: "to",
                en: "To branch",
                ar: "إلى فرع",
                type: "select",
                options: (branches.data ?? []).map((b) => ({
                  value: String(b.id),
                  label: String(b.name),
                })),
                required: true,
              },
              {
                name: "product",
                en: "Product",
                ar: "المنتج",
                type: "select",
                options: (products.data?.rows ?? []).map((p) => ({
                  value: String(p.id),
                  label: String(p.name),
                })),
                required: true,
              },
              {
                name: "quantity",
                en: "Quantity",
                ar: "الكمية",
                type: "number",
                min: 1,
                required: true,
              },
              { name: "notes", en: "Notes", ar: "ملاحظات" },
            ]}
            onSubmit={async (v) => {
              await api("branches.transfer", {
                from_branch_id: v.from,
                to_branch_id: v.to,
                notes: v.notes,
                items: [
                  { product_id: v.product, quantity: Number(v.quantity) },
                ],
              });
              await client.invalidateQueries();
              setModal("");
            }}
          />
        </Modal>
      )}
    </>
  );
}
