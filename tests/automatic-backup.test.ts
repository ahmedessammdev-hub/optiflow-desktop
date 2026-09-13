import { it, expect, vi } from "vitest";
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../packages/database/database";
import { Application } from "../packages/domain/application";
vi.mock("electron", () => ({ dialog: {} }));
import { BackupManager } from "../apps/desktop/electron/backup-manager";
it("schedules backups, retains automatic copies and preserves manual copies", async () => {
  const folder = mkdtempSync(join(tmpdir(), "optical-auto-"));
  const store = new Store(
    join(folder, "db.sqlite"),
    resolve("packages/database/migrations"),
  );
  try {
    const app = new Application(store);
    const credentials = {
      name: "Owner",
      username: "owner",
      password: "strong-password-123",
    };
    app.auth.setup(credentials);
    app.auth.login(credentials);
    const manager = new BackupManager(app, folder);
    manager.save({
      enabled: true,
      interval_days: 1,
      retain: 2,
      on_close: false,
    });
    const manual = await manager.engine().create(app.auth.require().id);
    await manager.automatic();
    await manager.automatic();
    expect(
      store.get("SELECT count(*) n FROM backup_history WHERE user_id IS NULL")
        ?.n,
    ).toBe(1);
    await manager.automatic(true);
    await manager.automatic(true);
    expect(existsSync(manual)).toBe(true);
    expect(
      readdirSync(join(folder, "backups")).filter((f) =>
        f.endsWith(".opticalbackup"),
      ),
    ).toHaveLength(3);
  } finally {
    store.close();
  }
});
