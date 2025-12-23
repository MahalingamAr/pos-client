// client/src/pages/Billing.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession } from "@/context/SessionContext";
import { supabase } from "@/lib/supabaseClient";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* -------------------- utils -------------------- */
function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeTrim(v) {
  return typeof v === "string" ? v.trim() : v;
}

/* ---------- Shared styles ---------- */
const labelStyle = { display: "block", fontSize: "12px", marginBottom: "2px" };

const inputStyle = {
  width: "140px",
  padding: "4px 6px",
  fontSize: "14px",
  border: "1px solid #666",
  borderRadius: "4px",
  background: "white",
};

const numStyle = {
  width: "120px",
  padding: "4px 6px",
  fontSize: "14px",
  textAlign: "right",
  border: "1px solid #666",
  borderRadius: "4px",
  background: "white",
};

const qtyStyle = { ...numStyle, width: "90px" };
const rateStyle = { ...numStyle, width: "90px" };
const discStyle = { ...numStyle, width: "90px" };

const btnStyle = {
  padding: "6px 14px",
  fontSize: "14px",
  fontWeight: 600,
  border: "1px solid #444",
  borderRadius: "6px",
  background: "#e0e0e0",
  cursor: "pointer",
};

/* ---------- compute line amounts ---------- */
function computeLineAmounts(line, invoiceDiscountPct, isIGST) {
  const qty = toNum(line.quantity);
  const unit = toNum(line.unit_price);

  const overrideOn =
    invoiceDiscountPct !== "" &&
    invoiceDiscountPct !== null &&
    invoiceDiscountPct !== undefined;

  const discPct = overrideOn ? toNum(invoiceDiscountPct) : toNum(line.discount_pct);

  const cgstRate = toNum(line.cgst_rate);
  const sgstRate = toNum(line.sgst_rate);
  const gstRate = round2(cgstRate + sgstRate);

  const gross = round2(qty * unit);
  const discountAmt = round2((gross * discPct) / 100);
  const taxable = round2(gross - discountAmt);

  const taxAmt = round2((taxable * gstRate) / 100);

  const cgstAmt = isIGST ? 0 : round2(taxAmt / 2);
  const sgstAmt = isIGST ? 0 : round2(taxAmt - cgstAmt);
  const igstAmt = isIGST ? taxAmt : 0;

  const lineTotal = round2(taxable + taxAmt);

  return {
    ...line,
    discount_pct: discPct,
    gross_amount: gross,
    discount_amount: discountAmt,
    taxable_amount: taxable,
    cgst_amount: cgstAmt,
    sgst_amount: sgstAmt,
    igst_amount: igstAmt,
    tax_amount: taxAmt,
    line_total: lineTotal,
  };
}

export default function Billing() {
  const { session } = useSession();
  const user = session?.user || null;
  const branch = session?.branch || null;
  const company = session?.company || null;

  /* -------------------- company/branch header info -------------------- */
  const companyName = safeTrim(company?.company_name) || safeTrim(user?.company_name) || "Company";
  const companyGST = safeTrim(company?.gst_no) || "";
  const companyPhone = safeTrim(company?.phone) || "";
  const companyEmail = safeTrim(company?.email) || "";
  const companyAddr = useMemo(() => {
    const parts = [
      safeTrim(company?.address_line1),
      safeTrim(company?.address_line2),
      safeTrim(company?.city),
      safeTrim(company?.pincode),
    ].filter(Boolean);
    return parts.join(", ");
  }, [company]);

  // Branch/user context
  const [companyId, setCompanyId] = useState(branch?.company_code || user?.company_id || "");
  const [stateId, setStateId] = useState(branch?.state_code || user?.state_id || "");
  const [branchId, setBranchId] = useState(branch?.branch_id || "");
  const [createdBy, setCreatedBy] = useState(user?.user_id || "");

  useEffect(() => {
    setCompanyId(branch?.company_code || user?.company_id || "");
    setStateId(branch?.state_code || user?.state_id || "");
    setBranchId(branch?.branch_id || "");
    setCreatedBy(user?.user_id || "");
  }, [branch, user]);

  // Menu Mode
  const [mode, setMode] = useState("ENTRY"); // ENTRY | EDIT | DELETE
  const [loadedSalesId, setLoadedSalesId] = useState(null);

  // status selection before load + loaded invoice status
  const [loadStatus, setLoadStatus] = useState("ACTIVE"); // ACTIVE | DELETED
  const [loadedInvStatus, setLoadedInvStatus] = useState(null); // ACTIVE | DELETED | null

  // Header
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceNo, setInvoiceNo] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [isIGST, setIsIGST] = useState(false);
  const [invoiceDiscountPct, setInvoiceDiscountPct] = useState("");

  // Client
  const [clientId, setClientId] = useState("");
  const [customerName, setCustomerName] = useState("Walk-in");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [clientAddr, setClientAddr] = useState("");
  const [deliveryAddr, setDeliveryAddr] = useState(""); // ✅ NEW: delivery address for DO

  // Remarks
  const [remarks, setRemarks] = useState("");

  // Search
  const [clientSearch, setClientSearch] = useState("");
  const [clientOptions, setClientOptions] = useState([]);

  // Lines
  const [lines, setLines] = useState([]);

  // status
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  // payment
  const [paidAmount, setPaidAmount] = useState(0);

  // scanner/manual
  const [barcode, setBarcode] = useState("");
  const [manualProductId, setManualProductId] = useState("");
  const scanInputRef = useRef(null);

  // ✅ scan mode controls whether barcode field auto-focuses
  const [scanMode, setScanMode] = useState(true);

  // ✅ Saved-lock rule: only SAVED invoice can be printed/viewed as PDF/shared/downloaded
  // We treat loaded invoice as saved. For ENTRY mode, must save first.
  const [lastSaved, setLastSaved] = useState(null); // { sales_id, invoice_no, invoice_date, status, savedAtISO }

  // Document type for PDF preview/download/print/share
  const [docType, setDocType] = useState("INVOICE"); // INVOICE | DO

  // PDF
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfFile, setPdfFile] = useState(null); // File for Web Share API
  const [pdfMeta, setPdfMeta] = useState(null); // { docType, invoiceNo, invoiceDate, salesId }

  useEffect(() => {
    return () => {
      try {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      } catch {}
    };
  }, [pdfUrl]);

  const focusScanIfAllowed = useCallback(() => {
    if (!scanMode) return;
    const el = document.activeElement;
    const tag = (el?.tagName || "").toUpperCase();
    const isTypingField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (!isTypingField) scanInputRef.current?.focus();
  }, [scanMode]);

  // Focus barcode only when scanMode is ON
  useEffect(() => {
    if (!scanMode) return;

    const onWinFocus = () => focusScanIfAllowed();
    onWinFocus();
    window.addEventListener("focus", onWinFocus);
    return () => window.removeEventListener("focus", onWinFocus);
  }, [scanMode, focusScanIfAllowed]);

  // recompute lines if discount override or isIGST changes
  useEffect(() => {
    setLines((prev) => prev.map((l) => computeLineAmounts(l, invoiceDiscountPct, isIGST)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceDiscountPct, isIGST]);

  /* ---------- totals ---------- */
  const totals = useMemo(() => {
    let gross = 0,
      disc = 0,
      cgst = 0,
      sgst = 0,
      igst = 0;
    for (const l of lines) {
      gross += toNum(l.gross_amount);
      disc += toNum(l.discount_amount);
      cgst += toNum(l.cgst_amount);
      sgst += toNum(l.sgst_amount);
      igst += toNum(l.igst_amount);
    }
    const taxable = gross - disc;
    const gst = cgst + sgst + igst;
    const net = taxable + gst;

    return {
      gross: round2(gross),
      discount: round2(disc),
      taxable: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2(igst),
      gst: round2(gst),
      net: round2(net),
    };
  }, [lines]);

  const balanceAmount = useMemo(
    () => round2(totals.net - toNum(paidAmount)),
    [totals.net, paidAmount]
  );

  /* ---------- Helpers ---------- */
  function makeTempId() {
    return (
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + "-" + Math.random().toString(16).slice(2)
    );
  }

  const computeDefaultInvoiceNo = useCallback(() => {
    if (!invoiceDate) return "";
    const ymd = invoiceDate.replace(/-/g, "");
    if (ymd.length !== 8) return "";
    const yymmdd = ymd.slice(2);
    return `${yymmdd}001`;
  }, [invoiceDate]);

  const fetchNextInvoiceNo = useCallback(async () => {
    if (!companyId || !stateId || !branchId || !invoiceDate) {
      setInvoiceNo("");
      return "";
    }

    try {
      const { data, error } = await supabase.rpc("pos_get_next_invoice_no", {
        p_company_id: companyId,
        p_state_id: stateId,
        p_branch_id: branchId,
        p_invoice_date: invoiceDate,
      });

      if (error) {
        console.error("pos_get_next_invoice_no error:", error);
        const fallback = computeDefaultInvoiceNo();
        setInvoiceNo(fallback);
        return fallback;
      }

      const value =
        typeof data === "string"
          ? data
          : data?.invoice_no || data?.next_invoice_no || computeDefaultInvoiceNo();

      const nextNo = value || computeDefaultInvoiceNo();
      setInvoiceNo(nextNo);
      return nextNo;
    } catch (e) {
      console.error(e);
      const fallback = computeDefaultInvoiceNo();
      setInvoiceNo(fallback);
      return fallback;
    }
  }, [companyId, stateId, branchId, invoiceDate, computeDefaultInvoiceNo]);

  const loadNextInvoiceNo = fetchNextInvoiceNo;

  useEffect(() => {
    if (mode === "ENTRY") loadNextInvoiceNo();
  }, [loadNextInvoiceNo, mode]);

  // ✅ Add line, but merge qty if same product already exists
  function addLineFromRow(row) {
    const price = toNum(row.sale_price || row.mrp || 0);
    if (!price || price <= 0) {
      setError(`No sale price/MRP set for product ${row.product_id} at this branch`);
      setStatus(null);
      return;
    }

    setLines((prev) => {
      const pid = row.product_id;
      const idx = prev.findIndex((x) => x.product_id === pid);

      // Merge qty
      if (idx >= 0) {
        const copy = [...prev];
        const cur = copy[idx];
        const nextQty = toNum(cur.quantity) + 1;
        copy[idx] = computeLineAmounts({ ...cur, quantity: nextQty }, invoiceDiscountPct, isIGST);
        return copy;
      }

      // Add new line
      const base = {
        tempId: makeTempId(),
        product_id: row.product_id,
        product_name: row.product_name,
        barcode: row.barcode || null,
        quantity: 1,
        uom: "PCS",
        unit_price: price,
        mrp: row.mrp || null,
        discount_pct: toNum(row.discount_pct || 0),
        cgst_rate: toNum(row.cgst_rate || 0),
        sgst_rate: toNum(row.sgst_rate || 0),
      };

      return [...prev, computeLineAmounts(base, invoiceDiscountPct, isIGST)];
    });
  }

  /* ---------- HOLD / DRAFTS ---------- */
  const DRAFTS_KEY = "rengaa_billing_drafts_v3";

  const [drafts, setDrafts] = useState(() => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  const [draftIdx, setDraftIdx] = useState(() => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) && arr.length ? 0 : -1;
    } catch {
      return -1;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    } catch {}
  }, [drafts]);

  function makeDraftSnapshot() {
    return {
      mode,
      loadedSalesId,
      loadedInvStatus,
      loadStatus,

      invoiceDate,
      invoiceNo,
      paymentMode,
      isIGST,
      invoiceDiscountPct,

      clientId,
      customerName,
      customerPhone,
      customerEmail,
      clientAddr,
      deliveryAddr,

      clientSearch,
      remarks,
      paidAmount,
      lines,

      lastSaved,
      docType,

      _savedAt: new Date().toISOString(),
    };
  }

  function applyDraftSnapshot(d, idxForStatus = null) {
    const snap = d || {};

    setMode(snap.mode || "ENTRY");
    setLoadedSalesId(snap.loadedSalesId || null);
    setLoadedInvStatus(snap.loadedInvStatus || null);
    setLoadStatus(snap.loadStatus || "ACTIVE");

    setInvoiceDate(snap.invoiceDate || new Date().toISOString().slice(0, 10));
    setInvoiceNo(snap.invoiceNo || "");
    setPaymentMode(snap.paymentMode || "CASH");
    setIsIGST(!!snap.isIGST);
    setInvoiceDiscountPct(snap.invoiceDiscountPct ?? "");

    setClientId(snap.clientId || "");
    setCustomerName(snap.customerName || "Walk-in");
    setCustomerPhone(snap.customerPhone || "");
    setCustomerEmail(snap.customerEmail || "");
    setClientAddr(snap.clientAddr || "");
    setDeliveryAddr(snap.deliveryAddr || "");

    setClientSearch(snap.clientSearch || "");
    setClientOptions([]);

    setRemarks(snap.remarks || "");
    setPaidAmount(snap.paidAmount ?? 0);

    const rawLines = Array.isArray(snap.lines) ? snap.lines : [];
    setLines(
      rawLines.map((l) =>
        computeLineAmounts({ ...l, uom: l.uom || "PCS" }, snap.invoiceDiscountPct ?? "", !!snap.isIGST)
      )
    );

    setLastSaved(snap.lastSaved || null);
    setDocType(snap.docType || "INVOICE");

    setBarcode("");
    setManualProductId("");
    focusScanIfAllowed();

    setError(null);
    setStatus(idxForStatus != null ? `Loaded hold ${idxForStatus + 1}` : "Loaded hold");
  }

  function saveCurrentIntoDrafts(idxToSave) {
    const snap = makeDraftSnapshot();
    setDrafts((prev) => {
      const next = [...prev];
      if (idxToSave >= 0 && idxToSave < next.length) next[idxToSave] = snap;
      else next.push(snap);
      return next;
    });
  }

  async function startHoldSystemIfEmpty() {
    if (drafts.length === 0 || draftIdx < 0) {
      const first = makeDraftSnapshot();
      setDrafts([first]);
      setDraftIdx(0);
      setStatus("Hold created (1)");
      return true;
    }
    return false;
  }

  async function newBlankInvoice() {
    setMode("ENTRY");
    setLoadedSalesId(null);
    setLoadedInvStatus(null);
    setLastSaved(null);

    setLines([]);
    setStatus("New invoice");
    setError(null);

    setBarcode("");
    setManualProductId("");

    setClientId("");
    setCustomerName("Walk-in");
    setCustomerPhone("");
    setCustomerEmail("");
    setClientAddr("");
    setDeliveryAddr("");
    setClientSearch("");
    setClientOptions([]);

    setPaidAmount(0);
    setInvoiceDiscountPct("");
    setRemarks("");
    setIsIGST(false);

    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    } catch {}
    setPdfUrl("");
    setPdfFile(null);
    setPdfMeta(null);

    await loadNextInvoiceNo();
    focusScanIfAllowed();
  }

  async function goNextDraft() {
    const created = await startHoldSystemIfEmpty();
    if (created) return;

    saveCurrentIntoDrafts(draftIdx);

    const nextIdx = draftIdx + 1;

    if (nextIdx < drafts.length) {
      setDraftIdx(nextIdx);
      applyDraftSnapshot(drafts[nextIdx], nextIdx);
      return;
    }

    const blank = {
      mode: "ENTRY",
      loadedSalesId: null,
      invoiceDate,
      lines: [],
      _savedAt: new Date().toISOString(),
    };

    setDrafts((prev) => [...prev, blank]);
    setDraftIdx(nextIdx);

    await newBlankInvoice();
    setStatus(`New hold ${nextIdx + 1}`);
  }

  async function goPrevDraft() {
    if (draftIdx < 0) return;

    saveCurrentIntoDrafts(draftIdx);

    const prevIdx = Math.max(0, draftIdx - 1);
    setDraftIdx(prevIdx);

    const d = drafts[prevIdx];
    if (d) applyDraftSnapshot(d, prevIdx);
  }

  async function closeCurrentHold() {
    if (draftIdx < 0) return;

    const ok = window.confirm(`Close hold ${draftIdx + 1}? This will remove it from Hold list.`);
    if (!ok) return;

    setDrafts((prev) => prev.filter((_, i) => i !== draftIdx));

    const nextIdx = Math.max(0, draftIdx - 1);

    setTimeout(async () => {
      setDraftIdx(nextIdx);

      if (drafts.length <= 1) {
        setDraftIdx(-1);
        await newBlankInvoice();
        setStatus("All holds closed. Back to new invoice.");
        return;
      }

      const remaining = drafts.filter((_, i) => i !== draftIdx);
      const d = remaining[nextIdx];
      if (d) applyDraftSnapshot(d, nextIdx);
      else await newBlankInvoice();
      setStatus(`Closed hold. Now on hold ${nextIdx + 1}`);
    }, 0);
  }

  function clearItemsOnly() {
    setLines([]);
    setBarcode("");
    setManualProductId("");
    focusScanIfAllowed();
    setStatus("Cleared items (header kept)");
    setError(null);

    // If user changes items after save, invoice becomes "dirty" for actions (must save again)
    if (mode === "ENTRY") setLastSaved(null);
  }

  const keyHandlersRef = useRef({});
  useEffect(() => {
    keyHandlersRef.current = { goPrevDraft, goNextDraft, clearItemsOnly, closeCurrentHold };
  });

  useEffect(() => {
    function onKeyDownCapture(e) {
      const k = e.key;

      if (e.altKey && k === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        keyHandlersRef.current.goPrevDraft?.();
        return;
      }
      if (e.altKey && k === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        keyHandlersRef.current.goNextDraft?.();
        return;
      }

      if (k === "F1") {
        e.preventDefault();
        e.stopPropagation();
        keyHandlersRef.current.goPrevDraft?.();
      } else if (k === "F2") {
        e.preventDefault();
        e.stopPropagation();
        keyHandlersRef.current.goNextDraft?.();
      } else if (k === "F3") {
        e.preventDefault();
        e.stopPropagation();
        keyHandlersRef.current.clearItemsOnly?.();
      } else if (k === "F4") {
        e.preventDefault();
        e.stopPropagation();
        keyHandlersRef.current.closeCurrentHold?.();
      }
    }

    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, []);

  /* ---------- Scan by barcode ---------- */
  async function handleScanCode(codeRaw) {
    const code = (codeRaw || "").trim();
    if (!code) return;

    if (!companyId || !stateId || !branchId) {
      setError("Branch context missing. Please login & select branch.");
      return;
    }

    setStatus(`Scanning: ${code}`);
    setError(null);

    try {
      const { data: codeData, error: codeErr } = await supabase.rpc("pos_lookup_product_by_barcode", {
        p_company_id: companyId,
        p_state_id: stateId,
        p_branch_id: branchId,
        p_barcode: code,
      });

      if (codeErr) {
        console.error(codeErr);
        setError(`Barcode lookup error: ${codeErr.message}`);
        setStatus(null);
        return;
      }

      if (!codeData || !Array.isArray(codeData) || codeData.length === 0) {
        setError(`Product not found for barcode ${code}`);
        setStatus(null);
        return;
      }

      const productId = codeData[0]?.product_id;
      if (!productId) {
        setError("Barcode function did not return a product_id.");
        setStatus(null);
        return;
      }

      const { data, error } = await supabase.rpc("pos_lookup_product_by_id", {
        p_company_id: companyId,
        p_state_id: stateId,
        p_branch_id: branchId,
        p_product_id: productId,
      });

      if (error) {
        console.error(error);
        setError(`Product lookup error: ${error.message}`);
        setStatus(null);
        return;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        setError(`Product not found for product_id ${productId}`);
        setStatus(null);
        return;
      }

      addLineFromRow(data[0]);
      setStatus(`Added product ${data[0].product_name}`);

      // After modifying invoice, ENTRY invoice is dirty => must save again to share/print
      if (mode === "ENTRY") setLastSaved(null);
    } catch (e) {
      console.error(e);
      setError(e.message || "Unknown error in barcode lookup.");
      setStatus(null);
    } finally {
      setBarcode("");
      focusScanIfAllowed();
    }
  }

  async function handleAddByProductId() {
    if (!manualProductId) return;
    if (!companyId || !stateId || !branchId) {
      setError("Branch context missing. Please login & select branch.");
      return;
    }

    setStatus(`Searching product ${manualProductId}`);
    setError(null);

    try {
      const { data, error } = await supabase.rpc("pos_lookup_product_by_id", {
        p_company_id: companyId,
        p_state_id: stateId,
        p_branch_id: branchId,
        p_product_id: manualProductId,
      });

      if (error) {
        console.error(error);
        setError(`Lookup error: ${error.message}`);
        setStatus(null);
        return;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        setError(`Product not found for product_id ${manualProductId}`);
        setStatus(null);
        return;
      }

      addLineFromRow(data[0]);
      setStatus(`Added product ${data[0].product_name}`);
      setManualProductId("");

      if (mode === "ENTRY") setLastSaved(null);
    } catch (e) {
      console.error(e);
      setError(e.message || "Unknown error in manual product lookup.");
      setStatus(null);
    }
  }

  /* ---------- Client search/pick ---------- */
  async function handleClientSearch() {
    if (!clientSearch) {
      setClientOptions([]);
      return;
    }

    setStatus(`Searching clients for "${clientSearch}"...`);
    setError(null);

    try {
      const { data, error } = await supabase.rpc("pos_lookup_client_by_name", {
        p_search: clientSearch,
      });

      if (error) {
        console.error(error);
        setError(`Client search error: ${error.message}`);
        setClientOptions([]);
        setStatus(null);
        return;
      }

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      setClientOptions(rows);
      setStatus(rows.length ? `Found ${rows.length} client(s).` : "No matching clients.");
    } catch (e) {
      console.error(e);
      setError(e.message || "Unknown error in client search.");
      setStatus(null);
      setClientOptions([]);
    }
  }

  function buildAddrText(c) {
    const parts = [c.address_line1, c.address_line2, c.city, c.state_name, c.pincode].filter(Boolean);
    return parts.join(", ");
  }

  function buildDeliveryAddrText(c) {
    // ✅ prefer delivery fields, else normal address
    const dParts = [c.delivery_address_line1, c.delivery_address_line2, c.delivery_city, c.delivery_pincode].filter(Boolean);
    if (dParts.length) return dParts.join(", ");
    return buildAddrText(c);
  }

  function handleClientPick(c) {
    setClientId(safeTrim(c.client_id) || "");
    setCustomerName(safeTrim(c.client_name) || "");
    setCustomerPhone(safeTrim(c.phone) || "");
    setCustomerEmail(safeTrim(c.email) || "");
    setClientAddr(buildAddrText(c));
    setDeliveryAddr(buildDeliveryAddrText(c));
    setClientSearch(safeTrim(c.client_name) || "");
    setClientOptions([]);

    const flag = !!c.is_igst;
    setIsIGST(flag);
    setLines((prev) => prev.map((l) => computeLineAmounts(l, invoiceDiscountPct, flag)));

    if (mode === "ENTRY") setLastSaved(null);

    setStatus(`Client selected: ${c.client_id} - ${c.client_name}` + (flag ? " (IGST)" : ""));
  }

  /* ---------- Line ops ---------- */
  function updateLine(id, patch) {
    setLines((prev) =>
      prev.map((l) => (l.tempId === id ? computeLineAmounts({ ...l, ...patch }, invoiceDiscountPct, isIGST) : l))
    );
    if (mode === "ENTRY") setLastSaved(null);
  }

  function removeLine(id) {
    setLines((prev) => prev.filter((l) => l.tempId !== id));
    if (mode === "ENTRY") setLastSaved(null);
  }

  async function resetAfterSaveOrUpdate(message) {
    setStatus(message || null);
    setError(null);

    setMode("ENTRY");
    setLoadedSalesId(null);
    setLoadedInvStatus(null);
    setLastSaved(null);

    setLines([]);
    setBarcode("");
    setManualProductId("");

    setClientId("");
    setCustomerName("Walk-in");
    setCustomerPhone("");
    setCustomerEmail("");
    setClientAddr("");
    setDeliveryAddr("");
    setClientSearch("");
    setClientOptions([]);

    setPaidAmount(0);
    setInvoiceDiscountPct("");
    setRemarks("");
    setIsIGST(false);

    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    } catch {}
    setPdfUrl("");
    setPdfFile(null);
    setPdfMeta(null);

    await loadNextInvoiceNo();
    focusScanIfAllowed();
  }

  function clearAllInvoice() {
    setMode("ENTRY");
    setLoadedSalesId(null);
    setLoadedInvStatus(null);
    setLastSaved(null);

    setLines([]);
    setStatus(null);
    setError(null);
    setBarcode("");
    setManualProductId("");

    setClientId("");
    setCustomerName("Walk-in");
    setCustomerPhone("");
    setCustomerEmail("");
    setClientAddr("");
    setDeliveryAddr("");
    setClientSearch("");
    setClientOptions([]);

    setPaidAmount(0);
    setInvoiceDiscountPct("");
    setRemarks("");
    setIsIGST(false);

    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    } catch {}
    setPdfUrl("");
    setPdfFile(null);
    setPdfMeta(null);

    loadNextInvoiceNo();
    focusScanIfAllowed();
  }

  /* ---------- Payload builders ---------- */
  function buildPayloadBase() {
    return {
      company_id: companyId,
      state_id: stateId,
      branch_id: branchId,

      is_igst: !!isIGST,

      client_id: clientId || null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      payment_mode: paymentMode,

      created_by: createdBy,
      updated_by: createdBy,

      remarks: (remarks || "").trim() ? remarks.trim() : null,

      // totals from UI
      gross_amount: totals.gross,
      discount_amount: totals.discount,
      taxable_amount: totals.taxable,
      cgst_amount: totals.cgst,
      sgst_amount: totals.sgst,
      igst_amount: totals.igst,
      tax_amount: totals.gst,
      net_amount: totals.net,
      paid_amount: toNum(paidAmount),
      balance_amount: balanceAmount,

      items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: toNum(l.quantity),
        uom: l.uom || "PCS",
        unit_price: toNum(l.unit_price),
        mrp: l.mrp ?? null,

        discount_pct: toNum(l.discount_pct),
        gross_amount: toNum(l.gross_amount),
        discount_amount: toNum(l.discount_amount),
        taxable_amount: toNum(l.taxable_amount),

        cgst_amount: toNum(l.cgst_amount),
        sgst_amount: toNum(l.sgst_amount),
        igst_amount: toNum(l.igst_amount),

        tax_amount: toNum(l.tax_amount),
        line_total: toNum(l.line_total),
      })),
    };
  }

  function buildCreatePayload() {
    return {
      ...buildPayloadBase(),
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
    };
  }

  function buildUpdatePayload() {
    return buildPayloadBase();
  }

  /* ---------- ENTRY save ---------- */
  async function handleSaveNew() {
    if (lines.length === 0) return setError("No items to save.");
    if (!companyId || !stateId || !branchId) return setError("Branch context missing.");
    if (!invoiceNo) return setError("Invoice No is empty.");
    if (!invoiceDate) return setError("Invoice Date is empty.");

    setSaving(true);
    setError(null);
    setStatus("Saving bill...");

    const payload = buildCreatePayload();

    const { data, error } = await supabase.rpc("pos_create_sales_invoice", { p_data: payload });

    setSaving(false);

    if (error) {
      console.error(error);
      setError(error.message || "Error saving sales invoice.");
      setStatus(null);
      return null;
    }

    // ✅ After saving, lock actions to saved invoice identity
    const savedId = data;
    setLastSaved({
      sales_id: savedId,
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      status: "ACTIVE",
      savedAtISO: new Date().toISOString(),
    });

    setStatus(`Saved bill. sales_id: ${savedId}`);
    setError(null);

    // Keep the invoice on screen after save? (You previously reset after save)
    // You wanted consistency: print/share/download should use saved one.
    // We'll reset to next invoice for speed, but saved state stays for actions if you want.
    // ✅ Better: after save, reset form (like before), but actions are for the saved invoice only.
    await resetAfterSaveOrUpdate(`Saved bill. sales_id: ${savedId}`);
    return savedId;
  }

  /* ---------- Load for edit/delete ---------- */
  async function handleLoadForEditOrDelete() {
    if (!companyId || !stateId || !branchId) return setError("Branch context missing.");
    if (!invoiceDate || !invoiceNo) return setError("Please enter Invoice Date and Invoice No.");

    setError(null);
    setStatus("Loading invoice...");
    setSaving(true);

    try {
      const { data, error } = await supabase.rpc("pos_get_sales_invoice_by_no", {
        p_company_id: companyId,
        p_state_id: stateId,
        p_branch_id: branchId,
        p_invoice_date: invoiceDate,
        p_invoice_no: invoiceNo,
        p_status: loadStatus,
      });

      setSaving(false);

      if (error) {
        console.error(error);
        setError(error.message || "Load RPC error.");
        setStatus(null);
        return;
      }

      const obj = data && typeof data === "object" ? data : null;
      const header = obj?.header || obj || null;
      const items = obj?.items || [];

      const sid = obj?.sales_id || header?.sales_id || null;
      setLoadedSalesId(sid);

      const invStatus = (header?.status || obj?.status || "ACTIVE").toUpperCase();
      setLoadedInvStatus(invStatus);

      if (header?.invoice_date) setInvoiceDate(String(header.invoice_date).slice(0, 10));
      if (header?.invoice_no) setInvoiceNo(header.invoice_no);

      setPaymentMode(header?.payment_mode || "CASH");
      setIsIGST(!!header?.is_igst);
      setInvoiceDiscountPct(header?.invoice_discount_pct ?? "");

      const cid = header?.client_id ?? "";
      setClientId(typeof cid === "string" ? cid.trim() : cid || "");

      setCustomerName(header?.customer_name || "Walk-in");
      setCustomerPhone(header?.customer_phone || "");
      setRemarks(header?.remarks || "");
      setPaidAmount(header?.paid_amount ?? 0);

      // When loading, try to populate email/address from client table (optional)
      // If your header already has these fields, you can map them here.
      // Otherwise user can search and pick client again if needed.
      setCustomerEmail("");
      setClientAddr("");
      setDeliveryAddr("");

      const normalized = Array.isArray(items) ? items : [];
      const withTempIds = normalized.map((it) => ({
        tempId: makeTempId(),
        product_id: it.product_id,
        product_name: it.product_name || it.product_id,
        barcode: it.barcode || null,
        quantity: toNum(it.quantity),
        uom: it.uom || "PCS",
        unit_price: toNum(it.unit_price),
        mrp: it.mrp ?? null,
        discount_pct: toNum(it.discount_pct ?? 0),
        cgst_rate: toNum(it.cgst_rate ?? 0),
        sgst_rate: toNum(it.sgst_rate ?? 0),
      }));

      setLines(withTempIds.map((l) => computeLineAmounts(l, header?.invoice_discount_pct ?? "", !!header?.is_igst)));

      // ✅ Loaded invoice is already SAVED => allow pdf/share/print for it (even in EDIT mode)
      if (sid) {
        setLastSaved({
          sales_id: sid,
          invoice_no: header?.invoice_no || invoiceNo,
          invoice_date: String(header?.invoice_date || invoiceDate).slice(0, 10),
          status: invStatus,
          savedAtISO: new Date().toISOString(),
        });
      } else {
        setLastSaved(null);
      }

      setStatus(`Loaded ${invStatus} invoice ${header?.invoice_no || invoiceNo} ${sid ? `(sales_id ${sid})` : ""}`);
      focusScanIfAllowed();
    } catch (e) {
      setSaving(false);
      console.error(e);
      setError(e.message || "Load failed.");
      setStatus(null);
    }
  }

  async function handleUpdate() {
    if (mode !== "EDIT") return;
    if (!loadedSalesId) return setError("No loaded sales_id. Load invoice first.");
    if (lines.length === 0) return setError("No items to update.");
    if (loadedInvStatus === "DELETED")
      return setError("Deleted invoice cannot be updated. Only Duplicate is allowed.");

    setSaving(true);
    setError(null);
    setStatus("Updating invoice...");

    const payload = buildUpdatePayload();

    try {
      const { data, error } = await supabase.rpc("pos_update_sales_invoice", {
        p_sales_id: loadedSalesId,
        p_data: payload,
      });

      setSaving(false);

      if (error) {
        console.error(error);
        setError(error.message || "Update RPC error.");
        setStatus(null);
        return;
      }

      // ✅ After update, it is saved
      setLastSaved({
        sales_id: loadedSalesId,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        status: "ACTIVE",
        savedAtISO: new Date().toISOString(),
      });

      await resetAfterSaveOrUpdate(`Updated invoice ${invoiceNo}. result: ${typeof data === "string" ? data : "OK"}`);
    } catch (e) {
      setSaving(false);
      console.error(e);
      setError(e.message || "Update failed.");
      setStatus(null);
    }
  }

  async function handleDelete() {
    if (mode !== "DELETE") return;
    if (!invoiceDate || !invoiceNo) return setError("Enter Invoice Date and Invoice No.");
    if (!companyId || !stateId || !branchId) return setError("Branch context missing.");
    if (loadedInvStatus === "DELETED") return setError("Invoice already deleted.");

    const ok = window.confirm(`Delete invoice ${invoiceNo} dated ${invoiceDate}? This cannot be undone.`);
    if (!ok) return;

    setSaving(true);
    setError(null);
    setStatus("Deleting invoice...");

    try {
      const { data, error } = await supabase.rpc("pos_delete_sales_invoice_by_no", {
        p_company_id: companyId,
        p_state_id: stateId,
        p_branch_id: branchId,
        p_invoice_date: invoiceDate,
        p_invoice_no: invoiceNo,
        p_updated_by: createdBy,
      });

      setSaving(false);

      if (error) {
        console.error(error);
        setError(error.message || "Delete RPC error.");
        setStatus(null);
        return;
      }

      await resetAfterSaveOrUpdate(`Deleted invoice ${invoiceNo}. (${data || "OK"})`);
    } catch (e) {
      setSaving(false);
      console.error(e);
      setError(e.message || "Delete failed.");
      setStatus(null);
    }
  }

  // Duplicate = PREPARE ONLY (do not save). Keep items + header, only new invoice no.
  async function handleDuplicate() {
    if (!loadedSalesId) return setError("Load an invoice first to duplicate.");
    if (lines.length === 0) return setError("Loaded invoice has no items to duplicate.");

    const ok = window.confirm(
      `Duplicate invoice ${invoiceNo}?\n\nThis will ONLY create a new Invoice No on screen.\nPress "Save Bill" to save it.`
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    setStatus("Preparing duplicate...");

    try {
      const nextNo = await fetchNextInvoiceNo();
      if (!nextNo) {
        setSaving(false);
        setError("Could not generate next invoice number.");
        setStatus(null);
        return;
      }

      setMode("ENTRY");
      setLoadedSalesId(null);
      setLoadedInvStatus(null);
      setLastSaved(null); // new unsaved copy

      setInvoiceNo(nextNo);

      setSaving(false);
      setStatus(`Duplicate prepared. New invoice_no: ${nextNo}. Now press "Save Bill" to save.`);
      focusScanIfAllowed();
    } catch (e) {
      setSaving(false);
      console.error(e);
      setError(e.message || "Duplicate prepare failed.");
      setStatus(null);
    }
  }

  /* ---------- Saved-lock rules ---------- */
  const isSavedForActions = useMemo(() => {
    // Loaded invoices: lastSaved is set when loaded
    if (lastSaved?.sales_id && lastSaved?.invoice_no && lastSaved?.invoice_date) return true;
    return false;
  }, [lastSaved]);

  function ensureSavedOrExplain() {
    if (!isSavedForActions) {
      setError("Please SAVE the invoice first. Only saved invoices can be Preview/Download/Print/Share.");
      setStatus(null);
      return false;
    }
    if ((lastSaved?.status || "").toUpperCase() === "DELETED") {
      // You can decide if you want to allow preview/print of deleted invoices.
      // We'll allow preview/download, but show warning.
      setStatus("Note: This invoice is DELETED.");
    }
    return true;
  }

  /* ---------- PDF / Print / Share helpers ---------- */
  function fmt2(n) {
    return round2(toNum(n)).toFixed(2);
  }

  function buildInvoiceTitle() {
    const invNo = lastSaved?.invoice_no || invoiceNo;
    const invDt = lastSaved?.invoice_date || invoiceDate;
    return `${docType === "DO" ? "Delivery Order" : "Invoice"} ${invNo} (${invDt})`;
  }

  function buildWhatsappText() {
    const invNo = lastSaved?.invoice_no || invoiceNo;
    const invDt = lastSaved?.invoice_date || invoiceDate;
    const party = (customerName || "Walk-in").trim();
    return [
      `Rengaa POS ${docType === "DO" ? "Delivery Order" : "Invoice"}`,
      `Invoice No: ${invNo}`,
      `Date: ${invDt}`,
      `Customer: ${party}`,
      customerPhone ? `Phone: ${customerPhone}` : "",
      docType === "DO" ? "" : `Net: ${fmt2(totals.net)}`,
      docType === "DO" ? "" : `Paid: ${fmt2(paidAmount)}`,
      docType === "DO" ? "" : `Balance: ${fmt2(balanceAmount)}`,
      docType === "DO" ? `Delivery Address: ${deliveryAddr || clientAddr || "-"}` : "",
      "",
      `Note: Please attach the PDF manually if WhatsApp doesn’t attach automatically.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function normalizeWhatsappPhone(phoneRaw) {
    return String(phoneRaw || "").replace(/\D/g, "");
  }

  function getBranchText() {
    return `${String(companyId || "").trim()}-${String(stateId || "").trim()}-${String(branchId || "").trim()}`;
  }

  function generatePdfBlob(whichDoc) {
    const useDoc = whichDoc || docType;

    // ✅ enforce saved rule
    if (!ensureSavedOrExplain()) throw new Error("Invoice not saved.");

    const invNo = lastSaved?.invoice_no || invoiceNo;
    const invDt = lastSaved?.invoice_date || invoiceDate;

    if (!invNo || !invDt) throw new Error("Invoice No/Date missing");
    if (!lines.length) throw new Error("No items");

    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const branchText = getBranchText();
    const party = (customerName || "Walk-in").trim();
    const delAddr = (deliveryAddr || clientAddr || "").trim();

    // Header
    doc.setFontSize(14);
    doc.text(companyName, 14, 14);

    doc.setFontSize(9);
    if (companyAddr) doc.text(companyAddr, 14, 18);
    const gstLine = companyGST ? `GST: ${companyGST}` : "";
    const phoneLine = companyPhone ? `Ph: ${companyPhone}` : "";
    const emailLine = companyEmail ? `Email: ${companyEmail}` : "";
    const contactLine = [gstLine, phoneLine, emailLine].filter(Boolean).join("   |   ");
    if (contactLine) doc.text(contactLine, 14, 22);

    doc.setFontSize(11);
    doc.text(useDoc === "DO" ? "DELIVERY ORDER" : "TAX INVOICE", 150, 14);

    doc.setFontSize(10);
    doc.text(`Branch: ${branchText}`, 14, 28);
    doc.text(`No: ${invNo}`, 14, 34);
    doc.text(`Date: ${invDt}`, 80, 34);

    if (useDoc !== "DO") {
      doc.text(`Payment: ${paymentMode}`, 140, 34);
      doc.text(`Tax Mode: ${isIGST ? "IGST" : "GST"}`, 140, 28);
    }

    doc.text(`Customer: ${party}`, 14, 40);
    if (customerPhone) doc.text(`Phone: ${customerPhone}`, 140, 40);

    if (useDoc === "DO") {
      doc.setFontSize(9);
      doc.text(`Delivery Address: ${delAddr || "-"}`, 14, 46);
    }

    const startY = useDoc === "DO" ? 52 : 46;

    if (useDoc === "DO") {
      // Delivery Order table (no tax columns)
      const body = lines.map((l, idx) => [
        String(idx + 1),
        `${l.product_name}\n(${l.product_id})`,
        String(toNum(l.quantity)),
        l.uom || "PCS",
      ]);

      autoTable(doc, {
        startY,
        head: [["#", "Product", "Qty", "UOM"]],
        body,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 118 },
          2: { halign: "right", cellWidth: 18 },
          3: { cellWidth: 18 },
        },
      });

      const y = (doc.lastAutoTable?.finalY || startY) + 10;
      doc.setFontSize(10);
      doc.text(`Total Items: ${lines.length}`, 14, y);
      doc.text(
        `Total Qty: ${lines.reduce((a, l) => a + toNum(l.quantity), 0)}`,
        140,
        y
      );

      const y2 = y + 10;
      doc.setFontSize(9);
      doc.text("Receiver Signature:", 14, y2);
      doc.text("Prepared By:", 140, y2);

      if ((remarks || "").trim()) {
        doc.setFontSize(9);
        doc.text(`Remarks: ${remarks.trim()}`, 14, y2 + 10);
      }
    } else {
      // Invoice table (with tax)
      const body = lines.map((l, idx) => [
        String(idx + 1),
        `${l.product_name}\n(${l.product_id})`,
        String(toNum(l.quantity)),
        fmt2(l.unit_price),
        fmt2(l.gross_amount),
        fmt2(l.discount_amount),
        fmt2(l.tax_amount),
        fmt2(l.line_total),
      ]);

      autoTable(doc, {
        startY,
        head: [["#", "Product", "Qty", "Rate", "Gross", "Disc", "GST", "Total"]],
        body,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 7 },
          1: { cellWidth: 68 },
          2: { halign: "right", cellWidth: 12 },
          3: { halign: "right", cellWidth: 16 },
          4: { halign: "right", cellWidth: 16 },
          5: { halign: "right", cellWidth: 16 },
          6: { halign: "right", cellWidth: 16 },
          7: { halign: "right", cellWidth: 16 },
        },
      });

      const y = (doc.lastAutoTable?.finalY || startY) + 8;

      doc.setFontSize(10);
      doc.text(`Gross: ${fmt2(totals.gross)}`, 140, y);
      doc.text(`Discount: ${fmt2(totals.discount)}`, 140, y + 6);
      doc.text(`Taxable: ${fmt2(totals.taxable)}`, 140, y + 12);
      doc.text(`GST: ${fmt2(totals.gst)}`, 140, y + 18);

      doc.setFontSize(12);
      doc.text(`NET: ${fmt2(totals.net)}`, 140, y + 26);

      doc.setFontSize(10);
      doc.text(`Paid: ${fmt2(paidAmount)}`, 14, y + 18);
      doc.text(`Balance: ${fmt2(balanceAmount)}`, 14, y + 24);

      if ((remarks || "").trim()) {
        doc.setFontSize(9);
        doc.text(`Remarks: ${remarks.trim()}`, 14, y + 32);
      }
    }

    const pdfBlob = doc.output("blob");
    return pdfBlob;
  }

  async function buildPdfPreview(whichDoc) {
    const useDoc = whichDoc || docType;

    // saved rule checked inside generatePdfBlob too
    const blob = generatePdfBlob(useDoc);

    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    } catch {}

    const url = URL.createObjectURL(blob);
    setPdfUrl(url);

    const invNo = lastSaved?.invoice_no || invoiceNo;
    const fileName = `${useDoc === "DO" ? "DO" : "INV"}_${invNo}.pdf`;

    const file = new File([blob], fileName, { type: "application/pdf" });
    setPdfFile(file);

    setPdfMeta({
      docType: useDoc,
      invoiceNo: lastSaved?.invoice_no || invoiceNo,
      invoiceDate: lastSaved?.invoice_date || invoiceDate,
      salesId: lastSaved?.sales_id || null,
    });

    return { blob, url, file };
  }

  async function onPreviewPdf(whichDoc) {
    try {
      if (!ensureSavedOrExplain()) return;
      await buildPdfPreview(whichDoc);
      setStatus("PDF ready (preview below).");
      setError(null);
    } catch (e) {
      setError(e.message || "PDF error");
      setStatus(null);
    }
  }

  async function onDownloadPdf(whichDoc) {
    try {
      if (!ensureSavedOrExplain()) return;
      const { url } = await buildPdfPreview(whichDoc);
      const useDoc = whichDoc || docType;
      const invNo = lastSaved?.invoice_no || invoiceNo;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${useDoc === "DO" ? "DO" : "INV"}_${invNo}.pdf`;
      a.click();
      setStatus("PDF downloaded.");
      setError(null);
    } catch (e) {
      setError(e.message || "Download failed");
      setStatus(null);
    }
  }

  async function onPrintPdf(whichDoc) {
    try {
      if (!ensureSavedOrExplain()) return;
      const { url } = await buildPdfPreview(whichDoc);
      const w = window.open(url, "_blank");
      if (!w) {
        setError("Popup blocked. Allow popups for printing.");
        setStatus(null);
        return;
      }
      const t = setInterval(() => {
        try {
          w.focus();
          w.print();
          clearInterval(t);
        } catch {}
      }, 400);
      setStatus("Print opened.");
      setError(null);
    } catch (e) {
      setError(e.message || "Print failed");
      setStatus(null);
    }
  }

  async function onShareWhatsapp() {
    try {
      if (!ensureSavedOrExplain()) return;

      await buildPdfPreview(docType);
      const text = buildWhatsappText();

      // Web Share API (works best on phones; on Windows sometimes works if browser supports files)
      if (navigator.share && pdfFile) {
        try {
          await navigator.share({
            title: buildInvoiceTitle(),
            text,
            files: [pdfFile],
          });
          setStatus("Shared.");
          setError(null);
          return;
        } catch {
          // fallback below
        }
      }

      const digits = normalizeWhatsappPhone(customerPhone);
      const waUrl = digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
        : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;

      window.open(waUrl, "_blank");
      setStatus("WhatsApp opened with message. Attach PDF manually.");
      setError(null);
    } catch (e) {
      setError(e.message || "Share failed");
      setStatus(null);
    }
  }

  async function onShareEmailGmail() {
    try {
      if (!ensureSavedOrExplain()) return;

      // build PDF so user can attach manually
      await buildPdfPreview(docType);

      const to = (customerEmail || "").trim();
      const invNo = lastSaved?.invoice_no || invoiceNo;
      const invDt = lastSaved?.invoice_date || invoiceDate;
      const party = (customerName || "Walk-in").trim();

      const subject =
        docType === "DO"
          ? `Delivery Order ${invNo} - ${party}`
          : `Invoice ${invNo} - ${party}`;

      const bodyLines = [
        `Dear ${party},`,
        "",
        docType === "DO"
          ? `Please find the Delivery Order details below.`
          : `Please find the invoice details below.`,
        "",
        `No: ${invNo}`,
        `Date: ${invDt}`,
        customerPhone ? `Phone: ${customerPhone}` : "",
        docType === "DO" ? "" : `Net: ${fmt2(totals.net)}`,
        docType === "DO" ? "" : `Paid: ${fmt2(paidAmount)}`,
        docType === "DO" ? "" : `Balance: ${fmt2(balanceAmount)}`,
        docType === "DO" ? `Delivery Address: ${deliveryAddr || clientAddr || "-"}` : "",
        "",
        `IMPORTANT: Please attach the PDF manually from your computer.`,
        `File name: ${docType === "DO" ? "DO" : "INV"}_${invNo}.pdf`,
        "",
        `Thanks,`,
        `${companyName}`,
        companyPhone ? `Ph: ${companyPhone}` : "",
        companyGST ? `GST: ${companyGST}` : "",
      ].filter(Boolean);

      const body = bodyLines.join("\n");

      // Gmail web compose
      const gmailUrl =
        "https://mail.google.com/mail/?view=cm&fs=1" +
        `&to=${encodeURIComponent(to)}` +
        `&su=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;

      window.open(gmailUrl, "_blank");
      setStatus("Gmail compose opened. Attach the PDF manually (from Download/Preview).");
      setError(null);
    } catch (e) {
      setError(e.message || "Email failed");
      setStatus(null);
    }
  }

  /* ---------- UI helpers ---------- */
  const isEditOrDelete = mode === "EDIT" || mode === "DELETE";

  function ActionGuard({ children }) {
    // Just a helper wrapper if you want later; currently not used
    return children;
  }

  /* -------------------- render -------------------- */
  return (
    <div style={{ padding: "16px", maxWidth: "1100px", margin: "0 auto" }}>
      <h2 style={{ marginBottom: "6px" }}>Billing (Sales)</h2>

      {/* Sticky Hold Bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#fff",
          padding: "8px 10px",
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "#333" }}>
          <b>Hold:</b>{" "}
          {draftIdx >= 0 ? (
            <>
              <b style={{ fontSize: 13 }}>{draftIdx + 1}</b> / {drafts.length}
            </>
          ) : (
            "-"
          )}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <span style={{ color: "#666" }}>
            Keys: <b>F1</b> Prev, <b>F2</b> Next/New, <b>F3</b> Clear Items, <b>F4</b> Close Hold
            &nbsp; (Backup: <b>Alt+←</b>, <b>Alt+→</b>)
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => goPrevDraft()} style={btnStyle}>
            ◀ Prev Hold (F1)
          </button>
          <button type="button" onClick={() => goNextDraft()} style={btnStyle}>
            Next / New Hold (F2)
          </button>
          <button
            type="button"
            onClick={() => closeCurrentHold()}
            style={{ ...btnStyle, background: "#ffe4c7" }}
            disabled={draftIdx < 0}
            title="Remove this hold invoice from the list"
          >
            Close Hold (F4)
          </button>
        </div>
      </div>

      {/* MENU */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "10px",
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#fafafa",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <label style={labelStyle}>Menu</label>
          <select
            value={mode}
            onChange={(e) => {
              const m = e.target.value;
              setMode(m);
              setLoadedSalesId(null);
              setLoadedInvStatus(null);
              setLastSaved(null);
              setStatus(null);
              setError(null);
              if (m === "ENTRY") loadNextInvoiceNo();
            }}
            style={{ ...inputStyle, width: 220 }}
          >
            <option value="ENTRY">1. Entry</option>
            <option value="EDIT">2. Edit (Update)</option>
            <option value="DELETE">3. Delete</option>
          </select>
        </div>

        {isEditOrDelete && (
          <div>
            <label style={labelStyle}>Invoice Status</label>
            <select
              value={loadStatus}
              onChange={(e) => setLoadStatus(e.target.value)}
              style={{ ...inputStyle, width: 160 }}
              disabled={saving}
            >
              <option value="ACTIVE">Active</option>
              <option value="DELETED">Deleted</option>
            </select>
          </div>
        )}

        <div style={{ flex: 1, color: "#666", fontSize: 13, minWidth: 260 }}>
          {mode === "ENTRY" && "Entry: Create new invoice (must SAVE before PDF/Print/Share/Download/Email)"}
          {mode === "EDIT" && "Edit: Load by Date + Invoice No, then Update / Duplicate"}
          {mode === "DELETE" && "Delete: Load by Date + Invoice No, then Delete"}
          {loadedInvStatus ? (
            <span
              style={{
                marginLeft: 10,
                color: loadedInvStatus === "DELETED" ? "#a00" : "#0a0",
              }}
            >
              <b>Status:</b> {loadedInvStatus}
            </span>
          ) : null}
        </div>

        {isEditOrDelete && (
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <button type="button" onClick={handleLoadForEditOrDelete} style={btnStyle} disabled={saving}>
              Load
            </button>

            <button
              type="button"
              onClick={handleDuplicate}
              style={{ ...btnStyle, background: "#dff5ff" }}
              disabled={saving || !loadedSalesId}
              title="Prepare duplicate: new invoice no on screen, then Save Bill"
            >
              Duplicate
            </button>

            {mode === "EDIT" && (
              <button type="button" onClick={handleUpdate} style={btnStyle} disabled={saving || loadedInvStatus === "DELETED"}>
                Update
              </button>
            )}

            {mode === "DELETE" && (
              <button
                type="button"
                onClick={handleDelete}
                style={{ ...btnStyle, background: "#ffd6d6" }}
                disabled={saving || loadedInvStatus === "DELETED"}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "12px",
          marginBottom: "8px",
        }}
      >
        <div>
          <label style={labelStyle}>Invoice Date</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Invoice No (yymmddnnn)</label>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} style={inputStyle} placeholder="yymmddnnn" />
        </div>

        <div>
          <label style={labelStyle}>Tax Mode</label>
          <input readOnly value={isIGST ? "IGST (from client)" : "GST"} style={{ ...inputStyle, width: "180px", background: "#f4f4f4" }} />
        </div>

        <div>
          <label style={labelStyle}>Invoice Discount % (override)</label>
          <input
            type="number"
            step="0.1"
            value={invoiceDiscountPct}
            onChange={(e) => setInvoiceDiscountPct(e.target.value === "" ? "" : e.target.value)}
            style={discStyle}
            placeholder="(blank = item discount)"
            disabled={mode === "DELETE"}
          />
        </div>

        <div>
          <label style={labelStyle}>Client Search (Name)</label>
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClientSearch()}
              style={{ ...inputStyle, width: "100%" }}
              placeholder="Type partial name and press Enter/Search"
              disabled={mode === "DELETE"}
            />
            <button type="button" onClick={handleClientSearch} style={{ ...btnStyle, padding: "4px 10px", whiteSpace: "nowrap" }} disabled={mode === "DELETE"}>
              Search
            </button>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Client ID (selected)</label>
          <input value={clientId} readOnly style={{ ...inputStyle, background: "#f4f4f4" }} />
        </div>

        <div>
          <label style={labelStyle}>Client / Customer Name</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inputStyle} disabled={mode === "DELETE"} />
        </div>

        <div>
          <label style={labelStyle}>Phone No</label>
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={inputStyle} placeholder="Mobile" disabled={mode === "DELETE"} />
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={inputStyle} placeholder="customer email" disabled={mode === "DELETE"} />
        </div>

        <div>
          <label style={labelStyle}>Payment Mode</label>
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={inputStyle} disabled={mode === "DELETE"}>
            <option value="CASH">CASH</option>
            <option value="CARD">CARD</option>
            <option value="UPI">UPI</option>
            <option value="CREDIT">CREDIT</option>
            <option value="MIXED">MIXED</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Paid Amount</label>
          <input
            type="number"
            step="0.01"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            style={rateStyle}
            disabled={mode === "DELETE"}
          />
        </div>

        <div>
          <label style={labelStyle}>Balance</label>
          <input type="number" readOnly value={balanceAmount.toFixed(2)} style={{ ...rateStyle, background: "#f4f4f4" }} />
        </div>

        <div>
          <label style={labelStyle}>Created By</label>
          <input value={createdBy} readOnly style={{ ...inputStyle, background: "#f4f4f4" }} />
        </div>

        <div style={{ gridColumn: "span 4" }}>
          <label style={labelStyle}>Delivery Address (for DO)</label>
          <textarea
            value={deliveryAddr}
            onChange={(e) => {
              setDeliveryAddr(e.target.value);
              if (mode === "ENTRY") setLastSaved(null);
            }}
            placeholder="(Default comes from client delivery address or normal address)"
            style={{
              ...inputStyle,
              width: "100%",
              height: "46px",
              resize: "vertical",
              fontFamily: "inherit",
            }}
            disabled={mode === "DELETE"}
          />
        </div>

        <div style={{ gridColumn: "span 4" }}>
          <label style={labelStyle}>Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => {
              setRemarks(e.target.value);
              if (mode === "ENTRY") setLastSaved(null);
            }}
            placeholder="Any note for this invoice..."
            style={{
              ...inputStyle,
              width: "100%",
              height: "56px",
              resize: "vertical",
              fontFamily: "inherit",
            }}
            disabled={mode === "DELETE"}
          />
        </div>
      </div>

      {/* Client options */}
      {clientOptions.length > 0 && mode !== "DELETE" && (
        <div
          style={{
            marginBottom: "12px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            padding: "6px",
            maxHeight: "150px",
            overflowY: "auto",
            background: "#fff",
          }}
        >
          {clientOptions.map((c) => (
            <div
              key={c.client_id}
              onClick={() => handleClientPick(c)}
              style={{
                padding: "4px 6px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                <strong>{c.client_name}</strong> ({c.client_id})
                {c.is_igst ? <span style={{ marginLeft: 8, fontSize: "12px", color: "#a00" }}>IGST</span> : null}
              </span>
              <span style={{ fontSize: "0.9em", color: "#555" }}>{c.phone}</span>
            </div>
          ))}
        </div>
      )}

      {/* Scanner / manual add */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1.2fr auto",
          gap: "12px",
          marginBottom: "16px",
          alignItems: "end",
          opacity: mode === "DELETE" ? 0.6 : 1,
          pointerEvents: mode === "DELETE" ? "none" : "auto",
        }}
      >
        <div>
          <label style={labelStyle}>Scan Barcode</label>
          <input
            ref={scanInputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onFocus={() => setScanMode(true)}
            onBlur={() => setScanMode(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const code = e.currentTarget.value;
                handleScanCode(code);
              }
            }}
            style={{ ...inputStyle, width: "100%" }}
            placeholder="Focus here and scan"
            inputMode="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div>
          <label style={labelStyle}>Or Product ID</label>
          <input
            value={manualProductId}
            onChange={(e) => setManualProductId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddByProductId()}
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={() => handleScanCode(barcode)} style={btnStyle}>
            Add by Barcode
          </button>
          <button type="button" onClick={handleAddByProductId} style={btnStyle}>
            Add by Product
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
          opacity: mode === "DELETE" ? 0.75 : 1,
        }}
      >
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Gross</th>
            <th>Disc %</th>
            <th>Disc Amt</th>
            <th>Taxable</th>
            <th>GST Amt</th>
            <th>Line Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td colSpan={11} style={{ textAlign: "center", padding: "10px" }}>
                No items. Scan barcode or add by Product ID.
              </td>
            </tr>
          )}

          {lines.map((l, idx) => (
            <tr key={l.tempId}>
              <td>{idx + 1}</td>
              <td>
                {l.product_name}
                <div style={{ fontSize: "0.8em", color: "#666" }}>
                  {l.product_id}
                  {l.barcode ? ` / ${l.barcode}` : ""}
                </div>
              </td>

              <td>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={l.quantity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    updateLine(l.tempId, { quantity: Math.max(1, v) });
                  }}
                  style={qtyStyle}
                  disabled={mode === "DELETE"}
                />
              </td>

              <td>
                <input
                  type="number"
                  step="0.01"
                  value={l.unit_price}
                  onChange={(e) => updateLine(l.tempId, { unit_price: Number(e.target.value) || 0 })}
                  style={rateStyle}
                  disabled={mode === "DELETE"}
                />
              </td>

              <td style={{ textAlign: "right", paddingRight: "4px" }}>{round2(l.gross_amount ?? 0).toFixed(2)}</td>

              <td>
                <input
                  type="number"
                  step="0.1"
                  value={l.discount_pct}
                  onChange={(e) => updateLine(l.tempId, { discount_pct: Number(e.target.value) || 0 })}
                  style={discStyle}
                  disabled={mode === "DELETE" || invoiceDiscountPct !== ""}
                />
              </td>

              <td style={{ textAlign: "right", paddingRight: "4px" }}>{round2(l.discount_amount ?? 0).toFixed(2)}</td>
              <td style={{ textAlign: "right", paddingRight: "4px" }}>{round2(l.taxable_amount ?? 0).toFixed(2)}</td>
              <td style={{ textAlign: "right", paddingRight: "4px" }}>{round2(l.tax_amount ?? 0).toFixed(2)}</td>
              <td style={{ textAlign: "right", paddingRight: "4px" }}>{round2(l.line_total ?? 0).toFixed(2)}</td>

              <td>
                <button type="button" onClick={() => removeLine(l.tempId)} style={btnStyle} disabled={mode === "DELETE"}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Actions + Totals */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          marginBottom: "8px",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          {mode === "ENTRY" && (
            <button type="button" onClick={handleSaveNew} disabled={saving || lines.length === 0} style={btnStyle}>
              {saving ? "Saving..." : "Save Bill"}
            </button>
          )}

          <button type="button" onClick={clearAllInvoice} style={btnStyle} disabled={saving}>
            Clear Invoice
          </button>

          <button type="button" onClick={clearItemsOnly} style={btnStyle} disabled={saving}>
            Clear Items (F3)
          </button>

          {/* Document chooser */}
          <div>
            <label style={labelStyle}>Document</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ ...inputStyle, width: 180 }} disabled={saving}>
              <option value="INVOICE">Invoice PDF</option>
              <option value="DO">Delivery Order (DO)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => onPreviewPdf(docType)}
            style={{ ...btnStyle, background: "#f1f7ff" }}
            disabled={saving || lines.length === 0 || !isSavedForActions}
            title={!isSavedForActions ? "Save invoice first" : ""}
          >
            Preview PDF
          </button>

          <button
            type="button"
            onClick={() => onDownloadPdf(docType)}
            style={{ ...btnStyle, background: "#eaffea" }}
            disabled={saving || lines.length === 0 || !isSavedForActions}
            title={!isSavedForActions ? "Save invoice first" : ""}
          >
            Download PDF
          </button>

          <button
            type="button"
            onClick={() => onPrintPdf(docType)}
            style={{ ...btnStyle, background: "#fff3d6" }}
            disabled={saving || lines.length === 0 || !isSavedForActions}
            title={!isSavedForActions ? "Save invoice first" : ""}
          >
            Print
          </button>

          <button
            type="button"
            onClick={onShareWhatsapp}
            style={{ ...btnStyle, background: "#e8ffe8" }}
            disabled={saving || lines.length === 0 || !isSavedForActions}
            title={!isSavedForActions ? "Save invoice first" : "Opens WhatsApp with message; attach PDF manually if needed"}
          >
            Share WhatsApp
          </button>

          <button
            type="button"
            onClick={onShareEmailGmail}
            style={{ ...btnStyle, background: "#e8f0ff" }}
            disabled={saving || lines.length === 0 || !isSavedForActions}
            title={!isSavedForActions ? "Save invoice first" : "Opens Gmail compose. Attach PDF manually."}
          >
            Email (Gmail)
          </button>

          {!isSavedForActions ? (
            <div style={{ fontSize: 12, color: "#a00", marginLeft: 6 }}>
              * Save first to Preview/Download/Print/Share/Email
            </div>
          ) : null}
        </div>

        <div style={{ textAlign: "right", minWidth: "300px" }}>
          <div>Gross: {totals.gross.toFixed(2)}</div>
          <div>Discount: {totals.discount.toFixed(2)}</div>
          <div>Taxable: {totals.taxable.toFixed(2)}</div>
          <div>
            Tax ({isIGST ? "IGST" : "GST"}): {(isIGST ? totals.igst : totals.gst).toFixed(2)}
          </div>
          <div>
            <strong>Net: {totals.net.toFixed(2)}</strong>
          </div>
          <div>Paid: {toNum(paidAmount).toFixed(2)}</div>
          <div>
            Balance: <strong>{balanceAmount.toFixed(2)}</strong>
          </div>
          <div style={{ fontSize: "0.8em", color: "#555" }}>(All values calculated in Billing and stored as-is)</div>
        </div>
      </div>

      {status && <div style={{ color: "green" }}>{status}</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {/* PDF Preview */}
      {pdfUrl && (
        <div style={{ marginTop: 14, border: "1px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
          <div
            style={{
              padding: "8px 10px",
              background: "#f7f7f7",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div>
              <b>PDF Preview</b>{" "}
              {pdfMeta?.docType ? (
                <span style={{ fontSize: 12, color: "#555" }}>
                  — {pdfMeta.docType === "DO" ? "Delivery Order" : "Invoice"} / {pdfMeta.invoiceNo}
                </span>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={btnStyle}
                onClick={() => {
                  const w = window.open(pdfUrl, "_blank");
                  if (!w) {
                    setError("Popup blocked. Allow popups.");
                    setStatus(null);
                  }
                }}
              >
                Open
              </button>
              <button
                type="button"
                style={btnStyle}
                onClick={() => {
                  try {
                    URL.revokeObjectURL(pdfUrl);
                  } catch {}
                  setPdfUrl("");
                  setPdfFile(null);
                  setPdfMeta(null);
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
          <iframe title="PDF" src={pdfUrl} style={{ width: "100%", height: "70vh", border: "0" }} />
        </div>
      )}
    </div>
  );
}

