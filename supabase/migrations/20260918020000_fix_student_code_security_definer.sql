-- Allow the student-code trigger to use student_code_seq
-- without granting sequence access directly to app users.
alter function public.assign_student_code()
security definer;
