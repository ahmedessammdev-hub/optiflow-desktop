import { randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  copyFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, basename } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { SQLite } from "./sqlite";
import { z } from "zod";
import { Store } from "./database";
const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
const bundleSchema = z.object({
  version: z.literal(1),
  database: z.string(),
  checksum: z.string().length(64),
  assets: z
    .array(
      z.object({
        name: z.string().regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/),
        data: z.string(),
        checksum: z.string().length(64),
      }),
    )
    .max(100000),
});
export class Backups {
  constructor(
    private store: Store,
    private folder: string,
    private assets: string,
  ) {
    mkdirSync(folder, { recursive: true });
    mkdirSync(assets, { recursive: true });
  }
  async create(userId: string | null) {
    const backupId = randomUUID();
    const snapshot = join(this.folder, `${backupId}.sqlite`);
    await this.store.db.backup(snapshot);
    const database = readFileSync(snapshot);
    const fileName = `optical-${new Date().toISOString().replace(/[:.]/g, "-")}-${backupId}.opticalbackup`;
    const assets = readdirSync(this.assets)
      .filter((name) => /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(name))
      .map((name) => {
        const data = readFileSync(join(this.assets, name));
        return { name, data: data.toString("base64"), checksum: digest(data) };
      });
    const packed = gzipSync(
      JSON.stringify({
        version: 1,
        database: database.toString("base64"),
        checksum: digest(database),
        assets,
      }),
    );
    writeFileSync(join(this.folder, fileName), packed, { flag: "wx" });
    unlinkSync(snapshot);
    this.store.insert("backup_history", {
      id: backupId,
      file_name: fileName,
      checksum: digest(packed),
      created_at: new Date().toISOString(),
      user_id: userId,
    });
    this.store.audit(userId, "create", "backup", backupId, null, {
      file_name: fileName,
    });
    return join(this.folder, fileName);
  }
  validate(file: string, keepStaging = false) {
    if (statSync(file).size > 512 * 1024 * 1024)
      throw new Error("Backup exceeds supported size");
    const bundle = bundleSchema.parse(
      JSON.parse(
        gunzipSync(readFileSync(file), {
          maxOutputLength: 1024 * 1024 * 1024,
        }).toString("utf8"),
      ),
    );
    const database = Buffer.from(bundle.database, "base64");
    if (digest(database) !== bundle.checksum)
      throw new Error("Backup checksum mismatch");
    for (const asset of bundle.assets)
      if (digest(Buffer.from(asset.data, "base64")) !== asset.checksum)
        throw new Error("Asset checksum mismatch");
    const staging = join(this.folder, `verify-${randomUUID()}.sqlite`);
    writeFileSync(staging, database, { flag: "wx" });
    const db = new SQLite(staging, { readonly: true });
    let valid = false;
    try {
      if (
        db.pragma("integrity_check", { simple: true }) !== "ok" ||
        (db.pragma("foreign_key_check") as unknown[]).length
      )
        throw new Error("Backup database failed integrity validation");
      const expected = this.store.all(
        "SELECT * FROM schema_migrations ORDER BY name",
      );
      const actual = db
        .prepare("SELECT * FROM schema_migrations ORDER BY name")
        .all();
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error("Backup schema differs from this application version");
      const schemaSql =
        "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name";
      if (
        JSON.stringify(db.prepare(schemaSql).all()) !==
        JSON.stringify(this.store.all(schemaSql))
      )
        throw new Error(
          "Backup schema or immutable triggers have been tampered with",
        );
      valid = true;
    } finally {
      db.close();
      if (!valid || !keepStaging) unlinkSync(staging);
    }
    return { bundle, staging };
  }
  async restore(file: string, userId: string) {
    const { bundle, staging } = this.validate(file, true);
    const safety = await this.create(userId);
    const assetStage = `${this.assets}.restore-${randomUUID()}`;
    const oldAssets = `${this.assets}.pre-restore-${randomUUID()}`;
    mkdirSync(assetStage, { recursive: true });
    for (const asset of bundle.assets)
      writeFileSync(
        join(assetStage, asset.name),
        Buffer.from(asset.data, "base64"),
        { flag: "wx" },
      );
    this.store.audit(
      userId,
      "restore_requested",
      "backup",
      basename(file),
      null,
      { safety: basename(safety) },
    );
    this.store.db.pragma("wal_checkpoint(TRUNCATE)");
    this.store.close();
    const old = `${this.store.file}.pre-restore-${randomUUID()}`;
    renameSync(this.store.file, old);
    let assetsMoved = false;
    try {
      copyFileSync(staging, this.store.file);
      renameSync(this.assets, oldAssets);
      assetsMoved = true;
      renameSync(assetStage, this.assets);
      const restored = new SQLite(this.store.file);
      try {
        restored
          .prepare(
            "INSERT INTO audit_logs (id,user_id,action,entity,entity_id,before_data,after_data,created_at) VALUES (?,NULL,?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            "restore",
            "backup",
            basename(file),
            null,
            JSON.stringify({ safety: basename(safety), operator: userId }),
            new Date().toISOString(),
          );
      } finally {
        restored.close();
      }
      unlinkSync(staging);
    } catch (error) {
      if (existsSync(this.store.file))
        renameSync(
          this.store.file,
          `${this.store.file}.failed-${randomUUID()}`,
        );
      renameSync(old, this.store.file);
      if (assetsMoved) {
        if (existsSync(this.assets))
          renameSync(this.assets, `${this.assets}.failed-${randomUUID()}`);
        renameSync(oldAssets, this.assets);
      }
      throw error;
    }
    return { safety };
  }
}
