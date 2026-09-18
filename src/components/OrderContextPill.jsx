import React from "react";
import { Utensils, ShoppingBag, Truck } from "lucide-react";

export default function OrderContextPill({ orderType = "", table = "" }) {
  const isDineIn = Boolean(table) || orderType === "dine-in";
  if (!isDineIn && !orderType) return null;
  const Icon = isDineIn ? Utensils : orderType === "delivery" ? Truck : ShoppingBag;
  const label = isDineIn ? `Dine In${table ? ` · ${table}` : ""}` : orderType === "delivery" ? "Delivery" : "Takeaway";
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200"><Icon size={13} strokeWidth={2}/>{label}</span>;
}
