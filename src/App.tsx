import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

import CustomerDashboard from './pages/customer/Dashboard';
import Products from './pages/customer/Products';
import Cart from './pages/customer/Cart';
import Orders from './pages/customer/Orders';
import CustomerInvoices from './pages/customer/Invoices';
import CustomerPayments from './pages/customer/Payments';
import Account from './pages/customer/Account';
import AccountSettings from './pages/customer/AccountSettings';

import AdminDashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/Products';
import AdminCustomers from './pages/admin/Customers';
import AdminOrders from './pages/admin/Orders';
import AdminInvoices from './pages/admin/Invoices';
import AdminPayments from './pages/admin/Payments';
import AdminSettings from './pages/admin/Settings';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <Spinner />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />

      <Route path="/dashboard" element={<RequireAuth><Layout><CustomerDashboard /></Layout></RequireAuth>} />
      <Route path="/products" element={<RequireAuth><Layout><Products /></Layout></RequireAuth>} />
      <Route path="/cart" element={<RequireAuth><Layout><Cart /></Layout></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><Layout><Orders /></Layout></RequireAuth>} />
      <Route path="/orders/:id" element={<RequireAuth><Layout><Orders /></Layout></RequireAuth>} />
      <Route path="/invoices" element={<RequireAuth><Layout><CustomerInvoices /></Layout></RequireAuth>} />
      <Route path="/payments" element={<RequireAuth><Layout><CustomerPayments /></Layout></RequireAuth>} />
      <Route path="/account" element={<RequireAuth><Layout><Account /></Layout></RequireAuth>} />
      <Route path="/account-settings" element={<RequireAuth><Layout><AccountSettings /></Layout></RequireAuth>} />

      <Route path="/admin" element={<RequireAuth><RequireAdmin><Layout><AdminDashboard /></Layout></RequireAdmin></RequireAuth>} />
      <Route path="/admin/products" element={<RequireAuth><RequireAdmin><Layout><AdminProducts /></Layout></RequireAdmin></RequireAuth>} />
      <Route path="/admin/customers" element={<RequireAuth><RequireAdmin><Layout><AdminCustomers /></Layout></RequireAdmin></RequireAuth>} />
      <Route path="/admin/orders" element={<RequireAuth><RequireAdmin><Layout><AdminOrders /></Layout></RequireAdmin></RequireAuth>} />
      <Route path="/admin/invoices" element={<RequireAuth><RequireAdmin><Layout><AdminInvoices /></Layout></RequireAdmin></RequireAuth>} />
      <Route path="/admin/payments" element={<RequireAuth><RequireAdmin><Layout><AdminPayments /></Layout></RequireAdmin></RequireAuth>} />
      <Route path="/admin/settings" element={<RequireAuth><RequireAdmin><Layout><AdminSettings /></Layout></RequireAdmin></RequireAuth>} />

      <Route path="/" element={<Navigate to={user ? (isAdmin ? '/admin' : '/dashboard') : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
