import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { entryRedirect, isPublicPage, isPublicSeoFile } from "../lib/middleware-entry.ts";

test("SEO files are public so crawlers are not sent to login", () => {
  assert.equal(isPublicSeoFile("/robots.txt"), true);
  assert.equal(isPublicSeoFile("/sitemap.xml"), true);
  assert.equal(isPublicSeoFile("/googleed497b2fe46cb459.html"), true);
  assert.equal(isPublicSeoFile("/dashboard"), false);
  assert.equal(isPublicSeoFile("/google-evil/x.html"), false);
  assert.equal(isPublicSeoFile("/googleXYZ.html"), false);
});

test("authenticated admin and teacher stay on the public homepage", () => {
  assert.equal(entryRedirect("/", "admin"), null);
  assert.equal(entryRedirect("/", "teacher"), null);
});

test("authenticated users visiting login go to their role destination", () => {
  assert.equal(entryRedirect("/login", "admin"), "/dashboard");
  assert.equal(entryRedirect("/login", "manager"), "/dashboard");
  assert.equal(entryRedirect("/login", "teacher"), "/teacher-classes");
});

test("management routes still require authentication", () => {
  assert.equal(entryRedirect("/dashboard", null), "/login");
  assert.equal(entryRedirect("/students", null), "/login");
  assert.equal(entryRedirect("/", null), null);
  assert.equal(entryRedirect("/login", null), null);
});

test("program pages under /lop-hoc are public and never redirect to login", () => {
  for (const path of ["/", "/lop-hoc", "/lop-hoc/kids-co-ban", "/lop-hoc/kids-nang-cao", "/lop-hoc/crew-bieu-dien", "/lop-hoc/lop-cuoi-tuan", "/lop-hoc/kids-co-ban/"]) {
    assert.equal(isPublicPage(path), true, path);
    assert.equal(entryRedirect(path, null), null, path);
  }
  assert.equal(isPublicPage("/privacy"), true);
  assert.equal(isPublicPage("/delete-account"), true);
});

test("public page matching does not leak management routes", () => {
  for (const path of ["/dashboard", "/students", "/login", "/lop-hoc-admin", "/lop-hoc/a/b", "/lop-hoc/../dashboard", "/lop-hoc/Kids", "/api/lop-hoc"]) {
    assert.equal(isPublicPage(path), false, path);
  }
  assert.equal(entryRedirect("/lop-hoc/a/b", null), "/login");
});

test("middleware and app shell share the same public page list", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/layout/app-shell.tsx", import.meta.url), "utf8");
  assert.match(middleware, /if \(isPublicPage\(pathname\)\) return response;/);
  assert.match(shell, /isPublicPage\(pathname\)/);
  assert.match(shell, /from "@\/lib\/middleware-entry"/);
});
