-- Recover verified manual class transfers made by deleting a previous
-- active class and adding a new one immediately afterward. Unlike an
-- independent additional class, this sequence has a matching DELETE event,
-- INSERT event, same student, same actor and a short time window.
-- No tuition, receipt, membership or cash-ledger rows are modified.
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
  WITH authenticated_actor AS (
    SELECT (SELECT auth.uid()) AS actor_id
  ),
  verified_transfers AS (
    SELECT h.student_id, h.class_id, h.start_date, h.end_date, h.changed_at
    FROM public.class_student_history AS h
    JOIN public.classes AS source_class ON source_class.id = h.class_id
    WHERE (SELECT actor_id FROM authenticated_actor) IS NOT NULL
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
      )
  ),
  manually_switched_classes AS (
    SELECT
      (removed.old_data ->> 'student_id')::uuid AS student_id,
      (removed.old_data ->> 'class_id')::uuid AS class_id,
      NULLIF(removed.old_data ->> 'start_date', '')::date AS start_date,
      (added.new_data ->> 'start_date')::date AS end_date,
      added.created_at AS changed_at
    FROM public.activity_logs AS removed
    JOIN public.activity_logs AS added
      ON added.entity_type = 'class_students'
      AND added.action = 'INSERT'
      AND added.new_data ->> 'status' = 'active'
      AND added.new_data ->> 'student_id' = removed.old_data ->> 'student_id'
      AND added.new_data ->> 'class_id' <> removed.old_data ->> 'class_id'
      AND added.user_id IS NOT NULL
      AND added.user_id = removed.user_id
      AND added.created_at BETWEEN removed.created_at
        AND removed.created_at + INTERVAL '10 minutes'
    JOIN public.class_students AS current_membership
      ON current_membership.student_id = (added.new_data ->> 'student_id')::uuid
      AND current_membership.class_id = (added.new_data ->> 'class_id')::uuid
      AND current_membership.start_date = (added.new_data ->> 'start_date')::date
      AND current_membership.status = 'active'
    JOIN public.classes AS source_class
      ON source_class.id = (removed.old_data ->> 'class_id')::uuid
    JOIN public.classes AS destination_class
      ON destination_class.id = current_membership.class_id
    WHERE (SELECT actor_id FROM authenticated_actor) IS NOT NULL
      AND removed.entity_type = 'class_students'
      AND removed.action = 'DELETE'
      AND removed.old_data ->> 'status' = 'active'
      AND removed.old_data ->> 'student_id' IS NOT NULL
      AND removed.old_data ->> 'class_id' IS NOT NULL
      AND added.new_data ->> 'start_date' IS NOT NULL
      AND (private.can_access_branch(source_class.branch_id)
           OR private.can_access_branch(destination_class.branch_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.class_student_history AS h
        WHERE h.student_id = current_membership.student_id
          AND h.class_id = source_class.id
          AND h.end_date = current_membership.start_date
          AND h.action = 'transfer_out'
      )
  )
  SELECT h.student_id, h.class_id, h.start_date, h.end_date, h.changed_at
  FROM verified_transfers AS h
  UNION ALL
  SELECT m.student_id, m.class_id, m.start_date, m.end_date, m.changed_at
  FROM manually_switched_classes AS m;
$function$;

REVOKE ALL ON FUNCTION public.get_tuition_transfer_out_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tuition_transfer_out_history() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tuition_transfer_out_history() TO authenticated;

COMMENT ON FUNCTION public.get_tuition_transfer_out_history()
IS 'Read-only, branch-authorized class transfer evidence including audited manual delete-and-add switches within ten minutes; never modifies financial data.';