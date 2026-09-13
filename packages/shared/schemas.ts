import { z } from "zod";
export const id = z.string().uuid();
export const text = z.string().trim().max(2000);
export const money = z.number().int().min(0).max(1_000_000_000_000);
export const productTypes = [
  "frames",
  "sunglasses",
  "lenses",
  "contact_lenses",
  "accessories",
  "other",
] as const;
export const methods = [
  "cash",
  "card",
  "bank_transfer",
  "wallet",
  "other",
] as const;
export const paymentSchema = z.object({
  amount: money.refine((n) => n > 0),
  method: z.enum(methods),
  notes: text.default(""),
});
export const customerSchema = z.object({
  name: text.min(1),
  phone: text.default(""),
  secondary_phone: text.default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  address: text.default(""),
  city: text.default(""),
  notes: text.default(""),
  date_of_birth: z.string().date().nullable().default(null),
  gender: text.default(""),
});
const optical = (min: number, max: number) =>
  z.number().min(min).max(max).nullable().default(null);
export const eyeSchema = z.object({
  sph: optical(-40, 40),
  cyl: optical(-20, 20),
  axis: z.number().int().min(0).max(180).nullable().default(null),
  add: optical(-10, 10),
  pd: optical(10, 50),
  prism: optical(0, 30),
  base: text.default(""),
});
export const prescriptionSchema = z.object({
  customer_id: id,
  exam_date: z.string().date().nullable(),
  od: eyeSchema,
  os: eyeSchema,
  ipd: optical(20, 100),
  near_pd: optical(20, 100),
  doctor_name: text.default(""),
  optometrist_name: text.default(""),
  notes: text.default(""),
});
export type Prescription = z.infer<typeof prescriptionSchema> & {
  id: string;
  created_at: string;
  created_by: string;
};
export const productSchema = z.object({
  name: text.min(1),
  sku: text.min(1),
  barcode: text.default(""),
  type: z.enum(productTypes),
  category_id: id.nullable().default(null),
  brand: text.default(""),
  model_code: text.default(""),
  material: text.default(""),
  color: text.default(""),
  size: text.default(""),
  supplier_id: id.nullable().default(null),
  unit_cost: money,
  unit_price: money,
  reorder_level: z.number().int().min(0).nullable().default(null),
  notes: text.default(""),
  variants: text.default(""),
});
export const saleSchema = z.object({
  request_id: id,
  customer_id: id.nullable(),
  prescription_id: id.nullable(),
  items: z
    .array(
      z.object({
        product_id: id,
        quantity: z.number().int().min(1).max(100000),
        unit_price: money.optional(),
        notes: text.default(""),
      }),
    )
    .min(1)
    .max(300),
  discount: money.default(0),
  tax: money.default(0),
  payments: z.array(paymentSchema).max(20),
  notes: text.default(""),
});
export const querySchema = z.object({
  search: text.default(""),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
  sort: z
    .enum(["created_at", "name", "total", "stock_quantity"])
    .default("created_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  type: text.default(""),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  customer_id: id.optional(),
  product_id: id.optional(),
  category_id: id.optional(),
  supplier_id: id.optional(),
  employee_id: id.optional(),
  method: z.enum(methods).optional(),
  archived: z.boolean().default(false),
});
export type Query = z.input<typeof querySchema>;
export type Row = Record<string, string | number | null>;
export type Page = {
  rows: Row[];
  total: number;
  page: number;
  page_size: number;
};
export type Session = { id: string; name: string; permissions: string[] };
export const settingsSchema = z.object({
  store_name: text.min(1),
  store_name_ar: text.default(""),
  address: text.default(""),
  phone: text.default(""),
  tax_number: text.default(""),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .refine((c) => {
      try {
        new Intl.NumberFormat("en", { style: "currency", currency: c });
        return true;
      } catch {
        return false;
      }
    }),
  language: z.enum(["en", "ar"]),
  timezone: z.string().refine((t) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: t });
      return true;
    } catch {
      return false;
    }
  }),
  reorder_level: z.number().int().min(0),
  header: text.default(""),
  footer: text.default(""),
  paper: z.enum(["A4", "A5", "80mm"]),
  copies: z.number().int().min(1).max(10),
  margin: z.number().min(0).max(30),
  show_prices: z.boolean(),
  show_phone: z.boolean(),
  show_seller: z.boolean(),
  show_prescription: z.boolean(),
  default_printer: text.default(""),
});
export type Settings = z.infer<typeof settingsSchema>;
