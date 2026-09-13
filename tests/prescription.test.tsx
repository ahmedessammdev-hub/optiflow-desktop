import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrescriptionView } from "../packages/ui/PrescriptionView";
import { PrintDocument } from "../packages/ui/PrintDocument";
import { prescriptionSchema } from "../packages/shared/schemas";
import { defaultSettings } from "../packages/shared/defaults";
const prescription = {
  ...prescriptionSchema.parse({
    customer_id: "550e8400-e29b-41d4-a716-446655440000",
    exam_date: null,
    od: { sph: 0, pd: 31 },
    os: { pd: 32 },
    ipd: 63,
  }),
  id: "rx",
  created_by: "owner",
  created_at: "2026-01-01",
};
describe("Canonical prescription and print", () => {
  it("uses the same ordered fields including PD for all modes", () => {
    for (const mode of ["compact", "full", "print"] as const) {
      const html = renderToStaticMarkup(
        <PrescriptionView prescription={prescription} mode={mode} />,
      );
      expect(html).toContain("SPH");
      expect(html).toContain("PD");
      expect(html.indexOf("OD / Right")).toBeLessThan(
        html.indexOf("OS / Left"),
      );
      expect(html).toContain("31");
      expect(html).toContain("32");
      expect(html).toContain("Unknown");
    }
  });
  it("renders Arabic documents RTL and escapes injected content", () => {
    const html = renderToStaticMarkup(
      <PrintDocument
        data={{
          kind: "prescription",
          prescription,
          customer: { name: "<script>alert(1)</script>" },
        }}
        settings={{ ...defaultSettings, language: "ar" }}
      />,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
