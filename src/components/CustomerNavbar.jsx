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
 return <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 shadow-[0_-6px_20px_rgba(15,23,42,0.07)] backdrop-blur-md" style={{paddingBottom:"env(safe-area-inset-bottom)"}} aria-label="Customer navigation">
  <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-3 sm:h-16 sm:px-4">
   <div className="grid w-full grid-cols-4 items-center gap-1 rounded-2xl bg-white p-1 ring-1 ring-slate-200/80 shadow-sm">
    {items.map(([base,to,label,Icon])=>{const isActive=active(base);return <Link key={label} to={to} aria-current={isActive?"page":undefined} className={`relative flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium leading-none transition-colors sm:gap-2 sm:px-3 sm:py-2.5 sm:text-xs ${isActive?"bg-slate-950 text-white":"text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}><span className="relative flex h-5 w-5 shrink-0 items-center justify-center"><Icon size={20} strokeWidth={1.9}/>{label==="Cart"&&cartCount>0&&<span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-slate-950 px-1 text-[8px] font-bold leading-none text-white ring-2 ring-white">{cartCount>99?"99+":cartCount}</span>}</span><span className="truncate">{label}</span></Link>})}
   </div>
  </div>
 </nav>;
}
