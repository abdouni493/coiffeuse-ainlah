import { supabase } from './supabase';

/** Public image buckets created by schema.sql. */
export type ImageBucket = 'logos' | 'avatars' | 'products';

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Uploads an image to a Supabase Storage bucket and returns its public URL.
 * Falls back to an inline data URL if the upload fails (e.g. buckets not yet
 * created), so the UI keeps working.
 */
export async function uploadImage(bucket: ImageBucket, file: File, prefix = ''): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${prefix ? prefix + '/' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type || undefined, cacheControl: '3600' });
  if (error) {
    console.error(`[storage] upload to "${bucket}" failed, using inline image:`, error);
    return readAsDataUrl(file);
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
