import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

/** Isolated database used only by automated tests; never touches Supabase. */
export async function createFriendsTestDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create publication supabase_realtime;
  `);
  for (const migration of [
    "20260101000000_initial_schema.sql", "20260401000000_purchase_photos.sql",
    "20260501000000_audit_logs.sql", "20260601000000_friends_expenses.sql",
    "20260701000000_audit_history_cleanup.sql",
  ]) {
    const sql = await readFile(`supabase/migrations/${migration}`, "utf8");
    // gen_random_uuid is built into PostgreSQL; these tests do not use pgcrypto.
    await db.exec(sql.replace('create extension if not exists "pgcrypto";', ""));
  }
  return db;
}

export async function friendsTestQuery<T>(db: PGlite, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({
      sub: "00000000-0000-4000-8000-000000000001", email: "admin-2026@gmail.com",
    })]);
    return tx.query<T>(sql, params);
  });
}