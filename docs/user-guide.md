# User guide

1. Install Optical Desktop and launch it. Create the first administrator. Store the password securely.
2. Open Settings & Help. Set store name, address, phone, currency, language, timezone and print options. Arabic switches layout direction.
3. Add categories and products. Enter purchase cost and selling price in major currency units (for example 100.00 EGP). Stock starts at zero. In Inventory, add an opening-stock movement with a reason, or receive a purchase order.
4. Add customers with name, phone and address. Open Profile to create prescriptions. Each examination creates a separate historical record. Blank measurements remain unknown; zero is a valid measurement.
5. Open the cash drawer with counted opening cash before taking cash payments or paying cash expenses. Card payments do not enter the physical drawer.
6. Open Point of Sale. Search or scan a barcode and press Enter. Choose a customer for credit sales and select the prescription used for this sale. Enter quantities, authorized discounts, tax and payment lines. Add separate payment lines for split tender. Complete the sale once.
7. Open the resulting invoice to preview an invoice or comprehensive invoice/prescription. Print sends the preview to the system print dialog. PDF saves the preview document. Older invoices use the original snapshots.
8. To collect debt, open the invoice and Record Payment. Each payment remains in history. Authorized staff can reverse a mistaken payment with a reason.
9. To return a product, open the original invoice, choose Return, quantity, reason, restock choice and refund method. A return first reduces unpaid debt and refunds only any excess already paid.
10. Add suppliers and purchase orders. Receive stock once the goods arrive. Record expenses separately. Close the drawer using actual counted cash; the expected/actual difference is retained.
11. Use table searches and date filters, reports, CSV export and dashboard refresh. Dashboard updates after mutations. Profit is unavailable when imported historical costs are unknown.
12. Create a backup in Settings before upgrades or data import. Test restoration using a separate test data directory before depending on a backup.

F2 focuses POS product search. F4 focuses customer search. Ctrl+Enter completes a valid POS checkout. Ctrl+P prints the open invoice. Escape closes a dialog. Avoid entering money with more than two decimal places. Historical records are archived or reversed, not deleted.

Purchase details show the supplier payment ledger and accept additional payments up to the outstanding balance. User administration supports account archiving, password reset and editing non-administrator role permissions; last-administrator protection is enforced. Customer profiles and products support managed image/PDF attachments; purchase details also support receipts. Images are resized on import and managed attachments are included in backups.

Reports include product/category performance, profit, stock valuation, low stock and supplier balances. Expand Filters for the filters supported by each report. Purchase and return records have printable documents. Customer invoice history is paginated. Settings includes automatic backup interval, retention and destination, plus legacy JSON import with a reconciliation report. Test imported data before relying on it; unknown historical costs remain unknown.
