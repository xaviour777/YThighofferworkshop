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
      set("nextNote", `Agla session: ${day} ${tl} (Pakistan time) · Online 100 seats · Physical sirf 10`);
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
  const { PAYMENT_METHODS, WHATSAPP, SESSION_LABEL } = WORKSHOP_CONFIG;
  const [pkgId, setPkgId] = useState<WorkshopPackageId>(initialPkg);
  const [payId, setPayId] = useState(PAYMENT_METHODS[0].id);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shot, setShot] = useState<{ data: string; name: string } | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [sendLater, setSendLater] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ screenshotSaved: boolean } | null>(null);

  const pkg = WORKSHOP_PACKAGES[pkgId];
  const pay = PAYMENT_METHODS.find((m) => m.id === payId) ?? PAYMENT_METHODS[0];

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

  // Prefilled first message to the team's WhatsApp, carrying everything the student entered.
  const waText = [
    "Assalam o Alaikum! Maine F1 Workshop ke liye registration ki hai.",
    "",
    `Naam: ${name.trim() || "-"}`,
    `WhatsApp: ${phone.trim() || "-"}`,
    `Package: ${pkg.label}`,
    `Time: Roz ${SESSION_LABEL}`,
    `Fee: ${pkg.priceLabel}`,
    `Payment: ${pay.label} (${pay.account})`,
    shot && done?.screenshotSaved ? "Screenshot: form mein attach kar diya hai" : "Screenshot: is message ke saath bhej raha/rahi hoon",
  ].join("\n");
  const waLink = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waText)}`;

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

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(pay.account);
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
    if (!shot && !sendLater) return setError("Screenshot attach karein, ya 'WhatsApp par bhejunga' select karein.");

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
          paymentMethod: pay.id,
          fullName: name.trim(),
          phone: phone.trim(),
          screenshotBase64: shot?.data || "",
          screenshotFilename: shot?.name || "",
          ...utm,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "failed");
      setDone({ screenshotSaved: Boolean(data.screenshotSaved) });
      const w = window as unknown as { fbq?: (...a: unknown[]) => void };
      w.fbq?.("track", "Lead", { value: pkg.price, currency: "PKR", content_name: pkg.label });
    } catch {
      setError("Submit nahi hua. Dobara try karein, ya neeche WhatsApp se rabta karein.");
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
            <p>
              {done.screenshotSaved ? "Screenshot humein mil gaya. " : "Aakhri step: screenshot WhatsApp par bhej dein. "}
              Neeche button dabayein, aap ki detail WhatsApp par chali jayegi. Verify hone ke baad{" "}
              {pkgId === "physical" ? "location" : "Google Meet link"} wahin aa jayega.
            </p>
            <a className="f1-co-wa" href={waLink} target="_blank" rel="noopener">
              WhatsApp par detail bhejo
            </a>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h3>Seat book karo</h3>
            <p className="f1-co-time">Roz {SESSION_LABEL} · Pakistan time</p>

            <div className="f1-co-seg" role="group" aria-label="Package">
              {(Object.keys(WORKSHOP_PACKAGES) as WorkshopPackageId[]).map((id) => {
                const p = WORKSHOP_PACKAGES[id];
                return (
                  <button type="button" key={id} className={id === pkgId ? "on" : ""} onClick={() => setPkgId(id)} aria-pressed={id === pkgId}>
                    <b>{p.short}</b>
                    <strong>{p.priceLabel}</strong>
                    <span>{id === "physical" ? "Sirf 10 seats" : "100 seats"}</span>
                  </button>
                );
              })}
            </div>

            <div className="f1-co-row">
              <input aria-label="Poora naam" placeholder="Poora naam *" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <input aria-label="WhatsApp number" placeholder="WhatsApp no. *" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
            </div>

            <div className="f1-co-pay">
              <div className="f1-co-paytabs" role="group" aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => (
                  <button type="button" key={m.id} className={m.id === payId ? "on" : ""} onClick={() => setPayId(m.id)} aria-pressed={m.id === payId}>
                    {m.label}
                  </button>
                ))}
              </div>
              {pay.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="f1-co-qr" src={pay.qr} alt={`${pay.label} QR code`} />
              )}
              <button type="button" className="f1-co-acc" onClick={copyAccount}>
                <span>
                  <small>
                    {pay.title} · {pkg.priceLabel} bhejein
                  </small>
                  <b>{pay.account}</b>
                </span>
                <em>{copied ? "✓ Copied" : "Copy"}</em>
              </button>
            </div>

            <div className="f1-co-shot">
              <label className={"f1-co-upload" + (shot ? " has" : "")}>
                <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
                {shotBusy ? "Load ho raha hai..." : shot ? "✓ Screenshot lag gaya" : "📎 Payment screenshot"}
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
                WhatsApp par bhejunga
              </label>
            </div>

            {error && <p className="f1-co-err">{error}</p>}

            <button type="submit" className="f1-co-submit" disabled={submitting || shotBusy}>
              {submitting ? "Submit ho raha hai..." : `Seat confirm karo · ${pkg.priceLabel}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
