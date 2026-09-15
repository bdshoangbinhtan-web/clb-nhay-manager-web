import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // Middleware handles cookie refresh when needed.
            }
          },
        },
      }
    );

    const authorization = request.headers.get("authorization") || "";
    const bearerToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    const {
      data: { user },
    } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Bạn chưa đăng nhập." },
        { status: 401 }
      );
    }

    const { data: callerProfile, error: callerError } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (
      callerError ||
      !callerProfile ||
      callerProfile.is_active !== true ||
      callerProfile.role !== "admin"
    ) {
      return NextResponse.json(
        { error: "Bạn không có quyền tạo tài khoản giáo viên." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const teacherId = String(body.teacherId || "").trim();
    const action = String(body.action || "create").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!teacherId) {
      return NextResponse.json(
        { error: "Thiếu thông tin giáo viên." },
        { status: 400 }
      );
    }

    const allowedActions = new Set(["create", "reset_password", "lock", "unlock", "delete"]);
    if (!allowedActions.has(action)) {
      return NextResponse.json(
        { error: "Thao tác tài khoản không hợp lệ." },
        { status: 400 }
      );
    }

    if ((action === "create" || action === "reset_password") && password.length < 6) {
      return NextResponse.json(
        { error: "Mật khẩu phải có ít nhất 6 ký tự." },
        { status: 400 }
      );
    }

    if (action === "create" && !email) {
      return NextResponse.json(
        { error: "Thiếu email đăng nhập." },
        { status: 400 }
      );
    }

    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        { error: "Thiếu cấu hình Supabase server." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from("teachers")
      .select("id, profile_id, full_name, phone, status")
      .eq("id", teacherId)
      .maybeSingle();

    if (teacherError) {
      console.error("LOAD TEACHER ERROR:", teacherError);
      return NextResponse.json(
        { error: teacherError.message },
        { status: 500 }
      );
    }

    if (!teacher) {
      return NextResponse.json(
        { error: "Không tìm thấy giáo viên." },
        { status: 404 }
      );
    }

    if (action !== "create") {
      if (!teacher.profile_id) {
        return NextResponse.json(
          { error: "Giáo viên này chưa có tài khoản đăng nhập." },
          { status: 400 }
        );
      }

      if (action === "reset_password") {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          teacher.profile_id,
          { password }
        );
        if (error) {
          console.error("RESET TEACHER PASSWORD ERROR:", error);
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ success: true, action });
      }

      if (action === "lock" || action === "unlock") {
        const banDuration = action === "lock" ? "876000h" : "none";
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
          teacher.profile_id,
          { ban_duration: banDuration }
        );
        if (authError) {
          console.error("UPDATE TEACHER AUTH STATUS ERROR:", authError);
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .update({ is_active: action === "unlock" })
          .eq("id", teacher.profile_id);

        if (profileError) {
          console.error("UPDATE TEACHER PROFILE STATUS ERROR:", profileError);
          return NextResponse.json({ error: profileError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, action });
      }

      if (action === "delete") {
        const profileId = teacher.profile_id;

        const { error: unlinkError } = await supabaseAdmin
          .from("teachers")
          .update({ profile_id: null })
          .eq("id", teacher.id)
          .eq("profile_id", profileId);

        if (unlinkError) {
          console.error("UNLINK TEACHER ACCOUNT ERROR:", unlinkError);
          return NextResponse.json({ error: unlinkError.message }, { status: 500 });
        }

        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("id", profileId);

        if (profileError) {
          console.error("DELETE TEACHER PROFILE ERROR:", profileError);
          await supabaseAdmin
            .from("teachers")
            .update({ profile_id: profileId })
            .eq("id", teacher.id)
            .is("profile_id", null);
          return NextResponse.json({ error: profileError.message }, { status: 500 });
        }

        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(profileId);
        if (authDeleteError) {
          console.error("DELETE TEACHER AUTH USER ERROR:", authDeleteError);
          return NextResponse.json({ error: authDeleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, action });
      }
    }

    if (teacher.status !== "active") {
      return NextResponse.json(
        { error: "Giáo viên này đang nghỉ, không thể tạo tài khoản." },
        { status: 400 }
      );
    }

    if (teacher.profile_id) {
      return NextResponse.json(
        { error: "Giáo viên này đã có tài khoản." },
        { status: 400 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: teacher.full_name,
          role: "teacher",
        },
      });

    if (authError || !authData.user) {
      console.error("CREATE AUTH USER ERROR:", authError);

      return NextResponse.json(
        { error: authError?.message || "Không thể tạo tài khoản đăng nhập." },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          full_name: teacher.full_name,
          phone: teacher.phone || null,
          role: "teacher",
          is_active: true,
        },
        {
          onConflict: "id",
        }
      );

    if (profileError) {
      console.error("CREATE PROFILE ERROR:", profileError);

      await supabaseAdmin.auth.admin.deleteUser(authUserId);

      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const { error: updateTeacherError } = await supabaseAdmin
      .from("teachers")
      .update({
        profile_id: authUserId,
      })
      .eq("id", teacher.id)
      .is("profile_id", null);

    if (updateTeacherError) {
      console.error("LINK TEACHER ERROR:", updateTeacherError);

      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", authUserId);

      await supabaseAdmin.auth.admin.deleteUser(authUserId);

      return NextResponse.json(
        { error: updateTeacherError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      teacherId: teacher.id,
      profileId: authUserId,
      email,
    });
  } catch (error) {
    console.error("TEACHER ACCOUNT ACTION ERROR:", error);

    return NextResponse.json(
      { error: "Lỗi máy chủ khi tạo tài khoản." },
      { status: 500 }
    );
  }
}
