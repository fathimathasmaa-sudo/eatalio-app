import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, CreditCard, MapPin, Upload } from "lucide-react";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import { db, app } from "../firebaseConfig";
import { getAuth } from "firebase/auth";

const CART_KEY = "eatalio-cart";
const GUEST_KEY = "eatalio-guest-session";

function readCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; } }
function money(v) { return `MVR ${Number(v || 0).toFixed(0)}`; }
function guestId() { let id = localStorage.getItem(GUEST_KEY); if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(GUEST_KEY, id); } return id; }

const field = "mt-1 h-11 w-full rounded-xl bg-slate-50 px-3.5 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900";

export default function CustomerCheckout() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table") || "";
  const [cart, setCart] = useState(readCart);
  const [orderType, setOrderType] = useState(table ? "dine-in" : "takeaway");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [slip, setSlip] = useState(null);
  const [settings, setSettings] = useState({ taxPercent: 8, bankName: "", accountName: "", accountNumber: "", transferInstructions: "", freeDeliveryThreshold: 0, deliveryAreas: [] });
  const [areas, setAreas] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "app")).then((snap) => { if (snap.exists()) setSettings((s) => ({ ...s, ...snap.data() })); }).catch(console.error);
    getDoc(doc(db, "settings", "delivery")).then((snap) => { if (snap.exists()) setAreas(snap.data().areas || []); }).catch(() => {});
  }, []);

  useEffect(() => { if (table) setOrderType("dine-in"); }, [table]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0), [cart]);
  const tax = subtotal * Number(settings.taxPercent ?? 8) / 100;
  const selectedArea = areas.find((a) => (a.name || a.id) === area) || null;
  const configuredFee = Number(selectedArea?.fee ?? selectedArea?.deliveryFee ?? settings.deliveryFee ?? 0);
  const threshold = Number(settings.freeDeliveryThreshold || 0);
  const deliveryFee = orderType === "delivery" && threshold > 0 && subtotal >= threshold ? 0 : orderType === "delivery" ? configuredFee : 0;
  const total = subtotal + tax + deliveryFee;

  const back = () => navigate(table ? `/cart?table=${encodeURIComponent(table)}` : "/cart");
  const chooseType = (type) => { setOrderType(type); if (type === "dine-in") setPaymentMethod("cash"); };

  const validate = () => {
    if (!cart.length) return "Your cart is empty.";
    if (orderType !== "dine-in" && (!name.trim() || !phone.trim())) return "Please enter your name and phone number.";
    if (orderType === "delivery" && (!area.trim() || !address.trim())) return "Please enter your delivery area and address.";
    if (orderType !== "dine-in" && !["cash", "bank-transfer"].includes(paymentMethod)) return "Please select a payment method.";
    if (orderType !== "dine-in" && paymentMethod === "bank-transfer" && !slip) return "Please attach your bank transfer slip.";
    return "";
  };

  const placeOrder = async () => {
    const error = validate(); if (error) { alert(error); return; }
    setSubmitting(true);
    try {
      let slipURL = "";
      if (paymentMethod === "bank-transfer" && slip) {
        const storage = getStorage(app);
        const extension = slip.name.split(".").pop() || "jpg";
        const storageRef = ref(storage, `payment-slips/${guestId()}/${Date.now()}.${extension}`);
        await uploadBytes(storageRef, slip);
        slipURL = await getDownloadURL(storageRef);
      }
      const auth = getAuth(app);
      const user = auth.currentUser;
      const orderData = {
        orderType,
        tableNumber: orderType === "dine-in" ? table : "",
        tableSessionId: orderType === "dine-in" ? `${table}-${guestId()}` : "",
        guestSessionId: guestId(),
        customerId: user?.uid || null,
        customerName: orderType === "dine-in" ? "" : name.trim(),
        customerPhone: orderType === "dine-in" ? "" : phone.trim(),
        delivery: orderType === "delivery" ? { area, address: address.trim(), landmark: landmark.trim(), instructions: deliveryInstructions.trim() } : null,
        specialInstructions: specialInstructions.trim(),
        items: cart.map(({ id, name, price, quantity, category, image }) => ({ id, name, price, quantity, category: category || "", image: image || "" })),
        orderStatus: "Received",
        status: "Pending",
        payment: { method: orderType === "dine-in" ? "none" : paymentMethod, status: orderType === "dine-in" ? "not-required" : paymentMethod === "cash" ? "pending" : "pending", slipURL },
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
      const docRef = await addDoc(collection(db, "orders"), orderData);
      localStorage.removeItem(CART_KEY);
      window.dispatchEvent(new Event("eatalio-cart-updated"));
      navigate(`/order/${docRef.id}${table ? `?table=${encodeURIComponent(table)}` : ""}`);
    } catch (err) {
      console.error(err);
      alert("We couldn't place your order. Please try again.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] pb-8 text-slate-950">
      <header className="border-b border-slate-200/70 bg-[#fafaf9]"><div className="mx-auto flex h-16 max-w-3xl items-center px-5 sm:px-8"><button onClick={back} className="mr-3 rounded-full p-2 hover:bg-slate-100"><ArrowLeft size={20} /></button><h1 className="text-lg font-semibold">Checkout</h1></div></header>
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-8">
        {table && orderType === "dine-in" && <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">🍽️ Dine In · {table}</span>}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
          <h2 className="font-semibold">Order type</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">{[["dine-in","🍽️","Dine In"],["takeaway","🥡","Takeaway"],["delivery","🛵","Delivery"]].map(([v,icon,label]) => <button key={v} disabled={v === "dine-in" && !table} onClick={() => chooseType(v)} className={`rounded-xl px-2 py-3 text-xs font-semibold ring-1 transition ${orderType === v ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-600 ring-slate-200"} ${v === "dine-in" && !table ? "cursor-not-allowed opacity-40" : ""}`}>{icon}<span className="ml-1">{label}</span></button>)}</div>
        </section>

        {orderType !== "dine-in" && <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><h2 className="font-semibold">Your details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Name<input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Your name" /></label><label className="text-sm font-medium">Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="Phone number" inputMode="tel" /></label></div></section>}

        {orderType === "delivery" && <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><div className="flex items-center gap-2"><MapPin size={18} /><h2 className="font-semibold">Delivery address</h2></div><div className="mt-4 space-y-4"><label className="block text-sm font-medium">Island / Area<select value={area} onChange={(e) => setArea(e.target.value)} className={field}><option value="">Select area</option>{areas.map((a) => <option key={a.id || a.name} value={a.name || a.id}>{a.name || a.id}{a.fee != null ? ` · ${money(a.fee)}` : ""}</option>)}</select></label><label className="block text-sm font-medium">Address<input value={address} onChange={(e) => setAddress(e.target.value)} className={field} placeholder="House / building / street" /></label><label className="block text-sm font-medium">Landmark <span className="font-normal text-slate-400">(optional)</span><input value={landmark} onChange={(e) => setLandmark(e.target.value)} className={field} /></label><label className="block text-sm font-medium">Delivery instructions <span className="font-normal text-slate-400">(optional)</span><textarea value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl bg-slate-50 p-3.5 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900" placeholder="Call me when you arrive." /></label></div></section>}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><h2 className="font-semibold">Special instructions <span className="font-normal text-slate-400">(optional)</span></h2><textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className="mt-3 min-h-20 w-full rounded-xl bg-slate-50 p-3.5 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900" placeholder="Anything you'd like us to know about your order?" /></section>

        {orderType !== "dine-in" && <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><div className="flex items-center gap-2"><CreditCard size={18} /><h2 className="font-semibold">Payment</h2></div><div className="mt-4 space-y-2"><button onClick={() => setPaymentMethod("cash")} className={`flex w-full items-center justify-between rounded-xl p-4 text-left ring-1 ${paymentMethod === "cash" ? "bg-slate-50 ring-slate-900" : "ring-slate-200"}`}><div><p className="text-sm font-semibold">Cash</p><p className="mt-1 text-xs text-slate-500">Pay when you {orderType === "delivery" ? "receive your order" : "collect your order"}.</p></div>{paymentMethod === "cash" && <Check size={18} />}</button><button onClick={() => setPaymentMethod("bank-transfer")} className={`flex w-full items-center justify-between rounded-xl p-4 text-left ring-1 ${paymentMethod === "bank-transfer" ? "bg-slate-50 ring-slate-900" : "ring-slate-200"}`}><div><p className="text-sm font-semibold">Bank Transfer</p><p className="mt-1 text-xs text-slate-500">Transfer the exact order amount.</p></div>{paymentMethod === "bank-transfer" && <Check size={18} />}</button></div>{paymentMethod === "bank-transfer" && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p><span className="text-slate-500">Bank</span><br /><b>{settings.bankName || "Bank details will be provided"}</b></p><p className="mt-3"><span className="text-slate-500">Account name</span><br /><b>{settings.accountName || "—"}</b></p><p className="mt-3"><span className="text-slate-500">Account number</span><br /><b>{settings.accountNumber || "—"}</b></p>{settings.transferInstructions && <p className="mt-3 text-xs text-slate-500">{settings.transferInstructions}</p>}<p className="mt-4 border-t border-slate-200 pt-3">Amount to transfer: <b>{money(total)}</b></p><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold ring-1 ring-slate-200"><Upload size={17} />{slip ? "✓ Payment slip attached" : "Upload payment slip"}<input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setSlip(e.target.files?.[0] || null)} /></label></div>}</section>}

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><h2 className="font-semibold">Order summary</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(subtotal)}</span></div>{orderType === "delivery" && <div className="flex justify-between"><span className="text-slate-500">Delivery</span><span>{deliveryFee === 0 ? "Free" : money(deliveryFee)}</span></div>}<div className="flex justify-between"><span className="text-slate-500">GST ({settings.taxPercent}%)</span><span>{money(tax)}</span></div><div className="flex justify-between border-t border-slate-100 pt-3 text-base font-semibold"><span>Total</span><span>{money(total)}</span></div></div></section>
        <button disabled={submitting} onClick={placeOrder} className="h-12 w-full rounded-2xl bg-slate-950 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Placing order…" : "Place Order"}</button>
      </main>
    </div>
  );
}
