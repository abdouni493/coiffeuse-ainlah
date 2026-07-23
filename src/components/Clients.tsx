import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Plus, Search, Phone, Eye, Pencil, Trash2, Award, X, Printer,
  Settings2, Sparkles, CalendarHeart, Wallet, TrendingUp, CheckCircle2, Gift,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, cn } from '../lib/utils';
import { StoreConfig, User } from '../types';
import { hasPermission } from '../lib/permissions';

interface ClientRow {
  id: string;
  name: string;
  phone?: string;
  rewards_redeemed?: number;
  created_at?: string;
}

interface ResRow {
  id: string;
  client_id?: string;
  client_name?: string;
  client_phone?: string;
  prestation_id?: string;
  date: string;
  time?: string;
  total_price: number;
  paid_amount: number;
  discount_amount?: number;
  status: string;
}

interface FidelityConfig {
  enabled: boolean;
  reservations_required: number;
  reduction_type: 'percentage' | 'fixed';
  reduction_value: number;
}

interface ClientStats {
  visits: number;        // finalized/completed reservations
  totalReservations: number;
  total: number;
  paid: number;
  rest: number;
  rewardsEarned: number;
  rewardsAvailable: number;
  reservations: ResRow[];
}

const DEFAULT_FIDELITY: FidelityConfig = {
  enabled: true,
  reservations_required: 10,
  reduction_type: 'percentage',
  reduction_value: 50,
};

const isVisit = (r: ResRow) => r.status === 'finalized' || r.status === 'completed';

interface ClientsProps {
  config: StoreConfig;
  user?: User;
}

const Clients: React.FC<ClientsProps> = ({ config, user }) => {
  // Per-worker action gating (admins pass all checks).
  const can = (action: string) => hasPermission(user, 'clients', action);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [reservations, setReservations] = useState<ResRow[]>([]);
  const [prestations, setPrestations] = useState<Record<string, string>>({});
  const [fidelity, setFidelity] = useState<FidelityConfig>(DEFAULT_FIDELITY);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const [detailClient, setDetailClient] = useState<ClientRow | null>(null);
  const [fidelityClient, setFidelityClient] = useState<ClientRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClientRow | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [cfgDraft, setCfgDraft] = useState<FidelityConfig>(DEFAULT_FIDELITY);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: cData }, { data: rData }, { data: pData }, { data: fData }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('reservations').select('id, client_id, client_name, client_phone, prestation_id, date, time, total_price, paid_amount, discount_amount, status').limit(2000),
      supabase.from('prestations').select('id, name'),
      supabase.from('fidelity_config').select('*').eq('id', 1).single(),
    ]);
    setClients(cData || []);
    setReservations((rData || []) as ResRow[]);
    const pmap: Record<string, string> = {};
    (pData || []).forEach((p: any) => { pmap[p.id] = p.name; });
    setPrestations(pmap);
    if (fData) {
      const f: FidelityConfig = {
        enabled: fData.enabled ?? true,
        reservations_required: fData.reservations_required ?? 10,
        reduction_type: (fData.reduction_type as any) ?? 'percentage',
        reduction_value: fData.reduction_value ?? 50,
      };
      setFidelity(f);
      setCfgDraft(f);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Compute per-client stats from reservations (match by id, else phone).
  const statsFor = useCallback((c: ClientRow): ClientStats => {
    const list = reservations.filter(r =>
      (r.client_id && r.client_id === c.id) ||
      (!!c.phone && !!r.client_phone && r.client_phone === c.phone)
    );
    const visitList = list.filter(isVisit);
    const total = visitList.reduce((s, r) => s + (r.total_price || 0), 0);
    const paid = visitList.reduce((s, r) => s + (r.paid_amount || 0), 0);
    const visits = visitList.length;
    const req = fidelity.reservations_required || 10;
    // A cycle is `req` paid visits + 1 rewarded visit, matching the automatic
    // reduction applied on the Réservations page.
    const cycle = req + 1;
    const rewardsEarned = fidelity.enabled ? Math.floor(visits / cycle) : 0;
    const rewardsAvailable = Math.max(0, rewardsEarned - (c.rewards_redeemed || 0));
    return {
      visits,
      totalReservations: list.length,
      total,
      paid,
      rest: Math.max(0, total - paid),
      rewardsEarned,
      rewardsAvailable,
      reservations: list.sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
  }, [reservations, fidelity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const openCreate = () => { setEditing(null); setName(''); setPhone(''); setFormOpen(true); };
  const openEdit = (c: ClientRow) => { setEditing(c); setName(c.name); setPhone(c.phone || ''); setFormOpen(true); };

  const saveClient = async () => {
    if (!name.trim()) return;
    if (editing) {
      await supabase.from('clients').update({ name: name.trim(), phone: phone.trim() || null }).eq('id', editing.id);
    } else {
      await supabase.from('clients').insert([{ name: name.trim(), phone: phone.trim() || null }]);
    }
    setFormOpen(false);
    fetchAll();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    await supabase.from('clients').delete().eq('id', confirmDelete.id);
    setConfirmDelete(null);
    fetchAll();
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    await supabase.from('fidelity_config').upsert({
      id: 1,
      enabled: cfgDraft.enabled,
      reservations_required: Number(cfgDraft.reservations_required) || 1,
      reduction_type: cfgDraft.reduction_type,
      reduction_value: Number(cfgDraft.reduction_value) || 0,
    });
    setFidelity(cfgDraft);
    setSavingConfig(false);
    setConfigOpen(false);
  };

  const reductionLabel = fidelity.reduction_type === 'percentage'
    ? `${fidelity.reduction_value}%`
    : formatCurrency(fidelity.reduction_value);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center shadow-lg shadow-accent/30">
            <Users className="text-white" size={26} />
          </div>
          <div>
            <h2 className="text-4xl font-serif font-bold text-ink tracking-tight">Clients</h2>
            <p className="text-ink/40 mt-1 font-medium">{clients.length} client{clients.length > 1 ? 's' : ''} · Fidélité tous les {fidelity.reservations_required} rendez-vous</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setCfgDraft(fidelity); setConfigOpen(true); }}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface/60 border border-border text-ink/70 hover:text-accent hover:border-accent/30 transition-all">
            <Settings2 size={18} /> <span className="hidden sm:inline font-medium text-sm">Fidélité</span>
          </button>
          {can('create') && (
            <button onClick={openCreate} className="btn-gradient shimmer flex items-center gap-2.5 px-6 py-3">
              <Plus size={20} /> Nouveau Client
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou téléphone…"
          className="w-full input-premium pl-11" />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-premium bg-surface/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-16 text-center">
          <Users className="mx-auto text-accent/40 mb-4" size={48} />
          <p className="text-ink/50 font-medium">Aucun client pour le moment.</p>
          {can('create') && (
            <button onClick={openCreate} className="btn-gradient mt-6 inline-flex items-center gap-2 px-6 py-3">
              <Plus size={18} /> Ajouter un client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence>
            {filtered.map((c, i) => {
              const s = statsFor(c);
              const req = fidelity.reservations_required || 10;
              // Progress through the current cycle (req paid visits, then the reward).
              const progress = Math.min(100, ((s.visits % (req + 1)) / req) * 100);
              return (
                <motion.div key={c.id}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="group relative rounded-premium bg-surface/70 backdrop-blur-xl border border-border shadow-premium p-6 hover:-translate-y-1 hover:shadow-2xl transition-all duration-400 overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-accent-light/15 blur-2xl group-hover:bg-accent-light/25 transition-all" />

                  {s.rewardsAvailable > 0 && (
                    <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[10px] font-bold shadow-lg">
                      <Gift size={12} /> RÉDUCTION
                    </div>
                  )}

                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/15 to-accent-light/20 flex items-center justify-center text-accent font-bold text-lg shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-ink truncate text-lg leading-tight">{c.name}</h3>
                      {c.phone && (
                        <p className="text-ink/40 text-sm flex items-center gap-1.5 mt-0.5"><Phone size={12} /> {c.phone}</p>
                      )}
                    </div>
                  </div>

                  {/* Fidelity progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-ink/50 flex items-center gap-1.5">
                        <Award size={13} className="text-accent" /> {s.visits} visite{s.visits > 1 ? 's' : ''}
                      </span>
                      <span className="text-xs font-medium text-ink/40">{Math.min(req, s.visits % (req + 1))}/{req}</span>
                    </div>
                    <div className="h-2 rounded-full bg-accent/10 overflow-hidden">
                      <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light"
                        initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.6 }} />
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-center">
                    <div className="rounded-xl bg-accent/5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-ink/40 font-bold">Total</p>
                      <p className="text-sm font-bold text-ink">{formatCurrency(s.total)}</p>
                    </div>
                    <div className={cn('rounded-xl py-2', s.rest > 0 ? 'bg-red-50' : 'bg-emerald-50')}>
                      <p className="text-[10px] uppercase tracking-wide text-ink/40 font-bold">Reste</p>
                      <p className={cn('text-sm font-bold', s.rest > 0 ? 'text-red-500' : 'text-emerald-600')}>{formatCurrency(s.rest)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDetailClient(c)} title="Détails"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent/10 text-accent hover:bg-accent hover:text-on-accent transition-all text-sm font-semibold">
                      <Eye size={16} /> Détails
                    </button>
                    <button onClick={() => setFidelityClient(c)} title="Carte de fidélité"
                      className="p-2.5 rounded-xl bg-amber-50 text-amber-500 hover:bg-amber-400 hover:text-white transition-all">
                      <Award size={16} />
                    </button>
                    {can('edit') && (
                      <button onClick={() => openEdit(c)} title="Modifier"
                        className="p-2.5 rounded-xl bg-surface/70 text-ink/50 hover:bg-panel hover:text-white transition-all">
                        <Pencil size={16} />
                      </button>
                    )}
                    {can('delete') && (
                      <button onClick={() => setConfirmDelete(c)} title="Supprimer"
                        className="p-2.5 rounded-xl bg-surface/70 text-ink/50 hover:bg-red-500 hover:text-white transition-all">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
            <Users className="text-white" size={20} />
          </div>
          <h3 className="text-2xl font-serif font-bold text-ink">{editing ? 'Modifier le client' : 'Nouveau client'}</h3>
        </div>
        <div className="space-y-5">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Nom complet</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du client"
              className="w-full input-premium mt-2" autoFocus />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Téléphone</label>
            <div className="relative mt-2">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0X XX XX XX XX"
                className="w-full input-premium pl-11" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={() => setFormOpen(false)} className="flex-1 py-3 rounded-2xl bg-surface/70 border border-border text-ink/60 font-semibold hover:bg-surface transition-all">Annuler</button>
          <button onClick={saveClient} disabled={!name.trim()} className="flex-1 btn-gradient py-3 disabled:opacity-40">{editing ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </Modal>

      {/* ── Details modal ── */}
      <Modal open={!!detailClient} onClose={() => setDetailClient(null)} wide>
        {detailClient && (() => {
          const s = statsFor(detailClient);
          return (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-on-accent font-bold text-2xl">
                  {detailClient.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-2xl font-serif font-bold text-ink">{detailClient.name}</h3>
                  {detailClient.phone && <p className="text-ink/40 flex items-center gap-1.5"><Phone size={13} /> {detailClient.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatTile icon={CalendarHeart} label="Réservations" value={String(s.totalReservations)} tone="accent" />
                <StatTile icon={TrendingUp} label="Total" value={formatCurrency(s.total)} tone="accent" />
                <StatTile icon={CheckCircle2} label="Payé" value={formatCurrency(s.paid)} tone="emerald" />
                <StatTile icon={Wallet} label="Reste" value={formatCurrency(s.rest)} tone={s.rest > 0 ? 'red' : 'emerald'} />
              </div>

              <h4 className="font-bold text-ink/70 text-sm uppercase tracking-wide mb-3">Historique des réservations</h4>
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {s.reservations.length === 0 && <p className="text-ink/40 text-sm py-6 text-center">Aucune réservation.</p>}
                {s.reservations.map(r => {
                  const rest = Math.max(0, (r.total_price || 0) - (r.paid_amount || 0));
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface/60 border border-border">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink text-sm truncate">{prestations[r.prestation_id || ''] || 'Prestation'}</p>
                        <p className="text-ink/40 text-xs">{r.date}{r.time ? ` · ${r.time}` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-ink text-sm">{formatCurrency(r.total_price)}</p>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full',
                          statusBadge(r.status))}>{statusLabel(r.status)}{rest > 0 ? ` · reste ${formatCurrency(rest)}` : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Fidelity card modal (printable) ── */}
      <Modal open={!!fidelityClient} onClose={() => setFidelityClient(null)}>
        {fidelityClient && (() => {
          const s = statsFor(fidelityClient);
          const req = fidelity.reservations_required || 10;
          const inCycle = Math.min(req, s.visits % (req + 1));
          return (
            <div>
              <h3 className="text-2xl font-serif font-bold text-ink mb-5 flex items-center gap-2"><Award className="text-amber-500" /> Carte de Fidélité</h3>

              <div className="printable-area">
                <div className="rounded-3xl p-6 bg-gradient-to-br from-accent via-accent-light to-accent text-on-accent shadow-xl relative overflow-hidden">
                  <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-surface/15 blur-xl" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={20} />
                      <span className="font-serif font-bold text-lg">{config.name || 'Salon de Beauté'}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] opacity-80">Fidélité</span>
                  </div>
                  <p className="mt-6 text-2xl font-bold">{fidelityClient.name}</p>
                  {fidelityClient.phone && <p className="opacity-80 text-sm">{fidelityClient.phone}</p>}

                  {/* Stamps */}
                  <div className="mt-6 grid grid-cols-5 gap-2">
                    {Array.from({ length: req }).map((_, idx) => (
                      <div key={idx} className={cn('aspect-square rounded-full flex items-center justify-center border-2',
                        idx < inCycle ? 'bg-surface text-accent border-border' : 'border-border text-white/40')}>
                        {idx < inCycle ? <CheckCircle2 size={16} /> : <span className="text-xs font-bold">{idx + 1}</span>}
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-between text-sm">
                    <span className="opacity-90">{inCycle}/{req} visites</span>
                    <span className="font-bold">Récompense : {reductionLabel}</span>
                  </div>
                </div>

                {s.rewardsAvailable > 0 && (
                  <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold flex items-center gap-2">
                    <Gift size={18} /> {s.rewardsAvailable} réduction{s.rewardsAvailable > 1 ? 's' : ''} de {reductionLabel} disponible{s.rewardsAvailable > 1 ? 's' : ''} !
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6 no-print">
                <button onClick={() => setFidelityClient(null)} className="flex-1 py-3 rounded-2xl bg-surface/70 border border-border text-ink/60 font-semibold">Fermer</button>
                <button onClick={() => window.print()} className="flex-1 btn-gradient py-3 flex items-center justify-center gap-2"><Printer size={18} /> Imprimer</button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Fidelity config modal ── */}
      <Modal open={configOpen} onClose={() => setConfigOpen(false)}>
        <h3 className="text-2xl font-serif font-bold text-ink mb-1 flex items-center gap-2"><Settings2 className="text-accent" /> Programme de fidélité</h3>
        <p className="text-ink/40 text-sm mb-6">Configurez la récompense automatique appliquée aux clients fidèles.</p>
        <div className="space-y-5">
          <label className="flex items-center justify-between p-4 rounded-2xl bg-surface/60 border border-border cursor-pointer">
            <span className="font-semibold text-ink">Activer la fidélité</span>
            <input type="checkbox" checked={cfgDraft.enabled} onChange={e => setCfgDraft({ ...cfgDraft, enabled: e.target.checked })} className="w-5 h-5 accent-[var(--color-accent)]" />
          </label>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Réservations pour une récompense</label>
            <input type="number" min={1} value={cfgDraft.reservations_required}
              onChange={e => setCfgDraft({ ...cfgDraft, reservations_required: Number(e.target.value) })}
              className="w-full input-premium mt-2" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Type de réduction</label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {(['percentage', 'fixed'] as const).map(t => (
                <button key={t} onClick={() => setCfgDraft({ ...cfgDraft, reduction_type: t })}
                  className={cn('py-3 rounded-2xl font-semibold border transition-all',
                    cfgDraft.reduction_type === t ? 'bg-accent text-on-accent border-accent' : 'bg-surface/60 text-ink/60 border-border')}>
                  {t === 'percentage' ? 'Pourcentage (%)' : 'Montant fixe (DA)'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink/50 ml-1">Valeur de la réduction</label>
            <input type="number" min={0} value={cfgDraft.reduction_value}
              onChange={e => setCfgDraft({ ...cfgDraft, reduction_value: Number(e.target.value) })}
              className="w-full input-premium mt-2" />
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={() => setConfigOpen(false)} className="flex-1 py-3 rounded-2xl bg-surface/70 border border-border text-ink/60 font-semibold">Annuler</button>
          <button onClick={saveConfig} disabled={savingConfig} className="flex-1 btn-gradient py-3 disabled:opacity-40">{savingConfig ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="text-red-500" size={26} />
          </div>
          <h3 className="text-xl font-bold text-ink">Supprimer ce client ?</h3>
          <p className="text-ink/50 mt-2 text-sm">{confirmDelete?.name} sera définitivement supprimé.</p>
          <div className="flex gap-3 mt-7">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl bg-surface/70 border border-border text-ink/60 font-semibold">Annuler</button>
            <button onClick={doDelete} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-all">Supprimer</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const statusLabel = (s: string) =>
  s === 'finalized' ? 'Finalisée' : s === 'completed' ? 'Terminée' : s === 'cancelled' ? 'Annulée' : 'En attente';

const statusBadge = (s: string) =>
  s === 'finalized' || s === 'completed' ? 'bg-emerald-100 text-emerald-600'
  : s === 'cancelled' ? 'bg-red-100 text-red-500'
  : 'bg-amber-100 text-amber-600';

const StatTile: React.FC<{ icon: React.ElementType; label: string; value: string; tone: 'accent' | 'emerald' | 'red' }> = ({ icon: Icon, label, value, tone }) => {
  const tones = {
    accent: 'from-accent/10 to-accent-light/10 text-accent',
    emerald: 'from-emerald-50 to-emerald-100/50 text-emerald-600',
    red: 'from-red-50 to-red-100/50 text-red-500',
  } as const;
  return (
    <div className={cn('rounded-2xl p-3.5 bg-gradient-to-br border border-border', tones[tone])}>
      <Icon size={18} className="mb-1.5" />
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink/40">{label}</p>
      <p className="font-bold text-ink text-sm mt-0.5">{value}</p>
    </div>
  );
};

const Modal: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ open, onClose, children, wide }) => (
  <AnimatePresence>
    {open && (
      <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-overlay backdrop-blur-sm no-print" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className={cn('relative bg-surface rounded-premium shadow-2xl p-7 w-full max-h-[90vh] overflow-y-auto custom-scrollbar', wide ? 'max-w-2xl' : 'max-w-md')}>
          <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-full hover:bg-ink/5 text-ink/40 transition-colors no-print"><X size={18} /></button>
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default Clients;
