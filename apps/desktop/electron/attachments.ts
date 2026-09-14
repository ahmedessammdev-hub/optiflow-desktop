import { dialog, nativeImage, shell, type BrowserWindow } from "electron";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Application } from "../../../packages/domain/application";
const target = z.object({
  entity_type: z.enum([
    "customers",
    "products",
    "expenses",
    "purchase_orders",
    "store_settings",
  ]),
  entity_id: z.string().uuid(),
});
export class Attachments {
  private thumbnails = new Map<string, string>();
  constructor(
    private app: Application,
    private root: string,
  ) {
    mkdirSync(root, { recursive: true });
  }
  authorize(input: unknown, write = false) {
    const data = target.parse(input);
    const permission = {
      customers: write ? "customers.update" : "customers.view",
      products: write ? "products.update" : "products.view",
      expenses: write ? "expenses.create" : "expenses.view",
      purchase_orders: write ? "purchases.create" : "purchases.view",
      store_settings: "settings.manage",
    }[data.entity_type];
    this.app.auth.require(permission);
    if (data.entity_type === "store_settings") return data;
    if (
      !this.app.store.get(
        `SELECT id FROM ${data.entity_type} WHERE id=?`,
        data.entity_id,
      )
    )
      throw new Error("Record not found");
    return data;
  }
  list(input: unknown) {
    const data = this.authorize(input);
    return this.app.store.all(
      "SELECT id,file_name,mime_type,created_at FROM attachments WHERE entity_type=? AND entity_id=? ORDER BY created_at",
      data.entity_type,
      data.entity_id,
    );
  }
  async add(window: BrowserWindow, input: unknown) {
    const data = this.authorize(input, true);
    const user = this.app.auth.require();
    const selected = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [
        { name: "Image / PDF", extensions: ["png", "jpg", "jpeg", "pdf"] },
      ],
    });
    if (selected.canceled) return null;
    const file = selected.filePaths[0];
    if (statSync(file).size > 20 * 1024 * 1024)
      throw new Error("Attachment exceeds 20 MB");
    let bytes: Buffer = readFileSync(file);
    let extension = "pdf";
    let mime = "application/pdf";
    if (bytes.subarray(0, 5).toString() !== "%PDF-") {
      const image = nativeImage.createFromBuffer(bytes);
      if (image.isEmpty()) throw new Error("Unsupported attachment content");
      bytes = image
        .resize({ width: Math.min(1600, image.getSize().width) })
        .toPNG();
      extension = "png";
      mime = "image/png";
    }
    if (data.entity_type === "store_settings" && mime !== "image/png")
      throw new Error("Store logo must be an image");
    const id = randomUUID(),
      managed = `${id}.${extension}`;
    writeFileSync(join(this.root, managed), bytes, { flag: "wx" });
    this.app.store.tx(() => {
      this.app.store.insert("attachments", {
        id,
        ...data,
        file_name: basename(file),
        managed_name: managed,
        mime_type: mime,
        created_at: new Date().toISOString(),
      });
      this.app.store.audit(
        user.id,
        "attach",
        data.entity_type,
        data.entity_id,
        null,
        { id, file_name: basename(file) },
      );
    });
    return id;
  }
  logoData() {
    this.app.auth.require();
    const row = this.app.store.get(
      "SELECT managed_name,mime_type FROM attachments WHERE entity_type='store_settings' ORDER BY created_at DESC,id DESC LIMIT 1",
    );
    if (!row || row.mime_type !== "image/png") return null;
    const name = String(row.managed_name);
    if (!/^[a-f0-9-]+\.png$/.test(name))
      throw new Error("Invalid managed path");
    return `data:image/png;base64,${readFileSync(join(this.root, name)).toString("base64")}`;
  }
  productImages(productIds: string[]) {
    this.app.auth.require("products.view");
    if (!productIds.length) return {};
    const rows = this.app.store.all(
      `SELECT entity_id,managed_name FROM attachments WHERE entity_type='products' AND mime_type='image/png' AND entity_id IN (${productIds.map(() => "?").join(",")}) ORDER BY created_at DESC,id DESC`,
      ...productIds,
    );
    const images: Record<string, string> = {};
    for (const row of rows) {
      const productId = String(row.entity_id);
      if (images[productId]) continue;
      const name = String(row.managed_name);
      if (!/^[a-f0-9-]+\.png$/.test(name)) continue;
      let thumbnail = this.thumbnails.get(name);
      if (!thumbnail) {
        const source = nativeImage.createFromPath(join(this.root, name));
        if (source.isEmpty()) continue;
        thumbnail = source.resize({ width: 280 }).toDataURL();
        this.thumbnails.set(name, thumbnail);
      }
      images[productId] = thumbnail;
    }
    return images;
  }
  async open(input: unknown) {
    const id = z.string().uuid().parse(input);
    const row = this.app.store.get("SELECT * FROM attachments WHERE id=?", id);
    if (!row) throw new Error("Attachment not found");
    this.authorize(row);
    const name = String(row.managed_name);
    if (!/^[a-f0-9-]+\.(png|pdf)$/.test(name))
      throw new Error("Invalid managed path");
    const error = await shell.openPath(join(this.root, name));
    if (error) throw new Error(error);
  }
}
