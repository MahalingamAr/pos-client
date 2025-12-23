// client/src/App.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useSession } from "@/context/SessionContext";
import TopBar from "@/components/TopBar";
import AuthAndBranch from "@/pages/AuthAndBranch";
import Billing from "@/pages/Billing";
import PurchaseInvoice from "@/pages/PurchaseInvoice";
import Reports from "@/pages/Reports";
// When you create a real Inventory page, replace this with:
// import Inventory from "@/pages/Inventory";

import {
  ChevronDown,
  Receipt,
  ShoppingCart,
  BarChart3,
  Boxes, // for Inventory
} from "lucide-react";

const SHOW_DEBUG = window.__RENGAA_DBG__;

/* ---------------- Error Boundary to catch crashes in AuthAndBranch ---------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] AuthAndBranch crashed", { error, info });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold">AuthAndBranch crashed</div>
          <div className="mt-1">
            Error: {String(this.state.error?.message || this.state.error)}
          </div>
          <div className="mt-1 text-gray-600">Check console for stack trace.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Small dropdown under TopBar ---------------- */
function ModuleDropdown({ current, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const items = [
    { key: "billing",   label: "Billing",        icon: Receipt },
    { key: "reports",   label: "Reports",        icon: BarChart3 },
    { key: "purinv",    label: "Purchase Invoice", icon: ShoppingCart },
    { key: "inventory", label: "Inventory",      icon: Boxes },
  ];
  const active = items.find((i) => i.key === current) || items[0];

  return (
    <div className="w-full bg-gray-50 border-b">
      <div className="max-w-6xl mx-auto px-4 py-2">
        <div className="relative inline-block" ref={ref}>
          <button
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            onClick={() => setOpen((v) => !v)}
          >
            <active.icon className="size-4" />
            {active.label}
            <ChevronDown className="size-4" />
          </button>

          {open && (
            <div
              className="absolute z-20 mt-2 w-56 rounded-xl border bg-white shadow-lg overflow-hidden"
              role="menu"
            >
              {items.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    current === key ? "bg-gray-50" : ""
                  }`}
                  onClick={() => {
                    onSelect(key);
                    setOpen(false);
                  }}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Debug Panel ---------------- */
function DebugPanel({ state, onReset }) {
  return null;
}

/* ---------------- Helpers ---------------- */
function authHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/* Temporary Inventory placeholder until real page exists */
function Inventory() {
  return (
    <div className="text-sm text-gray-700">
      Inventory screen – to be implemented.
    </div>
  );
}

/* ---------------- App ---------------- */
export default function App() {
  const { session, ready: ctxReady, logout: ctxLogout, token: ctxToken } = useSession();
  const ready = ctxReady ?? true;

  // Default module: Billing
  const [current, setCurrent] = useState("billing");

  const renderCount = useRef(0);
  renderCount.current += 1;

  const token =
    (typeof ctxToken === "string" ? ctxToken : null) ??
    (typeof session?.token === "string" ? session.token : null) ??
    localStorage.getItem("rengaa_token") ??
    "";

  const user = session?.user || null;

  const hasToken =
    typeof token === "string" &&
    token.trim() !== "" &&
    token !== "null" &&
    token !== "undefined";
  const hasUserCore = Boolean(user?.user_id && user?.company_id);
  const isAuthed = hasToken && hasUserCore;
  const hasBranch = Boolean(session?.branch?.branch_id);

  const tokenPreview = hasToken ? `${token.slice(0, 4)}…${token.slice(-4)}` : "";
  const debugState = useMemo(
    () => ({
      ready,
      hasToken,
      hasUserCore,
      isAuthed,
      hasBranch,
      tokenPreview,
      userId: user?.user_id,
      companyId: user?.company_id,
    }),
    [ready, hasToken, hasUserCore, isAuthed, hasBranch, tokenPreview, user?.user_id, user?.company_id]
  );

  // Expose for quick inspection in DevTools
  useEffect(() => {
    window.__rengaa = {
      get session() {
        return session;
      },
      clear() {
        try {
          localStorage.removeItem("rengaa_session");
        } catch {}
        try {
          localStorage.removeItem("rengaa_token");
        } catch {}
        try {
          ctxLogout?.();
        } catch {}
        location.reload();
      },
    };
  }, [session, ctxLogout]);

  // Log each render with current flags
  useEffect(() => {
    console.log(`[App render #${renderCount.current}]`, {
      ready,
      hasToken,
      hasUserCore,
      isAuthed,
      hasBranch,
      user_id: user?.user_id,
      company_id: user?.company_id,
      branch_id: session?.branch?.branch_id,
    });
  });

  // Log transitions of key flags
  const prev = useRef({});
  useEffect(() => {
    const curr = { ready, hasToken, hasUserCore, isAuthed, hasBranch };
    const diffs = Object.entries(curr).filter(([k, v]) => prev.current[k] !== v);
    if (diffs.length) {
      console.log("[App flags changed]", Object.fromEntries(diffs));
      prev.current = curr;
    }
  }, [ready, hasToken, hasUserCore, isAuthed, hasBranch]);

  // Hard reset helper for the DebugPanel
  function hardReset() {
    try {
      localStorage.removeItem("rengaa_session");
    } catch {}
    try {
      localStorage.removeItem("rengaa_token");
    } catch {}
    try {
      ctxLogout?.();
    } catch {}
    location.reload();
  }

  /* ---------- Gate 0: wait for hydration ---------- */
  if (!ready) {
    console.log("[Gate 0] Not ready yet → render nothing (avoid flicker).");
    return (
      <>
        <div className="p-3 text-sm text-gray-500">Loading…</div>
        {SHOW_DEBUG && <DebugPanel state={debugState} onReset={hardReset} />}
      </>
    );
  }

  /* ---------- Gate 1: Not authed OR no branch → Auth flow ---------- */
  if (!isAuthed || !hasBranch) {
    const reasons = [];
    if (!hasToken) reasons.push("no token");
    if (hasToken && !hasUserCore) reasons.push("missing user core fields");
    if (isAuthed && !hasBranch) reasons.push("no branch selected");
    console.log("[Gate 1] Show AuthAndBranch", { reasons, session });
    return (
      <>
        <ErrorBoundary>
          <AuthAndBranch />
        </ErrorBoundary>
        {SHOW_DEBUG && <DebugPanel state={debugState} onReset={hardReset} />}
      </>
    );
  }

  /* ---------- Gate 2: Main app ---------- */
  console.log("[Gate 2] Enter main app.");
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      {/* Module switcher (Billing, Reports, PO, Inventory) */}
      <ModuleDropdown current={current} onSelect={setCurrent} />

      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        {current === "billing"   && <Billing />}
        {current === "reports"   && <Reports />}
        {current === "purinv"    && <PurchaseInvoice />}
        {current === "inventory" && <Inventory />}
      </main>

      {SHOW_DEBUG && <DebugPanel state={debugState} onReset={hardReset} />}
    </div>
  );
}

