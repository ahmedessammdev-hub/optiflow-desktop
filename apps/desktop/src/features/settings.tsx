import { BackupSettings } from "./backup-settings";
import { useState } from "react";
import { api, client, useApp, useData } from "../lib";
import {
  PageHeader,
  RecordForm,
  Modal,
  Money,
  type Field,
} from "../components";
import { minor } from "../../../../packages/shared/money";
import { ReportPage } from "./reports";
import { AttachmentPanel } from "./attachments";
const STORE_SETTINGS_ID = "00000000-0000-4000-8000-000000000001";
export function SettingsPage() {
  const { t, settings, can, run } = useApp();
  const info = useData("app.info");
  const printers = useData("printers.list");
  const [password, setPassword] = useState(false);
  const fields: Field[] = [
    { name: "store_name", en: "Store name", ar: "اسم المحل", required: true },
    {
      name: "store_name_ar",
      en: "Arabic store name",
      ar: "اسم المحل بالعربية",
    },
    { name: "address", en: "Address", ar: "العنوان" },
    { name: "phone", en: "Phone", ar: "الهاتف" },
    { name: "secondary_phone", en: "Secondary phone", ar: "الهاتف الثاني" },
    { name: "tax_number", en: "Tax number", ar: "الرقم الضريبي" },
    {
      name: "commercial_registration",
      en: "Commercial registration",
      ar: "السجل التجاري",
    },
    { name: "currency", en: "Currency code", ar: "رمز العملة", required: true },
    {
      name: "language",
      en: "Language",
      ar: "اللغة",
      type: "select",
      options: [
        { value: "en", label: "English" },
        { value: "ar", label: "العربية" },
      ],
    },
    {
      name: "timezone",
      en: "Business timezone",
      ar: "المنطقة الزمنية",
      required: true,
    },
    {
      name: "reorder_level",
      en: "Default reorder level",
      ar: "حد الطلب الافتراضي",
      type: "number",
      min: 0,
    },
    { name: "header", en: "Print header", ar: "رأس المستند" },
    { name: "footer", en: "Print footer", ar: "تذييل المستند" },
    {
      name: "paper",
      en: "Paper size",
      ar: "حجم الورق",
      type: "select",
      options: ["A4", "A5", "80mm"].map((p) => ({ value: p, label: p })),
    },
    {
      name: "margin",
      en: "Margins (mm)",
      ar: "الهوامش (مم)",
      type: "number",
      min: 0,
      max: 30,
    },
    {
      name: "copies",
      en: "Copies",
      ar: "النسخ",
      type: "number",
      min: 1,
      max: 10,
    },
    {
      name: "default_printer",
      en: "Default printer",
      ar: "الطابعة الافتراضية",
      type: "select",
      options: [
        { value: "", label: t("System default", "افتراضي النظام") },
        ...(printers.data ?? []).map((p) => ({
          value: p.name,
          label: p.displayName,
        })),
      ],
    },
    ...(
      ["show_prices", "show_phone", "show_seller", "show_prescription"] as const
    ).map((name) => ({
      name,
      en: name.replaceAll("_", " "),
      ar: {
        show_prices: "عرض الأسعار",
        show_phone: "عرض الهاتف",
        show_seller: "عرض البائع",
        show_prescription: "عرض الوصفة",
      }[name],
      type: "checkbox" as const,
    })),
  ];
  return (
    <>
      <PageHeader title={t("Settings & help", "الإعدادات والمساعدة")}>
        <button onClick={() => setPassword(true)}>
          {t("Change password", "تغيير كلمة المرور")}
        </button>
      </PageHeader>
      {can("settings.manage") && (
        <>
          <AttachmentPanel
            entityType="store_settings"
            entityId={STORE_SETTINGS_ID}
          />
          <section className="panel">
            <RecordForm
              fields={fields}
              initial={settings}
              onSubmit={async (values) => {
                await api("settings.save", {
                  ...values,
                  reorder_level: Number(values.reorder_level),
                  margin: Number(values.margin),
                  copies: Number(values.copies),
                });
                await client.invalidateQueries();
              }}
            />
          </section>
        </>
      )}
      {can("backup.manage") && (
        <section className="panel">
          <h2>{t("Backup & restore", "النسخ الاحتياطي والاستعادة")}</h2>
          <p>
            {t(
              "Backups include the database and managed files. Restore creates a safety backup and restarts the application.",
              "تتضمن النسخة قاعدة البيانات والملفات. تنشئ الاستعادة نسخة أمان وتعيد تشغيل البرنامج.",
            )}
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                run(
                  () => api("backup.create"),
                  t("Backup completed", "اكتملت النسخة الاحتياطية"),
                )
              }
            >
              {t("Create backup", "إنشاء نسخة احتياطية")}
            </button>
            <button onClick={() => run(() => api("backup.restore"))}>
              {t("Restore backup…", "استعادة نسخة…")}
            </button>
          </div>
          <ReportPage kind="backups" />
        </section>
      )}
      {can("backup.manage") && <BackupSettings />}
      <section className="panel">
        <h2>{t("About Optical Desktop", "حول البرنامج")}</h2>
        <p>
          {t("Version", "الإصدار")}: {info.data?.version} ·{" "}
          {t("Database version", "إصدار قاعدة البيانات")}:{" "}
          {info.data?.database_version}
        </p>
        <p>
          {t("Data folder", "مجلد البيانات")}:{" "}
          <code>{info.data?.data_folder}</code>
        </p>
        <p>
          {t("Backup folder", "مجلد النسخ")}:{" "}
          <code>{info.data?.backup_folder}</code>
        </p>
        <p>
          F2: {t("Product search", "بحث المنتجات")} · F4:{" "}
          {t("Customer search", "بحث العملاء")} · Esc:{" "}
          {t("Close dialog", "إغلاق الحوار")} · Ctrl+Enter:{" "}
          {t("Complete sale", "إتمام البيع")} · Ctrl+P:{" "}
          {t("Print invoice", "طباعة الفاتورة")}
        </p>
      </section>
      {password && (
        <Modal
          title={t("Change password", "تغيير كلمة المرور")}
          onClose={() => setPassword(false)}
        >
          <RecordForm
            fields={[
              {
                name: "current_password",
                en: "Current password",
                ar: "كلمة المرور الحالية",
                type: "password",
                required: true,
              },
              {
                name: "password",
                en: "New password (10+ characters)",
                ar: "كلمة المرور الجديدة (10 أحرف)",
                type: "password",
                required: true,
              },
            ]}
            onSubmit={async (values) => {
              await api("auth.password", values);
              setPassword(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function CashPage() {
  const { t, can } = useApp();
  const data = useData("cash.get");
  const [action, setAction] = useState<"open" | "close" | "adjust" | null>(
    null,
  );
  return (
    <>
      <PageHeader title={t("Cash drawer", "الخزينة")}>
        <div className="actions">
          {can("cash.manage") && (
            <>
              {data.data?.session ? (
                <>
                  <button onClick={() => setAction("adjust")}>
                    {t("Cash in / out", "إيداع / سحب")}
                  </button>
                  <button
                    className="primary"
                    onClick={() => setAction("close")}
                  >
                    {t("Close drawer", "إغلاق الخزينة")}
                  </button>
                </>
              ) : (
                <button className="primary" onClick={() => setAction("open")}>
                  {t("Open drawer", "فتح الخزينة")}
                </button>
              )}
            </>
          )}
        </div>
      </PageHeader>
      <section className="panel">
        <p>
          {data.data?.session
            ? t("Drawer is open", "الخزينة مفتوحة")
            : t("Drawer is closed", "الخزينة مغلقة")}
        </p>
        <h2>
          <Money value={data.data?.expected} />
        </h2>
        <p>{t("Expected cash balance", "الرصيد النقدي المتوقع")}</p>
      </section>
      <ReportPage kind="cash" />
      {action && (
        <Modal
          title={t("Cash operation", "عملية نقدية")}
          onClose={() => setAction(null)}
        >
          <RecordForm
            fields={[
              {
                name: "amount",
                en:
                  action === "close"
                    ? "Counted cash amount"
                    : action === "open"
                      ? "Opening balance"
                      : "Amount (negative for withdrawal)",
                ar:
                  action === "close"
                    ? "النقدية الفعلية"
                    : action === "open"
                      ? "الرصيد الافتتاحي"
                      : "المبلغ (سالب للسحب)",
                required: true,
              },
              ...(action === "adjust"
                ? [
                    {
                      name: "reason",
                      en: "Reason",
                      ar: "السبب",
                      required: true,
                    },
                  ]
                : []),
            ]}
            onSubmit={async (values) => {
              const value = String(values.amount);
              if (action === "adjust")
                await api("cash.adjust", {
                  amount: value.startsWith("-")
                    ? -minor(value.slice(1))
                    : minor(value),
                  reason: values.reason,
                });
              else
                await api(
                  action === "open" ? "cash.open" : "cash.close",
                  minor(value),
                );
              await client.invalidateQueries();
              setAction(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
