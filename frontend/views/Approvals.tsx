// Approvals — the broker's action surface for workflow decisions.

import { PageHeader } from "@/components/ui/page-header";
import { ClipboardCheck } from "lucide-react";
import ApprovalsPanel from "@/components/approvals/ApprovalsPanel";

export default function Approvals() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Trust · Decision review"
        title="Needs your approval"
        description="Items flagged by the agents inside your workflows. Approve, override, or reject — your decisions train the model and land in the audit trail."
        icon={ClipboardCheck}
      />
      <ApprovalsPanel variant="card" />
    </div>
  );
}
