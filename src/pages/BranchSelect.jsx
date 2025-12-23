// client/src/pages/BranchSelect.jsx
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { Building2, Check, Search } from "lucide-react";

const BASE = import.meta.env.VITE_API_BASE || "";
const ENDPOINT = "/api/branches"; // GET ?company_id=&state_id=

export default function BranchSelect() {
  const { session, setBranch, authedFetch } = useSession();
  const user = session?.user || {};
  const companyId = user.company_id || "";
  const stateCode = user.state_id || user.state_code || ""; // whichever you populate
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!companyId) return; // nothing to do yet
      setBusy(true); setErr("");
      try {
        const url = `${BASE}${ENDPOINT}?company_id=${encodeURIComponent(companyId)}&state_id=${encodeURIComponent(stateCode)}`;
        const res = await authedFetch(url, { method: "GET" });
        const json = res.ok ? await res.json() : [];
        if (!alive) return;
        setRows(Array.isArray(json) ? json : []);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load branches");
      } finally {
        if (alive) setBusy(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [companyId, stateCode, authedFetch]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      String(r.branch_id || "").toLowerCase().includes(needle) ||
      String(r.branch_name || "").toLowerCase().includes(needle)
    );
  }, [q, rows]);

  function computeCode6(b) {
    // Use server-provided code if present
    if (b.branch_code6) return b.branch_code6;
    const cc = String(companyId || "").padEnd(2, " ").slice(0, 2);
    const sc = String(stateCode || "").padEnd(2, " ").slice(0, 2);
    const bid = String(b.branch_id || "").padStart(2, "0").slice(-2);
    return `${cc}${sc}${bid}`;
  }

  async function choose(b) {
    setBranch({
      branch_id: b.branch_id,
      branch_name: b.branch_name,
      branch_code6: computeCode6(b),
      // keep for completeness if your TopBar wants them
      state_code: stateCode,
      company_code: companyId,
    });
    // App.jsx will re-render to the main app automatically
  }

  return (
    <div className="min-h-[60vh] flex items-start justify-center p-6">
      <div className="w-full max-w-3xl rounded-2xl border bg-white shadow-sm">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <Building2 className="size-5 text-gray-600" />
          <div className="font-semibold">Select Branch</div>
        </div>

        <div className="p-5 flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2 top-2.5 size-4 text-gray-500" />
            <input
              className="w-full rounded-xl border pl-8 pr-3 py-2"
              placeholder="Search by branch id or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {err && <div className="px-5 pb-3 text-sm text-red-600">{err}</div>}

        <div className="px-5 pb-5">
          <div className="rounded-xl border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-2 w-32">Branch ID</th>
                  <th className="p-2">Branch Name</th>
                  <th className="p-2 w-36">Code</th>
                  <th className="p-2 w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {busy ? (
                  <tr><td className="p-4 text-gray-500" colSpan={4}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td className="p-4 text-gray-500" colSpan={4}>No branches</td></tr>
                ) : (
                  filtered.map(b => (
                    <tr key={b.branch_id} className="border-t">
                      <td className="p-2 font-mono">{b.branch_id}</td>
                      <td className="p-2">{b.branch_name}</td>
                      <td className="p-2 font-mono">{computeCode6(b)}</td>
                      <td className="p-2">
                        <button
                          className="rounded-lg border px-3 py-1.5 text-sm inline-flex items-center gap-2 hover:bg-gray-50"
                          onClick={() => choose(b)}
                          disabled={busy}
                        >
                          <Check className="size-4" /> Use
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Showing branches for company <span className="font-mono">{companyId || "-"}</span> and state <span className="font-mono">{stateCode || "-"}</span>.
          </div>
        </div>
      </div>
    </div>
  );
}

