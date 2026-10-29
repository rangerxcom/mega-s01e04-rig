import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('status board digest counts', () => {
  it('links each night with valid event totals, including retries before success', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-board-'));
    try {
      writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
        '{"at":"2026-10-28T01:00:00+01:00","job":"alpha","status":"retry","owner":"a"}',
        '{"at":"2026-10-28T01:01:00+01:00","job":"alpha","status":"ok","owner":"a"}',
        '{"at":"2026-10-28T01:02:00+01:00","job":"beta","status":"fail","owner":null}',
        '{"at":"2026-10-28T01:03:00+01:00","job":"beta","status":"ok","owner":null}',
        'not json',
      ].join('\n'));
      writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
      const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

      const res = await createApp(config).request('/');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('<li><a href="/digest/2026-10-28">2026-10-28</a> · ok 2 · retry 1 · fail 1</li>');
      expect(html).toContain('<li><a href="/digest/2026-10-27">2026-10-27</a> · ok 0 · retry 0 · fail 0</li>');
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
