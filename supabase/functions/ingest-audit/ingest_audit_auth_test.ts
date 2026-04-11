import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  getBearerToken,
  timingSafeEqualUtf8,
  verifyAuditIngestRequest,
} from "./ingest_audit_auth.ts";

Deno.test("timingSafeEqualUtf8 accepts equal strings", () => {
  assertEquals(timingSafeEqualUtf8("abc", "abc"), true);
});

Deno.test("timingSafeEqualUtf8 rejects unequal strings", () => {
  assertEquals(timingSafeEqualUtf8("abc", "abd"), false);
  assertEquals(timingSafeEqualUtf8("a", "ab"), false);
});

Deno.test("getBearerToken parses Authorization header", () => {
  const req = new Request("https://x", {
    headers: { Authorization: "Bearer my-secret-token" },
  });
  assertEquals(getBearerToken(req), "my-secret-token");
});

Deno.test("verifyAuditIngestRequest fails when secret not configured", () => {
  const req = new Request("https://x", { method: "POST" });
  const r = verifyAuditIngestRequest(req, undefined);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 500);
});

Deno.test("verifyAuditIngestRequest fails without credentials", () => {
  const req = new Request("https://x", { method: "POST" });
  const r = verifyAuditIngestRequest(req, "expected");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 401);
});

Deno.test("verifyAuditIngestRequest fails on wrong Bearer", () => {
  const req = new Request("https://x", {
    method: "POST",
    headers: { Authorization: "Bearer wrong" },
  });
  const r = verifyAuditIngestRequest(req, "expected");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 401);
});

Deno.test("verifyAuditIngestRequest accepts valid Bearer", () => {
  const req = new Request("https://x", {
    method: "POST",
    headers: { Authorization: "Bearer expected-secret" },
  });
  const r = verifyAuditIngestRequest(req, "expected-secret");
  assertEquals(r.ok, true);
});

Deno.test("verifyAuditIngestRequest accepts x-penny-api-secret", () => {
  const req = new Request("https://x", {
    method: "POST",
    headers: { "x-penny-api-secret": "expected-secret" },
  });
  const r = verifyAuditIngestRequest(req, "expected-secret");
  assertEquals(r.ok, true);
});
