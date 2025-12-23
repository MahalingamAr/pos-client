// client/src/components/CompanyPicker.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CompanyPicker({ value, onChange, disabled }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCompanies() {
      try {
        setErr("");
        setLoading(true);

        // 🔹 Call Supabase RPC (your function returns: company_id, company_name, pincode, phone, gst_no)
        const { data, error } = await supabase 
		      .schema('pos')
		      .rpc("pos_list_of_companies");

        if (error) {
          console.error("[CompanyPicker] pos_list_of_companies error:", error);
          if (!cancelled) {
            setErr(error.message || String(error));
            setCompanies([]);
          }
          return;
        }

        const rows = Array.isArray(data) ? data : [];
        if (!cancelled) setCompanies(rows);
      } catch (e) {
        console.error("[CompanyPicker] unexpected error:", e);
        if (!cancelled) {
          setErr(e.message || String(e));
          setCompanies([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCompanies();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">Company</label>

      <select
        className="w-full border rounded px-2 py-1"
        value={value || ""}
        disabled={disabled || loading}
        onChange={(e) => {
          const id = (e.target.value || "").trim();

          const row =
            companies.find((c) => {
              const rawId =
                c.company_id ??
                c.company_code ??
                c.code ??
                c.id ??
                "";
              const cid = typeof rawId === "string" ? rawId.trim() : String(rawId || "").trim();
              return cid === id;
            }) || null;

          // ✅ Send both (id, fullRow) so parent can store details into session
          onChange?.(id, row);
        }}
      >
        <option value="">
          {loading ? "Loading companies..." : "-- Select Company --"}
        </option>

        {companies.map((c, i) => {
          const rawId =
            c.company_id ??
            c.company_code ??
            c.code ??
            c.id ??
            "";
          const id =
            typeof rawId === "string" ? rawId.trim() : String(rawId || "").trim();

          const name =
            c.company_name ??
            c.name ??
            c.title ??
            String(id || "");

          return (
            <option key={`${id}-${i}`} value={id}>
              {name} {id && `(${id})`}
            </option>
          );
        })}
      </select>

      {err && (
        <div className="text-xs text-amber-700">
          Couldn’t load companies: {err}
        </div>
      )}
    </div>
  );
}

