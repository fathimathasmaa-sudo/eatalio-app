import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
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
import StaffOrders from "./pages/StaffOrders";
import CustomerHome from "./pages/CustomerHome";
import CustomerMenu from "./pages/CustomerMenu";
import CustomerCart from "./pages/CustomerCart";
import CustomerCheckout from "./pages/CustomerCheckout";
import CustomerOrders from "./pages/CustomerOrders";
import CustomerOrder from "./pages/CustomerOrder";
import KitchenView from "./pages/KitchenView";

export default function App() {
  return <Router><Routes>
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
    <Route path="/staff-dashboard" element={<StaffOrders />} />
    <Route path="/kitchen" element={<KitchenView />} />
    <Route path="/menu" element={<CustomerMenu />} />
    <Route path="/cart" element={<CustomerCart />} />
    <Route path="/checkout" element={<CustomerCheckout />} />
    <Route path="/orders" element={<CustomerOrders />} />
    <Route path="/order/:id" element={<CustomerOrder />} />
  </Routes></Router>;
}
