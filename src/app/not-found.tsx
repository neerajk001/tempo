import Link from "next/link";
import Card from "@/components/ui/Card";

export default function NotFound() {
  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Card>
        <p className="text-sm text-on-surface-variant">
          Nothing lives at this address. Your timer, tasks, and history are untouched.
        </p>
        <Link href="/" className="mt-2 inline-block text-sm underline">
          Back to dashboard
        </Link>
      </Card>
    </div>
  );
}
