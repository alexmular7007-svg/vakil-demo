import { Card } from "@/components/ui/display";
import { cn } from "@/lib/utils";

/** Settings card with a real <h2> (the page h1 lives in the settings layout). */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)} id={id}>
      <div className="flex flex-col gap-3 p-5 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="p-5 pt-2">{children}</div> : null}
    </Card>
  );
}
