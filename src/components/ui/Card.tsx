import { cn } from "@/lib/utils";

export default function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-outline-variant bg-surface-container-lowest p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}
