import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border border-border/80 bg-surface shadow-sm", className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-[15px] font-bold tracking-tight text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2 border-t border-border px-5 py-3", className)} {...props} />;
}

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-ink-2",
        primary: "bg-primary-soft text-primary",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        info: "bg-info-soft text-info",
        accent: "bg-accent-soft text-accent",
        outline: "border border-border-strong text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  dot,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
const alertTones = {
  info: "border-info/20 bg-info-soft text-ink",
  success: "border-success/25 bg-success-soft text-ink",
  warning: "border-warning/30 bg-warning-soft text-ink",
  danger: "border-danger/30 bg-danger-soft text-ink",
};
const alertIconTones = { info: "text-info", success: "text-success", warning: "text-warning", danger: "text-danger" };

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof alertIcons;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const Icon = alertIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-4 text-sm", alertTones[tone], className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", alertIconTones[tone])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? <div className="text-ink-2">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} {...props} />;
}

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-brand-2 to-brand text-xs font-bold text-gold-bright ring-2 ring-surface",
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name) || "?"
      )}
    </span>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-border/80 bg-surface px-6 py-14 text-center shadow-sm", className)}>
      <span className="relative mb-4 inline-flex size-16 items-center justify-center rounded-2xl bg-(--tile-navy) text-(--tile-navy-fg)">
        <span className="absolute -inset-2 rounded-[22px] border border-dashed border-border-strong" aria-hidden />
        <Icon className="size-7" />
      </span>
      <p className="font-serif text-lg font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8", className)}>
      <div className="flex min-w-0 items-start gap-4">
        {icon ? <IconTile icon={icon} size="lg" className="hidden sm:inline-flex" /> : null}
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-accent uppercase">{eyebrow}</p> : null}
          <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-tight text-ink sm:text-[32px]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const tileTones = {
  navy: "bg-(--tile-navy) text-(--tile-navy-fg)",
  gold: "bg-(--tile-gold) text-(--tile-gold-fg)",
  green: "bg-(--tile-green) text-(--tile-green-fg)",
  maroon: "bg-(--tile-maroon) text-(--tile-maroon-fg)",
  teal: "bg-(--tile-teal) text-(--tile-teal-fg)",
  slate: "bg-(--tile-slate) text-(--tile-slate-fg)",
  brand: "bg-linear-to-br from-brand-2 to-brand text-gold-bright",
} as const;
export type TileTone = keyof typeof tileTones;

const tileSizes = {
  sm: "size-9 rounded-[11px] [&>svg]:size-[18px]",
  md: "size-11 rounded-[14px] [&>svg]:size-[22px]",
  lg: "size-14 rounded-2xl [&>svg]:size-7",
};

/** Soft-tinted rounded-square icon holder, as on banking quick actions. */
export function IconTile({
  icon: Icon,
  tone = "navy",
  size = "md",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: TileTone;
  size?: keyof typeof tileSizes;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", tileTones[tone], tileSizes[size], className)} aria-hidden>
      <Icon />
    </span>
  );
}

export function SectionHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
      {action ? <div className="text-sm font-semibold text-primary">{action}</div> : null}
    </div>
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border/80 bg-surface shadow-sm">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("border-b border-border bg-surface-2/60 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("border-b border-border px-4 py-3 align-middle text-ink-2", className)} {...props} />;
}

/**
 * A banking-style list row: leading icon tile, bold title, muted second line,
 * optional trailing chip, and a chevron when it links somewhere. Place rows in a
 * `<Card><ul className="divide-y divide-border">…</ul></Card>`.
 */
export function ListRow({
  href,
  external,
  icon,
  tone = "navy",
  leading,
  title,
  subtitle,
  trailing,
  privateTitle,
  className,
}: {
  href?: string;
  external?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: TileTone;
  /** Custom leading content instead of an icon tile (e.g. a time column). */
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Blur the title in privacy mode (client names). */
  privateTitle?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {leading ?? (icon ? <IconTile icon={icon} tone={tone} size="sm" /> : null)}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-ink" data-private={privateTitle || undefined}>
          {title}
        </span>
        {subtitle ? <span className="tabular block truncate text-xs text-muted">{subtitle}</span> : null}
      </span>
      {trailing}
      {href ? <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
  const cls = cn("flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5", href && "transition-colors hover:bg-surface-2/60", className);
  return (
    <li>
      {href ? (
        external ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
            {body}
          </a>
        ) : (
          <Link href={href} className={cls}>
            {body}
          </Link>
        )
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
