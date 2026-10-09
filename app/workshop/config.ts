// Single place to edit the /workshop page settings (used by the page and by /api/workshop-checkout).

export type WorkshopPackageId = "online" | "physical";

export interface WorkshopPackage {
  id: WorkshopPackageId;
  label: string;
  short: string;
  detail: string;
  price: number;
  priceLabel: string;
  opportunityName: string;
  tags: string[];
}

export const WORKSHOP_PACKAGES: Record<WorkshopPackageId, WorkshopPackage> = {
  online: {
    id: "online",
    label: "F1 Online Workshop",
    short: "Online",
    detail: "Google Meet · Roz 5-7 PM · 100 seats",
    price: 1999,
    priceLabel: "Rs.1,999",
    opportunityName: "F1 Online Workshop (PKR 1,999)",
    tags: ["workshop-f1", "workshop-f1-online", "live-workshop-registration"],
  },
  physical: {
    id: "physical",
    label: "F1 Live Physical Workshop",
    short: "Physical (Lahore)",
    detail: "Johar Town, Lahore · Roz 5-7 PM · 10 seats",
    price: 5000,
    priceLabel: "Rs.5,000",
    opportunityName: "F1 Physical Workshop, Johar Town (PKR 5,000)",
    tags: ["workshop-f1", "workshop-f1-physical", "physical-workshop-johar-town"],
  },
};

export const WORKSHOP_CONFIG = {
  // Daily start time for both online and physical, Pakistan time (24h). Drives the countdown.
  SESSION_TIME: "17:00",
  SESSION_LABEL: "5:00 PM se 7:00 PM",
  SEATS_TOTAL: 100,
  // e.g. 37; null hides the "seats left" number.
  SEATS_LEFT: null as number | null,
  // WhatsApp number for support and for sending payment screenshots (digits only).
  WHATSAPP: "923274532186",
  // Payment accounts shown in the checkout. qr: path of a QR image in /public (empty hides it).
  PAYMENT_METHODS: [
    { id: "easypaisa", label: "Easypaisa", account: "03274532186", title: "Muhammad Abrar", qr: "" },
    { id: "meezan", label: "Meezan Bank", account: "02370103321036", title: "Muhammad Abrar Ghori", qr: "" },
  ],
  // Short film embed URL (YouTube embed / Vimeo / .mp4). Empty shows the placeholder.
  VIDEO_URL: "",
};
