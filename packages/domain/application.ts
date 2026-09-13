import { z } from "zod";
import { Store } from "../database/database";
import { Auth } from "./auth";
import { Catalog } from "./catalog";
import { Finance } from "./finance";
import { Operations } from "./operations";
import { Queries, type Report } from "./queries";
export class Application {
  readonly auth: Auth;
  readonly catalog: Catalog;
  readonly finance: Finance;
  readonly operations: Operations;
  readonly queries: Queries;
  constructor(readonly store: Store) {
    this.auth = new Auth(store);
    this.catalog = new Catalog(store, this.auth);
    this.finance = new Finance(store, this.auth);
    this.operations = new Operations(store, this.auth);
    this.queries = new Queries(store, this.auth);
  }
  execute(command: string, input: unknown): unknown {
    switch (command) {
      case "users.update":
        return this.auth.updateUser(input);
      case "users.reset":
        return this.auth.resetPassword(input);
      case "roles.get":
        return this.auth.roles();
      case "roles.update":
        return this.auth.updateRole(input);
      case "purchases.payment":
        return this.operations.paySupplier(input);
      case "purchases.get":
        return this.operations.purchaseDetail(input);
      case "setup.status":
        return this.auth.needsSetup();
      case "setup.create":
        return this.auth.setup(input);
      case "auth.login":
        return this.auth.login(input);
      case "auth.logout":
        return this.auth.logout();
      case "auth.session":
        return this.auth.session();
      case "auth.password":
        return this.auth.changePassword(input);
      case "users.create":
        return this.auth.manage(input);
      case "customers.profile":
        return this.catalog.profile(input);
      case "customers.statement":
        return this.queries.statement(input);
      case "prescriptions.create":
        return this.catalog.prescription(input);
      case "customers.list":
      case "products.list":
      case "suppliers.list":
      case "categories.list":
        return this.catalog.list(
          command.split(".")[0] as
            "customers" | "products" | "suppliers" | "categories",
          input,
        );
      case "customers.save":
      case "products.save":
      case "suppliers.save":
      case "categories.save":
        return this.catalog.save(
          command.split(".")[0] as
            "customers" | "products" | "suppliers" | "categories",
          input,
        );
      case "customers.archive":
      case "products.archive":
      case "suppliers.archive":
        return this.catalog.archive(
          command.split(".")[0] as "customers" | "products" | "suppliers",
          input,
        );
      case "inventory.adjust":
        return this.operations.adjust(input);
      case "inventory.low":
        return this.queries.lowStock();
      case "sales.create":
        return this.finance.checkout(input);
      case "sales.get":
        return this.finance.invoice(input);
      case "payments.create":
        return this.finance.payment(input);
      case "payments.reverse":
        return this.finance.reverse(input);
      case "returns.create":
        return this.finance.returnItems(input);
      case "cash.get":
        return this.operations.cash();
      case "cash.open":
        return this.operations.openCash(input);
      case "cash.close":
        return this.operations.closeCash(input);
      case "cash.adjust":
        return this.operations.cashAdjust(input);
      case "expenses.create":
        return this.operations.expense(input);
      case "purchases.create":
        return this.operations.purchase(input);
      case "purchases.receive":
        return this.operations.receive(input);
      case "settings.get":
        return this.queries.settings();
      case "settings.save":
        return this.queries.saveSettings(input);
      case "dashboard.get":
        return this.queries.dashboard(input);
      case "report.list": {
        const data = z
          .object({
            kind: z.enum([
              "sales",
              "payments",
              "expenses",
              "inventory",
              "purchases",
              "returns",
              "cash",
              "audit",
              "debts",
              "users",
              "backups",
              "sessions",
              "profit",
              "product_performance",
              "category_performance",
              "stock",
              "low_stock",
              "supplier_balances",
            ]),
            query: z.unknown(),
          })
          .parse(input);
        return this.queries.list(data.kind as Report, data.query);
      }
      default:
        throw new Error("Unknown command");
    }
  }
}
