import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { features } from "@/lib/env";
import { kycBaseHost } from "@/lib/kyc/cgpey";
import { Alert, EmptyState, PageHeader } from "@/components/ui/display";
import { KycTester } from "@/components/admin/kyc-tester";

export const metadata: Metadata = { title: "CGPEY KYC tester" };

export default async function AdminKycPage() {
  await requireAdminPage();
  const configured = features.cgpeyKyc;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CGPEY KYC tester"
        description="Run live PAN, bank-account and Aadhaar OTP checks against CGPEY's documented KYC API from the server. Keys never reach the browser."
      />

      {!configured ? (
        <EmptyState
          icon={Fingerprint}
          title="CGPEY KYC is not configured"
          description="Set CGPEY_MERCHANT_ID, CGPEY_API_KEY and CGPEY_API_SECRET (and CGPEY_BASE_URL if CGPEY gives you a different host) in the server environment. The tester stays disabled until then; nothing is simulated."
        />
      ) : (
        <>
          <Alert tone="warning" title="Every call deducts CGPEY wallet balance">
            These are live, billed requests. Use them only to test the integration, only with real people who have agreed, and
            never with made-up numbers. Requests go to <span className="font-mono">{kycBaseHost()}</span>.
          </Alert>
          <KycTester />
        </>
      )}

      <Alert tone="info" title="Before relying on CGPEY KYC">
        Get in writing which licensed Aadhaar partner (AUA/KUA) performs CGPEY&apos;s OTP checks, the confirmed production host,
        a sandbox, the rate card and a DPDP data-processing agreement. Store only masked numbers and provider reference IDs.
      </Alert>
    </div>
  );
}
