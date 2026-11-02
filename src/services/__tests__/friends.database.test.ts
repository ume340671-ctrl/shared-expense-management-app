import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { FriendsSnapshot } from "@/types/friends";
import { createFriendsTestDatabase } from "@/test/friendsDatabase";

// Actual PostgreSQL queries and RLS, with only Supabase's auth/storage schemas stubbed.
let db: PGlite;
const actor = "00000000-0000-4000-8000-000000000001";
const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const charlie = "10000000-0000-4000-8000-000000000003";
const expense = "20000000-0000-4000-8000-000000000001";
const repayment = "30000000-0000-4000-8000-000000000001";
let period: string;

async function queryAs<T>(sql: string, params: unknown[] = [], email = "admin-2026@gmail.com", role = "authenticated") {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor, email })]);
    return tx.query<T>(sql, params);
  });
}

async function mutate(action: string, data: Record<string, unknown> = {}, periodId = period) {
  const result = await queryAs<{ id: string }>("select public.friends_mutate($1::uuid,$2,$3::jsonb) as id", [periodId, action, JSON.stringify(data)]);
  return result.rows[0].id;
}

async function snapshot(periodId: string | null = null) {
  const result = await queryAs<{ data: FriendsSnapshot }>("select public.friends_snapshot($1::uuid) as data", [periodId]);
  return result.rows[0].data;
}

const input = (amount = 10000, participants = [alice, bob]) => ({
  id: expense, description: "Repas de test", amount_cents: amount,
  payer_id: alice, participant_ids: participants, incurred_on: "2026-01-01", notes: null,
  expected_updated_at: null,
});

beforeAll(async () => {
  db = await createFriendsTestDatabase();
}, 60_000);

beforeEach(async () => {
  await db.exec("truncate public.friend_expenses, public.friend_settlements, public.friend_periods, public.friend_members cascade; truncate public.audit_logs;");
  const result = await db.query<{ id: string }>("insert into public.friend_periods(number) values (1) returning id");
  period = result.rows[0].id;
  await mutate("member.add", { id: alice, full_name: "Alice (test)" });
  await mutate("member.add", { id: bob, full_name: "Bob (test)" });
  await mutate("member.add", { id: charlie, full_name: "Charlie (test)" });
});

afterAll(async () => { await db.close(); });

describe("Friends PostgreSQL ledger and permissions", () => {
  it("starts empty, without seeded expenses or balances", async () => {
    const data = await snapshot();
    expect(data.expenses).toEqual([]);
    expect(data.settlements).toEqual([]);
    expect(data.balances.every((b) => b.balance_cents === 0)).toBe(true);
  });

  it("allocates remainder cents deterministically and conserves the total", async () => {
    await mutate("expense.save", input(100, [charlie, bob, alice]));
    const data = await snapshot();
    expect(data.balances.find((b) => b.member_id === alice)?.balance_cents).toBe(66);
    expect(data.balances.find((b) => b.member_id === bob)?.balance_cents).toBe(-33);
    expect(data.balances.find((b) => b.member_id === charlie)?.balance_cents).toBe(-33);
    expect(data.balances.reduce((sum, b) => sum + b.balance_cents, 0)).toBe(0);
  });

  it("a personal expense creates no debt", async () => {
    await mutate("expense.save", input(10000, [alice]));
    expect((await snapshot()).balances.every((b) => b.balance_cents === 0)).toBe(true);
  });

  it("blocks reset on the server when any debt remains and logs no success", async () => {
    await mutate("expense.save", input());
    const before = await db.query("select id from public.audit_logs");
    await expect(mutate("period.reset")).rejects.toThrow("FRIENDS_OUTSTANDING_DEBT");
    expect((await snapshot()).period.id).toBe(period);
    expect((await db.query("select id from public.audit_logs")).rows.length).toBe(before.rows.length);
  });

  it("accepts partial repayments and rejects overpayment or self repayment", async () => {
    await mutate("expense.save", input());
    await mutate("settlement.add", { id: repayment, from_member_id: bob, to_member_id: alice, amount_cents: 2000, paid_on: "2026-01-02" });
    expect((await snapshot()).balances.find((b) => b.member_id === bob)?.balance_cents).toBe(-3000);
    await expect(mutate("period.reset")).rejects.toThrow("FRIENDS_OUTSTANDING_DEBT");
    await expect(mutate("settlement.add", { id: "30000000-0000-4000-8000-000000000002", from_member_id: bob, to_member_id: alice, amount_cents: 4000, paid_on: "2026-01-02" })).rejects.toThrow("FRIENDS_INVALID_SETTLEMENT");
    await expect(mutate("settlement.add", { id: "30000000-0000-4000-8000-000000000002", from_member_id: bob, to_member_id: bob, amount_cents: 100, paid_on: "2026-01-02" })).rejects.toThrow("FRIENDS_INVALID_SETTLEMENT");
  });

  it("archives a settled period atomically and preserves both expenses and reimbursements", async () => {
    await mutate("expense.save", input());
    await mutate("settlement.add", { id: repayment, from_member_id: bob, to_member_id: alice, amount_cents: 5000, paid_on: "2026-01-02" });
    const nextId = await mutate("period.reset");
    const current = await snapshot();
    expect(current.period.id).toBe(nextId);
    expect(current.period.number).toBe(2);
    expect(current.expenses).toEqual([]);
    expect(current.settlements).toEqual([]);
    expect(current.balances.every((b) => b.balance_cents === 0)).toBe(true);
    const history = await snapshot(period);
    expect(history.period.closed_at).toBeTruthy();
    expect(history.expenses).toHaveLength(1);
    expect(history.settlements).toHaveLength(1);
    expect(history.period.total_cents).toBe(10000);
    expect(history.period.repaid_cents).toBe(5000);
    await expect(mutate("expense.delete", { id: expense }, period)).rejects.toThrow("FRIENDS_PERIOD_CLOSED");
    await expect(mutate("period.reset", {}, period)).rejects.toThrow("FRIENDS_PERIOD_CLOSED");
  });

  it("edits or deletes an expense and protects against stale edits", async () => {
    await mutate("expense.save", input());
    const original = (await snapshot()).expenses[0];
    await mutate("expense.save", { ...input(14000), expected_updated_at: original.updated_at });
    expect((await snapshot()).balances.find((b) => b.member_id === bob)?.balance_cents).toBe(-7000);
    await expect(mutate("expense.save", { ...input(16000), expected_updated_at: original.updated_at })).rejects.toThrow("FRIENDS_STALE_RECORD");
    const updated = (await snapshot()).expenses[0];
    await mutate("expense.delete", { id: expense, expected_updated_at: updated.updated_at });
    expect((await snapshot()).period.total_cents).toBe(0);
  });

  it("undoes only the chosen repayment", async () => {
    await mutate("expense.save", input());
    await mutate("settlement.add", { id: repayment, from_member_id: bob, to_member_id: alice, amount_cents: 5000, paid_on: "2026-01-02" });
    await mutate("settlement.delete", { id: repayment });
    expect((await snapshot()).balances.find((b) => b.member_id === bob)?.balance_cents).toBe(-5000);
    expect((await snapshot()).expenses).toHaveLength(1);
  });

  it("does not duplicate a successful request retried after network loss", async () => {
    await mutate("expense.save", input());
    await mutate("expense.save", input());
    const data = { id: repayment, from_member_id: bob, to_member_id: alice, amount_cents: 5000, paid_on: "2026-01-02" };
    await mutate("settlement.add", data);
    await mutate("settlement.add", data);
    expect((await snapshot()).expenses).toHaveLength(1);
    expect((await snapshot()).settlements).toHaveLength(1);
    const audit = await db.query<{ count: number }>("select count(*)::int as count from public.audit_logs where entity_type = 'friend_expense' and action = 'CREATE'");
    expect(audit.rows[0].count).toBe(1);
  });

  it("rejects invalid amounts, unknown participants, duplicates and future dates", async () => {
    await expect(mutate("expense.save", input(-100))).rejects.toThrow("FRIENDS_INVALID_AMOUNT");
    await expect(mutate("expense.save", input(10.5))).rejects.toThrow("FRIENDS_INVALID_AMOUNT");
    await expect(mutate("expense.save", input(100, [alice, alice]))).rejects.toThrow("FRIENDS_INVALID_PARTICIPANTS");
    await expect(mutate("expense.save", input(100, ["99999999-0000-4000-8000-000000000001"])) ).rejects.toThrow("FRIENDS_INVALID_PARTICIPANTS");
    await expect(mutate("expense.save", { ...input(), incurred_on: "2999-01-01" })).rejects.toThrow("FRIENDS_INVALID_DATE");
    await expect(mutate("period.reset")).rejects.toThrow("FRIENDS_EMPTY_PERIOD");
  });

  it("prevents anonymous access, another account and direct writes bypassing RPC", async () => {
    await expect(queryAs("select public.friends_snapshot(null)", [], "other@example.com")).rejects.toThrow("FRIENDS_FORBIDDEN");
    await expect(queryAs("select public.friends_snapshot(null)", [], "", "anon")).rejects.toThrow(/permission denied/);
    expect((await queryAs("select * from public.friend_expenses", [], "other@example.com")).rows).toEqual([]);
    await expect(queryAs("insert into public.friend_periods(number) values(99)")).rejects.toThrow(/permission denied/);
    await expect(queryAs("delete from public.friend_expenses")).rejects.toThrow(/permission denied/);
    await expect(queryAs("select t9dya_private.friend_balances($1::uuid)", [period])).rejects.toThrow(/permission denied/);
    await expect(queryAs("update public.audit_logs set summary = 'forged'")).rejects.toThrow();
  });

  it("logs the real account and never modifies house purchases when resetting friends", async () => {
    const housemate = await db.query<{ id: string }>("select id from public.housemates limit 1");
    const housePurchase = await db.query<{ id: string }>("insert into public.purchases(item_name,unit_price,quantity,buyer_id,purchase_date) values('House isolation test',6,3,$1::uuid,'2026-01-01') returning id", [housemate.rows[0].id]);
    await mutate("expense.save", input(10000, [alice]));
    await mutate("period.reset");
    const house = await db.query<{ unit_price: string; quantity: number }>("select unit_price,quantity from public.purchases where id=$1::uuid", [housePurchase.rows[0].id]);
    expect(Number(house.rows[0].unit_price) * house.rows[0].quantity).toBe(18);
    const log = await db.query<{ actor_id: string; actor_email: string }>("select actor_id,actor_email from public.audit_logs where entity_type='friend_expense' order by created_at desc limit 1");
    expect(log.rows[0]).toEqual({ actor_id: actor, actor_email: "admin-2026@gmail.com" });
  });

  it("the migration is safe to reapply without resetting existing periods", async () => {
    await mutate("expense.save", input());
    await db.exec(await readFile("supabase/migrations/20260601000000_friends_expenses.sql", "utf8"));
    expect((await snapshot()).expenses).toHaveLength(1);
    expect((await snapshot()).period.id).toBe(period);
    await mutate("settlement.add", { id: repayment, from_member_id: bob, to_member_id: alice, amount_cents: 5000, paid_on: "2026-01-02" });
    const nextId = await mutate("period.reset");
    await db.exec(await readFile("supabase/migrations/20260601000000_friends_expenses.sql", "utf8"));
    expect((await snapshot()).period.id).toBe(nextId);
    expect((await snapshot()).periods.filter((p) => !p.closed_at)).toHaveLength(1);
    expect((await snapshot(period)).expenses).toHaveLength(1);
    expect((await snapshot(period)).settlements).toHaveLength(1);
  });
});