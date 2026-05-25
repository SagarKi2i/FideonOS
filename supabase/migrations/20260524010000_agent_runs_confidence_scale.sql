-- Lock agent_runs.confidence to the canonical 0–1 probability scale.
--
-- The entire frontend (Dashboard, PodDashboard, Work, governance, pod analytics)
-- renders confidence as `Math.round(confidence * 100)%`, and every writer
-- (demo.py, DesktopRuntime, GPU worker) emits a 0–1 value. The column was
-- DECIMAL(5,2) with no constraint, leaving the scale ambiguous and allowing a
-- stray 95.0 to render as 9500%. This pins the contract in the database.

-- Clamp any pre-existing out-of-range rows (e.g. a worker that wrote 0–100)
-- back into 0–1 before applying the constraint, so the migration is safe.
UPDATE public.agent_runs
   SET confidence = confidence / 100.0
 WHERE confidence IS NOT NULL
   AND confidence > 1;

-- Widen precision: a 0–1 probability keeps 4 decimals (DECIMAL(5,2) kept only 2).
ALTER TABLE public.agent_runs
  ALTER COLUMN confidence TYPE DECIMAL(5,4);

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_confidence_range
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
