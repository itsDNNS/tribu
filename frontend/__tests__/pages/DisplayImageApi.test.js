/**
 * @jest-environment node
 */
import { buildStagePayload } from '../test-utils/stageFixture';

const rendered = [];
jest.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element, options) {
      rendered.push({ element, options });
    }
    async arrayBuffer() {
      return new Uint8Array([137, 80, 78, 71]).buffer;
    }
  },
}));

const handler = require('../../pages/api/display-image').default;
const { imageCards } = require('../../components/display/StageImage');
const { normalizeStageConfig } = require('../../components/display/stageModel');

function call({ headers = {}, query = {}, method = 'GET' } = {}) {
  return new Promise((resolve) => {
    const req = { method, headers, query };
    const res = {
      req,
      headers: {},
      statusCode: 200,
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve(this); return this; },
      end(body) { this.body = body; resolve(this); return this; },
    };
    handler(req, res);
  });
}

function upstream(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  rendered.length = 0;
  global.fetch = jest.fn();
});

test('renders the stage for a header token in the configured format', async () => {
  const payload = buildStagePayload({
    config: { display_mode: 'eink', refresh_interval_seconds: 900, layout_preset: 'stage', layout_config: { version: 2, eink_format: 'large', language: 'de' } },
  });
  fetch.mockResolvedValue(upstream(200, payload));
  const res = await call({ headers: { authorization: 'Bearer tribu_display_abc' } });

  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/display\/dashboard$/), { headers: { Authorization: 'Bearer tribu_display_abc' } });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toBe('image/png');
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['x-tribu-refresh-seconds']).toBe('900');
  expect(rendered[0].options).toEqual({ width: 1200, height: 825 });
  const { t, format } = rendered[0].element.props;
  expect(format).toBe('large');
  expect(t('display.stage.next')).toBe('Als Nächstes');
});

test('accepts ?token= for frames without headers and a format override', async () => {
  fetch.mockResolvedValue(upstream(200, buildStagePayload()));
  const res = await call({ query: { token: 'tribu_display_q', format: 'compact', lang: 'fr' } });
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tribu_display_q');
  expect(res.statusCode).toBe(200);
  expect(rendered[0].options).toEqual({ width: 800, height: 480 });
  expect(rendered[0].element.props.t('display.stage.next')).toBe('À suivre');
});

test('rejects missing or malformed tokens without asking the backend', async () => {
  const missing = await call();
  expect(missing.statusCode).toBe(401);
  expect(missing.headers['x-tribu-display-state']).toBe('missing');
  const malformed = await call({ query: { token: '<script>' } });
  expect(malformed.statusCode).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
  // State pictures are rendered once and reused.
  expect(rendered).toHaveLength(1);
});

test('a revoked display gets a picture explaining it', async () => {
  fetch.mockResolvedValue(upstream(401, { detail: { code: 'DISPLAY_TOKEN_REVOKED' } }));
  const res = await call({ headers: { authorization: 'Bearer tribu_display_gone', 'accept-language': 'de-DE,de;q=0.9' } });
  expect(res.statusCode).toBe(200);
  expect(res.headers['x-tribu-display-state']).toBe('revoked');
  expect(rendered[0].element.props.text).toMatch(/entfernt/);
});

test('an unreachable backend returns an error so the frame keeps its last picture', async () => {
  fetch.mockRejectedValue(new Error('ECONNREFUSED'));
  const res = await call({ headers: { authorization: 'Bearer tribu_display_abc' } });
  expect(res.statusCode).toBe(502);
  expect(rendered).toHaveLength(0);
});

test('only GET and HEAD are allowed', async () => {
  const res = await call({ method: 'POST' });
  expect(res.statusCode).toBe(405);
  expect(res.headers.allow).toBe('GET, HEAD');
});

test('every refresh turns each zone one card further', () => {
  const payload = buildStagePayload({ weather: { location_name: 'X', current_temperature: 1, hourly: [], today: null, tomorrow: null } });
  const config = normalizeStageConfig({ display_mode: 'eink', refresh_interval_seconds: 600, layout_config: { version: 2 } });
  const now = new Date(2026, 8, 29, 7, 12);
  const first = imageCards(config, payload, { now, epochMs: 0 });
  const second = imageCards(config, payload, { now, epochMs: 600 * 1000 });
  expect(first.a).toBe('dinner');
  expect(second.a).toBe('shopping');
  expect(imageCards(config, payload, { now, epochMs: 1200 * 1000 }).a).toBe('weather');
});
