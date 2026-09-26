# Cost Split

A web version of the *Cost Split* iPhone app: track shared costs within a group,
split them evenly or unevenly, and settle up in as few payments as possible.

Built with Next.js, TypeScript, Tailwind, and Supabase.

## What it does

- **Accounts** with unique usernames and passwords. Group owners invite registered usernames.
- **Expenses** with one payer and any set of participants.
- **Four ways to split** — equally, by coefficient/shares, by exact amounts, or
  by percentage. Uneven splits are validated rather than silently rescaled.
- **Transfers** for loans and paybacks: money moving between two people, which
  moves the balance without counting as group spending.
- **Multiple currencies**, with rates entered by hand or fetched on demand.
  Balances are reported in the group's own currency.
- **Payback plan** that clears every balance in the fewest payments.
- **Receipt scanning** uses Gemini 3.5 Flash-Lite to read item names and prices, stores the photo,
  and creates an expense. Review the scan, then choose which people share each item.
  Tax, tip, and other differences between item prices and the total are spread
  across the selected items in proportion to their prices.
- **Reports** — per-person totals, payback plan, category and currency
  breakdowns, all entries — printable or exportable as CSV.
- **Export / import** a group as a file to move it between devices.
- **Shared receipts** keep the photo and each person's item choices in sync across devices.

## Running it

```bash
npm install
cp .env.example .env.local # set Supabase settings and a Gemini API key
npm run dev      # http://localhost:3000
```

```bash
npm run test       # unit tests for the money, split and settlement logic
npm run typecheck  # tsc --noEmit
npm run lint
npm run build
```

## Deploying

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`GEMINI_API_KEY` on the host. Keep the Gemini key server-side. The free Gemini
tier has request limits and Google may use free-tier inputs to improve its products.
Enable Email authentication and disable email confirmations in Supabase Auth. The schema is in
`supabase/schema.sql` and has been applied
to the Cost Split project. Never put a service role key in a public environment variable.

## How it's put together

```
src/lib/          domain logic, no React
  types.ts        the data model
  money.ts        parsing, formatting and currency conversion
  split.ts        dividing an expense between participants
  settle.ts       balances, and the minimal payback plan
  storage.ts      local cache and fallback
  cloud.ts        Supabase Auth, groups, receipt choices, and sync
  photos.ts       local cache and private Supabase Storage
  store.tsx       React context wrapping local and cloud state
src/components/   shared UI
src/app/          routes
```

### Money is never a float

Every amount is an integer count of the currency's minor unit — cents for USD,
yen for JPY, thousandths for KWD. Splitting uses the largest-remainder method,
so shares always add back up to the total exactly: 10.00 split three ways comes
out 3.34 / 3.33 / 3.33 rather than leaving a stray cent unaccounted for.

### The payback plan

The fewest payments that can clear *k* people is *k* minus the number of
subgroups whose balances already cancel among themselves, so the settlement
searches for the largest such partition (exhaustively up to 12 people, greedily
beyond that) and settles each subgroup on its own. That's what stops it routing
one person's debt through somebody uninvolved. `settle.test.ts` checks the
result against a brute-force minimum over 300 randomly generated groups.

### Where data lives

With Supabase configured, groups and item choices live in Postgres and receipt
photos live in a private Storage bucket. Row level policies restrict access to
people who accepted a username invitation. A person's receipt claim is tied to
their account. Realtime refreshes group balances on other devices.
The browser keeps a local copy for quick loading. Existing local groups upload
when the configured app first opens.

The server sends a compressed receipt photo to Gemini for scanning. The photo
also goes to Supabase Storage so group members can review it. If scanning fails,
the receipt stays in the group and its details can be entered by hand.
Existing anonymous users can create a username and password on their current
browser to keep their groups. Usernames use a non-deliverable internal email
identity, so password reset by email is unavailable.
Export files include group numbers but not receipt photos.
