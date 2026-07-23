import { supabase } from './supabase';
import { User as Employee, Reservation, Service, EmployeePayment } from '../types';

// ============================================================================
// CACHING STRATEGY
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

const cache = new Map<string, CacheEntry<any>>();

const CACHE_DURATION = {
  SHORT: 1 * 60 * 1000,      // 1 minute - for live data
  MEDIUM: 5 * 60 * 1000,     // 5 minutes - for semi-static data
  LONG: 30 * 60 * 1000,      // 30 minutes - for static data
} as const;

function getCacheKey(...parts: string[]): string {
  return parts.join(':');
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

function setInCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

function invalidateCache(pattern: string): void {
  const regex = new RegExp(pattern);
  for (const key of cache.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
    }
  }
}

// ============================================================================
// BATCH QUERIES & OPTIMIZATIONS
// ============================================================================

/**
 * Fetch all employees with caching
 */
export async function fetchEmployees(): Promise<Employee[]> {
  const cacheKey = getCacheKey('employees', 'all');
  const cached = getFromCache<Employee[]>(cacheKey);
  
  if (cached) return cached;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'admin');

  if (error) {
    console.error('Error fetching employees:', error);
    return [];
  }

  const employees: Employee[] = (data || []).map(p => ({
    id: p.id,
    username: p.username,
    email: p.email || '',
    fullName: p.full_name,
    role: p.role,
    avatarUrl: p.avatar_url,
    phone: p.phone,
    address: p.address,
    paymentType: p.payment_type,
    percentage: p.percentage,
    createdAt: p.created_at
  }));

  setInCache(cacheKey, employees, CACHE_DURATION.MEDIUM);
  return employees;
}

/**
 * Fetch employee payments for specific employee or date range
 */
export async function fetchEmployeePayments(
  employeeId?: string,
  dateRange?: { from: string; to: string }
): Promise<EmployeePayment[]> {
  const cacheKey = getCacheKey('payments', employeeId || 'all', dateRange?.from || '', dateRange?.to || '');
  const cached = getFromCache<EmployeePayment[]>(cacheKey);
  
  if (cached) return cached;

  let query = supabase.from('employee_payments').select('*');

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  if (dateRange) {
    query = query.gte('date', dateRange.from).lte('date', dateRange.to);
  }

  query = query.order('date', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching employee payments:', error);
    return [];
  }

  const payments: EmployeePayment[] = (data || []).map(p => ({
    id: p.id,
    employeeId: p.employee_id,
    amount: p.amount,
    type: p.type,
    description: p.description,
    date: p.date,
    createdAt: p.created_at
  }));

  setInCache(cacheKey, payments, CACHE_DURATION.SHORT);
  return payments;
}

/**
 * Fetch reservations with optional filtering
 */
export async function fetchReservations(filters?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  workerId?: string;
}): Promise<Reservation[]> {
  const cacheKey = getCacheKey('reservations', JSON.stringify(filters || {}));
  const cached = getFromCache<Reservation[]>(cacheKey);
  
  if (cached) return cached;

  // Use optimized view when available
  let query = supabase.from('reservations').select('*');

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.dateFrom && filters?.dateTo) {
    query = query.gte('date', filters.dateFrom).lte('date', filters.dateTo);
  }

  if (filters?.workerId) {
    query = query.eq('worker_id', filters.workerId);
  }

  query = query.order('date', { ascending: false }).limit(500);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching reservations:', error);
    return [];
  }

  const reservations: Reservation[] = (data || []).map(r => ({
    id: r.id,
    clientId: r.client_id || '',
    clientName: r.client_name,
    clientPhone: r.client_phone,
    prestationId: r.prestation_id,
    serviceIds: r.service_ids || [],
    date: r.date,
    time: r.time,
    totalPrice: r.total_price,
    paidAmount: r.paid_amount,
    status: r.status,
    workerId: r.worker_id,
    createdBy: r.created_by,
    finalizedAt: r.finalized_at
  }));

  setInCache(cacheKey, reservations, CACHE_DURATION.SHORT);
  return reservations;
}

/**
 * Fetch all services with caching
 */
export async function fetchServices(): Promise<Service[]> {
  const cacheKey = getCacheKey('services', 'all');
  const cached = getFromCache<Service[]>(cacheKey);
  
  if (cached) return cached;

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching services:', error);
    return [];
  }

  const services: Service[] = (data || []).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    price: s.price,
    createdAt: s.created_at
  }));

  setInCache(cacheKey, services, CACHE_DURATION.LONG);
  return services;
}

/**
 * Fetch prestations with caching
 */
export async function fetchPrestations(): Promise<any[]> {
  const cacheKey = getCacheKey('prestations', 'all');
  const cached = getFromCache<any[]>(cacheKey);
  
  if (cached) return cached;

  const { data, error } = await supabase
    .from('prestations')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching prestations:', error);
    return [];
  }

  setInCache(cacheKey, data || [], CACHE_DURATION.LONG);
  return data || [];
}

/**
 * Batch fetch multiple data types with Promise.all
 */
export async function fetchDashboardData() {
  const [employees, reservations, services, prestations] = await Promise.all([
    fetchEmployees(),
    fetchReservations({ dateFrom: new Date().toISOString().split('T')[0] }),
    fetchServices(),
    fetchPrestations(),
  ]);

  return { employees, reservations, services, prestations };
}

/**
 * Fetch date-range analytics efficiently
 */
export async function fetchReportData(dateRange: { from: string; to: string }) {
  const [reservations, payments, purchases, expenses] = await Promise.all([
    supabase
      .from('reservations')
      .select('*')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .then(({ data }) => data || []),
    
    supabase
      .from('employee_payments')
      .select('*')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .then(({ data }) => data || []),
    
    supabase
      .from('purchases')
      .select('*')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .then(({ data }) => data || []),
    
    supabase
      .from('expenses')
      .select('*')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .then(({ data }) => data || []),
  ]);

  return { reservations, payments, purchases, expenses };
}

/**
 * Batch insert operations
 */
export async function batchInsert(
  table: string,
  records: any[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from(table).insert(records);
    
    if (error) {
      return { success: false, error: error.message };
    }

    // Invalidate related cache
    invalidateCache(table);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Batch update operations
 */
export async function batchUpdate(
  table: string,
  records: any[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // Use Promise.all for parallel updates
    const results = await Promise.all(
      records.map(record =>
        supabase
          .from(table)
          .update(record)
          .eq('id', record.id)
      )
    );

    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      return { success: false, error: `${errors.length} update(s) failed` };
    }

    // Invalidate related cache
    invalidateCache(table);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Insert single record
 */
export async function insertRecord(
  table: string,
  record: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(table)
      .insert([record])
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    invalidateCache(table);
    
    return { success: true, data: data?.[0] };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Update single record
 */
export async function updateRecord(
  table: string,
  id: string,
  updates: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from(table)
      .update(updates)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    invalidateCache(table);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Delete single record
 */
export async function deleteRecord(
  table: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    invalidateCache(table);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Fetch with pagination
 */
export async function fetchWithPagination(
  table: string,
  page: number = 1,
  pageSize: number = 50,
  orderBy?: { column: string; ascending?: boolean }
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from(table).select('*', { count: 'exact' });

  if (orderBy) {
    query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    return { data: [], count: 0, error: error.message };
  }

  return {
    data: data || [],
    count: count || 0,
    pageCount: Math.ceil((count || 0) / pageSize),
    currentPage: page,
  };
}

/**
 * Clear specific cache
 */
export function clearCache(pattern?: string): void {
  if (pattern) {
    invalidateCache(pattern);
  } else {
    cache.clear();
  }
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type { CacheEntry, CACHE_DURATION };
