import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export default function Button({ variant = "primary", className, ...rest }: Props) {
  return (
    <button
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors",
        variant === "primary"
          ? "bg-primary text-on-primary hover:bg-primary-container disabled:opacity-50"
          : "bg-surface-container text-on-surface border border-outline/60 hover:bg-surface-container-high disabled:opacity-50",
        className
      )}
      {...rest}
    />
  );
}
