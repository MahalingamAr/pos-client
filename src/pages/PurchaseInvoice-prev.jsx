// client/src/pages/PurchaseInvoice.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { supabase } from "@/lib/supabaseClient";

function round2(v) {
  return Math.round(v * 100) / 100;
}

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
  }, [
    branch?.company_code,
    branch?.state_code,
    branch?.branch_id,
    user?.company_id,
    user?.state_id,
    user?.user_id,
  ]);

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

  const [manualProductId, setManualProductId] = useState("");
  const [manualProductName, setManualProductName] = useState("");
  const [manualCost, setManualCost] = useState(0);
  const [manualMrp, setManualMrp] = useState(0);

  const [vendors, setVendors] = useState([]); // { vendor_id, vendor_name }[]

  // Load vendors via RPC
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("rpc_list_vendors");
        if (cancelled) return;
        if (error) {
          console.error('vendor rpc function load error: ',error);
          setError("Failed to load vendors");
          return;
        }
        if (data && Array.isArray(data) && data.length > 0) {
          setVendors(data);
          // default to first vendor if not already chosen
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
    return () => { cancelled = true; };
  }, [vendorId]);

  const totals = useMemo(() => {
    let gross = 0;
    let disc = 0;
    for (const l of lines) {
      const lineGross = l.quantity * l.unit_cost;
      const lineDisc = (lineGross * (l.discount_pct || 0)) / 100;
      gross += lineGross;
      disc += lineDisc;
    }
    const taxable = gross - disc;
    return {
      gross: round2(gross),
      discount: round2(disc),
      taxable: round2(taxable),
    };
  }, [lines]);

  function addLine() {
    if (!manualProductId || !manualProductName) {
      setError("Product ID and Name are required.");
      return;
    }
    if (!manualCost || manualCost <= 0) {
      setError("Unit cost must be > 0.");
      return;
    }
    setError(null);

    setLines((prev) => [
      ...prev,
      {
        tempId:
          (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
          String(Date.now()) + "-" + Math.random().toString(16).slice(2),
        product_id: manualProductId,
        product_name: manualProductName,
        quantity: 1,
        unit_cost: manualCost,
        mrp: manualMrp || null,
        discount_pct: 0,
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
        unit_price: l.unit_cost, // treated as cost in fn_create_purchase_invoice
        mrp: l.mrp,
        discount_pct: l.discount_pct,
      })),
    };

    const { data, error } = await supabase.rpc(
      "fn_create_purchase_invoice",
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

  return (
    <div style={{ padding: "16px", maxWidth: "1100px", margin: "0 auto" }}>
      <h2>Purchase Entry</h2>

      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <div>
          <label>Company ID</label>
          <input
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          />
        </div>
        <div>
          <label>State ID</label>
          <input
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
          />
        </div>
        <div>
          <label>Branch ID</label>
          <input
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          />
        </div>
        <div>
          <label>Invoice Date</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>

        <div>
          <label>Vendor</label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
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
          <label>Vendor Inv No</label>
          <input
            value={vendorInvoiceNo}
            onChange={(e) => setVendorInvoiceNo(e.target.value)}
          />
        </div>
        <div>
          <label>Vendor Inv Date</label>
          <input
            type="date"
            value={vendorInvoiceDate}
            onChange={(e) => setVendorInvoiceDate(e.target.value)}
          />
        </div>
        <div>
          <label>Created By</label>
          <input
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
          />
        </div>
        <div style={{ gridColumn: "1 / span 4" }}>
          <label>Remarks</label>
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </div>

      {/* Manual product add */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <div>
          <label>Product ID</label>
          <input
            value={manualProductId}
            onChange={(e) => setManualProductId(e.target.value)}
          />
        </div>
        <div>
          <label>Product Name</label>
          <input
            value={manualProductName}
            onChange={(e) => setManualProductName(e.target.value)}
          />
        </div>
        <div>
          <label>Unit Cost</label>
          <input
            type="number"
            step="0.01"
            value={manualCost || ""}
            onChange={(e) => setManualCost(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <label>MRP</label>
          <input
            type="number"
            step="0.01"
            value={manualMrp || ""}
            onChange={(e) => setManualMrp(Number(e.target.value) || 0)}
          />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button type="button" onClick={addLine}>
            Add Line
          </button>
        </div>
      </div>

      {/* Items table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "12px",
        }}
      >
        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #ccc" }}>#</th>
            <th style={{ borderBottom: "1px solid #ccc" }}>Product</th>
            <th style={{ borderBottom: "1px solid #ccc" }}>Qty</th>
            <th style={{ borderBottom: "1px solid #ccc" }}>Unit Cost</th>
            <th style={{ borderBottom: "1px solid #ccc" }}>Disc %</th>
            <th style={{ borderBottom: "1px solid #ccc" }}>Line Total</th>
            <th style={{ borderBottom: "1px solid #ccc" }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const gross = l.quantity * l.unit_cost;
            const discAmt = (gross * (l.discount_pct || 0)) / 100;
            const lineTotal = gross - discAmt;
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
                    style={{ width: "70px" }}
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
                    style={{ width: "90px" }}
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
                    style={{ width: "70px" }}
                  />
                </td>
                <td style={{ textAlign: "right" }}>
                  {round2(lineTotal).toFixed(2)}
                </td>
                <td>
                  <button type="button" onClick={() => removeLine(l.tempId)}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: "8px" }}>
                No items. Add products above.
              </td>
            </tr>
          )}
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
          >
            {saving ? "Saving..." : "Save Purchase"}
          </button>{" "}
          <button type="button" onClick={clearAll}>
            Clear
          </button>
        </div>

        <div style={{ textAlign: "right", minWidth: "260px" }}>
          <div>Gross: {totals.gross.toFixed(2)}</div>
          <div>Discount: {totals.discount.toFixed(2)}</div>
          <div>Taxable (approx): {totals.taxable.toFixed(2)}</div>
          <div style={{ fontSize: "0.8em", color: "#555" }}>
            (Final GST & Net calculated in DB)
          </div>
        </div>
      </div>

      {status && <div style={{ color: "green" }}>{status}</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}

