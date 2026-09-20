import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activeStaffRole } from "../lib/active-staff-role.ts";
import { managerPayrollRouteBlocked } from "../lib/teacher-payroll-access.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const middleware = read("middleware.ts");
const sidebar = read("components/layout/sidebar.tsx");
const mobileNav = read("components/layout/mobile-bottom-nav.tsx");
const teachers = read("app/teachers/page.tsx");
const dashboard = read("app/dashboard/page.tsx");
const attendance = read("app/teacher-attendance/page.tsx");
const classDetail = read("app/branches/[id]/page.tsx");
const attendanceDetail = read("components/teachers/attendance-detail-sheet.tsx");
const payroll = read("app/teacher-payroll/page.tsx");
const migration = read("supabase/migrations/20260920010000_add_teacher_attendance_audit_reader.sql");

test("only active, exact Admin or Manager profiles resolve to a staff role", () => {
  assert.equal(activeStaffRole({ is_active: true, role: "admin" }), "admin");
  assert.equal(activeStaffRole({ is_active: true, role: "manager" }), "manager");
  for (const profile of [null, undefined, { is_active: false, role: "manager" },
    { is_active: true, role: "teacher" }, { is_active: true, role: null }]) {
    assert.equal(activeStaffRole(profile), "");
  }
  for (const page of [teachers, dashboard, attendance, classDetail]) {
    assert.match(page, /activeStaffRole\(profileError \? null : profile\)/);
    assert.match(page, /if \(!currentRole\) \{/);
    assert.doesNotMatch(page, /profile\?\.is_active && profile\.role === "admin" \? "admin" : "manager"/);
  }
  assert.match(teachers, /if \(!role\) return;[\s\S]*function openEdit/);
  assert.match(teachers, /onClick=\{openAdd\} disabled=\{!role\}/);
});

test("Manager payroll paths are denied by default except substitution", () => {
  for (const pathname of ["/teacher-payroll", "/teacher-payroll/", "/teacher-payroll/salary", "/teacher-payroll/substitution/history"]) {
    assert.equal(managerPayrollRouteBlocked(pathname), true, pathname);
  }
  for (const pathname of ["/teacher-payroll/substitution", "/teacher-payroll/substitution/", "/teachers", "/dashboard"]) {
    assert.equal(managerPayrollRouteBlocked(pathname), false, pathname);
  }
  assert.match(middleware, /role === "manager"[\s\S]*managerPayrollRouteBlocked\(pathname\)/);
  assert.match(sidebar, /role === "manager"[\s\S]*item\[2\] !== "\/teacher-payroll"/);
  assert.match(mobileNav, /item\[3\] !== "\/teacher-payroll"/);
});

test("Manager teacher data paths omit salary fields and updates preserve existing salary", () => {
  assert.match(teachers, /currentRole === "admin"[\s\S]*select\("\*"\)[\s\S]*select\("id,profile_id,full_name,phone,birth_date,address,start_date,avatar_url,notes,status,end_date,created_at"\)/);
  assert.match(teachers, /role === "admin"[\s\S]*salary_type:[\s\S]*salary_rate:[\s\S]*allowance:/);
  assert.match(teachers, /: commonPayload/);
  assert.match(teachers, /\.insert\(\{ \.\.\.commonPayload, status: "active" \}\)\.select\(managerFields\)/);
  assert.match(teachers, /result\.error\?\.code === "23502"/);
  assert.match(teachers, /salary_type: "per_session",\s*salary_rate: 0,\s*allowance: 0/);
  assert.match(teachers, /if \(role === "admin"\) \{\s*result = await supabase\.from\("teachers"\)\.insert/);
  assert.match(attendance, /role === "admin"[\s\S]*"id,full_name,salary_rate,status"[\s\S]*"id,full_name,status"/);
});

test("Manager dashboard empty state ignores payroll count while Admin keeps it", () => {
  assert.match(dashboard, /currentRole === "admin"[\s\S]*\.from\("teacher_payrolls"\)/);
  assert.match(dashboard, /role !== "admin" \|\| smartAlerts\.payrollPendingCount === 0/g);
});

test("Admin payroll workflow remains present", () => {
  assert.match(payroll, /\.from\("teacher_payrolls"\)/);
  assert.match(payroll, /ClassSalaryPanel/);
  assert.match(payroll, /total_amount/);
  assert.match(payroll, /Chi lương/);
});

test("Attendance audit reader is narrow, counts taught attendance, and supports legacy fallback", () => {
  assert.match(migration, /count\(\*\) filter \(where ta\.status = 'taught'\)/);
  assert.match(migration, /l\.entity_type = 'teacher_attendance'/);
  assert.match(migration, /p\.role::text in \('admin', 'manager'\)/);
  assert.match(migration, /p\.is_active = true/);
  assert.match(migration, /order by ta\.attendance_date desc, c\.name, ta\.id/);
  assert.match(migration, /order by l\.created_at, l\.id/);
  assert.doesNotMatch(migration, /teacher_payrolls|teacher_payroll_details|salary_rate|allowance/);
  assert.match(migration, /coalesce\(\([\s\S]*jsonb_agg[\s\S]*'\[\]'::jsonb\)/);
  assert.match(attendanceDetail, /Không có lịch sử thao tác/);
});
