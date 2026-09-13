import { app, BrowserWindow, ipcMain, dialog, session } from "electron";
import { join, resolve } from "node:path";
import {
  mkdirSync,
  appendFileSync,
  statSync,
  existsSync,
  renameSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { translatedError } from "../../../packages/shared/i18n";
import { z } from "zod";
import { Attachments } from "./attachments";
import { exportCsv } from "./export";
import { LegacyImporter } from "../../../packages/domain/importer";
import { Store } from "../../../packages/database/database";
import { Application } from "../../../packages/domain/application";
import { BackupManager } from "./backup-manager";
import {
  PrintDocument,
  printCSS,
  type PrintData,
} from "../../../packages/ui/PrintDocument";
import { id, type Prescription } from "../../../packages/shared/schemas";
let mainWindow: BrowserWindow;
let service: Application;
let backups: BackupManager;
let dataFolder: string;
let printWindow: BrowserWindow | null = null;
let printHtml = "";
let attachments: Attachments;
function log(message: string) {
  const dir = join(dataFolder, "logs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "application.log");
  if (existsSync(file) && statSync(file).size > 2_000_000)
    renameSync(file, join(dir, `application-${Date.now()}.log`));
  appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
}
function secure(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
}
async function preview(input: unknown) {
  service.auth.require();
  const request = z
    .object({
      kind: z.enum([
        "invoice",
        "prescription",
        "comprehensive",
        "statement",
        "purchase",
        "return",
      ]),
      id,
    })
    .parse(input);
  let data: PrintData = { kind: request.kind };
  if (request.kind === "invoice" || request.kind === "comprehensive")
    data = { ...data, invoice: service.finance.invoice(request.id) };
  else if (request.kind === "purchase") {
    const p = service.operations.purchaseDetail(request.id);
    data = {
      ...data,
      document: {
        number: String(p.purchase.invoice_number),
        date: String(p.purchase.created_at),
        party: JSON.parse(String(p.purchase.supplier_snapshot)).name,
        lines: p.items.map((i) => ({
          id: i.id,
          name: JSON.parse(String(i.product_snapshot)).name,
          quantity: i.quantity,
          amount: Number(i.quantity) * Number(i.unit_cost),
        })),
        total: Number(p.purchase.total),
        paid: Number(p.purchase.paid),
        notes: String(p.purchase.notes),
      },
    };
  } else if (request.kind === "return") {
    service.auth.require("sales.view");
    const r = service.store.get("SELECT * FROM returns WHERE id=?", request.id);
    if (!r) throw new Error("Return not found");
    const invoice = service.finance.invoice(r.sale_id);
    data = {
      ...data,
      document: {
        number: String(invoice.sale.invoice_number),
        date: String(r.created_at),
        party: JSON.parse(String(invoice.sale.customer_snapshot)).name,
        lines: service.store.all(
          "SELECT ri.id,si.product_name name,ri.quantity,ri.amount FROM return_items ri JOIN sale_items si ON si.id=ri.sale_item_id WHERE ri.return_id=?",
          request.id,
        ),
        total: Number(r.total),
        paid: Number(
          service.store.get(
            "SELECT COALESCE(sum(amount),0) n FROM refunds WHERE return_id=?",
            request.id,
          )?.n,
        ),
        notes: String(r.reason),
      },
    };
  } else if (request.kind === "statement")
    data = {
      ...data,
      customer: service.catalog.profile(request.id).customer,
      statement: service.queries.statement(request.id),
    };
  else {
    service.auth.require("prescriptions.view");
    const row = service.store.get(
      "SELECT * FROM prescriptions WHERE id=?",
      request.id,
    );
    if (!row) throw new Error("Prescription not found");
    const prescription = {
      ...JSON.parse(String(row.data)),
      id: row.id,
      created_by: row.created_by,
      created_at: row.created_at,
    } as Prescription;
    data = {
      ...data,
      prescription,
      customer: service.catalog.profile(prescription.customer_id).customer,
    };
  }
  const settings = {
    ...service.queries.settings(),
    logo_data_url: attachments.logoData() ?? undefined,
  };
  printHtml =
    '<!DOCTYPE html><html lang="' +
    settings.language +
    '"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:"><style>' +
    printCSS +
    `@page{size:${settings.paper === "80mm" ? "80mm auto" : settings.paper};margin:${settings.margin}mm}` +
    "</style></head><body>" +
    renderToStaticMarkup(createElement(PrintDocument, { data, settings })) +
    "</body></html>";
  if (printWindow && !printWindow.isDestroyed()) printWindow.close();
  printWindow = new BrowserWindow({
    width: 850,
    height: 900,
    title: settings.language === "ar" ? "معاينة الطباعة" : "Print preview",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  secure(printWindow);
  await printWindow.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(printHtml),
  );
  return "Preview opened";
}
async function command(name: string, input: unknown): Promise<unknown> {
  switch (name) {
    case "attachments.list":
      return attachments.list(input);
    case "attachments.add":
      return attachments.add(mainWindow, input);
    case "attachments.open":
      return attachments.open(input);
    case "store.logo":
      return attachments.logoData();
    case "backup.config":
      return backups.get();
    case "backup.configure":
      return backups.save(input);
    case "backup.folder":
      return backups.choose(mainWindow);
    case "backup.create": {
      const user = service.auth.require("backup.manage");
      const file = await backups.engine().create(user.id);
      log("Backup completed");
      return file;
    }
    case "backup.restore": {
      const user = service.auth.require("backup.manage");
      const file = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [{ name: "Optical backup", extensions: ["opticalbackup"] }],
      });
      if (file.canceled) return;
      backups.engine().validate(file.filePaths[0]);
      const confirm = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["Cancel", "Restore backup"],
        defaultId: 0,
        cancelId: 0,
        message:
          "Restore this backup? A safety backup will be created. The application will restart.",
      });
      if (confirm.response !== 1) return;
      await backups.engine().restore(file.filePaths[0], user.id);
      log("Restore completed");
      app.relaunch();
      app.exit(0);
      return;
    }
    case "print.preview":
      return preview(input);
    case "printers.list":
      service.auth.require();
      return mainWindow.webContents.getPrintersAsync();
    case "print.execute": {
      service.auth.require();
      if (!printWindow || printWindow.isDestroyed())
        throw new Error("Open a print preview first");
      const settings = service.queries.settings();
      await new Promise<void>((resolve, reject) =>
        printWindow!.webContents.print(
          {
            silent: false,
            printBackground: true,
            copies: settings.copies,
            deviceName: settings.default_printer || undefined,
          },
          (success, reason) =>
            success ? resolve() : reject(new Error(reason)),
        ),
      );
      return;
    }
    case "print.pdf": {
      service.auth.require();
      if (!printWindow || printWindow.isDestroyed())
        throw new Error("Open a print preview first");
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: "document.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) return null;
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      });
      writeFileSync(result.filePath, pdf);
      return result.filePath;
    }
    case "export.csv":
      return exportCsv(service, mainWindow, input);
    case "legacy.import": {
      const user = service.auth.require("backup.manage");
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [{ name: "Legacy JSON export", extensions: ["json"] }],
      });
      if (result.canceled) return null;
      const file = result.filePaths[0];
      if (statSync(file).size > 100_000_000)
        throw new Error("Export exceeds size limit");
      const safety = await backups.engine().create(user.id);
      const report = new LegacyImporter(service.store, service.auth).import(
        readFileSync(file, "utf8"),
        safety,
      );
      log("Legacy import completed");
      return report;
    }
    case "app.info":
      service.auth.require();
      return {
        version: app.getVersion(),
        data_folder: dataFolder,
        database_version: service.store.all("SELECT * FROM schema_migrations")
          .length,
        backup_folder: backups.config().folder,
      };
    default:
      return service.execute(name, input);
  }
}
const explicitDataDirectory = app.commandLine.getSwitchValue("user-data-dir");
if (explicitDataDirectory) {
  mkdirSync(resolve(explicitDataDirectory), { recursive: true });
  app.setPath("userData", resolve(explicitDataDirectory));
}
if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      dataFolder =
        process.env.OPTICAL_TEST_DATA && !app.isPackaged
          ? process.env.OPTICAL_TEST_DATA
          : app.getPath("userData");
      mkdirSync(dataFolder, { recursive: true });
      try {
        service = new Application(
          new Store(
            join(dataFolder, "optical.sqlite"),
            app.isPackaged
              ? join(process.resourcesPath, "migrations")
              : join(app.getAppPath(), "packages/database/migrations"),
          ),
        );
        backups = new BackupManager(service, dataFolder);
        attachments = new Attachments(service, join(dataFolder, "assets"));
        log("Startup and migrations completed");
      } catch (error) {
        log(`Startup failure: ${String(error)}`);
        dialog.showErrorBox("Optical could not start", String(error));
        app.quit();
        return;
      }
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: "#f4f7fa",
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      secure(mainWindow);
      const entry = pathToFileURL(
        join(app.getAppPath(), "dist/index.html"),
      ).href;
      let queue: Promise<unknown> = Promise.resolve();
      ipcMain.handle(
        "optical:command",
        (event, name: unknown, input: unknown) => {
          if (
            event.sender !== mainWindow.webContents ||
            event.senderFrame !== mainWindow.webContents.mainFrame ||
            event.senderFrame.url !== entry
          )
            return { ok: false, error: "Invalid IPC sender" };
          const task = queue.then(async () => {
            try {
              if (typeof name !== "string" || name.length > 100)
                throw new Error("Invalid command");
              return { ok: true, data: await command(name, input) };
            } catch (error) {
              const message =
                error instanceof z.ZodError
                  ? "Invalid input: " +
                    error.issues
                      .map((i) => `${i.path.join(".")}: ${i.message}`)
                      .join(";")
                  : error instanceof Error
                    ? error.message
                    : "Operation failed";
              log(`Command ${String(name)} failed: ${message}`);
              return {
                ok: false,
                error: translatedError(
                  message,
                  service.queries.readSettings().language,
                ),
              };
            }
          });
          queue = task.catch(() => undefined);
          return task;
        },
      );
      await mainWindow.loadURL(entry);
      const automatic = () => {
        queue = queue
          .then(() => backups.automatic())
          .then((created) => {
            if (created)
              mainWindow.webContents.send(
                "optical:notification",
                service.queries.readSettings().language === "ar"
                  ? "اكتملت النسخة الاحتياطية التلقائية"
                  : "Automatic backup completed",
              );
          })
          .catch((error) => {
            log("Automatic backup failed: " + String(error));
            mainWindow.webContents.send(
              "optical:notification",
              service.queries.readSettings().language === "ar"
                ? `فشل النسخ الاحتياطي التلقائي: ${String(error)}`
                : `Automatic backup failed: ${String(error)}`,
            );
          });
      };
      automatic();
      const timer = setInterval(automatic, 60000);
      timer.unref();
      let quitting = false;
      app.on("before-quit", (event) => {
        if (quitting) return;
        if (backups.config().on_close) {
          event.preventDefault();
          queue = queue
            .then(() => backups.automatic(true))
            .catch((error) => {
              log("Closing backup failed: " + String(error));
              dialog.showErrorBox(
                service.queries.readSettings().language === "ar"
                  ? "فشل النسخ الاحتياطي عند الإغلاق"
                  : "Closing backup failed",
                String(error),
              );
            })
            .finally(() => {
              quitting = true;
              app.quit();
            });
        }
      });
      app.on("window-all-closed", () => app.quit());
    })
    .catch((error) => {
      dialog.showErrorBox("Startup failure", String(error));
      app.quit();
    });
