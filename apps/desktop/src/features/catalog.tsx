import { AttachmentPanel } from "./attachments";
import { useState } from "react";
import { api, client, useApp, useData, useDebounce } from "../lib";
import {
  DataTable,
  Modal,
  PageHeader,
  RecordForm,
  Money,
  Confirm,
  type Field,
} from "../components";
import { minor } from "../../../../packages/shared/money";
import { productTypes, type Row } from "../../../../packages/shared/schemas";
import { CustomerProfile } from "./customers";
const customerFields: Field[] = [
  { name: "name", en: "Name", ar: "الاسم", required: true },
  { name: "phone", en: "Phone", ar: "الهاتف" },
  { name: "secondary_phone", en: "Secondary phone", ar: "هاتف إضافي" },
  { name: "email", en: "Email", ar: "البريد الإلكتروني", type: "email" },
  { name: "address", en: "Address", ar: "العنوان" },
  { name: "city", en: "City", ar: "المدينة" },
  {
    name: "date_of_birth",
    en: "Date of birth",
    ar: "تاريخ الميلاد",
    type: "date",
  },
  { name: "gender", en: "Gender", ar: "النوع" },
  { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
];
const supplierFields: Field[] = [
  { name: "name", en: "Name", ar: "الاسم", required: true },
  { name: "phone", en: "Phone", ar: "الهاتف" },
  { name: "email", en: "Email", ar: "البريد الإلكتروني" },
  { name: "address", en: "Address", ar: "العنوان" },
  { name: "contact_person", en: "Contact person", ar: "مسؤول التواصل" },
  { name: "tax_number", en: "Tax number", ar: "الرقم الضريبي" },
  { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
];
function ProductImage({ product }: { product: Row }) {
  return product.image_data_url ? (
    <img
      className="product-thumbnail"
      src={String(product.image_data_url)}
      alt={String(product.name)}
    />
  ) : (
    <span className="product-thumbnail placeholder" aria-hidden="true">
      {product.type === "frames" || product.type === "sunglasses" ? "◎—◎" : "◉"}
    </span>
  );
}
export function CatalogPage({
  kind,
}: {
  kind: "customers" | "products" | "categories" | "suppliers";
}) {
  const { t, can, run } = useApp();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("created_at");
  const [type, setType] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [archive, setArchive] = useState<Row | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const debounced = useDebounce(search);
  const query = { search: debounced, page, sort, type, archived };
  const data = useData(`${kind}.list`, query);
  const categories = useData(
    "categories.list",
    { page_size: 100 },
    kind === "products" && editing !== undefined,
  );
  const suppliers = useData(
    "suppliers.list",
    { page_size: 100 },
    kind === "products" && editing !== undefined && can("purchases.view"),
  );
  const parentProducts = useData(
    "products.list",
    { page_size: 100, sort: "name", direction: "asc" },
    kind === "products" && editing !== undefined,
  );
  const title = {
    customers: t("Customers", "العملاء"),
    products: t("Products", "المنتجات"),
    categories: t("Categories", "الفئات"),
    suppliers: t("Suppliers", "الموردون"),
  }[kind];
  let fields: Field[] =
    kind === "customers"
      ? customerFields
      : kind === "suppliers"
        ? supplierFields
        : kind === "categories"
          ? [
              { name: "name", en: "Name", ar: "الاسم", required: true },
              {
                name: "type",
                en: "Product type",
                ar: "نوع المنتج",
                type: "select",
                options: productTypes.map((v) => ({ value: v, label: v })),
              },
              {
                name: "reorder_level",
                en: "Reorder level",
                ar: "حد إعادة الطلب",
                type: "number",
                min: 0,
              },
            ]
          : [
              {
                name: "name",
                en: "Product name",
                ar: "اسم المنتج",
                required: true,
              },
              { name: "sku", en: "SKU", ar: "رمز المنتج", required: true },
              { name: "barcode", en: "Barcode", ar: "الباركود" },
              {
                name: "type",
                en: "Type",
                ar: "النوع",
                type: "select",
                options: productTypes.map((v) => ({ value: v, label: v })),
              },
              {
                name: "category_id",
                en: "Category",
                ar: "الفئة",
                type: "select",
                options: [
                  { value: "", label: t("None", "بدون") },
                  ...(categories.data?.rows ?? []).map((r) => ({
                    value: String(r.id),
                    label: String(r.name),
                  })),
                ],
              },
              { name: "brand", en: "Brand", ar: "العلامة التجارية" },
              { name: "model_code", en: "Model", ar: "الموديل" },
              { name: "material", en: "Material", ar: "الخامة" },
              { name: "color", en: "Color", ar: "اللون" },
              { name: "size", en: "Size", ar: "المقاس" },
              {
                name: "parent_product_id",
                en: "Parent style (variant of)",
                ar: "الموديل الأساسي (هذا المنتج Variant منه)",
                type: "select",
                options: [
                  { value: "", label: t("Independent product", "منتج مستقل") },
                  ...(parentProducts.data?.rows ?? [])
                    .filter((r) => r.id !== editing?.id)
                    .map((r) => ({
                      value: String(r.id),
                      label: String(r.name),
                    })),
                ],
              },
              {
                name: "unit_cost",
                en: "Purchase cost",
                ar: "تكلفة الشراء",
                required: true,
              },
              {
                name: "unit_price",
                en: "Selling price",
                ar: "سعر البيع",
                required: true,
              },
              {
                name: "reorder_level",
                en: "Reorder level (blank inherits)",
                ar: "حد الطلب (فارغ للإعداد العام)",
                type: "number",
                min: 0,
              },
              {
                name: "supplier_id",
                en: "Supplier",
                ar: "المورد",
                type: "select",
                options: [
                  { value: "", label: t("None", "بدون") },
                  ...(suppliers.data?.rows ?? []).map((r) => ({
                    value: String(r.id),
                    label: String(r.name),
                  })),
                ],
              },
              {
                name: "variants",
                en: "Variant specifications",
                ar: "مواصفات المنتج",
              },
              { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
            ];
  if (kind === "customers")
    fields = [
      ...fields,
      {
        name: "allow_duplicate",
        en: "Allow duplicate phone after review",
        ar: "السماح بتكرار الهاتف بعد المراجعة",
        type: "checkbox",
      },
    ];
  const initial: Record<string, unknown> = {
    ...(editing ?? {}),
    type: editing?.type ?? "frames",
  };
  if (kind === "products") {
    initial.unit_cost = String(Number(editing?.unit_cost ?? 0) / 100);
    initial.unit_price = String(Number(editing?.unit_price ?? 0) / 100);
  }
  async function save(values: Record<string, string | boolean>) {
    const payload: Record<string, unknown> = { ...values };
    delete payload.allow_duplicate;
    if (kind === "customers")
      payload.date_of_birth = values.date_of_birth || null;
    if (kind === "products") {
      payload.unit_cost = minor(String(values.unit_cost));
      payload.unit_price = minor(String(values.unit_price));
      payload.category_id = values.category_id || null;
      payload.supplier_id = values.supplier_id || null;
      payload.parent_product_id = values.parent_product_id || null;
    }
    if (kind === "categories" || kind === "products")
      payload.reorder_level =
        values.reorder_level === "" || values.reorder_level === undefined
          ? null
          : Number(values.reorder_level);
    await api(`${kind}.save`, {
      id: editing?.id,
      data: payload,
      allow_duplicate: Boolean(values.allow_duplicate),
    });
    await client.invalidateQueries();
    setEditing(undefined);
  }
  const createPermission =
    kind === "suppliers"
      ? "purchases.create"
      : kind === "categories"
        ? "products.update"
        : `${kind}.create`;
  return (
    <>
      <PageHeader
        title={title}
        subtitle={t(
          "Search all records in your shop",
          "البحث في جميع سجلات المحل",
        )}
      >
        <button
          onClick={() =>
            run(
              () => api("export.csv", { kind, query }),
              t("Export complete", "اكتمل التصدير"),
            )
          }
        >
          {t("Export CSV", "تصدير CSV")}
        </button>
        {can(createPermission) && (
          <button className="primary" onClick={() => setEditing(null)}>
            + {t("Add", "إضافة")}
          </button>
        )}
      </PageHeader>
      <div className="toolbar">
        <input
          aria-label={t("Search", "بحث")}
          placeholder={t(
            "Search by name, phone, SKU or barcode…",
            "ابحث بالاسم أو الهاتف أو الباركود…",
          )}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="created_at">{t("Newest first", "الأحدث")}</option>
          <option value="name">{t("Name", "الاسم")}</option>
        </select>
        {kind === "products" && (
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("All types", "كل الأنواع")}</option>
            {productTypes.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        )}
        <label className="inline">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {t("Archived", "المؤرشف")}
        </label>
      </div>
      {data.error && <p className="error">{data.error.message}</p>}
      {data.isLoading ? (
        <p>{t("Loading…", "جارٍ التحميل…")}</p>
      ) : (
        <DataTable
          rows={data.data?.rows ?? []}
          columns={[
            { key: "name", label: t("Name", "الاسم") },
            ...(kind === "products"
              ? [
                  {
                    key: "image_data_url",
                    label: t("Image", "الصورة"),
                    render: (r: Row) => <ProductImage product={r} />,
                  },
                  { key: "sku", label: "SKU" },
                  { key: "type", label: t("Type", "النوع") },
                  { key: "stock_quantity", label: t("Stock", "المخزون") },
                  {
                    key: "unit_price",
                    label: t("Price", "السعر"),
                    render: (r: Row) => <Money value={r.unit_price} />,
                  },
                ]
              : kind === "categories"
                ? [
                    { key: "type", label: t("Type", "النوع") },
                    {
                      key: "reorder_level",
                      label: t("Reorder level", "حد الطلب"),
                    },
                  ]
                : [
                    { key: "phone", label: t("Phone", "الهاتف") },
                    { key: "address", label: t("Address", "العنوان") },
                  ]),
          ]}
          actions={(row) => (
            <>
              {kind === "customers" && (
                <button onClick={() => setProfile(String(row.id))}>
                  {t("Profile", "الملف")}
                </button>
              )}
              {!archived &&
                can(
                  kind === "suppliers"
                    ? "purchases.create"
                    : kind === "categories"
                      ? "products.update"
                      : `${kind}.update`,
                ) && (
                  <button onClick={() => setEditing(row)}>
                    {t("Edit", "تعديل")}
                  </button>
                )}
              {!archived &&
                kind !== "categories" &&
                can(
                  kind === "suppliers" ? "purchases.create" : `${kind}.archive`,
                ) && (
                  <button onClick={() => setArchive(row)}>
                    {t("Archive", "أرشفة")}
                  </button>
                )}
            </>
          )}
        />
      )}
      <div className="pagination">
        <span>
          {data.data?.total ?? 0} {t("records", "سجل")}
        </span>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("Previous", "السابق")}
        </button>
        <span>{page}</span>
        <button
          disabled={page * 20 >= (data.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          {t("Next", "التالي")}
        </button>
      </div>
      {editing !== undefined && (
        <Modal
          title={t("Edit record", "تحرير السجل")}
          onClose={() => setEditing(undefined)}
        >
          <RecordForm fields={fields} initial={initial} onSubmit={save} />
          {editing && kind === "products" && (
            <AttachmentPanel
              entityType="products"
              entityId={String(editing.id)}
            />
          )}
        </Modal>
      )}
      {archive && kind !== "categories" && (
        <Confirm
          message={t(
            "Archive this record? Historical documents remain available.",
            "أرشفة هذا السجل؟ ستظل المستندات السابقة متاحة.",
          )}
          onClose={() => setArchive(null)}
          onConfirm={async () => {
            await run(() => api(`${kind}.archive`, archive.id));
            setArchive(null);
          }}
        />
      )}
      {profile && (
        <CustomerProfile
          customerId={profile}
          onClose={() => setProfile(null)}
        />
      )}
    </>
  );
}
