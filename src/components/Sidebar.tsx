import React from 'react';
import { motion, AnimatePresence, Variants } from 'motion/react';
import {
  LayoutDashboard,
  CalendarHeart,
  Users,
  Wallet,
  Scissors,
  Truck,
  Package,
  ShoppingCart,
  Store,
  UserCog,
  Receipt,
  Banknote,
  PieChart,
  Settings,
  ChevronLeft,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Role, StoreConfig } from '../types';

interface SidebarProps {
  role: Role;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobile: boolean;
  config: StoreConfig;
  /** Optional per-worker permission map. When present (and role === 'worker'),
   *  only interfaces with granted actions are shown. */
  permissions?: Record<string, string[]>;
}

type MenuItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
  /** Always visible to a worker regardless of permission map. */
  always?: boolean;
};

type MenuSection = { section: string; items: MenuItem[] };

const MENU: MenuSection[] = [
  {
    section: 'Principal',
    items: [
      { id: 'dashboard',    label: 'Tableau de bord', icon: LayoutDashboard, roles: ['admin', 'worker', 'super_admin'] },
      { id: 'reservations', label: 'Réservations',     icon: CalendarHeart,  roles: ['admin', 'worker', 'super_admin'] },
      { id: 'clients',      label: 'Clients',          icon: Users,          roles: ['admin', 'worker', 'super_admin'] },
      { id: 'my-payments',  label: 'Mes Paiements',    icon: Wallet,         roles: ['worker'], always: true },
    ],
  },
  {
    section: 'Catalogue',
    items: [
      { id: 'prestations',      label: 'Prestations & Services', icon: Scissors,     roles: ['admin', 'super_admin'] },
      { id: 'products',         label: 'Produits',               icon: Package,      roles: ['admin', 'super_admin'] },
      { id: 'product-purchases',label: 'Achats Produits',        icon: ShoppingCart, roles: ['admin', 'super_admin'] },
      { id: 'sales',            label: 'Point de Vente',         icon: Store,        roles: ['admin', 'super_admin'] },
    ],
  },
  {
    section: 'Gestion',
    items: [
      { id: 'suppliers', label: 'Fournisseurs', icon: Truck,   roles: ['admin', 'super_admin'] },
      { id: 'employees', label: 'Employés',     icon: UserCog, roles: ['admin', 'super_admin'] },
    ],
  },
  {
    section: 'Finances',
    items: [
      { id: 'caisse',   label: 'Caisse',    icon: Banknote, roles: ['admin', 'super_admin'] },
      { id: 'expenses', label: 'Dépenses',  icon: Receipt,  roles: ['admin', 'super_admin'] },
      { id: 'reports',  label: 'Rapports',  icon: PieChart, roles: ['admin', 'super_admin'] },
    ],
  },
  {
    section: 'Système',
    items: [
      { id: 'config', label: 'Paramètres', icon: Settings, roles: ['admin', 'worker', 'super_admin'], always: true },
    ],
  },
];

const Sidebar: React.FC<SidebarProps> = ({
  role,
  activeTab,
  setActiveTab,
  onLogout,
  isCollapsed,
  setIsCollapsed,
  isMobile,
  config,
  permissions,
}) => {
  const canSee = (item: MenuItem): boolean => {
    // Admins / super-admins: driven purely by the item's role list.
    if (role === 'admin' || role === 'super_admin') {
      return item.roles.includes(role);
    }
    // Workers: always-on items are visible; everything else is gated by the
    // per-worker permission map (needs the "view" action on that interface).
    if (item.always) return true;
    const acts = permissions?.[item.id];
    return Array.isArray(acts) && acts.includes('view');
  };

  const sections = MENU
    .map(s => ({ ...s, items: s.items.filter(canSee) }))
    .filter(s => s.items.length > 0);

  const sidebarVariants: Variants = {
    open: {
      x: 0,
      width: isMobile ? '100%' : 280,
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 30 },
    },
    closed: {
      x: isMobile ? '-100%' : -280,
      width: isMobile ? '100%' : 0,
      opacity: isMobile ? 1 : 0,
      transition: { type: 'spring', stiffness: 300, damping: 30 },
    },
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobile && !isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsCollapsed(true)}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={isCollapsed ? 'closed' : 'open'}
        variants={sidebarVariants}
        className={cn(
          'fixed h-screen z-50 overflow-hidden flex flex-col',
          'bg-gradient-to-b from-white/80 via-[#FBF3F5]/85 to-[#F6E8EC]/80 backdrop-blur-2xl',
          'border-r border-accent/15 shadow-[0_10px_40px_-15px_rgba(183,110,121,0.25)]',
          isCollapsed ? 'pointer-events-none' : 'pointer-events-auto',
        )}
      >
        {/* Decorative glow */}
        <div className="absolute -top-16 -right-10 w-40 h-40 rounded-full bg-accent-light/25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-24 -left-12 w-40 h-40 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center shadow-lg shadow-accent/30 overflow-hidden shrink-0">
              {config.logo ? (
                <img src={config.logo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Sparkles className="text-white w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <span className="block font-serif font-bold text-xl tracking-tight text-ink leading-tight truncate">
                {config.name || 'Éclat & Soie'}
              </span>
              {config.slogan && (
                <span className="block text-[10px] uppercase tracking-[0.15em] text-accent/70 truncate">
                  {config.slogan}
                </span>
              )}
            </div>
          </div>

          {isMobile && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-2 rounded-full hover:bg-accent/10 text-accent transition-colors shrink-0"
            >
              <ChevronLeft size={22} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-4 custom-scrollbar">
          {sections.map(sec => (
            <div key={sec.section}>
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink/30">
                {sec.section}
              </p>
              <div className="space-y-1">
                {sec.items.map(item => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        if (isMobile) setIsCollapsed(true);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all duration-300 group relative',
                        active ? 'text-white' : 'text-ink/60 hover:bg-white/60 hover:text-accent',
                      )}
                    >
                      {active && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute inset-0 bg-gradient-to-r from-accent to-accent-light shadow-lg shadow-accent/30 rounded-2xl -z-10"
                          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                        />
                      )}
                      <span
                        className={cn(
                          'flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 shrink-0',
                          active ? 'bg-white/25' : 'bg-white/50 group-hover:bg-accent/10',
                        )}
                      >
                        <item.icon
                          size={19}
                          className={cn(
                            'transition-transform duration-300 group-active:scale-90',
                            active ? 'text-white' : 'text-accent/70 group-hover:text-accent',
                          )}
                        />
                      </span>
                      <span className="font-medium text-sm tracking-tight truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-4 pt-3 pb-5 mt-auto border-t border-accent/10">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl text-ink/50 hover:bg-red-50 hover:text-red-500 transition-all duration-300 group"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/50 group-hover:bg-red-100 transition-colors">
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
            <span className="font-medium text-sm">Déconnexion</span>
          </button>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;
