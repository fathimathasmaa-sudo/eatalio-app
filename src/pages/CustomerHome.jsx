import React, { useEffect, useMemo, useState } from "react";
import { ShoppingCart, UserRound, ArrowRight, Star } from "lucide-react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";

const defaultSettings = {
  restaurantName: "Eatalio",
  logoURL: "",
  address: "",
};

export default function CustomerHome() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table") || "";
  const [settings, setSettings] = useState(defaultSettings);
  const [featured, setFeatured] = useState([]);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const loadSettings = async () => {
      const snap = await getDoc(doc(db, "settings", "app"));
      if (snap.exists()) setSettings((prev) => ({ ...prev, ...snap.data() }));
    };
    loadSettings().catch(console.error);

    return onSnapshot(collection(db, "menu"), (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((item) => item.available !== false)
        .sort((a, b) => Number(b.popular || 0) - Number(a.popular || 0));
      setFeatured(items.slice(0, 4));
    });
  }, []);

  useEffect(() => {
    try {
      const cart = JSON.parse(localStorage.getItem("eatalio-cart") || "[]");
      setCartCount(cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    } catch {
      setCartCount(0);
    }
  }, []);

  const orderContext = useMemo(() => (table ? `Dine In · ${table}` : ""), [table]);

  const openMenu = () => navigate(table ? `/menu?table=${encodeURIComponent(table)}` : "/menu");

  return (
    <div className="min-h-screen bg-[#fafaf9] text-slate-950 pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[#fafaf9]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <button onClick={() => navigate(table ? `/?table=${encodeURIComponent(table)}` : "/")} className="flex items-center gap-3 text-left">
            {settings.logoURL ? (
              <img src={settings.logoURL} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">E</div>
            )}
            <span className="font-semibold tracking-tight">{settings.restaurantName}</span>
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate("/menu")} aria-label="Cart" className="relative rounded-full p-2.5 hover:bg-slate-100">
              <ShoppingCart size={20} strokeWidth={1.8} />
              {cartCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-950 px-1 text-[9px] font-bold text-white">{cartCount}</span>}
            </button>
            <button aria-label="Account" className="rounded-full p-2.5 hover:bg-slate-100"><UserRound size={20} strokeWidth={1.8} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {orderContext && (
          <div className="pt-5"><span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">🍽️ {orderContext}</span></div>
        )}

        <section className="pt-10 sm:pt-14">
          <p className="text-sm font-medium text-slate-500">Welcome to {settings.restaurantName}</p>
          <h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">Good food, made for your moment.</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-500">Discover a few favourites or explore the full menu and order your way.</p>
        </section>

        <section className="mt-8 flex items-center gap-2 text-sm font-medium text-slate-700">
          <Star size={17} fill="currentColor" />
          <span>4.8 · 126 ratings</span>
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Featured</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Popular right now</h2></div>
            <button onClick={openMenu} className="hidden items-center gap-1 text-sm font-semibold sm:flex">View menu <ArrowRight size={16} /></button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
            {featured.map((item) => (
              <button key={item.id} onClick={openMenu} className="group overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="aspect-square overflow-hidden bg-slate-100">
                  {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>}
                </div>
                <div className="p-3.5"><p className="truncate font-semibold">{item.name}</p><p className="mt-1 text-sm text-slate-500">MVR {Number(item.price || 0).toFixed(0)}</p></div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl bg-slate-950 p-6 text-white sm:flex sm:items-center sm:justify-between sm:p-8">
          <div><p className="text-lg font-semibold">Ready to order?</p><p className="mt-1 text-sm text-slate-300">Choose dine-in, takeaway, or delivery.</p></div>
          <button onClick={openMenu} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 sm:mt-0">Order Now <ArrowRight size={17} /></button>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2 text-[11px] font-medium text-slate-500">
          <button className="rounded-xl py-2 text-slate-950">Home</button>
          <button onClick={openMenu} className="rounded-xl py-2">Menu</button>
          <button onClick={() => navigate("/menu")} className="rounded-xl py-2">Cart{cartCount ? ` · ${cartCount}` : ""}</button>
          <button className="rounded-xl py-2">My Orders</button>
        </div>
      </nav>
    </div>
  );
}
