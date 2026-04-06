import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "interactive-3d inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-all [&_svg]:duration-300 hover:[&_svg]:scale-110 hover:[&_svg]:drop-shadow-[0_0_16px_rgba(125,211,252,0.42)] hover-elevate active-elevate-2 relative overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.24),transparent_38%)] before:opacity-80 after:pointer-events-none after:absolute after:inset-x-[12%] after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/55 after:to-transparent hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.18)] active:translate-y-0",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
           "bg-[linear-gradient(180deg,rgba(59,130,246,0.98),rgba(37,99,235,0.92))] text-primary-foreground border border-primary-border shadow-[0_10px_24px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]",
        destructive:
          "bg-[linear-gradient(180deg,rgba(239,68,68,0.98),rgba(220,38,38,0.9))] text-destructive-foreground shadow-[0_10px_24px_rgba(220,38,38,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] border-destructive-border",
        outline:
          "border border-slate-300/80 bg-white/90 text-slate-700 shadow-[0_10px_28px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-md active:shadow-none dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] dark:text-white dark:shadow-[0_10px_28px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]",
        secondary:
          "border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] dark:text-secondary-foreground dark:border-secondary-border dark:shadow-[0_10px_24px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.12)]",
        ghost: "border border-transparent bg-slate-100/70 text-slate-700 hover:bg-slate-200/80 dark:bg-white/[0.03] dark:text-white/80 dark:hover:bg-white/[0.07] dark:hover:border-white/10",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
