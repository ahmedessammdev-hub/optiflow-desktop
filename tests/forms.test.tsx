// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppProvider, client } from "../apps/desktop/src/lib";
import { RecordForm } from "../apps/desktop/src/components";
import { defaultSettings } from "../packages/shared/defaults";
afterEach(() => {
  cleanup();
  client.clear();
});
function mount(
  fields: Parameters<typeof RecordForm>[0]["fields"],
  submit = vi.fn(async () => {}),
) {
  window.optical = {
    invoke: vi.fn(async () => defaultSettings),
  } as unknown as Window["optical"];
  render(
    <QueryClientProvider client={client}>
      <AppProvider user={{ id: "owner", name: "Owner", permissions: [] }}>
        <RecordForm fields={fields} onSubmit={submit} />
      </AppProvider>
    </QueryClientProvider>,
  );
  return submit;
}
it("customer form submits name and address without losing address", async () => {
  const submit = mount([
    { name: "name", en: "Name", ar: "الاسم", required: true },
    { name: "address", en: "Address", ar: "العنوان" },
  ]);
  fireEvent.change(screen.getByLabelText("Name *"), {
    target: { value: "Customer" },
  });
  fireEvent.change(screen.getByLabelText("Address"), {
    target: { value: "Cairo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({ name: "Customer", address: "Cairo" }),
  );
});
it("payment form shows rejection and preserves input for correction", async () => {
  mount(
    [{ name: "amount", en: "Amount", ar: "المبلغ" }],
    vi.fn(async () => {
      throw new Error("Payment exceeds remaining balance");
    }),
  );
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: "500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Payment exceeds"),
  );
  expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe(
    "500",
  );
});
it("print settings retain explicit false checkboxes", async () => {
  const submit = mount([
    {
      name: "show_prices",
      en: "Show prices",
      ar: "عرض الأسعار",
      type: "checkbox",
    },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({ show_prices: false }),
  );
});
