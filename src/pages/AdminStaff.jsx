import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, Users, ShieldCheck, Copy, Check, UserX } from "lucide-react";
import { auth, db } from "../firebaseConfig";
import firebaseConfig from "../firebaseConfig";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const ROLES = ["admin", "staff", "kitchen"];
const initialForm = { name: "", email: "", phone: "", role: "staff" };
const makePassword = () => `Eat${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}!`;

function isAdminProfile(data) {
  if (!data || typeof data !== "object") return false;
  const role = String(data.role || data.Role || data.userRole || "").trim().toLowerCase();
  return role === "admin" || data.isAdmin === true;
}

export default function AdminStaff() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]), [form, setForm] = useState(initialForm), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [notice, setNotice] = useState(""), [temporaryPassword, setTemporaryPassword] = useState(""), [copied, setCopied] = useState(false);
  useEffect(() => {
    let unsubStaff;
    const unsubAuth = onAuthStateChanged(auth, async user => {
      if (!user) return navigate("/AdminLogin");
      try {
        const snap = await getDoc(doc(db, "staff", user.uid));
        if (!snap.exists() || !isAdminProfile(snap.data())) return navigate("/AdminLogin");
        unsubStaff = onSnapshot(collection(db, "staff"), s => setStaff(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => String(a.name||a.email).localeCompare(String(b.name||b.email)))), err => setNotice(err?.message || "Could not load staff accounts."));
      } catch (err) {
        setNotice(err?.message || "Could not verify admin access.");
      } finally { setLoading(false); }
    });
    return () => { unsubAuth(); unsubStaff?.(); };
  }, [navigate]);
  const addStaff = async e => {
    e.preventDefault(); setNotice(""); setTemporaryPassword("");
    const name=form.name.trim(), email=form.email.trim().toLowerCase(), phone=form.phone.trim();
    if (!name || !email) return setNotice("Name and email are required. Email is used for Firebase login.");
    setSaving(true); const secondary=initializeApp(firebaseConfig, `staff-create-${Date.now()}`);
    try { const secondaryAuth=getAuth(secondary), password=makePassword(), cred=await createUserWithEmailAndPassword(secondaryAuth,email,password); await setDoc(doc(db,"staff",cred.user.uid),{name,email,phone,role:form.role,active:true,createdAt:serverTimestamp(),createdBy:auth.currentUser?.uid||null}); setTemporaryPassword(password); setNotice(`Staff account created for ${email}. Save the temporary password now; it will not be shown again.`); setForm(initialForm); }
    catch(err) { setNotice(err.code === "auth/email-already-in-use" ? "That email already has a Firebase account." : (err.message || "Could not create staff account.")); }
    finally { try { await signOut(getAuth(secondary)); await deleteApp(secondary); } catch {} setSaving(false); }
  };
  const toggleActive = async member => {
    if(member.id===auth.currentUser?.uid) return setNotice("You cannot deactivate your own admin account here.");
    const next=member.active===false;
    if(!next && !window.confirm(`Deactivate ${member.name || member.email}?`)) return;
    try { await updateDoc(doc(db,"staff",member.id),{active:next,updatedAt:serverTimestamp()}); setNotice(`${member.name || member.email} is now ${next?"active":"inactive"}.`); } catch(err) { setNotice(err.message || "Could not update staff member."); }
  };
  const copyPassword=async()=>{ if(!temporaryPassword)return; await navigator.clipboard.writeText(temporaryPassword); setCopied(true); setTimeout(()=>setCopied(false),1600); };
  if(loading) return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-500">Loading staff…</div>;
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4"><button type="button" onClick={()=>navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm font-medium text-slate-600"><ArrowLeft size={18}/> Admin</button><div className="flex items-center gap-2"><Users size={18}/><span className="font-bold">Staff</span></div><div className="w-16"/></div></header><main className="mx-auto max-w-5xl space-y-6 px-5 py-7">
  {notice&&<div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium">{notice}</div>}
  {temporaryPassword&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center justify-between gap-4"><div><div className="text-sm font-bold">Temporary password</div><code className="mt-1 block text-sm">{temporaryPassword}</code></div><button type="button" onClick={copyPassword} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm">{copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copied":"Copy"}</button></div></div>}
  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-3"><UserPlus size={20}/><div><h2 className="font-bold">Add staff</h2><p className="text-xs text-slate-500">Create a Firebase login and assign an Eatalio role.</p></div></div><form onSubmit={addStaff} className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-sm font-medium">Name</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"/></label><label><span className="mb-1.5 block text-sm font-medium">Email (login)</span><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"/></label><label><span className="mb-1.5 block text-sm font-medium">Phone</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"/></label><label><span className="mb-1.5 block text-sm font-medium">Role</span><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm">{ROLES.map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}</select></label><div className="md:col-span-2 flex justify-end"><button disabled={saving} className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"><UserPlus size={17}/>{saving?"Creating…":"Create staff account"}</button></div></form></section>
  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-3"><ShieldCheck size={20}/><div><h2 className="font-bold">Staff access</h2><p className="text-xs text-slate-500">Deactivate accounts instead of deleting staff records.</p></div></div><div className="divide-y divide-slate-100">{staff.map(member=><div key={member.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">{member.name||"Unnamed staff"}</div><div className="text-sm text-slate-500">{member.email}{member.phone?` · ${member.phone}`:""}</div><div className="mt-1 flex items-center gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 font-medium">{member.role||"staff"}</span><span className={member.active===false?"text-slate-400":"text-emerald-700"}>{member.active===false?"Inactive":"Active"}</span></div></div><button type="button" onClick={()=>toggleActive(member)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><UserX size={16}/>{member.active===false?"Reactivate":"Deactivate"}</button></div>)}{staff.length===0&&<p className="py-6 text-sm text-slate-500">No staff profiles yet.</p>}</div></section>
 </main></div>;
}
