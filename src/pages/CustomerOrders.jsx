import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, Clock3, Home, MapPin, PackageCheck, ShoppingBag } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";

const GUEST_KEY = "eatalio-guest-session";
const CART_KEY = "eatalio-cart";
function guestId() { let id = localStorage.getItem(GUEST_KEY); if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(GUEST_KEY, id); } return id; }
function money(v) { return `MVR ${Number(v || 0).toFixed(0)}`; }
function typeLabel(t) { return t === "dine-in" ? "Dine In" : t === "delivery" ? "Delivery" : "Takeaway"; }
function statusLabel(order) { const s = order.orderStatus || order.status || "Received"; if (s === "Pending") return "Received"; return s; }
function dateText(value) { const d = value?.toDate ? value.toDate() : value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""; }
const steps = ["Received", "Accepted", "Preparing", "Ready", "Completed"];

export default function CustomerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const id = useMemo(() => guestId(), []);
  useEffect(() => onSnapshot(query(collection(db, "orders"), where("guestSessionId", "==", id)), (snap) => {
    setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || b.timestamp?.seconds || 0) - (a.createdAt?.seconds || a.timestamp?.seconds || 0)));
  }, [id], (e) => console.error(e)), [id]);

  const active = orders.filter((o) => !["Completed", "Cancelled", "Canceled"].includes(statusLabel(o)));
  const previous = orders.filter((o) => ["Completed", "Cancelled", "Canceled"].includes(statusLabel(o)));
  const home = () => navigate("/");
  const menu = () => navigate("/menu");
  const cart = () => navigate("/cart");

  return <div className="min-h-screen bg-[#fafaf9] pb-24 text-slate-950"><header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#fafaf9]/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-4xl items-center px-5 sm:px-8"><button onClick={home} className="mr-3 rounded-full p-2 hover:bg-slate-100"><ArrowLeft size={20}/></button><h1 className="text-lg font-semibold">My Orders</h1></div></header><main className="mx-auto max-w-4xl px-5 py-7 sm:px-8">
    {active.length > 0 && <section><div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-medium text-slate-400">Right now</p><h2 className="text-2xl font-semibold tracking-tight">Active orders</h2></div><span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">{active.length}</span></div><div className="space-y-4">{active.map((order) => <OrderCard key={order.id} order={order} onClick={() => navigate(`/order/${order.id}`)}/>)}</div></section>}
    <section className={active.length ? "mt-10" : ""}><h2 className="text-2xl font-semibold tracking-tight">Previous orders</h2>{previous.length === 0 ? <div className="mt-4 rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200"><PackageCheck className="mx-auto text-slate-300" size={28}/><p className="mt-3 font-semibold">No previous orders</p><p className="mt-1 text-sm text-slate-500">Your completed orders will appear here.</p></div> : <div className="mt-4 space-y-3">{previous.map((order) => <OrderCard key={order.id} order={order} compact onClick={() => navigate(`/order/${order.id}`)}/>)}</div>}</section>
  </main><nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2 text-[11px] font-medium text-slate-500"><button onClick={home} className="rounded-xl py-2">Home</button><button onClick={menu} className="rounded-xl py-2">Menu</button><button onClick={cart} className="rounded-xl py-2">Cart</button><button className="rounded-xl py-2 text-slate-950">My Orders</button></div></nav></div>;
}

function OrderCard({ order, compact, onClick }) {
  const status = statusLabel(order); const delivery = order.orderType === "delivery"; const type = typeLabel(order.orderType); const itemCount = (order.items || []).reduce((n, i) => n + Number(i.quantity || 0), 0);
  return <button onClick={onClick} className="w-full rounded-2xl bg-white p-5 text-left ring-1 ring-slate-200/70 transition hover:ring-slate-300"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="text-sm font-bold">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{type}</span></div><p className="mt-1 text-xs text-slate-400">{itemCount} {itemCount === 1 ? "item" : "items"}{order.tableNumber ? ` · Table ${order.tableNumber}` : ""}{dateText(order.createdAt || order.timestamp) ? ` · ${dateText(order.createdAt || order.timestamp)}` : ""}</p></div><ChevronRight size={18} className="mt-1 text-slate-400"/></div>{!compact && <><div className="mt-5 flex items-center gap-2 text-sm font-semibold"><StatusIcon status={status}/>{status}</div><Progress order={order} status={status}/>{delivery && order.delivery?.area && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><MapPin size={14}/>{order.delivery.area}</p>}</>}<div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm text-slate-500">Total</span><span className="font-semibold">{money(order.total)}</span></div></button>;
}
function StatusIcon({status}) { if (status === "Completed") return <CheckCircle2 size={17}/>; if (status === "Preparing") return <Clock3 size={17}/>; if (status === "Ready" || status === "Ready for Pickup") return <PackageCheck size={17}/>; return <ShoppingBag size={17}/>; }
function Progress({order,status}) { const labels = order.orderType === "takeaway" ? ["Received","Accepted","Preparing","Ready for Pickup","Completed"] : order.orderType === "delivery" ? ["Received","Accepted","Preparing","Ready","Out for Delivery","Completed"] : ["Received","Accepted","Preparing","Ready","Completed"]; const idx = Math.max(0, labels.indexOf(status)); return <div className="mt-5 flex items-start">{labels.map((label, i) => <div key={label} className="flex min-w-0 flex-1 items-start"><div className="flex w-full flex-col items-center"><div className={`h-2.5 w-2.5 rounded-full ${i <= idx ? "bg-slate-950" : "bg-slate-200"}`}/><span className={`mt-2 text-center text-[9px] leading-3 ${i === idx ? "font-semibold text-slate-950" : "text-slate-400"}`}>{label}</span></div>{i < labels.length - 1 && <div className={`mt-1 h-px w-full ${i < idx ? "bg-slate-950" : "bg-slate-200"}`}/>}</div>)}</div>; }
