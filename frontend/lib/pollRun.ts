"use client";

// Generic poller for doc-retrieval run state. Yields a fresh run state every
// `intervalMs` until either:
// - the run reaches a terminal status (completed | failed), or
// - the `signal` is aborted, or
// - the fetch fails (the error is yielded as the final value and the iterator
//   completes — callers can inspect by checking `isTerminal` on the last yield).
//
// Why an async iterator rather than a hook: same poller is reusable from any
// trigger (button click, retry, resume after MFA) without the React-rules
// constraints. Wrap it in a `useEffect`/`for await` from the component.

import { agentsApi, type DocRetrievalRunState, type DocRetrievalRunStatus } from "./api";

const TERMINAL: ReadonlySet<DocRetrievalRunStatus> = new Set(["completed", "failed"]);

export interface PollOptions {
  intervalMs?: number;
  signal?: AbortSignal;
  /** Treat `awaiting_mfa` as a yielded value but keep polling (default true). */
  pauseOnAwaitingMfa?: boolean;
}

export async function* pollRun(
  runId: string,
  opts: PollOptions = {},
): AsyncGenerator<DocRetrievalRunState> {
  const intervalMs = opts.intervalMs ?? 1500;
  const signal = opts.signal;

  while (true) {
    if (signal?.aborted) return;
    let run: DocRetrievalRunState;
    try {
      run = await agentsApi.getDocRetrievalRun(runId);
    } catch (err) {
      // Surface the error to the caller via a synthesized failed state, then end.
      yield {
        id: runId,
        user_id: null,
        carrier_id: "",
        ams_target_id: null,
        attach_to: "",
        doc_type: "",
        policy_number: "",
        insured_name: "",
        status: "failed",
        error: String((err as Error).message),
        error_kind: "transient",
        retryable: true,
        metadata: {},
        started_at: null,
        finished_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return;
    }
    yield run;
    if (TERMINAL.has(run.status)) return;
    // awaiting_mfa keeps polling so the UI can transition back to running
    // automatically once the user submits the MFA response.
    if (!opts.pauseOnAwaitingMfa && run.status === "awaiting_mfa") return;

    await wait(intervalMs, signal);
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

export function isTerminal(status: DocRetrievalRunStatus): boolean {
  return TERMINAL.has(status);
}
