import { translateValue } from "../../../packages/shared/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useApp } from "./lib";
import { formatCurrency } from "../../../packages/shared/money";
import type { Row } from "../../../packages/shared/schemas";
export function Money({ value }: { value: unknown }) {
  const { settings } = useApp();
  return (
    <span className="money">
      {formatCurrency(Number(value ?? 0), settings.currency, settings.language)}
    </span>
  );
}
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="actions">{children}</div>
    </header>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export type Field = {
  name: string;
  en: string;
  ar: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "datetime-local"
    | "password"
    | "email"
    | "textarea"
    | "select"
    | "checkbox";
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
};
export function RecordForm({
  fields,
  initial = {},
  onSubmit,
  submitLabel,
}: {
  fields: Field[];
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, string | boolean>) => Promise<void>;
  submitLabel?: string;
}) {
  const { t, settings } = useApp();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Record<string, string | boolean>>({
    defaultValues: initial as Record<string, string | boolean>,
  });
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        try {
          setError("");
          await onSubmit(values);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })}
    >
      <div className="form-grid">
        {fields.map((field) => (
          <label
            key={field.name}
            className={field.type === "textarea" ? "wide" : ""}
          >
            <span>
              {t(field.en, field.ar)}
              {field.required ? " *" : ""}
            </span>
            {field.type === "select" ? (
              <select {...register(field.name)} required={field.required}>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {translateValue(option.label, settings.language)}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea {...register(field.name)} required={field.required} />
            ) : (
              <input
                {...register(field.name)}
                type={field.type ?? "text"}
                required={field.required}
                min={field.min}
                max={field.max}
                step={field.step}
                autoComplete={
                  field.type === "password" ? "new-password" : "off"
                }
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={isSubmitting}>
          {isSubmitting
            ? t("Saving…", "جارٍ الحفظ…")
            : (submitLabel ?? t("Save", "حفظ"))}
        </button>
      </div>
    </form>
  );
}
export type Column = {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
};
export function DataTable({
  rows,
  columns,
  actions,
}: {
  rows: Row[];
  columns: Column[];
  actions?: (row: Row) => ReactNode;
}) {
  const { t, settings } = useApp();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            {actions && <th>{t("Actions", "الإجراءات")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={String(row.id)}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.render
                      ? c.render(row)
                      : translateValue(
                          String(row[c.key] ?? "—"),
                          settings.language,
                        )}
                  </td>
                ))}
                {actions && (
                  <td>
                    <div className="row-actions">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length + (actions ? 1 : 0)}
                className="empty"
              >
                {t("No records found.", "لا توجد سجلات.")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function Confirm({
  message,
  onConfirm,
  onClose,
}: {
  message: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t("Confirm action", "تأكيد الإجراء")} onClose={onClose}>
      <p>{message}</p>
      <div className="form-actions">
        <button onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("Confirm", "تأكيد")}
        </button>
      </div>
    </Modal>
  );
}
