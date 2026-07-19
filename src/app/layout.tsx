import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { WebVitals } from "@/components/WebVitals";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://quotex-vip-advance-journal.onrender.com";

export const metadata: Metadata = {
  title: "Quotex VIP Advance Journal | Professional Binary Options & Market Journal",
  description: "Unlock advanced statistics of your binary options and financial market performance. Log trades, audit your trading psychology, visualize risk parameters, and gain a VIP edge.",
  keywords: ["Quotex VIP", "Trading Journal", "Binary Options Journal", "Risk Management", "Trading Psychology", "Quotex Journal", "Trader Log"],
  openGraph: {
    title: "Quotex VIP Advance Journal",
    description: "Professional binary options trading journal with advanced analytics, risk management, and signal scanning.",
    url: baseUrl,
    siteName: "Quotex VIP Advance Journal",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quotex VIP Advance Journal",
    description: "Professional binary options trading journal with advanced analytics, risk management, and signal scanning.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WebVitals />
        {clarityId && (
          <Script id="clarity-analytics" strategy="afterInteractive">
            {`
              (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window,document,"clarity","script","${clarityId}");
            `}
          </Script>
        )}
        {children}
      </body>
    </html>
  );
}
