/**
 * Money helpers. Everything is an integer count of minor units; the currency
 * decides how many minor units make a major one.
 */

/** Currencies whose minor unit is the major unit (no cents). */
const ZERO_DECIMAL = new Set([
  "JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "XAF", "XOF", "XPF",
]);

/** Currencies with three decimal places. */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "OMR", "TND", "LYD"]);

export function decimalsFor(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function minorPerMajor(currency: string): number {
  return 10 ** decimalsFor(currency);
}

/** Parse user input ("12.34", "1 234,50") into minor units. Returns null if unparseable. */
export function parseAmount(input: string, currency: string): number | null {
  const cleaned = input.trim().replace(/\s| |'/g, "");
  if (!cleaned) return null;

  // Treat whichever separator appears last as the decimal point.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }

  if (!/^-?\d*\.?\d*$/.test(normalized) || normalized === "." || normalized === "-") {
    return null;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  const scaled = value * minorPerMajor(currency);
  // Nudge past binary-float representation error before rounding (e.g. 8.115 * 100).
  return Math.round(Number(scaled.toPrecision(12)));
}

/** Render minor units as a plain decimal string, no currency symbol. */
export function formatAmount(minor: number, currency: string): string {
  const decimals = decimalsFor(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const per = 10 ** decimals;
  const major = Math.floor(abs / per);
  const rest = abs % per;
  const grouped = major.toLocaleString("en-US");
  const body = decimals === 0 ? grouped : `${grouped}.${String(rest).padStart(decimals, "0")}`;
  return negative ? `-${body}` : body;
}

/** Render with the currency code, e.g. `12.34 EUR`. */
export function formatMoney(minor: number, currency: string): string {
  return `${formatAmount(minor, currency)} ${currency.toUpperCase()}`;
}

/**
 * Convert minor units of `from` into minor units of `to`.
 *
 * `rates` maps a currency code to how many units of the base currency one unit
 * of it is worth. Conversions route through the base currency.
 */
export function convert(
  minor: number,
  from: string,
  to: string,
  base: string,
  rates: Record<string, number>,
): number {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return minor;

  const rateOf = (code: string): number =>
    code === base.toUpperCase() ? 1 : (rates[code] ?? 1);

  const major = minor / minorPerMajor(f);
  const inBase = major * rateOf(f);
  const inTarget = inBase / rateOf(t);
  return Math.round(inTarget * minorPerMajor(t));
}
