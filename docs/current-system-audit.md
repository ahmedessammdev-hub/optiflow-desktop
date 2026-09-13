# Legacy system audit

Audited 2026-09-12 from the local optical-frontend and optical-backend checkouts. Both working trees were clean. No production database was opened or changed.

## Findings

| Severity | Evidence                                                                                                           | Consequence and replacement                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Critical | routes/api.php applies authentication but no role policies to financial and catalog endpoints                      | Employees can adjust prices, delete payments and change stock. Enforce permissions on every new domain command. |
| Critical | InvoiceController::store accepts discount without a subtotal ceiling and initial payment without a balance ceiling | Negative totals and overpayments are possible. Validate integer minor units inside the transaction.             |
| Critical | InvoiceController::addPayment updates cached paid amount before inserting a payment, outside a transaction         | Failures/concurrent requests can corrupt debt. Use an append-only ledger and an immediate transaction.          |
| High     | Customer.medical_info is overwritten; invoice show loads the current customer and current product                  | Historical prescriptions, descriptions and costs drift. Introduce immutable prescriptions and sale snapshots.   |
| High     | DashboardController joins current products.wholesale_price                                                         | Historic COGS changes when purchase cost changes. Snapshot cost at checkout.                                    |
| High     | SafeController aggregates every payment, including non-cash; destroy hard deletes payments                         | No real drawer reconciliation or reversal trail. Introduce sessions, cash entries and explicit reversals.       |
| High     | ProductController accepts negative price/stock and directly updates stock                                          | No movement history. All changes go through a transactional stock ledger.                                       |
| High     | Sales.jsx and Customers.jsx fetch one page then filter locally; backend paginates 10                               | Customer/product 11+ may be invisible. Search SQL before pagination.                                            |
| High     | Customers.jsx/Sales.jsx/Invoices.jsx implement different medical cards                                             | Inconsistent ordering and missing PD in printing. One PrescriptionView for screen and documents.                |
| Medium   | Customer migration has address, model fillable and controller omit it                                              | Address is lost on save. Shared full customer schema.                                                           |
| Medium   | DashboardController lacks yesterday and computes trends in a per-day loop                                          | Incorrect range and excess queries. Central date ranges and grouped analytics.                                  |
| Medium   | CategoryController queries top seller per category; invoice index returns 500; safe loads all                      | Bounded queries, indexed filters and paged reports required.                                                    |
| Medium   | Product type accepts arbitrary strings; categories use others; print recognizes contactLens                        | Canonical product types and explicit import mapping.                                                            |
| Medium   | axios.js and product images hardcode localhost:8000                                                                | Packaged desktop needs managed assets and no web server.                                                        |
| Medium   | Sales.jsx prints using timed window.print calls; invoices include dollar symbols                                   | Dedicated document renderer, stored branding/currency, Electron print/PDF service.                              |
| Medium   | AuthContext stores bearer token in localStorage; login has no explicit lockout                                     | Main-process sessions, password hashing and failed-login limits.                                                |
| Medium   | tests only assert true and HTTP homepage status                                                                    | Add real financial, history, permissions, transaction and desktop lifecycle regressions.                        |

## Existing workflows and relationships

React routes cover login, dashboard, products, categories, customers, POS, invoices, safe and profile settings. Customer profile shows invoices and a mutable eye measurement object. POS supports a customer, line quantities/prices and a single initial payment. Invoice debt collection appends a payment but mutates the cached total separately. Categories provide stock alerts; products have barcode, brand, model, material, price, wholesale cost and an image. Lens notes can be updated on invoice items.

Laravel 12/Sanctum provides customers → invoices → items/products and invoices → payments, with seller users and product categories. Customer deletion nulls invoice customer references; item/payment deletion cascades with invoices. Existing decimal columns do not prevent PHP floating point arithmetic. Several migration down methods are empty. Demo seeding uses a known development password; it must never be reused for production setup.

The original project has no suppliers, purchasing, auditable stock movements, prescription history, returns, expenses, cash sessions, immutable audit log, backup/restore or desktop packaging. English/Arabic context and product badges are useful design references, but large page components and native alert/confirm flows need replacement. Configuration is environment-driven Laravel configuration; desktop needs a managed local data directory, logs, safe upgrades, printers and file dialogs.

## Migration uncertainty

No actual business export has been supplied. Current medical_info cannot establish an old invoice's actual prescription. Current wholesale price cannot establish historical cost. An importer must report these unknowns instead of fabricating history. Preserve available PD, legacy IDs, raw source and payment discrepancies for reconciliation.
