import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import RoleSelect from "./pages/LoginSelection";
import AdminLogin from "./pages/AdminLogin";
import StaffLogin from "./pages/StaffLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminOperations from "./pages/AdminOperations";
import AdminMenu from "./pages/AdminMenu";
import AdminDeliveryPayments from "./pages/AdminDeliveryPayments";
import AdminTables from "./pages/AdminTables";
import AdminSettings from "./pages/AdminSettings";
import AdminStaff from "./pages/AdminStaff";
import AdminReports from "./pages/AdminReports";
import AdminDemoData from "./pages/AdminDemoData";
import StaffOrders from "./pages/StaffOrders";
import CustomerHome from "./pages/CustomerHome";
import CustomerMenu from "./pages/CustomerMenu";
import CustomerCart from "./pages/CustomerCart";
import CustomerCheckout from "./pages/CustomerCheckout";
import CustomerOrders from "./pages/CustomerOrders";
import CustomerOrder from "./pages/CustomerOrder";
import KitchenView from "./pages/KitchenView";

class RouteErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Eatalio customer route error", error, info); }
  componentDidUpdate(previousProps) {
    if (previousProps.routeKey !== this.props.routeKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[#fafaf9] px-6 py-16 text-slate-950">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-7 text-center ring-1 ring-slate-200">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Please try this page again.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Reload</button>
        </div>
      </div>
    );
  }
}

function AppRoutes() {
  const location = useLocation();
  useEffect(() => {
    const handleCustomerTabClick = (event) => {
      const link = event.target.closest?.("a");
      const nav = link?.closest?.("nav");
      if (!link || !nav || !["/", "/menu", "/cart", "/orders"].includes(link.pathname)) return;
      if (link.origin !== window.location.origin) return;
      const target = `${link.pathname}${link.search}${link.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (target === current) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(target);
    };
    document.addEventListener("click", handleCustomerTabClick, true);
    return () => document.removeEventListener("click", handleCustomerTabClick, true);
  }, []);
  return (
    <RouteErrorBoundary routeKey={`${location.pathname}${location.search}`}>
      <Routes>
        <Route path="/" element={<CustomerHome />} />
        <Route path="/login" element={<RoleSelect />} />
        <Route path="/AdminLogin" element={<AdminLogin />} />
        <Route path="/StaffLogin" element={<StaffLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/operations" element={<AdminOperations />} />
        <Route path="/admin/menu" element={<AdminMenu />} />
        <Route path="/admin/delivery-payments" element={<AdminDeliveryPayments />} />
        <Route path="/admin/tables" element={<AdminTables />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/staff" element={<AdminStaff />} />
        <Route path="/admin/reports" element={<AdminReports />} />
        <Route path="/admin/demo-data" element={<AdminDemoData />} />
        <Route path="/staff-dashboard" element={<StaffOrders />} />
        <Route path="/kitchen" element={<KitchenView />} />
        <Route path="/menu" element={<CustomerMenu />} />
        <Route path="/cart" element={<CustomerCart />} />
        <Route path="/checkout" element={<CustomerCheckout />} />
        <Route path="/orders" element={<CustomerOrders />} />
        <Route path="/order/:id" element={<CustomerOrder />} />
        <Route path="*" element={<CustomerHome />} />
      </Routes>
    </RouteErrorBoundary>
  );
}

export default function App() {
  return <Router><AppRoutes /></Router>;
}
