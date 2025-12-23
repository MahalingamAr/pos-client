// client/src/pages/PurchaseInvoice.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { supabase } from "@/lib/supabaseClient";

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/* ---------- Simple reusable styles ---------- */
const labelStyle = {
  display: "block",
  fontSize: "12px",
  marginBottom: "2px",
};

const inputStyle = {
  width: "140px",
  padding: "4px 6px",
  fontSize: "14px",
  border: "1px solid #666",
  borderRadius: "4px",
  background: "white",
};

const numStyle = {
  width: "120px",         // enough for 9999999.99
  padding: "4px 6px",
  fontSize: "14px",
  textAlign: "right",
  border: "1px solid #666",
  borderRadius: "4px",
  background: "white",
};

const btnStyle = {
  padding: "6px 14px",
  fontSize: "14px",
  fontWeight: 600,
  border: "1px solid #444",
  borderRadius: "6px",
  background: "#e0e0e0",
  cursor: "pointer",
};

export default function PurchaseInvoice() {
  const { session } = useSession();
  const user = session?.user || null;
  const branch = session?.branch || null;

  // Branch / user context – use session defaults but still editable
  const [companyId, setCompanyId] = useState(
    branch?.company_code || user?.company_id || ""
  );
  const [stateId, setStateId] = useState(
    branch?.state_code || user?.state_id || ""
  );
  const [branchId, setBranchId] = useState(branch?.branch_id || "");
  const [createdBy, setCreatedBy] = useState(user?.user_id || "");

  useEffect(() => {
    setCompanyId(branch?.company_code || user?.company_id || "");
    setStateId(branch?.state_code || user?.state_id || "");
    setBranchId(branch?.branch_id || "");
    setCreatedBy(user?.user_id || "");
  }, [branch, user]);

  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [vendorId, setVendorId] = useState("");
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState("");
  const [vendorInvoiceDate, setVendorInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [remarks, setRemarks] = useState("");

  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  // manual add fields
  const [manualProductId, setManualProductId] = useState("");
  const [manualProductName, setManualProductName] = useState("");
  const [manualCost, setManualCost] = useState(0);
  const [manualMrp, setManualMrp] = useState(0);

  const [vendors, setVendors] = useState([]); // { vendor_id, vendor_name }[]

  /* ---------- Load vendors via RPC ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("pos_list_vendors");
        if (cancelled) return;
        if (error) {
          console.error("vendor rpc function load error: ", error);
          setError("Failed to load vendors");
          return;
        }
        if (data && Array.isArray(data) && data.length > 0) {
          setVendors(data);
          if (!vendorId && data[0].vendor_id) {
            setVendorId(data[0].vendor_id);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError("Failed to load vendors");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  /* ---------- Totals including GST ---------- */
  const totals = useMemo(() => {
    let gross = 0;
    let disc = 0;
    let gst = 0;

    for (const l of lines) {
      const lineGross = l.quantity * l.unit_cost;
      const lineDisc = (lineGross * (l.discount_pct || 0)) / 100;
      const taxable = lineGross - lineDisc;
      const totalPct =
        (l.cgst_rate || 0) + (l.sgst_rate || 0) + (l.igst_rate || 0);
      const lineGst = taxable * totalPct / 100;

      gross += lineGross;
      disc += lineDisc;
      gst += lineGst;
    }

    const taxable = gross - disc;
    const net = taxable + gst;

    return {
      gross: round2(gross),
      discount: round2(disc),
      taxable: round2(taxable),
      gst: round2(gst),
      net: round2(net),
    };
  }, [lines]);

  /* ---------- Add / Edit Lines (with auto GST) ---------- */
  async function addLine() {
    if (!manualProductId) {
      setError("Product ID is required.");
      return;
    }
    if (!manualCost || manualCost <= 0) {
      setError("Unit cost must be > 0.");
      return;
    }
    if (!companyId || !stateId || !branchId) {
      setError("Branch context missing. Please login & select branch.");
      return;
    }

    setError(null);

    // Try to auto-fetch product name, MRP, and GST from DB
    let dbName = manualProductName;
    let dbMrp = manualMrp || null;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    try {
      const { data, error } = await supabase.rpc("pos_lookup_product_by_id", {
        p_company_id: companyId,
        p_state_id: stateId,
        p_branch_id: branchId,
        p_product_id: manualProductId,
      });

      if (error) {
        console.error("lookup product error:", error);
      } else if (Array.isArray(data) && data.length > 0) {
        const row = data[0];
        // assumes fn_lookup_product_by_id returns these columns:
        // product_id, product_name, mrp, cgst_rate, sgst_rate, igst_rate
        dbName = dbName || row.product_name || manualProductName;
        dbMrp = dbMrp || row.mrp || null;
        cgst = Number(row.cgst_rate || 0);
        sgst = Number(row.sgst_rate || 0);
        igst = Number(row.igst_rate || 0);
      }
    } catch (e) {
      console.error("lookup RPC failed:", e);
    }

    setLines((prev) => [
      ...prev,
      {
        tempId:
          (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
          String(Date.now()) + "-" + Math.random().toString(16).slice(2),
        product_id: manualProductId,
        product_name: dbName || manualProductName || manualProductId,
        quantity: 1,
        unit_cost: manualCost,
        mrp: dbMrp,
        discount_pct: 0,
        cgst_rate: cgst,
        sgst_rate: sgst,
        igst_rate: igst,
      },
    ]);

    setManualProductId("");
    setManualProductName("");
    setManualCost(0);
    setManualMrp(0);
  }

  function updateLine(id, patch) {
    setLines((prev) =>
      prev.map((l) => (l.tempId === id ? { ...l, ...patch } : l))
    );
  }

  function removeLine(id) {
    setLines((prev) => prev.filter((l) => l.tempId !== id));
  }

  function clearAll() {
    setLines([]);
    setStatus(null);
    setError(null);
  }

  /* ---------- Save Invoice ---------- */
  async function handleSave() {
    if (lines.length === 0) {
      setError("No items to save.");
      return;
    }
    if (!companyId || !stateId || !branchId) {
      setError("Branch context missing. Please login & select branch.");
      return;
    }
    if (!vendorId) {
      setError("Vendor is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setStatus("Saving purchase...");

    const payload = {
      company_id: companyId,
      state_id: stateId,
      branch_id: branchId,
      vendor_id: vendorId,
      vendor_invoice_no: vendorInvoiceNo || null,
      vendor_invoice_date: vendorInvoiceDate || null,
      invoice_date: invoiceDate,
      created_by: createdBy,
      remarks: remarks || null,
      items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_cost, // cost in fn_create_purchase_invoice
        mrp: l.mrp,
        discount_pct: l.discount_pct,
      })),
    };

    const { data, error } = await supabase.rpc(
      "pos_create_purchase_invoice",
      { p_data: payload }
    );

    setSaving(false);

    if (error) {
      console.error(error);
      setError(error.message || "Error saving purchase invoice.");
      setStatus(null);
      return;
    }

    setStatus(`Saved purchase_id: ${data}`);
    setLines([]);
  }

  /* ---------- UI ---------- */
  return (
    <div style={{ padding: "16px", maxWidth: "1100px", margin: "0 auto" }}>
      <h2 style={{ marginBottom: "12px" }}>Purchase Entry</h2>

      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <label style={labelStyle}>Company ID</label>
          <input
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>State ID</label>
          <input
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Branch ID</label>
          <input
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Invoice Date</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Vendor</label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            style={inputStyle}
          >
            <option value="">-- Select Vendor --</option>
            {vendors.map((v) => (
              <option key={v.vendor_id} value={v.vendor_id}>
                {v.vendor_id} - {v.vendor_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Vendor Inv No</label>
          <input
            value={vendorInvoiceNo}
            onChange={(e) => setVendorInvoiceNo(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Vendor Inv Date</label>
          <input
            type="date"
            value={vendorInvoiceDate}
            onChange={(e) => setVendorInvoiceDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Created By</label>
          <input
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / span 4" }}>
          <label style={labelStyle}>Remarks</label>
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>
      </div>

      {/* Manual product add */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <label style={labelStyle}>Product ID</label>
          <input
            value={manualProductId}
            onChange={(e) => setManualProductId(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Product Name (optional)</label>
          <input
            value={manualProductName}
            onChange={(e) => setManualProductName(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Unit Cost</label>
          <input
            type="number"
            step="0.01"
            value={manualCost || ""}
            onChange={(e) => setManualCost(Number(e.target.value) || 0)}
            style={numStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>MRP (optional)</label>
          <input
            type="number"
            step="0.5"
            value={manualMrp || ""}
            onChange={(e) => setManualMrp(Number(e.target.value) || 0)}
            style={numStyle}
          />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button type="button" onClick={addLine} style={btnStyle}>
            Add Line
          </button>
        </div>
      </div>

      {/* Items table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: "2px 6px",
          marginBottom: "14px",
        }}
      >
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Unit Cost</th>
            <th>Disc %</th>
            <th>Taxable</th>
            <th>Total GST %</th>
            <th>GST Amt</th>
            <th>Line Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td colSpan={10} style={{ textAlign: "center", padding: "10px" }}>
                No items. Add products above.
              </td>
            </tr>
          )}

          {lines.map((l, idx) => {
            const gross = l.quantity * l.unit_cost;
            const discAmt = (gross * (l.discount_pct || 0)) / 100;
            const taxable = gross - discAmt;
            const totalGstPct =
              (l.cgst_rate || 0) + (l.sgst_rate || 0) + (l.igst_rate || 0);
            const gstAmount = taxable * totalGstPct / 100;
            const lineTotal = taxable + gstAmount;

            return (
              <tr key={l.tempId}>
                <td>{idx + 1}</td>
                <td>
                  {l.product_name}
                  <div style={{ fontSize: "0.8em", color: "#666" }}>
                    {l.product_id}
                  </div>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={l.quantity}
                    onChange={(e) =>
                      updateLine(l.tempId, {
                        quantity: Number(e.target.value) || 0,
                      })
                    }
                    style={numStyle}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={l.unit_cost}
                    onChange={(e) =>
                      updateLine(l.tempId, {
                        unit_cost: Number(e.target.value) || 0,
                      })
                    }
                    style={numStyle}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={l.discount_pct}
                    onChange={(e) =>
                      updateLine(l.tempId, {
                        discount_pct: Number(e.target.value) || 0,
                      })
                    }
                    style={numStyle}
                  />
                </td>
                <td style={{ textAlign: "right", paddingRight: "4px" }}>
                  {round2(taxable).toFixed(2)}
                </td>
                <td style={{ textAlign: "right", paddingRight: "4px" }}>
                  {round2(totalGstPct).toFixed(2)}
                </td>
                <td style={{ textAlign: "right", paddingRight: "4px" }}>
                  {round2(gstAmount).toFixed(2)}
                </td>
                <td style={{ textAlign: "right", paddingRight: "4px" }}>
                  {round2(lineTotal).toFixed(2)}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeLine(l.tempId)}
                    style={btnStyle}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals & actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          marginBottom: "8px",
        }}
      >
        <div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || lines.length === 0}
            style={btnStyle}
          >
            {saving ? "Saving..." : "Save Purchase"}
          </button>{" "}
          <button type="button" onClick={clearAll} style={btnStyle}>
            Clear
          </button>
        </div>

        <div style={{ textAlign: "right", minWidth: "260px" }}>
          <div>Gross: {totals.gross.toFixed(2)}</div>
          <div>Discount: {totals.discount.toFixed(2)}</div>
          <div>Taxable: {totals.taxable.toFixed(2)}</div>
          <div>Approx GST: {totals.gst.toFixed(2)}</div>
          <div>
            <strong>Net: {totals.net.toFixed(2)}</strong>
          </div>
          <div style={{ fontSize: "0.8em", color: "#555" }}>
            (Final GST & Net still calculated in DB)
          </div>
        </div>
      </div>

      {status && <div style={{ color: "green" }}>{status}</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}

