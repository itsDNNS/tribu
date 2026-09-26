import { ImageResponse } from 'next/og';
import { IMAGE_FORMATS, StageImage, StateImage } from '../../components/display/StageImage';
import { normalizeStageConfig, parseLocal, resolveLanguage } from '../../components/display/stageModel';
import { buildMessages, listLanguages, t as translate } from '../../lib/i18n';
import { localeForLang } from '../../lib/dates';

// Served as /display/image.png (see next.config.js) for e-ink frames that fetch a
// picture (TRMNL, ESPHome, Inkplate). Authenticates with the display token, which
// is read from the Authorization header or, for devices without headers, ?token=.

const SUPPORTED_LANGUAGES = listLanguages().map((language) => language.key);
const TOKEN_RE = /^tribu_display_[A-Za-z0-9_-]+$/;
const stateImages = new Map();

function backendUrl() {
  return process.env.BACKEND_URL || 'http://backend:8000';
}

export function displayToken(req) {
  const header = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  const candidate = header ? header[1] : typeof req.query.token === 'string' ? req.query.token : '';
  return TOKEN_RE.test(candidate) ? candidate : null;
}

function preferredLanguages(req) {
  return String(req.headers['accept-language'] || '')
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean);
}

async function png(element, { width, height }) {
  const image = new ImageResponse(element, { width, height });
  return Buffer.from(await image.arrayBuffer());
}

function send(res, status, buffer, headers = {}) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', buffer.length);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.status(status);
  return res.end(res.req?.method === 'HEAD' ? undefined : buffer);
}

// Pairing messages are rendered once per state, language and format, then reused.
async function sendState(res, status, state, language, format) {
  const key = `${state}:${language}:${format}`;
  if (!stateImages.has(key)) {
    const messages = buildMessages(language);
    stateImages.set(key, await png(<StateImage title="Tribu Display" text={translate(messages, `display.state.${state}`)} />, IMAGE_FORMATS[format]));
  }
  return send(res, status, stateImages.get(key), { 'X-Tribu-Display-State': state });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'no-store');
  const requestedFormat = IMAGE_FORMATS[req.query.format] ? req.query.format : null;
  const fallbackLanguage = resolveLanguage(typeof req.query.lang === 'string' ? req.query.lang : 'auto', preferredLanguages(req), SUPPORTED_LANGUAGES);

  const token = displayToken(req);
  if (!token) return sendState(res, 401, 'missing', fallbackLanguage, requestedFormat || 'compact');

  let upstream;
  try {
    upstream = await fetch(`${backendUrl()}/display/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Frames keep their last picture when the server is unreachable.
    return res.status(502).json({ detail: 'Tribu is not reachable' });
  }
  if (upstream.status === 401) {
    const body = await upstream.json().catch(() => null);
    const state = body?.detail?.code === 'DISPLAY_TOKEN_REVOKED' ? 'revoked' : 'invalid';
    // 200 so the frame actually shows why it stopped updating.
    return sendState(res, 200, state, fallbackLanguage, requestedFormat || 'compact');
  }
  if (!upstream.ok) return res.status(502).json({ detail: 'Tribu could not build the display' });

  const dashboard = await upstream.json();
  const config = normalizeStageConfig(dashboard.config);
  const language = resolveLanguage(typeof req.query.lang === 'string' ? req.query.lang : config.language, preferredLanguages(req), SUPPORTED_LANGUAGES);
  const messages = buildMessages(language);
  const format = requestedFormat || config.einkFormat;
  const buffer = await png(
    <StageImage
      dashboard={dashboard}
      t={(key) => translate(messages, key)}
      locale={localeForLang(language)}
      now={parseLocal(dashboard.generated_at) || new Date()}
      epochMs={Date.now()}
      format={format}
    />,
    IMAGE_FORMATS[format],
  );
  return send(res, 200, buffer, { 'X-Tribu-Refresh-Seconds': String(config.refreshSeconds) });
}
