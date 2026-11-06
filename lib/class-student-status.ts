export type ClassStudentStatusFilter = "all" | "active" | "paused";

export type StudentWithLearningStatus = {
  status: string | null;
};

export function isStudentStudying(status: string | null | undefined): boolean {
  return status === "active";
}

export function countClassStudentStatuses(students: readonly StudentWithLearningStatus[]) {
  const active = students.filter((student) => isStudentStudying(student.status)).length;
  return {
    all: students.length,
    active,
    paused: students.length - active,
  };
}

export function filterClassStudentsByStatus<T extends StudentWithLearningStatus>(
  students: readonly T[],
  filter: ClassStudentStatusFilter,
): T[] {
  if (filter === "all") return [...students];
  return students.filter((student) =>
    filter === "active" ? isStudentStudying(student.status) : !isStudentStudying(student.status),
  );
}
