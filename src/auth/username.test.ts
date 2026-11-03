import { describe, expect, it } from "vitest";
import { emailToUsername, isValidUsername, loginIdentifierToEmail, normalizeUsername } from "./username";

describe("username helpers", () => {
  it("maps a username to the internal email", () => {
    expect(loginIdentifierToEmail("  Budi.Tukang ")).toBe("budi.tukang@dj3.local");
  });

  it("keeps a real email untouched so existing accounts can still sign in", () => {
    expect(loginIdentifierToEmail("owner@example.com")).toBe("owner@example.com");
  });

  it("maps the internal email back to the username and leaves real emails alone", () => {
    expect(emailToUsername("budi@dj3.local")).toBe("budi");
    expect(emailToUsername("owner@example.com")).toBe("owner@example.com");
    expect(emailToUsername(undefined)).toBe("");
  });

  it("normalizes to lowercase", () => {
    expect(normalizeUsername(" Budi ")).toBe("budi");
  });

  it("accepts 3-32 chars of letters, digits, dot, dash and underscore", () => {
    expect(isValidUsername("budi_01")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
    expect(isValidUsername("budi tukang")).toBe(false);
    expect(isValidUsername("budi@x")).toBe(false);
  });
});
