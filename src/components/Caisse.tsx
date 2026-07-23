import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Banknote, Plus, ArrowDownCircle, ArrowUpCircle, X, Wallet, TrendingUp,
  TrendingDown, CalendarHeart, Store, Receipt, Truck, Users, Trash2, Coins,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, cn } from '../lib/utils';
import { User } from '../types';

type Direction = 'in' | 'out';

interface Entry {
  id: string;
  date: string;
  label: string;
  source: string;      // reservation | sale | expense | purchase | salary | manual
  direction: Direction;
  amount: number;
  icon: React.ElementType;
  manualId?: string;   // only for caisse_transactions (deletable)
}

type Preset = 'today' | 'week' | 'month' | 'custom';

const todayStr = () => new Date().toISOString().split('T')[0];
const shiftDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };

interface CaisseProps { user: User; }

const Caisse: React.FC<CaisseProps> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());

  const [raw, setRaw] = useState<Entry[]>([]);

  // New transaction form
  const [formOpen, setFormOpen] = useState(false);
  const [txType, setTxType] = useState<Direction>('in');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState(todayStr());
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Apply preset → from/to
  useEffect(() => {
    if (preset === 'today') { setFrom(todayStr()); setTo(todayStr()); }
    else if (preset === 'week') { setFrom(shiftDays(7)); setTo(todayStr()); }
    else if (preset === 'month') { setFrom(shiftDays(30)); setTo(todayStr()); }
  }, [preset]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [
      { data: caisse }, { data: reservations }, { data: sales },
      { data: expenses }, { data: purchases }, { data: prodPurchases },
      { data: payments },
    ] = await Promise.all([
      supabase.from('caisse_transactions').select('*'),
      supabase.from('reservations').select('id, client_name, paid_amount, date, finalized_at, status'),
      supabase.from('product_sales').select('id, client_name, paid_amount, date'),
      supabase.from('expenses').select('id, name, cost, date'),
      supabase.from('purchases').select('id, description, paid_amount, date'),
      supabase.from('product_purchases').select('id, paid_amount, date'),
      supabase.from('employee_payments').select('id, amount, type, description, date, status, paid'),
    ]);

    const entries: Entry[] = [];

    (caisse || []).forEach((t: any) => entries.push({
      id: `caisse-${t.id}`, manualId: t.id, date: t.date, label: t.description || (t.type === 'deposit' ? 'Dépôt' : 'Retrait'),
      source: 'manual', direction: t.type === 'deposit' ? 'in' : 'out', amount: t.amount || 0,
      icon: t.type === 'deposit' ? ArrowDownCircle : ArrowUpCircle,
    }));

    (reservations || []).forEach((r: any) => {
      if ((r.paid_amount || 0) > 0 && (r.status === 'finalized' || r.status === 'completed')) {
        entries.push({
          id: `res-${r.id}`, date: (r.finalized_at || r.date || '').split('T')[0] || r.date,
          label: `Réservation — ${r.client_name || 'Client'}`, source: 'reservation', direction: 'in',
          amount: r.paid_amount, icon: CalendarHeart,
        });
      }
    });

    (sales || []).forEach((s: any) => {
      if ((s.paid_amount || 0) > 0) entries.push({
        id: `sale-${s.id}`, date: s.date, label: `Vente — ${s.client_name || 'Client'}`,
        source: 'sale', direction: 'in', amount: s.paid_amount, icon: Store,
      });
    });

    (expenses || []).forEach((e: any) => entries.push({
      id: `exp-${e.id}`, date: e.date, label: `Dépense — ${e.name}`, source: 'expense',
      direction: 'out', amount: e.cost || 0, icon: Receipt,
    }));

    (purchases || []).forEach((p: any) => {
      if ((p.paid_amount || 0) > 0) entries.push({
        id: `pur-${p.id}`, date: p.date, label: `Achat — ${p.description || 'Fournisseur'}`,
        source: 'purchase', direction: 'out', amount: p.paid_amount, icon: Truck,
      });
    });

    (prodPurchases || []).forEach((p: any) => {
      if ((p.paid_amount || 0) > 0) entries.push({
        id: `ppur-${p.id}`, date: p.date, label: 'Achat produits', source: 'purchase',
        direction: 'out', amount: p.paid_amount, icon: Truck,
      });
    });

    (payments || []).forEach((p: any) => {
      if (p.status === 'unpaid' || p.paid === false) return;
      const label = p.type === 'acompte' ? 'Acompte employé' : p.type === 'absence' ? 'Absence' : 'Salaire employé';
      entries.push({
        id: `sal-${p.id}`, date: p.date, label: p.description ? `${label} — ${p.description}` : label,
        source: 'salary', direction: 'out', amount: p.amount || 0, icon: Users,
      });
    });

    setRaw(entries);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    return raw
      .filter(e => e.date && e.date >= from && e.date <= to)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [raw, from, to]);

  const totals = useMemo(() => {
    const income = filtered.filter(e => e.direction === 'in').reduce((s, e) => s + e.amount, 0);
    const outflow = filtered.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0);
    return { income, outflow, balance: income - outflow };
  }, [filtered]);

  const saveTx = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    await supabase.from('caisse_transactions').insert([{
      type: txType === 'in' ? 'deposit' : 'withdraw',
      amount: amt, date: txDate, description: desc.trim() || null, created_by: user.id,
    }]);
    setSaving(false); setFormOpen(false);
    setAmount(''); setDesc(''); setTxDate(todayStr()); setTxType('in');
    fetchAll();
  };

  const deleteManual = async (manualId: string) => {
    await supabase.from('caisse_transactions').delete().eq('id', manualId);
    fetchAll();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Banknote className="text-white" size={26} />
          </div>
          <div>
            <h2 className="text-4xl font-serif font-bold text-ink tracking-tight">Caisse</h2>
            <p className="text-ink/40 mt-1 font-medium">Mouvements et solde de la caisse</p>
          </div>
        </div>
        <button onClick={() => setFormOpen(true)} className="btn-gradient shimmer flex items-center gap-2.5 px-6 py-3">
          <Plus size={20} /> Nouvelle transaction
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={TrendingUp} label="Entrées" value={totals.income} tone="emerald" />
        <SummaryCard icon={TrendingDown} label="Sorties" value={totals.outflow} tone="red" />
        <SummaryCard icon={Wallet} label="Solde (période)" value={totals.balance} tone="accent" highlight />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white/60 p-1.5 rounded-2xl border border-border">
          {([['today', "Aujourd'hui"], ['week', '7 jours'], ['month', '30 jours'], ['custom', 'Période']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setPreset(k)}
              className={cn('px-4 py-2 rounded-xl text-sm font-bold transition-all',
                preset === k ? 'bg-accent text-white shadow-sm' : 'text-ink/50 hover:text-accent')}>
              {lbl}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-premium py-2.5 text-sm" />
            <span className="text-ink/40">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-premium py-2.5 text-sm" />
          </div>
        )}
      </div>

      {/* List */}
      <div className="card-premium p-2 sm:p-4">
        {loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-white/50 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Coins className="mx-auto text-accent/40 mb-3" size={44} />
            <p className="text-ink/50 font-medium">Aucun mouvement sur cette période.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((e, i) => (
              <motion.div key={e.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.015, 0.25) }}
                className="flex items-center gap-4 p-3.5 group">
                <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0',
                  e.direction === 'in' ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500')}>
                  <e.icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate">{e.label}</p>
                  <p className="text-ink/40 text-xs">{e.date}</p>
                </div>
                <span className={cn('font-bold shrink-0', e.direction === 'in' ? 'text-emerald-600' : 'text-red-500')}>
                  {e.direction === 'in' ? '+' : '−'} {formatCurrency(e.amount)}
                </span>
                {e.manualId && (
                  <button onClick={() => deleteManual(e.manualId!)}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-ink/30 hover:text-red-500 hover:bg-red-50 transition-all">
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* New transaction modal */}
      <AnimatePresence>
        {formOpen && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setFormOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-premium shadow-2xl p-7 w-full max-w-md">
              <button onClick={() => setFormOpen(false)} className="absolute top-5 right-5 p-2 rounded-full hover:bg-ink/5 text-ink/40"><X size={18} /></button>
              <h3 className="text-2xl font-serif font-bold text-ink mb-6">Nouvelle transaction</h3>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <button onClick={() => setTxType('in')}
                  className={cn('flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold border transition-all',
                    txType === 'in' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white/60 text-ink/60 border-border')}>
                  <ArrowDownCircle size={18} /> Dépôt
                </button>
                <button onClick={() => setTxType('out')}
                  className={cn('flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold border transition-all',
                    txType === 'out' ? 'bg-red-500 text-white border-red-500' : 'bg-white/60 text-ink/60 border-border')}>
                  <ArrowUpCircle size={18} /> Retrait
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Montant</label>
                  <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full input-premium mt-2" autoFocus />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Date</label>
                  <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="w-full input-premium mt-2" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Description</label>
                  <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Motif de la transaction" className="w-full input-premium mt-2" />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => setFormOpen(false)} className="flex-1 py-3 rounded-2xl bg-white/70 border border-border text-ink/60 font-semibold">Annuler</button>
                <button onClick={saveTx} disabled={saving || !Number(amount)} className="flex-1 btn-gradient py-3 disabled:opacity-40">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SummaryCard: React.FC<{ icon: React.ElementType; label: string; value: number; tone: 'emerald' | 'red' | 'accent'; highlight?: boolean }> = ({ icon: Icon, label, value, tone, highlight }) => {
  const tones = {
    emerald: 'from-emerald-400 to-teal-500',
    red: 'from-rose-400 to-red-500',
    accent: 'from-accent to-accent-light',
  } as const;
  return (
    <div className={cn('rounded-premium p-6 relative overflow-hidden shadow-premium',
      highlight ? `bg-gradient-to-br ${tones[tone]} text-white` : 'bg-white/70 border border-white/60')}>
      <div className="flex items-center justify-between">
        <div>
          <p className={cn('text-xs uppercase tracking-wide font-bold', highlight ? 'text-white/80' : 'text-ink/40')}>{label}</p>
          <p className={cn('text-2xl font-bold mt-1', highlight ? 'text-white' : 'text-ink')}>{formatCurrency(value)}</p>
        </div>
        <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center',
          highlight ? 'bg-white/20' : `bg-gradient-to-br ${tones[tone]} text-white`)}>
          <Icon size={22} className={highlight ? 'text-white' : 'text-white'} />
        </div>
      </div>
    </div>
  );
};

export default Caisse;
