import assert from "node:assert/strict";
import test from "node:test";
import { entryRedirect, isPublicSeoFile } from "../lib/middleware-entry.ts";

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
