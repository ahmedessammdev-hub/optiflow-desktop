import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from '../database/database';
import type { Session } from '../shared/schemas';
export const permissions = ['dashboard.view','customers.view','customers.create','customers.update','customers.archive','prescriptions.view','prescriptions.create','products.view','products.create','products.update','products.archive','inventory.view','inventory.adjust','sales.view','sales.create','sales.discount','sales.override_price','sales.return','payments.view','payments.create','payments.reverse','purchases.view','purchases.create','expenses.view','expenses.create','cash.view','cash.manage','reports.view','reports.profit','users.manage','settings.manage','backup.manage','audit.view'] as const;
const roles: Record<string, readonly string[]> = {
  admin: permissions, manager: permissions.filter(p => !['users.manage','backup.manage'].includes(p)),
  sales: ['customers.view','customers.create','prescriptions.view','prescriptions.create','products.view','sales.view','sales.create'],
  inventory: ['products.view','products.create','products.update','inventory.view','inventory.adjust','purchases.view','purchases.create'],
  cashier: ['customers.view','sales.view','payments.view','payments.create','cash.view','cash.manage']
};
function hash(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function verify(password: string, value: string) { const [salt, digest] = value.split(':'); return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex')); }
const credentials = z.object({ username: z.string().trim().min(3).max(100), password: z.string().min(10).max(200), name: z.string().trim().min(1).max(100) });
export class Auth {
  private current: Session | null = null;
  private lastActivity = 0;
  private failures = 0;
  private blockedUntil = 0;
  constructor(private store: Store) {
    store.tx(() => {
      for (const p of permissions) store.run('INSERT OR IGNORE INTO permissions VALUES (?)', p);
      for (const [role, rights] of Object.entries(roles)) {
        store.run('INSERT OR IGNORE INTO roles VALUES (?,?)', role, role);
        for (const p of rights) store.run('INSERT OR IGNORE INTO role_permissions VALUES (?,?)', role, p);
      }
    });
  }
  needsSetup() { return Number(this.store.get('SELECT count(*) n FROM users')?.n) === 0; }
  setup(input: unknown) {
    const data = credentials.parse(input);
    return this.store.tx(() => { if (!this.needsSetup()) throw new Error('Setup is already complete'); return this.create(data, 'admin'); });
  }
  private create(data: z.infer<typeof credentials>, role: string) {
    const id = randomUUID();
    this.store.insert('users', { id, name: data.name, username: data.username, password_hash: hash(data.password), created_at: new Date().toISOString() });
    this.store.run('INSERT INTO user_roles VALUES (?,?)', id, role);
    this.store.audit(this.current?.id ?? id, 'create', 'users', id, null, { name: data.name, role });
    return id;
  }
  login(input: unknown): Session {
    const { username, password } = z.object({ username: z.string().max(100), password: z.string().max(200) }).parse(input);
    if (Date.now() < this.blockedUntil) throw new Error('Too many attempts. Try again in 30 seconds.');
    const user = this.store.get('SELECT * FROM users WHERE username=? AND archived_at IS NULL', username);
    if (!user || Number(user.locked_until) > Date.now() || !verify(password, String(user.password_hash))) {
      this.failures++;
      if (this.failures >= 5) { this.blockedUntil = Date.now() + 30000; this.failures = 0; }
      if (user) this.store.run('UPDATE users SET failed_attempts=failed_attempts+1, locked_until=? WHERE id=?', this.blockedUntil, String(user.id));
      throw new Error('Invalid credentials or account temporarily locked');
    }
    this.failures = 0;
    this.store.run('UPDATE users SET failed_attempts=0, locked_until=0 WHERE id=?', String(user.id));
    this.current = this.load(String(user.id)); this.lastActivity = Date.now();
    this.store.audit(this.current.id, 'login', 'users', this.current.id);
    return this.current;
  }
  private load(id: string): Session {
    const user = this.store.get('SELECT id,name FROM users WHERE id=? AND archived_at IS NULL', id);
    if (!user) throw new Error('Session expired');
    return { id, name: String(user.name), permissions: this.store.all('SELECT DISTINCT permission_id FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?', id).map(r => String(r.permission_id)) };
  }
  session() { if (!this.current || Date.now() - this.lastActivity > 30 * 60 * 1000) { this.current = null; return null; } this.current = this.load(this.current.id); return this.current; }
  require(permission?: string) { const user = this.session(); if (!user) throw new Error('Login required'); if (permission && !user.permissions.includes(permission)) throw new Error('Permission denied'); this.lastActivity = Date.now(); return user; }
  logout() { this.current = null; }
  manage(input: unknown) {
    this.require('users.manage');
    const data = credentials.extend({ role: z.enum(['admin','manager','sales','inventory','cashier']) }).parse(input);
    return this.store.tx(() => this.create(data, data.role));
  }
  changePassword(input: unknown) {
    const user = this.require();
    const data = z.object({ current_password: z.string().max(200), password: z.string().min(10).max(200) }).parse(input);
    const stored = this.store.get('SELECT password_hash FROM users WHERE id=?', user.id)!;
    if (!verify(data.current_password, String(stored.password_hash))) throw new Error('Incorrect current password');
    this.store.tx(() => { this.store.run('UPDATE users SET password_hash=? WHERE id=?', hash(data.password), user.id); this.store.audit(user.id, 'password_change', 'users', user.id); });
  }
}
