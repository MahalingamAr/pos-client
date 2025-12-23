// client/src/pages/AuthAndBranch.jsx
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/context/SessionContext";
import CompanyPicker from "@/components/CompanyPicker";
import { Building2 } from "lucide-react";
import "@/components/force-colors-off.css";

export default function AuthAndBranch() {
  const { login, setSession } = useSession();

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

  const fieldW = "w-80";

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  function applyBranchToSession(branchObj) {
    try {
      setSession(prev => ({ ...(prev || {}), branch: branchObj }));
      const curr = JSON.parse(localStorage.getItem("rengaa_session") || "{}");
      localStorage.setItem("rengaa_session", JSON.stringify({ ...curr, branch: branchObj }));
      window.dispatchEvent(new StorageEvent("storage", { key: "rengaa_session" }));
    } catch {}
  }

  /** -------------------------------------------------------
   * Load STATES using REST → rpc_login_states
   * ------------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    async function loadStates() {
      setStates([]);
      setStateId("");
      setBranches([]);
      setBranchId("");

      if (!companyId) return;

      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_login_states`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ p_company_id: companyId }),
        });

        const json = await res.json();
        const rows = Array.isArray(json) ? json : [];

        if (alive) setStates(rows);
      } catch (e) {
        console.warn("States RPC failed:", e);
        if (alive) setStates([]);
      }
    }
    loadStates();
    return () => (alive = false);
  }, [companyId]);

  /** -------------------------------------------------------
   * Load BRANCHES using REST → rpc_login_branches
   * ------------------------------------------------------- */
  useEffect(() => {
    let alive = true;

    async function loadBranches() {
      setBranches([]);
      setBranchId("");

      if (!companyId || !stateId) return;

      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_login_branches`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            p_company_id: companyId,
            p_state_id: stateId,
          }),
        });

        const json = await res.json();
        const rows = Array.isArray(json) ? json : [];

        if (alive) setBranches(rows);
      } catch (e) {
        console.warn("Branches RPC failed:", e);
        if (alive) setBranches([]);
      }
    }

    loadBranches();
    return () => (alive = false);
  }, [companyId, stateId]);

  const pickedBranch = useMemo(
    () => branches.find(b => String(b.branch_id) === String(branchId)) || null,
    [branches, branchId]
  );

  function computeCode6(b) {
    if (!b) return "-";
    const cc  = String(companyId).slice(0, 2);
    const sc  = String(stateId).slice(0, 2);
    const bid = String(b.branch_id).padStart(2, "0").slice(-2);
    return `${cc}${sc}${bid}`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      if (!companyId || !stateId || !branchId)
        throw new Error("Please pick company, state, and branch.");

      if (!userId || !password)
        throw new Error("User ID and password are required.");

      await login({
        company_id: companyId,
        user_id: userId,
        password,
      });

      const b = pickedBranch;
      if (!b) throw new Error("Invalid branch selected.");

      const code6 = computeCode6(b);

      applyBranchToSession({
        branch_id: String(b.branch_id).trim(),
        branch_name: b.branch_name,
        branch_code6: code6,
        company_code: companyId.trim(),
        state_code: stateId.trim(),
      });

    } catch (ex) {
      setErr(ex.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !!companyId && !!stateId && !!branchId && !!userId && !!password && !busy;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={onSubmit} className="bg-white shadow rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="fc-off w-5 h-5 text-green-600" />
          <h2 className="text-xl font-semibold">Rengaa POS — Sign in</h2>
        </div>

        {/* Company */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">Company name:</label>
          <div className={`flex-none ${fieldW}`}>
            <CompanyPicker
              value={companyId}
              onChange={v => setCompanyId((v ?? "").trim())}
              disabled={busy}
            />
          </div>
        </div>

        {/* State */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">State name:</label>
          <select
            className={`border rounded px-3 py-2 flex-none ${fieldW}`}
            value={stateId}
            onChange={e => setStateId(e.target.value)}
            disabled={busy || states.length === 0}
          >
            <option value="">— Select state —</option>
            {states.map(s => (
              <option key={s.state_id} value={s.state_id}>
                {s.state_name}
              </option>
            ))}
          </select>
        </div>

        {/* Branch */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">Branch name:</label>
          <select
            className={`border rounded px-3 py-2 flex-none ${fieldW}`}
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            disabled={busy || branches.length === 0}
          >
            <option value="">— Select branch —</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>

        {/* User + Password */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm">User ID:</label>
          <input
            className={`border rounded px-3 py-2 flex-none ${fieldW}`}
            value={userId}
            onChange={e => setUserId(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="w-40 text-sm">Password:</label>
          <input
            type="password"
            className={`border rounded px-3 py-2 flex-none ${fieldW}`}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-blue-600 text-white rounded px-4 py-2"
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

