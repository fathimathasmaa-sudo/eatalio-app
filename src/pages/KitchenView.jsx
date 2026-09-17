import React,{useEffect,useMemo,useState}from"react";
import{ChefHat,CheckCircle2,Clock3,RefreshCw}from"lucide-react";
import{collection,onSnapshot,query,where,doc,updateDoc,serverTimestamp}from"firebase/firestore";
import{db}from"../firebaseConfig";

const statusFor=o=>o.orderStatus||(o.status==="Pending"?"Received":o.status)||"Received";
const kitchenVisible=o=>["Accepted","Preparing","Ready","Ready for Pickup"].includes(statusFor(o));
const stages=t=>t==="takeaway"?["Preparing","Ready for Pickup"]:["Preparing","Ready"];
const sortOrders=list=>[...list].sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0));
const labelType=o=>o.orderType==='dine-in'?`Table ${o.tableNumber||'—'}`:o.orderType==='delivery'?'Delivery':'Takeaway';

export default function KitchenView(){
 const[orders,setOrders]=useState([]),[ready,setReady]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  const q=query(collection(db,'orders'),where('orderStatus','in',['Accepted','Preparing','Ready','Ready for Pickup']));
  const unsub=onSnapshot(q,s=>{setOrders(sortOrders(s.docs.map(d=>({id:d.id,...d.data()})).filter(kitchenVisible)));setReady(true);setError("")},e=>{console.error(e);setReady(true);setError(e.message||'Could not load kitchen orders.')});
  return()=>unsub();
 },[]);
 const prep=useMemo(()=>orders.filter(o=>statusFor(o)==='Accepted'),[orders]);
 const cooking=useMemo(()=>orders.filter(o=>statusFor(o)==='Preparing'),[orders]);
 const readyOrders=useMemo(()=>orders.filter(o=>['Ready','Ready for Pickup'].includes(statusFor(o))),[orders]);
 const advance=async(o,status)=>{
  const current=statusFor(o),allowed=stages(o.orderType);
  if(!allowed.includes(status)||current===status)return;
  if((current==='Accepted'&&status!=='Preparing')||(current==='Preparing'&&!['Ready','Ready for Pickup'].includes(status)))return;
  try{await updateDoc(doc(db,'orders',o.id),{orderStatus:status,status,updatedAt:serverTimestamp(),updatedBy:'kitchen-public'})}catch(e){alert(e.message||'Could not update order.')}
 };
 const Card=({o})=>{const status=statusFor(o),allowed=stages(o.orderType);return <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-slate-400">Order</p><h2 className="mt-1 text-2xl font-bold tracking-tight">#{o.orderNumber||o.id.slice(-6).toUpperCase()}</h2><p className="mt-1 text-sm font-medium text-slate-500">{labelType(o)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{status}</span></div><div className="mt-5 divide-y divide-slate-100">{(o.items||[]).map((i,n)=><div key={n} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="w-9 text-lg font-bold">{i.quantity}×</span><p className="font-medium">{i.name}</p></div>)}</div>{o.specialInstructions&&<div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><b>Note:</b> {o.specialInstructions}</div>}<div className="mt-5 grid grid-cols-2 gap-2">{allowed.map(s=><button key={s} disabled={status===s||status==='Ready'||status==='Ready for Pickup'} onClick={()=>advance(o,s)} className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-bold ${status===s?'bg-slate-950 text-white border-slate-950':'border-slate-200 bg-white disabled:opacity-40'}`}>{s}</button>)}</div></article>};
 if(!ready)return <div className="min-h-screen grid place-items-center bg-[#f7f7f5] text-sm text-slate-500">Loading kitchen…</div>;
 return <div className="min-h-screen bg-[#f7f7f5] text-slate-950"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white"><ChefHat size={19}/></div><div><h1 className="font-bold">Kitchen</h1><p className="text-xs text-slate-400">Order preparation display</p></div></div><button onClick={()=>window.location.reload()} className="rounded-xl p-2 hover:bg-slate-100" title="Refresh"><RefreshCw size={18}/></button></div></header><main className="mx-auto max-w-7xl px-5 py-7">{error&&<div className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}<div className="mb-7"><p className="text-sm font-medium text-slate-400">{orders.length} active kitchen order{orders.length===1?'':'s'}</p><h2 className="text-3xl font-semibold tracking-tight">Keep the kitchen moving.</h2></div><div className="grid gap-7 lg:grid-cols-3"><section><div className="mb-4 flex items-center gap-2"><Clock3 size={18}/><h3 className="font-semibold">Accepted · To prepare</h3><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">{prep.length}</span></div><div className="space-y-4">{prep.length?prep.map(o=><Card key={o.id} o={o}/>):<Empty text="Nothing waiting to be prepared."/>}</div></section><section><div className="mb-4 flex items-center gap-2"><ChefHat size={18}/><h3 className="font-semibold">Preparing</h3><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">{cooking.length}</span></div><div className="space-y-4">{cooking.length?cooking.map(o=><Card key={o.id} o={o}/>):<Empty text="Nothing is being prepared."/>}</div></section><section><div className="mb-4 flex items-center gap-2"><CheckCircle2 size={18}/><h3 className="font-semibold">Ready</h3><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">{readyOrders.length}</span></div><div className="space-y-4">{readyOrders.length?readyOrders.map(o=><Card key={o.id} o={o}/>):<Empty text="Nothing ready yet."/>}</div></section></div></main></div>}
function Empty({text}){return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">{text}</div>}