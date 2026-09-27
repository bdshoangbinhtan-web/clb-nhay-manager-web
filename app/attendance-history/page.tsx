import { redirect } from "next/navigation";

export default function LegacyAttendanceHistoryPage() {
  redirect("/students/history");
}
