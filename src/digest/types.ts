export type DigestRow = {
  job: string;
  /** Owner of the most recent valid event; null means unknown. */
  owner: string | null;
  /** All valid events for this job, including retries and failures. */
  runs: number;
  /** Events whose status is retry. */
  retries: number;
  /** Status of the most recent valid event. */
  lastStatus: 'ok' | 'retry' | 'fail';
  /** Most recent error text, or null; later events without an error do not clear it. */
  lastError: string | null;
  /** Earliest event timestamp, kept verbatim with its original offset. */
  firstAt: string;
  /** Latest event timestamp, kept verbatim with its original offset. */
  lastAt: string;
};

/**
 * Synchronously read runsDir/<night>.jsonl (night is YYYY-MM-DD).
 * The implementation exports readNight from src/digest/reader.ts.
 *
 * Return null for a missing file. An empty file returns
 * { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } }.
 * Counts include every valid event, not just each job's last status.
 * Ignore blank lines; count each malformed JSON or invalid event line in badLines
 * and continue reading. A valid event has at (a timestamp with an offset), job
 * (string), status (ok | retry | fail), owner (string | null), and optional error
 * (string). A file with only bad lines has rows: [] and its badLines count.
 *
 * Return one row per job, sorted ascending by job. Compare timestamps by instant
 * for earliest/latest and most recent error; break equal-time ties by file order
 * (later line wins). Preserve the original timestamp strings, not UTC conversions.
 */
export type ReadNight = (
  runsDir: string,
  night: string,
) => {
  rows: DigestRow[];
  badLines: number;
  counts: { ok: number; retry: number; fail: number };
} | null;
