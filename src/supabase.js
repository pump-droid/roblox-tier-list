import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key && /^https:\/\//.test(url));
export const supabase = configured ? createClient(url, key, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } }
}) : null;

export function avatarUrl(path) {
  if (!path || !configured) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
export function errorText(error) {
  if (!error) return '';
  const message = String(error.message || error);
  if (/duplicate key|already registered|already exists/i.test(message)) return 'Учётная запись или ник уже существуют.';
  if (/Invalid login credentials/i.test(message)) return 'Неверные учётные данные.';
  if (/rate limit|429|too many/i.test(message)) return 'Слишком много запросов. Повторите позже.';
  if (/Email not confirmed/i.test(message)) return 'Подтвердите электронную почту, затем войдите.';
  return message.slice(0,240);
}
