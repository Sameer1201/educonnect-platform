import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "group interactive-3d rainbow-border relative overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,255,0.94)_42%,rgba(250,245,255,0.96))] text-card-foreground shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_42%)] before:opacity-80 after:pointer-events-none after:absolute after:-right-10 after:top-6 after:h-28 after:w-28 after:rounded-full after:bg-cyan-400/10 after:blur-3xl dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(0,212,255,0.04),rgba(255,255,255,0.02)_36%,rgba(255,84,214,0.04))] dark:shadow-[0_18px_50px_rgba(15,23,42,0.22)] dark:before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_36%)] hover:shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:hover:shadow-[0_24px_70px_rgba(15,23,42,0.3)]",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4 sm:p-6", className)} {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-4 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
