import { z } from 'zod';
import { Store } from '../database/database';
import { Auth } from './auth';
import { querySchema, settingsSchema, id, type Settings, type Page } from '../shared/schemas';
import { periodRange, periods } from '../shared/dates';
import { growth } from '../shared/money';
import { defaultSettings } from '../shared/defaults';
const balanceSql = `s.total-COALESCE((SELECT sum(total) FROM returns WHERE sale_id=s.id),0)-COALESCE((SELECT sum(amount) FROM payments WHERE sale_id=s.id),0)+COALESCE((SELECT sum(amount) FROM refunds WHERE sale_id=s.id),0)`;
const reports = {
  sales: { permission:'sales.view', sql:`SELECT s.*,json_extract(customer_snapshot,'$.name') customer_name,${balanceSql} balance FROM sales s`, search:['invoice_number','customer_name'], date:'created_at' },
  payments:{permission:'payments.view',sql:'SELECT p.*,s.invoice_number FROM payments p JOIN sales s ON s.id=p.sale_id',search:['invoice_number','method','notes'],date:'created_at'},
  expenses:{permission:'expenses.view',sql:'SELECT * FROM expenses',search:['category','description','method'],date:'created_at'},
  inventory:{permission:'inventory.view',sql:'SELECT m.*,p.name FROM inventory_movements m JOIN products p ON p.id=m.product_id',search:['name','type','reason'],date:'created_at'},
  purchases:{permission:'purchases.view',sql:'SELECT p.*,s.name supplier_name FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id',search:['invoice_number','supplier_name','status'],date:'created_at'},
  returns:{permission:'sales.view',sql:'SELECT r.*,s.invoice_number FROM returns r JOIN sales s ON s.id=r.sale_id',search:['invoice_number','reason'],date:'created_at'},
  cash:{permission:'cash.view',sql:'SELECT * FROM cash_transactions',search:['type','reason'],date:'created_at'},
  audit:{permission:'audit.view',sql:'SELECT * FROM audit_logs',search:['action','entity','entity_id'],date:'created_at'},
  debts:{permission:'reports.view',sql:`SELECT s.id,s.invoice_number,s.customer_id,json_extract(customer_snapshot,'$.name') customer_name,${balanceSql} balance,s.created_at FROM sales s WHERE (${balanceSql})>0`,search:['invoice_number','customer_name'],date:'created_at'},
  users:{permission:'users.manage',sql:"SELECT u.id,u.name,u.username,u.created_at,u.archived_at,group_concat(ur.role_id) roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id GROUP BY u.id",search:['name','username'],date:'created_at'},
  backups:{permission:'backup.manage',sql:'SELECT * FROM backup_history',search:['file_name'],date:'created_at'},
  sessions:{permission:'cash.view',sql:'SELECT *,opened_at created_at FROM cash_sessions',search:['id'],date:'created_at'}
} as const;
export type Report = keyof typeof reports;
export class Queries {
  constructor(private store: Store, private auth: Auth) {}
  settings(): Settings { this.auth.require(); return this.readSettings(); }
  readSettings(): Settings { const value=this.store.get("SELECT value FROM app_settings WHERE key='settings'")?.value; return value ? settingsSchema.parse(JSON.parse(String(value))) : defaultSettings; }
  saveSettings(input: unknown) { const user=this.auth.require('settings.manage'); const data=settingsSchema.parse(input); this.store.tx(()=>{const before=this.readSettings(); this.store.run("INSERT INTO app_settings VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(data));this.store.audit(user.id,'update','settings','settings',before,data);}); }
  list(kind: Report,input:unknown): Page {
    const report=reports[kind]; if (!report) throw new Error('Unknown report'); this.auth.require(report.permission); const q=querySchema.parse(input);
    const clauses=[`(${report.search.map(k=>`${k} LIKE ?`).join(' OR ')})`]; const params:(string|number)[]=report.search.map(()=>`%${q.search}%`);
    if(q.from){clauses.push(`${report.date}>=?`);params.push(periodRange('custom',this.readSettings().timezone,new Date(),{from:q.from,to:q.from}).start);}
    if(q.to){clauses.push(`${report.date}<?`);params.push(periodRange('custom',this.readSettings().timezone,new Date(),{from:q.to,to:q.to}).end);}
    if(q.customer_id && ['sales','debts'].includes(kind)){clauses.push('customer_id=?');params.push(q.customer_id);}
    const sql=`SELECT * FROM (${report.sql}) WHERE ${clauses.join(' AND ')}`;
    return { rows:this.store.all(`${sql} ORDER BY ${report.date} ${q.direction},id LIMIT ? OFFSET ?`,...params,q.page_size,(q.page-1)*q.page_size),total:Number(this.store.get(`SELECT count(*) n FROM (${sql})`,...params)?.n),page:q.page,page_size:q.page_size };
  }
  lowStock() { this.auth.require('inventory.view'); return this.store.all('SELECT p.id,p.name,p.sku,p.stock_quantity,COALESCE(p.reorder_level,c.reorder_level,?) reorder_level FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.archived_at IS NULL AND p.stock_quantity<=COALESCE(p.reorder_level,c.reorder_level,?) ORDER BY p.stock_quantity LIMIT 100',this.readSettings().reorder_level,this.readSettings().reorder_level); }
  dashboard(input:unknown) {
    this.auth.require('dashboard.view'); const data=z.object({period:z.enum(periods),from:z.string().date().optional(),to:z.string().date().optional()}).parse(input);
    const range=periodRange(data.period,this.readSettings().timezone,new Date(),data.from&&data.to?{from:data.from,to:data.to}:undefined);
    const aggregate=(start:string,end:string)=>{
      const sale=this.store.get('SELECT COALESCE(sum(total-tax),0) revenue,count(*) sales,COALESCE(sum(total),0) invoiced FROM sales WHERE created_at>=? AND created_at<?',start,end)!;
      const cost=Number(this.store.get('SELECT COALESCE(sum(i.unit_cost*i.quantity),0) n FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.created_at>=? AND s.created_at<?',start,end)?.n);
      const returned=this.store.get('SELECT COALESCE(sum(ri.amount),0) total,COALESCE(sum(si.unit_cost*ri.quantity),0) cost FROM return_items ri JOIN returns r ON r.id=ri.return_id JOIN sale_items si ON si.id=ri.sale_item_id WHERE r.created_at>=? AND r.created_at<?',start,end)!;
      const returnRevenue=Number(this.store.get('SELECT COALESCE(sum(ri.amount-ri.tax_amount),0) n FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.created_at>=? AND r.created_at<?',start,end)?.n);
      const revenue=Number(sale.revenue)-returnRevenue; const cogs=cost-Number(returned.cost);
      const sum=(table:string)=>Number(this.store.get(`SELECT COALESCE(sum(amount),0) n FROM ${table} WHERE created_at>=? AND created_at<?`,start,end)?.n);
      return {revenue,cogs,profit:revenue-cogs,sales:Number(sale.sales),average_order:Number(sale.sales)?Math.round(Number(sale.invoiced)/Number(sale.sales)):0,collected:sum('payments'),expenses:sum('expenses'),refunds:sum('refunds'),cash_movement:sum('cash_transactions'),new_customers:Number(this.store.get('SELECT count(*) n FROM customers WHERE created_at>=? AND created_at<?',start,end)?.n)};
    };
    const current=aggregate(range.start,range.end);const previous=aggregate(range.previous_start,range.previous_end);
    const profitAllowed=this.auth.require().permissions.includes('reports.profit');
    const metrics:Record<string,number|null>={...current,debt:Number(this.store.get(`SELECT COALESCE(sum(${balanceSql}),0) n FROM sales s`)?.n),revenue_growth:growth(current.revenue,previous.revenue)};
    const unknownCosts=Number(this.store.get('SELECT count(*) n FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.historical_cost_known=0 AND s.created_at>=? AND s.created_at<?',range.previous_start,range.end)?.n);
    if(profitAllowed){metrics.profit_growth=unknownCosts?null:growth(current.profit,previous.profit);if(unknownCosts){metrics.profit=null;metrics.cogs=null;}}else{delete metrics.profit;delete metrics.cogs;}
    const timezone=this.readSettings().timezone;
    return {range,metrics,unknown_costs:unknownCosts,trend:this.store.all("SELECT business_date(created_at,?) day,sum(revenue) revenue,sum(sales_count) sales FROM (SELECT created_at,total-tax revenue,1 sales_count FROM sales UNION ALL SELECT r.created_at,-sum(ri.amount-ri.tax_amount) revenue,0 sales_count FROM returns r JOIN return_items ri ON ri.return_id=r.id GROUP BY r.id) WHERE created_at>=? AND created_at<? GROUP BY business_date(created_at,?) ORDER BY day",timezone,range.start,range.end,timezone),by_type:this.store.all('SELECT name,sum(amount) amount FROM (SELECT i.product_type name,i.net_total-i.tax_amount amount,s.created_at FROM sale_items i JOIN sales s ON s.id=i.sale_id UNION ALL SELECT i.product_type,-(ri.amount-ri.tax_amount),r.created_at FROM return_items ri JOIN sale_items i ON i.id=ri.sale_item_id JOIN returns r ON r.id=ri.return_id) WHERE created_at>=? AND created_at<? GROUP BY name',range.start,range.end),payment_methods:this.store.all('SELECT method name,sum(amount) amount FROM payments WHERE created_at>=? AND created_at<? GROUP BY method',range.start,range.end)};
  }
  statement(input:unknown) {
    this.auth.require('customers.view');this.auth.require('payments.view');const customerId=id.parse(input);
    const rows=this.store.all(`SELECT id,created_at,'invoice' type,total debit,0 credit FROM sales WHERE customer_id=? UNION ALL SELECT p.id,p.created_at,'payment',0,p.amount FROM payments p JOIN sales s ON s.id=p.sale_id WHERE s.customer_id=? UNION ALL SELECT r.id,r.created_at,'return',0,r.total FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=? UNION ALL SELECT r.id,r.created_at,'refund',r.amount,0 FROM refunds r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=? ORDER BY created_at,id`,customerId,customerId,customerId,customerId);
    let balance=0;return rows.map(r=>{balance+=Number(r.debit)-Number(r.credit);return {...r,balance};});
  }
}
