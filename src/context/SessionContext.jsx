// client/src/context/SessionContext.jsx
import { supabase } from "@/lib/supabaseClient";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const SessionCtx = createContext(null);
export function useSession() {
  return useContext(SessionCtx);
}

const TOKEN_KEY = "rengaa_token";
const SESSION_KEY = "rengaa_session"; // { user, branch?, company? ... }

// 🔑 RPC name only – URL/key are handled inside supabaseClient
const LOGIN_RPC_NAME = "pos_user_login";

const trim = (v) => (typeof v === "string" ? v.trim() : v);
const pad2 = (s) => String(s ?? "").trim().slice(0, 2).padStart(2, "0");

export function SessionProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  });

  // keep localStorage in sync
  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  /** ✅ Safe session patch helper (no manual localStorage edits in components) */
  function patchSession(patch) {
    setSession((prev) => ({ ...(prev || {}), ...(patch || {}) }));
  }

  /** ✅ Load company details (gst_no, phone...) */
  async function fetchCompanyDetails(company_id) {
    const cid = pad2(company_id);
    if (!cid) return null;

    const { data, error } = await supabase.rpc("pos_get_company_by_id", {
      p_company_id: cid,
    });

    if (error) {
      console.warn("[Session.fetchCompanyDetails] RPC error:", error);
      return null;
    }

    // Allow RPC to return object or array[0]
    const row = Array.isArray(data) ? data[0] : data;
    return row || null;
  }

  function normalizeCompany(row, fallbackClaims) {
    const claims = fallbackClaims || {};
    const cid = pad2(row?.company_id ?? claims.company_id ?? "");
    return {
      company_id: cid,
      company_name: trim(row?.company_name ?? claims.company_name ?? "") || "",
      gst_no: trim(row?.gst_no ?? "") || "",
      phone: trim(row?.phone ?? "") || "",
      pincode: trim(row?.pincode ?? "") || "",
      // keep original fields too (optional)
      ...(row ? row : null),
    };
  }

  // 🔐 Login using Supabase RPC (supabase-js client)
  async function login({ company_id, user_id, password }) {
    const companyIdNorm = pad2(company_id);
    const userIdNorm = trim(user_id);
    const passwordNorm = password ?? "";

    if (!companyIdNorm) throw new Error("Company Id Missing");
    if (!userIdNorm) throw new Error("User Id Missing");
    if (!passwordNorm) throw new Error("Password Missing");

    console.debug("[Session.login] Calling Supabase RPC via supabase-js:", {
      rpc: LOGIN_RPC_NAME,
      company_id: companyIdNorm,
      user_id: userIdNorm,
    });

    const { data, error } = await supabase.rpc(LOGIN_RPC_NAME, {
      p_company_id: companyIdNorm,
      p_user_id: userIdNorm,
      p_password: passwordNorm,
    });

    if (error) {
      console.error("[Session.login] RPC error:", error);
      const msg = error.message || error.details || error.hint || "Login RPC failed";
      throw new Error(msg);
    }

    if (!data) throw new Error("Login RPC returned no data");

    const payload = Array.isArray(data) ? data[0] : data;

    if (!payload || payload.ok === false) {
      const errCode = payload?.error || payload?.reason || "LOGIN_FAILED";
      throw new Error(errCode);
    }

    const newToken = payload.token || "";
    const claims = payload.user || payload.claims;

    if (!claims) throw new Error("Login RPC did not return user claims");

    // ✅ fetch full company details
    const companyDetails = await fetchCompanyDetails(claims.company_id);

    const newSession = {
      user: claims,

      // ✅ normalized company object
      company: normalizeCompany(companyDetails, claims),

      // branch will be set by AuthAndBranch after login
    };

    setToken(newToken);
    setSession(newSession);

    return { token: newToken, user: claims, company: newSession.company };
  }

  function logout() {
    setToken("");
    setSession(null);
  }

  const value = useMemo(
    () => ({
      token,
      session,
      setSession,
      patchSession,
      login,
      logout,
    }),
    [token, session]
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

