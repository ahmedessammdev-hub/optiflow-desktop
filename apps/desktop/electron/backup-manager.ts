import { dialog, type BrowserWindow } from "electron";
import { join, basename } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { z } from "zod";
import { Backups } from "../../../packages/database/backup";
import type { Application } from "../../../packages/domain/application";
const configSchema = z.object({
  folder: z.string().min(1),
  enabled: z.boolean(),
  interval_days: z.number().int().min(1).max(30),
  retain: z.number().int().min(2).max(100),
  on_close: z.boolean(),
});
export type BackupConfig = z.infer<typeof configSchema>;
export class BackupManager {
  constructor(
    private app: Application,
    private root: string,
  ) {}
  config(): BackupConfig {
    const row = this.app.store.get(
      "SELECT value FROM app_settings WHERE key='backup_config'",
    );
    return row
      ? configSchema.parse(JSON.parse(String(row.value)))
      : {
          folder: join(this.root, "backups"),
          enabled: false,
          interval_days: 1,
          retain: 14,
          on_close: false,
        };
  }
  engine() {
    return new Backups(
      this.app.store,
      this.config().folder,
      join(this.root, "assets"),
    );
  }
  get() {
    this.app.auth.require("backup.manage");
    return this.config();
  }
  save(input: unknown) {
    const user = this.app.auth.require("backup.manage");
    const data = configSchema.omit({ folder: true }).parse(input);
    const config = { ...data, folder: this.config().folder };
    this.app.store.tx(() => {
      this.app.store.run(
        "INSERT INTO app_settings VALUES ('backup_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        JSON.stringify(config),
      );
      this.app.store.audit(
        user.id,
        "update",
        "backup_settings",
        "config",
        null,
        data,
      );
    });
    return config;
  }
  async choose(window: BrowserWindow) {
    const user = this.app.auth.require("backup.manage");
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return this.config();
    const config = { ...this.config(), folder: result.filePaths[0] };
    this.app.store.run(
      "INSERT INTO app_settings VALUES ('backup_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      JSON.stringify(config),
    );
    this.app.store.audit(user.id, "folder_change", "backup_settings", "config");
    return config;
  }
  async automatic(force = false) {
    const config = this.config();
    if (!config.enabled && !force) return;
    const last = this.app.store.get(
      "SELECT value FROM app_settings WHERE key='automatic_backup_at'",
    )?.value;
    const lastTime = last ? Date.parse(JSON.parse(String(last))) : 0;
    if (!force && Date.now() - lastTime < config.interval_days * 86400000)
      return;
    await this.engine().create(null);
    this.app.store.run(
      "INSERT INTO app_settings VALUES ('automatic_backup_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      JSON.stringify(new Date().toISOString()),
    );
    const automatic = this.app.store.all(
      "SELECT file_name FROM backup_history WHERE user_id IS NULL ORDER BY created_at DESC",
    );
    for (const row of automatic.slice(config.retain)) {
      const name = String(row.file_name);
      if (
        basename(name) !== name ||
        !/^optical-[a-zA-Z0-9-]+\.opticalbackup$/.test(name)
      )
        continue;
      const path = join(config.folder, name);
      if (existsSync(path)) unlinkSync(path);
    }
  }
}
