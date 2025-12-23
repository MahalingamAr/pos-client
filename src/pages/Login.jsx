import { useState } from "react";
import { useSession } from "@/context/SessionContext";
import CompanyPicker from "@/components/CompanyPicker";

export default function Login() {
  const { login } = useSession();
  const [companyId, setCompanyId] = useState("");
  const [userId, setUserId]       = useState("");
  const [password, setPassword]   = useState("");
  const [msg, setMsg]             = useState("");
  const [busy, setBusy]           = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      await login({ company_id: companyId?.trim(), user_id: userId?.trim(), password });
      // success → SessionContext updates; App re-renders → TopBar appears
    } catch (err) {
      console.error("Login error:", err);
      setMsg(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto p-4 border rounded">
      <h2 className="text-lg font-semibold mb-3">Sign in</h2>

      <label className="block mb-2 text-sm">Company</label>
      <CompanyPicker value={companyId} onChange={setCompanyId} disabled={busy} />

      <label className="block mt-3 mb-2 text-sm">User ID</label>
      <input className="w-full border p-2 rounded" value={userId} onChange={(e)=>setUserId(e.target.value)} disabled={busy} />

      <label className="block mt-3 mb-2 text-sm">Password</label>
      <input type="password" className="w-full border p-2 rounded" value={password} onChange={(e)=>setPassword(e.target.value)} disabled={busy} />

      {msg && <div className="mt-3 text-red-600 text-sm">{msg}</div>}

      <button className="mt-4 px-4 py-2 border rounded bg-black text-white disabled:opacity-60"
              disabled={busy || !companyId || !userId || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

