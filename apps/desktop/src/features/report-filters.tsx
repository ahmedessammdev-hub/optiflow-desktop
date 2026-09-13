import { useState } from "react";
import { useApp, useData, useDebounce } from "../lib";
import { methods } from "../../../../packages/shared/schemas";
import { translateValue } from "../../../../packages/shared/i18n";
export type Filters = {
  customer_id?: string;
  product_id?: string;
  category_id?: string;
  supplier_id?: string;
  employee_id?: string;
  method?: string;
};
function Picker({
  kind,
  label,
  value,
  onChange,
}: {
  kind: "customers" | "products" | "categories" | "suppliers";
  label: string;
  value?: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const data = useData(`${kind}.list`, {
    search: useDebounce(search),
    page_size: 30,
  });
  return (
    <label>
      {label}
      <input
        placeholder={label}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {data.data?.rows.map((row) => (
          <option key={String(row.id)} value={String(row.id)}>
            {row.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ReportFilters({
  kind,
  value,
  onChange,
}: {
  kind: string;
  value: Filters;
  onChange: (value: Filters) => void;
}) {
  const { t, settings, can } = useApp();
  const financial = [
    "profit",
    "product_performance",
    "category_performance",
  ].includes(kind);
  return (
    <details className="panel">
      <summary>{t("Additional filters", "فلاتر إضافية")}</summary>
      <div className="form-grid">
        {(financial || ["sales", "debts", "payments"].includes(kind)) &&
          can("customers.view") && (
            <Picker
              kind="customers"
              label={t("Customer", "العميل")}
              value={value.customer_id}
              onChange={(id) =>
                onChange({ ...value, customer_id: id || undefined })
              }
            />
          )}{" "}
        {(financial || kind === "inventory") && can("products.view") && (
          <Picker
            kind="products"
            label={t("Product", "المنتج")}
            value={value.product_id}
            onChange={(id) =>
              onChange({ ...value, product_id: id || undefined })
            }
          />
        )}{" "}
        {financial && can("products.view") && (
          <Picker
            kind="categories"
            label={t("Category", "الفئة")}
            value={value.category_id}
            onChange={(id) =>
              onChange({ ...value, category_id: id || undefined })
            }
          />
        )}{" "}
        {kind === "purchases" && (
          <Picker
            kind="suppliers"
            label={t("Supplier", "المورد")}
            value={value.supplier_id}
            onChange={(id) =>
              onChange({ ...value, supplier_id: id || undefined })
            }
          />
        )}{" "}
        {["payments", "expenses"].includes(kind) && (
          <label>
            {t("Payment method", "طريقة الدفع")}
            <select
              value={value.method ?? ""}
              onChange={(e) =>
                onChange({ ...value, method: e.target.value || undefined })
              }
            >
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {translateValue(m, settings.language)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </details>
  );
}
