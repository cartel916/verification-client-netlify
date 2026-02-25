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

    const headers = event.headers || {};
    const xff = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "";
    const ip = xff.split(",")[0].trim() || headers["client-ip"] || headers["Client-Ip"] || "inconnue";
    const userAgent = headers["user-agent"] || headers["User-Agent"] || "inconnu";
    const referer = headers["referer"] || headers["Referer"] || "—";

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (_) {
      body = {};
    }

    // Géolocalisation IP (approx) - optionnelle
    let ipGeo = null;
    if (IPINFO_TOKEN && ip && ip !== "inconnue") {
      try {
        const r = await fetch(`https://ipinfo.io/${ip}?token=${IPINFO_TOKEN}`);
        const d = await r.json();
        if (r.ok && !d.error) {
          ipGeo = {
            city: d.city || null,
            region: d.region || null,
            country: d.country || null,
            org: d.org || null,
            loc: d.loc || null // "lat,lon" approx IP
          };
        }
      } catch (e) {
        // ignore erreur API IP
      }
    }

    const text = [
      "👀 *Visite détectée*",
      "",
      `• Heure: ${new Date().toISOString()}`,
      `• IP: ${safe(ip)}`,
      `• User-Agent: ${safe(userAgent)}`,
      `• Referrer: ${safe(referer)}`,
      `• Langue (client): ${safe(body.language)}`,
      `• Timezone (client): ${safe(body.timezone)}`,
      "",
      "*Position IP (approx)*",
      `• Ville: ${safe(ipGeo?.city)}`,
      `• Région: ${safe(ipGeo?.region)}`,
      `• Pays: ${safe(ipGeo?.country)}`,
      `• FAI/ASN: ${safe(ipGeo?.org)}`,
      `• Loc approx: ${safe(ipGeo?.loc)}`
    ].join("\\n");

    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      })
    });

    const tgData = await tgRes.json();
    if (!tgRes.ok || !tgData.ok) {
      return json(502, { ok: false, error: "Erreur Telegram", telegram: tgData });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { ok: false, error: e.message || "Erreur serveur" });
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
  return String(v).replace(/[*_[\\]()~`>#+\\-=|{}.!]/g, "\\\\$&");
}
