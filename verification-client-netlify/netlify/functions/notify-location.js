exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Méthode non autorisée" });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const IPINFO_TOKEN = process.env.IPINFO_TOKEN || ""; // optionnel (IP approx)

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return json(500, { ok: false, error: "Variables Telegram manquantes" });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (_) {
      return json(400, { ok: false, error: "JSON invalide" });
    }

    const headers = event.headers || {};
    const xff = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "";
    const ip =
      (xff && xff.split(",")[0].trim()) ||
      headers["client-ip"] ||
      headers["Client-Ip"] ||
      "inconnue";

    const referer = headers["referer"] || headers["Referer"] || "—";
    const serverUA = headers["user-agent"] || headers["User-Agent"] || "inconnu";

    // -------- Payload attendu --------
    const lead = body.lead || {};
    const consent = body.consent || {};
    const client = body.client || {};
    const geo = body.geo || null;

    const hasGeo =
      geo &&
      typeof geo.latitude === "number" &&
      typeof geo.longitude === "number";

    const locationStatus =
      body.location_status ||
      (hasGeo ? "granted" : (consent.accepted === false ? "refused_or_unavailable" : "missing"));

    // -------- Champs lead --------
    const instagram = lead.instagram || "—";
    const email = lead.email || "—";
    const phone = lead.phone || "—";
    const countryDeclared = lead.country || "—";
    const note = lead.note || "—";

    // -------- Champs consent --------
    const consentAccepted = typeof consent.accepted === "boolean" ? consent.accepted : null;
    const consentAt = consent.acceptedAt || null;
    const consentMethod = consent.consentMethod || "—";
    const textVersion = consent.textVersion || "—";
    const refusalReasonCode = consent.refusalReasonCode ?? null;
    const refusalReasonMessage = consent.refusalReasonMessage ?? null;

    // -------- Infos client --------
    const clientTZ = client.timezone || "—";
    const clientLang = client.language || "—";
    const clientUA = client.userAgent || serverUA || "—";
    const deviceSummary = client.derived || null;
    const screen = client.screen || null;
    const viewport = client.viewport || null;

    // -------- IP geo approx (optionnelle) --------
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
        // on continue sans geo IP
      }
    }

    // -------- Dérivés / affichage --------
    const now = new Date();
    const gpsMapsUrl = hasGeo ? `https://maps.google.com/?q=${geo.latitude},${geo.longitude}` : null;
    const ipMapsUrl = ipGeo.loc ? `https://maps.google.com/?q=${ipGeo.loc}` : null;

    const gpsAccuracy = hasGeo && typeof geo.accuracy_m === "number"
      ? `${Math.round(geo.accuracy_m)} m`
      : "—";

    const gpsTime = hasGeo && geo.timestamp ? new Date(geo.timestamp).toISOString() : "—";

    const ipZone = [ipGeo.city, ipGeo.region, ipGeo.country].filter(Boolean).join(", ");
    const ipFlag = countryCodeToFlag(ipGeo.country);

    const deviceType = deviceSummary?.deviceType || "—";
    const brandLikely = deviceSummary?.brandLikely || "—";
    const modelLikely = deviceSummary?.modelLikely || "—";
    const os = deviceSummary?.os || "—";
    const browser = deviceSummary?.browser || "—";
    const browserVersion = deviceSummary?.browserVersion || null;
    const confidence = deviceSummary?.confidence || "—";

    const screenLine = screen
      ? `${screen.width || "?"}x${screen.height || "?"} • DPR ${screen.pixelRatio || "?"}`
      : "—";

    const viewportLine = viewport
      ? `${viewport.width || "?"}x${viewport.height || "?"}`
      : "—";

    // -------- Score de risque (simple, ajustable) --------
    const risk = computeRiskScore({
      hasGeo,
      locationStatus,
      consentAccepted,
      countryDeclared,
      ipGeoCountry: ipGeo.country,
      gpsAccuracyM: hasGeo ? geo.accuracy_m : null
    });

    const statusLabel = hasGeo
      ? "✅ GPS accordé"
      : (locationStatus.includes("refused") || consentAccepted === false)
        ? "⚠️ Localisation refusée / indisponible"
        : "⚠️ Localisation manquante";

    // -------- Message Telegram HTML --------
    const textLines = [
      "🛡️ <b>Nouvelle vérification client</b>",
      "",
      `🏷️ <b>Statut</b>`,
      `• ${safe(statusLabel)}`,
      `• Score risque: <b>${safe(String(risk.score))}/100</b> (${safe(risk.level)})`,
      `• Raisons: ${safe(risk.reasons.join(" • ") || "—")}`,
      "",
      "👤 <b>Profil</b>",
      `• Instagram: ${safe(instagram)}`,
      `• Email: ${safe(email)}`,
      `• Téléphone: ${safe(phone)}`,
      `• Pays déclaré: ${safe(countryDeclared)}`,
      `• Message: ${safe(note)}`,
      "",
      "✅ <b>Consentement</b>",
      `• Accepté: ${safe(String(consentAccepted))}`,
      `• Méthode: ${safe(consentMethod)}`,
      `• Version texte: ${safe(textVersion)}`,
      `• Horodatage consentement: ${safe(consentAt || "—")}`,
      `• Code refus: ${safe(refusalReasonCode)}`,
      `• Message refus: ${safe(refusalReasonMessage)}`,
      "",
      "📍 <b>GPS navigateur</b>",
      `• Statut: ${safe(locationStatus)}`,
      `• Coordonnées: ${hasGeo ? safe(`${geo.latitude}, ${geo.longitude}`) : "—"}`,
      `• Précision: ${safe(gpsAccuracy)}`,
      `• Horodatage GPS: ${safe(gpsTime)}`,
      gpsMapsUrl ? `• Maps (GPS): ${safe(gpsMapsUrl)}` : "• Maps (GPS): —",
      "",
      "🌐 <b>Réseau / IP</b>",
      `• IP: <code>${safe(ip)}</code>`,
      `• Référent: ${safe(referer)}`,
      `• Timezone client: ${safe(clientTZ)}`,
      `• Langue client: ${safe(clientLang)}`,
      "",
      "📍 <b>Position IP (approx.)</b>",
      `• Zone: ${safe(ipZone || "—")}${ipFlag ? " " + ipFlag : ""}`,
      `• FAI / ASN: ${safe(ipGeo.org)}`,
      `• Coordonnées approx: ${safe(ipGeo.loc)}`,
      ipMapsUrl ? `• Maps (IP): ${safe(ipMapsUrl)}` : "• Maps (IP): —",
      "",
      "📱 <b>Appareil estimé</b>",
      `• Type: ${safe(deviceType)}`,
      `• Marque probable: ${safe(brandLikely)}`,
      `• Modèle probable: ${safe(modelLikely)}`,
      `• OS: ${safe(os)}`,
      `• Navigateur: ${safe(browser)}${browserVersion ? " " + safe(browserVersion) : ""}`,
      `• Confiance estimation: ${safe(confidence)}`,
      `• Écran: ${safe(screenLine)}`,
      `• Viewport: ${safe(viewportLine)}`,
      "",
      "💻 <b>User-Agent (brut)</b>",
      `• Client UA: ${safe(clientUA)}`
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

    return json(200, {
      ok: true,
      hasGeo,
      location_status: locationStatus,
      risk
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e?.message || "Erreur serveur"
    });
  }
};

function computeRiskScore(input) {
  let score = 10;
  const reasons = [];

  // GPS / consentement
  if (!input.hasGeo) {
    score += 25;
    reasons.push("pas de GPS");
  }

  if (input.locationStatus && String(input.locationStatus).includes("refused")) {
    score += 20;
    reasons.push("localisation refusée");
  }

  if (input.consentAccepted === false) {
    score += 10;
    reasons.push("consentement non accordé");
  }

  // Pays déclaré vs IP approx
  const declared = normalizeCountry(input.countryDeclared);
  const ipCountry = normalizeCountry(input.ipGeoCountry);

  if (declared && ipCountry && declared !== ipCountry) {
    score += 20;
    reasons.push("pays déclaré ≠ pays IP");
  }

  // Précision GPS
  if (typeof input.gpsAccuracyM === "number") {
    if (input.gpsAccuracyM > 1000) {
      score += 15;
      reasons.push("GPS peu précis");
    } else if (input.gpsAccuracyM > 200) {
      score += 8;
      reasons.push("GPS moyennement précis");
    } else {
      reasons.push("GPS précis");
    }
  }

  if (reasons.length === 0) reasons.push("RAS");

  score = Math.max(0, Math.min(100, score));

  let level = "faible";
  if (score >= 70) level = "élevé";
  else if (score >= 40) level = "moyen";

  return { score, level, reasons };
}

function normalizeCountry(v) {
  if (!v || typeof v !== "string") return null;
  const x = v.trim().toUpperCase();

  // codes ISO courants
  const map = {
    FRANCE: "FR",
    FR: "FR",
    FRENCH: "FR",
    BELGIQUE: "BE",
    BELGIUM: "BE",
    BE: "BE",
    SUISSE: "CH",
    SWITZERLAND: "CH",
    CH: "CH",
    CANADA: "CA",
    CA: "CA",
    USA: "US",
    US: "US",
    "UNITED STATES": "US",
    "ÉTATS-UNIS": "US",
    ALGERIE: "DZ",
    ALGÉRIE: "DZ",
    DZ: "DZ",
    MAROC: "MA",
    MOROCCO: "MA",
    MA: "MA",
    TUNISIE: "TN",
    TUNISIA: "TN",
    TN: "TN"
  };

  return map[x] || (x.length === 2 ? x : null);
}

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
