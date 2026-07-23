import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from './supabase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | undefined | null): string {
  if (!value && value !== 0) return '0,00 DA';
  return new Intl.NumberFormat('fr-DZ', { 
    style: 'currency', 
    currency: 'DZD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export async function fetchUserProfile(userId: string) {
  try {
    console.log(`[FETCH PROFILE] Fetching profile for user: ${userId}`);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, role, avatar_url, phone, address, payment_type, percentage, daily_rate, monthly_rate, permissions, created_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error(`[FETCH PROFILE] Error:`, error);
      return null;
    }

    // Handle empty result set - no profile found
    if (!data) {
      console.warn(`[FETCH PROFILE] No profile found for user ${userId}`);
      return null;
    }

    console.log(`[FETCH PROFILE] ✅ Successfully fetched profile for user: ${data.username}`);
    return data;
  } catch (err) {
    console.error(`[FETCH PROFILE] Exception:`, err);
    throw err;
  }
}

