import { describe, expect, it } from "vitest";
import { convert, decimalsFor, formatAmount, formatMoney, parseAmount } from "./money";

describe("decimalsFor", () => {
  it("knows zero- and three-decimal currencies", () => {
    expect(decimalsFor("USD")).toBe(2);
    expect(decimalsFor("JPY")).toBe(0);
    expect(decimalsFor("kwd")).toBe(3);
  });
});

describe("parseAmount", () => {
  it("parses plain decimals", () => {
    expect(parseAmount("12.34", "USD")).toBe(1234);
    expect(parseAmount("12", "USD")).toBe(1200);
    expect(parseAmount(".5", "USD")).toBe(50);
  });

  it("parses comma decimal separators", () => {
    expect(parseAmount("12,34", "EUR")).toBe(1234);
    expect(parseAmount("1.234,50", "EUR")).toBe(123450);
  });

  it("parses thousands separators", () => {
    expect(parseAmount("1,234.50", "USD")).toBe(123450);
    expect(parseAmount("1 234.50", "USD")).toBe(123450);
  });

  it("respects currency decimals", () => {
    expect(parseAmount("500", "JPY")).toBe(500);
    expect(parseAmount("1.5", "KWD")).toBe(1500);
  });

  it("survives binary float representation error", () => {
    expect(parseAmount("8.115", "KWD")).toBe(8115);
    expect(parseAmount("1.005", "USD")).toBe(101);
  });

  it("rejects junk", () => {
    expect(parseAmount("", "USD")).toBeNull();
    expect(parseAmount("abc", "USD")).toBeNull();
    expect(parseAmount(".", "USD")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("pads minor units", () => {
    expect(formatAmount(5, "USD")).toBe("0.05");
    expect(formatAmount(1234, "USD")).toBe("12.34");
    expect(formatAmount(-1234, "USD")).toBe("-12.34");
  });

  it("groups thousands", () => {
    expect(formatAmount(123456789, "USD")).toBe("1,234,567.89");
  });

  it("omits the decimal point for zero-decimal currencies", () => {
    expect(formatAmount(1500, "JPY")).toBe("1,500");
  });

  it("appends the code", () => {
    expect(formatMoney(1234, "eur")).toBe("12.34 EUR");
  });
});

describe("convert", () => {
  const rates = { EUR: 1.1, JPY: 0.0067 };

  it("is a no-op for the same currency", () => {
    expect(convert(1234, "USD", "USD", "USD", rates)).toBe(1234);
  });

  it("converts into the base currency", () => {
    expect(convert(1000, "EUR", "USD", "USD", rates)).toBe(1100);
  });

  it("converts out of the base currency", () => {
    expect(convert(1100, "USD", "EUR", "USD", rates)).toBe(1000);
  });

  it("bridges two non-base currencies and handles decimal changes", () => {
    // 1000 JPY = 6.70 USD = 6.09 EUR
    expect(convert(1000, "JPY", "EUR", "USD", rates)).toBe(609);
  });

  it("treats an unknown currency as parity rather than throwing", () => {
    expect(convert(1000, "XXX", "USD", "USD", rates)).toBe(1000);
  });
});
