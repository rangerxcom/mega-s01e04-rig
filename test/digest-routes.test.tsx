import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

describe('digest routes', () => {
  it('returns the same sorted jobs and associated values in HTML and JSON despite a bad line', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      '{"at":"2026-10-28T22:00:00-04:00","job":"zeta","status":"fail","owner":null,"error":"disk full"}',
      '{"at":"2026-10-29T07:00:00+01:00","job":"alpha","status":"retry","owner":"Ada","error":"temporary outage"}',
      'not json',
      '{"at":"2026-10-29T07:10:00+01:00","job":"alpha","status":"retry","owner":"Ada"}',
      '{"at":"2026-10-29T07:20:00+01:00","job":"alpha","status":"retry","owner":"Ada"}',
      '{"at":"2026-10-29T07:30:00+01:00","job":"alpha","status":"ok","owner":"Ada"}',
    ].join('\n'));

    const htmlResponse = await app().request('/digest/2026-10-28');
    const jsonResponse = await app().request('/api/digest/2026-10-28');
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      rows: [
        { job: 'alpha', owner: 'Ada', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'temporary outage', firstAt: '2026-10-29T07:00:00+01:00', lastAt: '2026-10-29T07:30:00+01:00' },
        { job: 'zeta', owner: null, runs: 1, retries: 0, lastStatus: 'fail', lastError: 'disk full', firstAt: '2026-10-28T22:00:00-04:00', lastAt: '2026-10-28T22:00:00-04:00' },
      ],
      badLines: 1,
      counts: { ok: 1, retry: 3, fail: 1 },
    });

    const html = await htmlResponse.text();
    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    const alpha = rows.findIndex((row) => /\balpha\b/.test(row));
    const zeta = rows.findIndex((row) => /\bzeta\b/.test(row));
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(zeta).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(zeta);
    expect(rows[alpha]).toContain('Ada');
    expect(rows[alpha]).toContain('temporary outage');
    expect(rows[alpha]).toContain('2026-10-29T07:00:00+01:00');
    expect(rows[alpha]).toContain('2026-10-29T07:30:00+01:00');
    const alphaCells = (rows[alpha].match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? [])
      .map((cell) => cell.replace(/<[^>]*>/g, '').trim());
    expect(alphaCells).toContain('4');
    expect(alphaCells).toContain('3');
    expect(rows[alpha]).toMatch(/\bok\b/);
    expect(rows[alpha]).toMatch(/<td\b[^>]*class=["']warn["'][^>]*>\s*3\s*<\/td>/i);
    expect(rows[zeta]).toContain('—');
    expect(rows[zeta]).toContain('disk full');
    expect(rows[zeta]).toContain('2026-10-28T22:00:00-04:00');
    expect(rows[zeta]).toMatch(/\bfail\b/);
    expect(rows[zeta]).toMatch(/<td\b[^>]*class=["']warn["'][^>]*>\s*fail\s*<\/td>/i);
    expect(html).toMatch(/(?:bad|invalid|malformed|skipped)[\s\S]{0,80}1|1[\s\S]{0,80}(?:bad|invalid|malformed|skipped)/i);
  });

  it('returns 404 for a missing night in both formats', async () => {
    expect((await app().request('/digest/2026-10-27')).status).toBe(404);
    expect((await app().request('/api/digest/2026-10-27')).status).toBe(404);
  });

  it('renders an empty night in both formats', async () => {
    writeFileSync(join(runsDir, '2026-10-26.jsonl'), '');
    const htmlResponse = await app().request('/digest/2026-10-26');
    const jsonResponse = await app().request('/api/digest/2026-10-26');
    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toMatch(/nothing ran/i);
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });
});
