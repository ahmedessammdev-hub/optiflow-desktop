import { useState } from "react";
import { api, useApp, useData, client } from "../lib";
import { RecordForm } from "../components";
import type { ImportReport } from "../../../../packages/domain/importer";
export function BackupSettings() {
  const { t, run } = useApp();
  const config = useData("backup.config");
  const [report, setReport] = useState<ImportReport | null>(null);
  return (
    <section className="panel">
      <h2>
        {t("Backup schedule and data import", "جدولة النسخ واستيراد البيانات")}
      </h2>
      <p>{config.data?.folder}</p>
      <button onClick={() => run(() => api("backup.folder"))}>
        {t("Choose backup folder", "اختيار مجلد النسخ")}
      </button>
      {config.data && (
        <RecordForm
          key={JSON.stringify(config.data)}
          initial={config.data}
          fields={[
            {
              name: "enabled",
              en: "Enable automatic backup",
              ar: "تفعيل النسخ التلقائي",
              type: "checkbox",
            },
            {
              name: "interval_days",
              en: "Backup every N days",
              ar: "النسخ كل عدد أيام",
              type: "number",
              min: 1,
              max: 30,
              required: true,
            },
            {
              name: "retain",
              en: "Automatic copies to keep (manual backups remain)",
              ar: "عدد النسخ التلقائية المحتفظ بها (اليدوية تبقى)",
              type: "number",
              min: 2,
              max: 100,
              required: true,
            },
            {
              name: "on_close",
              en: "Back up on application close",
              ar: "النسخ عند إغلاق البرنامج",
              type: "checkbox",
            },
          ]}
          onSubmit={async (v) => {
            await api("backup.configure", {
              ...v,
              interval_days: Number(v.interval_days),
              retain: Number(v.retain),
            });
            await client.invalidateQueries();
          }}
        />
      )}
      <h3>{t("Import legacy JSON", "استيراد بيانات JSON القديمة")}</h3>
      <p>
        {t(
          "Keep a backup of the old system. A safety backup of this database is created before importing. Invalid data rolls back the import.",
          "احتفظ بنسخة من النظام القديم. تُنشأ نسخة أمان لقاعدة البيانات الحالية قبل الاستيراد. تُلغى العملية عند وجود بيانات غير صالحة.",
        )}
      </p>
      <button
        onClick={async () => {
          const result = await run(() => api("legacy.import"));
          if (result) setReport(result);
        }}
      >
        {t("Choose legacy export…", "اختيار ملف التصدير…")}
      </button>
      {report && (
        <div role="status">
          <p>
            {t("Imported", "تم الاستيراد")}: {report.imported} ·{" "}
            {t("Skipped", "تم التخطي")}: {report.skipped} ·{" "}
            {t("Duplicates", "مكرر")}: {report.duplicate}
          </p>
          <ul>
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
