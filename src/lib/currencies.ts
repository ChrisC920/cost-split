/** A short list of common currencies; any 3-letter code can still be typed in. */
export const COMMON_CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "ZAR", name: "South African Rand" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "KRW", name: "South Korean Won" },
  { code: "THB", name: "Thai Baht" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "AED", name: "UAE Dirham" },
  { code: "ILS", name: "Israeli Shekel" },
  { code: "ISK", name: "Icelandic Krona" },
];

export function currencyName(code: string): string | undefined {
  return COMMON_CURRENCIES.find((c) => c.code === code.toUpperCase())?.name;
}

/**
 * Pull live rates relative to `base` from the open Frankfurter API.
 *
 * Rates are optional everywhere in the app — a group works fine with manually
 * entered ones — so a failure here is reported, never thrown into the UI.
 */
export async function fetchRates(
  base: string,
  symbols: string[],
): Promise<{ rates: Record<string, number> } | { error: string }> {
  const wanted = symbols.map((s) => s.toUpperCase()).filter((s) => s !== base.toUpperCase());
  if (wanted.length === 0) return { rates: {} };

  try {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(
      base.toUpperCase(),
    )}&to=${encodeURIComponent(wanted.join(","))}`;
    const response = await fetch(url);
    if (!response.ok) return { error: `Rate service returned ${response.status}.` };

    const data = (await response.json()) as { rates?: Record<string, number> };
    if (!data.rates) return { error: "Rate service returned no rates." };

    // Frankfurter gives target-per-base; we store base-per-target.
    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(data.rates)) {
      if (typeof value === "number" && value > 0) rates[code] = 1 / value;
    }
    if (Object.keys(rates).length === 0) return { error: "No rates available for those currencies." };
    return { rates };
  } catch {
    return { error: "Couldn't reach the rate service. Enter rates manually or try again." };
  }
}
