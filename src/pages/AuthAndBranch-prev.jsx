// client/src/pages/AuthAndBranch.jsx
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/context/SessionContext";
import CompanyPicker from "@/components/CompanyPicker"; // default export
import { Building2 } from "lucide-react";
import "@/force-colors-off.css";

export default function AuthAndBranch() {
  const { login, setBranch: ctxSetBranch, setSession } = useSession();

  // form state
  const [companyId, setCompanyId] = useState("");
  const [stateId,   setStateId]   = useState("");
  const [branchId,  setBranchId]  = useState("");

  const [userId,    setUserId]    = useState("");
  const [password,  setPassword]  = useState("");

  // lists
  const [states,   setStates]   = useState([]);
  const [branches, setBranches] = useState([]);

  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const base = import.meta.env.VITE_API_BASE || "";

  // ---- helper: apply branch to session even if setBranch is absent ----
  function applyBranchToSession(branchObj) {
    if (typeof ctxSetBranch === "function") {
      ctxSetBranch(branchObj);
      return;
    }
    if (typeof setSession === "function") {
      setSession(prev => ({ ...(prev || {}), branch: branchObj }));
      return;
    }
    try {
      const curr = JSON.parse(localStorage.getItem("rengaa_session") || "{}");
      localStorage.setItem("rengaa_session", JSON.stringify({ ...curr, branch: branchObj }));
      window.dispatchEvent(new StorageEvent("storage", { key: "rengaa_session" }));
    } catch { /* ignore */ }
  }

  // ---- load states when company changes (PUBLIC: /api/states?company_id=..) ----
  useEffect(() => {
    let alive = true;
    async function loadStates() {
      setStates([]); setStateId(""); setBranches([]); setBranchId("");
      if (!companyId) return;
      try {
        const res = await fetch(`${base}/api/states?company_id=${encodeURIComponent(companyId)}`);
        if (!res.ok) throw new Error(`States HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
        if (!Array.isArray(rows)) throw new Error("States: unexpected payload");
        if (!alive) return;
        setStates(rows);
      } catch (e) {
        if (!alive) return;
        setStates([]);
        console.warn("States load failed:", e);
      }
    }
    loadStates();
    return () => { alive = false; };
  }, [companyId, base]);

  // ---- load branches when company+state chosen (PUBLIC: /api/branches?... ) ----
  useEffect(() => {
    let alive = true;
    async function loadBranches() {
      setBranches([]); setBranchId("");
      if (!companyId || !stateId) return;
      try {
        const url = `${base}/api/branches?company_id=${encodeURIComponent(companyId)}&state_id=${encodeURIComponent(stateId)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Branches HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
        if (!Array.isArray(rows)) throw new Error("Branches: unexpected payload");
        if (!alive) return;
        setBranches(rows);
      } catch (e) {
        if (!alive) return;
        setBranches([]);
        console.warn("Branches load failed:", e);
      }
    }
    loadBranches();
    return () => { alive = false; };
  }, [companyId, stateId, base]);

  const pickedBranch = useMemo(
    () => branches.find(b => String(b.branch_id) === String(branchId)) || null,
    [branches, branchId]
  );

  function computeCode6(b) {
    if (!b) return "-";
    if (b.branch_code6) return b.branch_code6;
    const cc  = String(companyId || "").slice(0, 2);
    const sc  = String(stateId   || "").slice(0, 2);
    const bid = String(b.branch_id || "").padStart(2, "0").slice(-2);
    return `${cc}${sc}${bid}`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (!companyId || !stateId || !branchId) throw new Error("Please pick company, state, and branch.");
      if (!userId || !password) throw new Error("User ID and password are required.");

      // 1) Login (this will set token in SessionContext/localStorage)
      await login({ company_id: companyId, user_id: userId, password });

      // 2) Apply branch to session
      const b = pickedBranch;
      if (!b) throw new Error("Invalid branch selection.");
      const code6 = computeCode6(b);
      applyBranchToSession({
        branch_id: String(b.branch_id).trim(),
        branch_name: b.branch_name || "",
        branch_code6: code6,
        company_code: String(companyId).trim(),
        state_code: String(stateId).trim(),
      });

      // App.jsx will proceed to main app (no changes needed there)
    } catch (ex) {
      setErr(ex?.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !!companyId && !!stateId && !!branchId && !!userId && !!password && !busy;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-2xl bg-white shadow rounded-2xl p-6 space-y-5" autoComplete="off">
        <div className="flex items-center gap-2">
          <Building2 className="fc-off w-5 h-5 text-green-600" />
          <h2 className="text-xl font-semibold">Rengaa POS — Sign in</h2>
        </div>

        {/* Company (PUBLIC: /api/companies) */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">Company:</label>
          <div className="flex-1">
            <CompanyPicker
              value={companyId}
              onChange={v => setCompanyId((v ?? "").trim())}
              disabled={busy}
            />
          </div>
        </div>

        {/* State (PUBLIC: /api/states?company_id=..) */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">State:</label>
          <div className="flex-1">
            <select
              className="w-full border rounded px-3 py-2"
              value={stateId}
              onChange={e => setStateId(e.target.value)}
              disabled={busy || !companyId || states.length === 0}
            >
              <option value="">— Select state —</option>
              {states.map(s => (
                <option key={s.state_id} value={s.state_id}>
                  {s.state_id} — {s.state_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Branch (PUBLIC: /api/branches?company_id=..&state_id=..) */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">Branch:</label>
          <div className="flex-1">
            <select
              className="w-full border rounded px-3 py-2"
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              disabled={busy || !companyId || !stateId || branches.length === 0}
            >
              <option value="">— Select branch —</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.branch_id} — {b.branch_name}
                </option>
              ))}
            </select>
            {pickedBranch && (
              <div className="mt-1 text-xs text-gray-600">
                Code: <span className="font-mono">{computeCode6(pickedBranch)}</span>
              </div>
            )}
          </div>
        </div>

        {/* User ID */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">User ID:</label>
          <div className="flex-1">
            <input
              className="w-full border rounded px-3 py-2"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="xxxxxxxx"
              required
              maxLength={10}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">Password:</label>
          <div className="flex-1">
            <input
              type="password"
              className="w-full border rounded px-3 py-2"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="off"
            />
          </div>
        </div>

        {err && <div className="text-red-600 text-sm border border-red-200 bg-red-50 rounded p-2">{err}</div>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-blue-600 text-white rounded px-3 py-2 hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

