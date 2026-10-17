-- Append-only audit for erroneous duplicate tuition entries that were neutralized
-- through equal-and-opposite cash-ledger postings. Existing receipts remain immutable.
CREATE TABLE IF NOT EXISTS public.tuition_payment_voids (
  payment_id uuid PRIMARY KEY REFERENCES public.tuition_payments(id) ON DELETE RESTRICT,
  tuition_id uuid NOT NULL REFERENCES public.tuition(id) ON DELETE RESTRICT,
  original_ledger_id uuid NOT NULL UNIQUE REFERENCES public.cash_ledger(id) ON DELETE RESTRICT,
  reversal_ledger_id uuid NOT NULL UNIQUE REFERENCES public.cash_ledger(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  corrected_by_name text NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tuition_payment_voids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tuition_payment_voids FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tuition_payment_voids_no_mutation ON public.tuition_payment_voids;
CREATE TRIGGER tuition_payment_voids_no_mutation
 BEFORE DELETE OR UPDATE ON public.tuition_payment_voids
 FOR EACH ROW EXECUTE FUNCTION private.finance_reject_ledger_mutation();

COMMENT ON TABLE public.tuition_payment_voids IS
 'Immutable audit of invalid tuition receipts and their balancing reversal; not a cash refund.';

-- The three 2026-10-17 live correction records are retained in this table.
-- No user or payment IDs are hardcoded in this schema migration.
