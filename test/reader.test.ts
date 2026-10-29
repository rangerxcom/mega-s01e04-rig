import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight', () => {
  let tempDir: string;
  let runsDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
    runsDir = join(tempDir, 'runs');
    mkdirSync(runsDir);
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('aggregates the real night into five sorted jobs and counts its truncated line', () => {
    expect(readNight('runs', '2026-10-28')).toEqual({
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('uses instants, not file or string order, and later lines win equal-time ties', () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      '{"at":"2026-10-29T03:00:00+02:00","job":"sync","status":"ok","owner":"rook"}',
      '{"at":"2026-10-29T01:30:00+01:00","job":"sync","status":"fail","owner":"rook","error":"recent"}',
      '{"at":"2026-10-29T00:30:00Z","job":"sync","status":"retry","owner":"rook","error":"equal-time replacement"}',
      '{"at":"2026-10-29T01:00:00Z","job":"sync","status":"ok","owner":null}',
      '{"at":"2026-10-29T00:00:00+01:00","job":"sync","status":"ok","owner":"early"}',
      '{"at":"2026-10-28T23:00:00Z","job":"sync","status":"ok","owner":"early tie"}',
      '{"at":"2026-10-29T02:00:00+02:00","job":"sync","status":"retry","owner":"old","error":"older"}',
    ].join('\n'));

    expect(readNight(runsDir, '2026-10-28')).toEqual({
      badLines: 0,
      counts: { ok: 4, retry: 2, fail: 1 },
      rows: [{
        job: 'sync', owner: null, runs: 7, retries: 2,
        lastStatus: 'ok', lastError: 'equal-time replacement',
        firstAt: '2026-10-28T23:00:00Z', lastAt: '2026-10-29T01:00:00Z',
      }],
    });
  });

  it('counts invalid events without losing valid events and ignores blank lines', () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      '', '  ', '{', 'null', '[]',
      '{"at":"not a timestamp","job":"bad","status":"ok","owner":null}',
      '{"at":"2026-10-28T12:00:00","job":"bad","status":"ok","owner":null}',
      '{"at":"2026-02-30T12:00:00+01:00","job":"bad","status":"ok","owner":null}',
      '{"at":"2026-10-28T12:00:00+01:00","job":3,"status":"ok","owner":null}',
      '{"at":"2026-10-28T12:00:00+01:00","job":"bad","status":"pending","owner":null}',
      '{"at":"2026-10-28T12:00:00+01:00","job":"bad","status":"ok"}',
      '{"at":"2026-10-28T12:00:00+01:00","job":"bad","status":"ok","owner":42}',
      '{"at":"2026-10-28T12:00:00+01:00","job":"bad","status":"ok","owner":null,"error":null}',
      '{"at":"2026-10-28T12:00:00+01:00","job":"valid","status":"ok","owner":null}',
      '',
    ].join('\r\n'));

    expect(readNight(runsDir, '2026-10-28')).toEqual({
      badLines: 11,
      counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{
        job: 'valid', owner: null, runs: 1, retries: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T12:00:00+01:00', lastAt: '2026-10-28T12:00:00+01:00',
      }],
    });
  });

  it('distinguishes missing, empty, and wholly malformed nights', () => {
    expect(readNight(runsDir, '2026-10-28')).toBeNull();

    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    expect(readNight(runsDir, '2026-10-28')).toEqual({
      rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });

    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '  \nnot json\n{}\n\t\n');
    expect(readNight(runsDir, '2026-10-28')).toEqual({
      rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('accepts only YYYY-MM-DD selectors and cannot read a file above runsDir', () => {
    writeFileSync(join(tempDir, '2026-10-28.jsonl'), '');
    writeFileSync(join(runsDir, '2026-10-28\n.jsonl'), '');

    expect(readNight(runsDir, '../2026-10-28')).toBeNull();
    expect(readNight(runsDir, join(tempDir, '2026-10-28'))).toBeNull();
    expect(readNight(runsDir, '2026-10-28\n')).toBeNull();
  });

  it('does not disguise other filesystem errors as a missing night', () => {
    mkdirSync(join(runsDir, '2026-10-28.jsonl'));
    expect(() => readNight(runsDir, '2026-10-28')).toThrow();
  });
});
