import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { AuditClearPreview } from "@/types";
import type { FriendsSnapshot } from "@/types/friends";
import { createFriendsTestDatabase, friendsTestQuery } from "@/test/friendsDatabase";

let db: PGlite;
let purchaseId: string;
let periodId: string;
let photoPath: string;
const actorId = "00000000-0000-4000-8000-000000000001";
const alice = "11000000-0000-4000-8000-000000000001";
const bob = "11000000-0000-4000-8000-000000000002";

beforeAll(async () => { db = await createFriendsTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("truncate public.audit_logs, public.audit_history_purges, public.audit_history_clear_requests, public.purchases, storage.objects; truncate public.friend_expenses, public.friend_settlements, public.friend_periods, public.friend_members cascade;");
  const housemate = await db.query<{ id: string }>("select id from public.housemates limit 1");
  const purchase = await friendsTestQuery<{ id: string }>(db, "insert into public.purchases(item_name, unit_price, quantity, buyer_id) values('SQL test purchase',6,3,$1::uuid) returning id", [housemate.rows[0].id]);
  purchaseId = purchase.rows[0].id;
  photoPath = `purchases/${purchaseId}/test.jpg`;
  await db.query("insert into storage.objects(bucket_id, name) values('purchase-photos',$1)", [photoPath]);
  await friendsTestQuery(db, "update public.purchases set photo_path=$1 where id=$2::uuid", [photoPath, purchaseId]);
  const period = await db.query<{ id: string }>("insert into public.friend_periods(number) values(1) returning id");
  periodId = period.rows[0].id;
  const mutate = (action: string, data: Record<string, unknown>) => friendsTestQuery(db, "select public.friends_mutate($1::uuid,$2,$3::jsonb)", [periodId, action, JSON.stringify(data)]);
  await mutate("member.add", { id: alice, full_name: "Alice cleanup test" });
  await mutate("member.add", { id: bob, full_name: "Bob cleanup test" });
  await mutate("expense.save", { id: "22000000-0000-4000-8000-000000000001", description: "Cleanup test expense", payer_id: alice, participant_ids: [alice, bob], amount_cents: 10000, incurred_on: "2026-01-01", notes: null, expected_updated_at: null });
  await mutate("settlement.add", { id: "33000000-0000-4000-8000-000000000001", from_member_id: bob, to_member_id: alice, amount_cents: 5000, paid_on: "2026-01-01", notes: null });
});

async function count(table = "audit_logs") {
  return (await db.query<{ count: number }>(`select count(*)::int as count from public.${table}`)).rows[0].count;
}
async function preview() {
  return (await friendsTestQuery<{ data: AuditClearPreview }>(db, "select public.preview_audit_history_clear() as data")).rows[0].data;
}
async function clear(data: AuditClearPreview, confirmation = "SUPPRIMER") {
  return Number((await friendsTestQuery<{ count: number }>(db, "select public.clear_audit_history($1::uuid,$2::timestamptz,$3) as count", [data.request_id, data.cutoff, confirmation])).rows[0].count);
}
async function friendSnapshot() {
  return (await friendsTestQuery<{ data: FriendsSnapshot }>(db, "select public.friends_snapshot($1::uuid) as data", [periodId])).rows[0].data;
}
async function otherUser(sql: string, params: unknown[] = [], email = "other@example.com", role = "authenticated", userId: string | null = actorId) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, email })]);
    return tx.query(sql, params);
  });
}

describe("Administrative audit purge in actual PostgreSQL", () => {
  it("previews a real count without deleting or modifying any record", async () => {
    const before = await count();
    const data = await preview();
    expect(data.count).toBe(before);
    expect(data.count).toBeGreaterThan(0);
    expect(data.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(new Date(data.cutoff).getTime())).toBe(false);
    expect(await count()).toBe(before);
    expect(await count("audit_history_purges")).toBe(0);
  });

  it("requires the exact confirmation and a valid, unexpired request", async () => {
    const data = await preview();
    const before = await count();
    await expect(clear(data, "supprimer")).rejects.toThrow("AUDIT_CLEAR_CONFIRMATION");
    await expect(clear(data, "")).rejects.toThrow("AUDIT_CLEAR_CONFIRMATION");
    await expect(clear({ ...data, cutoff: "infinity" })).rejects.toThrow("AUDIT_CLEAR_INVALID_REQUEST");
    await expect(clear({ ...data, cutoff: "2999-01-01T00:00:00Z" })).rejects.toThrow("AUDIT_CLEAR_INVALID_REQUEST");
    await db.query("update public.audit_history_clear_requests set cutoff=clock_timestamp()-interval '1 hour' where id=$1::uuid", [data.request_id]);
    const expired = await db.query<{ cutoff: string }>("select cutoff::text from public.audit_history_clear_requests where id=$1::uuid", [data.request_id]);
    await expect(clear({ ...data, cutoff: expired.rows[0].cutoff })).rejects.toThrow("AUDIT_CLEAR_EXPIRED");
    expect(await count()).toBe(before);
    expect(await count("audit_history_purges")).toBe(0);
  });

  it("clears only the journal and preserves purchases, photos, friends and repayments", async () => {
    const data = await preview();
    const friendsBefore = await friendSnapshot();
    expect(await clear(data)).toBe(data.count);
    expect(await count()).toBe(0);
    const purchase = await db.query<{ unit_price: string; quantity: number; photo_path: string }>("select unit_price, quantity, photo_path from public.purchases where id=$1::uuid", [purchaseId]);
    expect(Number(purchase.rows[0].unit_price) * purchase.rows[0].quantity).toBe(18);
    expect(purchase.rows[0].photo_path).toBe(photoPath);
    expect((await db.query("select id from storage.objects where name=$1", [photoPath])).rows).toHaveLength(1);
    expect(await friendSnapshot()).toEqual(friendsBefore);
    expect(await count("housemates")).toBe(4);
  });

  it("retains newer events and retries the same request without deleting again", async () => {
    const data = await preview();
    await friendsTestQuery(db, "update public.purchases set unit_price=7 where id=$1::uuid", [purchaseId]);
    expect(await clear(data)).toBe(data.count);
    expect(await count()).toBe(1);
    await friendsTestQuery(db, "update public.purchases set unit_price=8 where id=$1::uuid", [purchaseId]);
    expect(await clear(data)).toBe(data.count);
    expect(await count()).toBe(2);
    expect(await count("audit_history_purges")).toBe(1);
    const log = await friendsTestQuery<{ actor_id: string; action: string }>(db, "select actor_id, action from public.audit_logs order by created_at desc limit 1");
    expect(log.rows[0]).toEqual({ actor_id: actorId, action: "UPDATE" });
  });

  it("keeps an immutable administrative receipt with the server identity", async () => {
    const data = await preview(); await clear(data);
    const receipt = await friendsTestQuery<{ actor_id: string; actor_email: string; removed_count: number }>(db, "select actor_id,actor_email,removed_count from public.audit_history_purges where id=$1::uuid", [data.request_id]);
    expect(receipt.rows[0].actor_id).toBe(actorId);
    expect(receipt.rows[0].actor_email).toBe("admin-2026@gmail.com");
    expect(Number(receipt.rows[0].removed_count)).toBe(data.count);
    await expect(friendsTestQuery(db, "delete from public.audit_history_purges")).rejects.toThrow(/permission denied/);
    await expect(friendsTestQuery(db, "update public.audit_history_purges set removed_count=0")).rejects.toThrow(/permission denied/);
    await expect(clear({ ...data, cutoff: new Date(new Date(data.cutoff).getTime() - 1000).toISOString() })).rejects.toThrow("AUDIT_CLEAR_INVALID_REQUEST");
  });

  it("denies anonymous users, other accounts, missing identities and direct deletion", async () => {
    const data = await preview();
    const sql = "select public.clear_audit_history($1::uuid,$2::timestamptz,'SUPPRIMER')";
    await expect(otherUser("select public.preview_audit_history_clear()", [], "", "anon")).rejects.toThrow(/permission denied/);
    await expect(otherUser("select public.preview_audit_history_clear()")).rejects.toThrow("AUDIT_CLEAR_FORBIDDEN");
    await expect(otherUser(sql, [data.request_id, data.cutoff])).rejects.toThrow("AUDIT_CLEAR_FORBIDDEN");
    await expect(otherUser(sql, [data.request_id, data.cutoff], "admin-2026@gmail.com", "authenticated", null)).rejects.toThrow("AUDIT_CLEAR_FORBIDDEN");
    await expect(friendsTestQuery(db, "delete from public.audit_logs")).rejects.toThrow(/permission denied/);
    await expect(friendsTestQuery(db, "truncate public.audit_logs")).rejects.toThrow(/permission denied/);
    await expect(friendsTestQuery(db, "select * from public.audit_history_clear_requests")).rejects.toThrow(/permission denied/);
    expect((await otherUser("select * from public.audit_history_purges")).rows).toEqual([]);
    expect(await count()).toBe(data.count);
  });

  it("reapplying the migration never purges records and keeps future logging operational", async () => {
    const before = await count();
    await db.exec(await readFile("supabase/migrations/20260701000000_audit_history_cleanup.sql", "utf8"));
    expect(await count()).toBe(before);
    await clear(await preview());
    await friendsTestQuery(db, "update public.purchases set notes='After cleanup test' where id=$1::uuid", [purchaseId]);
    expect(await count()).toBe(1);
    expect((await preview()).count).toBe(1);
  });
});