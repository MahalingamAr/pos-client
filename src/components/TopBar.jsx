// client/src/components/TopBar.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useSession } from "@/context/SessionContext";
import posLogo from "@/assets/logo_pos.png";
import "@/components/force-colors-off.css";

function formatTime(tz) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: tz || "Asia/Singapore",
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString();
  }
}

/* ---------------- dynamic company logos ---------------- */
const companyLogoModules = import.meta.glob(
  "../assets/logo_*.{png,jpg,jpeg,svg}",
  { eager: true }
);

function findCompanyLogoUrl(companyId) {
  if (!companyId) return null;
  const code = String(companyId).trim().slice(0, 2).toLowerCase();
  for (const [path, mod] of Object.entries(companyLogoModules)) {
    const lower = path.toLowerCase();
    if (lower.includes(`logo_${code}.`)) {
      return mod.default;
    }
  }
  return null;
}

/* --- TopBar main --- */
export default function TopBar() {
  const { session, logout: ctxLogout } = useSession();
  const user = session?.user || {};
  const branch = session?.branch || null;
  const company = session?.company || null;

  const tz = user?.timezone || import.meta.env.VITE_TZ || "Asia/Singapore";
  const [clock, setClock] = useState(formatTime(tz));

  useEffect(() => {
    const t = setInterval(() => setClock(formatTime(tz)), 1000);
    return () => clearInterval(t);
  }, [tz]);

  // Prefer branch.branch_code6, else derive cc(2)+sc(2)+bid(2)
  const code6 = useMemo(() => {
    if (branch?.branch_code6) return branch.branch_code6;
    const cc = String(branch?.company_code || user.company_id || "").slice(0, 2);
    const sc = String(branch?.state_code || user.state_id || user.state_code || "").slice(0, 2);
    const bid = String(branch?.branch_id || "").padStart(2, "0").slice(-2);
    const c6 = `${cc}${sc}${bid}`;
    return c6 || "-";
  }, [branch, user]);

  const handleLogout = useCallback(() => ctxLogout?.(), [ctxLogout]);

  /* ---------- Esc key triggers logout ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const el = document.activeElement;
      const tag = (el?.tagName || "").toUpperCase();
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;
      if (isTyping) return;
      handleLogout();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleLogout]);

  // Names
  const companyName = user?.company_name || company?.company_name || "Company";
  const branchName = branch?.branch_name || "Branch";
  const roleName = user?.role_name || "role";
  const username = user?.user_id || "user";

  // CompanyId for logo (prefer branch company_code)
  const companyId = (branch?.company_code || user?.company_id || company?.company_id || "")
    .toString()
    .slice(0, 2);

  const companyLogoUrl = findCompanyLogoUrl(companyId);

  // ✅ GST + phone (from session.company)
  const companyGST = String(company?.gst_no || "").trim();
  const companyPhone = String(company?.phone || "").trim();

  return (
    <div className="border-b bg-yellow-100">
      <header
        className="w-full px-4 py-2 grid items-center"
        style={{ gridTemplateColumns: "auto 1fr auto" }}
        role="banner"
      >
        {/* Left: app/pos logo */}
        <div className="flex items-center gap-3">
          <img
            src={posLogo}
            alt="POS"
            className="w-26 h-16 object-cover"
            draggable={false}
          />
        </div>

        {/* Center: company + branch + GST/Phone + company logo */}
        <div className="flex items-center justify-center gap-3 min-w-0">
          <div className="text-center min-w-0">
            <h1 className="uppercase text-black font-bold tracking-wide text-2xl md:text-2xl truncate">
              {companyName}
            </h1>

            <h2 className="text-black font-semibold tracking-wide text-xl md:text-xl truncate">
              {branchName}
            </h2>

            {/* ✅ GST + Phone shown in centre BELOW branch name */}
            {(companyGST || companyPhone) ? (
              <div className="text-sm text-black font-semibold tracking-wide truncate">
                {companyGST ? (
                  <span>
                    GST:{" "}
                    <span className="fc-off text-green-600 font-mono">{companyGST}</span>
                  </span>
                ) : null}

                {companyGST && companyPhone ? <span> &nbsp; | &nbsp; </span> : null}

                {companyPhone ? (
                  <span>
                    Ph:{" "}
                    <span className="fc-off text-green-600 font-mono">{companyPhone}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {companyLogoUrl && (
            <img
              src={companyLogoUrl}
              alt={`Company ${companyId} Logo`}
              className="w-24 h-16 object-cover"
              draggable={false}
            />
          )}
        </div>

        {/* Right side: Session info (NO logout button) */}
        <div className="flex items-center justify-end gap-4 text-sm">
          <div className="text-right">
            <div>
              BR.Code:{" "}
              <span className="fc-off text-green-600 font-mono">{code6}</span>
            </div>
            <div>
              User:{" "}
              <span className="fc-off text-green-600 font-mono">{username}</span>
            </div>
            <div>
              Role:{" "}
              <span className="fc-off text-green-600 font-mono">{roleName}</span>
            </div>
            <div>
              Time:{" "}
              <span className="fc-off text-yellow-600 font-mono">{clock}</span>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}

