'use client';
// Run engine — simulates the streaming execution of a pod against an input.
//
// MVP: replays sample steps with per-step delays so the timeline animates
// realistically. When the actual edge functions are wired (workflow-ai with
// run mode, plus the per-pod backends), this is the only file that needs to
// swap from local replay to real SSE.

import type { RunInput, RunStep } from "./types";
import { getSampleForPod } from "./samples";

export interface RunCallbacks {
  onStepUpdate: (stepIdx: number, patch: Partial<RunStep>) => void;
  onComplete: (output: any, confidence: number) => void;
  onError: (message: string) => void;
}

/**
 * Kick off a simulated run. Returns a cancel function.
 * The same shape will let us swap in real SSE later without changing callers.
 */
export function startRun(
  podId: string,
  _input: RunInput,
  cb: RunCallbacks,
): () => void {
  const sample = getSampleForPod(podId);
  if (!sample) {
    cb.onError("No sample defined for this pod yet.");
    return () => {};
  }

  let cancelled = false;
  const timers: number[] = [];

  // Walk through each step: mark running, then done.
  let accDelay = 0;
  sample.steps.forEach((step, idx) => {
    const delay = sample.stepDelays?.[idx] ?? 800;

    const startT = window.setTimeout(() => {
      if (cancelled) return;
      cb.onStepUpdate(idx, {
        status: "running",
        startedAt: new Date().toISOString(),
      });
    }, accDelay);
    timers.push(startT);

    accDelay += delay;

    const endT = window.setTimeout(() => {
      if (cancelled) return;
      cb.onStepUpdate(idx, {
        status: "done",
        finishedAt: new Date().toISOString(),
      });
    }, accDelay);
    timers.push(endT);
  });

  // After all steps done, emit the output.
  const completeT = window.setTimeout(() => {
    if (cancelled) return;
    cb.onComplete(sample.output, sample.confidence);
  }, accDelay + 200);
  timers.push(completeT);

  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
  };
}
