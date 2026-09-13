import type { Session, Settings, Page, Row, Prescription } from "./schemas";
import type { Finance } from "../domain/finance";
import type { Queries } from "../domain/queries";
export type Command = keyof ResultMap;
export type Invoice = ReturnType<Finance["invoice"]>;
export type Dashboard = ReturnType<Queries["dashboard"]>;
export type Profile = { customer: Row; prescriptions: Prescription[] };
export type ResultMap = {
  "extensions.save": string;
  "extensions.list": Page;
  "quotes.create": string;
  "quotes.get": ReturnType<
    import("../domain/expansion").Expansion["quoteDetail"]
  >;
  "quotes.deposit": void;
  "quotes.convert": string;
  "quotes.cancel": void;
  "stocktakes.start": string;
  "stocktakes.get": ReturnType<
    import("../domain/expansion").Expansion["stocktakeDetail"]
  >;
  "stocktakes.count": void;
  "stocktakes.post": void;
  "supplier_returns.create": string;
  "branches.list": Row[];
  "branches.active": Row | undefined;
  "branches.select": Row;
  "branches.create": string;
  "branches.stock": Row[];
  "branches.transfer": string;
  "attachments.list": Row[];
  "attachments.add": string | null;
  "attachments.open": void;
  "store.logo": string | null;
  "backup.config": import("../../apps/desktop/electron/backup-manager").BackupConfig;
  "backup.configure": import("../../apps/desktop/electron/backup-manager").BackupConfig;
  "backup.folder": import("../../apps/desktop/electron/backup-manager").BackupConfig;
  "users.update": void;
  "users.reset": void;
  "roles.get": ReturnType<import("../domain/auth").Auth["roles"]>;
  "roles.update": void;
  "purchases.payment": void;
  "purchases.get": ReturnType<
    import("../domain/operations").Operations["purchaseDetail"]
  >;
  "legacy.import": import("../domain/importer").ImportReport | null;
  "setup.status": boolean;
  "setup.create": string;
  "auth.login": Session;
  "auth.logout": void;
  "auth.session": Session | null;
  "auth.password": void;
  "users.create": string;
  "customers.list": Page;
  "customers.save": string;
  "customers.archive": void;
  "customers.profile": Profile;
  "customers.statement": Row[];
  "prescriptions.create": string;
  "products.list": Page;
  "products.save": string;
  "products.archive": void;
  "categories.list": Page;
  "categories.save": string;
  "suppliers.list": Page;
  "suppliers.save": string;
  "suppliers.archive": void;
  "inventory.adjust": void;
  "inventory.low": Row[];
  "sales.create": string;
  "sales.get": Invoice;
  "payments.create": void;
  "payments.reverse": void;
  "returns.create": string;
  "cash.get": { session: Row | null; expected: number };
  "cash.open": string;
  "cash.close": void;
  "cash.adjust": void;
  "expenses.create": string;
  "purchases.create": string;
  "purchases.receive": void;
  "report.list": Page;
  "dashboard.get": Dashboard;
  "settings.get": Settings;
  "settings.save": void;
  "backup.create": string;
  "backup.restore": void;
  "print.preview": string;
  "print.execute": void;
  "print.pdf": string | null;
  "printers.list": { name: string; displayName: string }[];
  "export.csv": string | null;
  "app.info": {
    version: string;
    data_folder: string;
    database_version: number;
    backup_folder: string;
  };
};
export interface DesktopAPI {
  invoke<C extends Command>(command: C, input?: unknown): Promise<ResultMap[C]>;
  onNotification(callback: (message: string) => void): () => void;
}
declare global {
  interface Window {
    optical: DesktopAPI;
  }
}
