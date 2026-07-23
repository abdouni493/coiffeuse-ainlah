import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { motion } from 'motion/react';
import {
  Calendar, Users, CheckCircle2, Clock, Star,
  TrendingUp, ArrowRight, Sparkles, Activity,
  Package, Scissors, UserCheck, AlertCircle,
  ChevronRight, BarChart3, CalendarDays, Zap,
  ShoppingBag, FileText, RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
  user?: any;
}

/* ─── Animated counter ─────────────────────────────────────── */
function useAnimatedCounter(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return count;
}

const AnimCount: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const count = useAnimatedCounter(value);
  return <span className={className}>{count}</span>;
};

/* ─── Helpers ───────────────────────────────────────────────── */
const statusLabel = (s: string) => {
  if (s === 'completed' || s === 'finalized') return 'Finalisée';
  if (s === 'cancelled') return 'Annulée';
  return 'En attente';
};
const statusStyle = (s: string) =>
  s === 'completed' || s === 'finalized'
    ? 'bg-emerald-100 text-emerald-700'
    : s === 'cancelled'
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-700';

/* ─── Component ─────────────────────────────────────────────── */
const Dashboard: React.FC<DashboardProps> = ({ setActiveTab, user }) => {
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [reservations, setReservations] = useState<any[]>([]);
  const [prestations, setPrestations] = useState<any[]>([]);
  const [employees, setEmployees]   = useState<any[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const firstName = user?.fullName?.split(' ')[0] || user?.username || 'Bienvenue';

  const load = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setRefreshing(true);
    try {
      const [r, p, e] = await Promise.all([
        supabase
          .from('reservations')
          .select('id, client_name, client_phone, prestation_id, date, time, total_price, paid_amount, status, created_at, prestations(id, name)')
          .order('date', { ascending: false })
          .limit(500),
        supabase.from('prestations').select('id, name, price').limit(100),
        supabase.from('profiles').select('id, full_name, role, avatar_url').limit(100),
      ]);
      setReservations(r.data || []);
      setPrestations(p.data || []);
      setEmployees(e.data || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  /* ─── Derived data ─────────────────────────────────────────── */
  const todayStr = new Date().toISOString().split('T')[0];

  const derived = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const total      = reservations.length;
    const todayList  = reservations.filter(r => r.date?.startsWith(todayStr)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const upcoming   = reservations.filter(r => new Date(r.date) >= now).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const thisWeek   = upcoming.filter(r => {
      const diff = new Date(r.date).getTime() - now.getTime();
      return diff >= 0 && diff <= 7 * 86400000;
    });
    const pending    = reservations.filter(r => r.status === 'pending');
    const completed  = reservations.filter(r => r.status === 'completed' || r.status === 'finalized');
    const cancelled  = reservations.filter(r => r.status === 'cancelled');
    const withDebt   = reservations.filter(r => (parseFloat(r.total_price) || 0) > (parseFloat(r.paid_amount) || 0));
    const uniquePhones = new Set(reservations.map(r => r.client_phone || r.client_name));
    const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

    /* Weekly chart — last 7 days */
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const last7: { name: string; dateStr: string; total: number; done: number }[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return { name: days[d.getDay()], dateStr: d.toISOString().split('T')[0], total: 0, done: 0 };
    });
    reservations.forEach(r => {
      const day = last7.find(d => r.date?.startsWith(d.dateStr));
      if (day) {
        day.total++;
        if (r.status === 'completed' || r.status === 'finalized') day.done++;
      }
    });

    /* Top prestations by booking count */
    const svcMap = new Map<string, { name: string; count: number }>();
    reservations.forEach(r => {
      const id = r.prestation_id || 'unknown';
      const name = r.prestations?.name || 'Non spécifié';
      svcMap.set(id, { name, count: (svcMap.get(id)?.count || 0) + 1 });
    });
    const topServices = Array.from(svcMap.values()).sort((a, b) => b.count - a.count).slice(0, 5);

    return { total, todayList, upcoming, thisWeek, pending, completed, cancelled, withDebt, uniquePhones, completionRate, last7, topServices };
  }, [reservations, todayStr]);

  const workerCount = employees.filter(e => e.role === 'worker').length;
  const adminCount  = employees.filter(e => e.role === 'admin' || e.role === 'super_admin').length;

  /* ─── Greeting ──────────────────────────────────────────────── */
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  /* ─── Loading skeleton ─────────────────────────────────────── */
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          className="w-12 h-12 rounded-full border-4 border-accent/20 border-t-accent mx-auto" />
        <p className="text-ink/40 font-medium text-sm">Chargement…</p>
      </div>
    </div>
  );

  /* ─── Render ────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 pb-24">

      {/* ═══════════════ HERO BANNER ═══════════════ */}
      <motion.div initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl p-8 md:p-10 text-white"
        style={{ background: 'linear-gradient(135deg, #B76E79 0%, #c9606d 40%, #a0506f 100%)' }}>

        {/* decorative blobs */}
        <div className="absolute -right-20 -top-20 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-40 h-40 bg-rose-300/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-1/4 top-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <motion.div className="flex items-center gap-2 mb-2"
              animate={{ opacity: [0.7, 1, 0.7] }} transition={{ repeat: Infinity, duration: 3 }}>
              <Sparkles size={16} className="text-yellow-300" />
              <span className="text-white/70 text-sm font-medium">{greeting()},</span>
            </motion.div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-1">{firstName}</h1>
            <p className="text-white/60 text-sm font-medium capitalize">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            {[
              { label: "Aujourd'hui",   val: derived.todayList.length,  sub: 'rendez-vous' },
              { label: 'Cette Semaine', val: derived.thisWeek.length,   sub: 'à venir' },
              { label: 'En Attente',    val: derived.pending.length,    sub: 'réservations' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.08 }}
                className="bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/20 min-w-[100px]">
                <p className="text-white/55 text-[10px] font-bold uppercase tracking-wider mb-1">{item.label}</p>
                <p className="text-3xl font-serif font-bold leading-none">{item.val}</p>
                <p className="text-white/55 text-xs mt-1">{item.sub}</p>
              </motion.div>
            ))}
            <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
              onClick={() => load(true)}
              className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-4 border border-white/20 flex items-center gap-2 hover:bg-white/25 transition-colors">
              <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
              <span className="text-sm font-semibold hidden sm:block">Actualiser</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════ 6 KPI TILES ═══════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Résas',  val: derived.total,             icon: Calendar,      from: '#6366f1', to: '#4f46e5', bg: 'bg-indigo-50',  border: 'border-indigo-100', text: 'text-indigo-600' },
          { label: 'Clientes',     val: derived.uniquePhones.size, icon: Users,         from: '#8b5cf6', to: '#7c3aed', bg: 'bg-violet-50',  border: 'border-violet-100', text: 'text-violet-600' },
          { label: 'Finalisées',   val: derived.completed.length,  icon: CheckCircle2,  from: '#10b981', to: '#059669', bg: 'bg-emerald-50', border: 'border-emerald-100',text: 'text-emerald-600' },
          { label: 'En Attente',   val: derived.pending.length,    icon: Clock,         from: '#f59e0b', to: '#d97706', bg: 'bg-amber-50',   border: 'border-amber-100',  text: 'text-amber-600' },
          { label: 'Avec Dettes',  val: derived.withDebt.length,   icon: AlertCircle,   from: '#ef4444', to: '#dc2626', bg: 'bg-red-50',     border: 'border-red-100',    text: 'text-red-600' },
          { label: 'Équipe',       val: workerCount + adminCount,  icon: UserCheck,     from: '#B76E79', to: '#a0506f', bg: 'bg-rose-50',    border: 'border-rose-100',   text: 'text-rose-600' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.07, type: 'spring', stiffness: 220 }}
            className={cn('p-4 rounded-2xl border', s.bg, s.border)}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 shadow-sm"
              style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }}>
              <s.icon size={17} className="text-white" />
            </div>
            <p className={cn('text-2xl font-bold', s.text)}>
              <AnimCount value={s.val} />
            </p>
            <p className="text-xs font-medium text-ink/45 mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ═══════════════ MAIN GRID ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Today's appointments */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
            className="card-premium p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center">
                  <CalendarDays size={18} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-lg leading-tight">Rendez-vous du Jour</h3>
                  <p className="text-xs text-ink/40 capitalize">
                    {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveTab('reservations')}
                className="flex items-center gap-1 text-xs font-bold text-accent hover:opacity-70 transition-opacity">
                Tout voir <ArrowRight size={13} />
              </button>
            </div>

            {derived.todayList.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Calendar size={26} className="text-gray-300" />
                </div>
                <p className="text-ink/35 font-medium text-sm">Aucun rendez-vous aujourd'hui</p>
              </div>
            ) : (
              <div className="space-y-2">
                {derived.todayList.slice(0, 7).map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.28 + i * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-primary-bg/40 border border-border/20 hover:bg-white hover:shadow-sm transition-all">
                    <div className="w-11 text-center flex-shrink-0">
                      <span className="text-sm font-bold text-ink">{r.time || '—'}</span>
                    </div>
                    <div className="w-px h-8 bg-border/40 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm truncate">{r.client_name}</p>
                      <p className="text-xs text-ink/40 truncate">{r.prestations?.name || '—'}</p>
                    </div>
                    <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0', statusStyle(r.status))}>
                      {statusLabel(r.status)}
                    </span>
                  </motion.div>
                ))}
                {derived.todayList.length > 7 && (
                  <button onClick={() => setActiveTab('reservations')}
                    className="w-full py-2 text-xs font-bold text-accent hover:opacity-70 transition-opacity">
                    + {derived.todayList.length - 7} autres aujourd'hui
                  </button>
                )}
              </div>
            )}
          </motion.div>

          {/* Weekly bar chart */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}
            className="card-premium p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
                  <Activity size={18} className="text-accent" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-lg leading-tight">Activité — 7 Derniers Jours</h3>
                  <p className="text-xs text-ink/40">Volume de réservations par jour</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {[{ color: 'bg-accent', label: 'Total' }, { color: 'bg-emerald-500', label: 'Finalisées' }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={cn('w-2.5 h-2.5 rounded-full', l.color)} />
                    <span className="text-[10px] font-bold text-ink/40">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={derived.last7} barGap={3} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(183,110,121,0.07)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false}
                  tick={{ fill: '#1A1A1A55', fontSize: 11, fontWeight: 600 }} dy={10} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fill: '#1A1A1A55', fontSize: 11, fontWeight: 600 }} allowDecimals={false} width={24} />
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: '1px solid rgba(183,110,121,0.12)', boxShadow: '0 8px 24px rgba(0,0,0,0.07)', backgroundColor: 'rgba(255,255,255,0.97)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                  labelStyle={{ fontSize: '11px', color: '#1A1A1A55', marginBottom: '4px' }}
                  cursor={{ fill: 'rgba(183,110,121,0.04)', radius: 8 }}
                  formatter={(val: number, name: string) => [val, name === 'total' ? 'Total' : 'Finalisées']}
                />
                <Bar dataKey="total" name="total" radius={[6, 6, 0, 0]} barSize={18} animationDuration={1100}>
                  {derived.last7.map((entry, i) => (
                    <Cell key={i} fill={entry.dateStr === todayStr ? '#B76E79' : '#B76E7955'} />
                  ))}
                </Bar>
                <Bar dataKey="done" name="done" fill="#10b981" radius={[6, 6, 0, 0]} barSize={18} animationDuration={1300} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 pt-4 border-t border-border/20 grid grid-cols-3 gap-4 text-center">
              {[
                { val: derived.last7.reduce((s, d) => s + d.total, 0), label: 'Total 7j', cls: 'text-accent' },
                { val: derived.last7.reduce((s, d) => s + d.done, 0), label: 'Finalisées', cls: 'text-emerald-600' },
                { val: derived.completionRate, label: '% Complétion', cls: 'text-indigo-600', suffix: '%' },
              ].map((item, i) => (
                <div key={i}>
                  <p className={cn('text-2xl font-bold', item.cls)}>
                    <AnimCount value={item.val} />{item.suffix || ''}
                  </p>
                  <p className="text-xs text-ink/40 font-medium">{item.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent reservations table */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}
            className="card-premium p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <FileText size={18} className="text-indigo-600" />
                </div>
                <h3 className="font-serif font-bold text-ink text-lg">Réservations Récentes</h3>
              </div>
              <button onClick={() => setActiveTab('reservations')}
                className="flex items-center gap-1 text-xs font-bold text-accent hover:opacity-70 transition-opacity">
                Toutes <ArrowRight size={13} />
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/20">
              <table className="w-full text-sm text-left">
                <thead className="bg-primary-bg/50 border-b border-border/20">
                  <tr>
                    {['Cliente', 'Date', 'Heure', 'Prestation', 'Statut'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-ink/40">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {reservations.slice(0, 8).map((r, i) => (
                    <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 + i * 0.04 }}
                      className="hover:bg-accent/[0.02] transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-ink">{r.client_name}</td>
                      <td className="px-4 py-2.5 text-ink/50 whitespace-nowrap">
                        {new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 text-ink/50 whitespace-nowrap">{r.time || '—'}</td>
                      <td className="px-4 py-2.5 text-ink/60 max-w-[160px] truncate">{r.prestations?.name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', statusStyle(r.status))}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-6">

          {/* Status overview */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp size={18} className="text-emerald-600" />
              </div>
              <h3 className="font-serif font-bold text-ink text-lg">Vue d'Ensemble</h3>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Finalisées',  count: derived.completed.length, total: derived.total, color: 'from-emerald-400 to-teal-500',   text: 'text-emerald-600' },
                { label: 'En Attente', count: derived.pending.length,    total: derived.total, color: 'from-amber-400 to-orange-400',   text: 'text-amber-600' },
                { label: 'Annulées',   count: derived.cancelled.length,  total: derived.total, color: 'from-red-400 to-rose-500',       text: 'text-red-600' },
                { label: 'Avec Dette', count: derived.withDebt.length,   total: derived.total, color: 'from-slate-400 to-slate-500',    text: 'text-slate-600' },
              ].map((item, i) => {
                const pct = item.total > 0 ? Math.round((item.count / item.total) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-ink/65">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn('font-bold', item.text)}>{item.count}</span>
                        <span className="text-ink/35">({pct}%)</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.9, delay: 0.3 + i * 0.1, ease: 'easeOut' }}
                        className={cn('h-full rounded-full bg-gradient-to-r', item.color)} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 pt-4 border-t border-border/20 flex justify-between items-center">
              <span className="text-xs text-ink/45 font-medium">Taux de complétion</span>
              <span className="text-lg font-bold text-emerald-600">{derived.completionRate}%</span>
            </div>
          </motion.div>

          {/* Top prestations */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.38 }}
            className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
                <Star size={18} className="text-accent" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-ink text-lg leading-tight">Top Prestations</h3>
                <p className="text-xs text-ink/40">Par nombre de réservations</p>
              </div>
            </div>
            <div className="space-y-3">
              {derived.topServices.length > 0 ? derived.topServices.map((svc, i) => {
                const pct = derived.total > 0 ? Math.round((svc.count / derived.total) * 100) : 0;
                const colors = ['#B76E79', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b'];
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.07 }}>
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i] }} />
                        <span className="font-semibold text-ink/75 truncate">{svc.name}</span>
                      </div>
                      <span className="font-bold text-ink ml-2 flex-shrink-0">
                        {svc.count} <span className="text-ink/35 font-normal">rdv</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.4 + i * 0.07 }}
                        style={{ backgroundColor: colors[i] }}
                        className="h-full rounded-full" />
                    </div>
                  </motion.div>
                );
              }) : (
                <p className="text-ink/35 text-sm text-center py-4">Aucune donnée</p>
              )}
            </div>
            <button onClick={() => setActiveTab('prestations')}
              className="mt-4 w-full py-2 text-xs font-bold text-accent hover:opacity-70 transition-opacity flex items-center justify-center gap-1">
              Gérer les prestations <ArrowRight size={12} />
            </button>
          </motion.div>

          {/* Team overview */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.46 }}
            className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center">
                <Users size={18} className="text-violet-600" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-ink text-lg leading-tight">Équipe</h3>
                <p className="text-xs text-ink/40">{workerCount + adminCount} membre{(workerCount + adminCount) > 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 bg-violet-50 rounded-xl border border-violet-100 text-center">
                <p className="text-2xl font-bold text-violet-600"><AnimCount value={workerCount} /></p>
                <p className="text-xs text-ink/45 font-medium">Employées</p>
              </div>
              <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 text-center">
                <p className="text-2xl font-bold text-accent"><AnimCount value={adminCount} /></p>
                <p className="text-xs text-ink/45 font-medium">Admins</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {employees.slice(0, 5).map((emp, i) => (
                <motion.div key={emp.id} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.48 + i * 0.06 }}
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-primary-bg/50 transition-colors">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #B76E79, #a0506f)' }}>
                    {(emp.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm truncate">{emp.full_name}</p>
                    <p className="text-[10px] text-ink/40">
                      {emp.role === 'worker' ? 'Employée' : emp.role === 'admin' ? 'Admin' : 'Super Admin'}
                    </p>
                  </div>
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', emp.role === 'worker' ? 'bg-emerald-400' : 'bg-accent')} />
                </motion.div>
              ))}
              {employees.length > 5 && (
                <p className="text-xs text-ink/35 text-center pt-1">+{employees.length - 5} autres membres</p>
              )}
            </div>
            <button onClick={() => setActiveTab('employees')}
              className="mt-4 w-full py-2 text-xs font-bold text-accent hover:opacity-70 transition-opacity flex items-center justify-center gap-1">
              Voir toute l'équipe <ArrowRight size={12} />
            </button>
          </motion.div>

          {/* Upcoming appointments */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.54 }}
            className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Clock size={18} className="text-blue-600" />
              </div>
              <h3 className="font-serif font-bold text-ink text-lg">Prochains RDV</h3>
            </div>
            {derived.upcoming.length === 0 ? (
              <p className="text-sm text-ink/35 text-center py-6">Aucun rendez-vous à venir</p>
            ) : (
              <div className="space-y-2">
                {derived.upcoming.slice(0, 5).map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.56 + i * 0.06 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-primary-bg/40 border border-border/20 hover:bg-white hover:shadow-sm transition-all">
                    <div className="flex-shrink-0 text-center w-11">
                      <p className="text-[11px] font-bold text-accent leading-tight">
                        {new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-[10px] text-ink/35">{r.time || '—'}</p>
                    </div>
                    <div className="w-px h-8 bg-border/30 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm truncate">{r.client_name}</p>
                      <p className="text-[10px] text-ink/40 truncate">{r.prestations?.name || '—'}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ═══════════════ QUICK NAVIGATION ═══════════════ */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
            <Zap size={15} className="text-accent" />
          </div>
          <h3 className="font-serif font-bold text-ink text-lg">Navigation Rapide</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Réservations', icon: Calendar,  tab: 'reservations', from: '#6366f1', to: '#4f46e5', count: `${derived.total} total` },
            { label: 'Prestations',  icon: Scissors,  tab: 'prestations',  from: '#B76E79', to: '#a0506f', count: `${prestations.length} services` },
            { label: 'Employées',    icon: Users,      tab: 'employees',    from: '#8b5cf6', to: '#7c3aed', count: `${workerCount + adminCount} membres` },
            { label: 'Inventaire',   icon: Package,    tab: 'inventory',    from: '#10b981', to: '#059669', count: 'Stock & achats' },
            { label: 'Dépenses',     icon: ShoppingBag,tab: 'expenses',     from: '#f59e0b', to: '#d97706', count: 'Charges salon' },
            { label: 'Rapports',     icon: BarChart3,  tab: 'reports',      from: '#ec4899', to: '#be185d', count: 'Statistiques' },
          ].map((mod, i) => (
            <motion.button key={i} whileHover={{ scale: 1.04, y: -3 }} whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 + i * 0.06 }}
              onClick={() => setActiveTab(mod.tab)}
              className="p-5 rounded-2xl border border-border/30 bg-white hover:shadow-lg transition-all text-left group relative overflow-hidden">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity"
                style={{ background: `linear-gradient(135deg, ${mod.from}, ${mod.to})` }} />
              <div className="w-11 h-11 rounded-xl mb-3 flex items-center justify-center shadow-sm"
                style={{ background: `linear-gradient(135deg, ${mod.from}, ${mod.to})` }}>
                <mod.icon size={20} className="text-white" />
              </div>
              <p className="font-bold text-ink text-sm">{mod.label}</p>
              <p className="text-xs text-ink/40 font-medium mt-0.5">{mod.count}</p>
              <ChevronRight size={14} className="absolute top-4 right-4 text-ink/20 group-hover:text-ink/40 group-hover:translate-x-0.5 transition-all" />
            </motion.button>
          ))}
        </div>
      </motion.div>

    </div>
  );
};

export default Dashboard;
