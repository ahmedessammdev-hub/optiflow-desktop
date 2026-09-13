import { translateValue } from "../../../../packages/shared/i18n";
import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { useApp, useData } from "../lib";
import { PageHeader, Money, DataTable } from "../components";
import { periods } from "../../../../packages/shared/dates";
export function DashboardPage() {
  const { t, can, settings } = useApp();
  const [period, setPeriod] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const data = useData(
    "dashboard.get",
    { period, from: from || undefined, to: to || undefined },
    period !== "custom" || Boolean(from && to),
  );
  const low = useData("inventory.low", undefined, can("inventory.view"));
  const labels: Record<string, [string, string]> = {
    revenue: ["Net revenue", "صافي المبيعات"],
    cogs: ["Cost of goods", "تكلفة البضاعة"],
    profit: ["Gross profit", "مجمل الربح"],
    sales: ["Sales", "المبيعات"],
    average_order: ["Average sale", "متوسط الفاتورة"],
    collected: ["Collected payments", "الدفعات المحصلة"],
    expenses: ["Expenses", "المصروفات"],
    refunds: ["Refunds", "المبالغ المستردة"],
    cash_movement: ["Cash movement", "حركة النقدية"],
    new_customers: ["New customers", "عملاء جدد"],
    debt: ["Outstanding debt", "المديونية"],
    revenue_growth: ["Revenue growth", "نمو المبيعات"],
    profit_growth: ["Profit growth", "نمو الربح"],
    appointments_today: ["Appointments in period", "مواعيد الفترة"],
    lab_pending: ["Pending lab orders", "طلبات المعمل المعلقة"],
  };
  return (
    <>
      <PageHeader
        title={t("Shop overview", "نظرة عامة على المحل")}
        subtitle={t(
          "Your sales, collections and stock at a glance",
          "المبيعات والتحصيل والمخزون في مكان واحد",
        )}
      >
        <button onClick={() => void data.refetch()}>
          {t("Refresh", "تحديث")}
        </button>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          {periods.map((p) => (
            <option key={p} value={p}>
              {translateValue(p, settings.language).replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </PageHeader>
      {period === "custom" && (
        <div className="toolbar">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      )}
      {data.error && <p className="error">{data.error.message}</p>}
      <div className="kpi-grid">
        {Object.entries(data.data?.metrics ?? {}).map(([key, value]) => (
          <div className="kpi" key={key}>
            <span>{t(...(labels[key] ?? [key, key]))}</span>
            <strong>
              {value === null ? (
                "—"
              ) : key.includes("growth") ? (
                `${value.toFixed(1)}%`
              ) : [
                  "sales",
                  "new_customers",
                  "appointments_today",
                  "lab_pending",
                ].includes(key) ? (
                value
              ) : (
                <Money value={value} />
              )}
            </strong>
          </div>
        ))}
      </div>
      <div className="chart-grid">
        <section className="panel">
          <h2>{t("Revenue trend", "اتجاه الإيرادات")}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.data?.trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" />
              <YAxis tickFormatter={(value) => String(Number(value) / 100)} />
              <Tooltip formatter={(value) => Number(value) / 100} />
              <Area
                type="monotone"
                dataKey="revenue"
                name={t("Net revenue", "صافي المبيعات")}
                stroke="#087c83"
                fill="#cdeceb"
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
        <section className="panel">
          <h2>{t("Sales by product type", "المبيعات حسب النوع")}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.data?.by_type ?? []}>
              <XAxis
                dataKey="name"
                tickFormatter={(value) =>
                  translateValue(String(value), settings.language)
                }
              />
              <YAxis tickFormatter={(value) => String(Number(value) / 100)} />
              <Tooltip formatter={(value) => Number(value) / 100} />
              <Bar
                dataKey="amount"
                name={t("Net revenue", "صافي المبيعات")}
                fill="#087c83"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      {can("inventory.view") && (
        <section className="panel">
          <h2>{t("Reorder watch", "متابعة إعادة الطلب")}</h2>
          <DataTable
            rows={low.data ?? []}
            columns={[
              { key: "name", label: t("Product", "المنتج") },
              { key: "sku", label: "SKU" },
              { key: "stock_quantity", label: t("Available", "المتاح") },
              {
                key: "reorder_level",
                label: t("Reorder level", "حد إعادة الطلب"),
              },
            ]}
          />
        </section>
      )}
      <div className="chart-grid">
        {[
          {
            title: t("Sales trend", "اتجاه عدد المبيعات"),
            rows: data.data?.trend,
            key: "sales",
            axis: "day",
            money: false,
          },
          ...(can("reports.profit")
            ? [
                {
                  title: t("Profit trend", "اتجاه مجمل الربح"),
                  rows: data.data?.profit_trend,
                  key: "amount",
                  axis: "day",
                  money: true,
                },
              ]
            : []),
          {
            title: t(
              "Sales by category · Top categories",
              "المبيعات حسب الفئة · أفضل الفئات",
            ),
            rows: data.data?.top_categories,
            key: "amount",
            axis: "name",
            money: true,
          },
          {
            title: t("Top products", "أفضل المنتجات"),
            rows: data.data?.top_products,
            key: "amount",
            axis: "name",
            money: true,
          },
          {
            title: t("Payment method distribution", "توزيع طرق الدفع"),
            rows: data.data?.payment_methods,
            key: "amount",
            axis: "name",
            money: true,
          },
        ].map((chart) => (
          <section className="panel" key={chart.title}>
            <h2>{chart.title}</h2>
            {!chart.rows?.length ? (
              <p>
                {t(
                  "No transactions in this period",
                  "لا توجد عمليات في هذه الفترة",
                )}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chart.rows}>
                  <XAxis
                    dataKey={chart.axis}
                    tickFormatter={(v) =>
                      translateValue(String(v), settings.language)
                    }
                  />
                  <YAxis
                    tickFormatter={(v) =>
                      String(Number(v) / (chart.money ? 100 : 1))
                    }
                  />
                  <Tooltip
                    formatter={(v) =>
                      v === null ? "—" : Number(v) / (chart.money ? 100 : 1)
                    }
                  />
                  <Bar dataKey={chart.key} name={chart.title} fill="#087c83" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>
        ))}
        {can("sales.view") && (
          <section className="panel">
            <h2>{t("Recent sales", "آخر المبيعات")}</h2>
            <DataTable
              rows={data.data?.recent_sales ?? []}
              columns={[
                { key: "invoice_number", label: t("Invoice", "الفاتورة") },
                {
                  key: "total",
                  label: t("Total", "الإجمالي"),
                  render: (r) => <Money value={r.total} />,
                },
              ]}
            />
          </section>
        )}
        {can("payments.view") && (
          <section className="panel">
            <h2>{t("Recent payments", "آخر الدفعات")}</h2>
            <DataTable
              rows={data.data?.recent_payments ?? []}
              columns={[
                { key: "invoice_number", label: t("Invoice", "الفاتورة") },
                { key: "method", label: t("Method", "الطريقة") },
                {
                  key: "amount",
                  label: t("Amount", "المبلغ"),
                  render: (r) => <Money value={r.amount} />,
                },
              ]}
            />
          </section>
        )}
        {can("reports.view") && (
          <section className="panel">
            <h2>
              {t(
                "Outstanding customer debts · All dates",
                "مديونيات العملاء · كل الفترات",
              )}
            </h2>
            <DataTable
              rows={data.data?.outstanding ?? []}
              columns={[
                { key: "name", label: t("Customer", "العميل") },
                {
                  key: "balance",
                  label: t("Balance", "المتبقي"),
                  render: (r) => <Money value={r.balance} />,
                },
              ]}
            />
          </section>
        )}
      </div>
    </>
  );
}
