import type { ReactNode } from "react";
import { StudentModuleLayout } from "@/components/students/student-module-layout";

export default function StudentsLayout({ children }: { children: ReactNode }) {
  return <StudentModuleLayout>{children}</StudentModuleLayout>;
}
