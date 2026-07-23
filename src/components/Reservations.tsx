import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Minus,
  Search,
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Eye,
  Edit2,
  Trash2,
  Printer,
  CreditCard,
  Scissors,
  DollarSign,
  AlertCircle,
  Sparkles,
  Trash,
  Package,
  Zap,
  UserPlus,
  UserCheck,
  Users,
  Award
} from 'lucide-react';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Reservation, Prestation, Service, User as Employee, StoreConfig, FidelityConfig } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { hasPermission } from '../lib/permissions';

const DEFAULT_FIDELITY: FidelityConfig = {
  enabled: true,
  reservations_required: 10,
  reduction_type: 'percentage',
  reduction_value: 50,
};

/**
 * A fidelity cycle is `reservations_required` paid visits FOLLOWED BY one
 * rewarded visit — so with `reservations_required = 3` the 4th, 8th, 12th …
 * visits carry the reduction.
 *
 * `priorVisits` is how many finalized visits the client already has, so the
 * visit being created right now is number `priorVisits + 1`.
 */
export function isRewardVisit(priorVisits: number, cfg: FidelityConfig): boolean {
  const required = Number(cfg.reservations_required) || 0;
  if (!cfg.enabled || required <= 0 || priorVisits < required) return false;
  return priorVisits % (required + 1) === required;
}

/** Reduction in DA to deduct from `gross` for a reward visit. */
export function fidelityReduction(gross: number, cfg: FidelityConfig): number {
  if (gross <= 0) return 0;
  const value = Number(cfg.reduction_value) || 0;
  const raw = cfg.reduction_type === 'percentage' ? (gross * value) / 100 : value;
  return Math.min(gross, Math.max(0, Math.round(raw)));
}

// Global styles for invoice logo
const logoStyles = `
  html {
    scroll-behavior: smooth;
  }
  
  .logo-circle {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%) !important;
    border: 3px solid #c8966c !important;
    flex-shrink: 0;
  }
  
  .logo-circle img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  /* Mobile Calendar Scrolling */
  @media (max-width: 768px) {
    .overflow-x-auto {
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
    }
  }
`;


interface ReservationsProps {
  user: Employee;
  config: StoreConfig;
}

// A lightweight client record used by the reservation client picker.
type PickerClient = { id: string; name: string; phone?: string | null };

// Colour presets so the picker matches the surrounding step (rose "accent" for
// scheduled reservations, "emerald" for walk-ins).
// NOTE: every class is a complete static string (no runtime interpolation) so
// Tailwind's JIT can detect and generate them.
const PICKER_THEMES = {
  accent: {
    bg: 'bg-accent', bgSoft: 'bg-accent/10', softText: 'text-accent',
    border: 'border-accent', hoverBorder: 'hover:border-accent/40', ring: 'focus:border-accent/40',
    grad: 'from-accent to-accent-light', tabActive: 'bg-accent text-on-accent shadow-lg shadow-accent/20',
    focusText: 'group-focus-within:text-accent', hoverBg: 'group-hover:bg-accent',
  },
  emerald: {
    bg: 'bg-emerald-500', bgSoft: 'bg-emerald-500/10', softText: 'text-emerald-600',
    border: 'border-emerald-500', hoverBorder: 'hover:border-emerald-400/40', ring: 'focus:border-emerald-400/50',
    grad: 'from-emerald-500 to-emerald-600', tabActive: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20',
    focusText: 'group-focus-within:text-emerald-500', hoverBg: 'group-hover:bg-emerald-500',
  },
} as const;

interface ClientPickerProps {
  theme?: keyof typeof PICKER_THEMES;
  clients: PickerClient[];
  name: string;
  phone: string;
  selectedId: string | null;
  onSelect: (client: PickerClient) => void;
  onClear: () => void;
  onCreate: (name: string, phone: string) => Promise<PickerClient | null>;
  defaultTab?: 'search' | 'create';
}

// Reusable client step used by both reservation flows. It lets the operator
// search an existing client (by name or phone) and pick it, OR create a brand
// new client that is persisted to the database right away.
const ClientPicker: React.FC<ClientPickerProps> = ({
  theme = 'accent', clients, name, phone, selectedId, onSelect, onClear, onCreate, defaultTab = 'search',
}) => {
  const t = PICKER_THEMES[theme];
  const [tab, setTab] = useState<'search' | 'create'>(defaultTab);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const hasClient = !!name.trim();

  const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 6);
    const qn = norm(query);
    return clients
      .filter(c => c.name.toLowerCase().includes(q) || norm(c.phone || '').includes(qn))
      .slice(0, 8);
  }, [query, clients]);

  const handleCreate = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    const created = await onCreate(newName, newPhone);
    setBusy(false);
    if (created) {
      onSelect(created);
      setNewName(''); setNewPhone(''); setQuery(''); setTab('search');
    }
  };

  // ── Selected client summary ──────────────────────────────────────────────
  if (hasClient) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        className={cn('p-5 sm:p-6 rounded-[28px] bg-surface border-2 shadow-sm flex items-center gap-4', t.border)}
      >
        <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center text-white font-serif font-bold text-2xl shrink-0 bg-gradient-to-br', t.grad)}>
          {name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-serif font-bold text-xl text-ink tracking-tight truncate">{name}</h4>
            {selectedId ? (
              <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest flex items-center gap-1', t.bgSoft, t.softText)}>
                <UserCheck size={11} /> Fiche
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-ink/5 text-ink/40">Nouveau</span>
            )}
          </div>
          {phone.trim()
            ? <p className="text-sm font-semibold text-ink/50 flex items-center gap-1.5 mt-0.5"><Phone size={13} /> {phone}</p>
            : <p className="text-xs font-medium text-ink/30 italic mt-0.5">Aucun téléphone</p>}
        </div>
        <button
          onClick={onClear}
          className="px-4 py-2.5 rounded-xl bg-ink/5 text-ink/50 font-bold text-xs uppercase tracking-widest hover:bg-panel hover:text-white transition-all duration-300 flex items-center gap-1.5 shrink-0"
        >
          <X size={14} /> Changer
        </button>
      </motion.div>
    );
  }

  // ── Search / Create tabs ─────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex p-1.5 rounded-2xl bg-primary-bg/60 border border-border">
        <button
          onClick={() => setTab('search')}
          className={cn('flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300',
            tab === 'search' ? t.tabActive : 'text-ink/40 hover:text-ink')}
        >
          <Search size={16} /> Client existant
        </button>
        <button
          onClick={() => setTab('create')}
          className={cn('flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300',
            tab === 'create' ? t.tabActive : 'text-ink/40 hover:text-ink')}
        >
          <UserPlus size={16} /> Nouveau client
        </button>
      </div>

      {tab === 'search' ? (
        <div className="space-y-4">
          <div className="relative group">
            <Search className={cn('absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 transition-colors', t.focusText)} size={20} />
            <input
              type="text"
              autoFocus
              placeholder="Rechercher par nom ou téléphone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn('w-full input-premium pl-14', t.ring)}
            />
          </div>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
            {results.length > 0 ? results.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className={cn('w-full flex items-center gap-4 p-4 rounded-2xl bg-surface border-2 border-border text-left transition-all duration-300 group', t.hoverBorder)}
              >
                <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center font-serif font-bold text-lg shrink-0', t.bgSoft, t.softText)}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink truncate">{c.name}</p>
                  {c.phone && <p className="text-xs font-semibold text-ink/40 flex items-center gap-1.5 mt-0.5"><Phone size={11} /> {c.phone}</p>}
                </div>
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-ink/20 group-hover:text-white transition-all duration-300 group-hover:scale-110', t.hoverBg)}>
                  <ChevronRight size={18} />
                </div>
              </button>
            )) : (
              <div className="py-12 text-center space-y-4">
                <div className={cn('w-14 h-14 rounded-full flex items-center justify-center mx-auto', t.bgSoft, t.softText)}>
                  <Users size={26} />
                </div>
                <p className="text-sm font-medium text-ink/40">
                  {query.trim() ? 'Aucun client trouvé.' : 'Aucun client enregistré.'}
                </p>
                <button
                  onClick={() => { setNewName(query.trim()); setTab('create'); }}
                  className={cn('inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r transition-all', t.grad)}
                >
                  <UserPlus size={16} /> Créer « {query.trim() || 'nouveau client'} »
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 sm:p-7 rounded-[28px] bg-surface border border-border shadow-sm space-y-5">
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Nom du client</label>
            <div className="relative group">
              <User className={cn('absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 transition-colors', t.focusText)} size={20} />
              <input
                type="text"
                autoFocus
                placeholder="Ex: Mme. Fatima Zohra"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={cn('w-full input-premium pl-14', t.ring)}
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Téléphone <span className="text-ink/30 normal-case">(optionnel)</span></label>
            <div className="relative group">
              <Phone className={cn('absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 transition-colors', t.focusText)} size={20} />
              <input
                type="tel"
                placeholder="0550 00 00 00"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className={cn('w-full input-premium pl-14', t.ring)}
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || busy}
            className={cn('w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2.5 bg-gradient-to-r transition-all disabled:opacity-40 disabled:cursor-not-allowed', t.grad)}
          >
            <UserPlus size={20} /> {busy ? 'Création…' : 'Créer & sélectionner'}
          </button>
          <p className="text-[11px] text-ink/40 font-medium text-center leading-relaxed">
            Le client sera enregistré et visible sur la page « Clients ».
          </p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Shared steps: products consumed + team that did the work.
//  Used by BOTH the walk-in flow (step 4) and the finalization modal so the two
//  screens stay identical.
// ─────────────────────────────────────────────────────────────────────────────

type ProductUsage = {
  productId: string; productName: string; quantity: number; price: number;
  isDetail: boolean; detailQtyUsed?: number; detailUnit?: string;
};

type TeamMember = {
  workerId: string; workerName: string; paymentType: string;
  percentage: number; amount: number; isAdded: boolean;
};

const STEP_THEMES = {
  accent: {
    text: 'text-accent', softBg: 'bg-accent/10', softBorder: 'border-accent/20',
    solid: 'bg-accent text-on-accent', ring: 'focus:border-accent/40', icon: 'text-accent',
  },
  emerald: {
    text: 'text-emerald-600', softBg: 'bg-emerald-500/10', softBorder: 'border-emerald-500/20',
    solid: 'bg-emerald-500 text-white', ring: 'focus:border-emerald-400/50', icon: 'text-emerald-500',
  },
} as const;

interface ProductUsagePickerProps {
  theme?: keyof typeof STEP_THEMES;
  items: ProductUsage[];
  setItems: React.Dispatch<React.SetStateAction<ProductUsage[]>>;
  query: string;
  setQuery: (v: string) => void;
  results: any[];
  showDropdown: boolean;
  setShowDropdown: (v: boolean) => void;
  onSearch: (q: string) => void;
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  detailProduct: any | null;
  setDetailProduct: (p: any | null) => void;
  detailQty: number;
  setDetailQty: (n: number) => void;
  detailPrice: number;
  setDetailPrice: (n: number) => void;
}

/**
 * Search the catalogue and record what was consumed on the client. Products
 * sold "au détail" (by ml/g) ask for the exact quantity used instead of whole
 * units, so partial bottles are deducted from stock correctly.
 */
const ProductUsagePicker: React.FC<ProductUsagePickerProps> = ({
  theme = 'accent', items, setItems, query, setQuery, results, showDropdown, setShowDropdown,
  onSearch, debounceRef, detailProduct, setDetailProduct, detailQty, setDetailQty,
  detailPrice, setDetailPrice,
}) => {
  const t = STEP_THEMES[theme];

  const addUnitProduct = (p: any) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.productId === p.id && !i.isDetail);
      if (idx >= 0) return prev.map((i, n) => (n === idx ? { ...i, quantity: i.quantity + 1, price: p.priceSell * (i.quantity + 1) } : i));
      return [...prev, { productId: p.id, productName: p.name, quantity: 1, price: p.priceSell, isDetail: false }];
    });
  };

  const setUnitQty = (idx: number, qty: number) => {
    setItems(prev => prev.map((i, n) => {
      if (n !== idx || i.isDetail) return i;
      const unit = i.quantity > 0 ? i.price / i.quantity : i.price;
      const next = Math.max(1, qty);
      return { ...i, quantity: next, price: unit * next };
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package size={20} className={t.icon} />
        <h4 className="text-lg font-bold text-ink">Produits utilisés</h4>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" size={16} />
        <input
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setShowDropdown(true);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => onSearch(e.target.value), 300);
          }}
          onFocus={() => setShowDropdown(true)}
          className={cn('input-premium w-full pl-9 py-2 text-sm', t.ring)}
          placeholder="Rechercher un produit par nom ou code-barres..."
        />
        <AnimatePresence>
          {showDropdown && results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="absolute top-full mt-2 left-0 right-0 bg-surface border border-border rounded-2xl shadow-xl z-30 overflow-hidden">
              {results.map((p: any) => (
                <button key={p.id}
                  onClick={() => {
                    setShowDropdown(false);
                    setQuery('');
                    if (p.sell_by_detail) {
                      setDetailProduct(p);
                      setDetailQty(0);
                      setDetailPrice(p.priceSell / (p.detail_unit_qty || 1));
                    } else {
                      addUnitProduct(p);
                    }
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-accent/5 border-b border-border/50 last:border-0 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-sm text-ink">{p.name}</p>
                    <p className="text-xs text-ink/40">{p.sell_by_detail ? `${p.currentDetailStock} ${p.detail_unit} restants` : `${p.currentStock} u restantes`}</p>
                  </div>
                  <span className={cn('text-sm font-bold', t.text)}>{formatCurrency(p.priceSell)}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quantity prompt for products sold by detail (ml, g, …) */}
      <AnimatePresence>
        {detailProduct && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className={cn('p-4 rounded-2xl border space-y-3', t.softBg, t.softBorder)}>
              <p className={cn('font-bold text-sm', t.text)}>
                {detailProduct.name} — stock : {detailProduct.currentDetailStock} {detailProduct.detail_unit}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Qté utilisée ({detailProduct.detail_unit})</label>
                  <input type="number" min={0} value={detailQty} onChange={e => setDetailQty(Number(e.target.value))} className="input-premium w-full py-2" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Prix / {detailProduct.detail_unit}</label>
                  <input type="number" min={0} value={detailPrice} onChange={e => setDetailPrice(Number(e.target.value))} className="input-premium w-full py-2" />
                </div>
              </div>
              <p className="text-xs font-bold text-ink/50">Total : {formatCurrency(detailPrice * detailQty)}</p>
              <div className="flex gap-2">
                <button onClick={() => setDetailProduct(null)} className="flex-1 py-2 rounded-xl border border-border text-ink/60 text-sm font-medium">Annuler</button>
                <button
                  onClick={() => {
                    if (detailQty <= 0) return;
                    setItems(prev => [...prev, {
                      productId: detailProduct.id, productName: detailProduct.name,
                      quantity: detailQty, price: detailPrice * detailQty, isDetail: true,
                      detailQtyUsed: detailQty, detailUnit: detailProduct.detail_unit,
                    }]);
                    setDetailProduct(null);
                  }}
                  disabled={detailQty <= 0}
                  className={cn('flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1', t.solid)}
                >
                  <Check size={14} /> Ajouter
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2"><tr>
              <th className="px-3 py-2 text-left text-xs font-bold text-ink/40">Produit</th>
              <th className="px-3 py-2 text-center text-xs font-bold text-ink/40">Quantité</th>
              <th className="px-3 py-2 text-right text-xs font-bold text-ink/40">Prix</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {items.map((p, idx) => (
                <tr key={`${p.productId}-${idx}`}>
                  <td className="px-3 py-2 font-medium text-ink">{p.productName}</td>
                  <td className="px-3 py-2">
                    {p.isDetail ? (
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="number" min={0} value={p.detailQtyUsed ?? 0}
                          onChange={e => {
                            const q = Math.max(0, Number(e.target.value));
                            setItems(prev => prev.map((it, n) => {
                              if (n !== idx) return it;
                              const unit = (it.detailQtyUsed || 0) > 0 ? it.price / (it.detailQtyUsed || 1) : 0;
                              return { ...it, detailQtyUsed: q, quantity: q, price: unit * q };
                            }));
                          }}
                          className="w-20 bg-surface-2 border border-border rounded-lg py-1 px-2 text-center font-bold text-ink text-xs"
                        />
                        <span className="text-xs text-ink/40 font-bold">{p.detailUnit}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setUnitQty(idx, p.quantity - 1)} className="w-6 h-6 rounded-lg bg-ink/10 text-ink/60 hover:bg-accent hover:text-on-accent transition-all text-xs font-bold">−</button>
                        <input
                          type="number" min={1} value={p.quantity}
                          onChange={e => setUnitQty(idx, Number(e.target.value))}
                          className="w-14 bg-surface-2 border border-border rounded-lg py-1 px-1 text-center font-bold text-ink text-xs"
                        />
                        <button onClick={() => setUnitQty(idx, p.quantity + 1)} className="w-6 h-6 rounded-lg bg-ink/10 text-ink/60 hover:bg-accent hover:text-on-accent transition-all text-xs font-bold">+</button>
                      </div>
                    )}
                  </td>
                  <td className={cn('px-3 py-2 text-right font-bold', t.text)}>{formatCurrency(p.price)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => setItems(prev => prev.filter((_, n) => n !== idx))} className="p-1 rounded-lg hover:bg-red-50 text-ink/30 hover:text-red-500 transition-all"><Trash size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 bg-surface-2 flex justify-between items-center text-sm border-t border-border">
            <span className="text-xs font-bold uppercase tracking-widest text-ink/40">Sous-total produits</span>
            <span className={cn('font-bold', t.text)}>{formatCurrency(items.reduce((s, p) => s + p.price, 0))}</span>
          </div>
        </motion.div>
      ) : (
        <p className="text-xs text-ink/30 font-medium italic px-1">Aucun produit — optionnel.</p>
      )}
    </div>
  );
};

interface TeamPickerProps {
  theme?: keyof typeof STEP_THEMES;
  employees: Employee[];
  currentUser: Employee;
  /** Base used to compute a percentage worker's commission. */
  basePrice: number;
  selectedWorkerId: string;
  setSelectedWorkerId: (id: string) => void;
  workers: TeamMember[];
  setWorkers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  amounts: Record<string, number>;
  setAmounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  showSelector: boolean;
  setShowSelector: (v: boolean) => void;
}

/** Who performed the work — drives commissions in the Workers/Payments pages. */
const TeamPicker: React.FC<TeamPickerProps> = ({
  theme = 'accent', employees, currentUser, basePrice, selectedWorkerId, setSelectedWorkerId,
  workers, setWorkers, amounts, setAmounts, editingId, setEditingId, showSelector, setShowSelector,
}) => {
  const t = STEP_THEMES[theme];
  const payLabel = (type?: string, pct?: number) =>
    type === 'percentage' ? `${pct}% de la prestation`
      : type === 'days' ? 'Paiement à la journée'
      : type === 'month' ? 'Paiement mensuel' : '—';

  // A plain function, NOT a nested component: defining a component inside a
  // render body creates a new type every render, which remounts the subtree and
  // makes the amount <input> lose focus after each keystroke.
  const amountEditor = (id: string, fallback: number) => (
    editingId === id ? (
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink/60">Modifier le montant (DA)</label>
        <div className="flex items-center gap-2">
          <button onClick={() => setAmounts(prev => ({ ...prev, [id]: Math.max(0, (prev[id] ?? fallback) - 1000) }))}
            className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20"><Minus size={16} /></button>
          <input type="number" value={amounts[id] ?? fallback}
            onChange={e => setAmounts(prev => ({ ...prev, [id]: Math.max(0, Number(e.target.value)) }))}
            className="flex-1 bg-surface-2 border border-border rounded-lg py-1 px-2 text-center font-bold text-ink focus:ring-2 focus:ring-accent/40 outline-none" />
          <button onClick={() => setAmounts(prev => ({ ...prev, [id]: (prev[id] ?? fallback) + 1000 }))}
            className="p-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20"><Plus size={16} /></button>
        </div>
        <button onClick={() => setEditingId(null)} className={cn('w-full py-1 rounded text-xs font-bold', t.solid)}>Confirmer</button>
      </div>
    ) : (
      <button onClick={() => setEditingId(id)}
        className={cn('w-full p-2 rounded-lg border hover:brightness-110 flex items-center justify-between group', t.softBg, t.softBorder)}>
        <span className={cn('font-serif font-bold', t.text)}>{formatCurrency(amounts[id] ?? fallback)}</span>
        <Edit2 size={14} className="text-ink/40 group-hover:text-ink" />
      </button>
    )
  );

  const available = employees.filter(
    e => e.id !== currentUser.id && !workers.some(w => w.workerId === e.id)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink/40 ml-1">Employé(s) ayant effectué le travail</label>
        <div className="relative">
          <button type="button" onClick={e => { e.preventDefault(); setShowSelector(!showSelector); }}
            className={cn('px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors', t.softBg, t.text)}>
            <Plus size={16} /> Ajouter un employé
          </button>
          <AnimatePresence>
            {showSelector && (
              <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute top-full mt-2 right-0 bg-surface border border-border rounded-2xl shadow-xl z-50 min-w-[280px]">
                <div className="p-4 border-b border-border"><p className="text-sm font-bold text-ink">Sélectionner un employé</p></div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {available.length === 0 ? (
                    <div className="p-4 text-center text-ink/40 text-sm">Aucun employé disponible</div>
                  ) : available.map(emp => (
                    <button key={emp.id} type="button"
                      onClick={e => {
                        e.preventDefault();
                        const amount = emp.paymentType === 'percentage' ? (basePrice * (emp.percentage || 0)) / 100 : 0;
                        setWorkers(prev => [...prev, {
                          workerId: emp.id, workerName: emp.fullName, paymentType: emp.paymentType || '',
                          percentage: emp.percentage || 0, amount, isAdded: true,
                        }]);
                        setAmounts(prev => ({ ...prev, [emp.id]: amount }));
                        setShowSelector(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-accent/5 border-b border-border/50 last:border-b-0 transition-colors flex items-center gap-3 group">
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', t.softBg, t.text)}><User size={18} /></div>
                      <div className="flex-1">
                        <p className="font-bold text-ink text-sm">{emp.fullName}</p>
                        <p className="text-xs text-ink/40 mt-0.5">{payLabel(emp.paymentType, emp.percentage)}</p>
                      </div>
                      <ChevronRight size={16} className="text-ink/30" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* The signed-in operator */}
        <motion.div className={cn('p-4 rounded-2xl border-2 transition-all',
          selectedWorkerId === currentUser.id ? cn(t.softBg, 'border-current', t.text) : 'bg-surface border-border')}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', t.softBg, t.text)}><User size={20} /></div>
                <div className="flex-1">
                  <p className="font-bold text-ink">{currentUser.fullName}</p>
                  <p className="text-xs font-bold uppercase tracking-widest text-ink/40 mt-1">{payLabel(currentUser.paymentType, currentUser.percentage)}</p>
                </div>
              </div>
              {selectedWorkerId === currentUser.id && <Check size={20} className={cn('ml-2', t.text)} />}
            </div>

            {selectedWorkerId === currentUser.id && currentUser.paymentType === 'percentage' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-3 border-t border-border space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink/60">Calcul</span>
                  <span className={cn('font-bold', t.text)}>{currentUser.percentage}% × {formatCurrency(basePrice)}</span>
                </div>
                {amountEditor(currentUser.id, (basePrice * (currentUser.percentage || 0)) / 100)}
              </motion.div>
            )}

            {selectedWorkerId !== currentUser.id ? (
              <button
                onClick={() => {
                  setSelectedWorkerId(currentUser.id);
                  const amt = currentUser.paymentType === 'percentage' ? (basePrice * (currentUser.percentage || 0)) / 100 : 0;
                  setAmounts(prev => ({ ...prev, [currentUser.id]: amt }));
                }}
                className={cn('w-full py-2 rounded-lg border font-bold text-sm transition-colors', t.softBg, t.softBorder, t.text)}
              >
                Sélectionner
              </button>
            ) : (
              <button onClick={() => setSelectedWorkerId('')} className="w-full py-2 rounded-lg bg-ink/5 border border-border text-ink/50 font-bold text-sm hover:bg-ink/10 transition-colors">
                Retirer
              </button>
            )}
          </div>
        </motion.div>

        {/* Extra employees */}
        {workers.map(worker => (
          <motion.div key={worker.workerId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl border-2 bg-surface border-border">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', t.softBg, t.text)}><User size={20} /></div>
                  <div className="flex-1">
                    <p className="font-bold text-ink">{worker.workerName}</p>
                    <p className="text-xs font-bold uppercase tracking-widest text-ink/40 mt-1">{payLabel(worker.paymentType, worker.percentage)}</p>
                  </div>
                </div>
                <button type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setWorkers(prev => prev.filter(w => w.workerId !== worker.workerId)); }}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0" title="Retirer cet employé">
                  <Trash size={16} />
                </button>
              </div>
              {worker.paymentType === 'percentage' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink/60">Calcul</span>
                    <span className="font-bold text-ink">{worker.percentage}% × {formatCurrency(basePrice)}</span>
                  </div>
                  {amountEditor(worker.workerId, (basePrice * worker.percentage) / 100)}
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const Reservations: React.FC<ReservationsProps> = ({ user: currentUser, config }) => {
  // Per-worker action gating on the reservations interface (admins always pass).
  const can = (action: string) => hasPermission(currentUser, 'reservations', action);
  const [view, setView] = useState<'list' | 'create' | 'calendar' | 'walkin'>('list');
  const [walkStep, setWalkStep] = useState(1);
  const [isSavingWalkIn, setIsSavingWalkIn] = useState(false);
  const [modal, setModal] = useState<'details' | 'finalise' | 'payDebt' | 'changeDate' | 'delete' | 'print' | 'dayView' | null>(null);
  const [step, setStep] = useState(1);
  // Several prestations can be booked on one reservation. The first one is the
  // "primary" and is what legacy filters/reports read from `prestation_id`.
  const [selectedPrestations, setSelectedPrestations] = useState<Prestation[]>([]);
  const selectedPrestation = selectedPrestations[0] || null;
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [clientInfo, setClientInfo] = useState({ name: '', phone: '', time: '10:00' });
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  /** Operator override of the computed total. `null` = follow the calculation. */
  const [manualTotal, setManualTotal] = useState<number | null>(null);

  // ── Fidelity ──────────────────────────────────────────────────────────────
  const [fidelity, setFidelity] = useState<FidelityConfig>(DEFAULT_FIDELITY);
  /** Finalized visits the selected client had BEFORE this reservation. */
  const [clientVisits, setClientVisits] = useState<number | null>(null);
  const [loadingVisits, setLoadingVisits] = useState(false);
  /** Operator can decline/re-enable an earned reward. */
  const [fidelityOptOut, setFidelityOptOut] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filteredPrestationId, setFilteredPrestationId] = useState<string | 'all'>('all');
  const [debtFilter, setDebtFilter] = useState<'all' | 'debt'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'scheduled' | 'walkin'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);

  // Data state
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [clients, setClients] = useState<PickerClient[]>([]);

  // Finalize state
  const [finalPrice, setFinalPrice] = useState(0);
  const [currentPayment, setCurrentPayment] = useState(0);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(currentUser.id);
  const [finalizeServices, setFinalizeServices] = useState<string[]>([]);
  
  // Multiple workers state
  const [reservationWorkers, setReservationWorkers] = useState<TeamMember[]>([]);
  const [workerAmounts, setWorkerAmounts] = useState<Record<string, number>>({});
  const [editingWorkerAmountId, setEditingWorkerAmountId] = useState<string | null>(null);
  const [showWorkerSelector, setShowWorkerSelector] = useState(false);

  // Products used during the visit (walk-in step 4 / finalization modal)
  const [finalizeProducts, setFinalizeProducts] = useState<ProductUsage[]>([]);
  /** Products listed on the invoice — carried over from the flow that just
   *  completed, or fetched from the DB when printing an older reservation. */
  const [invoiceProducts, setInvoiceProducts] = useState<Array<{
    productName?: string; quantity: number; price: number;
    isDetail: boolean; detailQtyUsed?: number; detailUnit?: string;
  }>>([]);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [detailProductModal, setDetailProductModal] = useState<any | null>(null);
  const [detailProductQty, setDetailProductQty] = useState(0);
  const [detailProductPrice, setDetailProductPrice] = useState(0);
  const productSearchDebounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchFinalizeProducts = React.useCallback(async (q: string) => {
    if (!q.trim()) { setProductSearchResults([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, name, barcode, sell_by_detail, detail_unit_qty, detail_unit')
      .or(`name.ilike.%${q}%,barcode.ilike.%${q}%`)
      .limit(8);
    const results = await Promise.all((data || []).map(async (p: any) => {
      const [{ data: bought }, { data: sold }, { data: usedRes }] = await Promise.all([
        supabase.from('product_purchase_items').select('quantity_bought, sell_by_detail, detail_unit_qty').eq('product_id', p.id),
        supabase.from('sale_items').select('quantity, is_detail, detail_qty_used').eq('product_id', p.id),
        supabase.from('reservation_products').select('quantity, is_detail, detail_qty_used').eq('product_id', p.id),
      ]);
      let units = 0, detailMl = 0;
      (bought || []).forEach((b: any) => {
        if (b.sell_by_detail && b.detail_unit_qty) detailMl += b.quantity_bought * b.detail_unit_qty;
        else units += b.quantity_bought;
      });
      (sold || []).forEach((s: any) => { if (s.is_detail) detailMl -= s.detail_qty_used || 0; else units -= s.quantity; });
      (usedRes || []).forEach((r: any) => { if (r.is_detail) detailMl -= r.detail_qty_used || 0; else units -= r.quantity; });
      const { data: lp } = await supabase.from('product_purchase_items').select('price_sell').eq('product_id', p.id).order('created_at', { ascending: false }).limit(1).single();
      return { ...p, currentStock: units, currentDetailStock: detailMl, priceSell: lp?.price_sell || 0 };
    }));
    setProductSearchResults(results.filter(r => r.sell_by_detail ? r.currentDetailStock > 0 : r.currentStock > 0));
  }, []);

  // ── Client visit history & fidelity ────────────────────────────────────────
  /**
   * Counts the client's finalized visits so the creation flows can show "N
   * visites" and decide whether this one is a reward visit. Matching falls back
   * to the phone number for clients that were never linked by id.
   */
  const loadClientVisits = React.useCallback(async (clientId: string | null, phone?: string) => {
    const cleanPhone = (phone || '').trim();
    if (!clientId && !cleanPhone) { setClientVisits(null); return; }
    setLoadingVisits(true);
    try {
      let q = supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .in('status', ['finalized', 'completed']);
      q = clientId ? q.eq('client_id', clientId) : q.eq('client_phone', cleanPhone);
      const { count, error } = await q;
      if (error) { console.error('Error counting client visits:', error); setClientVisits(null); return; }
      setClientVisits(count ?? 0);
    } finally {
      setLoadingVisits(false);
    }
  }, []);

  // Products only contribute to the total in the walk-in flow (a scheduled
  // reservation gets its products at finalization time).
  const productsSubtotal = view === 'walkin'
    ? finalizeProducts.reduce((s, p) => s + p.price, 0)
    : 0;
  const prestationsSubtotal = selectedPrestations.reduce((s, p) => s + p.price, 0);
  const servicesSubtotal = selectedServices.reduce((sum, id) => {
    const s = services.find(serv => serv.id === id);
    return sum + (s?.price || 0);
  }, 0);
  const grossTotal = prestationsSubtotal + servicesSubtotal + productsSubtotal;

  /** True when the client has earned the reward on THIS visit. */
  const fidelityEarned = clientVisits !== null && isRewardVisit(clientVisits, fidelity);
  const fidelityActive = fidelityEarned && !fidelityOptOut;
  const discountAmount = fidelityActive ? fidelityReduction(grossTotal, fidelity) : 0;
  const computedTotal = Math.max(0, grossTotal - discountAmount);
  /** What actually gets saved — the operator may type their own figure. */
  const totalPrice = manualTotal ?? computedTotal;
  const setTotalPrice = (v: number) => setManualTotal(Math.max(0, v));

  const fidelityLabel = fidelity.reduction_type === 'percentage'
    ? `-${fidelity.reduction_value}%`
    : `-${formatCurrency(fidelity.reduction_value)}`;
  /** Visits remaining before the client earns the next reward. */
  const visitsToReward = (() => {
    if (clientVisits === null || !fidelity.enabled) return null;
    const req = Number(fidelity.reservations_required) || 0;
    if (req <= 0) return null;
    return req - (clientVisits % (req + 1));
  })();

  // A walk-in ("sur place") is stamped with finalized_at === created_at.
  const isWalkInRow = (r: any): boolean => {
    if (!r?.finalized_at || !r?.created_at) return false;
    return Math.abs(new Date(r.finalized_at).getTime() - new Date(r.created_at).getTime()) < 1000;
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Parallel fetch all data at once for better performance
      const [
        { data: pData, error: pError },
        { data: sData, error: sError },
        { data: eData, error: eError },
        { data: rData, error: rError },
        { data: cData, error: cError },
        { data: fData }
      ] = await Promise.all([
        supabase.from('prestations').select('id, name, price'),
        supabase.from('services').select('id, name, price'),
        supabase.from('profiles').select('id, username, full_name, role, payment_type, percentage, created_at').neq('role', 'admin'),
        supabase.from('reservations').select('*').order('date', { ascending: false }).limit(500),
        supabase.from('clients').select('id, name, phone').order('created_at', { ascending: false }),
        supabase.from('fidelity_config').select('*').eq('id', 1).single()
      ]);

      if (fData) {
        setFidelity({
          enabled: fData.enabled ?? true,
          reservations_required: fData.reservations_required ?? 10,
          reduction_type: (fData.reduction_type as FidelityConfig['reduction_type']) ?? 'percentage',
          reduction_value: fData.reduction_value ?? 50,
        });
      }

      if (cError) console.error('Error fetching clients:', cError);
      else setClients((cData || []) as PickerClient[]);

      if (pError) console.error('Error fetching prestations:', pError);
      else setPrestations(pData || []);

      if (sError) console.error('Error fetching services:', sError);
      else setServices(sData || []);

      if (eError) console.error('Error fetching employees:', eError);
      else setEmployees((eData || []).map(e => ({
        id: e.id,
        username: e.username,
        email: '',
        fullName: e.full_name,
        role: e.role,
        paymentType: e.payment_type as 'days' | 'month' | 'percentage' | undefined,
        percentage: e.percentage,
        createdAt: e.created_at
      })));

      if (rError) console.error('Error fetching reservations:', rError);
      else setReservations((rData || []).map(r => ({
        id: r.id,
        clientId: r.client_id || 'new',
        clientName: r.client_name,
        clientPhone: r.client_phone || '',
        prestationId: r.prestation_id || '',
        // Legacy rows only have the single `prestation_id` column.
        prestationIds: (Array.isArray(r.prestation_ids) && r.prestation_ids.length > 0)
          ? r.prestation_ids
          : (r.prestation_id ? [r.prestation_id] : []),
        serviceIds: r.service_ids || [],
        date: r.date,
        time: r.time || '10:00',
        totalPrice: r.total_price || 0,
        paidAmount: r.paid_amount || 0,
        discountAmount: r.discount_amount || 0,
        fidelityApplied: r.fidelity_applied || false,
        status: r.status || 'pending',
        workerId: r.worker_id,
        createdBy: r.created_by || 'admin',
        finalizedAt: r.finalized_at,
        createdAt: r.created_at,
        // "Sur place" walk-ins are created already finalized: we stamp
        // finalized_at = created_at so they are detectable on read (a normal
        // booking is always finalized seconds/days after it is created).
        isWalkIn: isWalkInRow(r)
      })));
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Changing what is booked invalidates any hand-typed total, so the summary
  // goes back to following the calculation until the operator overrides it again.
  // Loading an existing reservation for editing is exempt: its stored total must
  // survive the state assignment that populates the form.
  const keepManualTotalOnce = React.useRef(false);
  useEffect(() => {
    if (keepManualTotalOnce.current) { keepManualTotalOnce.current = false; return; }
    setManualTotal(null);
  }, [selectedPrestations, selectedServices, finalizeProducts, fidelityActive]);

  const handleNext = () => {
    // If no services exist, skip step 3
    if (step === 2 && services.length === 0) {
      setStep(4);
    } else {
      setStep(step + 1);
    }
  };
  const handleBack = () => {
    // If no services exist, skip step 3 going back
    if (step === 4 && services.length === 0) {
      setStep(2);
    } else {
      setStep(step - 1);
    }
  };

  /** Toggle a prestation in/out of the multi-selection. */
  const togglePrestation = (p: Prestation) => {
    setSelectedPrestations(prev =>
      prev.some(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, p]
    );
  };

  /** Pick/clear the client and refresh their visit count for the fidelity check. */
  const pickClient = (c: PickerClient) => {
    setClientInfo(prev => ({ ...prev, name: c.name, phone: c.phone || '' }));
    setSelectedClientId(c.id);
    setFidelityOptOut(false);
    loadClientVisits(c.id, c.phone || undefined);
  };

  const clearClient = () => {
    setClientInfo(prev => ({ ...prev, name: '', phone: '' }));
    setSelectedClientId(null);
    setClientVisits(null);
    setFidelityOptOut(false);
  };

  // ── Clients ────────────────────────────────────────────────────────────────
  // Insert a brand-new client into the database and keep the local list in sync
  // so it shows up immediately here AND on the Clients page (which reads the same
  // table). Returns the created client (with its id) or null on failure.
  const createClient = async (name: string, phone: string): Promise<PickerClient | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from('clients')
      .insert([{ name: trimmed, phone: phone.trim() || null }])
      .select('id, name, phone')
      .single();
    if (error || !data) {
      console.error('Error creating client:', error);
      return null;
    }
    const created = data as PickerClient;
    setClients(prev => [created, ...prev]);
    return created;
  };

  // Resolve the client_id to store on a reservation. If a client was picked we
  // use it; otherwise, when a name is present, we reuse a matching existing
  // client (same name + phone) or create one on the fly so every named
  // reservation is linked to a real client record.
  const resolveClientId = async (): Promise<string | null> => {
    if (selectedClientId) return selectedClientId;
    const name = clientInfo.name.trim();
    // Anonymous walk-ins keep no client record.
    if (!name || name.toLowerCase() === 'client passager') return null;
    const phone = clientInfo.phone.trim();
    const existing = clients.find(
      c => c.name.trim().toLowerCase() === name.toLowerCase() && (c.phone || '').trim() === phone
    );
    if (existing) return existing.id;
    const created = await createClient(name, phone);
    return created?.id || null;
  };

  const saveReservation = async () => {
    if (selectedPrestations.length === 0) return;
    const clientId = await resolveClientId();
    const common = {
      client_id: clientId,
      client_name: clientInfo.name,
      client_phone: clientInfo.phone,
      // The first prestation stays in `prestation_id` so existing filters,
      // reports and legacy readers keep working.
      prestation_id: selectedPrestations[0].id,
      prestation_ids: selectedPrestations.map(p => p.id),
      service_ids: selectedServices,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: clientInfo.time,
      total_price: totalPrice,
      paid_amount: paidAmount,
      discount_amount: discountAmount,
      fidelity_applied: fidelityActive,
      created_by: currentUser.id,
    };

    if (isEditing && selectedReservation) {
      const { error } = await supabase
        .from('reservations')
        .update({ ...common, status: selectedReservation.status || 'pending' })
        .eq('id', selectedReservation.id);
      if (error) console.error('Error updating reservation:', error);
    } else {
      // Omit `status` on insert so the database default applies.
      const { error } = await supabase.from('reservations').insert([common]);
      if (error) console.error('Error adding reservation:', error);
    }

    fetchData();
    setView('list');
    resetForm();
  };

  const resetForm = () => {
    setStep(1);
    setSelectedPrestations([]);
    setSelectedDate(new Date());
    setClientInfo({ name: '', phone: '', time: '10:00' });
    setSelectedClientId(null);
    setSelectedServices([]);
    setManualTotal(null);
    setPaidAmount(0);
    setClientVisits(null);
    setFidelityOptOut(false);
    setFinalizeProducts([]);
    setIsEditing(false);
    setSelectedReservation(null);
  };

  // ============================================================================
  // WALK-IN ("Réservation Sur Place") — client comes now & finalises immediately
  // ============================================================================
  const openWalkIn = () => {
    setIsEditing(false);
    setSelectedReservation(null);
    setSelectedPrestations([]);
    setSelectedServices([]);
    setClientInfo({ name: '', phone: '', time: format(new Date(), 'HH:mm') });
    setSelectedClientId(null);
    setSelectedDate(new Date());
    setManualTotal(null);
    setPaidAmount(0);
    setClientVisits(null);
    setFidelityOptOut(false);
    // Products & team are captured in the walk-in flow itself (step 4).
    setFinalizeProducts([]);
    setProductSearchQuery(''); setProductSearchResults([]); setShowProductDropdown(false);
    setDetailProductModal(null);
    setReservationWorkers([]);
    setWorkerAmounts({});
    setEditingWorkerAmountId(null);
    setShowWorkerSelector(false);
    setSelectedWorkerId(currentUser.id);
    setWalkStep(1);
    setView('walkin');
  };

  /** Walk-in step order, skipping "Services" when the salon has none. */
  const walkSteps = services.length > 0 ? [1, 2, 3, 4, 5] : [1, 2, 4, 5];
  const walkStepLabel = (s: number) =>
    s === 1 ? 'Client' : s === 2 ? 'Prestations' : s === 3 ? 'Services' : s === 4 ? 'Produits' : 'Paiement';
  const nextWalkStep = (from: number) => walkSteps[Math.min(walkSteps.indexOf(from) + 1, walkSteps.length - 1)];
  const prevWalkStep = (from: number) => walkSteps[Math.max(walkSteps.indexOf(from) - 1, 0)];

  const walkTotal = totalPrice;
  const walkRemaining = Math.max(0, walkTotal - paidAmount);

  const saveWalkIn = async () => {
    if (selectedPrestations.length === 0 || isSavingWalkIn) return;
    const trimmedName = clientInfo.name.trim();
    // A remaining balance (dette) requires a named client — a "client passager"
    // can only be created when fully paid.
    if (walkRemaining > 0 && !trimmedName) return;

    setIsSavingWalkIn(true);
    try {
      // Link to a real client record when the walk-in is named (a "client
      // passager" with no name stays unlinked).
      const clientId = trimmedName ? await resolveClientId() : null;
      const nowIso = new Date().toISOString();
      const reservationData = {
        client_id: clientId,
        client_name: trimmedName || 'Client passager',
        client_phone: clientInfo.phone.trim(),
        prestation_id: selectedPrestations[0].id,
        prestation_ids: selectedPrestations.map(p => p.id),
        service_ids: selectedServices,
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm'),
        total_price: walkTotal,
        paid_amount: paidAmount,
        discount_amount: discountAmount,
        fidelity_applied: fidelityActive,
        // A walk-in is finalized the moment it is created.
        status: 'completed',
        created_by: currentUser.id,
        finalized_by: currentUser.id,
        finalized_at: nowIso,
      };

      const { data: inserted, error } = await supabase
        .from('reservations')
        .insert([reservationData])
        .select()
        .single();

      if (error || !inserted) {
        console.error('Error creating walk-in reservation:', error);
        alert('Erreur lors de la création de la réservation sur place');
        return;
      }

      // Stamp finalized_at = created_at so this row is recognised as a walk-in.
      if (inserted.created_at) {
        await supabase
          .from('reservations')
          .update({ finalized_at: inserted.created_at })
          .eq('id', inserted.id);
      }

      // Products consumed during the visit (also decrements available stock,
      // which is derived from purchases minus sales minus reservation usage).
      if (finalizeProducts.length > 0) {
        const { error: prodError } = await supabase.from('reservation_products').insert(
          finalizeProducts.map(p => ({
            reservation_id: inserted.id,
            product_id: p.productId,
            quantity: p.quantity,
            price: p.price,
            is_detail: p.isDetail,
            detail_qty_used: p.detailQtyUsed || null,
            detail_unit: p.detailUnit || null,
          }))
        );
        if (prodError) console.error('Error saving walk-in products:', prodError);
      }

      // Attribute the work so commissions/reports stay correct: the operator
      // (when selected) plus every extra employee added on step 4.
      const team: Array<{ id: string; paymentType?: string; percentage?: number; amount?: number }> = [];
      if (selectedWorkerId === currentUser.id) {
        team.push({ id: currentUser.id, paymentType: currentUser.paymentType, percentage: currentUser.percentage });
      }
      reservationWorkers.forEach(w =>
        team.push({ id: w.workerId, paymentType: w.paymentType, percentage: w.percentage, amount: w.amount })
      );

      for (const member of team) {
        if (member.paymentType !== 'percentage' && member.paymentType !== 'days') continue;
        const fallback = member.paymentType === 'percentage'
          ? (walkTotal * (member.percentage || 0)) / 100
          : walkTotal;
        const amount = workerAmounts[member.id] ?? member.amount ?? fallback;
        const { error: workerError } = await supabase
          .from('reservation_workers')
          .upsert({
            reservation_id: inserted.id,
            worker_id: member.id,
            payment_type: member.paymentType,
            amount,
            percentage: member.paymentType === 'percentage' ? (member.percentage || 0) : 0,
            status: 'unpaid'
          }, { onConflict: 'reservation_id,worker_id' });
        if (workerError) console.error('Error saving walk-in worker:', workerError);
      }

      // Build the reservation object for the receipt/print step.
      setSelectedReservation({
        id: inserted.id,
        clientId: clientId || 'new',
        clientName: reservationData.client_name,
        clientPhone: reservationData.client_phone,
        prestationId: selectedPrestations[0].id,
        prestationIds: selectedPrestations.map(p => p.id),
        serviceIds: selectedServices,
        date: reservationData.date,
        time: reservationData.time,
        totalPrice: walkTotal,
        paidAmount,
        discountAmount,
        fidelityApplied: fidelityActive,
        status: 'completed',
        createdBy: currentUser.id,
        finalizedAt: inserted.created_at || nowIso,
        createdAt: inserted.created_at,
        isWalkIn: true,
      });
      // Keep the products for the receipt, then clear the rest of the form.
      setInvoiceProducts(finalizeProducts);

      await fetchData();
      setView('list');
      setModal('print');
    } catch (err) {
      console.error('Error during walk-in creation:', err);
      alert('Une erreur s\'est produite lors de la création');
    } finally {
      setIsSavingWalkIn(false);
    }
  };

  /** Load the products recorded against a reservation so the invoice lists them. */
  const loadInvoiceProducts = async (reservationId: string) => {
    const { data, error } = await supabase
      .from('reservation_products')
      .select('quantity, price, is_detail, detail_qty_used, detail_unit, product_id, products(name)')
      .eq('reservation_id', reservationId);
    if (error) { console.error('Error loading invoice products:', error); setInvoiceProducts([]); return; }
    setInvoiceProducts((data || []).map((r: any) => ({
      productName: r.products?.name || 'Produit',
      quantity: r.quantity,
      price: r.price,
      isDetail: r.is_detail,
      detailQtyUsed: r.detail_qty_used ?? undefined,
      detailUnit: r.detail_unit ?? undefined,
    })));
  };

  /** Open the print preview for an already-saved reservation. */
  const openPrint = (res: Reservation) => {
    setSelectedReservation(res);
    setInvoiceProducts([]);
    loadInvoiceProducts(res.id);
    setModal('print');
  };

  const handleEdit = (res: Reservation) => {
    keepManualTotalOnce.current = true;
    setSelectedReservation(res);
    setIsEditing(true);
    setSelectedPrestations(
      res.prestationIds
        .map(id => prestations.find(p => p.id === id))
        .filter((p): p is Prestation => !!p)
    );
    setSelectedDate(new Date(res.date));
    setClientInfo({ name: res.clientName, phone: res.clientPhone, time: res.time });
    setSelectedClientId(res.clientId && res.clientId !== 'new' ? res.clientId : null);
    setSelectedServices(res.serviceIds);
    // Editing keeps the stored figure until the operator changes the booking.
    setManualTotal(res.totalPrice);
    setPaidAmount(res.paidAmount);
    setFidelityOptOut(!res.fidelityApplied);
    setClientVisits(null);
    if (res.clientId && res.clientId !== 'new') loadClientVisits(res.clientId, res.clientPhone);
    else if (res.clientPhone) loadClientVisits(null, res.clientPhone);
    setView('create');
    setStep(1);
    setModal(null);
  };

  const handleFinalize = (res: Reservation) => {
    setSelectedReservation(res);
    setFinalPrice(res.totalPrice);
    setCurrentPayment(0);
    setSelectedWorkerId(currentUser.id);
    setFinalizeServices([]);
    setReservationWorkers([]); // Reset workers list
    setWorkerAmounts({}); // Reset worker amounts
    setEditingWorkerAmountId(null); // Reset editing state
    setShowWorkerSelector(false); // Reset selector
    setFinalizeProducts([]); // Reset products
    setProductSearchQuery(''); setProductSearchResults([]); setShowProductDropdown(false);
    setModal('finalise');
  };

  const saveFinalize = async () => {
    if (!selectedReservation) return;
    
    try {
      // Calculate total services price
      const servicesTotal = finalizeServices.reduce((sum: number, serviceId: string) => {
        const service = services.find((s: Service) => s.id === serviceId);
        return sum + (service?.price || 0);
      }, 0);
      
      // Total final price includes base price, services, and products used
      const productsTotal = finalizeProducts.reduce((sum, p) => sum + p.price, 0);
      const totalFinalPrice = finalPrice + servicesTotal + productsTotal;
      
      // 1. Update reservation status
      const { error: updateError } = await supabase
        .from('reservations')
        .update({
          status: 'completed',
          total_price: totalFinalPrice,
          paid_amount: selectedReservation.paidAmount + currentPayment,
          finalized_by: currentUser.id,
          finalized_at: new Date().toISOString()
        })
        .eq('id', selectedReservation.id);

      if (updateError) {
        console.error('Error updating reservation:', updateError);
        alert('Erreur lors de la mise à jour de la réservation');
        return;
      }

      // 2. Credit the operator when they are still selected as a worker.
      if (selectedWorkerId === currentUser.id &&
          (currentUser.paymentType === 'percentage' || currentUser.paymentType === 'days')) {
        const currentUserAmount = workerAmounts[currentUser.id] ?? (
          currentUser.paymentType === 'percentage'
            ? finalPrice * (currentUser.percentage || 0) / 100
            : finalPrice // For journalier, amount is the total price
        );

        const { error: mainWorkerError } = await supabase
          .from('reservation_workers')
          .upsert({
            reservation_id: selectedReservation.id,
            worker_id: currentUser.id,
            payment_type: currentUser.paymentType,
            amount: currentUserAmount,
            percentage: currentUser.paymentType === 'percentage' ? (currentUser.percentage || 0) : 0,
            status: 'unpaid'
          }, {
            onConflict: 'reservation_id,worker_id'
          });

        if (mainWorkerError) console.error('Error saving main worker:', mainWorkerError);
      }

      // 3. Save products used during reservation
      if (finalizeProducts.length > 0) {
        await supabase.from('reservation_products').insert(
          finalizeProducts.map(p => ({
            reservation_id: selectedReservation.id,
            product_id: p.productId,
            quantity: p.quantity,
            price: p.price,
            is_detail: p.isDetail,
            detail_qty_used: p.detailQtyUsed || null,
            detail_unit: p.detailUnit || null,
          }))
        );
      }

      // 4. Add additional workers
      for (const worker of reservationWorkers) {
        const workerAmount = workerAmounts[worker.workerId] || worker.amount;
        
        const { error: workerError } = await supabase
          .from('reservation_workers')
          .upsert({
            reservation_id: selectedReservation.id,
            worker_id: worker.workerId,
            payment_type: worker.paymentType,
            amount: workerAmount,
            percentage: worker.percentage,
            status: 'unpaid'
          }, {
            onConflict: 'reservation_id,worker_id'
          });

        if (workerError) {
          console.error(`Error saving worker ${worker.workerId}:`, workerError);
        }
      }

      // Reflect the freshly-saved figures on the invoice that opens next.
      setSelectedReservation({
        ...selectedReservation,
        totalPrice: totalFinalPrice,
        paidAmount: selectedReservation.paidAmount + currentPayment,
        serviceIds: [...selectedReservation.serviceIds, ...finalizeServices],
        status: 'completed',
      });
      setInvoiceProducts(finalizeProducts);

      fetchData();
      setModal('print');
    } catch (error) {
      console.error('Error during finalization:', error);
      alert('Une erreur s\'est produite lors de la finalisation');
    }
  };

  const saveDebtPayment = async () => {
    if (!selectedReservation) return;
    const { error } = await supabase
      .from('reservations')
      .update({
        paid_amount: selectedReservation.paidAmount + currentPayment,
      })
      .eq('id', selectedReservation.id);

    if (error) {
      console.error('Error saving debt payment:', error);
    } else {
      fetchData();
      setModal(null);
    }
  };

  const saveNewDate = async () => {
    if (!selectedReservation) return;
    const { error } = await supabase
      .from('reservations')
      .update({
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: clientInfo.time
      })
      .eq('id', selectedReservation.id);

    if (error) {
      console.error('Error updating date:', error);
    } else {
      fetchData();
      setModal(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedReservation) return;
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', selectedReservation.id);

    if (error) {
      console.error('Error deleting reservation:', error);
    } else {
      fetchData();
      setModal(null);
    }
  };

  const getWorkerPercentage = (workerId: string, amount: number) => {
    const worker = employees.find((e: Employee) => e.id === workerId) || (workerId === currentUser.id ? currentUser : null);
    if (worker?.paymentType === 'percentage' && worker.percentage) {
      return (amount * worker.percentage) / 100;
    }
    return 0;
  };

  /**
   * Visit counter shown right under the client picker: how many finalized
   * visits they already have and how close they are to the next reward.
   */
  // Plain render helpers rather than nested components (a component declared
  // in a render body is a new type each render and would remount every time).
  const renderClientVisits = () => {
    if (!clientInfo.name.trim()) return null;
    if (loadingVisits) {
      return (
        <div className="p-4 rounded-2xl bg-surface-2 border border-border flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-ink/40">Chargement de l'historique…</p>
        </div>
      );
    }
    if (clientVisits === null) return null;

    return (
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className={cn('p-5 rounded-2xl border space-y-3',
          fidelityEarned ? 'bg-amber-50 border-amber-200' : 'bg-surface-2 border-border')}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center',
              fidelityEarned ? 'bg-amber-500 text-white' : 'bg-accent/10 text-accent')}>
              <Award size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink leading-none">
                {clientVisits} visite{clientVisits > 1 ? 's' : ''} enregistrée{clientVisits > 1 ? 's' : ''}
              </p>
              <p className="text-[11px] font-medium text-ink/40 mt-1">
                Cette réservation sera la visite n°{clientVisits + 1}
              </p>
            </div>
          </div>
          {fidelityEarned ? (
            <span className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
              Fidélité active
            </span>
          ) : visitsToReward !== null && visitsToReward > 0 ? (
            <span className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
              {visitsToReward} avant réduction
            </span>
          ) : null}
        </div>

        {fidelityEarned && (
          <p className="text-xs font-medium text-amber-800 leading-relaxed">
            La cliente a effectué {fidelity.reservations_required} visite{fidelity.reservations_required > 1 ? 's' : ''} :
            la réduction <span className="font-bold">{fidelityLabel}</span> est appliquée automatiquement sur cette visite.
          </p>
        )}
      </motion.div>
    );
  };

  /** Fidelity summary + opt-out shown on the payment step of both flows. */
  const renderFidelityPanel = () => {
    if (!fidelityEarned) return null;
    return (
      <div className="p-5 rounded-3xl bg-amber-50 border-2 border-amber-200 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center">
              <Award size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink leading-none">Fidélité activée</p>
              <p className="text-[11px] font-medium text-ink/50 mt-1">
                Visite n°{(clientVisits ?? 0) + 1} · réduction {fidelityLabel}
              </p>
            </div>
          </div>
          <button
            onClick={() => setFidelityOptOut(!fidelityOptOut)}
            className={cn('px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all',
              fidelityOptOut ? 'bg-amber-500 text-white' : 'bg-surface border border-amber-200 text-ink/50 hover:text-ink')}
          >
            {fidelityOptOut ? 'Réactiver' : 'Ne pas appliquer'}
          </button>
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-amber-200 text-sm">
          <span className="font-bold text-ink/60">Réduction accordée</span>
          <span className={cn('font-serif font-bold text-xl', fidelityOptOut ? 'text-ink/30 line-through' : 'text-amber-700')}>
            − {formatCurrency(fidelityActive ? discountAmount : fidelityReduction(grossTotal, fidelity))}
          </span>
        </div>
      </div>
    );
  };

  // ── Invoice ────────────────────────────────────────────────────────────────
  /**
   * Builds the receipt as self-contained HTML with inline styles. The same
   * markup feeds the on-screen preview AND the print window, so what the
   * operator sees is exactly what comes out of the printer — no Tailwind
   * classes to re-implement for print.
   */
  const buildInvoiceHtml = (): string => {
    const res = selectedReservation;
    if (!res) return '';

    const esc = (v: unknown) =>
      String(v ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

    const money = (n: number) =>
      `${new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} DA`;

    const GOLD = '#B8912A';
    const INK = '#16161A';

    const bookedPrestations = (res.prestationIds?.length ? res.prestationIds : [res.prestationId])
      .map(id => prestations.find(p => p.id === id))
      .filter((p): p is Prestation => !!p);
    const bookedServices = (res.serviceIds || [])
      .map(id => services.find(s => s.id === id))
      .filter((s): s is Service => !!s);

    const row = (label: string, sub: string, amount: string) => `
      <tr>
        <td style="padding:11px 0;border-bottom:1px solid #EFE9DA;">
          <div style="font-weight:700;color:${INK};font-size:13px;">${esc(label)}</div>
          <div style="font-size:10px;color:#9A968C;letter-spacing:.06em;text-transform:uppercase;margin-top:2px;">${esc(sub)}</div>
        </td>
        <td style="padding:11px 0;border-bottom:1px solid #EFE9DA;text-align:right;font-weight:700;color:${INK};font-size:13px;white-space:nowrap;">${amount}</td>
      </tr>`;

    const lines = [
      ...bookedPrestations.map(p => row(p.name, 'Prestation', money(p.price))),
      ...bookedServices.map(s => row(s.name, 'Service additionnel', money(s.price))),
      ...invoiceProducts.map(p => row(
        p.productName || 'Produit',
        `Produit · ${p.isDetail ? `${p.detailQtyUsed} ${p.detailUnit ?? ''}`.trim() : `${p.quantity} u`}`,
        money(p.price)
      )),
    ].join('');

    const rest = Math.max(0, (res.totalPrice || 0) - (res.paidAmount || 0));
    const discount = res.discountAmount || 0;
    const subtotal = (res.totalPrice || 0) + discount;

    const socials = [
      config.facebook && `Facebook : ${config.facebook}`,
      config.instagram && `Instagram : ${config.instagram}`,
      config.tiktok && `TikTok : ${config.tiktok}`,
    ].filter(Boolean).map(s => esc(s)).join(' &nbsp;·&nbsp; ');

    const infoCell = (label: string, value: string) => `
      <div style="flex:1;min-width:120px;">
        <div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#9A968C;font-weight:700;">${esc(label)}</div>
        <div style="font-size:13px;font-weight:700;color:${INK};margin-top:4px;">${esc(value)}</div>
      </div>`;

    return `
<div style="width:190mm;margin:0 auto;padding:14mm 12mm;background:#fff;color:${INK};
            font-family:'Inter',-apple-system,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.5;box-sizing:border-box;">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;
              padding-bottom:16px;border-bottom:3px solid ${GOLD};">
    <div style="display:flex;align-items:center;gap:16px;">
      ${config.logo ? `
        <div style="width:74px;height:74px;border-radius:50%;overflow:hidden;flex-shrink:0;
                    border:3px solid ${GOLD};background:#0E0E11;">
          <img src="${esc(config.logo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
        </div>` : ''}
      <div>
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:27px;font-weight:700;letter-spacing:-.02em;">${esc(config.name)}</div>
        ${config.slogan ? `<div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-top:3px;">${esc(config.slogan)}</div>` : ''}
        <div style="margin-top:9px;font-size:11px;color:#6E6A62;line-height:1.7;">
          ${config.location ? `<div>${esc(config.location)}</div>` : ''}
          ${config.phone ? `<div>Tél. ${esc(config.phone)}</div>` : ''}
        </div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <div style="display:inline-block;background:${INK};color:#F5EBCF;border-radius:10px;padding:11px 18px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:700;letter-spacing:.08em;">FACTURE</div>
        <div style="font-size:10px;letter-spacing:.1em;opacity:.75;margin-top:2px;">N° ${esc(res.id.slice(0, 8).toUpperCase())}</div>
      </div>
      <div style="font-size:10px;color:#9A968C;margin-top:8px;">Émise le ${esc(format(new Date(), 'dd/MM/yyyy à HH:mm'))}</div>
    </div>
  </div>

  <!-- Client + appointment -->
  <div style="display:flex;gap:14px;margin-top:18px;">
    <div style="flex:1;background:#FBF8F0;border:1px solid #EFE4C9;border-left:4px solid ${GOLD};border-radius:10px;padding:14px 16px;">
      <div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${GOLD};font-weight:700;">Cliente</div>
      <div style="font-size:16px;font-weight:700;margin-top:5px;">${esc(res.clientName)}</div>
      <div style="font-size:11px;color:#6E6A62;margin-top:2px;">${esc(res.clientPhone || 'Téléphone non renseigné')}</div>
    </div>
    <div style="flex:1;background:#FAFAF8;border:1px solid #E9E6DE;border-radius:10px;padding:14px 16px;
                display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start;">
      ${infoCell('Date', format(new Date(res.date), 'dd MMMM yyyy', { locale: fr }))}
      ${infoCell('Heure', res.time)}
      ${infoCell('Type', res.isWalkIn ? 'Sur place' : 'Rendez-vous')}
      ${infoCell('Statut', res.status === 'pending' ? 'En attente' : 'Finalisée')}
    </div>
  </div>

  <!-- Detail lines -->
  <table style="width:100%;border-collapse:collapse;margin-top:20px;">
    <thead>
      <tr>
        <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid ${GOLD};
                   font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${GOLD};">Désignation</th>
        <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid ${GOLD};
                   font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${GOLD};">Montant</th>
      </tr>
    </thead>
    <tbody>${lines || row('—', 'Aucune ligne', money(0))}</tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-top:18px;">
    <div style="width:62%;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#6E6A62;">
        <span>Sous-total</span><span style="font-weight:700;color:${INK};">${money(subtotal)}</span>
      </div>
      ${discount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:${GOLD};font-weight:700;">
        <span>Réduction fidélité</span><span>− ${money(discount)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:11px 14px;margin-top:6px;
                  background:${INK};color:#F5EBCF;border-radius:9px;">
        <span style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;">Total</span>
        <span style="font-family:'Playfair Display',Georgia,serif;font-size:19px;font-weight:700;">${money(res.totalPrice)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:12px;color:#3B7A57;font-weight:700;">
        <span>Montant versé</span><span>${money(res.paidAmount)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:9px 14px;border-radius:9px;
                  background:${rest > 0 ? '#FDF1F1' : '#F1F8F3'};border:1px solid ${rest > 0 ? '#F0D2D2' : '#D3E8DC'};">
        <span style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#6E6A62;">Reste à payer</span>
        <span style="font-weight:700;font-size:15px;color:${rest > 0 ? '#C2413F' : '#2F7A52'};">${money(rest)}</span>
      </div>
    </div>
  </div>

  ${res.fidelityApplied ? `
  <div style="margin-top:16px;padding:10px 14px;border-radius:9px;background:#FBF6E7;border:1px solid #EBDCAE;
              font-size:11px;color:#7A6420;font-weight:600;">
    Programme de fidélité appliqué sur cette visite — merci de votre fidélité.
  </div>` : ''}

  <!-- Footer -->
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #EFE9DA;text-align:center;">
    <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:13px;color:#6E6A62;">
      Merci de votre confiance et à bientôt !
    </div>
    ${socials ? `<div style="margin-top:8px;font-size:10px;color:#9A968C;">${socials}</div>` : ''}
  </div>
</div>`;
  };

  /** Opens the receipt in a print window and triggers the browser print dialog. */
  const printInvoice = () => {
    const html = buildInvoiceHtml();
    if (!html) return;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { alert("Impossible d'ouvrir la fenêtre d'impression (popup bloquée)."); return; }

    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Facture ${selectedReservation?.id.slice(0, 8).toUpperCase() ?? ''}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
        body{background:#fff;}
        @page{size:A4;margin:0;}
      </style></head><body>${html}</body></html>`);
    w.document.close();

    // Wait for the logo (often a data URL, sometimes remote) before printing.
    const go = () => { w.focus(); w.print(); };
    const img = w.document.querySelector('img');
    if (img && !img.complete) {
      img.addEventListener('load', go, { once: true });
      img.addEventListener('error', go, { once: true });
      setTimeout(go, 2500); // fallback if the image never settles
    } else {
      setTimeout(go, 250);
    }
    setModal(null);
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
  });

  return (
    <div className="space-y-10">
      <style dangerouslySetInnerHTML={{ __html: logoStyles }} />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold text-ink tracking-tight">Réservations</h2>
          <p className="text-ink/40 mt-2 font-medium">Gérez les rendez-vous et le planning de votre salon</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setView(view === 'calendar' ? 'list' : 'calendar')}
            className="px-6 py-2.5 rounded-2xl bg-surface/40 border border-border text-sm font-bold text-ink/60 hover:text-accent hover:border-accent/40 transition-all duration-300 flex items-center gap-2.5 shadow-sm"
          >
            {view === 'calendar' ? <Eye size={18} /> : <CalendarIcon size={18} />}
            {view === 'calendar' ? 'Vue Liste' : 'Vue Calendrier'}
          </button>
          {view !== 'create' && view !== 'walkin' && can('create') && (
            <button
              onClick={openWalkIn}
              className="flex items-center gap-2.5 px-6 py-2.5 rounded-2xl bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all duration-300"
            >
              <Zap size={20} />
              Réservation Sur Place
            </button>
          )}
          {view !== 'create' && view !== 'walkin' && can('create') && (
            <button
              onClick={() => setView('create')}
              className="btn-gradient shimmer flex items-center gap-2.5 px-6 py-2.5"
            >
              <Plus size={20} />
              Nouvelle Réservation
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-ink/40 font-medium animate-pulse">Chargement des réservations...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {view === 'list' && (
            <motion.div 
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
            <div className="space-y-3">
              <div className="flex gap-3 items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={20} />
                  <input
                    type="text"
                    placeholder="Rechercher par nom ou téléphone..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-2xl bg-surface/40 border border-border text-ink placeholder:text-ink/40 font-medium focus:outline-none focus:border-accent/40 focus:bg-surface transition-all duration-300"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                <button 
                  onClick={() => setFilteredPrestationId('all')}
                  className={cn(
                    "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300",
                    filteredPrestationId === 'all' 
                      ? "bg-accent text-on-accent border border-accent" 
                      : "bg-surface/40 border border-border text-ink/40 hover:text-accent hover:border-accent/40 hover:bg-surface"
                  )}
                >
                  Tous
                </button>
                {prestations.map((prestation: Prestation) => (
                  <button 
                    key={prestation.id}
                    onClick={() => setFilteredPrestationId(prestation.id)}
                    className={cn(
                      "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300",
                      filteredPrestationId === prestation.id 
                        ? "bg-accent text-on-accent border border-accent" 
                        : "bg-surface/40 border border-border text-ink/40 hover:text-accent hover:border-accent/40 hover:bg-surface"
                    )}
                  >
                    {prestation.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 pb-4 flex-wrap">
                <button
                  onClick={() => setDebtFilter('all')}
                  className={cn(
                    "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300",
                    debtFilter === 'all'
                      ? "bg-blue-100 text-blue-600 border border-blue-300"
                      : "bg-surface/40 border border-border text-ink/40 hover:text-blue-600 hover:border-blue-300/40 hover:bg-surface"
                  )}
                >
                  Toutes Réservations
                </button>
                <button
                  onClick={() => setDebtFilter('debt')}
                  className={cn(
                    "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300",
                    debtFilter === 'debt'
                      ? "bg-red-100 text-red-600 border border-red-300"
                      : "bg-surface/40 border border-border text-ink/40 hover:text-red-600 hover:border-red-300/40 hover:bg-surface"
                  )}
                >
                  ⚠ Dettes Impayées
                </button>
                <div className="w-px bg-border mx-1 self-stretch" />
                <button
                  onClick={() => setTypeFilter('all')}
                  className={cn(
                    "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300",
                    typeFilter === 'all'
                      ? "bg-panel text-white border border-ink"
                      : "bg-surface/40 border border-border text-ink/40 hover:text-ink hover:border-ink/30 hover:bg-surface"
                  )}
                >
                  Tous Types
                </button>
                <button
                  onClick={() => setTypeFilter('scheduled')}
                  className={cn(
                    "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300 flex items-center gap-2",
                    typeFilter === 'scheduled'
                      ? "bg-accent text-on-accent border border-accent"
                      : "bg-surface/40 border border-border text-ink/40 hover:text-accent hover:border-accent/40 hover:bg-surface"
                  )}
                >
                  <CalendarIcon size={14} /> Rendez-vous
                </button>
                <button
                  onClick={() => setTypeFilter('walkin')}
                  className={cn(
                    "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300 flex items-center gap-2",
                    typeFilter === 'walkin'
                      ? "bg-emerald-500 text-white border border-emerald-500"
                      : "bg-surface/40 border border-border text-ink/40 hover:text-emerald-600 hover:border-emerald-300/40 hover:bg-surface"
                  )}
                >
                  <Zap size={14} /> Sur Place
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {reservations
                .slice()
                .reverse()
                .filter(res => filteredPrestationId === 'all' ? true : res.prestationId === filteredPrestationId)
                .filter(res => debtFilter === 'debt' ? (res.totalPrice - res.paidAmount > 0) : true)
                .filter(res => typeFilter === 'all' ? true : typeFilter === 'walkin' ? res.isWalkIn : !res.isWalkIn)
                .filter(res => {
                  const searchLower = searchQuery.toLowerCase().trim();
                  if (!searchLower) return true;
                  return (
                    res.clientName.toLowerCase().includes(searchLower) ||
                    res.clientPhone.includes(searchQuery)
                  );
                })
                .map((res, idx) => {
                  const rest = res.totalPrice - res.paidAmount;
                  const isPaid = rest <= 0;
                  const bookedNames = (res.prestationIds?.length ? res.prestationIds : [res.prestationId])
                    .map(id => prestations.find(p => p.id === id)?.name)
                    .filter(Boolean) as string[];
                  const prestationName = bookedNames.join(' · ');
                  return (
                  <motion.div
                    key={res.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.06, 0.4) }}
                    className="group relative rounded-premium bg-surface/80 backdrop-blur-xl border border-border shadow-premium overflow-hidden flex flex-col hover:-translate-y-1.5 hover:shadow-2xl transition-all duration-300"
                  >
                    {/* Type accent strip */}
                    <div className={cn(
                      "h-1.5 w-full shrink-0",
                      res.isWalkIn ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-accent to-accent-light"
                    )} />

                    <div className="p-6 flex flex-col flex-1">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center text-white font-serif font-bold text-xl shrink-0 shadow-md bg-gradient-to-br",
                            res.isWalkIn ? "from-emerald-400 to-emerald-500 shadow-emerald-500/20" : "from-accent to-accent-light shadow-accent/20"
                          )}>
                            {res.clientName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-serif font-bold text-lg text-ink tracking-tight truncate">{res.clientName}</h4>
                            {res.clientPhone
                              ? <p className="text-xs font-semibold text-ink/40 flex items-center gap-1.5 mt-0.5"><Phone size={11} /> {res.clientPhone}</p>
                              : <p className="text-[11px] font-medium text-ink/30 italic mt-0.5">Client passager</p>}
                          </div>
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.12em] flex items-center gap-1 shrink-0 border",
                          res.isWalkIn ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-accent/10 text-accent border-accent/15"
                        )}>
                          {res.isWalkIn ? <><Zap size={10} /> Sur Place</> : <><CalendarIcon size={10} /> RDV</>}
                        </span>
                      </div>

                      {/* Status + payment chips */}
                      <div className="flex flex-wrap gap-2 mb-5">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5",
                          res.status === 'pending' ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", res.status === 'pending' ? "bg-amber-500" : "bg-emerald-500")} />
                          {res.status === 'pending' ? 'En attente' : 'Finalisé'}
                        </span>
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest",
                          isPaid ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                        )}>
                          {isPaid ? '✓ Payé' : `Dette ${formatCurrency(rest)}`}
                        </span>
                      </div>

                      {/* Info rows */}
                      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary-bg/40 border border-border/40">
                          <CalendarIcon size={15} className="text-ink/30" />
                          <div className="min-w-0">
                            <p className="text-[9px] uppercase font-bold text-ink/30 tracking-wider">Date</p>
                            <p className="text-xs font-bold text-ink/70 truncate">{format(new Date(res.date), 'dd MMM yyyy', { locale: fr })}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary-bg/40 border border-border/40">
                          <Clock size={15} className="text-ink/30" />
                          <div className="min-w-0">
                            <p className="text-[9px] uppercase font-bold text-ink/30 tracking-wider">Heure</p>
                            <p className="text-xs font-bold text-ink/70">{res.time}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-accent/5 border border-accent/10 mb-5">
                        <Scissors size={16} className="text-accent shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase font-bold text-accent/70 tracking-widest">Prestation</p>
                          <p className="text-sm font-bold text-ink truncate">{prestationName || '—'}</p>
                        </div>
                      </div>

                      {/* Totals + actions */}
                      <div className="mt-auto pt-5 border-t border-border/60 flex flex-col gap-3">
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[9px] uppercase font-bold text-ink/30 tracking-widest mb-0.5">Total</p>
                            <p className="font-serif font-bold text-2xl text-ink leading-none">{formatCurrency(res.totalPrice)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] uppercase font-bold text-ink/30 tracking-widest mb-0.5">{isPaid ? 'Payé' : 'Reste'}</p>
                            <p className={cn("font-bold text-base leading-none", isPaid ? "text-emerald-600" : "text-red-500")}>
                              {formatCurrency(isPaid ? res.paidAmount : rest)}
                            </p>
                          </div>
                        </div>

                        {/* Primary contextual action + pay debt */}
                        <div className="flex items-center gap-2">
                          {res.status === 'pending' ? (
                            can('finalize') && (
                              <button
                                onClick={() => handleFinalize(res)}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-light text-on-accent font-bold text-sm shadow-lg shadow-accent/25 hover:shadow-accent/40 hover:-translate-y-0.5 transition-all duration-300"
                              >
                                <Check size={17} /> Finaliser
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => openPrint(res)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 hover:-translate-y-0.5 transition-all duration-300"
                            >
                              <Printer size={17} /> Imprimer
                            </button>
                          )}
                          {rest > 0 && (
                            <button
                              onClick={() => { setSelectedReservation(res); setCurrentPayment(0); setModal('payDebt'); }}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-100 text-amber-600 font-bold text-sm hover:bg-amber-500 hover:text-white transition-all duration-300"
                            >
                              <CreditCard size={17} /> Payer
                            </button>
                          )}
                        </div>

                        {/* Secondary actions */}
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => { setSelectedReservation(res); setModal('details'); }}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-ink/[0.04] text-ink/50 font-semibold text-xs hover:bg-panel hover:text-white transition-all duration-300"
                          >
                            <Eye size={15} /> Détails
                          </button>
                          {can('edit') && (
                            <button
                              onClick={() => handleEdit(res)}
                              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 text-blue-500 font-semibold text-xs hover:bg-blue-500 hover:text-white transition-all duration-300"
                            >
                              <Edit2 size={15} /> Modifier
                            </button>
                          )}
                          {can('delete') && (
                            <button
                              onClick={() => { setSelectedReservation(res); setModal('delete'); }}
                              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 text-red-500 font-semibold text-xs hover:bg-red-500 hover:text-white transition-all duration-300"
                            >
                              <Trash2 size={15} /> Suppr.
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                  );
                })}
            </div>
          </motion.div>
        )}

        {view === 'calendar' && (
          <motion.div 
            key="calendar"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, type: 'spring', stiffness: 100, damping: 15 }}
            className="card-premium p-8 bg-gradient-to-br from-surface via-primary-bg/30 to-surface"
          >
            {/* Header with Enhanced Navigation */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center justify-between mb-12"
            >
              <div className="flex items-center gap-6">
                <motion.button 
                  onClick={prevMonth}
                  whileHover={{ scale: 1.1, rotate: -5 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-3 rounded-full hover:bg-gradient-to-br hover:from-accent/20 hover:to-accent/10 text-accent transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-accent/20"
                >
                  <ChevronLeft size={26} strokeWidth={2.5} />
                </motion.button>
                <div className="text-center min-w-[280px]">
                  <motion.h3 
                    key={format(currentMonth, 'MMMM yyyy')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-3xl font-serif font-bold text-ink capitalize bg-gradient-to-r from-ink via-accent to-ink bg-clip-text text-transparent"
                  >
                    {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                  </motion.h3>
                  <p className="text-xs font-bold text-accent/60 uppercase tracking-widest mt-1">
                    {format(new Date(), 'MMMM yyyy', { locale: fr }) === format(currentMonth, 'MMMM yyyy', { locale: fr }) ? 'Mois courant' : 'Autre mois'}
                  </p>
                </div>
                <motion.button 
                  onClick={nextMonth}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-3 rounded-full hover:bg-gradient-to-br hover:from-accent/20 hover:to-accent/10 text-accent transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-accent/20"
                >
                  <ChevronRight size={26} strokeWidth={2.5} />
                </motion.button>
              </div>
              
              {/* Legend with Enhanced Styling */}
              <motion.div 
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="flex gap-3"
              >
                <motion.div 
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-700 text-[11px] font-bold uppercase tracking-wider border border-emerald-200/50 shadow-sm hover:shadow-md transition-all"
                >
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-2.5 h-2.5 rounded-full bg-emerald-500"
                  />
                  <span>Finalisé</span>
                </motion.div>
                <motion.div 
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-700 text-[11px] font-bold uppercase tracking-wider border border-amber-200/50 shadow-sm hover:shadow-md transition-all"
                >
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                    className="w-2.5 h-2.5 rounded-full bg-amber-500"
                  />
                  <span>En attente</span>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Filter Buttons with Enhanced Animations */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex gap-3 overflow-x-auto pb-6 custom-scrollbar mb-10 bg-gradient-to-r from-surface via-surface to-transparent px-1"
            >
              <motion.button 
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilteredPrestationId('all')}
                className={cn(
                  "px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300 border-2",
                  filteredPrestationId === 'all' 
                    ? "bg-gradient-to-br from-accent to-accent/90 text-on-accent border-accent shadow-lg shadow-accent/30" 
                    : "bg-surface/60 border-accent/20 text-ink/60 hover:text-accent hover:border-accent/40 hover:bg-surface hover:shadow-md"
                )}
              >
                Toutes Prestations
              </motion.button>
              {prestations.map((prestation, idx) => (
                <motion.button 
                  key={prestation.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + idx * 0.05 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFilteredPrestationId(prestation.id)}
                  className={cn(
                    "px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm transition-all duration-300 border-2",
                    filteredPrestationId === prestation.id 
                      ? "bg-gradient-to-br from-accent to-accent/90 text-on-accent border-accent shadow-lg shadow-accent/30" 
                      : "bg-surface/60 border-accent/20 text-ink/60 hover:text-accent hover:border-accent/40 hover:bg-surface hover:shadow-md"
                  )}
                >
                  {prestation.name}
                </motion.button>
              ))}
            </motion.div>

            {/* Calendar Grid with Enhanced Styling - Mobile Horizontal Scroll */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, type: 'spring' }}
              className="overflow-x-auto md:overflow-x-visible rounded-3xl shadow-xl"
            >
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, type: 'spring' }}
                className="grid grid-cols-7 gap-0.5 sm:gap-0.5 md:gap-1 bg-gradient-to-b from-border/50 to-border/30 border-2 border-border/50 rounded-3xl overflow-hidden backdrop-blur-sm min-w-min md:min-w-full"
              >
              {/* Day Headers */}
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, idx) => (
                <motion.div 
                  key={d}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + idx * 0.05 }}
                  className="bg-gradient-to-br from-accent/20 via-primary-bg/60 to-accent/10 text-center text-[7px] sm:text-[8px] md:text-[11px] font-bold text-accent uppercase py-1.5 sm:py-2 md:py-5 px-0.5 sm:px-1 tracking-[0.05em] md:tracking-[0.15em] border-b border-border/30 min-w-[40px] sm:min-w-[50px] md:min-w-auto"
                >
                  {d}
                </motion.div>
              ))}
              
              {/* Calendar Days */}
              {calendarDays.map((day, i) => {
                const dayRes = reservations
                  .filter(r => filteredPrestationId === 'all' ? true : r.prestationId === filteredPrestationId)
                  .filter(r => isSameDay(new Date(r.date), day));
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const hasReservations = dayRes.length > 0;
                
                return (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + (i % 7) * 0.03 + Math.floor(i / 7) * 0.05 }}
                    whileHover={isCurrentMonth ? { scale: 1.08, y: -4 } : {}}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (isCurrentMonth) {
                        setSelectedCalendarDay(day);
                        setModal('dayView');
                      }
                    }}
                    className={cn(
                      "min-h-[60px] sm:min-h-[100px] md:min-h-[160px] p-1.5 sm:p-2.5 md:p-4 transition-all duration-300 relative group cursor-pointer border-2 overflow-hidden min-w-[40px] sm:min-w-[50px] md:min-w-auto",
                      isCurrentMonth ? "cursor-pointer" : "cursor-default",
                      isToday 
                        ? "bg-gradient-to-br from-accent/15 via-accent/10 to-accent/5 border-accent shadow-lg shadow-accent/30" 
                        : !isCurrentMonth
                        ? "bg-surface/30 border-border/20 opacity-40"
                        : hasReservations
                        ? "bg-gradient-to-br from-surface via-accent/5 to-surface border-accent/40 hover:shadow-lg hover:shadow-accent/15"
                        : "bg-surface border-border/40 hover:shadow-lg hover:shadow-accent/10"
                    )}
                  >
                    {/* Background Gradient Effect */}
                    {isToday && (
                      <motion.div 
                        layoutId="today-bg"
                        className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-transparent opacity-50"
                      />
                    )}
                    
                    <div className="relative z-10 flex justify-between items-start mb-3">
                      <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.4 + (i % 7) * 0.03, type: 'spring', stiffness: 200 }}
                        className={cn(
                          "text-[10px] sm:text-xs md:text-sm font-bold w-5 h-5 sm:w-7 sm:h-7 md:w-10 md:h-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm",
                          isToday 
                            ? "bg-gradient-to-br from-accent to-accent/80 text-on-accent shadow-lg shadow-accent/40 font-serif text-[10px] sm:text-xs md:text-lg" 
                            : "text-ink/70 group-hover:text-accent group-hover:bg-accent/10 font-semibold"
                        )}
                      >
                        {format(day, 'd')}
                      </motion.span>
                      {hasReservations && (
                        <motion.div 
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                          className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 md:px-2.5 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-accent/90 to-accent text-on-accent text-[7px] sm:text-[8px] md:text-[10px] font-bold uppercase tracking-widest shadow-md"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-surface/80" />
                          {dayRes.length} RDV
                        </motion.div>
                      )}
                    </div>

                    {/* Reservations Preview */}
                    <div className="relative z-10 space-y-0.5 sm:space-y-1 md:space-y-1.5">
                      {dayRes.slice(0, 3).map((r, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + (i % 7) * 0.03 + idx * 0.08 }}
                          whileHover={{ x: 2 }}
                          className={cn(
                            "text-[7px] sm:text-[8px] md:text-[9px] font-bold p-1 sm:p-1.5 md:p-2 rounded-lg border-1.5 truncate transition-all duration-300 hover:shadow-md group/card backdrop-blur-sm",
                            r.status === 'finalized' 
                              ? "bg-gradient-to-r from-emerald-50 to-emerald-100/70 text-emerald-800 border-emerald-200/80 hover:from-emerald-100 hover:to-emerald-100" 
                              : "bg-gradient-to-r from-amber-50 to-amber-100/70 text-amber-800 border-amber-200/80 hover:from-amber-100 hover:to-amber-100"
                          )}
                        >
                          <span className="opacity-70 font-semibold">{r.time}</span>
                          <span className="opacity-60 mx-1">•</span>
                          <span className="font-semibold">{r.clientName}</span>
                        </motion.div>
                      ))}
                      {dayRes.length > 3 && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.5 + (i % 7) * 0.03 + 0.24, type: 'spring' }}
                          className="text-[6px] sm:text-[7px] md:text-[9px] text-center text-accent font-bold mt-1 sm:mt-1.5 md:mt-2.5 uppercase tracking-widest opacity-80 bg-gradient-to-r from-accent/10 to-accent/5 py-0.5 sm:py-1 md:py-1.5 px-1 rounded-lg border border-accent/20"
                        >
                          +{dayRes.length - 3} autre{dayRes.length - 3 > 1 ? 's' : ''}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
            </motion.div>

            {/* Footer Info */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex items-center justify-center gap-6 text-[12px] font-medium text-ink/50"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent/40" />
                <span>Cliquez sur un jour pour voir les détails</span>
              </div>
              <div className="w-px h-4 bg-border/30" />
              <div className="flex items-center gap-2">
                <motion.div 
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-accent"
                />
                <span>Aujourd'hui</span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {view === 'walkin' && (
          <motion.div
            key="walkin"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="max-w-5xl mx-auto card-premium p-6 sm:p-10"
          >
            {/* Header / Stepper */}
            <div className="flex items-center justify-between mb-10 gap-4">
              <button
                onClick={() => setView('list')}
                className="p-3 rounded-2xl hover:bg-accent/10 text-accent transition-all duration-300 active:scale-90 shrink-0"
              >
                <X size={24} />
              </button>
              <div className="flex items-center gap-2 sm:gap-5">
                {walkSteps.map((s, i) => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <div className={cn(
                      "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold transition-all duration-500",
                      walkStep === s ? "bg-emerald-500 text-white scale-110 shadow-xl shadow-emerald-500/30" :
                      walkStep > s ? "bg-emerald-100 text-emerald-600" : "bg-surface-2 text-ink/20 border border-border"
                    )}>
                      {walkStep > s ? <Check size={20} /> : i + 1}
                    </div>
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-widest transition-colors duration-500 hidden sm:block",
                      walkStep === s ? "text-emerald-600" : "text-ink/20"
                    )}>
                      {walkStepLabel(s)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="w-12 flex justify-end shrink-0">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5 whitespace-nowrap">
                  <Zap size={12} /> Sur Place
                </span>
              </div>
            </div>

            {/* Step 1: Client (optional => client passager) */}
            {walkStep === 1 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Informations Client</h3>
                  <p className="text-ink/40 mt-2 font-medium">Laissez vide pour enregistrer un client passager</p>
                </div>
                <div className="max-w-xl mx-auto space-y-6">
                  <ClientPicker
                    theme="emerald"
                    clients={clients}
                    name={clientInfo.name}
                    phone={clientInfo.phone}
                    selectedId={selectedClientId}
                    onSelect={pickClient}
                    onClear={clearClient}
                    onCreate={createClient}
                  />

                  {renderClientVisits()}

                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-start gap-3">
                    <AlertCircle size={18} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-ink/60 font-medium leading-relaxed">
                      Sans sélection, la vente est enregistrée comme <span className="font-bold text-emerald-600">Client passager</span>. Le nom devient obligatoire s'il reste un montant à payer.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <button onClick={() => setWalkStep(2)} className="btn-gradient shimmer px-10 py-4 flex items-center gap-3">
                    Suivant <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Prestations (multi-select) */}
            {walkStep === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Sélectionnez les prestations</h3>
                  <p className="text-ink/40 mt-2 font-medium">Vous pouvez en choisir plusieurs</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {prestations.map((p) => {
                    const on = selectedPrestations.some(x => x.id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => { togglePrestation(p); setPaidAmount(0); }}
                        className={cn(
                          "p-7 rounded-3xl border-2 text-left transition-all duration-300",
                          on ? "border-emerald-500 bg-emerald-50/40 shadow-lg shadow-emerald-500/5"
                             : "border-border hover:border-emerald-400/40 hover:bg-emerald-50/30"
                        )}
                      >
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-colors duration-300",
                          on ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-600"
                        )}>
                          <Scissors size={24} />
                        </div>
                        <h4 className="font-serif font-bold text-xl text-ink tracking-tight">{p.name}</h4>
                        <div className="mt-6 flex items-center justify-between">
                          <p className="text-emerald-600 font-bold text-lg">{formatCurrency(p.price)}</p>
                          <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            on ? "bg-emerald-500 border-emerald-500 text-white scale-110" : "border-border"
                          )}>
                            {on && <Check size={14} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedPrestations.length > 0 && (
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-ink/70">
                      {selectedPrestations.length} prestation{selectedPrestations.length > 1 ? 's' : ''} sélectionnée{selectedPrestations.length > 1 ? 's' : ''}
                    </span>
                    <span className="font-bold text-emerald-600">{formatCurrency(prestationsSubtotal)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-4">
                  <button onClick={() => setWalkStep(1)} className="px-10 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all">Retour</button>
                  <button
                    disabled={selectedPrestations.length === 0}
                    onClick={() => setWalkStep(nextWalkStep(2))}
                    className="btn-gradient shimmer px-10 py-4 disabled:opacity-30 flex items-center gap-3"
                  >
                    Suivant <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Services */}
            {walkStep === 3 && services.length > 0 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Services Additionnels</h3>
                  <p className="text-ink/40 mt-2 font-medium">Optionnel — ajoutez des services complémentaires</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedServices(prev =>
                        prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                      )}
                      className={cn(
                        "p-6 rounded-3xl border-2 text-left flex justify-between items-center transition-all duration-300",
                        selectedServices.includes(s.id)
                          ? "border-emerald-500 bg-emerald-50/40 shadow-lg shadow-emerald-500/5"
                          : "border-border hover:border-emerald-400/40 hover:bg-emerald-50/30"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-11 h-11 rounded-2xl flex items-center justify-center transition-colors duration-300",
                          selectedServices.includes(s.id) ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-600"
                        )}>
                          <Plus size={22} />
                        </div>
                        <div>
                          <h4 className="font-serif font-bold text-lg text-ink tracking-tight">{s.name}</h4>
                          <p className="text-emerald-600 font-bold mt-0.5">{formatCurrency(s.price)}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                        selectedServices.includes(s.id) ? "bg-emerald-500 border-emerald-500 text-white scale-110" : "border-border"
                      )}>
                        {selectedServices.includes(s.id) && <Check size={16} />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-between pt-4">
                  <button onClick={() => setWalkStep(2)} className="px-10 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all">Retour</button>
                  <button onClick={() => setWalkStep(4)} className="btn-gradient shimmer px-10 py-4 flex items-center gap-3">Suivant <ChevronRight size={20} /></button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Products consumed + team who did the work */}
            {walkStep === 4 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Produits & Équipe</h3>
                  <p className="text-ink/40 mt-2 font-medium">Produits consommés sur la cliente et employés ayant réalisé le travail</p>
                </div>

                <ProductUsagePicker
                  theme="emerald"
                  items={finalizeProducts}
                  setItems={setFinalizeProducts}
                  query={productSearchQuery}
                  setQuery={setProductSearchQuery}
                  results={productSearchResults}
                  showDropdown={showProductDropdown}
                  setShowDropdown={setShowProductDropdown}
                  onSearch={searchFinalizeProducts}
                  debounceRef={productSearchDebounce}
                  detailProduct={detailProductModal}
                  setDetailProduct={setDetailProductModal}
                  detailQty={detailProductQty}
                  setDetailQty={setDetailProductQty}
                  detailPrice={detailProductPrice}
                  setDetailPrice={setDetailProductPrice}
                />

                <div className="pt-2 border-t border-border">
                  <TeamPicker
                    theme="emerald"
                    employees={employees}
                    currentUser={currentUser}
                    // Commission is based on what the client actually pays.
                    basePrice={totalPrice}
                    selectedWorkerId={selectedWorkerId}
                    setSelectedWorkerId={setSelectedWorkerId}
                    workers={reservationWorkers}
                    setWorkers={setReservationWorkers}
                    amounts={workerAmounts}
                    setAmounts={setWorkerAmounts}
                    editingId={editingWorkerAmountId}
                    setEditingId={setEditingWorkerAmountId}
                    showSelector={showWorkerSelector}
                    setShowSelector={setShowWorkerSelector}
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <button onClick={() => setWalkStep(prevWalkStep(4))} className="px-10 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all">Retour</button>
                  <button onClick={() => { setPaidAmount(totalPrice); setWalkStep(5); }} className="btn-gradient shimmer px-10 py-4 flex items-center gap-3">
                    Suivant <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 5: Payment & finalisation */}
            {walkStep === 5 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Encaissement</h3>
                  <p className="text-ink/40 mt-2 font-medium">Vérifiez le total et le montant payé par la cliente</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Recap */}
                  <div className="space-y-6">
                    <div className="p-6 rounded-3xl bg-surface border border-border shadow-sm space-y-4">
                      <div className="flex items-center gap-4 pb-4 border-b border-border">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                          <User size={28} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-serif font-bold text-xl text-ink tracking-tight truncate">{clientInfo.name.trim() || 'Client passager'}</h4>
                          {clientInfo.phone.trim() && <p className="text-xs font-bold text-emerald-600 mt-0.5 tracking-widest">{clientInfo.phone}</p>}
                          {clientVisits !== null && (
                            <p className="text-[11px] font-bold text-ink/40 mt-1 uppercase tracking-widest">
                              {clientVisits} visite{clientVisits > 1 ? 's' : ''} · celle-ci = n°{clientVisits + 1}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {selectedPrestations.map(p => (
                          <div key={p.id} className="flex justify-between items-center">
                            <span className="text-sm font-bold text-ink/70 flex items-center gap-2"><Scissors size={14} className="text-emerald-600" /> {p.name}</span>
                            <span className="font-bold text-ink">{formatCurrency(p.price)}</span>
                          </div>
                        ))}
                        {selectedServices.map(id => {
                          const s = services.find(serv => serv.id === id);
                          return (
                            <div key={id} className="flex justify-between items-center">
                              <span className="text-sm font-medium text-ink/60 flex items-center gap-2"><Plus size={12} className="text-emerald-500/60" /> {s?.name}</span>
                              <span className="font-bold text-ink/80">{formatCurrency(s?.price || 0)}</span>
                            </div>
                          );
                        })}
                        {finalizeProducts.map((p, i) => (
                          <div key={`${p.productId}-${i}`} className="flex justify-between items-center">
                            <span className="text-sm font-medium text-ink/60 flex items-center gap-2">
                              <Package size={12} className="text-emerald-500/60" /> {p.productName}
                              <span className="text-[10px] text-ink/30">×{p.isDetail ? `${p.detailQtyUsed} ${p.detailUnit}` : p.quantity}</span>
                            </span>
                            <span className="font-bold text-ink/80">{formatCurrency(p.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {renderFidelityPanel()}
                  </div>

                  {/* Payment */}
                  <div className="p-8 rounded-3xl bg-panel text-white shadow-2xl shadow-black/40 flex flex-col justify-between">
                    <div className="space-y-6">
                      <div className="space-y-2 pb-5 border-b border-white/10">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Sous-total</span>
                          <span className="font-bold text-white/70">{formatCurrency(grossTotal)}</span>
                        </div>
                        {discountAmount > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-amber-300 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"><Award size={13} /> Fidélité {fidelityLabel}</span>
                            <span className="font-bold text-amber-300">− {formatCurrency(discountAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-end pt-2">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Total à payer</span>
                          <input
                            type="number"
                            value={totalPrice}
                            onChange={(e) => setTotalPrice(Number(e.target.value))}
                            title="Modifiable manuellement"
                            className="bg-transparent text-3xl font-serif font-bold text-emerald-400 border-b-2 border-white/10 hover:border-emerald-400/40 focus:border-emerald-400 focus:outline-none transition-all w-44 text-right pr-1"
                          />
                        </div>
                        {manualTotal !== null && manualTotal !== computedTotal && (
                          <button onClick={() => setManualTotal(null)} className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors ml-auto block">
                            Rétablir {formatCurrency(computedTotal)}
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <label className="text-white/40 text-[10px] font-bold uppercase tracking-widest ml-1">Montant payé par la cliente (DA)</label>
                        <div className="relative group">
                          <DollarSign className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-400 transition-colors" size={20} />
                          <input
                            type="number"
                            value={paidAmount}
                            onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value)))}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white text-xl font-bold focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50 outline-none transition-all"
                            placeholder="0"
                          />
                        </div>
                        <button onClick={() => setPaidAmount(totalPrice)} className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/80 hover:text-emerald-400 transition-colors ml-1">
                          Payé en totalité
                        </button>
                      </div>

                      <div className="pt-5 border-t border-white/10 flex justify-between items-center">
                        <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Reste à payer</span>
                        <span className={cn("text-2xl font-serif font-bold", walkRemaining > 0 ? "text-red-400" : "text-emerald-400")}>
                          {formatCurrency(walkRemaining)}
                        </span>
                      </div>

                      {walkRemaining > 0 && !clientInfo.name.trim() && (
                        <div className="p-3 rounded-2xl bg-red-500/15 border border-red-400/30 flex items-start gap-2.5">
                          <AlertCircle size={16} className="text-red-300 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-red-200 font-medium leading-relaxed">
                            Le nom de la cliente est obligatoire car il reste un montant impayé. Revenez à l'étape 1 pour l'ajouter.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-8 space-y-3">
                      <button
                        onClick={saveWalkIn}
                        disabled={isSavingWalkIn || selectedPrestations.length === 0 || (walkRemaining > 0 && !clientInfo.name.trim())}
                        className="w-full btn-gradient shimmer py-5 rounded-2xl flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check size={24} />
                        <span className="text-lg font-bold tracking-wide">{isSavingWalkIn ? 'Enregistrement...' : 'Encaisser & Terminer'}</span>
                      </button>
                      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-white/30">
                        Enregistrée directement comme finalisée
                      </p>
                      <button onClick={() => setWalkStep(4)} className="w-full py-3 text-white/40 font-bold uppercase tracking-widest text-xs hover:text-white transition-colors">
                        Modifier
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {view === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="max-w-5xl mx-auto card-premium p-10"
          >
            <div className="flex items-center justify-between mb-12">
              <button 
                onClick={() => setView('list')} 
                className="p-3 rounded-2xl hover:bg-accent/10 text-accent transition-all duration-300 active:scale-90"
              >
                <X size={24} />
              </button>
              <div className="flex items-center gap-6">
                {[1, 2, 3, 4].filter(s => s !== 3 || services.length > 0).map((s) => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <div 
                      className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center font-bold transition-all duration-500 relative",
                        step === s ? "bg-accent text-on-accent scale-110 shadow-xl shadow-accent/30" : 
                        step > s ? "bg-emerald-100 text-emerald-600" : "bg-primary-bg text-ink/20 border border-border"
                      )}
                    >
                      {step > s ? <Check size={22} /> : s}
                      {step === s && (
                        <motion.div 
                          layoutId="step-ring"
                          className="absolute -inset-1.5 border-2 border-accent/20 rounded-[20px]"
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                    </div>
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-widest transition-colors duration-500",
                      step === s ? "text-accent" : "text-ink/20"
                    )}>
                      {s === 1 ? 'Prestations' : s === 2 ? 'Client' : s === 3 ? 'Services' : 'Résumé'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="w-12"></div>
            </div>

            {step === 1 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-10"
              >
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Sélectionnez les prestations</h3>
                  <p className="text-ink/40 mt-2 font-medium">Vous pouvez en choisir plusieurs pour ce rendez-vous</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {prestations.map((p) => {
                    const on = selectedPrestations.some(x => x.id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePrestation(p)}
                        className={cn(
                          "p-7 rounded-3xl border-2 text-left transition-all duration-300 relative group",
                          on
                            ? "border-accent bg-accent/5 shadow-lg shadow-accent/5"
                            : "border-border hover:border-accent/40 hover:bg-accent/5"
                        )}
                      >
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-colors duration-300",
                          on ? "bg-accent text-on-accent" : "bg-accent/10 text-accent"
                        )}>
                          <Scissors size={24} />
                        </div>
                        <h4 className="font-serif font-bold text-xl text-ink tracking-tight">{p.name}</h4>
                        <p className="text-xs text-ink/40 mt-2 font-medium line-clamp-2 leading-relaxed">{p.description}</p>
                        <div className="mt-6 flex items-center justify-between">
                          <p className="text-accent font-bold text-lg">{formatCurrency(p.price)}</p>
                          <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            on ? "bg-accent border-accent text-on-accent scale-110" : "border-border"
                          )}>
                            {on && <Check size={14} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedPrestations.length > 0 && (
                  <div className="p-4 rounded-2xl bg-accent/5 border border-accent/15 flex items-center justify-between">
                    <span className="text-sm font-bold text-ink/70">
                      {selectedPrestations.length} prestation{selectedPrestations.length > 1 ? 's' : ''} sélectionnée{selectedPrestations.length > 1 ? 's' : ''}
                    </span>
                    <span className="font-bold text-accent">{formatCurrency(prestationsSubtotal)}</span>
                  </div>
                )}

                {selectedPrestations.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 pt-12 border-t border-border"
                  >
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-serif font-bold text-ink">Choisissez une date</h3>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setPickerMonth(subMonths(pickerMonth, 1))}
                          className="p-2 rounded-xl hover:bg-accent/10 text-accent transition-colors"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <div className="flex items-center gap-2 text-accent font-bold text-sm min-w-[140px] justify-center">
                          <CalendarIcon size={18} />
                          {format(pickerMonth, 'MMMM yyyy', { locale: fr })}
                        </div>
                        <button 
                          onClick={() => setPickerMonth(addMonths(pickerMonth, 1))}
                          className="p-2 rounded-xl hover:bg-accent/10 text-accent transition-colors"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 gap-3">
                      {eachDayOfInterval({
                        start: startOfMonth(pickerMonth),
                        end: endOfMonth(pickerMonth)
                      }).map((day, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            "h-16 rounded-2xl flex flex-col items-center justify-center text-[10px] transition-all duration-300 border shadow-sm",
                            isSameDay(day, selectedDate) 
                              ? "bg-accent text-on-accent border-accent shadow-lg shadow-accent/20 scale-105" 
                              : "bg-surface border-border hover:border-accent/40 text-ink/60",
                            !isSameMonth(day, pickerMonth) && "opacity-20"
                          )}
                        >
                          <span className="uppercase font-bold tracking-widest opacity-60 mb-1">{format(day, 'EEE', { locale: fr })}</span>
                          <span className="text-base font-bold">{format(day, 'd')}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                <div className="flex justify-end pt-10">
                  <button
                    disabled={selectedPrestations.length === 0}
                    onClick={handleNext}
                    className="btn-gradient shimmer px-10 py-4 disabled:opacity-30 flex items-center gap-3"
                  >
                    Suivant <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-10"
              >
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Informations Client</h3>
                  <p className="text-ink/40 mt-2 font-medium">Précisez l'heure et les coordonnées de la cliente</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <ClientPicker
                      theme="accent"
                      defaultTab="create"
                      clients={clients}
                      name={clientInfo.name}
                      phone={clientInfo.phone}
                      selectedId={selectedClientId}
                      onSelect={pickClient}
                      onClear={clearClient}
                      onCreate={createClient}
                    />

                    {renderClientVisits()}

                    <div className="p-8 rounded-[40px] bg-surface border border-border shadow-sm space-y-6">
                      <div className="space-y-6">
                        <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Heure du rendez-vous</label>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 space-y-2">
                            <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest text-center">Heures</p>
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => {
                                  const [h, m] = clientInfo.time.split(':');
                                  const newH = (parseInt(h) - 1 + 24) % 24;
                                  setClientInfo({...clientInfo, time: `${newH.toString().padStart(2, '0')}:${m}`});
                                }}
                                className="w-10 h-10 rounded-xl bg-accent/5 text-accent hover:bg-accent hover:text-on-accent transition-all"
                              >
                                -
                              </button>
                              <div className="w-16 h-16 rounded-2xl bg-surface border-2 border-accent/10 flex items-center justify-center text-2xl font-serif font-bold text-ink">
                                {clientInfo.time.split(':')[0]}
                              </div>
                              <button 
                                onClick={() => {
                                  const [h, m] = clientInfo.time.split(':');
                                  const newH = (parseInt(h) + 1) % 24;
                                  setClientInfo({...clientInfo, time: `${newH.toString().padStart(2, '0')}:${m}`});
                                }}
                                className="w-10 h-10 rounded-xl bg-accent/5 text-accent hover:bg-accent hover:text-on-accent transition-all"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="text-2xl font-serif font-bold text-ink/20 pt-6">:</div>
                          <div className="flex-1 space-y-2">
                            <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest text-center">Minutes</p>
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => {
                                  const [h, m] = clientInfo.time.split(':');
                                  const newM = (parseInt(m) - 5 + 60) % 60;
                                  setClientInfo({...clientInfo, time: `${h}:${newM.toString().padStart(2, '0')}`});
                                }}
                                className="w-10 h-10 rounded-xl bg-accent/5 text-accent hover:bg-accent hover:text-on-accent transition-all"
                              >
                                -
                              </button>
                              <div className="w-16 h-16 rounded-2xl bg-surface border-2 border-accent/10 flex items-center justify-center text-2xl font-serif font-bold text-ink">
                                {clientInfo.time.split(':')[1]}
                              </div>
                              <button 
                                onClick={() => {
                                  const [h, m] = clientInfo.time.split(':');
                                  const newM = (parseInt(m) + 5) % 60;
                                  setClientInfo({...clientInfo, time: `${h}:${newM.toString().padStart(2, '0')}`});
                                }}
                                className="w-10 h-10 rounded-xl bg-accent/5 text-accent hover:bg-accent hover:text-on-accent transition-all"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-accent/5 border border-accent/10 flex items-start gap-4">
                      <div className="p-2 rounded-xl bg-accent/10 text-accent">
                        <CalendarIcon size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-accent uppercase tracking-widest mb-1">Récapitulatif</p>
                        <p className="text-sm font-bold text-ink">Le {format(selectedDate, 'EEEE dd MMMM yyyy', { locale: fr })} à {clientInfo.time}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xl font-serif font-bold text-ink">Planning du jour</h4>
                      <div className="px-3 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-widest">
                        {format(selectedDate, 'dd MMM', { locale: fr })}
                      </div>
                    </div>

                    <div className="p-6 rounded-[40px] bg-surface border border-border shadow-sm max-h-[400px] overflow-y-auto space-y-4 custom-scrollbar">
                      {reservations.filter(r => isSameDay(new Date(r.date), selectedDate)).length > 0 ? (
                        reservations
                          .filter(r => isSameDay(new Date(r.date), selectedDate))
                          .sort((a, b) => a.time.localeCompare(b.time))
                          .map((r) => (
                            <div key={r.id} className="flex items-center gap-4 p-4 rounded-2xl bg-primary-bg/50 border border-border/50 group hover:border-accent/20 transition-all">
                              <div className="w-14 h-14 rounded-xl bg-surface border border-border flex flex-col items-center justify-center text-accent font-bold shadow-sm">
                                <span className="text-xs opacity-40 leading-none mb-1">{r.time.split(':')[0]}h</span>
                                <span className="text-sm leading-none">{r.time.split(':')[1]}</span>
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-ink">{r.clientName}</p>
                                <p className="text-[10px] text-ink/40 font-medium uppercase tracking-widest mt-0.5">{r.prestationName}</p>
                              </div>
                              <div className={cn(
                                "px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest",
                                r.status === 'finalized' ? "bg-emerald-100 text-emerald-600" : "bg-accent/10 text-accent"
                              )}>
                                {r.status === 'finalized' ? 'Terminé' : 'Prévu'}
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="py-20 text-center space-y-4">
                          <div className="w-16 h-16 rounded-full bg-accent/5 flex items-center justify-center mx-auto text-accent/20">
                            <CalendarIcon size={32} />
                          </div>
                          <p className="text-sm font-medium text-ink/30 italic">Aucun rendez-vous pour cette journée</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-10">
                  <button onClick={handleBack} className="px-10 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-accent hover:border-accent/40 transition-all duration-300">Retour</button>
                  <button
                    disabled={!clientInfo.name.trim()}
                    onClick={handleNext}
                    className="btn-gradient shimmer px-10 py-4 disabled:opacity-30 flex items-center gap-3"
                  >
                    Suivant <ChevronRight size={20} />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && services.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-10"
              >
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Services Additionnels</h3>
                  <p className="text-ink/40 mt-2 font-medium">Ajoutez des services complémentaires à la prestation</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        const newServices = selectedServices.includes(s.id) 
                          ? selectedServices.filter(id => id !== s.id)
                          : [...selectedServices, s.id];
                        setSelectedServices(newServices);
                        let total = selectedPrestation?.price || 0;
                        newServices.forEach(id => {
                          const serv = services.find(serv => serv.id === id);
                          if (serv) total += serv.price;
                        });
                        setTotalPrice(total);
                      }}
                      className={cn(
                        "p-7 rounded-3xl border-2 text-left flex justify-between items-center transition-all duration-300 group",
                        selectedServices.includes(s.id) 
                          ? "border-accent bg-accent/5 shadow-lg shadow-accent/5" 
                          : "border-border hover:border-accent/40 hover:bg-accent/5"
                      )}
                    >
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-300",
                          selectedServices.includes(s.id) ? "bg-accent text-on-accent" : "bg-accent/10 text-accent"
                        )}>
                          <Plus size={24} />
                        </div>
                        <div>
                          <h4 className="font-serif font-bold text-lg text-ink tracking-tight">{s.name}</h4>
                          <p className="text-accent font-bold mt-1">{formatCurrency(s.price)}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                        selectedServices.includes(s.id) ? "bg-accent border-accent text-on-accent scale-110" : "border-border group-hover:border-accent/40"
                      )}>
                        {selectedServices.includes(s.id) && <Check size={16} />}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex justify-between pt-10">
                  <button onClick={handleBack} className="px-10 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-accent hover:border-accent/40 transition-all duration-300">Retour</button>
                  <button onClick={handleNext} className="btn-gradient shimmer px-10 py-4 flex items-center gap-3">Suivant <ChevronRight size={20} /></button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-10"
              >
                <div className="text-center">
                  <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Résumé & Paiement</h3>
                  <p className="text-ink/40 mt-2 font-medium">Vérifiez les détails avant de confirmer</p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="p-8 rounded-3xl bg-surface border border-border shadow-sm space-y-6">
                      <div className="flex items-center gap-5 pb-6 border-b border-border">
                        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                          <User size={32} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-serif font-bold text-2xl text-ink tracking-tight truncate">{clientInfo.name}</h4>
                          <p className="text-sm font-bold text-accent mt-1 tracking-widest uppercase opacity-70">{clientInfo.phone}</p>
                          {clientVisits !== null && (
                            <p className="text-[11px] font-bold text-ink/40 mt-1.5 uppercase tracking-widest flex items-center gap-1.5">
                              <Award size={12} className={fidelityEarned ? 'text-amber-500' : 'text-ink/30'} />
                              {clientVisits} visite{clientVisits > 1 ? 's' : ''} · celle-ci = n°{clientVisits + 1}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 text-ink/40 font-bold uppercase tracking-widest text-[10px]">
                            <CalendarIcon size={14} />
                            Date
                          </div>
                          <span className="font-bold text-ink">{format(selectedDate, 'dd MMMM yyyy', { locale: fr })}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 text-ink/40 font-bold uppercase tracking-widest text-[10px]">
                            <Clock size={14} />
                            Heure
                          </div>
                          <span className="font-bold text-ink">{clientInfo.time}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-8 rounded-3xl bg-accent/5 border border-accent/10 space-y-6">
                      <h5 className="text-xs font-bold uppercase tracking-[0.2em] text-accent opacity-70">Détails de la réservation</h5>
                      <div className="space-y-4">
                        {selectedPrestations.map(p => (
                          <div key={p.id} className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-accent" />
                              <span className="text-sm font-bold text-ink/70">{p.name}</span>
                            </div>
                            <span className="font-bold text-ink">{formatCurrency(p.price)}</span>
                          </div>
                        ))}
                        {selectedServices.map(id => {
                          const s = services.find(serv => serv.id === id);
                          return (
                            <div key={id} className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-accent/40" />
                                <span className="text-sm font-bold text-ink/70">{s?.name}</span>
                              </div>
                              <span className="font-bold text-ink">{formatCurrency(s?.price || 0)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {renderFidelityPanel()}
                  </div>

                  <div className="p-8 rounded-3xl bg-panel text-white shadow-2xl shadow-black/40 flex flex-col justify-between">
                    <div className="space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-white/10 text-accent">
                          <CreditCard size={28} />
                        </div>
                        <h4 className="text-xl font-serif font-bold">Total de la prestation</h4>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-2 pb-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Sous-total</span>
                            <span className="font-bold text-white/70">{formatCurrency(grossTotal)}</span>
                          </div>
                          {discountAmount > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-amber-300 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                                <Award size={13} /> Fidélité {fidelityLabel}
                              </span>
                              <span className="font-bold text-amber-300">− {formatCurrency(discountAmount)}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-end">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Montant Total</span>
                          <input
                            type="number"
                            value={totalPrice}
                            onChange={(e) => setTotalPrice(Number(e.target.value))}
                            title="Modifiable manuellement"
                            className="bg-transparent text-4xl font-serif font-bold text-accent border-b-2 border-white/10 hover:border-accent/40 focus:border-accent focus:outline-none transition-all w-48 text-right pr-2"
                          />
                        </div>
                        {manualTotal !== null && manualTotal !== computedTotal && (
                          <button onClick={() => setManualTotal(null)} className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors ml-auto block -mt-4">
                            Rétablir {formatCurrency(computedTotal)}
                          </button>
                        )}

                        <div className="space-y-3">
                          <label className="text-white/40 text-[10px] font-bold uppercase tracking-widest ml-1">Acompte versé (DA)</label>
                          <div className="relative group">
                            <DollarSign className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-accent transition-colors" size={20} />
                            <input
                              type="number"
                              value={paidAmount}
                              onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value)))}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white font-bold focus:ring-2 focus:ring-accent/50 focus:border-accent/50 outline-none transition-all"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Reste à payer</span>
                          <span className="text-2xl font-serif font-bold text-red-400">{formatCurrency(Math.max(0, totalPrice - paidAmount))}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-10 space-y-4">
                      <button
                        onClick={saveReservation}
                        disabled={selectedPrestations.length === 0}
                        className="w-full btn-gradient shimmer py-5 rounded-2xl flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check size={24} />
                        <span className="text-lg font-bold tracking-wide">Confirmer le rendez-vous</span>
                      </button>
                      <button onClick={handleBack} className="w-full py-4 text-white/40 font-bold uppercase tracking-widest text-xs hover:text-white transition-colors">
                        Modifier les détails
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    )}

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModal(null)}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "relative bg-surface rounded-[40px] shadow-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar",
                modal === 'print' && "max-w-3xl"
              )}
            >
              {modal === 'details' && selectedReservation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setModal(null)}
                    className="absolute inset-0 bg-gradient-to-br from-overlay via-overlay to-overlay backdrop-blur-xl"
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85, y: 60, rotateX: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                    exit={{ opacity: 0, scale: 0.85, y: 60, rotateX: 20 }}
                    transition={{ 
                      type: 'spring', 
                      damping: 12, 
                      stiffness: 400,
                      duration: 0.35
                    }}
                    style={{ perspective: 1000 }}
                    className="relative bg-gradient-to-br from-surface via-surface to-primary-bg/30 rounded-[48px] shadow-2xl overflow-hidden w-full max-w-3xl max-h-[85vh] overflow-y-auto custom-scrollbar border border-border will-change-transform"
                  >
                    {/* Animated Background Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary-bg/20 pointer-events-none" />

                    {/* Premium Header */}
                    <motion.div 
                      initial={{ opacity: 0, y: -30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, type: 'spring' }}
                      className="sticky top-0 z-20 bg-gradient-to-r from-accent/15 via-accent/10 to-transparent border-b-2 border-accent/20 px-8 py-8 backdrop-blur-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                            className={cn(
                              "w-16 h-16 rounded-3xl flex items-center justify-center",
                              selectedReservation.status === 'finalized'
                                ? "bg-emerald-100 text-emerald-600"
                                : "bg-amber-100 text-amber-600"
                            )}
                          >
                            <User size={32} />
                          </motion.div>
                          <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 }}
                          >
                            <h3 className="text-3xl font-serif font-bold text-ink">{selectedReservation.clientName}</h3>
                            <p className="text-accent font-bold tracking-widest uppercase text-xs mt-2">{selectedReservation.clientPhone}</p>
                          </motion.div>
                        </div>
                        <motion.button 
                          whileHover={{ scale: 1.1, rotate: 90 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setModal(null)}
                          className="p-4 rounded-full hover:bg-gradient-to-br hover:from-accent/20 hover:to-accent/10 text-accent transition-all duration-300 shadow-lg"
                        >
                          <X size={28} strokeWidth={2.5} />
                        </motion.button>
                      </div>
                    </motion.div>

                    {/* Main Content */}
                    <div className="p-8 space-y-6 relative z-10">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="grid grid-cols-2 gap-6"
                      >
                        <motion.div 
                          whileHover={{ y: -4 }}
                          className={cn(
                            "p-6 rounded-3xl border-2 space-y-4 shadow-lg",
                            selectedReservation.status === 'finalized'
                              ? "bg-gradient-to-br from-emerald-50 to-emerald-100/60 border-emerald-300 shadow-emerald-200/40"
                              : "bg-gradient-to-br from-amber-50 to-amber-100/60 border-amber-300 shadow-amber-200/40"
                          )}
                        >
                          <h4 className={cn(
                            "text-[10px] font-bold uppercase tracking-[0.2em]",
                            selectedReservation.status === 'finalized'
                              ? "text-emerald-700"
                              : "text-amber-700"
                          )}>Détails du RDV</h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-ink/60 font-medium">Date</span>
                              <span className="text-sm font-bold text-ink">{format(new Date(selectedReservation.date), 'dd MMMM yyyy', { locale: fr })}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-ink/60 font-medium">Heure</span>
                              <span className="text-sm font-bold text-ink">{selectedReservation.time}</span>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                              <span className="text-sm text-ink/60 font-medium shrink-0">Prestation{(selectedReservation.prestationIds?.length || 0) > 1 ? 's' : ''}</span>
                              <span className="text-sm font-bold text-ink text-right">
                                {(selectedReservation.prestationIds?.length ? selectedReservation.prestationIds : [selectedReservation.prestationId])
                                  .map(id => prestations.find(p => p.id === id)?.name)
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </span>
                            </div>
                            {(selectedReservation.discountAmount || 0) > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-ink/60 font-medium">Réduction fidélité</span>
                                <span className="text-sm font-bold text-amber-600">− {formatCurrency(selectedReservation.discountAmount || 0)}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-ink/60 font-medium">Créé par</span>
                              <span className="text-sm font-bold text-ink">{employees.find(e => e.id === selectedReservation.createdBy)?.fullName || (selectedReservation.createdBy === currentUser.id ? currentUser.fullName : 'Inconnu')}</span>
                            </div>
                            {selectedReservation.workerId && (
                              <div className="flex items-center justify-between pt-3 border-t border-current/10">
                                <span className="text-sm text-ink/60 font-medium">Effectué par</span>
                                <span className="text-sm font-bold text-ink">{employees.find(e => e.id === selectedReservation.workerId)?.fullName || (selectedReservation.workerId === currentUser.id ? currentUser.fullName : 'Inconnu')}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>

                        <motion.div 
                          whileHover={{ y: -4 }}
                          className={cn(
                            "p-6 rounded-3xl border-2 space-y-4 shadow-lg",
                            selectedReservation.status === 'finalized'
                              ? "bg-gradient-to-br from-emerald-50 to-emerald-100/60 border-emerald-300 shadow-emerald-200/40"
                              : "bg-gradient-to-br from-amber-50 to-amber-100/60 border-amber-300 shadow-amber-200/40"
                          )}
                        >
                          <h4 className={cn(
                            "text-[10px] font-bold uppercase tracking-[0.2em]",
                            selectedReservation.status === 'finalized'
                              ? "text-emerald-700"
                              : "text-amber-700"
                          )}>Paiement & Services</h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-ink/60 font-medium">Total</span>
                              <span className="text-sm font-bold text-ink">{formatCurrency(selectedReservation.totalPrice)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-ink/60 font-medium">Versé</span>
                              <span className="text-sm font-bold text-emerald-600">{formatCurrency(selectedReservation.paidAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t border-current/10">
                              <span className="text-sm text-ink/60 font-bold">Reste</span>
                              <span className="text-lg font-serif font-bold text-red-500">{formatCurrency(Math.max(0, selectedReservation.totalPrice - selectedReservation.paidAmount))}</span>
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t border-current/10">
                              <span className="text-sm text-ink/60 font-medium">Statut</span>
                              <motion.span 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 200 }}
                                className={cn(
                                  "text-xs font-bold px-3 py-1.5 rounded-full",
                                  selectedReservation.status === 'finalized' 
                                    ? 'bg-emerald-200 text-emerald-700 shadow-lg shadow-emerald-200/50' 
                                    : selectedReservation.status === 'pending' 
                                      ? 'bg-amber-200 text-amber-700 shadow-lg shadow-amber-200/50' 
                                      : 'bg-red-200 text-red-700 shadow-lg shadow-red-200/50'
                                )}
                              >
                                {selectedReservation.status === 'finalized' ? '✓ Finalisé' : selectedReservation.status === 'pending' ? '○ En Attente' : '✗ Annulé'}
                              </motion.span>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>

                      {/* Services Section */}
                      {(selectedReservation.serviceIds && selectedReservation.serviceIds.length > 0) && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25 }}
                          whileHover={{ y: -2 }}
                          className={cn(
                            "p-6 rounded-3xl border-2 space-y-4 shadow-lg",
                            selectedReservation.status === 'finalized'
                              ? "bg-gradient-to-br from-emerald-50 to-emerald-100/40 border-emerald-200 shadow-emerald-200/30"
                              : "bg-gradient-to-br from-amber-50 to-amber-100/40 border-amber-200 shadow-amber-200/30"
                          )}
                        >
                          <h4 className={cn(
                            "text-[10px] font-bold uppercase tracking-[0.2em]",
                            selectedReservation.status === 'finalized'
                              ? "text-emerald-600"
                              : "text-amber-600"
                          )}>Services Additionnels</h4>
                          <motion.div className="space-y-2">
                            <AnimatePresence>
                              {selectedReservation.serviceIds.map((serviceId, idx) => {
                                const service = services.find(s => s.id === serviceId);
                                if (!service) return null;
                                return (
                                  <motion.div
                                    key={serviceId}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ delay: 0.3 + idx * 0.05, type: 'spring', stiffness: 200 }}
                                    className={cn(
                                      "flex items-center justify-between p-3 rounded-lg border border-current/10",
                                      selectedReservation.status === 'finalized'
                                        ? "bg-emerald-50/60 hover:bg-emerald-100/60"
                                        : "bg-amber-50/60 hover:bg-amber-100/60"
                                    )}
                                  >
                                    <div>
                                      <p className="font-bold text-ink text-sm">{service.name}</p>
                                      <p className="text-xs text-ink/40">{service.description}</p>
                                    </div>
                                    <p className={cn(
                                      "font-bold",
                                      selectedReservation.status === 'finalized'
                                        ? "text-emerald-600"
                                        : "text-amber-600"
                                    )}>{formatCurrency(service.price)}</p>
                                  </motion.div>
                                );
                              })}
                            </AnimatePresence>
                          </motion.div>
                        </motion.div>
                      )}

                      {/* Action Buttons */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-wrap gap-3"
                      >
                        {can('edit') && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleEdit(selectedReservation)}
                          className={cn(
                            "flex-1 min-w-[160px] py-3 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 shadow-lg transition-all",
                            selectedReservation.status === 'finalized'
                              ? "bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200 hover:shadow-emerald-200/50"
                              : "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200 hover:shadow-amber-200/50"
                          )}
                        >
                          <Edit2 size={18} /> Modifier
                        </motion.button>
                        )}
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setModal('changeDate')}
                          className={cn(
                            "flex-1 min-w-[160px] py-3 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 shadow-lg transition-all",
                            selectedReservation.status === 'finalized'
                              ? "bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200 hover:shadow-emerald-200/50"
                              : "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200 hover:shadow-amber-200/50"
                          )}
                        >
                          <CalendarIcon size={18} /> Date/Heure
                        </motion.button>
                        {selectedReservation.totalPrice > selectedReservation.paidAmount && (
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setCurrentPayment(0);
                              setModal('payDebt');
                            }}
                            className="flex-1 min-w-[160px] py-3 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 border-2 border-amber-300 font-bold text-amber-600 hover:from-amber-200 hover:to-amber-100 hover:shadow-lg hover:shadow-amber-200/50 flex items-center justify-center gap-2 transition-all shadow-lg"
                          >
                            <CreditCard size={18} /> Payer
                          </motion.button>
                        )}
                        {can('delete') && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setModal('delete')}
                          className="flex-1 min-w-[160px] py-3 rounded-2xl bg-gradient-to-br from-red-100 to-red-50 border-2 border-red-300 font-bold text-red-600 hover:from-red-200 hover:to-red-100 hover:shadow-lg hover:shadow-red-200/50 flex items-center justify-center gap-2 transition-all shadow-lg"
                        >
                          <Trash2 size={18} /> Supprimer
                        </motion.button>
                        )}
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setModal(null)}
                          className="flex-1 min-w-[160px] py-3 rounded-2xl bg-gradient-to-br from-ink via-ink to-overlay text-white font-bold hover:from-overlay hover:via-ink hover:to-overlay hover:shadow-lg hover:shadow-black/40 flex items-center justify-center gap-2 transition-all shadow-lg"
                        >
                          Fermer
                        </motion.button>
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              )}

              {modal === 'finalise' && selectedReservation && (
                <div className="p-10 space-y-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="text-center">
                    <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Finaliser la Prestation</h3>
                    <p className="text-ink/40 mt-2 font-medium">Sélectionnez les services, enregistrez le paiement et l'employé</p>
                  </div>

                  {/* Reservation Summary */}
                  <div className="p-6 rounded-3xl bg-primary-bg/50 border border-border space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/30">Détails de la réservation</h4>
                      <span className="text-xs font-bold text-accent">{selectedReservation.clientName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-ink/40 shrink-0">Prestation:</span>
                        <span className="font-bold text-ink text-right">
                          {(selectedReservation.prestationIds?.length ? selectedReservation.prestationIds : [selectedReservation.prestationId])
                            .map(id => prestations.find(p => p.id === id)?.name)
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink/40">Date:</span>
                        <span className="font-bold text-ink">{format(new Date(selectedReservation.date), 'dd/MM/yyyy')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Services Selection */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-bold text-ink flex items-center gap-2">
                        <Sparkles size={20} className="text-accent" />
                        Services Additionnels
                      </h4>
                    </div>
                    
                    {/* Available Services Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {services.map((service) => {
                        const isSelected = finalizeServices.includes(service.id);
                        return (
                          <motion.button
                            key={service.id}
                            onClick={() => {
                              setFinalizeServices(prev =>
                                prev.includes(service.id)
                                  ? prev.filter(s => s !== service.id)
                                  : [...prev, service.id]
                              );
                            }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "p-4 rounded-xl border-2 transition-all text-left",
                              isSelected
                                ? "border-accent bg-accent/10"
                                : "border-border bg-surface hover:border-accent/30"
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-bold text-sm text-ink">{service.name}</p>
                                <p className="text-xs text-accent font-bold mt-1">{formatCurrency(service.price)}</p>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                                  <Check size={14} className="text-white" />
                                </div>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Selected Services Summary */}
                    {finalizeServices.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl bg-accent/5 border border-accent/20 space-y-3"
                      >
                        <h5 className="text-sm font-bold text-ink flex items-center gap-2">
                          <Check size={16} className="text-accent" />
                          Services Sélectionnés
                        </h5>
                        <div className="space-y-2">
                          {finalizeServices.map((serviceId) => {
                            const service = services.find(s => s.id === serviceId);
                            return (
                              <div key={serviceId} className="flex items-center justify-between p-2 bg-surface rounded-lg">
                                <div>
                                  <p className="text-sm font-bold text-ink">{service?.name}</p>
                                  <p className="text-xs text-ink/40">{service?.description}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <p className="font-bold text-accent">{formatCurrency(service?.price || 0)}</p>
                                  <button
                                    onClick={() => setFinalizeServices(prev => prev.filter(s => s !== serviceId))}
                                    className="p-1 rounded-lg hover:bg-red-50 text-ink/40 hover:text-red-500 transition-all"
                                  >
                                    <Trash size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="pt-2 border-t border-accent/20 flex justify-between items-center">
                          <p className="text-xs font-bold uppercase tracking-widest text-ink/40">Total Services</p>
                          <p className="text-lg font-bold text-accent">
                            {formatCurrency(
                              finalizeServices.reduce((sum, serviceId) => {
                                const service = services.find(s => s.id === serviceId);
                                return sum + (service?.price || 0);
                              }, 0)
                            )}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Produits utilisés — same picker as the walk-in flow */}
                  <ProductUsagePicker
                    theme="accent"
                    items={finalizeProducts}
                    setItems={setFinalizeProducts}
                    query={productSearchQuery}
                    setQuery={setProductSearchQuery}
                    results={productSearchResults}
                    showDropdown={showProductDropdown}
                    setShowDropdown={setShowProductDropdown}
                    onSearch={searchFinalizeProducts}
                    debounceRef={productSearchDebounce}
                    detailProduct={detailProductModal}
                    setDetailProduct={setDetailProductModal}
                    detailQty={detailProductQty}
                    setDetailQty={setDetailProductQty}
                    detailPrice={detailProductPrice}
                    setDetailPrice={setDetailProductPrice}
                  />

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Prix Final (DA)</label>
                        <div className="relative group">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20 group-focus-within:text-accent" size={16} />
                          <input 
                            type="number" 
                            value={finalPrice}
                            onChange={(e) => setFinalPrice(Number(e.target.value))}
                            className="w-full input-premium pl-10"
                          />
                        </div>
                        {finalizeServices.length > 0 && (
                          <p className="text-xs text-accent font-bold">
                            + {formatCurrency(finalizeServices.reduce((sum, serviceId) => {
                              const service = services.find(s => s.id === serviceId);
                              return sum + (service?.price || 0);
                            }, 0))} services
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Paiement Actuel (DA)</label>
                        <div className="relative group">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300 group-focus-within:text-emerald-500" size={16} />
                          <input 
                            type="number" 
                            value={currentPayment}
                            onChange={(e) => setCurrentPayment(Number(e.target.value))}
                            className="w-full input-premium pl-10 border-emerald-200 focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-panel text-white flex justify-between items-center shadow-xl shadow-black/40">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Reste à payer après ce versement</p>
                        <p className="text-3xl font-serif font-bold text-red-400 mt-1">
                          {formatCurrency((finalPrice + finalizeServices.reduce((sum, serviceId) => {
                            const service = services.find(s => s.id === serviceId);
                            return sum + (service?.price || 0);
                          }, 0) + finalizeProducts.reduce((s, p) => s + p.price, 0)) - (selectedReservation.paidAmount + currentPayment))}
                        </p>
                        {finalizeProducts.length > 0 && (
                          <p className="text-[10px] text-white/40 mt-1">+ {formatCurrency(finalizeProducts.reduce((s, p) => s + p.price, 0))} produits</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Déjà versé</p>
                        <p className="text-xl font-bold text-emerald-400">{formatCurrency(selectedReservation.paidAmount)}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <TeamPicker
                        theme="accent"
                        employees={employees}
                        currentUser={currentUser}
                        basePrice={finalPrice}
                        selectedWorkerId={selectedWorkerId}
                        setSelectedWorkerId={setSelectedWorkerId}
                        workers={reservationWorkers}
                        setWorkers={setReservationWorkers}
                        amounts={workerAmounts}
                        setAmounts={setWorkerAmounts}
                        editingId={editingWorkerAmountId}
                        setEditingId={setEditingWorkerAmountId}
                        showSelector={showWorkerSelector}
                        setShowSelector={setShowWorkerSelector}
                      />


                      {/* Finalization User Display */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                          <Check size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Finalisé par</p>
                          <p className="font-bold text-blue-900">{currentUser.fullName}</p>
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setModal(null)} className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all">Annuler</button>
                    <button onClick={saveFinalize} className="flex-1 btn-gradient shimmer py-4 rounded-2xl font-bold flex items-center justify-center gap-2">
                      <Check size={20} /> Enregistrer & Finaliser
                    </button>
                  </div>
                </div>
              )}

              {modal === 'payDebt' && selectedReservation && (
                <div className="p-6 sm:p-10 space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-3xl bg-accent/10 flex items-center justify-center text-accent">
                        <CreditCard size={32} />
                      </div>
                      <div>
                        <h3 className="text-2xl sm:text-3xl font-serif font-bold text-ink tracking-tight">Règlement de Dette</h3>
                        <p className="text-ink/40 mt-1 font-medium text-sm sm:text-base">Enregistrez un nouveau versement pour cette cliente</p>
                      </div>
                    </div>
                    <button onClick={() => setModal(null)} className="p-3 rounded-2xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                      <X size={24} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="p-6 rounded-3xl bg-surface border border-border shadow-sm space-y-4">
                      <div className="flex items-center gap-3 pb-4 border-b border-border">
                        <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent">
                          <User size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-ink/40">Cliente</p>
                          <p className="font-bold text-ink">{selectedReservation.clientName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent">
                          <CalendarIcon size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-ink/40">Date du rendez-vous</p>
                          <p className="font-bold text-ink">{format(new Date(selectedReservation.date), 'dd MMMM yyyy', { locale: fr })}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-8 rounded-[32px] bg-panel text-white space-y-6 flex flex-col justify-center">
                      <div className="flex justify-between items-end">
                        <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Total Prestation</span>
                        <span className="text-xl font-serif font-bold">{formatCurrency(selectedReservation.totalPrice)}</span>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Déjà Versé</span>
                        <span className="text-xl font-serif font-bold text-emerald-400">{formatCurrency(selectedReservation.paidAmount)}</span>
                      </div>
                      <div className="pt-6 border-t border-border flex justify-between items-end">
                        <span className="text-accent text-[10px] font-bold uppercase tracking-widest">Reste Actuel</span>
                        <span className="text-3xl font-serif font-bold text-accent">{formatCurrency(selectedReservation.totalPrice - selectedReservation.paidAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 rounded-3xl bg-accent/5 border border-accent/10 space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-accent ml-1">Montant versé aujourd'hui (DA)</label>
                      <div className="relative group">
                        <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-accent/40 group-focus-within:text-accent transition-colors" size={24} />
                        <input 
                          type="number" 
                          value={currentPayment}
                          onChange={(e) => setCurrentPayment(Number(e.target.value))}
                          className="w-full bg-surface border-2 border-accent/10 rounded-2xl py-6 pl-16 pr-8 text-3xl font-serif font-bold text-ink focus:ring-4 focus:ring-accent/10 focus:border-accent outline-none transition-all text-center"
                          placeholder="0"
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-center gap-4 py-4 px-6 rounded-2xl bg-surface border border-accent/10">
                      <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-1">Nouveau reste à payer</p>
                        <p className={cn(
                          "text-2xl font-serif font-bold transition-colors duration-300",
                          selectedReservation.totalPrice - (selectedReservation.paidAmount + currentPayment) <= 0 ? "text-emerald-500" : "text-red-500"
                        )}>
                          {formatCurrency(Math.max(0, selectedReservation.totalPrice - (selectedReservation.paidAmount + currentPayment)))}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <button 
                      onClick={() => setModal(null)} 
                      className="flex-1 py-5 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink hover:border-ink/20 transition-all order-2 sm:order-1"
                    >
                      Annuler
                    </button>
                    <button 
                      onClick={saveDebtPayment} 
                      className="flex-1 btn-gradient shimmer py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 order-1 sm:order-2"
                    >
                      <Check size={24} /> Confirmer le paiement
                    </button>
                  </div>
                </div>
              )}

              {modal === 'changeDate' && selectedReservation && (
                <div className="p-10 space-y-8">
                  <div className="text-center">
                    <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Changer Date & Heure</h3>
                    <p className="text-ink/40 mt-2 font-medium">Sélectionnez un nouveau créneau disponible</p>
                  </div>

                  <div className="space-y-8">
                    <div className="grid grid-cols-7 gap-2">
                      {eachDayOfInterval({
                        start: new Date(),
                        end: addDays(new Date(), 13)
                      }).map((day, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            "h-14 rounded-xl flex flex-col items-center justify-center text-[10px] transition-all duration-300 border",
                            isSameDay(day, selectedDate) 
                              ? "bg-accent text-on-accent border-accent shadow-lg shadow-accent/20" 
                              : "bg-surface border-border hover:border-accent/40 text-ink/60"
                          )}
                        >
                          <span className="uppercase font-bold opacity-60">{format(day, 'EEE', { locale: fr })}</span>
                          <span className="text-sm font-bold">{format(day, 'd')}</span>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Nouvelle Heure</label>
                      <input 
                        type="time" 
                        value={clientInfo.time}
                        onChange={(e) => setClientInfo({...clientInfo, time: e.target.value})}
                        className="w-full input-premium"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setModal(null)} className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all">Annuler</button>
                    <button onClick={saveNewDate} className="flex-1 btn-gradient shimmer py-4 rounded-2xl font-bold">Enregistrer</button>
                  </div>
                </div>
              )}

              {modal === 'delete' && selectedReservation && (
                <div className="p-10 space-y-8 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center mx-auto shadow-inner">
                    <Trash2 size={40} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-serif font-bold text-ink tracking-tight">Supprimer ?</h3>
                    <p className="text-ink/40 mt-2 font-medium leading-relaxed">Êtes-vous sûr de vouloir supprimer la réservation de <span className="text-ink font-bold">{selectedReservation.clientName}</span> ? Cette action est irréversible.</p>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setModal(null)} className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all">Annuler</button>
                    <button onClick={handleDelete} className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-xl shadow-red-500/20">Supprimer définitivement</button>
                  </div>
                </div>
              )}

              {/* ── Print prompt: preview + a plain "print or not" choice ── */}
              {modal === 'print' && selectedReservation && (
                <div className="p-6 sm:p-8 space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                      <Printer size={28} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-serif font-bold text-ink tracking-tight">Imprimer la facture ?</h3>
                      <p className="text-ink/40 mt-1 font-medium text-sm">
                        Réservation enregistrée pour <span className="font-bold text-ink/70">{selectedReservation.clientName}</span>.
                      </p>
                    </div>
                  </div>

                  {/* Live preview of exactly what will be printed */}
                  <div className="rounded-2xl border border-border bg-white overflow-hidden">
                    <div className="max-h-[45vh] overflow-y-auto custom-scrollbar">
                      <div
                        className="origin-top"
                        style={{ zoom: 0.62 }}
                        dangerouslySetInnerHTML={{ __html: buildInvoiceHtml() }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => setModal(null)}
                      className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/50 hover:text-ink transition-all"
                    >
                      Non, merci
                    </button>
                    <button
                      onClick={printInvoice}
                      className="flex-1 btn-gradient shimmer py-4 rounded-2xl font-bold flex items-center justify-center gap-3"
                    >
                      <Printer size={20} /> Oui, imprimer
                    </button>
                  </div>
                </div>
              )}

              {modal === 'dayView' && selectedCalendarDay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setModal(null)}
                    className="absolute inset-0 bg-gradient-to-br from-overlay via-overlay to-overlay backdrop-blur-xl"
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85, y: 60, rotateX: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                    exit={{ opacity: 0, scale: 0.85, y: 60, rotateX: 20 }}
                    transition={{ 
                      type: 'spring', 
                      damping: 12, 
                      stiffness: 400,
                      duration: 0.35
                    }}
                    style={{ perspective: 1000 }}
                    className="relative bg-gradient-to-br from-surface via-surface to-primary-bg/30 rounded-[48px] shadow-2xl overflow-hidden w-full max-w-3xl max-h-[85vh] overflow-y-auto custom-scrollbar border border-border will-change-transform"
                  >
                    {/* Animated Background Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary-bg/20 pointer-events-none" />

                    {/* Premium Header */}
                    <motion.div 
                      initial={{ opacity: 0, y: -30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, type: 'spring' }}
                      className="sticky top-0 z-20 bg-gradient-to-r from-accent/15 via-accent/10 to-transparent border-b-2 border-accent/20 px-4 sm:px-6 md:px-12 py-4 sm:py-6 md:py-10 backdrop-blur-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15, type: 'spring' }}
                            className="space-y-2 sm:space-y-3"
                          >
                            <h3 className="text-2xl sm:text-3xl md:text-5xl font-serif font-bold bg-gradient-to-r from-ink via-accent to-ink bg-clip-text text-transparent">
                              {format(selectedCalendarDay, 'd MMMM', { locale: fr })}
                            </h3>
                            <p className="text-accent font-bold text-xs sm:text-sm uppercase tracking-[0.1em] md:tracking-[0.15em] flex items-center gap-2">
                              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-accent" />
                              {format(selectedCalendarDay, 'EEEE', { locale: fr })}
                            </p>
                          </motion.div>
                        </div>
                        <motion.button 
                          whileHover={{ scale: 1.1, rotate: 90 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setModal(null)}
                          className="p-2 sm:p-3 md:p-4 rounded-full hover:bg-gradient-to-br hover:from-accent/20 hover:to-accent/10 text-accent transition-all duration-300 shadow-lg"
                        >
                          <X size={24} className="sm:scale-[1.17] md:scale-[1.33]" strokeWidth={2.5} />
                        </motion.button>
                      </div>
                    </motion.div>

                    {/* Main Content */}
                    <div className="p-4 sm:p-6 md:p-12 space-y-4 sm:space-y-6 md:space-y-8 relative z-10">
                      {(() => {
                        const dayReservations = reservations
                          .filter(r => isSameDay(new Date(r.date), selectedCalendarDay))
                          .sort((a, b) => a.time.localeCompare(b.time));
                        
                        if (dayReservations.length === 0) {
                          return (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: 40 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              transition={{ type: 'spring', delay: 0.2 }}
                              className="py-32 text-center space-y-6"
                            >
                              <motion.div 
                                animate={{ y: [0, -10, 0] }}
                                transition={{ duration: 3, repeat: Infinity }}
                                className="w-28 h-28 rounded-full bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center mx-auto text-accent/30 shadow-xl shadow-accent/10"
                              >
                                <CalendarIcon size={64} />
                              </motion.div>
                              <div className="space-y-3">
                                <p className="text-2xl font-serif font-bold text-ink/20">Jour libre</p>
                                <p className="text-base font-medium text-ink/30 italic">Aucun rendez-vous pour cette journée</p>
                              </div>
                            </motion.div>
                          );
                        }

                        return (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ staggerChildren: 0.05, delayChildren: 0.2 }}
                            className="space-y-8"
                          >
                            {/* Enhanced Summary Stats */}
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="grid grid-cols-3 gap-6 pb-8 border-b-2 border-border/40"
                            >
                              <motion.div 
                                whileHover={{ scale: 1.08, y: -4 }}
                                whileTap={{ scale: 0.97 }}
                                className="p-6 rounded-3xl bg-gradient-to-br from-accent/20 to-accent/5 border-2 border-accent/30 text-center shadow-lg shadow-accent/10 group cursor-default"
                              >
                                <motion.p 
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: 0.25 }}
                                  className="text-sm text-accent font-bold uppercase tracking-[0.15em]"
                                >
                                  Rendez-vous
                                </motion.p>
                                <motion.p 
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                                  className="text-4xl font-serif font-bold text-accent mt-3 group-hover:scale-110 transition-transform"
                                >
                                  {dayReservations.length}
                                </motion.p>
                              </motion.div>
                              
                              <motion.div 
                                whileHover={{ scale: 1.08, y: -4 }}
                                whileTap={{ scale: 0.97 }}
                                className="p-6 rounded-3xl bg-gradient-to-br from-emerald-100 to-emerald-50 border-2 border-emerald-300 text-center shadow-lg shadow-emerald/10 group cursor-default"
                              >
                                <motion.p 
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: 0.25 }}
                                  className="text-sm text-emerald-700 font-bold uppercase tracking-[0.15em]"
                                >
                                  ✓ Finalisés
                                </motion.p>
                                <motion.p 
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                                  className="text-4xl font-serif font-bold text-emerald-600 mt-3 group-hover:scale-110 transition-transform"
                                >
                                  {dayReservations.filter(r => r.status === 'finalized').length}
                                </motion.p>
                              </motion.div>
                              
                              <motion.div 
                                whileHover={{ scale: 1.08, y: -4 }}
                                whileTap={{ scale: 0.97 }}
                                className="p-6 rounded-3xl bg-gradient-to-br from-amber-100 to-amber-50 border-2 border-amber-300 text-center shadow-lg shadow-amber/10 group cursor-default"
                              >
                                <motion.p 
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: 0.25 }}
                                  className="text-sm text-amber-700 font-bold uppercase tracking-[0.15em]"
                                >
                                  ○ En attente
                                </motion.p>
                                <motion.p 
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                                  className="text-4xl font-serif font-bold text-amber-600 mt-3 group-hover:scale-110 transition-transform"
                                >
                                  {dayReservations.filter(r => r.status !== 'finalized').length}
                                </motion.p>
                              </motion.div>
                            </motion.div>

                            {/* Premium Reservation Cards */}
                            <motion.div className="space-y-4">
                              <AnimatePresence mode="popLayout">
                                {dayReservations.map((reservation, idx) => (
                                  <motion.button
                                    key={reservation.id}
                                    initial={{ opacity: 0, x: -50, rotateY: 90 }}
                                    animate={{ opacity: 1, x: 0, rotateY: 0 }}
                                    exit={{ opacity: 0, x: 50, rotateY: -90 }}
                                    transition={{ 
                                      delay: 0.35 + idx * 0.08,
                                      type: 'spring',
                                      stiffness: 200,
                                      damping: 20
                                    }}
                                    whileHover={{ scale: 1.03, x: 8 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                      setSelectedReservation(reservation);
                                      setModal('details');
                                    }}
                                    className={cn(
                                      "w-full p-8 rounded-3xl border-2 text-left transition-all duration-300 group cursor-pointer overflow-hidden relative",
                                      reservation.status === 'finalized'
                                        ? "bg-gradient-to-br from-emerald-50 to-emerald-100/60 border-emerald-300 hover:shadow-xl hover:shadow-emerald-200/60" 
                                        : "bg-gradient-to-br from-amber-50 to-amber-100/60 border-amber-300 hover:shadow-xl hover:shadow-amber-200/60"
                                    )}
                                  >
                                    {/* Background Shimmer Effect */}
                                    <motion.div 
                                      className={cn(
                                        "absolute inset-0 opacity-0 group-hover:opacity-50 transition-opacity duration-300",
                                        reservation.status === 'finalized'
                                          ? "bg-gradient-to-r from-emerald-400/20 via-transparent to-emerald-400/20"
                                          : "bg-gradient-to-r from-amber-400/20 via-transparent to-amber-400/20"
                                      )}
                                    />

                                    <div className="relative z-10 flex items-center justify-between">
                                      {/* Left Section: Time and Client Info */}
                                      <div className="flex-1 flex items-center gap-8">
                                        {/* Time Box */}
                                        <motion.div 
                                          whileHover={{ scale: 1.1, rotate: 2 }}
                                          className={cn(
                                            "flex-shrink-0 w-20 h-20 rounded-3xl flex flex-col items-center justify-center font-bold shadow-lg",
                                            reservation.status === 'finalized'
                                              ? "bg-gradient-to-br from-emerald-200 to-emerald-100 text-emerald-700"
                                              : "bg-gradient-to-br from-amber-200 to-amber-100 text-amber-700"
                                          )}
                                        >
                                          <span className="text-xs opacity-80 font-semibold leading-none mb-1">
                                            {reservation.time.split(':')[0]}h
                                          </span>
                                          <span className="text-2xl font-serif font-bold leading-none">
                                            {reservation.time.split(':')[1]}
                                          </span>
                                        </motion.div>

                                        {/* Client Info */}
                                        <div className="flex-1 space-y-2">
                                          <motion.h4 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.4 + idx * 0.08 }}
                                            className="text-2xl font-serif font-bold text-ink"
                                          >
                                            {reservation.clientName}
                                          </motion.h4>
                                          <motion.p 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.45 + idx * 0.08 }}
                                            className={cn(
                                              "text-sm font-bold",
                                              reservation.status === 'finalized'
                                                ? "text-emerald-700"
                                                : "text-amber-700"
                                            )}
                                          >
                                            {reservation.prestationName}
                                          </motion.p>
                                          <motion.p 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.5 + idx * 0.08 }}
                                            className="text-xs font-semibold text-ink/50 flex items-center gap-2"
                                          >
                                            <Phone size={12} />
                                            {reservation.clientPhone}
                                          </motion.p>
                                        </div>
                                      </div>

                                      {/* Right Section: Price and Status */}
                                      <motion.div 
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.4 + idx * 0.08 }}
                                        className="flex items-center gap-8 flex-shrink-0"
                                      >
                                        <div className="text-right">
                                          <motion.p 
                                            className={cn(
                                              "text-xs font-bold uppercase tracking-widest mb-2",
                                              reservation.status === 'finalized'
                                                ? "text-emerald-600"
                                                : "text-amber-600"
                                            )}
                                          >
                                            {reservation.status === 'finalized' ? '✓ Terminé' : '○ Prévu'}
                                          </motion.p>
                                          <motion.p 
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.45 + idx * 0.08, type: 'spring' }}
                                            className="text-3xl font-serif font-bold text-ink group-hover:text-accent transition-colors"
                                          >
                                            {formatCurrency(reservation.totalPrice)}
                                          </motion.p>
                                          {reservation.totalPrice - reservation.paidAmount > 0 && (
                                            <motion.p 
                                              initial={{ opacity: 0 }}
                                              animate={{ opacity: 1 }}
                                              transition={{ delay: 0.5 + idx * 0.08 }}
                                              className="text-xs font-bold text-red-500 mt-2"
                                            >
                                              Reste: {formatCurrency(reservation.totalPrice - reservation.paidAmount)}
                                            </motion.p>
                                          )}
                                        </div>

                                        {/* Action Arrow */}
                                        <motion.div
                                          animate={{ x: [0, 5, 0] }}
                                          transition={{ duration: 2, repeat: Infinity }}
                                          className={cn(
                                            "w-12 h-12 rounded-full flex items-center justify-center transition-all group-hover:scale-125",
                                            reservation.status === 'finalized'
                                              ? "bg-emerald-200 text-emerald-700 group-hover:bg-emerald-300"
                                              : "bg-amber-200 text-amber-700 group-hover:bg-amber-300"
                                          )}
                                        >
                                          <ChevronRight size={24} strokeWidth={2.5} />
                                        </motion.div>
                                      </motion.div>
                                    </div>

                                    {/* Services Preview */}
                                    {reservation.serviceIds && reservation.serviceIds.length > 0 && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        transition={{ delay: 0.5 + idx * 0.08 }}
                                        className="mt-6 pt-6 border-t-2 border-current/10 flex flex-wrap gap-2"
                                      >
                                        {reservation.serviceIds.map((serviceId, sidx) => {
                                          const service = services.find(s => s.id === serviceId);
                                          return (
                                            <motion.span
                                              key={serviceId}
                                              initial={{ opacity: 0, scale: 0.6 }}
                                              animate={{ opacity: 1, scale: 1 }}
                                              transition={{ delay: 0.55 + idx * 0.08 + sidx * 0.05, type: 'spring', stiffness: 200 }}
                                              className={cn(
                                                "px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm",
                                                reservation.status === 'finalized'
                                                  ? "bg-emerald-200/80 text-emerald-800 border border-emerald-300/80"
                                                  : "bg-amber-200/80 text-amber-800 border border-amber-300/80"
                                              )}
                                            >
                                              ✂ {service?.name}
                                            </motion.span>
                                          );
                                        })}
                                      </motion.div>
                                    )}
                                  </motion.button>
                                ))}
                              </AnimatePresence>
                            </motion.div>
                          </motion.div>
                        );
                      })()}
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reservations;
