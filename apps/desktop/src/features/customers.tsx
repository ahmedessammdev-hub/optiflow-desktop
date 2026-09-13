import { AttachmentPanel } from "./attachments";
import { useState } from "react";
import { api, client, useApp, useData } from "../lib";
import { DataTable, Modal, Money, RecordForm, type Field } from "../components";
import { PrescriptionView } from "../../../../packages/ui/PrescriptionView";
import { InvoiceDetail } from "./invoices";
export function CustomerProfile({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const { t, settings, can, run } = useApp();
  const profile = useData("customers.profile", customerId);
  const [salesPage, setSalesPage] = useState(1);
  const sales = useData(
    "report.list",
    {
      kind: "sales",
      query: { customer_id: customerId, page: salesPage, page_size: 20 },
    },
    can("sales.view"),
  );
  const [newPrescription, setNewPrescription] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  return (
    <Modal
      title={String(
        profile.data?.customer.name ?? t("Customer profile", "ملف العميل"),
      )}
      onClose={onClose}
    >
      {profile.error && <p className="error">{profile.error.message}</p>}
      {profile.data && (
        <>
          <div className="profile-summary">
            <div>
              <p>
                {profile.data.customer.phone} · {profile.data.customer.email}
              </p>
              <p>
                {profile.data.customer.address} {profile.data.customer.city}
              </p>
              <p>{profile.data.customer.notes}</p>
            </div>
            <div className="actions">
              {can("prescriptions.create") && (
                <button
                  className="primary"
                  onClick={() => setNewPrescription(true)}
                >
                  {t("New prescription", "وصفة جديدة")}
                </button>
              )}
              {can("payments.view") && (
                <button
                  onClick={() =>
                    run(() =>
                      api("print.preview", {
                        kind: "statement",
                        id: customerId,
                      }),
                    )
                  }
                >
                  {t("Print statement", "طباعة كشف الحساب")}
                </button>
              )}
            </div>
          </div>
          <AttachmentPanel entityType="customers" entityId={customerId} />
          <h3>{t("Prescription history", "سجل الوصفات الطبية")}</h3>
          {profile.data.prescriptions.length ? (
            profile.data.prescriptions.map((p, index) => (
              <div className="history-card" key={p.id}>
                <div className="section-heading">
                  <h4>
                    {index === 0
                      ? t("Current prescription", "الوصفة الحالية")
                      : t("Previous prescription", "وصفة سابقة")}
                  </h4>
                  <button
                    onClick={() =>
                      run(() =>
                        api("print.preview", {
                          kind: "prescription",
                          id: p.id,
                        }),
                      )
                    }
                  >
                    {t("Print preview", "معاينة الطباعة")}
                  </button>
                </div>
                <PrescriptionView
                  prescription={p}
                  language={settings.language}
                />
              </div>
            ))
          ) : (
            <p className="empty">
              {t("No prescriptions recorded.", "لا توجد وصفات مسجلة.")}
            </p>
          )}
          {can("sales.view") && (
            <>
              <h3>{t("Invoices and balances", "الفواتير والأرصدة")}</h3>
              <DataTable
                rows={sales.data?.rows ?? []}
                columns={[
                  { key: "invoice_number", label: t("Invoice", "الفاتورة") },
                  { key: "created_at", label: t("Date", "التاريخ") },
                  {
                    key: "total",
                    label: t("Total", "الإجمالي"),
                    render: (r) => <Money value={r.total} />,
                  },
                  {
                    key: "balance",
                    label: t("Balance", "الرصيد"),
                    render: (r) => <Money value={r.balance} />,
                  },
                ]}
                actions={(r) => (
                  <button onClick={() => setInvoice(String(r.id))}>
                    {t("Open", "فتح")}
                  </button>
                )}
              />
              <div className="pagination">
                <button
                  disabled={salesPage === 1}
                  onClick={() => setSalesPage(salesPage - 1)}
                >
                  {t("Previous", "السابق")}
                </button>
                <span>{salesPage}</span>
                <button
                  disabled={salesPage * 20 >= (sales.data?.total ?? 0)}
                  onClick={() => setSalesPage(salesPage + 1)}
                >
                  {t("Next", "التالي")}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {newPrescription && (
        <PrescriptionForm
          customerId={customerId}
          onClose={() => setNewPrescription(false)}
        />
      )}
      {invoice && (
        <InvoiceDetail saleId={invoice} onClose={() => setInvoice(null)} />
      )}
    </Modal>
  );
}
export function PrescriptionForm({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const { t } = useApp();
  const fields: Field[] = [
    {
      name: "exam_date",
      en: "Exam date",
      ar: "تاريخ الفحص",
      type: "date",
      required: true,
    },
    ...(["od", "os"] as const).flatMap((eye) =>
      (["sph", "cyl", "axis", "add", "pd", "prism"] as const).map((field) => ({
        name: `${eye}_${field}`,
        en: `${eye.toUpperCase()} ${field.toUpperCase()}`,
        ar: `${eye.toUpperCase()} ${field.toUpperCase()}`,
        type: "number" as const,
        step: field === "axis" ? "1" : "0.01",
      })),
    ),
    { name: "ipd", en: "IPD", ar: "IPD", type: "number", step: "0.01" },
    {
      name: "near_pd",
      en: "Near PD",
      ar: "PD القريب",
      type: "number",
      step: "0.01",
    },
    { name: "doctor_name", en: "Doctor", ar: "الطبيب" },
    { name: "optometrist_name", en: "Optometrist", ar: "أخصائي البصريات" },
    { name: "notes", en: "Notes", ar: "ملاحظات", type: "textarea" },
  ];
  return (
    <Modal title={t("New prescription", "وصفة طبية جديدة")} onClose={onClose}>
      <RecordForm
        fields={fields}
        onSubmit={async (values) => {
          const number = (key: string) =>
            values[key] === "" || values[key] === undefined
              ? null
              : Number(values[key]);
          const eye = (key: string) => ({
            sph: number(`${key}_sph`),
            cyl: number(`${key}_cyl`),
            axis: number(`${key}_axis`),
            add: number(`${key}_add`),
            pd: number(`${key}_pd`),
            prism: number(`${key}_prism`),
          });
          await api("prescriptions.create", {
            customer_id: customerId,
            exam_date: values.exam_date,
            od: eye("od"),
            os: eye("os"),
            ipd: number("ipd"),
            near_pd: number("near_pd"),
            doctor_name: values.doctor_name,
            optometrist_name: values.optometrist_name,
            notes: values.notes,
          });
          await client.invalidateQueries();
          onClose();
        }}
      />
    </Modal>
  );
}
