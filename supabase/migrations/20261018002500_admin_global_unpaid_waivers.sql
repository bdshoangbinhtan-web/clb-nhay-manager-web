-- Explicitly waive *uncollected* tuition for one student, one class and one month.
-- This covers both stored unpaid invoices and virtual debts inferred by the UI.
CREATE TABLE IF NOT EXISTS public.tuition_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  reason text NOT NULL,
  waived_by uuid NOT NULL,
  waived_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  CONSTRAINT tuition_waivers_period_start CHECK (billing_month = date_trunc('month', billing_month)::date),
  CONSTRAINT tuition_waivers_reason_nonempty CHECK (char_length(btrim(reason)) BETWEEN 5 AND 300),
  CONSTRAINT tuition_waivers_student_class_month UNIQUE (student_id,class_id,billing_month)
);

CREATE INDEX IF NOT EXISTS tuition_waivers_class_period_idx
  ON public.tuition_waivers(class_id,billing_month) WHERE revoked_at IS NULL;

ALTER TABLE public.tuition_waivers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tuition_waivers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tuition_waivers TO authenticated;

CREATE POLICY tuition_waivers_staff_read ON public.tuition_waivers FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classes AS c
    WHERE c.id = class_id AND private.can_access_branch(c.branch_id)
  )
);

CREATE TRIGGER audit_tuition_waivers AFTER INSERT OR UPDATE ON public.tuition_waivers
FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE OR REPLACE FUNCTION public.admin_waive_unpaid_tuition(
  p_student_id uuid, p_class_id uuid, p_billing_month date,
  p_reason text DEFAULT 'Nghỉ học không báo – Không thu tháng này'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_invoice public.tuition%ROWTYPE;
  v_deleted integer := 0;
  v_waiver_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT COALESCE(public.is_admin(),false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Chỉ ADMIN đang hoạt động mới được miễn thu học phí.';
  END IF;
  IF p_student_id IS NULL OR p_class_id IS NULL OR p_billing_month IS NULL
     OR p_billing_month <> date_trunc('month',p_billing_month)::date
     OR p_billing_month < DATE '2026-10-01'
     OR p_billing_month > date_trunc('month',timezone('Asia/Ho_Chi_Minh',now()))::date THEN
    RAISE EXCEPTION 'Chỉ miễn thu cho kỳ hợp lệ từ 10/2026 đến tháng hiện tại.';
  END IF;
  IF length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Cần ghi lý do miễn thu (5 đến 300 ký tự).';
  END IF;

  -- Serialize waiver/collection decisions for one student. Never change receipts.
  PERFORM 1 FROM public.students WHERE id=p_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy học viên.'; END IF;
  PERFORM 1 FROM public.classes WHERE id=p_class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lớp học.'; END IF;

  IF EXISTS (SELECT 1 FROM public.tuition_waivers w
             WHERE w.student_id=p_student_id AND w.class_id=p_class_id
               AND w.billing_month=p_billing_month AND w.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Kỳ học phí này đã được miễn thu.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.class_students cs
                 WHERE cs.student_id=p_student_id AND cs.class_id=p_class_id)
     AND NOT EXISTS (SELECT 1 FROM public.class_student_history h
                     WHERE h.student_id=p_student_id AND h.class_id=p_class_id)
     AND NOT EXISTS (SELECT 1 FROM public.tuition t
                     WHERE t.student_id=p_student_id AND t.class_id=p_class_id) THEN
    RAISE EXCEPTION 'Chưa có bằng chứng học viên từng thuộc lớp này.';
  END IF;

  -- Abort the *entire* transaction if ANY invoice/payment/adjustment exists
  -- with real collection history. No partial payments or paid records are waived.
  FOR v_invoice IN
    SELECT * FROM public.tuition t
    WHERE t.student_id=p_student_id AND t.class_id=p_class_id
      AND t.billing_month=p_billing_month
    FOR UPDATE
  LOOP
    IF COALESCE(v_invoice.amount_paid,0) <> 0
       OR EXISTS (SELECT 1 FROM public.tuition_payments tp WHERE tp.tuition_id=v_invoice.id)
       OR EXISTS (SELECT 1 FROM public.tuition_adjustments ta
                  WHERE ta.tuition_id=v_invoice.id OR ta.target_tuition_id=v_invoice.id)
    THEN
      RAISE EXCEPTION 'Kỳ này đã có tiền thu hoặc lịch sử điều chỉnh, không được miễn thu.';
    END IF;
    DELETE FROM public.tuition WHERE id=v_invoice.id;
    v_deleted := v_deleted + 1;
  END LOOP;

  INSERT INTO public.tuition_waivers
    (student_id,class_id,billing_month,reason,waived_by,waived_at,revoked_at,revoked_by)
  VALUES
    (p_student_id,p_class_id,p_billing_month,btrim(p_reason),(SELECT auth.uid()),now(),NULL,NULL)
  ON CONFLICT (student_id,class_id,billing_month) DO UPDATE SET
    reason=EXCLUDED.reason, waived_by=EXCLUDED.waived_by, waived_at=now(),
    revoked_at=NULL, revoked_by=NULL
  RETURNING id INTO v_waiver_id;

  RETURN jsonb_build_object('success',true,'waiver_id',v_waiver_id,
                            'deleted_unpaid_invoices',v_deleted);
END
$function$;

-- Guard all other API pathways, including older clients, against silently
-- recreating a paid/unpaid invoice for an explicitly waived period.
CREATE OR REPLACE FUNCTION public.prevent_tuition_for_waived_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tuition_waivers w
    WHERE w.student_id=NEW.student_id AND w.class_id=NEW.class_id
      AND w.billing_month=NEW.billing_month AND w.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tháng học phí này đã được Admin miễn thu; không được tạo/thu lại.';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER prevent_tuition_for_waived_period
BEFORE INSERT OR UPDATE ON public.tuition
FOR EACH ROW EXECUTE FUNCTION public.prevent_tuition_for_waived_period();

CREATE OR REPLACE FUNCTION public.admin_restore_tuition_waiver(p_waiver_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT COALESCE(public.is_admin(),false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Chỉ ADMIN đang hoạt động mới được bỏ miễn thu.';
  END IF;
  UPDATE public.tuition_waivers
  SET revoked_at=now(),revoked_by=(SELECT auth.uid())
  WHERE id=p_waiver_id AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy kỳ miễn thu đang có hiệu lực.'; END IF;
END
$function$;

-- Retain backward compatibility for cached clients that call the old delete
-- RPC. Deletion with a class now means a durable waiver, not a revived debt.
CREATE OR REPLACE FUNCTION public.admin_delete_unpaid_tuition(p_tuition_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_tuition public.tuition%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT COALESCE(public.is_admin(),false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Chỉ ADMIN đang hoạt động mới được xóa học phí.';
  END IF;
  SELECT * INTO v_tuition FROM public.tuition WHERE id=p_tuition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy khoản học phí.'; END IF;
  IF COALESCE(v_tuition.amount_paid,0) <> 0
     OR EXISTS (SELECT 1 FROM public.tuition_payments tp WHERE tp.tuition_id=p_tuition_id)
     OR EXISTS (SELECT 1 FROM public.tuition_adjustments ta
                WHERE ta.tuition_id=p_tuition_id OR ta.target_tuition_id=p_tuition_id) THEN
    RAISE EXCEPTION 'Khoản này đã có tiền thu hoặc lịch sử xử lý; không được xóa.';
  END IF;
  IF v_tuition.class_id IS NULL OR v_tuition.billing_month < DATE '2026-10-01'
     OR v_tuition.billing_month > date_trunc('month',timezone('Asia/Ho_Chi_Minh',now()))::date THEN
    DELETE FROM public.tuition WHERE id=p_tuition_id;
  ELSE
    PERFORM public.admin_waive_unpaid_tuition(v_tuition.student_id,
      v_tuition.class_id,v_tuition.billing_month,
      'Nghỉ học không báo – Không thu tháng này');
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.admin_waive_unpaid_tuition(uuid,uuid,date,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_restore_tuition_waiver(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.prevent_tuition_for_waived_period() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_waive_unpaid_tuition(uuid,uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_tuition_waiver(uuid) TO authenticated;
