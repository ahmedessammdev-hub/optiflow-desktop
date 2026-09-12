import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store } from '../database/database';
import { Auth } from './auth';
import { id, methods, paymentSchema, saleSchema, text } from '../shared/schemas';
import { allocate, checked, totals } from '../shared/money';
import { moveStock } from './stock';
export function saleBalance(store: Store, saleId: string) {
  const sale = store.get('SELECT total FROM sales WHERE id=?', saleId); if (!sale) throw new Error('Invoice not found');
  const paid = Number(store.get('SELECT COALESCE(sum(amount),0) n FROM payments WHERE sale_id=?', saleId)?.n);
  const returned = Number(store.get('SELECT COALESCE(sum(total),0) n FROM returns WHERE sale_id=?', saleId)?.n);
  const refunded = Number(store.get('SELECT COALESCE(sum(amount),0) n FROM refunds WHERE sale_id=?', saleId)?.n);
  return { total: Number(sale.total), paid, returned, refunded, balance: Number(sale.total) - returned - paid + refunded };
}
export function cashEntry(store: Store, amount: number, type: string, reference: string, reason: string, userId: string) {
  const session = store.get('SELECT id FROM cash_sessions WHERE closed_at IS NULL');
  if (!session) throw new Error('Open the cash drawer before recording cash transactions');
  const balance = Number(store.get('SELECT COALESCE(sum(amount),0) n FROM cash_transactions WHERE session_id=?', String(session.id))?.n);
  if (balance + amount < 0) throw new Error('Insufficient cash in drawer');
  store.insert('cash_transactions', { id: randomUUID(), session_id: session.id, type, amount, reference_id: reference, reason, user_id: userId, created_at: new Date().toISOString() });
}
export class Finance {
  constructor(private store: Store, private auth: Auth) {}
  checkout(input: unknown) {
    const user = this.auth.require('sales.create'); const data = saleSchema.parse(input);
    if (data.discount) this.auth.require('sales.discount');
    return this.store.tx(() => {
      const existing = this.store.get('SELECT id FROM sales WHERE request_id=?', data.request_id); if (existing) return String(existing.id);
      const customer = data.customer_id ? this.store.get('SELECT * FROM customers WHERE id=? AND archived_at IS NULL', data.customer_id) : null;
      if (data.customer_id && !customer) throw new Error('Customer not found or archived');
      const prescription = data.prescription_id ? this.store.get('SELECT * FROM prescriptions WHERE id=? AND customer_id=?', data.prescription_id, data.customer_id) : null;
      if (data.prescription_id && !prescription) throw new Error('Prescription does not belong to this customer');
      const products = data.items.map(item => {
        const p = this.store.get('SELECT p.*,COALESCE(c.name,\'\') category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.archived_at IS NULL', item.product_id);
        if (!p) throw new Error('Product not found or archived');
        const price = item.unit_price ?? Number(p.unit_price);
        if (price !== p.unit_price) this.auth.require('sales.override_price');
        return { p, item, quantity: item.quantity, unit_price: price };
      });
      const amounts = totals(products, data.discount, data.tax); const paid = checked(data.payments.reduce((s,p) => s + p.amount, 0));
      if (paid > amounts.total) throw new Error('Payment exceeds invoice total');
      if (paid < amounts.total && !customer) throw new Error('A customer is required for partial payment');
      const saleId = randomUUID(); const now = new Date().toISOString();
      const next = Number(this.store.get('SELECT count(*) n FROM sales')?.n) + 1;
      this.store.insert('sales', { id: saleId, request_id: data.request_id, invoice_number: `INV-${String(next).padStart(7,'0')}`, customer_id: data.customer_id, prescription_id: data.prescription_id, customer_snapshot: JSON.stringify(customer ? { name: customer.name, phone: customer.phone, address: customer.address } : { name: 'Guest', phone: '', address: '' }), prescription_snapshot: prescription ? JSON.stringify({ ...JSON.parse(String(prescription.data)), id: prescription.id, created_at: prescription.created_at, created_by: prescription.created_by }) : null, seller_id: user.id, ...amounts, notes: data.notes, created_at: now });
      const weights = products.map(p => p.unit_price * p.quantity); const discounts = allocate(data.discount, weights); const taxes = allocate(data.tax, weights);
      products.forEach(({p,item,unit_price,quantity}, i) => {
        this.store.insert('sale_items', { id: randomUUID(), sale_id: saleId, product_id: p.id, product_name: p.name, product_type: p.type, brand: p.brand, model_code: p.model_code, barcode: p.barcode, category_name: p.category_name, unit_price, unit_cost: p.unit_cost, quantity, subtotal: unit_price * quantity, net_total: unit_price * quantity - discounts[i] + taxes[i], tax_amount:taxes[i],discount_amount:discounts[i], notes: item.notes });
        moveStock(this.store, String(p.id), -quantity, 'sale', saleId, 'Checkout', user.id);
      });
      for (const payment of data.payments) this.addPayment(saleId, payment, user.id, 'sale_payment');
      this.store.audit(user.id, 'checkout', 'sales', saleId, null, { ...amounts, paid }); return saleId;
    });
  }
  private addPayment(saleId: string, payment: z.infer<typeof paymentSchema>, userId: string, type: string) {
    const paymentId = randomUUID();
    this.store.insert('payments', { id: paymentId, sale_id: saleId, ...payment, user_id: userId, created_at: new Date().toISOString() });
    if (payment.method === 'cash') cashEntry(this.store, payment.amount, type, paymentId, payment.notes, userId);
  }
  payment(input: unknown) {
    const user = this.auth.require('payments.create'); const data = paymentSchema.extend({ sale_id: id }).parse(input);
    this.store.tx(() => { if (data.amount > saleBalance(this.store, data.sale_id).balance) throw new Error('Payment exceeds remaining balance'); this.addPayment(data.sale_id, { amount: data.amount, method: data.method, notes: data.notes }, user.id, 'debt_payment'); this.store.audit(user.id, 'payment', 'sales', data.sale_id, null, data); });
  }
  reverse(input: unknown) {
    const user = this.auth.require('payments.reverse'); const data = z.object({ payment_id: id, reason: text.min(1) }).parse(input);
    this.store.tx(() => {
      const payment = this.store.get('SELECT * FROM payments WHERE id=?', data.payment_id);
      if (!payment || Number(payment.amount) <= 0 || this.store.get('SELECT id FROM payments WHERE reversal_of=?', data.payment_id)) throw new Error('Payment cannot be reversed');
      const reverseId = randomUUID();
      this.store.insert('payments', { id: reverseId, sale_id: payment.sale_id, amount: -Number(payment.amount), method: payment.method, notes: data.reason, user_id: user.id, reversal_of: data.payment_id, created_at: new Date().toISOString() });
      if (payment.method === 'cash') cashEntry(this.store, -Number(payment.amount), 'payment_reversal', reverseId, data.reason, user.id);
      this.store.audit(user.id, 'reverse', 'payments', data.payment_id, payment, { reason: data.reason });
    });
  }
  returnItems(input: unknown) {
    const user = this.auth.require('sales.return');
    const data = z.object({ sale_id: id, reason: text.min(1), method: z.enum(methods), items: z.array(z.object({ sale_item_id: id, quantity: z.number().int().min(1), restock: z.boolean() })).min(1).max(300) }).parse(input);
    if (new Set(data.items.map(i => i.sale_item_id)).size !== data.items.length) throw new Error('Duplicate return line');
    return this.store.tx(() => {
      const balance = saleBalance(this.store, data.sale_id); const returnId = randomUUID(); const now = new Date().toISOString(); let total = 0;
      const lines = data.items.map(item => {
        const original = this.store.get('SELECT * FROM sale_items WHERE id=? AND sale_id=?', item.sale_item_id, data.sale_id); if (!original) throw new Error('Invoice item not found');
        const returned = this.store.get('SELECT COALESCE(sum(quantity),0) quantity,COALESCE(sum(amount),0) amount,COALESCE(sum(tax_amount),0) tax_amount FROM return_items WHERE sale_item_id=?', item.sale_item_id)!;
        if (item.quantity + Number(returned.quantity) > Number(original.quantity)) throw new Error('Return exceeds remaining sold quantity');
        const cumulative = Number(BigInt(Number(original.net_total)) * BigInt(item.quantity + Number(returned.quantity)) / BigInt(Number(original.quantity)));
        const amount = cumulative - Number(returned.amount);
        const taxAmount=Number(BigInt(Number(original.tax_amount))*BigInt(item.quantity+Number(returned.quantity))/BigInt(Number(original.quantity)))-Number(returned.tax_amount);
        total += amount; return { item, original, amount, taxAmount };
      });
      this.store.insert('returns', { id: returnId, sale_id: data.sale_id, reason: data.reason, total, user_id: user.id, created_at: now });
      for (const { item, original, amount, taxAmount } of lines) {
        this.store.insert('return_items', { id: randomUUID(), return_id: returnId, sale_item_id: item.sale_item_id, quantity: item.quantity, amount,tax_amount:taxAmount, restock: Number(item.restock) });
        if (item.restock) moveStock(this.store, String(original.product_id), item.quantity, 'sale_return', returnId, data.reason, user.id);
      }
      const refund = Math.max(0, total - balance.balance);
      if (refund > 0) {
        this.store.insert('refunds', { id: randomUUID(), return_id: returnId, sale_id: data.sale_id, amount: refund, method: data.method, user_id: user.id, created_at: now });
        if (data.method === 'cash') cashEntry(this.store, -refund, 'refund', returnId, data.reason, user.id);
      }
      this.store.audit(user.id, 'return', 'sales', data.sale_id, balance, { return_id: returnId, total, refund }); return returnId;
    });
  }
  invoice(input: unknown) {
    this.auth.require('sales.view'); const saleId = id.parse(input); const sale = this.store.get('SELECT s.*,u.name seller_name FROM sales s JOIN users u ON u.id=s.seller_id WHERE s.id=?', saleId); if (!sale) throw new Error('Invoice not found');
    const items = this.store.all('SELECT si.*,COALESCE((SELECT sum(quantity) FROM return_items WHERE sale_item_id=si.id),0) returned_quantity FROM sale_items si WHERE sale_id=?', saleId);
    if (!this.auth.require().permissions.includes('reports.profit')) items.forEach(i => delete i.unit_cost);
    const canPrescription = this.auth.require().permissions.includes('prescriptions.view');
    if (!canPrescription) sale.prescription_snapshot = null;
    return { sale, items, payments: this.store.all('SELECT * FROM payments WHERE sale_id=? ORDER BY created_at', saleId), returns: this.store.all('SELECT * FROM returns WHERE sale_id=? ORDER BY created_at', saleId), ...saleBalance(this.store, saleId) };
  }
}
