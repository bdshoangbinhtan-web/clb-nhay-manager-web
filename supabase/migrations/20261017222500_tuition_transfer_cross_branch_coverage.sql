-- A target-branch manager must be able to recognize a legitimate incoming
-- student's paid period even when their previous class was at another branch.
-- Return only transfer metadata, never receipts or payment amounts.
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
  JOIN public.classes AS source_class ON source_class.id = h.class_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND h.action = 'transfer_out'
    AND h.end_date IS NOT NULL
    AND (
      private.can_access_branch(source_class.branch_id)
      OR EXISTS (
        SELECT 1
        FROM public.class_students AS cs
        JOIN public.classes AS target_class ON target_class.id = cs.class_id
        WHERE cs.student_id = h.student_id
          AND cs.status = 'active'
          AND cs.start_date >= h.end_date
          AND private.can_access_branch(target_class.branch_id)
      )
    );
$function$;
REVOKE ALL ON FUNCTION public.get_tuition_transfer_out_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tuition_transfer_out_history() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tuition_transfer_out_history() TO authenticated;