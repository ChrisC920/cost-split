# Cost Split

A web version of the *Cost Split* iPhone app: track shared costs within a group,
split them evenly or unevenly, and settle up in as few payments as possible.

Built with Next.js (App Router), TypeScript and Tailwind, and deployable to
Vercel with no configuration or environment variables.

## What it does

- **Groups** of people, created without an account or sign-up.
- **Expenses** with one payer and any set of participants.
- **Four ways to split** — equally, by coefficient/shares, by exact amounts, or
  by percentage. Uneven splits are validated rather than silently rescaled.
- **Transfers** for loans and paybacks: money moving between two people, which
  moves the balance without counting as group spending.
- **Multiple currencies**, with rates entered by hand or fetched on demand.
  Balances are reported in the group's own currency.
- **Payback plan** that clears every balance in the fewest payments.
- **Receipt photos** attached to any entry.
- **Reports** — per-person totals, payback plan, category and currency
  breakdowns, all entries — printable or exportable as CSV.
- **Export / import** a group as a file to move it between devices.
- **Works offline**, and installs as a PWA.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run test       # unit tests for the money, split and settlement logic
npm run typecheck  # tsc --noEmit
npm run lint
npm run build
```

## Deploying

Import the repository into Vercel and accept the defaults — it's a standard
Next.js app with no environment variables and no external services. Any other
Node host works too via `npm run build && npm run start`.

## How it's put together

```
src/lib/          domain logic, no React
  types.ts        the data model
  money.ts        parsing, formatting and currency conversion
  split.ts        dividing an expense between participants
  settle.ts       balances, and the minimal payback plan
  storage.ts      the persistence interface + its localStorage implementation
  photos.ts       receipt storage in IndexedDB
  store.tsx       React context wrapping the storage layer
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

Groups are stored in the browser's `localStorage`; receipt photos go in
IndexedDB, so a few large images can't exhaust the space the group data needs.
Nothing is sent to a server — which is what makes the app work offline and
without an account, and it means clearing browser data clears the groups.

All reads and writes go through the `Storage` interface in `src/lib/storage.ts`.
Adding a server-backed, multi-device sync later means implementing that
interface and changing the one line in `createStorage()`; no UI code reads
storage directly.

## Not implemented

The original app syncs groups between devices through the developer's cloud
service, so several people can add costs from their own phones and get push
notifications. This clone is local-first and has no backend, so sharing is
export/import rather than live sync. See the note above on where that would slot
in.
