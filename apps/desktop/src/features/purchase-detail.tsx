import { AttachmentPanel } from "./attachments";
import { useState } from "react";
import { api, client, useApp, useData } from "../lib";
import { DataTable, Modal, Money, RecordForm } from "../components";
import { minor } from "../../../../packages/shared/money";
import { methods } from "../../../../packages/shared/schemas";
export function PurchaseDetail({
  purchaseId,
  onClose,
}: {
  purchaseId: string;
  onClose: () => void;
}) {
  const { t, can, run } = useApp();
  const data = useData("purchases.get", purchaseId);
  const [payment, setPayment] = useState(false);
  const p = data.data?.purchase;
  return (
    <Modal title={t("Purchase details", "تفاصيل المشتريات")} onClose={onClose}>
      {p && (
        <>
          <h3>{p.invoice_number}</h3>
          <AttachmentPanel entityType="purchase_orders" entityId={purchaseId} />
          <p>
            {t("Outstanding balance", "الرصيد المستحق")}:{" "}
            <Money value={Number(p.total) - Number(p.paid)} />
          </p>
          <DataTable
            rows={
              data.data?.items.map((i) => ({
                ...i,
                name: JSON.parse(String(i.product_snapshot)).name,
              })) ?? []
            }
            columns={[
              { key: "name", label: t("Product", "المنتج") },
              { key: "quantity", label: t("Quantity", "الكمية") },
              {
                key: "unit_cost",
                label: t("Unit cost", "التكلفة"),
                render: (r) => <Money value={r.unit_cost} />,
              },
            ]}
          />
          <h3>{t("Supplier payments", "دفعات المورد")}</h3>
          <DataTable
            rows={data.data?.payments ?? []}
            columns={[
              {
                key: "amount",
                label: t("Amount", "المبلغ"),
                render: (r) => <Money value={r.amount} />,
              },
              { key: "method", label: t("Method", "الطريقة") },
              { key: "created_at", label: t("Date", "التاريخ") },
            ]}
          />
          <div className="actions">
            {can("purchases.create") && Number(p.paid) < Number(p.total) && (
              <button onClick={() => setPayment(true)}>
                {t("Record supplier payment", "تسجيل دفعة للمورد")}
              </button>
            )}
            <button
              onClick={() =>
                run(() =>
                  api("print.preview", { kind: "purchase", id: purchaseId }),
                )
              }
            >
              {t("Print preview", "معاينة الطباعة")}
            </button>
          </div>
        </>
      )}
      {payment && (
        <Modal
          title={t("Supplier payment", "دفعة المورد")}
          onClose={() => setPayment(false)}
        >
          <RecordForm
            initial={{ method: "cash" }}
            fields={[
              { name: "amount", en: "Amount", ar: "المبلغ", required: true },
              {
                name: "method",
                en: "Method",
                ar: "الطريقة",
                type: "select",
                options: methods.map((m) => ({ value: m, label: m })),
              },
              { name: "notes", en: "Notes", ar: "ملاحظات" },
            ]}
            onSubmit={async (v) => {
              await api("purchases.payment", {
                purchase_id: purchaseId,
                ...v,
                amount: minor(String(v.amount)),
              });
              await client.invalidateQueries();
              setPayment(false);
            }}
          />
        </Modal>
      )}
    </Modal>
  );
}
