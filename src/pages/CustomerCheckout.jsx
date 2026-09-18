import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, MapPin, Plus, Upload, Utensils, ShoppingBag, Truck } from "lucide-react";
import { addDoc, collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import { db, app, ensureCustomerAuth } from "../firebaseConfig";
import { calculateExclusiveAmount, calculateIncludedGST, formatPrice, formatPrice2, roundPrice } from "../utils/pricing";
import { reserveOrderNumber } from "../utils/orderNumber";

const CART_KEY = "eatalio-cart";
const DEFAULT = { taxPercent: 8, bankName: "", accountName: "", accountNumber: "", transferInstructions: "", freeDeliveryThreshold: 0, deliveryAreas: [], deliveryEnabled: true, cashEnabled: true, bankTransferEnabled: true, onlineOrderingEnabled: true, restaurantStatus: "open", maintenanceMode: false };
const field = "mt-1 h-11 w-full rounded-xl bg-slate-50 px-3.5 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900";

function readCart() { try { const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function normalize(settings = {}) {
  const areas = Array.isArray(settings.deliveryAreas) ? settings.deliveryAreas : [];
  const rate = Number(settings.taxPercent ?? settings.taxRate ?? 8);
  return { ...DEFAULT, ...settings, taxPercent: Number.isFinite(rate) ? rate : 8, deliveryAreas: areas.filter(Boolean).map((area, index) => typeof area === "string" ? { id: area, name: area, fee: 0 } : { id: area.id || area.name || `area-${index}`, name: area.name || area.id || `Area ${index + 1}`, fee: Number(area.fee ?? area.deliveryFee ?? 0) || 0 }) };
}
function uploadSlip(file, userId, setProgress) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("Please choose a payment slip first.")); return; }
    if (file.size > 10 * 1024 * 1024) { reject(new Error("Payment slips must be smaller than 10 MB.")); return; }
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `payment-slips/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const storageRef = ref(getStorage(app), path);
    const metadata = { contentType: file.type || "application/octet-stream", customMetadata: { originalName: file.name } };
    setProgress(20);
    uploadBytes(storageRef, file, metadata).then(async () => { setProgress(90); const url = await getDownloadURL(storageRef); setProgress(100); resolve(url); }).catch(error => {
      const messages = { "storage/unauthorized": "Payment slip upload was rejected by Firebase Storage. Please deploy the Storage rules.", "storage/unauthenticated": "Your customer session expired. Please refresh the page and try again.", "storage/bucket-not-found": "Firebase Storage is not configured for this app.", "storage/quota-exceeded": "Firebase Storage is unavailable because the project has reached its storage/billing limit.", "storage/retry-limit-exceeded": "Firebase Storage could not complete the upload. Please try again." };
      reject(new Error(messages[error?.code] || error?.message || "We couldn't upload the payment slip."));
    });
  });
}
function Section({ number, title, children, className = "" }) {
  return <section className={`rounded-3xl bg-white p-5 ring-1 ring-slate-200/70 sm:p-6 ${className}`}><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{number}</span><div className="min-w-0 flex-1"><h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2><div className="mt-4">{children}</div></div></div></section>;
}

export default function CustomerCheckout() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table") || "";
  const tableId = params.get("tableId") || "";
  const requested = params.get("orderType") || "";
  const [cart] = useState(readCart);
  const [orderType, setOrderType] = useState(table ? "dine-in" : requested || "takeaway");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [itemInstructions, setItemInstructions] = useState({});
  const [openInstruction, setOpenInstruction] = useState("");
  const [slip, setSlip] = useState(null);
  const [uploadedSlipURL, setUploadedSlipURL] = useState("");
  const [settings, setSettings] = useState(DEFAULT);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { getDoc(doc(db, "settings", "app")).then(snapshot => { if (snapshot.exists()) setSettings(normalize(snapshot.data())); }).catch(console.error); }, []);
  const areas = settings.deliveryAreas || [];
  const selectedArea = areas.find(item => (item.name || item.id) === area);
  const grossSubtotal = useMemo(() => roundPrice(cart.reduce((sum, item) => sum + roundPrice(item.price) * Number(item.quantity || 0), 0)), [cart]);
  const deliveryFee = orderType === "delivery" ? (Number(settings.freeDeliveryThreshold) > 0 && grossSubtotal >= Number(settings.freeDeliveryThreshold) ? 0 : Number(selectedArea?.fee ?? settings.deliveryFee ?? 0)) : 0;
  const total = roundPrice(grossSubtotal + deliveryFee);
  const gstRate = Number(settings.taxPercent || 8);
  const includedGST = calculateIncludedGST(grossSubtotal, gstRate);
  const subtotalExclGST = calculateExclusiveAmount(grossSubtotal, gstRate);
  const orderingClosed = !settings.onlineOrderingEnabled || settings.restaurantStatus === "closed" || settings.maintenanceMode;

  const qs = () => { const query = new URLSearchParams(); if (orderType === "dine-in" && table) { query.set("table", table); if (tableId) query.set("tableId", tableId); } else if (orderType) query.set("orderType", orderType); return query.toString() ? `?${query}` : ""; };
  const resetSlip = () => { setSlip(null); setUploadedSlipURL(""); setProgress(0); setUploadError(""); };
  const chooseType = value => { if (value === "dine-in" && !table) return; if (table && value !== "dine-in") return; setOrderType(value); resetSlip(); if (value === "dine-in") setPaymentMethod("none"); else if (paymentMethod === "none") setPaymentMethod(settings.cashEnabled ? "cash" : "bank-transfer"); };
  const chooseCash = () => { setPaymentMethod("cash"); resetSlip(); };
  const updateItemInstruction = (id, value) => setItemInstructions(current => ({ ...current, [id]: value }));
  const upload = async () => {
    if (!slip || uploading || uploadedSlipURL) return;
    setUploadError(""); setUploading(true); setProgress(0);
    try {
      const user = await Promise.race([ensureCustomerAuth(), new Promise((_, reject) => setTimeout(() => reject(new Error("Customer sign-in took too long. Please refresh the page and try again.")), 15000))]);
      setUploadedSlipURL(await uploadSlip(slip, user.uid, setProgress));
    } catch (error) { console.error("Payment slip upload failed", error); setUploadedSlipURL(""); setUploadError(error.message || "We couldn't upload the payment slip."); } finally { setUploading(false); }
  };
  const validate = () => {
    if (orderingClosed) return "Online ordering is currently unavailable.";
    if (!cart.length) return "Your cart is empty.";
    if (orderType === "dine-in" && !tableId) return "This QR table is not configured yet. Please scan the table QR again.";
    if (orderType === "delivery" && (!settings.deliveryEnabled || !selectedArea || !address.trim())) return "Please select your delivery area and enter your address.";
    if (orderType !== "dine-in" && (!name.trim() || !phone.trim())) return "Please enter your name and phone number.";
    if (orderType !== "dine-in" && paymentMethod === "bank-transfer" && !uploadedSlipURL) return "Please upload your payment slip before placing the order.";
    return "";
  };
  const getTableSession = async () => {
    const tableRef = doc(db, "tables", tableId);
    return runTransaction(db, async transaction => {
      const snapshot = await transaction.get(tableRef);
      if (!snapshot.exists()) throw Error("Table not found");
      const data = snapshot.data();
      if (data.active === false) throw Error("This table is currently unavailable");
      if (data.currentSessionId && data.currentSessionStatus === "open") return data.currentSessionId;
      const sessionId = `${data.code || table}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      transaction.update(tableRef, { currentSessionId: sessionId, currentSessionStatus: "open", currentSessionStartedAt: serverTimestamp() });
      return sessionId;
    });
  };
  const place = async () => {
    const error = validate(); if (error) { alert(error); return; }
    setSubmitting(true);
    try {
      const user = await ensureCustomerAuth();
      const menuSnapshot = await getDocs(collection(db, "menu"));
      const menuById = new Map(menuSnapshot.docs.map(item => [item.id, item.data()]));
      for (const item of cart) {
        const current = menuById.get(item.id);
        if (!current || current.available === false) throw Error(`${item.name} is no longer available. Please return to the menu.`);
        if (Number(current.price) !== Number(item.price)) throw Error("A menu price has changed. Please return to the menu and review your cart.");
        if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) throw Error("Please check the quantities in your cart.");
      }
      const sessionId = orderType === "dine-in" ? await getTableSession() : "";
      if (orderType === "dine-in") {
        const sessionRef = doc(db, "tableSessions", sessionId); const sessionSnapshot = await getDoc(sessionRef);
        if (!sessionSnapshot.exists()) await setDoc(sessionRef, { tableId, tableNumber: table, status: "open", startedAt: serverTimestamp(), createdByGuestId: user.uid }, { merge: true });
      }
      const orderNumber = await reserveOrderNumber();
      const items = cart.map(({ id, name: itemName, price, quantity, category, image }) => ({ id, name: itemName, price: roundPrice(price), quantity, category: category || "", image: image || "", kitchenInstruction: String(itemInstructions[id] || "").trim() }));
      const order = {
        orderNumber, isTestOrder: settings.testMode === true, orderType,
        tableNumber: orderType === "dine-in" ? table : "", tableId: orderType === "dine-in" ? tableId : "", tableSessionId: sessionId,
        guestSessionId: user.uid, customerId: user.isAnonymous ? null : user.uid,
        customerName: orderType === "dine-in" ? "" : name.trim(), customerPhone: orderType === "dine-in" ? "" : phone.trim(),
        delivery: orderType === "delivery" ? { area, address: address.trim(), landmark: landmark.trim(), instructions: deliveryInstructions.trim() } : null,
        items, subtotal: grossSubtotal, grossSubtotal, subtotalExclGST, taxPercent: gstRate, tax: includedGST, deliveryFee, total,
        orderStatus: "Received", status: "Pending",
        payment: { method: orderType === "dine-in" ? "none" : paymentMethod, status: orderType === "dine-in" ? "not-required" : "pending", slipURL: orderType === "dine-in" ? "" : uploadedSlipURL },
        paymentMethod: orderType === "dine-in" ? "none" : paymentMethod, paymentStatus: orderType === "dine-in" ? "Not required" : "Pending",
        timestamp: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      };
      const orderRef = await addDoc(collection(db, "orders"), order);
      if (orderType === "dine-in") await addDoc(collection(db, "tableSessions", sessionId, "orders"), { orderId: orderRef.id, guestSessionId: user.uid, createdAt: serverTimestamp() });
      localStorage.removeItem(CART_KEY); window.dispatchEvent(new Event("eatalio-cart-updated"));
      navigate(`/order/${orderRef.id}${orderType === "dine-in" ? `?table=${encodeURIComponent(table)}&tableId=${encodeURIComponent(tableId)}` : ""}`);
    } catch (error) { console.error(error); alert(error.message || "We couldn't place your order."); } finally { setSubmitting(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(String(settings.accountNumber || "")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const types = [["dine-in", Utensils, "Dine In"], ["takeaway", ShoppingBag, "Takeaway"], ["delivery", Truck, "Delivery"]];

  return <div className="min-h-screen bg-[#fafaf9] pb-8 text-slate-950">
    <header className="border-b border-slate-200/70 bg-[#fafaf9]"><div className="mx-auto flex h-16 max-w-3xl items-center px-5 sm:px-8"><button onClick={() => navigate(`/cart${qs()}`)} className="mr-3 rounded-full p-2 hover:bg-white" aria-label="Back to cart"><ArrowLeft size={20}/></button><h1 className="text-lg font-semibold">Checkout</h1></div></header>
    <main className="mx-auto max-w-3xl space-y-4 px-5 py-5 sm:space-y-5 sm:px-8 sm:py-7">
      {orderingClosed && <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Online ordering is currently unavailable.</div>}
      <Section number="1" title="Your order"><div className="divide-y divide-slate-100 rounded-2xl bg-slate-50/70 ring-1 ring-slate-100">{cart.map(item => { const instruction = String(itemInstructions[item.id] || ""); const isOpen = openInstruction === item.id; return <div key={item.id} className="p-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-semibold leading-5">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.quantity} × {formatPrice2(item.price)}</p></div><p className="shrink-0 text-sm font-semibold">{formatPrice2(Number(item.price) * Number(item.quantity || 0))}</p></div><button type="button" onClick={() => setOpenInstruction(isOpen ? "" : item.id)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"><Plus size={13}/>{instruction ? "Edit kitchen instruction" : "Add kitchen instruction"}</button>{isOpen && <div className="mt-3"><textarea value={instruction} onChange={event => updateItemInstruction(item.id, event.target.value)} placeholder="e.g. No onions, sauce on the side, less spicy…" maxLength={250} rows={2} autoFocus className="w-full rounded-xl bg-white px-3.5 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900"/><p className="mt-1 text-[11px] text-slate-400">Optional · for the kitchen · {instruction.length}/250</p></div>}{!isOpen && instruction && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-100"><span className="font-semibold text-slate-700">Kitchen:</span> {instruction}</p>}</div>; })}</div></Section>
      <Section number="2" title="How would you like to order?"><div className="grid grid-cols-3 gap-2 sm:gap-3">{types.map(([value, Icon, label]) => { const disabled = orderingClosed || (value === "dine-in" && !table) || (value !== "dine-in" && !!table) || (value === "delivery" && !settings.deliveryEnabled); return <button key={value} disabled={disabled} onClick={() => chooseType(value)} className={`min-h-20 rounded-2xl px-2 py-3 text-xs font-semibold ring-1 transition sm:min-h-24 sm:text-sm ${orderType === value ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"} disabled:cursor-not-allowed disabled:opacity-40`}><Icon size={19} className="mx-auto mb-2"/>{label}</button>; })}</div>{table && <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-600 ring-1 ring-slate-100"><span className="font-semibold text-slate-900">Dine In · {table}</span><span className="ml-2 text-slate-400">Table selected from QR code</span></div>}</Section>
      <Section number="3" title="Your details">
        {orderType === "dine-in" ? <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-600 ring-1 ring-slate-100"><span className="font-semibold text-slate-900">Table {table}</span><span className="ml-2 text-slate-400">Your table is linked through the QR code. No name, phone number, or payment details are required.</span></div> : <><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Name<input value={name} onChange={event => setName(event.target.value)} className={field} placeholder="Your name"/></label><label className="text-sm font-medium">Phone<input value={phone} onChange={event => setPhone(event.target.value)} className={field} inputMode="tel" placeholder="Phone number"/></label></div>{orderType === "delivery" && <div className="mt-5 space-y-4 border-t border-slate-100 pt-5"><div className="flex items-center gap-2 text-sm font-semibold"><MapPin size={17}/>Delivery details</div><label className="block text-sm font-medium">Island / Area<select value={area} onChange={event => setArea(event.target.value)} className={field}><option value="">Select area</option>{areas.map(deliveryArea => <option key={deliveryArea.id} value={deliveryArea.name}>{deliveryArea.name} · {formatPrice(deliveryArea.fee)}</option>)}</select></label><label className="block text-sm font-medium">Address<input value={address} onChange={event => setAddress(event.target.value)} className={field} placeholder="House / building / street"/></label><label className="block text-sm font-medium">Landmark <span className="font-normal text-slate-400">(optional)</span><input value={landmark} onChange={event => setLandmark(event.target.value)} className={field}/></label><label className="block text-sm font-medium">Delivery instructions <span className="font-normal text-slate-400">(optional)</span><textarea value={deliveryInstructions} onChange={event => setDeliveryInstructions(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl bg-slate-50 px-3.5 py-3 text-sm ring-1 ring-slate-200" placeholder="Anything the rider should know?"/></label></div>}</>}
      </Section>
      {orderType !== "dine-in" && <Section number="4" title="Payment"><div className="grid grid-cols-2 gap-2 sm:gap-3">{settings.cashEnabled && <button onClick={chooseCash} className={`rounded-2xl p-3 text-sm font-semibold ring-1 transition ${paymentMethod === "cash" ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>Cash</button>}{settings.bankTransferEnabled && <button onClick={() => { setPaymentMethod("bank-transfer"); setUploadError(""); }} className={`rounded-2xl p-3 text-sm font-semibold ring-1 transition ${paymentMethod === "bank-transfer" ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>Bank Transfer</button>}</div>{paymentMethod === "cash" && <p className="mt-3 text-sm text-slate-500">Pay when you collect your order.</p>}{paymentMethod === "bank-transfer" && <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-semibold">{settings.bankName}</p><p className="mt-1">{settings.accountName}</p><p className="mt-1">{settings.accountNumber}</p>{settings.accountNumber && <button onClick={copy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold ring-1 ring-slate-200"><Copy size={14}/>{copied ? "Copied" : "Copy account number"}</button>}<p className="mt-4 font-semibold">Amount to transfer: {formatPrice(total)}</p>{settings.transferInstructions && <p className="mt-2 text-slate-500">{settings.transferInstructions}</p>}<div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-slate-200"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Upload size={16}/><span className="min-w-0 truncate">{slip ? slip.name : "Choose payment slip"}</span><input type="file" accept="image/*,.pdf" className="hidden" onChange={event => { setSlip(event.target.files?.[0] || null); setUploadedSlipURL(""); setProgress(0); setUploadError(""); }}/></label>{slip && !uploadedSlipURL && <button type="button" onClick={upload} disabled={uploading} className="mt-3 w-full rounded-xl bg-slate-950 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{uploading ? `Uploading ${progress}%` : "Upload Slip"}</button>}{uploadError && <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{uploadError}</div>}{uploadedSlipURL && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><Check size={16}/>Slip uploaded</p>}</div></div>}</Section>}
      <Section number="5" title="Order total"><div className="space-y-3 text-sm"><div className="flex items-baseline justify-between gap-4"><span className="text-slate-500">Subtotal (excl. GST)</span><span>{formatPrice2(subtotalExclGST)}</span></div><div className="flex items-baseline justify-between gap-4"><span className="text-slate-500">GST included ({gstRate}%)</span><span>{formatPrice2(includedGST)}</span></div>{orderType === "delivery" && <div className="flex items-baseline justify-between gap-4"><span className="text-slate-500">Delivery</span><span>{deliveryFee ? formatPrice2(deliveryFee) : "Free"}</span></div>}<div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4"><span className="text-base font-semibold">Total</span><span className="text-xl font-bold tracking-tight">{formatPrice2(total)}</span></div></div><button disabled={submitting || orderingClosed} onClick={place} className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Placing order…" : `Place Order · ${formatPrice2(total)}`}</button><p className="mt-3 text-center text-[11px] text-slate-400">Final prices include {gstRate}% GST.</p></Section>
    </main>
  </div>;
}
