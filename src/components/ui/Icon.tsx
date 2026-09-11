export default function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined select-none leading-none ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}
