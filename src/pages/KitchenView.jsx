import React, { useEffect, useMemo, useState } from "react";
import { ChefHat, CheckCircle2, Clock3, LogOut, Play, Volume2, VolumeX } from "lucide-react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseConfig";

const activeStatuses = ["Received", "Pending", "Accepted", "Preparing"];
const statusFor = (o) => o.orderStatus || (o.status === "Pending" ? "Received" : o.status) || "Received";

export default function KitchenView() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [sound, setSound] = useState(true);
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let alive = true;
    let unsubOrders = () => {};
    let staffUnsub = () => {};
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (alive) { setAuthorized(false); setReady(true); }
        navigate("/StaffLogin");
        return;
      }
      staffUnsub();
      staffUnsub = onSnapshot(doc(db, "staff", user.uid), (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const role = String(data.role || data.Role || data.userRole || "").toLowerCase();
        const allowed = data.active !== false && (role === "kitchen" || role === "admin" || data.isAdmin === true);
        if (!alive) return;
        setAuthorized(allowed);
        unsubOrders();
        if (!allowed) {
          setOrders([]); setReady(true); navigate("/"); return;
        }
        unsubOrders = onSnapshot(collection(db, "kitchenOrders"), (snap) => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(o => activeStatuses.includes(statusFor(o)))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          if (alive) { setOrders(data); setReady(true); }
        }, () => alive && setReady(true));
      }, () => { if (alive) { setAuthorized(false); setReady(true); } });
    });
    return () => { alive = false; unsubOrders(); staffUnsub(); unsubAuth(); };
  }, [navigate]);

  const start = async (o) => updateDoc(doc(db, "orders", o.id), { orderStatus: "Preparing", status: "Preparing", updatedAt: serverTimestamp() });
  const finish = async (o) => { const next = o.orderType === "takeaway" ? "Ready for Pickup" : "Ready"; await updateDoc(doc(db, "orders", o.id), { orderStatus: next, status: next, updatedAt: serverTimestamp() }); };
  const logout = async () => { await signOut(auth); navigate("/StaffLogin"); };
  const prep = useMemo(() => orders.filter(o => ["Received", "Pending", "Accepted"].includes(statusFor(o))), [orders]);
  const cooking = useMemo(() => orders.filter(o => statusFor(o) === "Preparing"), [orders]);
  const Card = ({ o }) => <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-slate-400">#{o.orderNumber || o.id.slice(-6).toUpperCase()}</p><h2 className="mt-1 text-lg font-bold">{o.orderType === "dine-in" ? `Table ${o.tableNumber || "—"}` : o.orderType === "delivery" ? "Delivery" : "Takeaway"}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{statusFor(o)}</span></div><div className="mt-5 divide-y divide-slate-100">{(o.items || []).map((i, n) => <div key={n} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="w-8 text-center text-lg font-bold">{i.quantity}×</span><div><p className="font-medium">{i.name}</p></div></div>)}</div>{o.specialInstructions && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><b>Note:</b> {o.specialInstructions}</div>}<button onClick={() => statusFor(o) === "Preparing" ? finish(o) : start(o)} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white">{statusFor(o) === "Preparing" ? <><CheckCircle2 size={17}/> Mark Ready</> : <><Play size={17}/> Start Preparing</>}</button></article>;
  if (!ready || !authorized) return <div className="min-h-screen grid place-items-center bg-[#f7f7f5] text-sm text-slate-500">Checking kitchen access…</div>;
  return <div className="min-h-screen bg-[#f7f7f5] text-slate-950"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white"><ChefHat size={19}/></div><div><h1 className="font-bold">Kitchen</h1><p className="text-xs text-slate-400">Order preparation</p></div></div><div className="flex items-center gap-2"><button onClick={() => setSound(!sound)} className="rounded-xl p-2 hover:bg-slate-100">{sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button><button onClick={logout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100"><LogOut size={17}/> Logout</button></div></div></header><main className="mx-auto max-w-7xl px-5 py-7"><div className="mb-7"><p className="text-sm font-medium text-slate-400">{`${orders.length} active order${orders.length === 1 ? "" : "s"}`}</p><h2 className="text-3xl font-semibold tracking-tight">Keep the kitchen moving.</h2></div><div className="grid gap-7 lg:grid-cols-2"><section><div className="mb-4 flex items-center gap-2"><Clock3 size={18}/><h3 className="font-semibold">To prepare</h3><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">{prep.length}</span></div><div className="space-y-4">{prep.length ? prep.map(o => <Card key={o.id} o={o}/>) : <Empty text="Nothing waiting to be prepared."/>}</div></section><section><div className="mb-4 flex items-center gap-2"><ChefHat size={18}/><h3 className="font-semibold">Preparing</h3><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">{cooking.length}</span></div><div className="space-y-4">{cooking.length ? cooking.map(o => <Card key={o.id} o={o}/>) : <Empty text="Nothing is being prepared."/>}</div></section></div></main></div>;
}
function Empty({ text }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">{text}</div>; }
