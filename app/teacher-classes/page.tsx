"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ClassItem = {
  id: string;
  name: string;
  branch_id: string;
  status: string;
};

export default function TeacherClassesPage() {
  const supabase = createClient();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadClasses() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("classes")
        .select("id,name,branch_id,status")
        .eq("status", "active")
        .order("name");

      if (error) {
        console.error(error);
        setError("Không tải được danh sách lớp.");
        setClasses([]);
      } else {
        setClasses(data ?? []);
      }

      setLoading(false);
    }

    loadClasses();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lớp của tôi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Các lớp bạn đang được phân công.
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border bg-white p-6 text-gray-500">
          Đang tải danh sách lớp...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && classes.length === 0 && (
        <div className="rounded-xl border bg-white p-6 text-gray-500">
          Hiện chưa có lớp nào được phân công cho tài khoản này.
        </div>
      )}

      {!loading && !error && classes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((item) => (
            <a
              key={item.id}
              href={`/teacher-student-attendance?classId=${item.id}`}
              className="block rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="text-lg font-semibold">{item.name}</div>
              <div className="mt-2 text-sm text-gray-500">
                Lớp đang hoạt động · Bấm để điểm danh
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
