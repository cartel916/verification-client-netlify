exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Méthode non autorisée" });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const IPINFO_TOKEN = process.env.IPINFO_TOKEN || ""; // optionnel

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return json(500, { ok: false, error: "Variables Telegram manquantes" });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (_) {
      body = {};
    }

    const headers = event.headers || {};

    const xff = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "";
    const ip =
      (xff && xff.split(",")[0].trim()) ||
      headers["client-ip"] ||
      headers["Client-Ip"] ||
      "inconnue";

    const userAgent = headers["user-agent"] || headers["User-Agent"] || "inconnu";
    const referer = headers["referer"] || headers["Referer"] || "—";

    const language = body.language || "—";
    const timezone = body.timezone || "—";
    const page = body.page || "—";
    const visitCount = Number(body.visitCount || 0) || 1;
    const deviceSummary = body.deviceSummary || null;
    const screen = body.screen || null;
    const ts = new Date();

    let ipGeo = {
      city: null,
      region: null,
      country: null,
      org: null,
      loc: null
    };

    if (IPINFO_TOKEN && ip && ip !== "inconnue") {
      try {
        const ipinfoRes = await fetch(
          `https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(IPINFO_TOKEN)}`
        );
        const ipinfoData = await ipinfoRes.json();

        if (ipinfoRes.ok && !ipinfoData.error) {
          ipGeo = {
            city: ipinfoData.city || null,
            region: ipinfoData.region || null,
            country: ipinfoData.country || null,
            org: ipinfoData.org || null,
            loc: ipinfoData.loc || null
          };
        }
      } catch (e) {
        // on continue sans IP geo
      }
    }

    const mapsUrl = ipGeo.loc ? `https://maps.google.com/?q=${ipGeo.loc}` : null;
    const countryFlag = countryCodeToFlag(ipGeo.country);

    const locationLine = [ipGeo.city, ipGeo.region, ipGeo.country]
      .filter(Boolean)
      .join(", ");

    const deviceType = deviceSummary && deviceSummary.deviceType ? deviceSummary.deviceType : "—";
    const os = deviceSummary && deviceSummary.os ? deviceSummary.os : "—";
    const browser = deviceSummary && deviceSummary.browser ? deviceSummary.browser : "—";
    const browserVersion = deviceSummary && deviceSummary.browserVersion ? deviceSummary.browserVersion : null;
    const brandLikely = deviceSummary && deviceSummary.brandLikely ? deviceSummary.brandLikely : "—";
    const modelLikely = deviceSummary && deviceSummary.modelLikely ? deviceSummary.modelLikely : "—";
    const confidence = deviceSummary && deviceSummary.confidence ? deviceSummary.confidence : "—";

    const screenLine = screen
      ? `${screen.width || "?"}x${screen.height || "?"} • DPR ${screen.pixelRatio || "?"}`
      : "—";

    const textLines = [
      "👀 <b>Visite détectée</b>",
      "",
      "🕒 <b>Horodatage</b>",
      `• UTC: ${safe(ts.toISOString())}`,
      `• Local (client): ${safe(timezone)}`,
      `• Visite (session onglet): ${safe(String(visitCount))}`,
      "",
      "🌐 <b>Réseau</b>",
      `• IP: <code>${safe(ip)}</code>`,
      `• Référent: ${safe(referer)}`,
      `• Page: ${safe(page)}`,
      "",
      "📱 <b>Appareil estimé</b>",
      `• Type: ${safe(deviceType)}`,
      `• Marque probable: ${safe(brandLikely)}`,
      `• Modèle probable: ${safe(modelLikely)}`,
      `• OS: ${safe(os)}`,
      `• Navigateur: ${safe(browser)}${browserVersion ? " " + safe(browserVersion) : ""}`,
      `• Confiance estimation: ${safe(confidence)}`,
      `• Écran: ${safe(screenLine)}`,
      "",
      "💻 <b>Navigateur (brut)</b>",
      `• Langue: ${safe(language)}`,
      `• User-Agent: ${safe(userAgent)}`,
      "",
      "📍 <b>Position IP (approx.)</b>",
      `• Zone: ${safe(locationLine || "—")}${countryFlag ? " " + countryFlag : ""}`,
      `• FAI / ASN: ${safe(ipGeo.org)}`,
      `• Coordonnées approx: ${safe(ipGeo.loc)}`,
      mapsUrl ? `• Maps: ${safe(mapsUrl)}` : "• Maps: —"
    ];

    const text = textLines.join("\n");

    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    const tgData = await tgRes.json();

    if (!tgRes.ok || !tgData.ok) {
      return json(502, { ok: false, error: "Erreur Telegram", telegram: tgData });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e && e.message ? e.message : "Erreur serveur"
    });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(obj)
  };
}

function safe(v) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function countryCodeToFlag(code) {
  if (!code || typeof code !== "string" || code.length !== 2) return "";
  const cc = code.toUpperCase();
  const A = 127397;
  return String.fromCodePoint(...[...cc].map(c => c.charCodeAt(0) + A));
}
