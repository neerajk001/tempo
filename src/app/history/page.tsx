import HistoryClient from "@/components/history/HistoryClient";

export default function HistoryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>
      <HistoryClient />
    </div>
  );
}
