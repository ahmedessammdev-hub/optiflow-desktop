import { it, expect } from "vitest";
import { allocate, totals } from "../packages/shared/money";
it("never allocates rounding money to free items", () => {
  expect(allocate(1, [0, 1, 2])).toEqual([0, 0, 1]);
  expect(allocate(2, [0, 1, 1])).toEqual([0, 1, 1]);
  expect(() => allocate(1, [0, 0])).toThrow();
});
it("rejects unallocatable tax and fractional monetary inputs", () => {
  expect(() => totals([{ quantity: 1, unit_price: 0 }], 0, 1)).toThrow();
  expect(() => totals([{ quantity: 1, unit_price: 100 }], 0.5, 0)).toThrow();
});
