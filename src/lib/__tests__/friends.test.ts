import { describe, expect, it } from "vitest";
import { computeFriendBalances, formatCents, friendsError, parseCents, splitEqualCents, suggestSettlements } from "@/lib/friends";
import type { FriendExpense, FriendSettlement } from "@/types/friends";

const expense = (amount = 10000, participants = ["alice", "bob"]): FriendExpense => ({
  id: "expense", period_id: "period", description: "Test only", amount_cents: amount, payer_id: "alice",
  participant_ids: participants, incurred_on: "2026-01-01", notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
});
const settlement = (amount = 5000): FriendSettlement => ({
  id: "repayment", period_id: "period", from_member_id: "bob", to_member_id: "alice", amount_cents: amount, paid_on: "2026-01-01", created_at: "2026-01-01T00:00:00Z", notes: null,
});

describe("Exact cents and shared friend expenses", () => {
  it("parses French and decimal values exactly", () => {
    expect(parseCents("12,50")).toBe(1250);
    expect(parseCents("0.01")).toBe(1);
    expect(parseCents("1000000")).toBe(100000000);
    expect(formatCents(1250)).toBe("12,5 DH");
  });
  it.each(["", "0", "-1", "1.001", "NaN", "Infinity", "1e3", "1000000.01", "1,2,3"])("rejects invalid amount %s", (text) => {
    expect(parseCents(text)).toBeNull();
  });
  it("does not lose cents for uneven splits", () => {
    expect([...splitEqualCents(100, ["c", "a", "b"])]).toEqual([["a", 34], ["b", 33], ["c", 33]]);
    expect([...splitEqualCents(1, ["c", "a", "b"])]).toEqual([["a", 1], ["b", 0], ["c", 0]]);
    expect(() => splitEqualCents(100, [])).toThrow();
  });
  it("counts repayments without treating them as new expenses", () => {
    const before = computeFriendBalances(["alice", "bob"], [expense()], []);
    expect(before.map((b) => b.balance_cents)).toEqual([5000, -5000]);
    expect(suggestSettlements(before)).toEqual([{ from_member_id: "bob", to_member_id: "alice", amount_cents: 5000 }]);
    expect(computeFriendBalances(["alice", "bob"], [expense()], [settlement()]).map((b) => b.balance_cents)).toEqual([0, 0]);
    expect(computeFriendBalances(["alice", "bob"], [expense()], [settlement(1000)]).map((b) => b.balance_cents)).toEqual([4000, -4000]);
  });
  it("a personal expense creates no debt and an empty period has zero balances", () => {
    expect(suggestSettlements(computeFriendBalances(["alice", "bob"], [expense(10000, ["alice"])], []))).toEqual([]);
    expect(computeFriendBalances(["alice", "bob"], [], []).every((b) => b.balance_cents === 0 && b.paid_cents === 0)).toBe(true);
  });
  it("netting suggestions settle multi-person balances", () => {
    const balances = [{ member_id: "a", balance_cents: 83, paid_cents: 100 }, { member_id: "b", balance_cents: -50, paid_cents: 0 }, { member_id: "c", balance_cents: -33, paid_cents: 0 }];
    expect(suggestSettlements(balances).reduce((sum, s) => sum + s.amount_cents, 0)).toBe(83);
  });
  it("translates server debt, stale data and configuration errors", () => {
    expect(friendsError(new Error("FRIENDS_OUTSTANDING_DEBT"))).toContain("remboursements restent");
    expect(friendsError(new Error("FRIENDS_STALE_RECORD"))).toContain("autre appareil");
    expect(friendsError(new Error("PGRST202 schema cache"))).toContain("20260601000000_friends_expenses.sql");
  });
});