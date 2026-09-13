import { api, useApp, useData } from "../lib";
export function AttachmentPanel({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { t, can, run } = useApp();
  const data = useData("attachments.list", {
    entity_type: entityType,
    entity_id: entityId,
  });
  const permission = {
    customers: "customers.update",
    products: "products.update",
    expenses: "expenses.create",
    purchase_orders: "purchases.create",
  }[entityType];
  return (
    <section className="panel">
      <div className="section-heading">
        <h3>{t("Images and documents", "الصور والمستندات")}</h3>
        {permission && can(permission) && (
          <button
            onClick={() =>
              run(
                () =>
                  api("attachments.add", {
                    entity_type: entityType,
                    entity_id: entityId,
                  }),
                t("Attachment saved", "تم حفظ المرفق"),
              )
            }
          >
            {t("Add image / PDF", "إضافة صورة / PDF")}
          </button>
        )}
      </div>
      {data.error && <p className="error">{data.error.message}</p>}
      <div className="actions">
        {data.data?.map((row) => (
          <button
            key={String(row.id)}
            onClick={() => run(() => api("attachments.open", row.id))}
          >
            {row.file_name}
          </button>
        ))}
      </div>
    </section>
  );
}
