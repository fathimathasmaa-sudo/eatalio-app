import React,{useEffect,useState}from"react";
import{Link,useLocation}from"react-router-dom";
import{Home,Menu as MenuIcon,ShoppingBag,UserRound}from"lucide-react";

const CART_KEY="eatalio-cart";
function readCart(){try{const x=JSON.parse(localStorage.getItem(CART_KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}

export default function CustomerNavbar(){
 const location=useLocation();
 const[cartCount,setCartCount]=useState(()=>readCart().reduce((s,i)=>s+Number(i.quantity||0),0));
 useEffect(()=>{const sync=()=>setCartCount(readCart().reduce((s,i)=>s+Number(i.quantity||0),0));sync();window.addEventListener("eatalio-cart-updated",sync);window.addEventListener("storage",sync);return()=>{window.removeEventListener("eatalio-cart-updated",sync);window.removeEventListener("storage",sync)}},[]);
 const p=new URLSearchParams(location.search),table=p.get("table")||"",tableId=p.get("tableId")||"",orderType=p.get("orderType")||"";
 const contextQuery=()=>{const q=new URLSearchParams();if(table)q.set("table",table);if(tableId)q.set("tableId",tableId);if(orderType&&!table)q.set("orderType",orderType);return q.toString()?`?${q}`:""};
 const homePath=`/${contextQuery()}`,menuPath=`/menu${contextQuery()}`,cartPath=`/cart${contextQuery()}`;
 const items=[["/",homePath,"Home",Home],["/menu",menuPath,"Menu",MenuIcon],["/cart",cartPath,"Cart",ShoppingBag],["/orders","/orders","My Orders",UserRound]];
 const active=path=>path==="/"?location.pathname==="/":location.pathname===path||location.pathname.startsWith(`${path}/`);
 return <nav className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-[#fafaf9]/98 shadow-sm backdrop-blur" aria-label="Customer navigation">
  <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
   <Link to={homePath} className="flex shrink-0 items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-slate-100" aria-label="Eatalio home"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white">E</span><span className="text-sm font-semibold tracking-tight text-slate-950">Eatalio</span></Link>
   <div className="flex items-center gap-0.5 rounded-xl bg-white p-1 ring-1 ring-slate-200/80 shadow-sm">
    {items.map(([base,to,label,Icon])=><Link key={label} to={to} className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${active(base)?"bg-slate-950 text-white":"text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}><Icon size={15} strokeWidth={1.9}/><span>{label}</span>{label==="Cart"&&cartCount>0&&<span className={`flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${active(base)?"bg-white text-slate-950":"bg-slate-950 text-white"}`}>{cartCount}</span>}</Link>)}
   </div>
   <div className="w-[76px]" aria-hidden="true" />
  </div>
 </nav>;
}
