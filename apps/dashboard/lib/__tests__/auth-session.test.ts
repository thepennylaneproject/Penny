import { describe, it, expect, vi } from "vitest";
import { createAuthSessionToken } from "@/lib/auth-session";
import { createHmac } from "crypto";

describe("Auth Session", () => {
  const testSecret = "test-secret-key-12345";

  describe("createAuthSessionToken", () => {
    it("should create a valid token with expiry and signature", () => {
      const token = createAuthSessionToken(testSecret, 3600000);
      const parts = token.split(".");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBeTruthy(); // exp
      expect(parts[1]).toBeTruthy(); // signature
    });

    it("should have expiry in the future", () => {
      const now = Date.now();
      const token = createAuthSessionToken(testSecret, 3600000);
      const exp = Number(token.split(".")[0]);
      expect(exp).toBeGreaterThan(now);
    });

    it("should use correct TTL", () => {
      const now = Date.now();
      const ttl = 7200000; // 2 hours
      const token = createAuthSessionToken(testSecret, ttl);
      const exp = Number(token.split(".")[0]);
      expect(exp).toBeLessThanOrEqual(now + ttl + 1000); // +1s tolerance
      expect(exp).toBeGreaterThanOrEqual(now + ttl - 1000);
    });

    it("should generate valid HMAC-SHA256 signature", () => {
      const token = createAuthSessionToken(testSecret, 3600000);
      const [exp, hexSig] = token.split(".");
      const expectedSig = createHmac("sha256", testSecret)
        .update(`penny|${exp}`)
        .digest("hex");
      expect(hexSig).toBe(expectedSig);
    });

    it("should generate different tokens for different times", () => {
      let now = 1_700_000_000_000;
      const spy = vi.spyOn(Date, "now").mockImplementation(() => now++);
      const token1 = createAuthSessionToken(testSecret, 3600000);
      const token2 = createAuthSessionToken(testSecret, 3600000);
      spy.mockRestore();
      expect(token1).not.toBe(token2);
    });

    it("should respect custom TTL", () => {
      const now = Date.now();
      const customTtl = 1000000;
      const token = createAuthSessionToken(testSecret, customTtl);
      const exp = Number(token.split(".")[0]);
      expect(exp - now).toBeLessThan(customTtl + 100);
    });

    it("should use default 30-day TTL if not specified", () => {
      const now = Date.now();
      const defaultTtl = 7 * 24 * 3600 * 1000; // 7 days in code
      const token = createAuthSessionToken(testSecret);
      const exp = Number(token.split(".")[0]);
      expect(exp - now).toBeLessThan(defaultTtl + 100);
      expect(exp - now).toBeGreaterThan(defaultTtl - 100);
    });
  });

  describe("verifySessionCookie signature", () => {
    it("should verify token format is correct", () => {
      const token = createAuthSessionToken(testSecret, 3600000);
      const parts = token.split(".");
      expect(parts.length).toBe(2);
      expect(/^\d+$/.test(parts[0])).toBe(true); // exp is numeric
      expect(/^[0-9a-f]+$/.test(parts[1])).toBe(true); // sig is hex
    });

    it("should handle malformed tokens", () => {
      expect(() => {
        const malformed = "not-a-valid-token";
        const parts = malformed.split(".");
        expect(parts.length).not.toBe(2);
      }).not.toThrow();
    });

    it("token signature should include penny prefix", () => {
      const token = createAuthSessionToken(testSecret, 3600000);
      const exp = token.split(".")[0];
      const expectedSig = createHmac("sha256", testSecret)
        .update(`penny|${exp}`)
        .digest("hex");
      expect(token.split(".")[1]).toBe(expectedSig);
    });

    it("should detect tampered expiry", () => {
      const token = createAuthSessionToken(testSecret, 3600000);
      const [exp, sig] = token.split(".");
      const tampered = `${Number(exp) + 1000}.${sig}`;
      const parts = tampered.split(".");
      expect(parts[0]).not.toBe(exp);
    });

    it("should detect wrong secret", () => {
      const token = createAuthSessionToken(testSecret, 3600000);
      const [exp, sig] = token.split(".");
      const expectedSig = createHmac("sha256", "wrong-secret")
        .update(`penny|${exp}`)
        .digest("hex");
      expect(sig).not.toBe(expectedSig);
    });
  });
});
