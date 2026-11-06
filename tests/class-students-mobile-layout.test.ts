import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(
  new URL("../app/branches/[id]/page.tsx", import.meta.url),
  "utf8"
);

test("mobile student rows use cards rather than a horizontally scrolling table", () => {
  assert.match(page, /data-testid="class-students-mobile"/);
  assert.match(page, /className="mt-4 space-y-2 xl:hidden"/);
  assert.match(page, /className="mt-2\.5 grid min-w-0 grid-cols-2 gap-2"/);
  assert.match(page, /student\.full_name/);
  assert.match(page, /student\.parent_phone/);
  assert.match(page, /student\.student_code/);
  const mobileSection = page.split('data-testid="class-students-mobile"')[1]
    .split('data-testid="class-students-desktop"')[0];
  assert.doesNotMatch(mobileSection, /overflow-x-auto|min-w-\[630px\]/);
  assert.match(mobileSection, /changeStudentStatus\(student, active \? "inactive" : "active"\)/);
  assert.match(mobileSection, /href=\{\`\/tuition\?studentId=/);
});

test("desktop still has separate active, paused and tuition columns", () => {
  assert.match(page, /data-testid="class-students-desktop"/);
  assert.match(page, /className="mt-5 hidden w-full overflow-x-auto xl:block"/);
  assert.match(page, /grid-cols-\[minmax\(0,1fr\)_108px_108px_116px\]/);
  assert.match(page, /changeStudentStatus\(student, "active"\)/);
  assert.match(page, /changeStudentStatus\(student, "inactive"\)/);
});

test("mobile status filters stay together in one three-column row", () => {
  assert.match(page, /grid grid-cols-3 gap-1 sm:flex sm:flex-wrap/);
});
