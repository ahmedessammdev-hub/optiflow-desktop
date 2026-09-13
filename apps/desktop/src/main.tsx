import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppProvider, api, client, useApp, useData } from "./lib";
import { CatalogPage } from "./features/catalog";
import { POS } from "./features/pos";
import { ReportPage } from "./features/reports";
import { SettingsPage, CashPage } from "./features/settings";
import type { Session } from "../../../packages/shared/schemas";
import "./styles.css";
const DashboardPage = lazy(() =>
  import("./features/dashboard").then((m) => ({ default: m.DashboardPage })),
);
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>Unable to display this screen</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>Reload application</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Login({ onLogin }: { onLogin: (user: Session) => void }) {
  const setup = useData("setup.status");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-layout">
      <section className="login-brand">
        <div className="brand-symbol">◎—◎</div>
        <h1>Optical</h1>
        <p>Your shop. In focus.</p>
        <p lang="ar" dir="rtl">
          إدارة متكاملة لمحل البصريات
        </p>
      </section>
      <section className="login-panel">
        <h2>{setup.data ? "Set up your shop" : "Welcome back"}</h2>
        <p>
          {setup.data
            ? "Create the first administrator. Your database starts empty."
            : "Sign in to continue your work."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              if (setup.data)
                await api("setup.create", {
                  name: form.get("name"),
                  username: form.get("username"),
                  password: form.get("password"),
                });
              const user = await api("auth.login", {
                username: form.get("username"),
                password: form.get("password"),
              });
              await client.invalidateQueries();
              onLogin(user);
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {setup.data && (
            <label>
              Name / الاسم
              <input name="name" required autoComplete="name" />
            </label>
          )}
          <label>
            Username / اسم المستخدم
            <input
              name="username"
              required
              minLength={3}
              autoComplete="username"
            />
          </label>
          <label>
            Password / كلمة المرور
            <input
              name="password"
              type="password"
              minLength={setup.data ? 10 : undefined}
              required
              autoComplete={setup.data ? "new-password" : "current-password"}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || setup.isLoading}>
            {busy
              ? "Please wait…"
              : setup.data
                ? "Create administrator"
                : "Sign in"}
          </button>
        </form>
        <small>Local desktop · بياناتك محفوظة على هذا الجهاز</small>
      </section>
    </main>
  );
}
const navigation = [
  ["dashboard", "Overview", "نظرة عامة", "dashboard.view"],
  ["pos", "Point of sale", "نقطة البيع", "sales.create"],
  ["customers", "Customers", "العملاء", "customers.view"],
  ["products", "Products", "المنتجات", "products.view"],
  ["categories", "Categories", "الفئات", "products.view"],
  ["inventory", "Inventory", "المخزون", "inventory.view"],
  ["suppliers", "Suppliers", "الموردون", "purchases.view"],
  ["purchases", "Purchases", "المشتريات", "purchases.view"],
  ["sales", "Invoices", "الفواتير", "sales.view"],
  ["payments", "Payments", "الدفعات", "payments.view"],
  ["debts", "Customer debts", "المديونيات", "reports.view"],
  ["cash", "Cash drawer", "الخزينة", "cash.view"],
  ["expenses", "Expenses", "المصروفات", "expenses.view"],
  ["returns", "Returns", "المرتجعات", "sales.view"],
  ["reports", "Reports", "التقارير", "reports.view"],
  ["users", "Users", "المستخدمون", "users.manage"],
  ["audit", "Audit log", "سجل التدقيق", "audit.view"],
  ["settings", "Settings & help", "الإعدادات", ""],
] as const;
function Shell({ logout }: { logout: () => void }) {
  const { t, can, settings, user } = useApp();
  const available = navigation.filter((n) => !n[3] || can(n[3]));
  const [page, setPage] = useState<string>(available[0][0]);
  let screen: ReactNode;
  switch (page) {
    case "dashboard":
      screen = <DashboardPage />;
      break;
    case "pos":
      screen = <POS />;
      break;
    case "customers":
    case "products":
    case "categories":
    case "suppliers":
      screen = <CatalogPage key={page} kind={page} />;
      break;
    case "cash":
      screen = <CashPage />;
      break;
    case "settings":
      screen = <SettingsPage />;
      break;
    case "reports":
      screen = <ReportPage kind="sales" allowSelect />;
      break;
    default:
      screen = (
        <ReportPage
          key={page}
          kind={
            page as
              | "sales"
              | "payments"
              | "expenses"
              | "inventory"
              | "purchases"
              | "returns"
              | "audit"
              | "debts"
              | "users"
          }
        />
      );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>◎—◎</span>
          <div>
            <strong>
              {settings.language === "ar"
                ? settings.store_name_ar || settings.store_name
                : settings.store_name}
            </strong>
            <small>OPTICAL DESKTOP</small>
          </div>
        </div>
        <nav>
          {available.map(([key, en, ar]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => setPage(key)}
            >
              <span className="nav-dot" />
              {t(en, ar)}
            </button>
          ))}
        </nav>
        <div className="user-panel">
          <strong>{user.name}</strong>
          <button onClick={logout}>{t("Sign out", "تسجيل الخروج")}</button>
        </div>
      </aside>
      <main className="workspace">
        <div className="topbar">
          <span>{t("Shop workspace", "مساحة عمل المحل")}</span>
          <span className="local-status">
            <i />
            {t("Local database", "قاعدة بيانات محلية")}
          </span>
        </div>
        <div className="page-content">
          <Suspense fallback={<p>{t("Loading…", "جارٍ التحميل…")}</p>}>
            {screen}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
function Root() {
  const [user, setUser] = useState<Session | null>(null);
  return user ? (
    <AppProvider user={user}>
      <Shell
        logout={() => {
          void api("auth.logout").finally(() => {
            client.clear();
            setUser(null);
          });
        }}
      />
    </AppProvider>
  ) : (
    <Login onLogin={setUser} />
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <QueryClientProvider client={client}>
      <Root />
    </QueryClientProvider>
  </ErrorBoundary>,
);
