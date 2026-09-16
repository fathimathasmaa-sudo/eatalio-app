import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Minus, Plus, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";

const CART_KEY = "eatalio-cart";

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}

function formatPrice(value) {
  return `MVR ${Number(value || 0).toFixed(0)}`;
}

export default function CustomerMenu() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table") || "";
  const [menu, setMenu] = useState([]);
  const [restaurantName, setRestaurantName] = useState("Eatalio");
  const [logoURL, setLogoURL] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState(readCart);

  useEffect(() => {
    return onSnapshot(collection(db, "menu"), (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((item) => item.available !== false);
      setMenu(items);
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(doc(db, "settings", "app"));
        if (snap.exists()) {
          const data = snap.data();
          setRestaurantName(data.restaurantName || "Eatalio");
          setLogoURL(data.logoURL || "");
        }
      } catch (error) { console.error(error); }
    };
    load();
  }, []);

  const categories = useMemo(() => {
    const values = [...new Set(menu.map((item) => item.category).filter(Boolean))];
    return ["all", ...values];
  }, [menu]);

  const filtered = useMemo(() => menu.filter((item) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || item.name?.toLowerCase().includes(term) || item.description?.toLowerCase().includes(term);
    const matchesCategory = category === "all" || item.category === category;
    return matchesSearch && matchesCategory;
  }), [menu, search, category]);

  const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const cartTotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

  const persistCart = (next) => {
    setCart(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("eatalio-cart-updated"));
  };

  const addItem = (item, amount = 1) => {
    const existing = cart.find((entry) => entry.id === item.id);
    const next = existing
      ? cart.map((entry) => entry.id === item.id ? { ...entry, quantity: entry.quantity + amount } : entry)
      : [...cart, { ...item, quantity: amount }];
    persistCart(next);
    setSelectedItem(null);
    setQuantity(1);
  };

  const openItem = (item) => {
    setSelectedItem(item);
    setQuantity(1);
  };

  const goHome = () => navigate(table ? `/?table=${encodeURIComponent(table)}` : "/");
  const goCart = () => navigate(table ? `/cart?table=${encodeURIComponent(table)}` : "/cart");

  return (
    <div className="min-h-screen bg-[#fafaf9] pb-28 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#fafaf9]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <button onClick={goHome} className="flex items-center gap-3">
            {logoURL ? <img src={logoURL} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">E</span>}
            <span className="font-semibold tracking-tight">{restaurantName}</span>
          </button>
          <div className="flex items-center gap-1">
            <button onClick={goCart} className="relative rounded-full p-2.5 hover:bg-slate-100" aria-label="Cart">
              <ShoppingBag size={20} strokeWidth={1.8} />
              {cartCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-950 px-1 text-[9px] font-bold text-white">{cartCount}</span>}
            </button>
            <button className="rounded-full p-2.5 hover:bg-slate-100" aria-label="Account"><UserRound size={20} strokeWidth={1.8} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {table && <div className="pt-5"><span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">🍽️ Dine In · {table}</span></div>}

        <section className="pt-8 sm:pt-10">
          <p className="text-sm font-medium text-slate-400">Our menu</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">What are you having?</h1>
          <div className="relative mt-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu" className="h-12 w-full rounded-2xl border-0 bg-white pl-11 pr-4 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900" />
          </div>
        </section>

        <div className="-mx-5 mt-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-2">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)} className={`rounded-full px-4 py-2.5 text-sm font-medium capitalize transition ${category === cat ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
                {cat === "all" ? "All" : cat}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-7">
          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200"><p className="font-semibold">Nothing found</p><p className="mt-1 text-sm text-slate-500">Try another search or category.</p></div>
          ) : (
            <div className="divide-y divide-slate-200/80 rounded-2xl bg-white px-4 ring-1 ring-slate-200/70 sm:px-5">
              {filtered.map((item) => (
                <article key={item.id} className="flex gap-4 py-4 sm:gap-5">
                  <button onClick={() => openItem(item)} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 sm:h-28 sm:w-28">
                    {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>}
                  </button>
                  <button onClick={() => openItem(item)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-start justify-between gap-3"><h2 className="font-semibold leading-5">{item.name}</h2><span className="shrink-0 text-sm font-semibold">{formatPrice(item.price)}</span></div>
                    {item.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{item.description}</p>}
                    <p className="mt-2 text-xs font-medium text-slate-400">Tap for details</p>
                  </button>
                  <button onClick={() => addItem(item)} className="mt-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition hover:scale-105" aria-label={`Add ${item.name}`}><Plus size={18} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-[68px] left-0 right-0 z-20 px-4 sm:bottom-6">
          <button onClick={goCart} className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl bg-slate-950 px-5 py-3.5 text-white shadow-xl">
            <span className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag size={18} /> View Cart <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{cartCount}</span></span>
            <span className="flex items-center gap-1 text-sm font-semibold">{formatPrice(cartTotal)} <ChevronRight size={17} /></span>
          </button>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2 text-[11px] font-medium text-slate-500">
          <button onClick={goHome} className="rounded-xl py-2">Home</button>
          <button className="rounded-xl py-2 text-slate-950">Menu</button>
          <button onClick={goCart} className="rounded-xl py-2">Cart{cartCount ? ` · ${cartCount}` : ""}</button>
          <button onClick={() => navigate("/orders")} className="rounded-xl py-2">My Orders</button>
        </div>
      </nav>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" onClick={() => setSelectedItem(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-[1.15] overflow-hidden bg-slate-100">
              {selectedItem.image ? <img src={selectedItem.image} alt={selectedItem.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">No image</div>}
              <button onClick={() => setSelectedItem(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm"><X size={20} /></button>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-semibold tracking-tight">{selectedItem.name}</h2><span className="pt-1 font-semibold">{formatPrice(selectedItem.price)}</span></div>
              {selectedItem.description && <p className="mt-3 text-sm leading-6 text-slate-500">{selectedItem.description}</p>}
              <div className="mt-7 flex items-center justify-between rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200">
                <span className="pl-3 text-sm font-medium">Quantity</span>
                <div className="flex items-center gap-3"><button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200"><Minus size={17} /></button><span className="w-5 text-center font-semibold">{quantity}</span><button onClick={() => setQuantity((q) => q + 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200"><Plus size={17} /></button></div>
              </div>
              <button onClick={() => addItem(selectedItem, quantity)} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-semibold text-white">Add to Cart · {formatPrice(Number(selectedItem.price || 0) * quantity)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
