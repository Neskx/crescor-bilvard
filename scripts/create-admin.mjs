#!/usr/bin/env node
// Creates (or promotes) an administrator account.
//
// Usage (run locally — never in the browser, never commit the key):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/create-admin.mjs admin@example.se
//
// The password is read from ADMIN_PASSWORD if set; otherwise a strong random
// password is generated and printed ONCE. Change it after first login via
// "Glömt lösenordet?" if you prefer your own.

import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();

if (!url || !key) {
  console.error('Saknar SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i miljön.');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
  console.error('Ange administratörens e-postadress: node scripts/create-admin.mjs namn@exempel.se');
  process.exit(1);
}

function generatePassword() {
  // 20 chars, guaranteed lower/upper/digit to satisfy the auth password policy.
  const base = randomBytes(24).toString('base64url').replace(/[-_]/g, '').slice(0, 17);
  return `${base}aZ7`;
}

const generated = !process.env.ADMIN_PASSWORD;
const password = process.env.ADMIN_PASSWORD ?? generatePassword();
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(address) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === address);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUser(email);
if (user) {
  console.log(`Användaren ${email} finns redan – ger administratörsbehörighet.`);
  if (process.env.ADMIN_PASSWORD) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log('Lösenordet uppdaterades.');
  }
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error(`Kunde inte skapa användaren: ${error.message}`);
    process.exit(1);
  }
  user = data.user;
  console.log(`Skapade användaren ${email}.`);
  if (generated) console.log(`\n  Tillfälligt lösenord (visas bara nu): ${password}\n`);
}

const { error: insertError } = await db.from('admin_users').upsert({ user_id: user.id }, { onConflict: 'user_id' });
if (insertError) {
  console.error(`Kunde inte ge behörighet: ${insertError.message}`);
  process.exit(1);
}
console.log('Klart. Logga in på /admin.');
