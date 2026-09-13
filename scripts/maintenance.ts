import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { Store } from "../packages/database/database";
import { Application } from "../packages/domain/application";
import { Backups } from "../packages/database/backup";
import { LegacyImporter } from "../packages/domain/importer";
async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "data-dir": { type: "string" },
      file: { type: "string" },
      username: { type: "string" },
    },
  });
  if (!values["data-dir"])
    throw new Error(
      "Specify --data-dir for a separate maintenance database directory",
    );
  const folder = resolve(values["data-dir"]);
  mkdirSync(folder, { recursive: true });
  const store = new Store(
    join(folder, "optical.sqlite"),
    resolve("packages/database/migrations"),
  );
  try {
    const app = new Application(store),
      backups = new Backups(
        store,
        join(folder, "backups"),
        join(folder, "assets"),
      );
    const command = positionals[0];
    if (command === "migrate") {
      process.stdout.write("Migrations verified and applied\n");
      return;
    }
    if (command === "verify") {
      if (!values.file) throw new Error("Specify --file");
      backups.validate(resolve(values.file));
      process.stdout.write("Backup verified\n");
      return;
    }
    if (!values.username || !process.env.OPTICAL_ADMIN_PASSWORD)
      throw new Error(
        "Provide --username and OPTICAL_ADMIN_PASSWORD for authenticated maintenance",
      );
    app.auth.login({
      username: values.username,
      password: process.env.OPTICAL_ADMIN_PASSWORD,
    });
    app.auth.require("backup.manage");
    if (command === "backup") {
      process.stdout.write(
        (await backups.create(app.auth.require().id)) + "\n",
      );
      return;
    }
    if (command === "import") {
      if (!values.file) throw new Error("Specify --file");
      const backup = await backups.create(app.auth.require().id);
      const report = new LegacyImporter(store, app.auth).import(
        readFileSync(resolve(values.file), "utf8"),
        backup,
      );
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }
    throw new Error("Commands: migrate, verify, backup, import");
  } finally {
    if (store.db.open) store.close();
  }
}
main().catch((error) => {
  process.stderr.write(
    (error instanceof Error ? error.message : String(error)) + "\n",
  );
  process.exitCode = 1;
});
