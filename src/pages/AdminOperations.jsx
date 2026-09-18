import React, { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Eye, LogOut, Search, Utensils, Truck, ShoppingBag, X, Clock } from "lucide-react";
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseConfig";

const statusOf = (o) => o.orderStatus || (o.status === "Pending" ? "Received" : o.status) || "Received";
const stages = (t) => t === "takeaway" ? ["Received", "Accepted", "Preparing", "Ready for Pickup", "Completed"] : t === "delivery" ? ["Received", "Accepted", "Preparing", "Ready", "Out for Delivery", "Completed"] : ["Received", "Accepted", "Preparing", "Ready", "Completed"];
const statusOptions = (o) => { const s = statusOf(o); const a = stages(o.orderType); return s === "Received" ? ["Accepted"] : a.filter((x) => x !== "Received"); };
const money = (v) => `MVR ${Math.round(Number(v || 0))}`;
const type = (t) => t === "dine-in" ? "Dine In" : t === "delivery" ? "Delivery" : "Takeaway";
const open = (o) => !["Completed", "Cancelled", "Canceled"].includes(statusOf(o));

function createdMillis(o) {
  const value = o.createdAt ?? o.timestamp ?? o.created_at;
  if (!value) return 0;
  if (typeof value === "number") return value < 100000000000 ? value * 1000 : value;
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isNaN(parsed) ? 0 : parsed; }
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  return 0;
}

function ageLabel(o, now) {
  const created = createdMillis(o);
  if (!created) return "Just now";
  const diff = Math.max(0, now - created);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function orderTypeMeta(orderType) {
  if (orderType === "dine-in") return { label: "Table", Icon: Utensils };
  if (orderType === "delivery") return { label: "Delivery", Icon: Truck };
  return { label: "Takeaway", Icon: ShoppingBag };
}

export default function AdminOperations() {
  const navigate = useNavigate();
  const [ok, setOk] = useState(false), [loading, setLoading] = useState(true), [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("orders"), [filter, setFilter] = useState("active"), [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null), [closing, setClosing] = useState(""), [now, setNow] = useState(Date.now());

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) { navigate("/AdminLogin"); return; }
      const s = await getDoc(doc(db, "staff", u.uid)); const d = s.data() || {};
      if (String(d.role || "").toLowerCase() !== "admin" && d.isAdmin !== true) { navigate("/"); return; }
      setOk(true); setLoading(false);
    });
    return unsub;
  }, [navigate]);

  useEffect(() => onSnapshot(collection(db, "orders"), (snap) => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => createdMillis(b) - createdMillis(a)))), []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);

  const sessions = useMemo(() => {
    const map = {};
    orders.filter(o => o.orderType === "dine-in" && o.tableSessionId).forEach(o => {
      const id = o.tableSessionId;
      if (!map[id]) map[id] = { id, tableId: o.tableId, tableNumber: o.tableNumber || "—", orders: [], total: 0 };
      map[id].orders.push(o); map[id].total += Number(o.total || 0);
    });
    return Object.values(map);
  }, [orders]);

  const list = useMemo(() => orders.filter(o => {
    const st = statusOf(o), ps = o.payment?.status || o.paymentStatus || "Pending";
    let matches;
    if (tab === "payments") {
      matches = filter === "payment" ? ps === "Pending" : filter === "cash" ? (o.payment?.method || o.paymentMethod) === "cash" : filter === "bank-transfer" ? (o.payment?.method || o.paymentMethod) === "bank-transfer" : filter === "confirmed" ? ps === "Confirmed" : filter === "rejected" ? ps === "Rejected" : true;
    } else {
      matches = filter === "active" ? open(o) : filter === "completed" ? st === "Completed" : filter === "cancelled" ? ["Cancelled", "Canceled"].includes(st) : true;
    }
    const q = search.trim().toLowerCase();
    return matches && (!q || `${o.id} ${o.orderNumber || ""} ${o.customerName || ""} ${o.customerPhone || ""} ${o.tableNumber || ""} ${o.tableSessionId || ""}`.toLowerCase().includes(q));
  }), [orders, filter, search, tab]);

  const columns = useMemo(() => ({ "dine-in": list.filter(o => o.orderType === "dine-in"), takeaway: list.filter(o => o.orderType === "takeaway"), delivery: list.filter(o => o.orderType === "delivery") }), [list]);

  const update = async (o, fields) => {
    const fromStatus = statusOf(o), toStatus = fields.orderStatus || fromStatus;
    if (fields.orderStatus && !statusOptions(o).includes(fields.orderStatus)) return;
    await updateDoc(doc(db, "orders", o.id), { ...fields, updatedAt: serverTimestamp() });
    if (toStatus !== fromStatus) await addDoc(collection(db, "activityLogs"), { action: "order_status_changed", orderId: o.id, orderNumber: o.orderNumber || "", fromStatus, toStatus, actorId: auth.currentUser?.uid || "", actorRole: "admin", createdAt: serverTimestamp() });
  };

  const payment = async (o, s) => {
    const uid = auth.currentUser?.uid || null;
    await update(o, { paymentStatus: s, payment: { ...(o.payment || {}), status: s, reviewedBy: uid, reviewedAt: serverTimestamp() } });
    await addDoc(collection(db, "activityLogs"), { action: `payment_${String(s).toLowerCase()}`, orderId: o.id, orderNumber: o.orderNumber || null, performedBy: uid, createdAt: serverTimestamp() });
  };

  const closeSession = async (session) => {
    if (!session.tableId || closing) return;
    const activeOrders = session.orders.filter(open);
    if (activeOrders.length) { alert(`Finish or cancel the ${activeOrders.length} active order${activeOrders.length === 1 ? "" : "s"} before closing this table session.`); return; }
    setClosing(session.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "tableSessions", session.id), { status: "closed", closedAt: serverTimestamp(), closedBy: auth.currentUser?.uid || null, total: session.total, orderIds: session.orders.map(o => o.id) });
      batch.update(doc(db, "tables", session.tableId), { currentSessionId: null, currentSessionStatus: "closed", lastSessionId: session.id, lastSessionClosedAt: serverTimestamp() });
      await batch.commit();
      await addDoc(collection(db, "activityLogs"), { action: "table_session_closed", tableSessionId: session.id, tableId: session.tableId, tableNumber: session.tableNumber, orderIds: session.orders.map(o => o.id), performedBy: auth.currentUser?.uid || null, createdAt: serverTimestamp() });
    } finally { setClosing(""); }
  };

  const logout = async () => { await signOut(auth); navigate("/AdminLogin"); };
  if (loading || !ok) return <div className="grid min-h-screen place-items-center bg-[#f7f7f5] text-sm text-slate-500">Loading admin workspace…</div>;

  return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5"><div><h1 className="font-bold">Eatalio Admin</h1><p className="text-xs text-slate-400">Operations</p></div><div className="flex gap-2"><button onClick={() => navigate("/staff-dashboard")} className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100">Staff</button><button onClick={logout} className="rounded-xl p-2 hover:bg-slate-100"><LogOut size={18}/></button></div></div></header>
    <main className="mx-auto max-w-7xl px-5 py-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm text-slate-400">Restaurant operations</p><h2 className="text-3xl font-semibold tracking-tight">Orders & payments</h2></div><div className="flex rounded-xl bg-white p-1 ring-1 ring-slate-200"><button onClick={() => {setTab("orders");setFilter("active")}} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "orders" ? "bg-slate-950 text-white" : ""}`}>Orders</button><button onClick={() => {setTab("payments");setFilter("payment")}} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "payments" ? "bg-slate-950 text-white" : ""}`}>Payments</button></div></div>
      <section className="mt-6"><div className="mb-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dine-in table sessions</p><h3 className="text-xl font-bold">Open table activity</h3></div><div className="grid gap-3 lg:grid-cols-2">{sessions.filter(s => s.orders.some(open)).map(s => <SessionCard key={s.id} session={s} closing={closing === s.id} onClose={() => closeSession(s)} now={now}/>)}</div>{!sessions.some(s => s.orders.some(open)) && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-400">No open dine-in sessions.</div>}</section>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders, customers or tables" className="h-11 w-full rounded-xl bg-white pl-10 pr-3 text-sm ring-1 ring-slate-200 outline-none"/></div><div className="flex gap-2 overflow-x-auto">{(tab === "payments" ? [["payment","Pending"],["cash","Cash"],["bank-transfer","Bank Transfer"],["confirmed","Confirmed"],["rejected","Rejected"],["all","All"]] : [["active","Active"],["completed","Completed"],["cancelled","Cancelled"],["all","All"]]).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${filter === value ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</button>)}</div></div>
      {tab === "orders" ? <div className="mt-7 grid gap-5 lg:grid-cols-3"><OrderColumn title="Table" subtitle="Dine-in" Icon={Utensils} orders={columns["dine-in"]} now={now} view={setSelected} changeStatus={(o,s) => update(o,{orderStatus:s,status:s})}/><OrderColumn title="Takeaway" subtitle="Pickup orders" Icon={ShoppingBag} orders={columns.takeaway} now={now} view={setSelected} changeStatus={(o,s) => update(o,{orderStatus:s,status:s})}/><OrderColumn title="Delivery" subtitle="Delivery orders" Icon={Truck} orders={columns.delivery} now={now} view={setSelected} changeStatus={(o,s) => update(o,{orderStatus:s,status:s})}/></div> : <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map(o => <AdminCard key={o.id} o={o} now={now} paymentMode view={() => setSelected(o)} changeStatus={s => update(o,{orderStatus:s,status:s})} confirm={() => payment(o,"Confirmed")} reject={() => payment(o,"Rejected")}/>)}{!list.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400 md:col-span-2 xl:col-span-3">Nothing to show.</div>}</div>}
    </main>
    {selected && <AdminModal o={selected} now={now} close={() => setSelected(null)} changeStatus={s => update(selected,{orderStatus:s,status:s})}/>}</div>;
}

function OrderColumn({title,subtitle,Icon,orders,now,view,changeStatus}) { return <section className="min-w-0"><div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200/70"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon size={18}/></div><div><h3 className="font-bold">{title}</h3><p className="text-xs text-slate-400">{subtitle}</p></div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{orders.length}</span></div><div className="space-y-4">{orders.map(o => <AdminCard key={o.id} o={o} now={now} view={() => view(o)} changeStatus={s => changeStatus(o,s)}/>)}{!orders.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">No {title.toLowerCase()} orders</div>}</div></section>; }

function SessionCard({session,onClose,closing,now}) { const active=session.orders.filter(open).length; return <article className="rounded-2xl bg-slate-950 p-5 text-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current session</p><h4 className="mt-1 text-xl font-bold">Table {session.tableNumber}</h4><p className="mt-1 text-xs text-slate-400">Session {session.id}</p></div><Utensils size={20}/></div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4"><div><p className="text-xs text-slate-400">{session.orders.length} order rounds · {active} active</p><p className="text-lg font-bold">{money(session.total)}</p></div><button disabled={closing||active>0} onClick={onClose} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">{closing?"Closing…":active?"Finish orders first":"Close table session"}</button></div><div className="mt-4 space-y-2">{session.orders.map(o => <div key={o.id} className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm"><span>#{o.orderNumber||o.id.slice(-6).toUpperCase()}</span><span className="text-slate-300">{statusOf(o)} · {ageLabel(o,now)}</span></div>)}</div></article>; }

function AdminCard({o,paymentMode,view,changeStatus,confirm,reject,now}) { const st=statusOf(o), ps=o.payment?.status||o.paymentStatus||"Pending", options=statusOptions(o), terminal=["Completed","Cancelled","Canceled"].includes(st); const {label,Icon}=orderTypeMeta(o.orderType); return <article className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700"><Icon size={19} strokeWidth={1.9}/></div><div className="min-w-0"><p className="text-xs font-semibold text-slate-400">#{o.orderNumber||o.id.slice(-6).toUpperCase()}</p><h3 className="mt-1 truncate font-bold">{o.orderType === "dine-in" ? `Table ${o.tableNumber||"—"}` : label}</h3><p className="mt-1 text-xs text-slate-400">{(o.items||[]).reduce((n,i)=>n+Number(i.quantity||0),0)} items · {money(o.total)}</p></div></div><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">{paymentMode?ps:st}</span></div><div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><Clock size={13}/><span>{ageLabel(o,now)}</span></div>{o.customerName&&<p className="mt-3 text-sm font-medium">{o.customerName} <span className="text-xs font-normal text-slate-400">{o.customerPhone&&`· ${o.customerPhone}`}</span></p>}{o.orderType === "dine-in"&&o.tableSessionId&&<p className="mt-2 text-xs text-slate-400">Table {o.tableNumber||"—"} · current session</p>}<div className="mt-4 border-t border-slate-100 pt-3">{(o.items||[]).slice(0,3).map((i,n)=><p key={n} className="text-sm"><b>{i.quantity}×</b> {i.name}</p>)}{(o.items||[]).length>3&&<p className="mt-1 text-xs text-slate-400">+ {(o.items||[]).length-3} more item(s)</p>}</div>{!paymentMode&&!terminal&&<div className="mt-4 grid grid-cols-2 gap-2">{options.map(s=><button key={s} onClick={()=>changeStatus(s)} className={`rounded-xl border px-2 py-2 text-xs font-semibold ${st===s?"border-slate-950 bg-slate-950 text-white":"border-slate-200 bg-white"}`}>{s}</button>)}</div>}<div className="mt-4 flex gap-2"><button onClick={view} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold"><Eye className="mr-1 inline" size={15}/>Details</button>{paymentMode&&ps==="Pending"&&<><button onClick={confirm} className="rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white" title="Confirm payment"><Check size={16}/></button><button onClick={reject} className="rounded-xl border border-slate-200 px-3" title="Reject payment"><X size={16}/></button></>}</div>{o.payment?.slipURL&&paymentMode&&<a href={o.payment.slipURL} target="_blank" rel="noreferrer" className="mt-3 block text-xs font-semibold underline">View payment slip</a>}</article>; }

function AdminModal({o,close,changeStatus,now}) { const ps=o.payment?.status||o.paymentStatus||"Pending", options=statusOptions(o), terminal=["Completed","Cancelled","Canceled"].includes(statusOf(o)); return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onClick={close}><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6" onClick={e=>e.stopPropagation()}><div className="flex justify-between gap-4"><div><p className="text-xs text-slate-400">#{o.orderNumber||o.id.slice(-6).toUpperCase()}</p><h2 className="text-2xl font-bold">{type(o.orderType)}</h2><p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Clock size={12}/>{ageLabel(o,now)}</p>{o.tableSessionId&&<p className="mt-1 text-xs text-slate-400">Table {o.tableNumber} · Session {o.tableSessionId}</p>}</div><button onClick={close} className="rounded-full p-2 hover:bg-slate-100"><X/></button></div><div className="mt-5 space-y-4">{o.customerName&&<div><b>{o.customerName}</b><p className="text-sm text-slate-500">{o.customerPhone}</p></div>}{o.delivery&&<div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{o.delivery.area}</b><p>{o.delivery.address}</p>{o.delivery.landmark&&<p className="text-xs text-slate-500">Landmark: {o.delivery.landmark}</p>}</div>}{o.specialInstructions&&<div className="rounded-xl bg-slate-50 p-4 text-sm"><b>Special instructions</b><p className="mt-1 text-slate-600">{o.specialInstructions}</p></div>}<div>{(o.items||[]).map((i,n)=><div key={n} className="flex justify-between border-b py-2 text-sm"><span>{i.quantity}× {i.name}</span><span>{money(Number(i.price||0)*Number(i.quantity||0))}</span></div>)}</div><div className="rounded-xl bg-slate-50 p-4"><p className="font-semibold"><CreditCard className="mr-2 inline" size={16}/>Payment</p><p className="text-sm">{o.payment?.method||o.paymentMethod||"Not required"} · {ps}</p>{o.payment?.reviewedBy&&<p className="mt-1 text-xs text-slate-400">Reviewed by {o.payment.reviewedBy}</p>}{o.payment?.slipURL&&<a href={o.payment.slipURL} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">View slip</a>}</div><div className="flex justify-between font-bold"><span>Total</span><span>{money(o.total)}</span></div>{!terminal&&<div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Change status</p><div className="grid grid-cols-2 gap-2">{options.map(s=><button key={s} onClick={()=>changeStatus(s)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusOf(o)===s?"border-slate-950 bg-slate-950 text-white":"border-slate-200 bg-white"}`}>{s}</button>)}</div></div>}</div></div></div>; }
