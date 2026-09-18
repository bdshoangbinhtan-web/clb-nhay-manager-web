begin;

create or replace function public.sync_substitute_work_session_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.teaching_type = 'substitute'
     and new.substitution_request_id is not null
     and exists (
       select 1 from public.teacher_substitution_requests r
       where r.id = new.substitution_request_id
         and r.class_id = new.class_id
         and r.session_date = new.session_date
         and r.standing_teacher_id = new.standing_teacher_id
         and r.substitute_teacher_id = new.actual_teacher_id
         and r.status = 'approved'
     )
  then
    insert into public.teacher_attendance (
      teacher_id, class_id, attendance_date, status, note
    ) values (
      new.actual_teacher_id, new.class_id, new.session_date, 'taught',
      'Giáo viên dạy thay xác nhận đã dạy buổi này'
    )
    on conflict (teacher_id, class_id, attendance_date)
    do update set status = 'taught', note = excluded.note;
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_substitute_work_session_attendance
on public.teacher_work_sessions;

create trigger sync_substitute_work_session_attendance
after insert on public.teacher_work_sessions
for each row
execute function public.sync_substitute_work_session_attendance();

insert into public.teacher_attendance (
  teacher_id, class_id, attendance_date, status, note
)
select ws.actual_teacher_id, ws.class_id, ws.session_date, 'taught',
       'Khôi phục xác nhận từ buổi dạy thay đã ghi nhận'
from public.teacher_work_sessions ws
join public.teacher_substitution_requests r
  on r.id = ws.substitution_request_id
 and r.class_id = ws.class_id
 and r.session_date = ws.session_date
 and r.standing_teacher_id = ws.standing_teacher_id
 and r.substitute_teacher_id = ws.actual_teacher_id
 and r.status = 'approved'
where ws.teaching_type = 'substitute'
  and not exists (
    select 1 from public.teacher_payrolls p
    where p.teacher_id = ws.actual_teacher_id
      and p.payroll_month = date_trunc('month', ws.session_date)::date
      and p.status in ('locked', 'paid')
  )
  and not exists (
    select 1 from public.teacher_attendance ta
    where ta.teacher_id = ws.actual_teacher_id
      and ta.class_id = ws.class_id
      and ta.attendance_date = ws.session_date
  )
on conflict (teacher_id, class_id, attendance_date) do nothing;

comment on function public.sync_substitute_work_session_attendance() is
  'Records taught attendance for new work sessions backed by an exact approved substitution request.';

commit;
