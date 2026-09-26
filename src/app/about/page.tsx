import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton, Screen } from "@/components/ui";
import { cloudEnabled } from "@/lib/cloud";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Cost Split stores your groups, splits expenses, converts currencies and works out the payback plan.",
};

export default function AboutPage() {
  return (
    <>
      <header className="border-b border-border bg-bg sticky top-0 z-20">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to groups"
            className="-ml-2 p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12.5 16L6.5 10l6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="font-semibold">How it works</h1>
        </div>
      </header>

      <Screen>
        <div className="mt-6 space-y-7 text-[15px] leading-relaxed">
          <section>
            <h2 className="font-semibold text-base mb-1.5">Where your data lives</h2>
            <p className="text-muted">
              {cloudEnabled ?
                "Groups and receipt photos sync through Supabase. Each device gets a private anonymous session, and people join a group with its invite link. Keep the link within your group." :
                "Groups and receipt photos are saved in this browser. Clearing browser data removes them."}
            </p>
            <p className="text-muted mt-2">
              {cloudEnabled ? "Anonymous sessions stay on one device. Export a group for a separate backup." :
                "To move a group, export it from Settings and import the file on another device. Photos are not included."}
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1.5">Scanning a receipt</h2>
            <p className="text-muted">
              Scan a photo to add its items and total. Check the names and prices against the saved
              photo. Select your name and tap the items you want. If several people pick an item,
              they share its cost equally. Tax and tip are spread across items by price.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1.5">Splitting an expense</h2>
            <p className="text-muted">
              Every expense has one person who paid and any number of people it&rsquo;s split
              between. You can split it four ways:
            </p>
            <ul className="text-muted mt-2 space-y-1.5 list-disc pl-5">
              <li>
                <strong className="text-text font-medium">Equally</strong> — everyone selected pays
                the same share.
              </li>
              <li>
                <strong className="text-text font-medium">By shares</strong> — give someone a
                coefficient of 2 and they carry twice the weight. Useful when a couple shares a
                room, or someone stayed an extra night.
              </li>
              <li>
                <strong className="text-text font-medium">Exact amounts</strong> — type what each
                person owes. Has to add up to the total.
              </li>
              <li>
                <strong className="text-text font-medium">Percentages</strong> — has to add up to
                100%.
              </li>
            </ul>
            <p className="text-muted mt-2">
              Rounding is handled so shares always add back up to the total exactly — a 10.00
              dinner split three ways comes out 3.34 / 3.33 / 3.33, never leaving a stray cent
              unaccounted for.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1.5">Loans and paybacks</h2>
            <p className="text-muted">
              A <strong className="text-text font-medium">transfer</strong> is money moving straight
              from one person to another — paying someone back, or covering them at a cash-only
              place. It isn&rsquo;t group spending, so it doesn&rsquo;t change the trip total; it
              just moves the balance between those two people.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1.5">Currencies</h2>
            <p className="text-muted">
              Log each cost in the currency you actually paid. Balances are converted into the
              group&rsquo;s currency using the rates set in Settings, which you can enter by hand or
              fetch when you have a connection. Rates are stored with the group, so the numbers stay
              stable once you&rsquo;re home.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1.5">The payback plan</h2>
            <p className="text-muted">
              Rather than having everyone pay everyone, the app nets each person out to a single
              balance and then finds the shortest set of payments that clears them all. Where a
              subgroup cancels out on its own, it&rsquo;s settled within that subgroup instead of
              routing money through someone uninvolved.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1.5">Privacy</h2>
            <p className="text-muted">
              {cloudEnabled ? "Group data and receipt photos go to the connected Supabase project. Receipt text recognition runs in your browser." :
                "Receipt text recognition runs in your browser. The optional exchange rate lookup sends only currency codes."}
            </p>
          </section>
        </div>

        <div className="mt-9">
          <LinkButton href="/" variant="primary">
            Back to groups
          </LinkButton>
        </div>
      </Screen>
    </>
  );
}
