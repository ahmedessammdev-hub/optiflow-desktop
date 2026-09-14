import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { deflateSync } from "node:zlib";
import { Store } from "../packages/database/database";
import { Application } from "../packages/domain/application";

const target = process.argv[2];
if (!target) throw new Error("Pass an explicit empty Optical data directory");
const dataFolder = resolve(target);
const assets = join(dataFolder, "assets");
mkdirSync(assets, { recursive: true });

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}
function productPng(
  accent: [number, number, number],
  kind: "glasses" | "lens",
) {
  const width = 320;
  const height = 220;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    pixels[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      const shade = Math.round(247 - (y / height) * 10);
      let color: [number, number, number] = [shade, shade + 3, 250];
      if (kind === "glasses") {
        const left = Math.sqrt(((x - 105) / 61) ** 2 + ((y - 112) / 43) ** 2);
        const right = Math.sqrt(((x - 215) / 61) ** 2 + ((y - 112) / 43) ** 2);
        const rim =
          (left > 0.86 && left < 1.05) || (right > 0.86 && right < 1.05);
        const bridge = y > 100 && y < 111 && x > 158 && x < 163;
        const arm = y > 88 && y < 96 && (x < 45 || x > 275);
        if (rim || bridge || arm) color = accent;
      } else {
        const distance = Math.sqrt(
          ((x - 160) / 75) ** 2 + ((y - 108) / 75) ** 2,
        );
        if (distance < 1) {
          const glow = Math.max(0.35, 1 - distance);
          color = accent.map((value) =>
            Math.round(value + (255 - value) * glow),
          ) as [number, number, number];
        }
        if (distance > 0.94 && distance < 1.04) color = accent;
      }
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const store = new Store(
  join(dataFolder, "optical.sqlite"),
  resolve("packages/database/migrations"),
);
const app = new Application(store);
const credentials = {
  name: "مدير النظام",
  username: "admin",
  password: "Demo@12345",
};
app.auth.setup(credentials);
app.auth.login(credentials);
app.queries.saveSettings({
  ...app.queries.settings(),
  store_name: "Vision Optics Demo",
  store_name_ar: "فيجن للبصريات - بيانات تجريبية",
  currency: "EGP",
  language: "ar",
  address: "مدينة نصر، القاهرة",
  phone: "01000000000",
});

const frames = app.catalog.save("categories", {
  data: { name: "إطارات طبية", type: "frames", reorder_level: 3 },
});
const sunglasses = app.catalog.save("categories", {
  data: { name: "نظارات شمس", type: "sunglasses", reorder_level: 3 },
});
const lenses = app.catalog.save("categories", {
  data: { name: "عدسات", type: "lenses", reorder_level: 5 },
});
const supplier = app.catalog.save("suppliers", {
  data: {
    name: "شركة الرؤية للتوريدات",
    phone: "01011112222",
    address: "القاهرة",
    contact_person: "محمد حسن",
  },
});

const definitions = [
  [
    "إطار كلاسيك أسود",
    "FR-BLK-001",
    "629100000001",
    "frames",
    frames,
    "Optima",
    "أسود",
    450,
    850,
    14,
    [35, 43, 54],
    "glasses",
  ],
  [
    "إطار ذهبي خفيف",
    "FR-GLD-002",
    "629100000002",
    "frames",
    frames,
    "Lumiere",
    "ذهبي",
    620,
    1150,
    9,
    [184, 134, 11],
    "glasses",
  ],
  [
    "إطار أطفال أزرق",
    "FR-KID-003",
    "629100000003",
    "frames",
    frames,
    "Junior",
    "أزرق",
    280,
    550,
    11,
    [25, 104, 183],
    "glasses",
  ],
  [
    "نظارة شمس Polarized",
    "SUN-POL-004",
    "629100000004",
    "sunglasses",
    sunglasses,
    "Solara",
    "بني",
    780,
    1450,
    7,
    [102, 66, 41],
    "glasses",
  ],
  [
    "نظارة شمس رياضية",
    "SUN-SPT-005",
    "629100000005",
    "sunglasses",
    sunglasses,
    "Velocity",
    "أحمر",
    690,
    1290,
    6,
    [190, 42, 42],
    "glasses",
  ],
  [
    "عدسات بلو كت",
    "LNS-BLU-006",
    "629100000006",
    "lenses",
    lenses,
    "ClearView",
    "شفاف",
    350,
    750,
    20,
    [38, 145, 190],
    "lens",
  ],
  [
    "عدسات فوتوجراي",
    "LNS-PHO-007",
    "629100000007",
    "lenses",
    lenses,
    "PhotoSmart",
    "رمادي",
    520,
    980,
    16,
    [92, 101, 116],
    "lens",
  ],
] as const;

const products: string[] = [];
for (const [
  name,
  sku,
  barcode,
  type,
  category,
  brand,
  color,
  cost,
  price,
  quantity,
  accent,
  kind,
] of definitions) {
  const product = app.catalog.save("products", {
    data: {
      name,
      sku,
      barcode,
      type,
      category_id: category,
      supplier_id: supplier,
      brand,
      color,
      material: type === "lenses" ? "Polycarbonate" : "Acetate",
      size: type === "lenses" ? "Standard" : "Medium",
      unit_cost: cost * 100,
      unit_price: price * 100,
      reorder_level: 3,
    },
  });
  app.operations.adjust({
    product_id: product,
    quantity,
    type: "opening_stock",
    reason: "رصيد افتتاحي تجريبي",
  });
  const attachment = randomUUID();
  const managedName = `${attachment}.png`;
  writeFileSync(join(assets, managedName), productPng(accent, kind));
  store.insert("attachments", {
    id: attachment,
    entity_type: "products",
    entity_id: product,
    file_name: `${sku}.png`,
    managed_name: managedName,
    mime_type: "image/png",
    created_at: new Date().toISOString(),
  });
  products.push(product);
}

const customerNames = [
  "أحمد محمود",
  "سارة علي",
  "مريم خالد",
  "عمر سامح",
  "نور محمد",
];
const customers = customerNames.map((name, index) =>
  app.catalog.save("customers", {
    data: {
      name,
      phone: `0101234500${index}`,
      city: "القاهرة",
      address: `عنوان تجريبي ${index + 1}`,
    },
  }),
);
const prescription = app.catalog.prescription({
  customer_id: customers[0],
  exam_date: "2026-09-14",
  od: { sph: -1.25, cyl: -0.5, axis: 90, pd: 31.5 },
  os: { sph: -1, cyl: -0.25, axis: 80, pd: 31.5 },
  ipd: 63,
  doctor_name: "د. خالد",
});
app.operations.openCash(3000 * 100);
app.finance.checkout({
  request_id: randomUUID(),
  customer_id: customers[0],
  prescription_id: prescription,
  items: [
    { product_id: products[0], quantity: 1 },
    { product_id: products[5], quantity: 2 },
  ],
  payments: [{ amount: 1000 * 100, method: "cash" }],
  discount: 100 * 100,
  tax: 0,
  notes: "فاتورة تجريبية بعد كشف النظر",
});
app.finance.checkout({
  request_id: randomUUID(),
  customer_id: customers[1],
  prescription_id: null,
  items: [{ product_id: products[3], quantity: 1 }],
  payments: [{ amount: 1450 * 100, method: "card" }],
  discount: 0,
  tax: 0,
});
app.operations.expense({
  category: "Utilities",
  amount: 450 * 100,
  method: "cash",
  description: "كهرباء وإنترنت - تجريبي",
});
app.expansion.saveWorkflow("appointments", {
  customer_id: customers[2],
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  reminder_at: new Date(Date.now() + 82_800_000).toISOString(),
  purpose: "كشف نظر",
});
app.expansion.saveWorkflow("lab_orders", {
  customer_id: customers[0],
  sale_id: null,
  prescription_id: prescription,
  lab_name: "معمل النور",
  expected_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  cost: 420 * 100,
  notes: "بلو كت",
});
app.expansion.saveWorkflow("repairs", {
  customer_id: customers[3],
  item_description: "إطار معدني",
  issue: "مفصلة مكسورة",
  cost: 120 * 100,
  received_at: new Date().toISOString(),
  due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
});
app.expansion.saveWorkflow("customer_followups", {
  customer_id: customers[4],
  type: "exam",
  due_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  notes: "متابعة قياس النظر",
});
app.expansion.createQuote({
  customer_id: customers[2],
  reserve_stock: true,
  expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
  items: [{ product_id: products[1], quantity: 1 }],
});
const branch = app.expansion.createBranch({
  code: "NASR2",
  name: "فرع مدينة نصر 2",
  address: "شارع تجريبي",
  phone: "01099998888",
});
app.expansion.transfer({
  from_branch_id: "00000000-0000-4000-8000-000000000010",
  to_branch_id: branch,
  notes: "رصيد افتتاحي للفرع",
  items: [
    { product_id: products[2], quantity: 3 },
    { product_id: products[6], quantity: 4 },
  ],
});

store.close();
process.stdout.write(
  `Mock Optical data created at ${dataFolder}\nUsername: admin\nPassword: Demo@12345\n`,
);
