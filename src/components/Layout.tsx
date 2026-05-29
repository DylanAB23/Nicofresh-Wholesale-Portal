import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, FileText, CreditCard,
  Users, LogOut, Menu, X, ChevronDown, Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import CartToast from './CartToast';

const customerNav = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Products', icon: Package, path: '/products' },
  { label: 'Orders', icon: ShoppingCart, path: '/orders' },
  { label: 'Invoices', icon: FileText, path: '/invoices' },
  { label: 'Payments', icon: CreditCard, path: '/payments' },
  { label: 'Account Settings', icon: Settings, path: '/account-settings' },
];

const adminNav = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
  { label: 'Products', icon: Package, path: '/admin/products' },
  { label: 'Customers', icon: Users, path: '/admin/customers' },
  { label: 'Orders', icon: ShoppingCart, path: '/admin/orders' },
  { label: 'Invoices', icon: FileText, path: '/admin/invoices' },
  { label: 'Payments', icon: CreditCard, path: '/admin/payments' },
  { label: 'Settings', icon: Settings, path: '/admin/settings' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const { hasItems } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const nav = isAdmin ? adminNav : customerNav;

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  function isActive(path: string) {
    if (path === '/admin' || path === '/dashboard') return location.pathname === path;
    return location.pathname.startsWith(path);
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-brand-950 transform transition-transform duration-300 ease-in-out flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-900">
          <img src="/image.png" alt="Nicofresh" className="w-8 h-8 object-contain brightness-0 invert" />
          <div>
            <p className="font-bold text-white text-sm leading-tight">Nicofresh</p>
            <p className="text-brand-300 text-xs">{isAdmin ? 'Admin Portal' : 'Wholesale Portal'}</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-brand-400 hover:text-white p-1"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ label, icon: Icon, path }) => (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive(path)
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-brand-200 hover:bg-brand-900 hover:text-white'}`}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-brand-900">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-brand-900 mb-1">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {profile?.store_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{profile?.store_name || '...'}</p>
              <p className="text-brand-400 text-xs truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-300 hover:bg-brand-900 hover:text-red-400 transition-all"
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-4 lg:px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <Menu size={20} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {!isAdmin && (
              <Link to="/cart" className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                <ShoppingCart size={20} />
                {hasItems && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-brand-600 border-2 border-white rounded-full" />
                )}
              </Link>
            )}

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
                  {profile?.store_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="text-sm text-gray-700 font-medium hidden sm:block max-w-[120px] truncate">
                  {profile?.store_name || 'Account'}
                </span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-1">
                    {!isAdmin && (
                      <Link to="/account" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setUserMenuOpen(false)}>
                        <Settings size={14} />
                        Account Settings
                      </Link>
                    )}
                    <hr className="my-1 border-gray-100" />
                    <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      <LogOut size={14} />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Add-to-cart notification (customers only) */}
      {!isAdmin && <CartToast />}
    </div>
  );
}
