import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_MANAGER_ROUTES = [
  "/dashboard",
  "/branches",
  "/students",
  "/teachers",
  "/attendance",
  "/attendance-history",
  "/teacher-attendance",
  "/tuition",
  "/teacher-payroll",
  "/expenses",
  "/reports",
  "/settings",
  "/activity-log",
];

const TEACHER_ROUTES = [
  "/teacher-classes",
  "/teacher-student-attendance",
  "/teacher-session",
  "/teacher-substitution",
  "/teacher-account",
  "/teacher-salary",
];

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Chưa đăng nhập
  if (!user && pathname !== "/login" && pathname !== "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Đã đăng nhập nhưng quay lại login
  if (user && (pathname === "/login" || pathname === "/")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "teacher") {
      return NextResponse.redirect(
        new URL("/teacher-classes", request.url)
      );
    }

    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Nếu chưa có user thì các đoạn dưới không cần chạy
  if (!user) {
    return response;
  }

  // Lấy role hiện tại
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.is_active) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = profile.role;

  // =====================================================
  // TEACHER
  // =====================================================
  if (role === "teacher") {
    // Teacher chỉ được vào khu Teacher
    if (
      matchesRoute(pathname, ADMIN_MANAGER_ROUTES) ||
      pathname.startsWith("/api/admin/")
    ) {
      return NextResponse.redirect(
        new URL("/teacher-classes", request.url)
      );
    }

    return response;
  }

  // =====================================================
  // ADMIN / MANAGER
  // =====================================================
  if (role === "admin" || role === "manager") {
    // Không cho Admin/Manager đi nhầm vào khu Teacher
    if (matchesRoute(pathname, TEACHER_ROUTES)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return response;
  }

  // Role không hợp lệ
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
