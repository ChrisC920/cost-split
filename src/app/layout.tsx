import type { Metadata, Viewport } from "next";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cost Split — share costs with a group",
    template: "%s · Cost Split",
  },
  description:
    "Track shared expenses on a trip or in a household, split them evenly or unevenly, and settle up in the fewest possible payments. Works offline, no account needed.",
  applicationName: "Cost Split",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Cost Split", statusBarStyle: "default" },
  openGraph: {
    title: "Cost Split — share costs with a group",
    description:
      "Track shared expenses, split them evenly or unevenly, and settle up in the fewest possible payments.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#141614" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
