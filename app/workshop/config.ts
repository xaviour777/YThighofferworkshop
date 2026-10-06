// Single place to edit the /workshop page settings (used by the page and by /api/workshop-checkout).

export type WorkshopPackageId = "online" | "physical";

export interface WorkshopPackage {
  id: WorkshopPackageId;
  label: string;
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
    detail: "Google Meet · Roz raat 8:00 PM · 2 ghante",
    price: 1999,
    priceLabel: "Rs.1,999",
    opportunityName: "F1 Online Workshop (PKR 1,999)",
    tags: ["workshop-f1", "workshop-f1-online", "live-workshop-registration"],
  },
  physical: {
    id: "physical",
    label: "F1 Live Physical Workshop",
    detail: "H Block, Johar Town, Lahore · Roz 5:00 PM se 7:00 PM",
    price: 5000,
    priceLabel: "Rs.5,000",
    opportunityName: "F1 Physical Workshop, Johar Town (PKR 5,000)",
    tags: ["workshop-f1", "workshop-f1-physical", "physical-workshop-johar-town"],
  },
};

export const WORKSHOP_CONFIG = {
  // Online session start, Pakistan time (24h). Drives the countdown.
  SESSION_TIME: "20:00",
  SEATS_TOTAL: 100,
  // e.g. 37; null hides the "seats left" number.
  SEATS_LEFT: null as number | null,
  // WhatsApp number for support and for sending payment screenshots (digits only).
  WHATSAPP: "923274532186",
  EASYPAISA_NUMBER: "03274532186",
  EASYPAISA_TITLE: "Muhammad Abrar",
  // Path of the Easypaisa QR image in /public (e.g. "/workshop/easypaisa-qr.png"). Empty hides the QR box.
  EASYPAISA_QR: "",
  // Short film embed URL (YouTube embed / Vimeo / .mp4). Empty shows the placeholder.
  VIDEO_URL: "",
};
