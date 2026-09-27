import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  accountBalances,
  businessDateFromTimestamp,
  summarizeLedger,
  type LedgerEntry,
} from "../lib/finance/ledger.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260927100000_finance_ledger_v1.sql", import.meta.url),
  "utf8",
);

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "entry-1",
    occurred_at: "2026-09-27T16:59:00.000Z",
    business_date: "2026-09-27",
    account_id: "cash",
    direction: "in",
    amount: 300_000,
    category: "tuition",
    description: "Thu học phí",
    branch_id: "branch-1",
    source_type: "tuition_payment",
    source_id: "payment-1",
    created_by_name: "Quản lý",
    reversal_of: null,
    metadata: {},
    ...overrides,
  };
}

test("business date follows Asia/Ho_Chi_Minh at both sides of midnight", () => {
  assert.equal(businessDateFromTimestamp("2026-09-27T16:59:00.000Z"), "2026-09-27");
  assert.equal(businessDateFromTimestamp("2026-09-27T17:01:00.000Z"), "2026-09-28");
});

test("daily totals exclude paired transfers and keep reversal count visible", () => {
  const summary = summarizeLedger([
    entry(),
    entry({ id: "expense", direction: "out", amount: 120_000, category: "utilities", source_type: "expense" }),
    entry({ id: "transfer-out", direction: "out", amount: 50_000, source_type: "account_transfer", category: "transfer" }),
    entry({ id: "transfer-in", direction: "in", amount: 50_000, source_type: "account_transfer", category: "transfer" }),
    entry({ id: "reversal", direction: "out", amount: 20_000, source_type: "reversal", reversal_of: "entry-1" }),
  ]);

  assert.deepEqual(summary, {
    income: 300_000,
    expense: 140_000,
    net: 160_000,
    transactions: 3,
    adjustments: 1,
  });
});

test("account balances include both sides of transfers", () => {
  const balances = accountBalances([
    entry(),
    entry({ id: "out", direction: "out", amount: 50_000, source_type: "account_transfer" }),
    entry({ id: "in", account_id: "bank", direction: "in", amount: 50_000, source_type: "account_transfer" }),
  ]);
  assert.equal(balances.get("cash"), 250_000);
  assert.equal(balances.get("bank"), 50_000);
});

test("tuition, expense and other revenue inserts all post through transactional triggers", () => {
  assert.match(migration, /create trigger finance_post_tuition_payment after insert on public\.tuition_payments/i);
  assert.match(migration, /create trigger finance_post_expense after insert on public\.expenses/i);
  assert.match(migration, /create trigger finance_post_other_revenue after insert on public\.other_revenues/i);
  assert.match(migration, /create unique index cash_ledger_source_account_key[\s\S]*\(source_type, source_id, account_id\)/i);
});

test("tuition refunds require a stable batch, payment method and a paired ledger entry", () => {
  const studentPage = readFileSync(
    new URL("../app/students/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create trigger finance_post_tuition_refund_batch after insert on public\.tuition_adjustments/i);
  assert.match(migration, /source_type='tuition_refund'/i);
  assert.match(migration, /refund_payment_method not in \('cash','transfer'\)/i);
  assert.match(migration, /source_type in \('tuition_payment','tuition_refund'/i);
  assert.match(studentPage, /refund_batch_id: refundBatchId/);
  assert.match(studentPage, /setRefundPaymentMethod/);
  assert.match(studentPage, /priorLedger/);
  assert.match(migration, /refund_amount_mismatch/);
});

test("cash ledger and closing history reject update, delete and truncate", () => {
  for (const table of ["public.cash_ledger", "public.daily_cash_closings", "public.cash_account_openings"]) {
    assert.ok(migration.includes(`before update or delete on ${table}`));
    assert.ok(migration.includes(`before truncate on ${table}`));
  }
  assert.match(migration, /reversal_of uuid references public\.cash_ledger\(id\)/i);
  assert.match(migration, /case v_original\.direction when 'in' then 'out' else 'in' end/i);
});

test("production history is untouched and old transactions are outside the audit window", () => {
  assert.doesNotMatch(migration, /\btruncate\s+(table\s+)?(public\.)?(tuition|tuition_payments|expenses|other_revenues)\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.(tuition|tuition_payments|expenses|other_revenues)\b/i);
  assert.doesNotMatch(migration, /\binsert\s+into\s+public\.cash_ledger\s*\([^)]*\)\s*select/i);
  assert.match(migration, /ledger_go_live_at timestamptz not null default now\(\)/i);
  assert.match(migration, /tp\.created_at>=v_start/i);
  assert.match(migration, /e\.created_at>=v_start/i);
  assert.match(migration, /r\.created_at>=v_start/i);
});

test("monitoring RPC is admin-only and checks missing/mismatched ledger references", () => {
  assert.match(migration, /if v_role <> 'admin' or not coalesce\(v_active,false\)/i);
  assert.match(migration, /'missing_ledger'/i);
  assert.match(migration, /'payment_amount_mismatch'/i);
  assert.match(migration, /'orphan_ledger'/i);
  assert.match(migration, /'unclosed_day'/i);
});
