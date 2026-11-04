import { Ban, CheckCircle2, CircleDashed, Clock, FileEdit, Hourglass, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { recipientStatusLabels, statusLabels, type EnvelopeStatus, type RecipientStatus } from "@/lib/esign/constants";

const envelopeTone: Record<EnvelopeStatus, "neutral" | "primary" | "success" | "warning" | "danger" | "info"> = {
  DRAFT: "neutral",
  OUT_FOR_SIGNATURE: "info",
  PARTIALLY_SIGNED: "primary",
  COMPLETED: "success",
  DECLINED: "danger",
  EXPIRED: "warning",
  VOIDED: "neutral",
};

const envelopeIcon: Record<EnvelopeStatus, React.ComponentType> = {
  DRAFT: FileEdit,
  OUT_FOR_SIGNATURE: Send,
  PARTIALLY_SIGNED: Hourglass,
  COMPLETED: CheckCircle2,
  DECLINED: XCircle,
  EXPIRED: Clock,
  VOIDED: Ban,
};

export function EnvelopeStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = (status in statusLabels ? status : "DRAFT") as EnvelopeStatus;
  const Icon = envelopeIcon[s];
  return (
    <Badge tone={envelopeTone[s]} className={className}>
      <Icon aria-hidden /> {statusLabels[s]}
    </Badge>
  );
}

const recipientTone: Record<RecipientStatus, "neutral" | "primary" | "success" | "danger" | "info"> = {
  PENDING: "neutral",
  SENT: "info",
  VIEWED: "primary",
  APPROVED: "success",
  SIGNED: "success",
  DECLINED: "danger",
};

export function RecipientStatusBadge({ status, action }: { status: string; action: string }) {
  if (action === "CC") {
    return (
      <Badge tone="outline">
        <CircleDashed aria-hidden /> Copy at completion
      </Badge>
    );
  }
  const s = (status in recipientStatusLabels ? status : "PENDING") as RecipientStatus;
  return <Badge tone={recipientTone[s]}>{recipientStatusLabels[s]}</Badge>;
}
