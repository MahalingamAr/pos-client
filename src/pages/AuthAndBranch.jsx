// client/src/pages/AuthAndBranch.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSession } from "@/context/SessionContext";
import CompanyPicker from "@/components/CompanyPicker";
import { Building2 } from "lucide-react";
import "@/components/force-colors-off.css";

const trim = (v) => (typeof v === "string" ? v.trim() : v);
const pad2 = (v) => String(v ?? "").trim().slice(0, 2); // you use char(2) company/state

export default function AuthAndBranch() {
  const { login, patchSession } = useSession();

  // form state
  const [companyId, setCompanyId] = useState("");
  const [stateId, setStateId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  // lists
  const [states, setStates] = useState([]);
  const [branches, setBranches] = useState([]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const fieldW = "w-80";

  /** ✅ Attach branch selection into session context */
  function applyBranchToSession(branchObj) {
    patchSession({ branch: branchObj });
  }

  /** ✅ Attach company into session context (so TopBar can show GST/Phone) */
  const applyCompanyToSession = useCallback(
    (companyRow, cid) => {
      if (companyRow) {
        patchSession({
          company: {
            ...companyRow,
            company_id: pad2(companyRow.company_id ?? cid),
            company_name: trim(companyRow.company_name ?? ""),
            gst_no: trim(companyRow.gst_no ?? ""),
            phone: trim(companyRow.phone ?? ""),
            pincode: trim(companyRow.pincode ?? ""),
          },
        });
      } else if (cid) {
        // minimal fallback
        patchSession({
          company: {
            company_id: pad2(cid),
            company_name: "",
            gst_no: "",
            phone: "",
            pincode: "",
          },
        });
      } else {
        patchSession({ company: null });
      }
    },
    [patchSession]
  );

  /** Load STATES */
  useEffect(() => {
    let alive = true;

    async function loadStates() {
      setStates([]);
      setStateId("");
      setBranches([]);
      setBranchId("");

      if (!companyId) return;

      try {
        const { data, error } = await supabase.rpc("pos_login_states", {
          p_company_id: companyId,
        });

        if (error) throw error;
        if (alive) setStates(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("States load failed:", e);
        if (alive) setStates([]);
      }
    }

    loadStates();
    return () => {
      alive = false;
    };
  }, [companyId]);

  /** Load BRANCHES */
  useEffect(() => {
    let alive = true;

    async function loadBranches() {
      setBranches([]);
      setBranchId("");

      if (!companyId || !stateId) return;

      try {
        const { data, error } = await supabase.rpc("pos_login_branches", {
          p_company_id: companyId,
          p_state_id: stateId,
        });

        if (error) throw error;
        if (alive) setBranches(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("Branches load failed:", e);
        if (alive) setBranches([]);
      }
    }

    loadBranches();
    return () => {
      alive = false;
    };
  }, [companyId, stateId]);

  const pickedBranch = useMemo(
    () => branches.find((b) => String(b.branch_id) === String(branchId)) || null,
    [branches, branchId]
  );

  function computeCode6(b) {
    if (!b) return "-";
    if (b.branch_code6) return b.branch_code6;
    const cc = String(companyId || "").slice(0, 2);
    const sc = String(stateId || "").slice(0, 2);
    const bid = String(b.branch_id || "").padStart(2, "0").slice(-2);
    return `${cc}${sc}${bid}`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      if (!companyId || !stateId || !branchId) {
        throw new Error("Please pick company, state, and branch.");
      }
      if (!userId || !password) {
        throw new Error("User ID and password are required.");
      }

      await login({ company_id: companyId, user_id: userId, password });

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

      // App.jsx will continue navigation
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
              // ✅ CompanyPicker now sends (id, row)
              onChange={(id, row) => {
                const cid = pad2(id);

                // change company resets dependent selections
                setCompanyId(cid);
                setStateId("");
                setBranchId("");
                setStates([]);
                setBranches([]);

                // ✅ store full company details into session (for TopBar GST/Phone)
                applyCompanyToSession(row, cid);
              }}
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
            onChange={(e) => setStateId(e.target.value)}
            disabled={busy || !companyId || states.length === 0}
          >
            <option value="">— Select state —</option>
            {states.map((s) => (
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
            onChange={(e) => setBranchId(e.target.value)}
            disabled={busy || !companyId || !stateId || branches.length === 0}
          >
            <option value="">— Select branch —</option>
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">User ID:</label>
          <input
            className={`border rounded px-3 py-2 flex-none ${fieldW}`}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="xxxxxxxx"
            required
            maxLength={10}
            autoComplete="off"
            disabled={busy}
          />
        </div>

        {/* Password */}
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm font-medium text-gray-700">Password:</label>
          <input
            type="password"
            className={`border rounded px-3 py-2 flex-none ${fieldW}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="off"
            disabled={busy}
          />
        </div>

        {err && (
          <div className="text-red-600 text-sm border border-red-200 bg-red-50 rounded p-2">
            {err}
          </div>
        )}

        <div className="flex justify-start">
          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-blue-600 text-white rounded px-4 py-2 hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </div>
      </form>
    </div>
  );
}

