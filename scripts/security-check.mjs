import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const files = ['src/main.jsx','src/supabase.js','supabase/migrations/202610260001_initial.sql'];
for (const name of files) {
  const data=fs.readFileSync(new URL(name,root),'utf8');
  if (/service_role|sb_secret_[A-Za-z0-9]{8,}/.test(data) && !name.endsWith('.sql')) throw Error(`Check secrets in ${name}`);
}
const sql=fs.readFileSync(new URL(files[2],root),'utf8');
for (const table of ['profiles','favorites','friendships','messages','admin_audit']) {
 if (!sql.includes(`alter table public.${table} enable row level security;`)) throw Error(`Missing RLS: ${table}`);
}
const catalog=JSON.parse(fs.readFileSync(new URL('src/catalog.json',root),'utf8'));
const keys=new Set(Object.keys(catalog.items));
for (const game of catalog.games) for (const mode of game.modes) for (const group of mode.groups) for (const row of group.rows) for (const id of row.items) {
 if(!keys.has(id)) throw Error('Catalog integrity failure '+id);
}
console.log(`Security structure validated. ${keys.size} unique catalog cards and ${catalog.games.length} catalog sections.`);
