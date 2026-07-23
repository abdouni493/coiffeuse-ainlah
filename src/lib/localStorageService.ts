/**
 * Complete offline-first localStorage database service.
 * Mimics the Supabase client API so all components work without changes.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type DB = Record<string, any[]>;

type Filter =
  | { type: 'eq';  col: string; val: any }
  | { type: 'neq'; col: string; val: any }
  | { type: 'gte'; col: string; val: any }
  | { type: 'lte'; col: string; val: any }
  | { type: 'in';  col: string; vals: any[] }
  | { type: 'or';  str: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY    = 'salon_app_db';
const SESSION_KEY    = 'salon_session';
const ACTIVE_TAB_KEY = 'salon_active_tab';

const TABLE_NAMES = [
  'profiles', 'auth_users', 'store_config',
  'prestations', 'services',
  'reservations', 'reservation_products', 'reservation_workers',
  'products', 'product_categories', 'product_brands',
  'product_purchases', 'product_purchase_items', 'purchase_payments',
  'product_sales', 'sale_items', 'sale_payments',
  'clients', 'suppliers', 'purchases',
  'expenses', 'employee_payments',
] as const;

// ─── Relationships ────────────────────────────────────────────────────────────
// Each entry: { name: embedded field name, type: 'mto'|'otm', localKey, targetTable, targetKey }
// mto = many-to-one (FK on local table) → single record result
// otm = one-to-many (FK on target table) → array result

const RELATIONS: Record<string, Array<{
  name: string;
  type: 'mto' | 'otm';
  localKey: string;
  targetTable: string;
  targetKey: string;
}>> = {
  products: [
    { name: 'product_categories', type: 'mto', localKey: 'category_id',  targetTable: 'product_categories', targetKey: 'id' },
    { name: 'product_brands',     type: 'mto', localKey: 'brand_id',     targetTable: 'product_brands',     targetKey: 'id' },
  ],
  product_purchase_items: [
    { name: 'product_purchases', type: 'mto', localKey: 'purchase_id', targetTable: 'product_purchases', targetKey: 'id' },
    { name: 'products',          type: 'mto', localKey: 'product_id',  targetTable: 'products',          targetKey: 'id' },
  ],
  product_purchases: [
    { name: 'suppliers',             type: 'mto', localKey: 'supplier_id', targetTable: 'suppliers',             targetKey: 'id' },
    { name: 'product_purchase_items',type: 'otm', localKey: 'id',          targetTable: 'product_purchase_items',targetKey: 'purchase_id' },
    { name: 'purchase_payments',     type: 'otm', localKey: 'id',          targetTable: 'purchase_payments',     targetKey: 'purchase_id' },
  ],
  product_sales: [
    { name: 'sale_items',    type: 'otm', localKey: 'id', targetTable: 'sale_items',    targetKey: 'sale_id' },
    { name: 'sale_payments', type: 'otm', localKey: 'id', targetTable: 'sale_payments', targetKey: 'sale_id' },
  ],
  sale_items: [
    { name: 'products', type: 'mto', localKey: 'product_id', targetTable: 'products', targetKey: 'id' },
  ],
  reservations: [
    { name: 'prestations', type: 'mto', localKey: 'prestation_id', targetTable: 'prestations', targetKey: 'id' },
  ],
  employee_payments: [
    { name: 'profiles', type: 'mto', localKey: 'employee_id', targetTable: 'profiles', targetKey: 'id' },
  ],
  purchases: [
    { name: 'suppliers', type: 'mto', localKey: 'supplier_id', targetTable: 'suppliers', targetKey: 'id' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function matchFilter(item: any, filter: Filter): boolean {
  switch (filter.type) {
    case 'eq':  return item[filter.col] === filter.val;
    case 'neq': return item[filter.col] !== filter.val;
    case 'gte': return item[filter.col] >= filter.val;
    case 'lte': return item[filter.col] <= filter.val;
    case 'in':  return filter.vals.includes(item[filter.col]);
    case 'or':  return matchOrFilter(item, filter.str);
  }
}

function matchOrFilter(item: any, orStr: string): boolean {
  const parts = orStr.split(',');
  return parts.some(part => {
    const firstDot  = part.indexOf('.');
    const secondDot = part.indexOf('.', firstDot + 1);
    if (firstDot < 0 || secondDot < 0) return false;
    const col = part.slice(0, firstDot).trim();
    const op  = part.slice(firstDot + 1, secondDot).trim();
    const val = part.slice(secondDot + 1).trim();
    const fieldVal = String(item[col] ?? '');
    if (op === 'ilike') {
      const pattern = val.replace(/%/g, '').toLowerCase();
      return fieldVal.toLowerCase().includes(pattern);
    }
    if (op === 'eq')  return fieldVal === val;
    if (op === 'neq') return fieldVal !== val;
    return false;
  });
}

// Split string at top-level commas (ignoring commas inside parentheses)
function splitTopLevel(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// Parse a Supabase-style select string into plain columns and embedded tables
function parseSelect(str: string): { cols: string[]; embeds: Array<{ name: string; sub: string }> } {
  const cols: string[] = [];
  const embeds: Array<{ name: string; sub: string }> = [];
  const parts = splitTopLevel(str);
  for (const part of parts) {
    const parenIdx = part.indexOf('(');
    if (parenIdx > -1) {
      const name = part.slice(0, parenIdx).trim();
      const sub  = part.slice(parenIdx + 1, part.lastIndexOf(')')).trim();
      embeds.push({ name, sub });
    } else if (part) {
      cols.push(part);
    }
  }
  return { cols, embeds };
}

// Recursively apply a select string (with embeds) to an array of records
function applySelect(db: DB, tableName: string, records: any[], selectStr: string): any[] {
  if (!records.length) return records;
  const { cols, embeds } = parseSelect(selectStr);
  const relations = RELATIONS[tableName] || [];

  return records.map(record => {
    // Filter columns on the base record
    let result: any;
    if (cols.includes('*') || cols.length === 0) {
      result = { ...record };
    } else {
      result = {} as any;
      cols.forEach(col => { result[col] = record[col]; });
    }

    // Resolve embedded relations
    for (const embed of embeds) {
      const rel = relations.find(r => r.name === embed.name);
      if (!rel) continue;
      const targetTable = db[rel.targetTable] || [];

      if (rel.type === 'mto') {
        const related = targetTable.find((t: any) => t[rel.targetKey] === record[rel.localKey]);
        if (related) {
          const [resolved] = applySelect(db, rel.targetTable, [related], embed.sub);
          result[embed.name] = resolved ?? null;
        } else {
          result[embed.name] = null;
        }
      } else {
        const relatedItems = targetTable.filter((t: any) => t[rel.targetKey] === record[rel.localKey]);
        result[embed.name] = applySelect(db, rel.targetTable, relatedItems, embed.sub);
      }
    }

    return result;
  });
}

// ─── Query Builders ───────────────────────────────────────────────────────────

class SelectQuery {
  private _selectStr = '*';
  private _filters: Filter[] = [];
  private _orderCol?: string;
  private _orderAsc = true;
  private _limitVal?: number;
  private _rangeFrom?: number;
  private _rangeTo?: number;

  constructor(
    private readonly _db: DB,
    private readonly _table: string,
    selectStr?: string,
  ) {
    if (selectStr) this._selectStr = selectStr;
  }

  eq(col: string, val: any)               { this._filters.push({ type: 'eq',  col, val  }); return this; }
  neq(col: string, val: any)              { this._filters.push({ type: 'neq', col, val  }); return this; }
  gte(col: string, val: any)              { this._filters.push({ type: 'gte', col, val  }); return this; }
  lte(col: string, val: any)              { this._filters.push({ type: 'lte', col, val  }); return this; }
  in(col: string, vals: any[])            { this._filters.push({ type: 'in',  col, vals }); return this; }
  or(str: string)                         { this._filters.push({ type: 'or',  str       }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this._orderCol = col;
    this._orderAsc = opts?.ascending ?? true;
    return this;
  }

  limit(n: number)              { this._limitVal  = n;   return this; }
  range(from: number, to: number) { this._rangeFrom = from; this._rangeTo = to; return this; }

  async single() {
    const { data } = await this._execute();
    return { data: data[0] ?? null, error: null };
  }

  then(resolve: (r: any) => any, reject?: (e: any) => any) {
    return this._execute().then(resolve, reject);
  }

  private async _execute(): Promise<{ data: any[]; error: null; count: number }> {
    const table = this._db[this._table] || [];
    let items = [...table];

    // Filters
    items = items.filter(item => this._filters.every(f => matchFilter(item, f)));

    // Order
    if (this._orderCol) {
      const col = this._orderCol;
      const asc = this._orderAsc;
      items.sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return asc ? -1 : 1;
        if (bv == null) return asc ? 1  : -1;
        if (av < bv)   return asc ? -1 : 1;
        if (av > bv)   return asc ? 1  : -1;
        return 0;
      });
    }

    // Pagination
    if (this._rangeFrom != null && this._rangeTo != null) {
      items = items.slice(this._rangeFrom, this._rangeTo + 1);
    } else if (this._limitVal != null) {
      items = items.slice(0, this._limitVal);
    }

    // Select + joins
    const resolved = applySelect(this._db, this._table, items, this._selectStr);
    return { data: resolved, error: null, count: resolved.length };
  }
}

// ── Insert ─────────────────────────────────────────────────────────────────

class InsertSelectQuery {
  constructor(
    private readonly _db: DB,
    private readonly _table: string,
    private readonly _save: () => void,
    private readonly _records: any[],
    private readonly _selectStr: string,
  ) {}

  async single() {
    const { data } = await this._execute();
    return { data: data[0] ?? null, error: null };
  }

  then(resolve: (r: any) => any, reject?: (e: any) => any) {
    return this._execute().then(resolve, reject);
  }

  private async _execute() {
    const table = this._db[this._table];
    if (!table) return { data: [] as any[], error: null };
    const inserted: any[] = [];
    for (const rec of this._records) {
      const row = { id: generateId(), created_at: new Date().toISOString(), ...rec };
      table.push(row);
      inserted.push(row);
    }
    this._save();
    const resolved = applySelect(this._db, this._table, inserted, this._selectStr);
    return { data: resolved, error: null };
  }
}

class InsertQuery {
  constructor(
    private readonly _db: DB,
    private readonly _table: string,
    private readonly _save: () => void,
    private readonly _records: any[],
  ) {}

  select(str = '*') {
    return new InsertSelectQuery(this._db, this._table, this._save, this._records, str);
  }

  then(resolve: (r: any) => any, reject?: (e: any) => any) {
    return this._execute().then(resolve, reject);
  }

  private async _execute() {
    const table = this._db[this._table];
    if (!table) return { data: null, error: null };
    for (const rec of this._records) {
      table.push({ id: generateId(), created_at: new Date().toISOString(), ...rec });
    }
    this._save();
    return { data: null, error: null };
  }
}

// ── Update ─────────────────────────────────────────────────────────────────

class UpdateQuery {
  private _filters: Filter[] = [];

  constructor(
    private readonly _db: DB,
    private readonly _table: string,
    private readonly _save: () => void,
    private readonly _updates: any,
  ) {}

  eq(col: string, val: any)  { this._filters.push({ type: 'eq', col, val }); return this; }
  neq(col: string, val: any) { this._filters.push({ type: 'neq', col, val }); return this; }

  then(resolve: (r: any) => any, reject?: (e: any) => any) {
    return this._execute().then(resolve, reject);
  }

  private async _execute() {
    const table = this._db[this._table];
    if (!table) return { data: null, error: null };
    for (const item of table) {
      if (this._filters.every(f => matchFilter(item, f))) {
        Object.assign(item, this._updates);
      }
    }
    this._save();
    return { data: null, error: null };
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────

class DeleteQuery {
  private _filters: Filter[] = [];
  private _returnDeleted = false;

  constructor(
    private readonly _db: DB,
    private readonly _table: string,
    private readonly _save: () => void,
  ) {}

  eq(col: string, val: any)  { this._filters.push({ type: 'eq', col, val }); return this; }
  neq(col: string, val: any) { this._filters.push({ type: 'neq', col, val }); return this; }

  // Allow .delete().eq(...).select() chains — returns deleted rows
  select() { this._returnDeleted = true; return this; }

  then(resolve: (r: any) => any, reject?: (e: any) => any) {
    return this._execute().then(resolve, reject);
  }

  private async _execute() {
    const table = this._db[this._table];
    if (!table) return { data: this._returnDeleted ? [] : null, error: null };

    const toRemove: number[] = [];
    const deleted: any[] = [];

    table.forEach((item: any, i: number) => {
      if (this._filters.every(f => matchFilter(item, f))) {
        toRemove.push(i);
        if (this._returnDeleted) deleted.push({ ...item });
      }
    });

    toRemove.reverse().forEach(i => table.splice(i, 1));
    this._save();
    return { data: this._returnDeleted ? deleted : null, error: null };
  }
}

// ── Upsert ─────────────────────────────────────────────────────────────────

class UpsertQuery {
  constructor(
    private readonly _db: DB,
    private readonly _table: string,
    private readonly _save: () => void,
    private readonly _record: any,
    private readonly _options?: { onConflict?: string },
  ) {}

  then(resolve: (r: any) => any, reject?: (e: any) => any) {
    return this._execute().then(resolve, reject);
  }

  private async _execute() {
    const table = this._db[this._table];
    if (!table) return { data: null, error: null };

    const conflictCols = (this._options?.onConflict ?? 'id')
      .split(',').map(s => s.trim()).filter(Boolean);

    const existingIdx = table.findIndex((item: any) =>
      conflictCols.every(col => item[col] !== undefined && item[col] === this._record[col])
    );

    if (existingIdx >= 0) {
      Object.assign(table[existingIdx], this._record);
    } else {
      table.push({ id: generateId(), created_at: new Date().toISOString(), ...this._record });
    }
    this._save();
    return { data: null, error: null };
  }
}

// ── Table Accessor ─────────────────────────────────────────────────────────

class TableAccessor {
  constructor(
    private readonly _db: DB,
    private readonly _table: string,
    private readonly _save: () => void,
  ) {}

  select(str = '*')             { return new SelectQuery(this._db, this._table, str); }
  insert(records: any[])        { return new InsertQuery(this._db, this._table, this._save, records); }
  update(updates: any)          { return new UpdateQuery(this._db, this._table, this._save, updates); }
  delete()                      { return new DeleteQuery(this._db, this._table, this._save); }
  upsert(record: any, opts?: { onConflict?: string }) {
    return new UpsertQuery(this._db, this._table, this._save, record, opts);
  }
}

// ─── Main Service Class ───────────────────────────────────────────────────────

class LocalStorageService {
  private _db: DB;
  private _currentSession: any = null;
  private _authListeners: Array<(event: string, session: any) => void> = [];

  constructor() {
    this._db = this._loadDB();
    this._initTables();
    this._initDefaultConfig();
    this._currentSession = this._loadSession();
  }

  // ── Persistence ────────────────────────────────────────────────────────

  private _loadDB(): DB {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  }

  private _saveDB = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._db));
    } catch (err) {
      console.error('localStorage save failed:', err);
    }
  };

  private _initTables(): void {
    for (const name of TABLE_NAMES) {
      if (!Array.isArray(this._db[name])) this._db[name] = [];
    }
    this._saveDB();
  }

  private _initDefaultConfig(): void {
    // Migrate: normalize any string '1' id to number 1
    this._db.store_config.forEach((cfg: any) => {
      if (cfg.id === '1') cfg.id = 1;
    });

    // Initialize store_config only if empty
    if (this._db.store_config.length === 0) {
      this._db.store_config.push({
        id: 1,
        name: 'Salon de Beauté',
        slogan: 'Votre beauté est notre priorité',
        phone: '',
        location: '',
        facebook: '',
        instagram: '',
        tiktok: '',
        logo_url: null,
        created_at: new Date().toISOString(),
      });
      this._saveDB();
    }
  }

  // ── Session persistence ─────────────────────────────────────────────────

  private _loadSession(): any {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private _persistSession(session: any): void {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
  }

  // ── Auth ───────────────────────────────────────────────────────────────

  auth = {
    signInWithPassword: async (creds: { email: string; password: string }) => {
      const user = this._db.auth_users.find(
        (u: any) => u.email === creds.email && u.password === creds.password,
      );
      if (!user) return { data: null, error: { message: 'Email ou mot de passe incorrect' } };

      const session = {
        user: { id: user.id, email: user.email },
        access_token: `token_${user.id}`,
      };
      this._currentSession = session;
      this._persistSession(session);
      this._authListeners.forEach(l => l('SIGNED_IN', session));
      return { data: session, error: null };
    },

    signUp: async (creds: { email: string; password: string }) => {
      const existing = this._db.auth_users.find((u: any) => u.email === creds.email);
      if (existing) return { data: null, error: { message: 'Cet email est déjà utilisé' } };

      const id = generateId();
      const newUser = { id, email: creds.email, password: creds.password, created_at: new Date().toISOString() };
      this._db.auth_users.push(newUser);
      this._saveDB();
      return { data: { user: { id, email: creds.email } }, error: null };
    },

    getSession: async () => {
      return { data: { session: this._currentSession }, error: null };
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      this._authListeners.push(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              this._authListeners = this._authListeners.filter(l => l !== callback);
            },
          },
        },
      };
    },

    signOut: async () => {
      this._currentSession = null;
      this._persistSession(null);
      this._authListeners.forEach(l => l('SIGNED_OUT', null));
      return { error: null };
    },
  };

  // ── Table accessor ─────────────────────────────────────────────────────

  from(table: string): TableAccessor {
    // Alias: salon_config → store_config
    const resolved = table === 'salon_config' ? 'store_config' : table;
    // Ensure table exists
    if (!Array.isArray(this._db[resolved])) this._db[resolved] = [];
    return new TableAccessor(this._db, resolved, this._saveDB);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const localStorageService = new LocalStorageService();

export const supabase = {
  from: localStorageService.from.bind(localStorageService),
  auth: localStorageService.auth,
};

// Re-export helpers for external use
export { ACTIVE_TAB_KEY, SESSION_KEY };
