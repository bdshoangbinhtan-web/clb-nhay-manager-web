export function managerPayrollRouteBlocked(pathname: string): boolean {
  return (
    (pathname === "/teacher-payroll" || pathname.startsWith("/teacher-payroll/")) &&
    pathname !== "/teacher-payroll/substitution" &&
    pathname !== "/teacher-payroll/substitution/"
  );
}
