import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/display";
import { EmailCodeForm } from "./email-code-form";

/** Completed envelope, signer not yet verified: the signed copy opens only after the email one-time code. */
export function FinalCopyAccess({ token, maskedEmail }: { token: string; maskedEmail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden /> Everyone has finished
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-2">
          Your signed copy includes the signature page and certificate of completion. To keep it private if this link is forwarded, confirm your
          email first.
        </p>
        <EmailCodeForm token={token} maskedEmail={maskedEmail} />
      </CardContent>
    </Card>
  );
}
