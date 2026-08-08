import type { Metadata, Viewport } from "next";
import { Afacad_Flux, Inter, Fraunces } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
});

const afacadFlux = Afacad_Flux({
  subsets: ["latin", "latin-ext"],
  variable: "--font-afacad-flux",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sarbato",
    template: "%s · Sarbato",
  },
  description:
    "Sarbato conectează planificarea, invitații, furnizorii, bugetul și coordonarea zilei evenimentului.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#151116" },
  ],
};

/**
 * Applied before first paint to avoid a light-theme flash when the user
 * prefers (or explicitly selected) the dark theme.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("weddingos-theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var el=document.documentElement;if(d){el.classList.add("dark")}el.style.colorScheme=d?"dark":"light"}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${afacadFlux.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-background font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
