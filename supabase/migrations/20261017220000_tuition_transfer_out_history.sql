-- Paid tuition must follow a verified class transfer without cloning a receipt.
-- Source-class history is private; expose only class-scoped transfer events.
CREATE OR REPLACE FUNCTION public.get_tuition_transfer_out_history()
RETURNS TABLE (
  student_id uuid,
  class_id uuid,
  start_date date,
  end_date date,
  changed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT h.student_id, h.class_id, h.start_date, h.end_date, h.changed_at
  FROM public.class_student_history AS h
  JOIN public.classes AS c ON c.id = h.class_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND h.action = 'transfer_out'
    AND h.end_date IS NOT NULL
    AND private.can_access_branch(c.branch_id);
$function$;

REVOKE ALL ON FUNCTION public.get_tuition_transfer_out_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tuition_transfer_out_history() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tuition_transfer_out_history() TO authenticated;

COMMENT ON FUNCTION public.get_tuition_transfer_out_history()
IS 'Read-only, branch-authorized transfer-out events for correct tuition carry-over. Does not create, move or delete receipts.';