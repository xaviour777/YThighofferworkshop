"use client";

import { memo, useEffect, useRef, useState } from "react";
import { WORKSHOP_MARKUP } from "./markup";
import { WORKSHOP_CONFIG, WORKSHOP_PACKAGES, type WorkshopPackageId } from "./config";
import "./workshop.css";

const Markup = memo(function Markup() {
  return <div dangerouslySetInnerHTML={{ __html: WORKSHOP_MARKUP }} />;
});

export default function WorkshopClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [checkoutPkg, setCheckoutPkg] = useState<WorkshopPackageId | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id: string) => root.querySelector<HTMLElement>("#" + id);

    // Every register button opens the checkout; data-pkg="physical" preselects the physical package.
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".f1-js-reg");
      if (!btn) return;
      e.preventDefault();
      setCheckoutPkg(btn.dataset.pkg === "physical" ? "physical" : "online");
    };
    root.addEventListener("click", onClick);

    const yr = $("yr");
    if (yr) yr.textContent = String(new Date().getFullYear());

    const [H, M] = WORKSHOP_CONFIG.SESSION_TIME.split(":").map(Number);
    const pk = () => {
      const d = new Date();
      return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 5 * 3600000);
    };
    const label = (h: number, m: number) => `${h % 12 || 12}:${m < 10 ? "0" : ""}${m} ${h >= 12 ? "PM" : "AM"}`;
    const pad = (n: number) => (n < 10 ? "0" : "") + n;
    const tl = label(H, M);
    const tick = () => {
      const n = pk();
      const t = new Date(n);
      t.setHours(H, M, 0, 0);
      let day = "Aaj";
      if (t <= n) {
        t.setDate(t.getDate() + 1);
        day = "Kal";
      }
      const s = Math.floor((t.getTime() - n.getTime()) / 1000);
      const set = (id: string, v: string) => {
        const el = $(id);
        if (el) el.textContent = v;
      };
      set("cH", pad(Math.floor(s / 3600)));
      set("cM", pad(Math.floor((s % 3600) / 60)));
      set("cS", pad(s % 60));
      set("nextNote", `Agla online session: ${day} ${tl} (Pakistan time) · 100 seats`);
      set("barTime", `${day} ${tl}`);
    };
    tick();
    const timer = setInterval(tick, 1000);

    const { SEATS_LEFT, SEATS_TOTAL, WHATSAPP, VIDEO_URL } = WORKSHOP_CONFIG;
    if (SEATS_LEFT !== null) {
      const left = Math.max(0, Math.min(SEATS_TOTAL, SEATS_LEFT));
      const seatTxt = $("seatTxt");
      const barSeats = $("barSeats");
      const meter = $("meter");
      if (seatTxt) seatTxt.textContent = `${left} / ${SEATS_TOTAL} seats baqi`;
      if (barSeats) barSeats.textContent = `${left} seats baqi aaj`;
      if (meter) meter.style.width = `${(left / SEATS_TOTAL) * 100}%`;
    }

    const waLine = $("waLine");
    if (waLine && WHATSAPP) {
      waLine.innerHTML = `Support: <a href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">WhatsApp</a>`;
    }

    const film = $("filmBox");
    if (film && VIDEO_URL) {
      film.innerHTML = /\.mp4($|\?)/.test(VIDEO_URL)
        ? `<video src="${VIDEO_URL}" controls playsinline style="width:100%;height:100%;object-fit:cover"></video>`
        : `<iframe src="${VIDEO_URL}" style="width:100%;height:100%;border:0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    }

    return () => {
      root.removeEventListener("click", onClick);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="f1" ref={rootRef}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Anton&family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Montserrat:wght@400;500;600;700;800&display=swap"
        precedence="default"
      />
      <Markup />
      {checkoutPkg && <Checkout initialPkg={checkoutPkg} onClose={() => setCheckoutPkg(null)} />}
    </div>
  );
}

// Downscale the payment screenshot so the upload stays well under Vercel's request size limit.
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return dataUrl;
  }
}

function Checkout({ initialPkg, onClose }: { initialPkg: WorkshopPackageId; onClose: () => void }) {
  const [pkgId, setPkgId] = useState<WorkshopPackageId>(initialPkg);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [txn, setTxn] = useState("");
  const [shot, setShot] = useState<{ data: string; name: string } | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [sendLater, setSendLater] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ screenshotSaved: boolean } | null>(null);

  const pkg = WORKSHOP_PACKAGES[pkgId];
  const { EASYPAISA_NUMBER, EASYPAISA_TITLE, EASYPAISA_QR, WHATSAPP } = WORKSHOP_CONFIG;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const waText = encodeURIComponent(
    `Assalam o Alaikum! Maine ${pkg.label} (${pkg.priceLabel}) ke liye Easypaisa par payment ki hai.\nNaam: ${name || "-"}\nWhatsApp: ${phone || "-"}${txn ? `\nTransaction ID: ${txn}` : ""}\nPayment screenshot attach kar raha/rahi hoon.`
  );
  const waLink = `https://wa.me/${WHATSAPP}?text=${waText}`;

  const onFile = async (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Sirf image (screenshot) upload karein.");
      return;
    }
    setShotBusy(true);
    try {
      setShot({ data: await compressImage(file), name: file.name });
      setSendLater(false);
    } catch {
      setError("Screenshot load nahi hua, dobara try karein ya WhatsApp par bhej dein.");
    } finally {
      setShotBusy(false);
    }
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(EASYPAISA_NUMBER);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the number is visible anyway */
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Apna poora naam likhein.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Sahi WhatsApp number likhein (e.g. 03001234567).");
    if (!shot && !sendLater) return setError("Payment screenshot attach karein, ya 'WhatsApp par bhejunga' select karein.");

    setSubmitting(true);
    try {
      const qs = new URLSearchParams(window.location.search);
      const utm = Object.fromEntries(
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]
          .map((k) => [k, qs.get(k) || ""])
          .filter(([, v]) => v)
      );
      const res = await fetch("/api/workshop-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkgId,
          fullName: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          transactionId: txn.trim(),
          screenshotBase64: shot?.data || "",
          screenshotFilename: shot?.name || "",
          screenshotViaWhatsApp: !shot,
          ...utm,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "failed");
      setDone({ screenshotSaved: Boolean(data.screenshotSaved) });
      const w = window as unknown as { fbq?: (...a: unknown[]) => void };
      w.fbq?.("track", "Lead", { value: pkg.price, currency: "PKR", content_name: pkg.label });
    } catch {
      setError("Registration submit nahi hui. Dobara try karein, ya neeche WhatsApp button se humein message kar dein.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="f1-co-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="f1-co" role="dialog" aria-modal="true" aria-label="Seat booking">
        <button type="button" className="f1-co-close" onClick={onClose} aria-label="Band karo">
          ×
        </button>

        {done ? (
          <div className="f1-co-done">
            <div className="f1-co-check">✓</div>
            <h3>Registration mil gayi!</h3>
            {done.screenshotSaved ? (
              <p>
                Aap ka payment screenshot humein mil gaya hai. Verify hone ke baad {pkgId === "physical" ? "location aur timing" : "Google Meet link"} WhatsApp par aa jayega.
              </p>
            ) : (
              <p>
                <b>Aakhri step:</b> neeche button daba kar payment screenshot WhatsApp par bhej dein. Verify hone ke baad {pkgId === "physical" ? "location aur timing" : "Google Meet link"} aa jayega.
              </p>
            )}
            <a className="f1-co-wa" href={waLink} target="_blank" rel="noopener">
              {done.screenshotSaved ? "WhatsApp par rabta karein" : "Screenshot WhatsApp par bhejo"}
            </a>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="f1-co-eyebrow">Seat book karo</div>
            <h3>Package chunein</h3>
            <div className="f1-co-pkgs">
              {(Object.keys(WORKSHOP_PACKAGES) as WorkshopPackageId[]).map((id) => {
                const p = WORKSHOP_PACKAGES[id];
                return (
                  <button
                    type="button"
                    key={id}
                    className={"f1-co-pkg" + (id === pkgId ? " on" : "")}
                    onClick={() => setPkgId(id)}
                    aria-pressed={id === pkgId}
                  >
                    <b>{p.label}</b>
                    <span>{p.detail}</span>
                    <strong>{p.priceLabel}</strong>
                  </button>
                );
              })}
            </div>

            <label className="f1-co-field">
              <span>Poora naam *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
            <label className="f1-co-field">
              <span>WhatsApp number *</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03001234567" autoComplete="tel" required />
            </label>
            <label className="f1-co-field">
              <span>Email (optional)</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            </label>

            <div className="f1-co-pay">
              <div className="f1-co-amount">
                <span>Easypaisa par bhejein</span>
                <strong>{pkg.priceLabel}</strong>
              </div>
              {EASYPAISA_QR && (
                <div className="f1-co-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={EASYPAISA_QR} alt="Easypaisa QR code" />
                  <small>Easypaisa app se QR scan karein</small>
                </div>
              )}
              <button type="button" className="f1-co-acc" onClick={copyNumber}>
                <span>
                  <small>Easypaisa · {EASYPAISA_TITLE}</small>
                  <b>{EASYPAISA_NUMBER}</b>
                </span>
                <em>{copied ? "✓ Copied" : "Copy"}</em>
              </button>
            </div>

            <label className="f1-co-field">
              <span>Transaction ID (optional)</span>
              <input value={txn} onChange={(e) => setTxn(e.target.value)} />
            </label>

            <div className="f1-co-field">
              <span>Payment screenshot</span>
              <label className={"f1-co-upload" + (shot ? " has" : "")}>
                <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
                {shotBusy ? "Load ho raha hai..." : shot ? `✓ ${shot.name} (badalne ke liye dabayein)` : "📎 Screenshot attach karein"}
              </label>
              <label className="f1-co-later">
                <input
                  type="checkbox"
                  checked={sendLater}
                  onChange={(e) => {
                    setSendLater(e.target.checked);
                    if (e.target.checked) setShot(null);
                  }}
                />
                Screenshot baad mein WhatsApp par bhejunga
              </label>
            </div>

            {error && <p className="f1-co-err">{error}</p>}

            <button type="submit" className="f1-co-submit" disabled={submitting || shotBusy}>
              {submitting ? "Submit ho raha hai..." : `Seat confirm karo · ${pkg.priceLabel}`}
            </button>
            <a className="f1-co-help" href={waLink} target="_blank" rel="noopener">
              Koi masla? WhatsApp par rabta karein
            </a>
          </form>
        )}
      </div>
    </div>
  );
}
