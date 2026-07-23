import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Search, User as UserIcon, Menu, Scissors, Store } from 'lucide-react';
import { User, StoreConfig } from '../types';
import { cn } from '../lib/utils';

interface NavbarProps {
  user: User;
  config: StoreConfig;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, config, isSidebarCollapsed, setIsSidebarCollapsed }) => {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-20 glass border-b border-border px-4 md:px-8 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3 md:gap-4">
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="p-2.5 rounded-2xl hover:bg-accent/10 text-accent transition-all duration-300 active:scale-90 lg:hidden"
        >
          <Menu size={22} />
        </button>
        
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center shadow-inner overflow-hidden border border-accent/20">
            {config.logo ? (
              <img src={config.logo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Store size={24} className="text-accent" />
            )}
          </div>
          <div className="hidden sm:block">
            <h1 className="font-serif font-bold text-xl text-ink leading-none tracking-tight">{config.name || "Éclat & Soie"}</h1>
            <p className="text-[10px] uppercase tracking-[0.15em] text-accent mt-1.5 font-semibold opacity-70">{config.slogan || "Votre beauté, notre passion"}</p>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex items-center bg-white/40 rounded-full px-5 py-2.5 border border-border w-96 group focus-within:border-accent/40 transition-all duration-300">
        <Search size={18} className="text-ink/30 group-focus-within:text-accent transition-colors" />
        <input 
          type="text" 
          placeholder="Rechercher une réservation, un client..." 
          className="bg-transparent border-none focus:ring-0 text-sm ml-3 w-full placeholder:text-ink/30 font-medium"
        />
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className={cn(
              "relative p-2.5 rounded-xl transition-all duration-300",
              showNotifications ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-ink/40 hover:text-accent hover:bg-accent/5"
            )}
          >
            <Bell size={22} />
            <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-accent rounded-full border-2 border-white shadow-sm animate-pulse"></span>
          </button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowNotifications(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-3 w-80 bg-white rounded-3xl shadow-2xl border border-border overflow-hidden z-50"
                >
                  <div className="p-5 border-b border-border flex justify-between items-center bg-primary-bg/30">
                    <h4 className="font-bold text-ink">Notifications</h4>
                    <button 
                      onClick={() => setShowNotifications(false)}
                      className="text-[10px] bg-accent/10 text-accent hover:bg-accent hover:text-white px-2 py-1 rounded-full font-bold transition-all"
                    >
                      Marquer tout comme lu
                    </button>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {[
                      { title: 'Nouvelle réservation', desc: 'Amira Benali a réservé pour demain à 14:00', time: 'Il y a 5 min' },
                      { title: 'Stock faible', desc: 'Le stock de Shampoing Kérastase est presque épuisé', time: 'Il y a 2h' },
                      { title: 'Paiement reçu', desc: 'Facture FAC-2025-003 réglée par Karim', time: 'Il y a 5h' },
                    ].map((n, i) => (
                      <div key={i} className="p-4 hover:bg-accent/5 transition-colors border-b border-border/50 cursor-pointer group">
                        <p className="font-bold text-sm text-ink group-hover:text-accent transition-colors">{n.title}</p>
                        <p className="text-xs text-ink/60 mt-1">{n.desc}</p>
                        <p className="text-[10px] text-ink/30 mt-2 font-medium italic">{n.time}</p>
                      </div>
                    ))}
                  </div>
                  <button className="w-full py-4 text-xs font-bold text-accent hover:bg-accent/5 transition-colors border-t border-border">
                    Voir toutes les notifications
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        
        <div className="flex items-center gap-3 pl-4 md:pl-6 border-l border-border">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-ink leading-none tracking-tight">{user.username || user.fullName}</p>
            <p className="text-[10px] uppercase tracking-wider text-accent mt-1.5 font-bold opacity-60">
              {user.role === 'admin' || user.role === 'super_admin' ? 'Administrateur' : user.role === 'worker' ? 'Employé' : 'Utilisateur'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-full border-2 border-accent/20 p-0.5 shadow-sm hover:border-accent/40 transition-colors cursor-pointer overflow-hidden bg-white">
            {user.avatar ? (
              <img src={user.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full bg-accent/10 flex items-center justify-center">
                <UserIcon size={20} className="text-accent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
