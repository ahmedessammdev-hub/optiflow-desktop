import { useState } from "react";
import { api, client, useApp, useData, useDebounce } from "../lib";
import {
  DataTable,
  Modal,
  Money,
  PageHeader,
  RecordForm,
  type Field,
} from "../components";
import { minor } from "../../../../packages/shared/money";
import type { Row } from "../../../../packages/shared/schemas";
const kinds = [
  "appointments",
  "lab_orders",
  "repairs",
  "customer_followups",
] as const;
type Kind = (typeof kinds)[number];
const titles: Record<Kind, [string, string]> = {
  appointments: ["Appointments", "المواعيد"],
  lab_orders: ["Lab orders", "أوامر المعمل"],
  repairs: ["Repairs & warranty", "الإصلاحات والضمان"],
  customer_followups: ["Customer follow-ups", "متابعة العملاء"],
};
const status: Record<Kind, string[]> = {
  appointments: ["scheduled", "confirmed", "completed", "cancelled", "no_show"],
  lab_orders: [
    "draft",
    "sent",
    "in_progress",
    "ready",
    "delivered",
    "cancelled",
  ],
  repairs: [
    "received",
    "diagnosing",
    "waiting_parts",
    "ready",
    "delivered",
    "cancelled",
  ],
  customer_followups: ["pending", "completed", "cancelled"],
};
const iso = (value: unknown) =>
  value ? new Date(String(value)).toISOString() : null;
const local = (value: unknown) => (value ? String(value).slice(0, 16) : "");
export function FulfillmentPage() {
  const { t } = useApp();
  const [kind, setKind] = useState<Kind>("appointments"),
    [search, setSearch] = useState(""),
    [customerSearch, setCustomerSearch] = useState(""),
    [editing, setEditing] = useState<Row | null | undefined>();
  const data = useData("extensions.list", {
    kind,
    query: { search: useDebounce(search), page_size: 100 },
  });
  const customers = useData("customers.list", {
    search: useDebounce(customerSearch),
    page_size: 100,
  });
  const customerOptions = [
    { value: "", label: t("Choose customer", "اختر العميل") },
    ...(customers.data?.rows ?? []).map((c) => ({
      value: String(c.id),
      label: `${c.name} · ${c.phone ?? ""}`,
    })),
  ];
  const common: Field[] = [
    {
      name: "customer_id",
      en: "Customer",
      ar: "العميل",
      type: "select",
      required: true,
      options: customerOptions,
    },
    {
      name: "status",
      en: "Status",
      ar: "الحالة",
      type: "select",
      options: status[kind].map((v) => ({ value: v, label: v })),
    },
  ];
  const specific: Record<Kind, Field[]> = {
    appointments: [
      {
        name: "starts_at",
        en: "Appointment time",
        ar: "وقت الموعد",
        type: "datetime-local",
        required: true,
      },
      { name: "purpose", en: "Purpose", ar: "الغرض", required: true },
      {
        name: "reminder_at",
        en: "Reminder time",
        ar: "وقت التذكير",
        type: "datetime-local",
      },
      { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
    ],
    lab_orders: [
      { name: "lab_name", en: "Laboratory", ar: "المعمل", required: true },
      {
        name: "sale_id",
        en: "Invoice ID (optional)",
        ar: "معرف الفاتورة (اختياري)",
      },
      {
        name: "prescription_id",
        en: "Prescription ID (optional)",
        ar: "معرف الوصفة (اختياري)",
      },
      {
        name: "expected_at",
        en: "Expected completion",
        ar: "موعد الإنجاز المتوقع",
        type: "datetime-local",
      },
      {
        name: "cost",
        en: "Laboratory cost",
        ar: "تكلفة المعمل",
        required: true,
      },
      { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
    ],
    repairs: [
      {
        name: "item_description",
        en: "Item description",
        ar: "وصف القطعة",
        required: true,
      },
      { name: "issue", en: "Reported issue", ar: "العطل", required: true },
      { name: "resolution", en: "Resolution", ar: "الإصلاح المنفذ" },
      { name: "cost", en: "Cost", ar: "التكلفة", required: true },
      {
        name: "received_at",
        en: "Received at",
        ar: "وقت الاستلام",
        type: "datetime-local",
        required: true,
      },
      {
        name: "due_at",
        en: "Due at",
        ar: "موعد التسليم",
        type: "datetime-local",
      },
      {
        name: "delivered_at",
        en: "Delivered at",
        ar: "وقت التسليم",
        type: "datetime-local",
      },
      {
        name: "warranty_until",
        en: "Warranty until",
        ar: "الضمان حتى",
        type: "date",
      },
      { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
    ],
    customer_followups: [
      {
        name: "type",
        en: "Follow-up type",
        ar: "نوع المتابعة",
        type: "select",
        options: ["exam", "collection", "lens_replacement", "other"].map(
          (v) => ({ value: v, label: v }),
        ),
      },
      {
        name: "due_at",
        en: "Due at",
        ar: "موعد المتابعة",
        type: "datetime-local",
        required: true,
      },
      { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
    ],
  };
  const initial = editing
    ? {
        ...editing,
        starts_at: local(editing.starts_at),
        reminder_at: local(editing.reminder_at),
        expected_at: local(editing.expected_at),
        received_at: local(editing.received_at),
        due_at: local(editing.due_at),
        delivered_at: local(editing.delivered_at),
        cost: editing.cost === undefined ? "" : Number(editing.cost) / 100,
      }
    : {};
  return (
    <>
      <PageHeader title={t("Customer fulfilment", "دورة خدمة العميل")}>
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as Kind);
            setEditing(undefined);
          }}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(...titles[k])}
            </option>
          ))}
        </select>
        <button className="primary" onClick={() => setEditing(null)}>
          + {t("New", "جديد")}
        </button>
      </PageHeader>
      <div className="toolbar">
        <input
          placeholder={t("Search records", "بحث السجلات")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <DataTable
        rows={data.data?.rows ?? []}
        columns={[
          { key: "customer_name", label: t("Customer", "العميل") },
          {
            key:
              kind === "appointments"
                ? "starts_at"
                : kind === "customer_followups"
                  ? "due_at"
                  : "created_at",
            label: t("Date", "التاريخ"),
          },
          { key: "status", label: t("Status", "الحالة") },
          {
            key:
              kind === "appointments"
                ? "purpose"
                : kind === "repairs"
                  ? "issue"
                  : "notes",
            label: t("Details", "التفاصيل"),
          },
          {
            key: "cost",
            label: t("Cost", "التكلفة"),
            render: (r) =>
              r.cost === undefined ? "" : <Money value={r.cost} />,
          },
        ]}
        actions={(row) => (
          <button onClick={() => setEditing(row)}>
            {t("Open / update", "فتح / تحديث")}
          </button>
        )}
      />
      {editing !== undefined && (
        <Modal title={t(...titles[kind])} onClose={() => setEditing(undefined)}>
          <input
            placeholder={t("Search customers", "بحث العملاء")}
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
          />
          <RecordForm
            key={`${kind}-${editing?.id ?? "new"}-${customers.data?.total ?? 0}`}
            initial={initial}
            fields={[...common, ...specific[kind]]}
            onSubmit={async (values) => {
              const normalized: Record<string, unknown> = {
                ...values,
                ...(editing ? { id: editing.id } : {}),
              };
              for (const key of [
                "starts_at",
                "reminder_at",
                "expected_at",
                "received_at",
                "due_at",
                "delivered_at",
              ])
                if (key in normalized) normalized[key] = iso(normalized[key]);
              for (const key of [
                "sale_id",
                "prescription_id",
                "warranty_until",
              ])
                if (normalized[key] === "") normalized[key] = null;
              if ("cost" in normalized)
                normalized.cost = minor(String(normalized.cost || "0"));
              await api("extensions.save", { kind, data: normalized });
              await client.invalidateQueries();
              setEditing(undefined);
            }}
          />
        </Modal>
      )}
    </>
  );
}
