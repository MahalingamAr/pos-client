// client/src/pages/Reports.jsx
import { useState } from "react";

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState("sales");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  async function run() {
    setError("");

    if (!from || !to) {
      setError("Please choose both From and To dates.");
      setRows([]);
      return;
    }

    if (from > to) {
      setError("From date cannot be after To date.");
      setRows([]);
      return;
    }

    // TODO: when your Supabase RPCs are ready, we’ll wire them here.
    // Example shape we can adapt to:
    //  - fn_report_sales(p_company_id, p_state_id, p_branch_id, p_from, p_to)
    //  - fn_report_purchases(...)
    //  - fn_report_inventory(...)
    //
    // For now, just show a placeholder row so the UI feels alive:
    setRows([
      {
        id: 1,
        name:
          type === "sales"
            ? "Sample Sales Row"
            : type === "purchases"
            ? "Sample Purchase Row"
            : "Sample Inventory Row",
        amount: 0.0,
        notes: "Connect Supabase report function next",
      },
    ]);
  }

  const title =
    type === "sales"
      ? "Sales"
      : type === "purchases"
      ? "Purchases"
      : "Inventory";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-2xl border p-4 grid grid-cols-12 gap-3">
        <div className="col-span-3">
          <label className="text-xs text-gray-600">Report Type</label>
          <select
            className="w-full rounded border px-2 py-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="sales">Sales by Date</option>
            <option value="purchases">Purchases by Date</option>
            <option value="inventory">Inventory Snapshot</option>
          </select>
        </div>
        <div className="col-span-3">
          <label className="text-xs text-gray-600">From</label>
          <input
            type="date"
            className="w-full rounded border px-2 py-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="col-span-3">
          <label className="text-xs text-gray-600">To</label>
          <input
            type="date"
            className="w-full rounded border px-2 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="col-span-3 flex items-end">
          <button
            className="w-full rounded-xl border px-3 py-2"
            onClick={run}
          >
            Run
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 px-1">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold">
          {title} Report
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-2 w-20">#</th>
                <th className="p-2">Name</th>
                <th className="p-2 w-28 text-right">Amount</th>
                <th className="p-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-6 text-center text-gray-500" colSpan={4}>
                    No data yet. Choose filters and click “Run”.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={r.id ?? idx} className="border-t">
                    <td className="p-2">{r.id ?? idx + 1}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-right">
                      {typeof r.amount === "number"
                        ? r.amount.toFixed(2)
                        : r.amount}
                    </td>
                    <td className="p-2">{r.notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

