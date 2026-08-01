const NOTION_VERSION = "2026-03-11";
const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";

const PROPERTY_NAMES = {
  title: "Participante",
  identity: "Apresentação",
  email: "E-mail",
  phone: "Telefone",
  models: "Modelos",
  frequency: "Frequência",
  topics: "Temas",
  process: "Processo",
  expectations: "Expectativas",
  participation: "Participação",
  meetingRhythm: "Ritmo dos encontros",
  availability: "Disponibilidade",
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

function asList(value, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item, 160))
    .filter(Boolean)
    .slice(0, maxItems);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asString(value, 320));
}

function isPhone(value) {
  const digits = asString(value, 40).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

function getReleaseMode() {
  const mode = asString(process.env.JOIN_RELEASE_MODE, 32).toLowerCase();
  return mode === "gated" ? "gated" : "immediate";
}

function richText(content) {
  const safeContent = asString(content, 1900);
  return {
    rich_text: safeContent
      ? [{ type: "text", text: { content: safeContent } }]
      : [],
  };
}

function titleText(content) {
  const safeContent = asString(content, 100) || "Participante sem nome";
  return {
    title: [{ type: "text", text: { content: safeContent } }],
  };
}

function notionOptionName(name) {
  // Notion rejecta vírgulas em nomes de select / multi_select.
  return asString(name, 100).replace(/,/g, " —");
}

function selectValue(name) {
  const safeName = notionOptionName(name);
  return safeName ? { select: { name: safeName } } : { select: null };
}

function multiSelectValue(names) {
  return {
    multi_select: asList(names, 12).map((name) => ({
      name: notionOptionName(name),
    })),
  };
}

function emailValue(email) {
  return { email: asString(email, 320) || null };
}

function phoneValue(phone) {
  return { phone_number: asString(phone, 40) || null };
}

function checkboxValue(checked) {
  return { checkbox: Boolean(checked) };
}

function participantName(identity) {
  const raw = asString(identity, 700);
  if (!raw) return "Participante sem nome";

  const firstPart = raw.split(/\n|[.!?]/)[0].trim();
  const withoutPrefix = firstPart.replace(
    /^(meu nome é|me chamo|eu sou|sou o|sou a)\s+/i,
    ""
  );

  return asString(withoutPrefix || firstPart, 100);
}

function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  return {};
}

function releasePayload(pageId) {
  const releaseMode = getReleaseMode();
  const payload = {
    ok: true,
    id: pageId,
    releaseMode,
  };

  if (releaseMode === "immediate") {
    const whatsappUrl = asString(process.env.WHATSAPP_INVITE_URL, 500);
    if (whatsappUrl) payload.whatsappUrl = whatsappUrl;
  }

  return payload;
}

module.exports = async function handler(request, response) {
  if (request.method === "GET") {
    return sendJson(response, 200, {
      ok: true,
      service: "alexandria-notion",
      configured: Boolean(
        process.env.NOTION_TOKEN && process.env.NOTION_DATA_SOURCE_ID
      ),
      releaseMode: getReleaseMode(),
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { ok: false, error: "Método não permitido." });
  }

  if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATA_SOURCE_ID) {
    return sendJson(response, 500, {
      ok: false,
      error: "Integração com o Notion ainda não configurada.",
    });
  }

  let body;
  try {
    body = parseBody(request);
  } catch {
    return sendJson(response, 400, { ok: false, error: "JSON inválido." });
  }

  // Campo invisível. Bots que o preencherem recebem sucesso, mas nada é salvo.
  if (asString(body.website, 200)) {
    return sendJson(response, 200, { ok: true, releaseMode: getReleaseMode() });
  }

  const answers = body.answers || {};
  const identity = asString(answers.identidade, 700);
  const email = asString(answers.email, 320).toLowerCase();
  const phone = asString(answers.telefone, 40);
  const models = asList(answers.modelos);
  const frequency = asString(answers.frequencia, 160);
  const topics = asList(answers.temas, 3);
  const processAnswer = asString(answers.processo, 1200);
  const expectations = asList(answers.expectativas, 3);
  const participation = asList(answers.participacao);
  const meetingRhythm = asString(answers.ritmo_encontros, 160);
  const availability = asList(answers.disponibilidade);

  if (
    !identity ||
    !isEmail(email) ||
    !isPhone(phone) ||
    models.length === 0 ||
    !frequency ||
    topics.length === 0 ||
    !processAnswer ||
    expectations.length === 0 ||
    participation.length === 0 ||
    !meetingRhythm ||
    availability.length === 0
  ) {
    return sendJson(response, 400, {
      ok: false,
      error: "Preencha todas as respostas antes de enviar.",
    });
  }

  const notionPayload = {
    parent: {
      type: "data_source_id",
      data_source_id: process.env.NOTION_DATA_SOURCE_ID,
    },
    properties: {
      [PROPERTY_NAMES.title]: titleText(participantName(identity)),
      [PROPERTY_NAMES.identity]: richText(identity),
      [PROPERTY_NAMES.email]: emailValue(email),
      [PROPERTY_NAMES.phone]: phoneValue(phone),
      [PROPERTY_NAMES.models]: multiSelectValue(models),
      [PROPERTY_NAMES.frequency]: selectValue(frequency),
      [PROPERTY_NAMES.topics]: multiSelectValue(topics),
      [PROPERTY_NAMES.process]: richText(processAnswer),
      [PROPERTY_NAMES.expectations]: multiSelectValue(expectations),
      [PROPERTY_NAMES.participation]: multiSelectValue(participation),
      [PROPERTY_NAMES.meetingRhythm]: selectValue(meetingRhythm),
      [PROPERTY_NAMES.availability]: multiSelectValue(availability),
      [PROPERTY_NAMES.released]: checkboxValue(false),
      [PROPERTY_NAMES.inviteSent]: checkboxValue(false),
    },
  };

  try {
    const notionResponse = await fetch(NOTION_PAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify(notionPayload),
    });

    const notionResult = await notionResponse.json().catch(() => ({}));

    if (!notionResponse.ok) {
      console.error("Notion API error", {
        status: notionResponse.status,
        code: notionResult.code,
        message: notionResult.message,
      });

      return sendJson(response, 502, {
        ok: false,
        error: "O Notion recusou o registro.",
        detail: notionResult.message || "Confira o token, o acesso e as colunas.",
      });
    }

    return sendJson(response, 201, releasePayload(notionResult.id));
  } catch (error) {
    console.error("Notion request failed", error);
    return sendJson(response, 502, {
      ok: false,
      error: "Não foi possível conectar ao Notion agora.",
    });
  }
};
