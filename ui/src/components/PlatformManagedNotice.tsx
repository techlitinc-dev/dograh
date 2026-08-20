import { ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown in SaaS mode when a platform-managed surface (model or telephony
 * configuration) answers 403 for a non-superuser — the direct-URL fallback
 * for pages that are no longer in the nav.
 */
export function PlatformManagedNotice({
  subject,
}: {
  subject: "AI models" | "Telephony";
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <ShieldCheck className="h-10 w-10 text-cta" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Managed by VoxCRM</h2>
            <p className="text-sm text-muted-foreground">
              {subject} are fully managed by the VoxCRM platform. No
              configuration is needed — everything works out of the box.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
