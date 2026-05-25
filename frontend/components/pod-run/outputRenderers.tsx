import type { ComponentType } from "react";
import type { PodOutputRendererProps } from "./types";
import LossRunOutput            from "./renderers/LossRunOutput";
import AcordOutput              from "./renderers/AcordOutput";
import QuoteOutput              from "./renderers/QuoteOutput";
import PolicyCompareOutput      from "./renderers/PolicyCompareOutput";
import RenewalOutput            from "./renderers/RenewalOutput";
import DocumentRetrievalOutput  from "./renderers/DocumentRetrievalOutput";

// Per-pod output renderer registry.
// New pod? Add an entry here pointing at a component that renders its
// structured output. The component receives PodOutputRendererProps.

export const OUTPUT_RENDERERS: Record<string, ComponentType<PodOutputRendererProps>> = {
  "loss-run-reporting":  LossRunOutput,
  "acord-parser":        AcordOutput,
  "quote-generation":    QuoteOutput,
  "policy-comparison":   PolicyCompareOutput,
  "renewal-review":      RenewalOutput,
  "document-retrieval":  DocumentRetrievalOutput,
};
