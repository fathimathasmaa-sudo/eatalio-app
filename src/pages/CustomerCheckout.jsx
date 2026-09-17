import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CreditCard, MapPin, Upload, Utensils, ShoppingBag, Truck } from "lucide-react";
import { addDoc, collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import { db, app, ensureCustomerAuth } from "../firebaseConfig";

const CART_KEY = "eatalio-cart";
const DEFAULT_SETTINGS = {
  taxPercent: 8,
  bankName: "",
  accountName: "",
  accountNumber: "",
  transferInstructions: "",
  freeDeliveryThreshold: 0,
  deliveryAreas: [],
  deliveryEnabled: true,
  cashEnabled: true,
  bankTransferEnabled: true,
  onlineOrderingEnabled: true,
  restaurantStatus: "open",
  maintenanceMode: false,
};

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function money(value) {
  return `MVR ${Number(value || 0).toFixed(0)}`;
}

const field = "mt-1 h-11 w-full rounded-xl bg-slate-50 px-3.5 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900";

function normalizeSettings(data = {}) {
  const rawAreas = Array.isArray(data.deliveryAreas) ? data.deliveryAreas : [];
  const taxPercent = Number(data.taxPercent ?? data.taxRate ?? 8);
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    taxPercent: Number.isFinite(taxPercent) ? taxPercent : 8,
    deliveryAreas: rawAreas.filter(Boolean).map((area, index) => {
      if (typeof area === "string") return { id: area, name: area, fee: 0 };
      return {
        id: area.id || area.name || `area-${index}`,
        name: area.name || area.id || `Area ${index + 1}`,
        fee: Number(area.fee ?? area.deliveryFee ?? 0) || 0,
      };
    }),
  };
}

export default function CustomerCheckout() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table") || "";
  const tableId = params.get("tableId") || "";
  const requestedType = params.get("orderType") || "";

  const [cart] = useState(readCart);
  const [orderType, setOrderType] = useState(table ? "dine-in" : requestedType || "takeaway");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [slip, setSlip] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [submitting, setSubmitting] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "settings", "app"))
      .then((snapshot) => {
        if (cancelled) return;
        setSettings(snapshot.exists() ? normalizeSettings(snapshot.data()) : DEFAULT_SETTINGS);
      })
      .catch((error) => {
        console.error("Could not load checkout settings", error);
        if (!cancelled) setSettingsError("Some restaurant settings could not be loaded. You can still review your order.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (table) setOrderType("dine-in");
  }, [table]);

  const areas = Array.isArray(settings.deliveryAreas) ? settings.deliveryAreas : [];
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0), [cart]);
  const tax = subtotal * Number(settings.taxPercent ?? 8) / 100;
  const selectedArea = areas.find((item) => (item.name || item.id) === area) || null;
  const configuredFee = Number(selectedArea?.fee ?? selectedArea?.deliveryFee ?? settings.deliveryFee ?? 0) || 0;
  const threshold = Number(settings.freeDeliveryThreshold || 0) || 0;
  const deliveryFee = orderType === "delivery" && threshold > 0 && subtotal >= threshold ? 0 : orderType === "delivery" ? configuredFee : 0;
  const total = subtotal + tax + deliveryFee;

  const qs = () => {
    const query = new URLSearchParams();
    if (orderType === "dine-in" && table) query.set("table", table);
    if (orderType === "dine-in" && tableId) query.set("tableId", tableId);
    if (orderType && !table) query.set("orderType", orderType);
    return query.toString() ? `?${query}` : "";
  };

  const back = () => navigate(`/cart${qs()}`);

  const chooseType = (type) => {
    if (type === "dine-in" && !table) return;
    if (table && type !== "dine-in") return;
    setOrderType(type);
    setSlip(null);
    if (type === "dine-in") setPaymentMethod("none");
    else if (paymentMethod === "none") setPaymentMethod(settings.cashEnabled ? "cash" : settings.bankTransferEnabled ? "bank-transfer" : "none");
  };

  const orderingClosed = !settings.onlineOrderingEnabled || settings.restaurantStatus === "closed" || settings.maintenanceMode;

  const validate = () => {
    if (orderingClosed) return "Online ordering is currently unavailable.";
    if (!cart.length) return "Your cart is empty.";
    if (orderType === "dine-in" && !tableId) return "This QR table is not configured yet. Please scan the table QR again.";
    if (orderType === "delivery" && !settings.deliveryEnabled) return "Delivery is currently unavailable.";
    if (orderType !== "dine-in" && (!name.trim() || !phone.trim())) return "Please enter your name and phone number.";
    if (orderType === "delivery" && (!area.trim() || !selectedArea || !address.trim())) return "Please select your delivery area and enter your address.";
    if (orderType !== "dine-in" && !((paymentMethod === "cash" && settings.cashEnabled) || (paymentMethod === "bank-transfer" && settings.bankTransferEnabled))) return "Please select an available payment method.";
    if (orderType !== "dine-in" && paymentMethod === "bank-transfer" && !slip) return "Please attach your bank transfer slip.";
    return "";
  };

  const getTableSession = async () => {
    const tableRef = doc(db, "tables", tableId);
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tableRef);
      if (!snapshot.exists()) throw new Error("Table not found");
      const data = snapshot.data() || {};
      if (data.active === false) throw new Error("This table is currently unavailable");
      if (data.currentSessionId && data.currentSessionStatus === "open") return data.currentSessionId;
      const sessionId = `${data.code || table}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      transaction.update(tableRef, { currentSessionId: sessionId, currentSessionStatus: "open", currentSessionStartedAt: serverTimestamp() });
      return sessionId;
    });
  };

  const placeOrder = async () => {
    const error = validate();
    if (error) {
      alert(error);
      return;
    }
    setSubmitting(true);
    try {
      const user = await ensureCustomerAuth();
      const currentGuestId = user.uid;
      const menuSnapshot = await getDocs(collection(db, "menu"));
      const menuById = new Map(menuSnapshot.docs.map((item) => [item.id, item.data()]));
      const unavailable = cart.filter((item) => {
        const current = menuById.get(item.id);
        return !current || current.available === false;
      });
      if (unavailable.length) throw new Error(`${unavailable.map((item) => item.name).join(", ")} is no longer available. Please return to the menu.`);
      const invalidQuantity = cart.find((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0);
      if (invalidQuantity) throw new Error("Please check the quantities in your cart.");
      const priceChanged = cart.find((item) => Number(menuById.get(item.id)?.price ?? item.price) !== Number(item.price));
      if (priceChanged) throw new Error("A menu price has changed. Please return to the menu and review your cart.");

      let slipURL = "";
      if (paymentMethod === "bank-transfer" && slip) {
        const extension = slip.name.split(".").pop() || "jpg";
        const storageRef = ref(getStorage(app), `payment-slips/${currentGuestId}/${Date.now()}.${extension}`);
        await uploadBytes(storageRef, slip);
        slipURL = await getDownloadURL(storageRef);
      }

      const tableSessionId = orderType === "dine-in" ? await getTableSession() : "";
      if (orderType === "dine-in") {
        const sessionRef = doc(db, "tableSessions", tableSessionId);
        const sessionSnapshot = await getDoc(sessionRef);
        if (!sessionSnapshot.exists()) {
          await setDoc(sessionRef, {
            tableId,
            tableNumber: table,
            status: "open",
            startedAt: serverTimestamp(),
            createdByGuestId: currentGuestId,
          }, { merge: true });
        }
      }

      const orderData = {
        orderType,
        tableNumber: orderType === "dine-in" ? table : "",
        tableId: orderType === "dine-in" ? tableId : "",
        tableSessionId,
        guestSessionId: currentGuestId,
        customerId: user.isAnonymous ? null : user.uid,
        customerName: orderType === "dine-in" ? "" : name.trim(),
        customerPhone: orderType === "dine-in" ? "" : phone.trim(),
        delivery: orderType === "delivery" ? { area, address: address.trim(), landmark: landmark.trim(), instructions: deliveryInstructions.trim() } : null,
        specialInstructions: specialInstructions.trim(),
        items: cart.map(({ id, name: itemName, price, quantity, category, image }) => ({ id, name: itemName, price, quantity, category: category || "", image: image || "" })),
        orderStatus: "Received",
        status: "Pending",
        payment: {
          method: orderType === "dine-in" ? "none" : paymentMethod,
          status: orderType === "dine-in" ? "not-required" : "pending",
          slipURL,
        },
        paymentMethod: orderType === "dine-in" ? "none" : paymentMethod,
        subtotal,
        taxPercent: Number(settings.taxPercent ?? 8),
        tax,
        deliveryFee,
        total,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const orderRef = await addDoc(collection(db, "orders"), orderData);
      if (orderType === "dine-in") {
        await addDoc(collection(db, "tableSessions", tableSessionId, "orders"), { orderId: orderRef.id, guestSessionId: currentGuestId, createdAt: serverTimestamp() });
      }
      localStorage.removeItem(CART_KEY);
      window.dispatchEvent(new Event("eatalio-cart-updated"));
      navigate(`/order/${orderRef.id}${orderType === "dine-in" && table ? `?table=${encodeURIComponent(table)}&tableId=${encodeURIComponent(tableId)}` : ""}`);
    } catch (err) {
      console.error("Eatalio checkout error", err);
      alert(err.message || "We couldn't place your order. Please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const typeOptions = [["dine-in", Utensils, "Dine In"], ["takeaway", ShoppingBag, "Takeaway"], ["delivery", Truck, "Delivery"]];

  return (
    <div className="min-h-screen bg-[#fafaf9] pb-8 text-slate-950">
      <header className="border-b border-slate-200/70 bg-[#fafaf9]"><div className="mx-auto flex h-16 max-w-3xl items-center px-5 sm:px-8"><button onClick={back} className="mr-3 rounded-full p-2 hover:bg-slate-100"><ArrowLeft size={20} /></button><h1 className="text-lg font-semibold">Checkout</h1></div></header>
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-8">
        {(table || orderType) && <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{table ? `🍽️ Dine In · ${table}` : orderType === "delivery" ? "🛵 Delivery" : "🥡 Takeaway"}</span>}
        {orderingClosed && <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Online ordering is currently unavailable.</div>}
        {settingsError && <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">{settingsError}</div>}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><h2 className="font-semibold">Order type</h2><div className="mt-3 grid grid-cols-3 gap-2">{typeOptions.map(([value, Icon, label]) => <button key={value} disabled={orderingClosed || (value === "dine-in" && !table) || (value !== "dine-in" && !!table) || (value === "delivery" && !settings.deliveryEnabled)} onClick={() => chooseType(value)} className={`rounded-xl px-2 py-3 text-xs font-semibold ring-1 ${orderType === value ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-600 ring-slate-200"} disabled:cursor-not-allowed disabled:opacity-40`}><Icon size={16} className="mx-auto mb-1" />{label}</button>)}</div></section>

        {orderType !== "dine-in" && <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><h2 className="font-semibold">Your details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Name<input value={name} onChange={(event) => setName(event.target.value)} className={field} placeholder="Your name" /></label><label className="text-sm font-medium">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className={field} placeholder="Phone number" inputMode="tel" /></label></div></section>}

        {orderType === "delivery" && <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><div className="flex items-center gap-2"><MapPin size={18} /><h2 className="font-semibold">Delivery address</h2></div><div className="mt-4 space-y-4"><label className="block text-sm font-medium">Island / Area<select value={area} onChange={(event) => setArea(event.target.value)} className={field}><option value="">Select area</option>{areas.map((item) => <option key={item.id || item.name} value={item.name || item.id}>{item.name || item.id}{item.fee != null ? ` · ${money(item.fee)}` : ""}</option>)}</select></label><label className="block text-sm font-medium">Address<input value={address} onChange={(event) => setAddress(event.target.value)} className={field} placeholder="House / building / street" /></label><label className="block text-sm font-medium">Landmark <span className="font-normal text-slate-400">(optional)</span><input value={landmark} onChange={(event) => setLandmark(event.target.value)} className={field} /></label><label className="block text-sm font-medium">Delivery instructions <span className="font-normal text-slate-400">(optional)</span><textarea value={deliveryInstructions} onChange={(event) => setDeliveryInstructions(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl bg-slate-50 p-3.5 text-sm outline-none ring-1 ring-slate-200" placeholder="Call me when you arrive." /></label></div></section>}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><h2 className="font-semibold">Special instructions <span className="font-normal text-slate-400">(optional)</span></h2><textarea value={specialInstructions} onChange={(event) => setSpecialInstructions(event.target.value)} className="mt-3 min-h-20 w-full rounded-xl bg-slate-50 p-3.5 text-sm outline-none ring-1 ring-slate-200" placeholder="Anything you'd like us to know about your order?" /></section>

        {orderType !== "dine-in" && <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><div className="flex items-center gap-2"><CreditCard size={18} /><h2 className="font-semibold">Payment</h2></div><div className="mt-4 space-y-2">{settings.cashEnabled && <button onClick={() => setPaymentMethod("cash")} className={`flex w-full items-center justify-between rounded-xl p-4 text-left ring-1 ${paymentMethod === "cash" ? "bg-slate-50 ring-slate-900" : "ring-slate-200"}`}><div><p className="text-sm font-semibold">Cash</p><p className="mt-1 text-xs text-slate-500">Pay when you {orderType === "delivery" ? "receive your order" : "collect your order"}.</p></div>{paymentMethod === "cash" && <Check size={18} />}</button>}{settings.bankTransferEnabled && <button onClick={() => setPaymentMethod("bank-transfer")} className={`flex w-full items-center justify-between rounded-xl p-4 text-left ring-1 ${paymentMethod === "bank-transfer" ? "bg-slate-50 ring-slate-900" : "ring-slate-200"}`}><div><p className="text-sm font-semibold">Bank Transfer</p><p className="mt-1 text-xs text-slate-500">Transfer the exact order amount.</p></div>{paymentMethod === "bank-transfer" && <Check size={18} />}</button>}</div>{!settings.cashEnabled && !settings.bankTransferEnabled && <p className="mt-3 text-sm text-red-600">No payment methods are currently available.</p>}{paymentMethod === "bank-transfer" && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p><span className="text-slate-500">Bank</span><br /><b>{settings.bankName || "Bank details will be provided"}</b></p><p className="mt-3"><span className="text-slate-500">Account name</span><br /><b>{settings.accountName || "—"}</b></p><p className="mt-3"><span className="text-slate-500">Account number</span><br /><b>{settings.accountNumber || "—"}</b></p>{settings.transferInstructions && <p className="mt-3 text-xs text-slate-500">{settings.transferInstructions}</p>}<p className="mt-4 border-t border-slate-200 pt-3">Amount to transfer: <b>{money(total)}</b></p><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold ring-1 ring-slate-200"><Upload size={17} />{slip ? "✓ Payment slip attached" : "Upload payment slip"}<input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setSlip(event.target.files?.[0] || null)} /></label></div>}</section>}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><h2 className="font-semibold">Order summary</h2><div className="mt-4 space-y-3 text-sm">{cart.map((item) => <div key={item.id} className="flex justify-between gap-4"><span className="text-slate-600"><b>{item.quantity}×</b> {item.name}</span><span className="shrink-0">{money(Number(item.price || 0) * Number(item.quantity || 0))}</span></div>)}<div className="flex justify-between border-t border-slate-100 pt-3"><span className="text-slate-500">Subtotal</span><span>{money(subtotal)}</span></div>{orderType === "delivery" && <div className="flex justify-between"><span className="text-slate-500">Delivery</span><span>{deliveryFee === 0 ? "Free" : money(deliveryFee)}</span></div>}<div className="flex justify-between"><span className="text-slate-500">GST ({Number(settings.taxPercent ?? 8)}%)</span><span>{money(tax)}</span></div><div className="flex justify-between border-t border-slate-100 pt-3 text-base font-semibold"><span>Total</span><span>{money(total)}</span></div></div></section>

        <button disabled={submitting || orderingClosed} onClick={placeOrder} className="h-12 w-full rounded-2xl bg-slate-950 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Placing order…" : "Place Order"}</button>
      </main>
    </div>
  );
}
