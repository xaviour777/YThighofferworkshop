import { NextRequest, NextResponse } from "next/server";
import { WORKSHOP_CONFIG, WORKSHOP_PACKAGES, type WorkshopPackageId } from "@/app/workshop/config";

const GHL_BASE = "https://services.leadconnectorhq.com";
// Vercel rejects request bodies over ~4.5 MB; the page compresses screenshots well below this.
const MAX_SCREENSHOT_CHARS = 4_000_000;

function normalizePakPhone(phone: string) {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("03")) {
    cleaned = "+92" + cleaned.slice(1);
  } else if (cleaned.startsWith("3")) {
    cleaned = "+92" + cleaned;
  } else if (cleaned.startsWith("923")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

function ghlHeaders(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function uploadToGhlMedia(base64Data: string, filename: string, token: string): Promise<string | null> {
  try {
    const mimeMatch = base64Data.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const buffer = Buffer.from(base64Data.replace(/^data:[^;]+;base64,/, ""), "base64");

    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: mimeType }), filename);

    const res = await fetch(`${GHL_BASE}/medias/upload-file`, {
      method: "POST",
      headers: ghlHeaders(token, false),
      body: formData,
    });
    if (!res.ok) {
      console.warn("[WORKSHOP CHECKOUT] GHL media upload failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data?.url || null;
  } catch (err) {
    console.warn("[WORKSHOP CHECKOUT] GHL media upload error:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      packageId,
      fullName,
      phone,
      email,
      transactionId,
      paymentMethod,
      screenshotBase64,
      screenshotFilename,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      fbclid,
    } = body ?? {};

    const pkg = WORKSHOP_PACKAGES[packageId as WorkshopPackageId];
    if (!pkg) {
      return NextResponse.json({ success: false, error: "Unknown package." }, { status: 400 });
    }
    if (typeof fullName !== "string" || !fullName.trim() || typeof phone !== "string" || !phone.trim()) {
      return NextResponse.json({ success: false, error: "Name and phone number are required." }, { status: 400 });
    }
    if (typeof screenshotBase64 === "string" && screenshotBase64.length > MAX_SCREENSHOT_CHARS) {
      return NextResponse.json({ success: false, error: "Screenshot is too large." }, { status: 413 });
    }

    const name = fullName.trim();
    const normalizedPhone = normalizePakPhone(phone);
    const cleanEmail = typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : "";
    const txn = typeof transactionId === "string" ? transactionId.trim() : "";
    const pay =
      WORKSHOP_CONFIG.PAYMENT_METHODS.find((m) => m.id === paymentMethod) ?? WORKSHOP_CONFIG.PAYMENT_METHODS[0];

    const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
    const locationId = process.env.GHL_LOCATION_ID;
    if (!token || !locationId) {
      console.error("[WORKSHOP CHECKOUT] GHL env vars missing; lead not sent to CRM:", { name, normalizedPhone, pkg: pkg.id });
      return NextResponse.json({ success: true, crm: false, screenshotSaved: false });
    }

    try {
      // 1. Store the payment screenshot on GHL's media CDN
      let receiptUrl = "";
      if (typeof screenshotBase64 === "string" && screenshotBase64.startsWith("data:image/")) {
        receiptUrl =
          (await uploadToGhlMedia(
            screenshotBase64,
            (typeof screenshotFilename === "string" && screenshotFilename) || `f1_${pkg.id}_receipt_${Date.now()}.jpg`,
            token
          )) || "";
      }

      const tags = [
        ...pkg.tags,
        receiptUrl ? "payment-screenshot-received" : "payment-screenshot-on-whatsapp",
        "payment-verification-pending",
        "whatsapp-consent",
      ];

      // 2. Upsert the contact
      const contactRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
        method: "POST",
        headers: ghlHeaders(token),
        body: JSON.stringify({
          locationId,
          name,
          firstName: name.split(" ")[0],
          phone: normalizedPhone,
          ...(cleanEmail ? { email: cleanEmail } : {}),
          source: "Landing Page: /workshop",
          tags,
          customFields: [
            ...(process.env.GHL_TRANSACTION_ID_FIELD_KEY && txn
              ? [{ key: process.env.GHL_TRANSACTION_ID_FIELD_KEY, field_value: txn }]
              : []),
            ...(process.env.GHL_PAYMENT_METHOD_FIELD_KEY
              ? [{ key: process.env.GHL_PAYMENT_METHOD_FIELD_KEY, field_value: pay.label }]
              : []),
            ...(process.env.GHL_LANDING_PAGE_FIELD_KEY
              ? [{ key: process.env.GHL_LANDING_PAGE_FIELD_KEY, field_value: "/workshop" }]
              : []),
            ...(process.env.GHL_PAYMENT_PROOF_FIELD_KEY && receiptUrl
              ? [{ key: process.env.GHL_PAYMENT_PROOF_FIELD_KEY, field_value: receiptUrl }]
              : []),
          ],
        }),
      });
      const contactData = await contactRes.json().catch(() => null);
      const contactId: string | undefined = contactData?.contact?.id;
      if (!contactId) {
        console.error("[WORKSHOP CHECKOUT] GHL contact upsert failed:", contactRes.status, contactData);
        return NextResponse.json({ success: true, crm: false, screenshotSaved: Boolean(receiptUrl) });
      }

      // 3. Create (or refresh) the opportunity in the workshop pipeline
      const pipelineId =
        (pkg.id === "physical" && process.env.GHL_PHYSICAL_WORKSHOP_PIPELINE_ID) ||
        process.env.GHL_LIVE_WORKSHOP_PIPELINE_ID ||
        "SLf8kzZ9MhXAyQYFeAm2";
      const stageId =
        (pkg.id === "physical" && process.env.GHL_PHYSICAL_WORKSHOP_STAGE_ID) ||
        process.env.GHL_LIVE_WORKSHOP_PAYMENT_PENDING_STAGE_ID ||
        "1519847d-e659-4ec8-8177-8c5c63b880f0";
      const proofFieldId = process.env.GHL_OPPORTUNITY_PAYMENT_PROOF_FIELD_ID;
      const opportunity = {
        name: `${name} – ${pkg.opportunityName}`,
        pipelineStageId: stageId,
        status: "open",
        monetaryValue: pkg.price,
        ...(proofFieldId && receiptUrl ? { customFields: [{ id: proofFieldId, field_value: receiptUrl }] } : {}),
      };

      const oppRes = await fetch(`${GHL_BASE}/opportunities/`, {
        method: "POST",
        headers: ghlHeaders(token),
        body: JSON.stringify({ ...opportunity, pipelineId, locationId, contactId }),
      });
      if (!oppRes.ok) {
        const errData = await oppRes.json().catch(() => null);
        const existingId = errData?.meta?.existingId;
        if (existingId) {
          await fetch(`${GHL_BASE}/opportunities/${existingId}`, {
            method: "PUT",
            headers: ghlHeaders(token),
            body: JSON.stringify(opportunity),
          }).catch((err) => console.warn("[WORKSHOP CHECKOUT] Opportunity update warning:", err));
        } else {
          console.warn("[WORKSHOP CHECKOUT] Opportunity creation error:", oppRes.status, errData);
        }
      }

      // 4. Note on the contact (shows on the opportunity card) with the screenshot link
      const utm = { utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid };
      const utmLine = Object.entries(utm)
        .filter(([, v]) => typeof v === "string" && v)
        .map(([k, v]) => `${k}=${v}`)
        .join(" · ");
      const note = [
        `🎓 F1 WORKSHOP REGISTRATION (/workshop)`,
        `• Package: ${pkg.label}`,
        `• Amount: PKR ${pkg.price.toLocaleString("en-US")}`,
        `• Name: ${name}`,
        `• WhatsApp: ${normalizedPhone}`,
        cleanEmail ? `• Email: ${cleanEmail}` : "",
        `• Payment: ${pay.label} (${pay.account})`,
        `• Time: Roz ${WORKSHOP_CONFIG.SESSION_LABEL}`,
        `• Transaction ID: ${txn || "N/A"}`,
        utmLine ? `• Source: ${utmLine}` : "",
        receiptUrl
          ? `\n👉 Payment screenshot:\n${receiptUrl}`
          : "\n💬 Screenshot: student will send it on WhatsApp.",
      ]
        .filter(Boolean)
        .join("\n");

      await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
        method: "POST",
        headers: ghlHeaders(token),
        body: JSON.stringify({ body: note }),
      }).catch((err) => console.warn("[WORKSHOP CHECKOUT] Contact note warning:", err));

      return NextResponse.json({ success: true, crm: true, screenshotSaved: Boolean(receiptUrl) });
    } catch (ghlErr) {
      // A CRM outage must not block the student; the success screen sends them to WhatsApp.
      console.error("[WORKSHOP CHECKOUT] GHL integration error:", ghlErr);
      return NextResponse.json({ success: true, crm: false, screenshotSaved: false });
    }
  } catch (error) {
    console.error("[WORKSHOP CHECKOUT] Submission error:", error);
    return NextResponse.json({ success: false, error: "Submission failed" }, { status: 500 });
  }
}
