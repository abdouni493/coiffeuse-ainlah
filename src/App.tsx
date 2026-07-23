import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import Reservations from './components/Reservations';
import Prestations from './components/Prestations';
import Employees from './components/Employees';
import Inventory from './components/Inventory';
import Expenses from './components/Expenses';
import Reports from './components/Reports';
import Configuration from './components/Configuration';
import WorkerPayments from './components/WorkerPayments';
import Products from './components/Products';
import ProductPurchases from './components/ProductPurchases';
import Sales from './components/Sales';
import Clients from './components/Clients';
import Caisse from './components/Caisse';
import { User, StoreConfig, Role } from './types';
import { supabase } from './lib/supabase';
import { fetchUserProfile } from './lib/utils';
import { ACTIVE_TAB_KEY } from './lib/localStorageService';

const DEFAULT_TAB_ADMIN  = 'dashboard';
const DEFAULT_TAB_WORKER = 'reservations';

function getStoredTab(role?: string): string {
  try {
    const stored = sessionStorage.getItem(ACTIVE_TAB_KEY);
    if (stored) return stored;
  } catch { /* ignore */ }
  return role === 'worker' ? DEFAULT_TAB_WORKER : DEFAULT_TAB_ADMIN;
}

function saveTab(tab: string): void {
  try { sessionStorage.setItem(ACTIVE_TAB_KEY, tab); } catch { /* ignore */ }
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated]     = useState(false);
  const [activeTab, setActiveTabState]            = useState<string>('dashboard');
  const [user, setUser]                           = useState<User | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile]                   = useState(false);
  const [isLoading, setIsLoading]                 = useState(true);
  const [storeConfig, setStoreConfig]             = useState<StoreConfig>({
    name:      'Salon de Beauté',
    slogan:    'Votre beauté, notre passion',
    phone:     '',
    location:  '',
    facebook:  '',
    instagram: '',
  });

  // Wrapper that also persists the tab choice
  const setActiveTab = (tab: string) => {
    saveTab(tab);
    setActiveTabState(tab);
  };

  // ── Auth restore ──────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData.session?.user) {
          const profileData = await fetchUserProfile(sessionData.session.user.id);

          if (profileData) {
            const userData: User = {
              id:        sessionData.session.user.id,
              username:  profileData.username,
              email:     sessionData.session.user.email || '',
              fullName:  profileData.full_name,
              role:      profileData.role as Role,
              avatar:    profileData.avatar_url,
              phone:     profileData.phone,
              address:   profileData.address,
              paymentType: profileData.payment_type,
              percentage:  profileData.percentage,
              dailyRate:   profileData.daily_rate,
              monthlyRate: profileData.monthly_rate,
              createdAt:   profileData.created_at,
            };
            setUser(userData);
            setIsAuthenticated(true);
            // Restore the last visited tab (fallback to role default)
            setActiveTab(getStoredTab(profileData.role));
          } else {
            await supabase.auth.signOut();
          }
        }
      } catch (err) {
        console.error('Auth restore failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUser(null);
        sessionStorage.removeItem(ACTIVE_TAB_KEY);
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  // ── Responsive sidebar ────────────────────────────────────────────────────
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setIsSidebarCollapsed(true);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-collapse sidebar on tab change (mobile)
  useEffect(() => {
    if (isMobile) setIsSidebarCollapsed(true);
  }, [activeTab, isMobile]);

  // ── Store config ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from('store_config')
        .select('*')
        .eq('id', 1)
        .single();

      if (data) {
        setStoreConfig({
          name:      data.name     || 'Salon de Beauté',
          slogan:    data.slogan   || '',
          phone:     data.phone    || '',
          location:  data.location || '',
          facebook:  data.facebook || '',
          instagram: data.instagram || '',
          tiktok:    data.tiktok   || '',
          logo:      data.logo_url || '',
        });
      }
    };
    fetchConfig();
  }, []);

  // ── Login / Logout ────────────────────────────────────────────────────────
  const handleLogin = (userData: User) => {
    setUser(userData);
    setIsAuthenticated(true);
    const defaultTab = (userData.role === 'admin' || userData.role === 'super_admin')
      ? DEFAULT_TAB_ADMIN
      : DEFAULT_TAB_WORKER;
    setActiveTab(defaultTab);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUser(null);
    sessionStorage.removeItem(ACTIVE_TAB_KEY);
  };

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex min-h-screen bg-primary-bg">
      <Sidebar
        role={user?.role || 'worker'}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobile={isMobile}
        config={storeConfig}
      />

      <div className={"flex-1 flex flex-col min-w-0 " + (!isSidebarCollapsed && !isMobile ? 'ml-[280px]' : '')}>
        <Navbar
          user={user!}
          config={storeConfig}
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {activeTab === 'dashboard'        && <Dashboard setActiveTab={setActiveTab} user={user} />}
                {activeTab === 'reservations'     && <Reservations user={user!} config={storeConfig} />}
                {activeTab === 'clients'          && <Clients config={storeConfig} />}
                {activeTab === 'my-payments'      && <WorkerPayments user={user!} />}
                {activeTab === 'prestations'      && <Prestations />}
                {activeTab === 'employees'        && <Employees />}
                {activeTab === 'suppliers'        && <Inventory initialTab="suppliers" />}
                {activeTab === 'products'         && <Products />}
                {activeTab === 'product-purchases'&& <ProductPurchases />}
                {activeTab === 'sales'            && <Sales config={storeConfig} />}
                {activeTab === 'caisse'           && <Caisse user={user!} />}
                {activeTab === 'expenses'         && <Expenses />}
                {activeTab === 'reports'          && <Reports />}
                {activeTab === 'config'           && <Configuration user={user!} config={storeConfig} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
