import { useState } from "react";
import { api, client, useApp, useData } from "../lib";
import { DataTable, Modal, RecordForm } from "../components";
import type { Row } from "../../../../packages/shared/schemas";
export function Administration() {
  const { t } = useApp();
  const users = useData("report.list", {
    kind: "users",
    query: { page_size: 100 },
  });
  const roles = useData("roles.get");
  const [user, setUser] = useState<Row | null>(null);
  const [reset, setReset] = useState<Row | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [rights, setRights] = useState<string[]>([]);
  return (
    <section className="panel">
      <h2>{t("Account access and roles", "إدارة الحسابات والأدوار")}</h2>
      <DataTable
        rows={users.data?.rows ?? []}
        columns={[
          { key: "name", label: t("Name", "الاسم") },
          { key: "roles", label: t("Role", "الدور") },
          { key: "archived_at", label: t("Archived at", "تاريخ الأرشفة") },
        ]}
        actions={(r) => (
          <>
            <button onClick={() => setUser(r)}>
              {t("Edit access", "تعديل الوصول")}
            </button>
            <button onClick={() => setReset(r)}>
              {t("Reset password", "إعادة تعيين كلمة المرور")}
            </button>
          </>
        )}
      />
      <div className="actions">
        {roles.data?.roles
          .filter((r) => r.id !== "admin")
          .map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setRole(r.id);
                setRights(r.permissions);
              }}
            >
              {t("Edit role", "تعديل الدور")}: {r.name}
            </button>
          ))}
      </div>
      {user && (
        <Modal
          title={t("Edit user", "تعديل المستخدم")}
          onClose={() => setUser(null)}
        >
          <RecordForm
            initial={{
              name: user.name,
              role: user.roles,
              archived: Boolean(user.archived_at),
            }}
            fields={[
              { name: "name", en: "Name", ar: "الاسم", required: true },
              {
                name: "role",
                en: "Role",
                ar: "الدور",
                type: "select",
                options: [
                  "admin",
                  "manager",
                  "sales",
                  "inventory",
                  "cashier",
                ].map((r) => ({ value: r, label: r })),
              },
              {
                name: "archived",
                en: "Archive account",
                ar: "أرشفة الحساب",
                type: "checkbox",
              },
            ]}
            onSubmit={async (v) => {
              await api("users.update", { id: user.id, ...v });
              await client.invalidateQueries();
              setUser(null);
            }}
          />
        </Modal>
      )}
      {reset && (
        <Modal
          title={t("Reset password", "إعادة تعيين كلمة المرور")}
          onClose={() => setReset(null)}
        >
          <RecordForm
            fields={[
              {
                name: "password",
                en: "New password (10+ characters)",
                ar: "كلمة المرور الجديدة (10 أحرف على الأقل)",
                type: "password",
                required: true,
              },
            ]}
            onSubmit={async (v) => {
              await api("users.reset", { id: reset.id, ...v });
              setReset(null);
            }}
          />
        </Modal>
      )}
      {role && (
        <Modal
          title={t("Role permissions", "صلاحيات الدور")}
          onClose={() => setRole(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await api("roles.update", { role, permissions: rights });
              await client.invalidateQueries();
              setRole(null);
            }}
          >
            <div className="form-grid">
              {roles.data?.permissions.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={rights.includes(p)}
                    onChange={(e) =>
                      setRights(
                        e.target.checked
                          ? [...rights, p]
                          : rights.filter((r) => r !== p),
                      )
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
            <button className="primary">{t("Save", "حفظ")}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
