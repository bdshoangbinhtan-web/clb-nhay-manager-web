import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REALTIME_TABLES,
  createRealtimeEventCoalescer,
  realtimeTopicsForTables,
  realtimeTopicsIntersect,
} from "../lib/realtime/invalidation.ts";

test("database entities map to selective screen topics", () => {
  assert.deepEqual(
    [...realtimeTopicsForTables(["tuition_payments"])].sort(),
    ["activity-log", "dashboard", "reports", "students", "tuition"],
  );
  assert.equal(realtimeTopicsForTables(["attendance"]).has("expenses"), false);
  assert.equal(realtimeTopicsForTables(["unknown_table"]).size, 0);
  assert.equal(new Set(REALTIME_TABLES).size, REALTIME_TABLES.length);
});

test("topic intersection ignores events unrelated to the mounted screen", () => {
  const changed = realtimeTopicsForTables(["teacher_payrolls"]);
  assert.equal(realtimeTopicsIntersect(new Set(["payroll"]), changed), true);
  assert.equal(realtimeTopicsIntersect(new Set(["trials"]), changed), false);
});

test("rapid duplicate database events are coalesced into one flush", async () => {
  const batches: Array<ReadonlySet<string>> = [];
  const coalescer = createRealtimeEventCoalescer<string>(10, (batch) => batches.push(batch));

  coalescer.push("attendance");
  coalescer.push("attendance");
  coalescer.push("class_sessions");
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(batches.length, 1);
  assert.deepEqual([...batches[0]].sort(), ["attendance", "class_sessions"]);
  coalescer.dispose();
});

test("disposing a pending coalescer prevents a late refresh", async () => {
  let flushes = 0;
  const coalescer = createRealtimeEventCoalescer<string>(10, () => { flushes += 1; });
  coalescer.push("students");
  coalescer.dispose();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(flushes, 0);
});

test("one authenticated provider owns the channel and unmount cleanup", () => {
  const provider = readFileSync(
    "components/realtime/global-realtime-provider.tsx",
    "utf8",
  );
  const shell = readFileSync("components/layout/app-shell.tsx", "utf8");

  assert.equal((provider.match(/\.channel\("angel-bk-global-data-v1"\)/g) ?? []).length, 1);
  assert.match(provider, /supabase\.removeChannel\(channel\)/);
  assert.match(shell, /if \(pathname === "\/login" \|\| pathname === "\/"\)/);
  assert.equal((shell.match(/<GlobalRealtimeProvider>/g) ?? []).length, 1);
});

test("publication migration is idempotent and excludes the Admin-only activity log", () => {
  const migration = readFileSync(
    "supabase/migrations/20260925090000_enable_management_realtime.sql",
    "utf8",
  );

  assert.match(migration, /from pg_publication_tables/);
  assert.match(migration, /tablename = v_table/);
  assert.match(migration, /alter publication supabase_realtime add table public\.%I/);
  assert.doesNotMatch(migration, /'activity_logs'/);
  assert.doesNotMatch(migration, /create policy|alter table public\.[a-z_]+ enable row level security/i);
  for (const table of REALTIME_TABLES) {
    assert.match(migration, new RegExp(`'${table}'`), table);
  }
});
