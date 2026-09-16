import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { Download, LogOut, Plus, Printer, Trash2, X, Utensils } from "lucide-react";

const money = (v) => `MVR ${Number(v || 0).toFixed(2)}`;
const closedStatus = ["Completed", "Cancelled", "Canceled"];
const qrImageUrl = (url, size = 900) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${encodeURIComponent(url)}`;

export default function AdminTables() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        navigate("/AdminLogin");
        return;
      }

      const { getDoc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "staff", user.uid));
      const data = snap.data() || {};
      if (String(data.role || "").toLowerCase() !== "admin" && data.isAdmin !== true) {
        navigate("/");
        return;
      }
      setAuthorized(true);
    });

    return unsubscribe;
  }, [navigate]);

  useEffect(() => {
    return onSnapshot(collection(db, "tables"), (snapshot) => {
      setTables(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      );
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "orders"), (snapshot) => {
      setOrders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  }, []);

  const sessionByTable = useMemo(() => {
    const map = {};

    orders
      .filter((order) => order.orderType === "dine-in" && order.tableId && order.tableSessionId)
      .forEach((order) => {
        if (!map[order.tableId]) {
          map[order.tableId] = {
            sessionId: order.tableSessionId,
            orders: [],
            total: 0,
            openOrders: 0,
          };
        }

        if (map[order.tableId].sessionId !== order.tableSessionId) return;

        map[order.tableId].orders.push(order);
        map[order.tableId].total += Number(order.total || 0);

        const status = order.orderStatus || (order.status === "Pending" ? "Received" : order.status);
        if (!closedStatus.includes(status)) map[order.tableId].openOrders += 1;
      });

    return map;
  }, [orders]);

  const customerUrl = (table) =>
    `${window.location.origin}/?table=${encodeURIComponent(table.code || table.name)}&tableId=${encodeURIComponent(table.id)}`;

  const create = async (event) => {
    event.preventDefault();
    const tableName = name.trim();
    if (!tableName) return;

    setBusy(true);
    try {
      const code = tableName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      await addDoc(collection(db, "tables"), {
        name: tableName,
        code,
        active: true,
        currentSessionId: null,
        currentSessionStatus: "closed",
        createdAt: serverTimestamp(),
      });

      setName("");
    } catch (error) {
      alert(error.message || "Unable to add table.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (table) => {
    if (table.currentSessionStatus === "open") {
      alert("Close the current table session before removing this table.");
      return;
    }

    if (confirm(`Remove ${table.name}?`)) {
      await deleteDoc(doc(db, "tables", table.id));
    }
  };

  const openQr = (table) => setSelected(table);

  const download = () => {
    if (!selected) return;
    const link = document.createElement("a");
    link.href = qrImageUrl(customerUrl(selected), 1200);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = `${selected.name}-QR.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const print = () => {
    if (!selected) return;
    const qrUrl = qrImageUrl(customerUrl(selected), 1200);
    const windowRef = window.open("", "_blank");
    if (!windowRef) return;

    windowRef.document.write(`
      <html>
        <head><title>${selected.name} QR</title></head>
        <body style="font-family:Arial;text-align:center;padding:60px">
          <h1>${selected.name}</h1>
          <img style="width:520px" src="${qrUrl}" alt="${selected.name} QR"/>
          <p>Scan to order</p>
        </body>
      </html>
    `);
    windowRef.document.close();
    windowRef.onload = () => windowRef.print();
  };

  const logout = async () => {
    await signOut(auth);
    navigate("/AdminLogin");
  };

  if (!authorized) {
    return <div className="min-h-screen grid place-items-center bg-[#f7f7f5] text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div>
            <h1 className="font-bold">Eatalio Admin</h1>
            <p className="text-xs text-slate-400">Tables & QR codes</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/admin/menu")} className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100">Menu</button>
            <button onClick={() => navigate("/admin/operations")} className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100">Orders</button>
            <button onClick={logout} className="rounded-xl p-2 hover:bg-slate-100"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7">
        <p className="text-sm text-slate-400">Dine-in setup</p>
        <h2 className="text-3xl font-semibold tracking-tight">Tables & QR codes</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Each QR opens Eatalio with its table context. Guests can place multiple orders during the same table session.</p>

        <form onSubmit={create} className="mt-6 flex max-w-xl gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Table name or number, e.g. Table 12" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none" />
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"><Plus size={16} />{busy ? "Adding…" : "Add table"}</button>
        </form>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => {
            const session = sessionByTable[table.id];
            const open = table.currentSessionStatus === "open" && table.currentSessionId;

            return (
              <article key={table.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold">{table.name}</h3>
                    <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${open ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-slate-300"}`} />
                      {open ? "Open" : "Available"}
                    </div>
                  </div>
                  <button onClick={() => remove(table)} className="rounded-lg p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>

                {open && session ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold"><Utensils size={14} /> {session.orders.length} order round{session.orders.length === 1 ? "" : "s"}</p>
                    <p className="mt-1 text-lg font-bold">{money(session.total)}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{session.openOrders} still active</p>
                    <button onClick={() => navigate("/admin/operations")} className="mt-3 w-full rounded-lg bg-white py-2 text-xs font-semibold ring-1 ring-slate-200">View session</button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-400">Ready for the next diners.</p>
                )}

                <div className="mt-5 flex gap-2">
                  <button onClick={() => openQr(table)} className="flex-1 rounded-xl bg-slate-950 py-2.5 text-xs font-semibold text-white">View QR</button>
                  <button onClick={() => navigate(`/?table=${encodeURIComponent(table.code || table.name)}&tableId=${encodeURIComponent(table.id)}`)} className="rounded-xl bg-slate-100 px-3 text-xs font-semibold">Open</button>
                </div>
              </article>
            );
          })}
        </div>

        {!tables.length && <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">No tables yet. Add your first table above.</div>}
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center">
            <div className="flex justify-end"><button onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-slate-100"><X size={18} /></button></div>
            <h2 className="text-2xl font-bold">{selected.name}</h2>
            <p className="mt-1 text-sm text-slate-400">Scan to open the dine-in menu</p>
            <img src={qrImageUrl(customerUrl(selected), 900)} alt={`${selected.name} QR`} className="mx-auto my-6 w-72 rounded-xl" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={download} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-semibold"><Download size={16} /> Download</button>
              <button onClick={print} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-semibold text-white"><Printer size={16} /> Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
