import type { Metadata } from "next";
import WorkshopClient from "./WorkshopClient";

const canonical = "https://abrarnadir.com/workshop";

export const metadata: Metadata = {
  title: "F1 Online Workshop · 2 Ghante · Poora System · Rs.1,999 | Abrar Nadir",
  description:
    "Daily 2-hour online workshop (recorded masterclass + WhatsApp Q&A support): real data se niche, storytelling scripts with gain gap, free tools par visual-led videos, titles, thumbnails aur upload system. Rs.1,999. Physical workshop bhi: Johar Town, Lahore, Rs.5,000.",
  alternates: { canonical },
  openGraph: {
    title: "F1 Workshop · 2 Ghante · Poora System",
    description: "Faceless YouTube ka poora system, ek 2-ghante session mein. Online Rs.1,999 · Physical (Johar Town, Lahore) Rs.5,000.",
    url: canonical,
    siteName: "YT Empire Builders",
    locale: "en_PK",
    type: "website",
  },
};

export default function WorkshopPage() {
  return <WorkshopClient />;
}
