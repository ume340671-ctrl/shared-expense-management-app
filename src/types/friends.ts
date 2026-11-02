export type FriendMember = {
  id: string;
  full_name: string;
  created_at: string;
};

export type FriendPeriod = {
  id: string;
  number: number;
  started_at: string;
  closed_at: string | null;
  expense_count: number;
  settlement_count: number;
  total_cents: number;
  repaid_cents: number;
};

export type FriendExpense = {
  id: string;
  period_id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  participant_ids: string[];
  incurred_on: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FriendSettlement = {
  id: string;
  period_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  paid_on: string;
  notes: string | null;
  created_at: string;
};

/** Positive = receivable, negative = payable. All arithmetic is in cents. */
export type FriendBalance = {
  member_id: string;
  balance_cents: number;
  paid_cents: number;
};

export type FriendsSnapshot = {
  members: FriendMember[];
  periods: FriendPeriod[];
  period: FriendPeriod;
  expenses: FriendExpense[];
  settlements: FriendSettlement[];
  balances: FriendBalance[];
};

export type FriendExpenseInput = Pick<FriendExpense,
  "id" | "description" | "amount_cents" | "payer_id" | "participant_ids" | "incurred_on" | "notes"
> & { expected_updated_at: string | null };

export type FriendSettlementInput = Pick<FriendSettlement,
  "id" | "from_member_id" | "to_member_id" | "amount_cents" | "paid_on" | "notes"
>;

export type FriendsAction =
  | "member.add"
  | "expense.save"
  | "expense.delete"
  | "settlement.add"
  | "settlement.delete"
  | "period.reset";

export type SuggestedSettlement = {
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
};