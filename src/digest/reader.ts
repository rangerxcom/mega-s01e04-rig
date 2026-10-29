import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
};

const isEvent = (value: unknown): value is RunEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return typeof event.at === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(event.at)
    && Number.isFinite(Date.parse(event.at))
    && new Date(`${event.at.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === event.at.slice(0, 10)
    && typeof event.job === 'string'
    && (event.status === 'ok' || event.status === 'retry' || event.status === 'fail')
    && (typeof event.owner === 'string' || event.owner === null)
    && (event.error === undefined || typeof event.error === 'string');
};

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, { row: DigestRow; errorAt: number }>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isEvent(event)) {
      badLines++;
      continue;
    }
    counts[event.status]++;

    let digest = jobs.get(event.job);
    if (!digest) {
      digest = {
        row: {
          job: event.job, owner: event.owner, runs: 0, retries: 0,
          lastStatus: event.status, lastError: null,
          firstAt: event.at, lastAt: event.at,
        },
        errorAt: -Infinity,
      };
      jobs.set(event.job, digest);
    }
    const { row } = digest;
    const at = Date.parse(event.at);
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (at <= Date.parse(row.firstAt)) row.firstAt = event.at;
    if (at >= Date.parse(row.lastAt)) {
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
    }
    if (event.error !== undefined && at >= digest.errorAt) {
      row.lastError = event.error;
      digest.errorAt = at;
    }
  }

  const rows = [...jobs.values()].map(({ row }) => row);
  rows.sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { rows, badLines, counts };
};
