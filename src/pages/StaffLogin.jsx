// src/pages/StaffLogin.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { auth } from "../firebaseConfig";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { Users, ArrowLeft } from "lucide-react";

const StaffLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(getFirestore(), "staff", credential.user.uid));
      if (!snap.exists()) { alert("Access denied: staff profile not found."); await signOut(auth); return; }
      const role = String(snap.data()?.role || "").toLowerCase();
      if (role === "admin" || role === "staff") { navigate("/staff-dashboard"); }
      else if (role === "kitchen") { navigate("/kitchen"); }
      else { alert("Access denied: insufficient permissions."); await signOut(auth); }
    } catch (error) { alert(error.message); }
    finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!email) { alert("Please enter your email first."); return; }
    try { await sendPasswordResetEmail(auth, email); alert("Password reset email sent! Check your inbox."); }
    catch (error) { alert(error.message); }
  };

  return <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6"><motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><button type="button" onClick={()=>navigate("/")} className="mb-8 flex items-center text-sm text-slate-500"><ArrowLeft className="mr-2 h-4 w-4"/>Back</button><div className="mb-7 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100"><Users size={22}/></div><h2 className="text-2xl font-bold tracking-tight">Staff Login</h2><p className="mt-1 text-sm text-slate-500">Sign in to manage restaurant operations.</p></div><form onSubmit={handleLogin} className="space-y-4"><input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"/><input required type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"/><button disabled={loading} className="w-full rounded-xl bg-slate-950 py-3.5 font-semibold text-white">{loading?"Logging in…":"Login"}</button></form><button onClick={handleForgotPassword} className="mt-5 w-full text-sm font-medium text-slate-500 hover:text-slate-950">Forgot password?</button></motion.div></div>;
};
export default StaffLogin;
