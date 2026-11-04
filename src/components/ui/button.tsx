import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "./slot";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "pressable inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink shadow-sm hover:bg-primary-hover",
        gold: "bg-linear-to-b from-gold-bright to-gold text-[#1b1405] shadow-sm hover:brightness-105",
        secondary: "bg-primary-soft text-primary hover:bg-primary-soft/70",
        outline: "border border-border-input/60 bg-surface text-ink shadow-sm hover:bg-surface-2",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        danger: "bg-danger text-white hover:opacity-90",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 sm:h-10 sm:px-4",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-11 sm:size-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
