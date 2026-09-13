import type { Invoice } from "../shared/contracts";
import type { Prescription, Settings, Row } from "../shared/schemas";
import { formatCurrency } from "../shared/money";
import { PrescriptionView } from "./PrescriptionView";
const code39: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};
function Barcode({ value }: { value: string }) {
  const normalized = value.toUpperCase().replace(/[^0-9A-Z. $/+%-]/g, "-");
  const modules = `*${normalized}*`
    .split("")
    .flatMap((character, characterIndex) => [
      ...code39[character].split("").map((width, index) => ({
        key: `${characterIndex}-${index}`,
        width,
        bar: index % 2 === 0,
      })),
      { key: `${characterIndex}-gap`, width: "n", bar: false },
    ]);
  return (
    <span className="barcode-bars" role="img" aria-label={value}>
      {modules.map((module) => (
        <i
          key={module.key}
          className={module.bar ? "bar" : "space"}
          data-width={module.width}
        />
      ))}
    </span>
  );
}
export type PrintData = {
  kind:
    | "invoice"
    | "prescription"
    | "comprehensive"
    | "statement"
    | "purchase"
    | "return"
    | "labels";
  invoice?: Invoice;
  prescription?: Prescription;
  customer?: Row;
  statement?: Row[];
  document?: {
    number: string;
    date: string;
    party: string;
    lines: Row[];
    total: number;
    paid: number;
    notes: string;
  };
  labels?: Row[];
};
export function PrintDocument({
  data,
  settings,
}: {
  data: PrintData;
  settings: Settings & { logo_data_url?: string };
}) {
  const ar = settings.language === "ar";
  const money = (n: unknown) =>
    formatCurrency(Number(n), settings.currency, settings.language);
  const invoice = data.invoice;
  const customer = invoice
    ? (JSON.parse(String(invoice.sale.customer_snapshot)) as Row)
    : data.customer;
  const prescription =
    data.prescription ??
    (invoice?.sale.prescription_snapshot
      ? (JSON.parse(String(invoice.sale.prescription_snapshot)) as Prescription)
      : null);
  return (
    <article dir={ar ? "rtl" : "ltr"}>
      {data.kind !== "labels" && (
        <header>
          {settings.logo_data_url && (
            <img className="store-logo" src={settings.logo_data_url} alt="" />
          )}
          <h1>
            {ar
              ? settings.store_name_ar || settings.store_name
              : settings.store_name}
          </h1>
          <p>
            {settings.address} ·{" "}
            {[settings.phone, settings.secondary_phone]
              .filter(Boolean)
              .join(" / ")}
          </p>
          {(settings.tax_number || settings.commercial_registration) && (
            <p>
              {settings.tax_number &&
                `${ar ? "الرقم الضريبي" : "Tax no."}: ${settings.tax_number}`}
              {settings.tax_number && settings.commercial_registration
                ? " · "
                : ""}
              {settings.commercial_registration &&
                `${ar ? "السجل التجاري" : "CR"}: ${settings.commercial_registration}`}
            </p>
          )}
          <p>{settings.header}</p>
        </header>
      )}
      <h2>
        {data.kind === "labels"
          ? ""
          : data.kind === "purchase"
            ? ar
              ? "فاتورة مشتريات"
              : "Purchase document"
            : data.kind === "return"
              ? ar
                ? "إيصال مرتجعات واسترداد"
                : "Return / refund receipt"
              : data.kind === "statement"
                ? ar
                  ? "كشف حساب العميل"
                  : "Customer statement"
                : data.kind === "prescription"
                  ? ar
                    ? "الوصفة الطبية"
                    : "Prescription"
                  : ar
                    ? "فاتورة مبيعات"
                    : "Sales invoice"}
      </h2>
      {data.labels && (
        <div className="label-sheet">
          {data.labels.map((label, index) => (
            <section className="barcode-label" key={`${label.id}-${index}`}>
              <strong>{label.name}</strong>
              <span>{label.sku}</span>
              <Barcode value={String(label.barcode || label.sku)} />
              <b>{label.barcode || label.sku}</b>
              <span>{money(label.unit_price)}</span>
            </section>
          ))}
        </div>
      )}
      {data.document && (
        <>
          <p>
            {data.document.number} · {data.document.date}
          </p>
          <p>{data.document.party}</p>
          <table>
            <thead>
              <tr>
                <th>{ar ? "المنتج" : "Product"}</th>
                <th>{ar ? "الكمية" : "Quantity"}</th>
                <th>{ar ? "المبلغ" : "Amount"}</th>
              </tr>
            </thead>
            <tbody>
              {data.document.lines.map((line) => (
                <tr key={String(line.id)}>
                  <td>{line.name}</td>
                  <td>{line.quantity}</td>
                  <td>{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {ar ? "الإجمالي" : "Total"}: {money(data.document.total)}
          </p>
          <p>
            {data.kind === "return"
              ? ar
                ? "المسترد"
                : "Refunded"
              : ar
                ? "المدفوع"
                : "Paid"}
            : {money(data.document.paid)}
          </p>
          <p>{data.document.notes}</p>
        </>
      )}
      <p>
        {customer?.name} {settings.show_phone ? customer?.phone : ""}
      </p>
      <p>{customer?.address}</p>
      {invoice && data.kind !== "prescription" && (
        <>
          <p>
            {String(invoice.sale.invoice_number)} ·{" "}
            {String(invoice.sale.created_at)}
          </p>
          {settings.show_seller && (
            <p>
              {ar ? "البائع" : "Seller"}: {String(invoice.sale.seller_name)}
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>{ar ? "المنتج" : "Product"}</th>
                <th>{ar ? "الكمية" : "Quantity"}</th>
                {settings.show_prices && <th>{ar ? "المبلغ" : "Amount"}</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={String(item.id)}>
                  <td>
                    {item.product_name}
                    <small>{item.notes}</small>
                  </td>
                  <td>{item.quantity}</td>
                  {settings.show_prices && <td>{money(item.subtotal)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {settings.show_prices && (
            <dl>
              {[
                ["Subtotal", "الإجمالي الفرعي", invoice.sale.subtotal],
                ["Discount", "الخصم", invoice.sale.discount],
                ["Tax", "الضريبة", invoice.sale.tax],
                ["Total", "الإجمالي", invoice.total],
                ["Paid", "المدفوع", invoice.paid],
                ["Returns", "المرتجعات", invoice.returned],
                ["Refunds", "المبالغ المستردة", invoice.refunded],
                ["Balance", "المتبقي", invoice.balance],
              ].map(([en, arabic, n]) => (
                <div key={String(en)}>
                  <dt>{ar ? arabic : en}</dt>
                  <dd>{money(n)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p>{invoice.sale.notes}</p>
        </>
      )}
      {prescription &&
        (data.kind === "prescription" || data.kind === "comprehensive") &&
        settings.show_prescription && (
          <PrescriptionView
            prescription={prescription}
            language={settings.language}
            mode="print"
          />
        )}
      {data.statement && (
        <table>
          <thead>
            <tr>
              {(ar
                ? ["التاريخ", "النوع", "مدين", "دائن", "الرصيد"]
                : ["Date", "Type", "Debit", "Credit", "Balance"]
              ).map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.statement.map((row) => (
              <tr key={String(row.id)}>
                <td>{row.created_at}</td>
                <td>
                  {ar
                    ? ((
                        {
                          invoice: "فاتورة",
                          payment: "دفعة",
                          return: "مرتجع",
                          refund: "استرداد",
                        } as Record<string, string>
                      )[String(row.type)] ?? row.type)
                    : row.type}
                </td>
                <td>{money(row.debit)}</td>
                <td>{money(row.credit)}</td>
                <td>{money(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.kind !== "labels" && <footer>{settings.footer}</footer>}
    </article>
  );
}
export const printCSS = `body{font-family:Arial,sans-serif;color:#172531;margin:0;font-size:12px}article{padding:12px}header{text-align:center;border-bottom:2px solid #172531;padding-bottom:12px}.store-logo{display:block;max-width:120px;max-height:70px;object-fit:contain;margin:0 auto 8px}h1{font-size:24px}h2{font-size:18px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border-bottom:1px solid #c8d0d8;text-align:start;padding:9px}thead{display:table-header-group}tr{break-inside:avoid}small{display:block;color:#57656f}.prescription{border:1px solid #aabdc8;padding:12px;break-inside:avoid}.section-heading,.prescription-footer,dl>div{display:flex;justify-content:space-between;gap:12px}dl{margin-inline-start:auto;max-width:300px}dd{margin:0}.label-sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}.barcode-label{border:1px dashed #333;padding:4mm;text-align:center;break-inside:avoid}.barcode-label>*{display:block;margin:2px}.barcode-label b{font-family:monospace;font-size:13px;letter-spacing:2px}.barcode-bars{height:12mm;display:flex;justify-content:center;margin:2mm auto!important}.barcode-bars i{display:block;height:100%;flex:none}.barcode-bars .bar{background:#000}.barcode-bars .space{background:#fff}.barcode-bars i[data-width="n"]{width:.28mm}.barcode-bars i[data-width="w"]{width:.72mm}footer{margin-top:24px;border-top:1px solid #ccc;padding-top:12px;text-align:center}@media print{article{padding:0}}`;
