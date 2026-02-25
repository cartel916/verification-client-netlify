// netlify/functions/notify-location.js
// Envoie un message Telegram avec infos lead + GPS + IP / UA serveur

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Méthode non autorisée" });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return json(500, { ok: false, error: "Variables d'environnement Telegram manquantes" });
    }

    const body = JSON.parse(event.body || "{}");

    if (!body?.consent?.accepted) {
      return json(400, { ok: false, error: "Consentement requis" });
    }
    if (!body?.geo || typeof body.geo.latitude !== "number" || typeof body.geo.longitude !== "number") {
      return json(400, { ok: false, error: "Coordonnées invalides" });
    }

    const lead = body.lead || {};
    const geo = body.geo || {};
    const client = body.client || {};
    const consent = body.consent || {};

    const headers = event.headers || {};
    const xff = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "";
    const ip = xff.split(",")[0].trim() || headers["client-ip"] || headers["Client-Ip"] || "inconnue";
    const userAgentServer = headers["user-agent"] || headers["User-Agent"] || "inconnu";

    const mapsUrl = `https://maps.google.com/?q=${geo.latitude},${geo.longitude}`;

    let risk = 0;
    const reasons = [];

    if (!lead.email) { risk += 10; reasons.push("Email absent"); }
    if (!lead.phone) { risk += 5; reasons.push("Téléphone absent"); }
    if (!lead.name) { risk += 5; reasons.push("Nom absent"); }

    if (typeof geo.accuracy_m === "number") {
      if (geo.accuracy_m > 1000) { risk += 20; reasons.push("Précision GPS faible (>1000m)"); }
      else if (geo.accuracy_m > 200) { risk += 10; reasons.push("Précision GPS moyenne (>200m)"); }
    } else {
      risk += 10; reasons.push("Précision GPS inconnue");
    }

    if (!client.timezone) { risk += 5; reasons.push("Timezone client absente"); }

    const riskLevel = risk >= 30 ? "HIGH" : risk >= 15 ? "MEDIUM" : "LOW";

    const text = [
      "🛡️ *Nouvelle vérification client*",
      "",
      `*Risque:* ${riskLevel} (${risk}/100)`,
      reasons.length ? `*Raisons:* ${reasons.join(", ")}` : "*Raisons:* aucune",
      "",
      "*Lead*",
      `• Nom: ${safe(lead.name)}`,
      `• Email: ${safe(lead.email)}`,
      `• Téléphone: ${safe(lead.phone)}`,
      `• Pays déclaré: ${safe(lead.country)}`,
      `• Note: ${safe(lead.note)}`,
      "",
      "*Position (avec consentement)*",
      `• Lat/Lon: ${geo.latitude}, ${geo.longitude}`,
      `• Accuracy: ${geo.accuracy_m ?? "?"} m`,
      `• Timestamp: ${formatDate(geo.timestamp)}`,
      `• Maps: ${mapsUrl}`,
      "",
      "*Technique*",
      `• IP (serveur): ${ip}`,
      `• UA (serveur): ${safe(userAgentServer)}`,
      `• Langue: ${safe(client.language)}`,
      `• Timezone: ${safe(client.timezone)}`,
      `• Écran: ${safe(client.screen?.width)}x${safe(client.screen?.height)} @${safe(client.screen?.pixelRatio)}`,
      `• Viewport: ${safe(client.viewport?.width)}x${safe(client.viewport?.height)}`,
      "",
      "*Consentement*",
      `• Accepté: ${consent.accepted ? "oui" : "non"}`,
      `• Version: ${safe(consent.textVersion)}`,
      `• Date: ${safe(consent.acceptedAt)}`
    ].join("\n");

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

    return json(200, { ok: true, riskLevel, risk, mapsUrl });

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
  return String(v).replace(/[*_[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function formatDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toISOString(); } catch { return String(ts); }
}
