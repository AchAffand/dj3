import { describe, expect, it } from "vitest";
import { formatDate, formatQuantity, formatRupiah } from "./format";

describe("Indonesian number formatting", () => {
  it("shows fractional material quantities without noisy trailing zeroes", () => {
    expect(formatQuantity(5.754)).toBe("5,754");
    expect(formatQuantity(4.1219)).toBe("4,1219");
    expect(formatQuantity(6)).toBe("6");
  });

  it("formats the unit price and subtotal as rupiah", () => {
    expect(formatRupiah(575400)).toMatch(/575\.400/);
  });

  it("formats saved dates for Indonesian readers", () => {
    expect(formatDate("2026-01-02T00:00:00.000Z")).toContain("2026");
  });
});
