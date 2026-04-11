import { assertEquals } from "jsr:@std/assert@1/equals";
import {
  timingSafeEqualString,
  validateRepairServiceBearer,
} from "./repair-auth.ts";

Deno.test("validateRepairServiceBearer: undefined secret → 503", () => {
  const r = validateRepairServiceBearer("Bearer x", undefined);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 503);
});

Deno.test("validateRepairServiceBearer: empty secret → 503", () => {
  const r = validateRepairServiceBearer("Bearer ", "");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 503);
});

Deno.test("validateRepairServiceBearer: whitespace-only secret → 503", () => {
  const r = validateRepairServiceBearer("Bearer x", "   ");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 503);
});

Deno.test("validateRepairServiceBearer: missing Bearer → 401", () => {
  const r = validateRepairServiceBearer(null, "secret");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 401);
});

Deno.test("validateRepairServiceBearer: wrong token → 401", () => {
  const r = validateRepairServiceBearer("Bearer wrong", "secret");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 401);
});

Deno.test("validateRepairServiceBearer: empty bearer with non-empty secret → 401", () => {
  const r = validateRepairServiceBearer("Bearer ", "secret");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 401);
});

Deno.test("validateRepairServiceBearer: matching secret → ok", () => {
  const r = validateRepairServiceBearer("Bearer my-token", "my-token");
  assertEquals(r.ok, true);
});

Deno.test("timingSafeEqualString: equal strings → true", () => {
  assertEquals(timingSafeEqualString("abc", "abc"), true);
});

Deno.test("timingSafeEqualString: unequal length → false", () => {
  assertEquals(timingSafeEqualString("", "a"), false);
  assertEquals(timingSafeEqualString("ab", "a"), false);
});
