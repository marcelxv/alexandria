const { createHmac, timingSafeEqual } = require("crypto");

const NOTION_VERSION = "2026-03-11";
const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";
const RESEND_URL = "https://api.resend.com/emails";

const PROPERTY_NAMES = {
  title: "Participante",
  email: "E-mail",
  released: "Liberado",
  inviteSent: "Convite enviado",
};

function sendJson(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function asString(value, maxLength = 1800) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function getReleaseMode() {
  const mode = asString(process.env.JOIN_RELEASE_MODE, 32).toLowerCase();
  return mode === "gated" ? "gated" : "immediate";
}

function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  return {};
}

function rawBodyString(request, body) {
  if (typeof request.body === "string") return request.body;
  if (request.rawBody) return String(request.rawBody);
  return JSON.stringify(body);
}

function verifyNotionSignature(request, body) {
  const secret = asString(process.env.NOTION_WEBHOOK_SECRET, 500);
  if (!secret) return true;

  const signature = asString(
    request.headers["x-notion-signature"] || request.headers["X-Notion-Signature"],
    200
  );
  if (!signature) return false;

  const calculated = `sha256=${createHmac("sha256", secret)
    .update(rawBodyString(request, body))
    .digest("hex")}`;

  try {
    const left = Buffer.from(calculated);
    const right = Buffer.from(signature);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function collectPageIds(body) {
  const ids = new Set();

  if (body?.entity?.type === "page" && body.entity.id) {
    ids.add(body.entity.id);
  }

  if (Array.isArray(body?.data?.pages)) {
    for (const page of body.data.pages) {
      if (page?.id) ids.add(page.id);
    }
  }

  if (Array.isArray(body?.events)) {
    for (const event of body.events) {
      if (event?.entity?.type === "page" && event.entity.id) {
        ids.add(event.entity.id);
      }
    }
  }

  return [...ids];
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

function readTitle(property) {
  const items = property?.title || [];
  return items.map((item) => item?.plain_text || "").join("").trim();
}

function readEmail(property) {
  return asString(property?.email, 320).toLowerCase();
}

function readCheckbox(property) {
  return Boolean(property?.checkbox);
}

async function fetchPage(pageId) {
  const response = await fetch(`${NOTION_PAGES_URL}/${pageId}`, {
    headers: notionHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || `Falha ao ler página (${response.status})`);
  }
  return result;
}

async function markInviteSent(pageId) {
  const response = await fetch(`${NOTION_PAGES_URL}/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      properties: {
        [PROPERTY_NAMES.inviteSent]: { checkbox: true },
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || `Falha ao marcar convite (${response.status})`);
  }
  return result;
}

async function sendInviteEmail({ to, name, whatsappUrl }) {
  const from = asString(process.env.EMAIL_FROM, 320);
  const apiKey = asString(process.env.RESEND_API_KEY, 200);
  if (!from || !apiKey) {
    throw new Error("RESEND_API_KEY ou EMAIL_FROM não configurados.");
  }

  const safeName = asString(name, 100) || "olá";
  const subject = "Seu convite para o grupo Alexandria";
  const text = [
    `Oi, ${safeName}.`,
    "",
    "Sua entrada na Alexandria foi confirmada.",
    "Entre no grupo do WhatsApp por este link:",
    whatsappUrl,
    "",
    "Até lá,",
    "Alexandria",
  ].join("\n");

  const html = `
    <p>Oi, ${escapeHtml(safeName)}.</p>
    <p>Sua entrada na Alexandria foi confirmada.</p>
    <p><a href="${escapeHtml(whatsappUrl)}">Entrar no grupo do WhatsApp</a></p>
    <p>Até lá,<br/>Alexandria</p>
  `;

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || `Resend falhou (${response.status})`);
  }
  return result;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function processPage(pageId) {
  const page = await fetchPage(pageId);
  const properties = page.properties || {};
  const released = readCheckbox(properties[PROPERTY_NAMES.released]);
  const inviteSent = readCheckbox(properties[PROPERTY_NAMES.inviteSent]);
  const email = readEmail(properties[PROPERTY_NAMES.email]);
  const name = readTitle(properties[PROPERTY_NAMES.title]);
  const whatsappUrl = asString(process.env.WHATSAPP_INVITE_URL, 500);

  if (!released || inviteSent) {
    return { pageId, skipped: true, reason: inviteSent ? "already_sent" : "not_released" };
  }

  if (!email || !whatsappUrl) {
    return { pageId, skipped: true, reason: "missing_email_or_link" };
  }

  await sendInviteEmail({ to: email, name, whatsappUrl });
  await markInviteSent(pageId);

  return { pageId, sent: true, email };
}

module.exports = async function handler(request, response) {
  if (request.method === "GET") {
    return sendJson(response, 200, {
      ok: true,
      service: "alexandria-notion-webhook",
      releaseMode: getReleaseMode(),
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { ok: false, error: "Método não permitido." });
  }

  let body;
  try {
    body = parseBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: "JSON inválido." });
  }

  // Verificação inicial da subscription do Notion.
  if (body.verification_token) {
    console.info("Notion webhook verification_token received");
    return sendJson(response, 200, {
      ok: true,
      verification_token: body.verification_token,
    });
  }

  if (!verifyNotionSignature(request, body)) {
    return sendJson(response, 401, { ok: false, error: "Assinatura inválida." });
  }

  if (getReleaseMode() !== "gated") {
    return sendJson(response, 200, {
      ok: true,
      ignored: true,
      reason: "JOIN_RELEASE_MODE is not gated",
    });
  }

  if (!process.env.NOTION_TOKEN) {
    return sendJson(response, 500, {
      ok: false,
      error: "NOTION_TOKEN não configurado.",
    });
  }

  const pageIds = collectPageIds(body);
  if (pageIds.length === 0) {
    return sendJson(response, 200, { ok: true, ignored: true, reason: "no_page_ids" });
  }

  const results = [];
  for (const pageId of pageIds) {
    try {
      results.push(await processPage(pageId));
    } catch (error) {
      console.error("Webhook page processing failed", { pageId, error: error.message });
      results.push({ pageId, error: error.message });
    }
  }

  return sendJson(response, 200, { ok: true, results });
};
