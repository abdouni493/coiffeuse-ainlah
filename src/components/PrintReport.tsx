import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, X, Calendar, Loader2, AlertCircle, CalendarDays, CalendarRange } from 'lucide-react';
import { format, eachDayOfInterval, eachMonthOfInterval, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

// =============================================================================
//  PRINTABLE GAINS REPORT
// -----------------------------------------------------------------------------
//  Lets the user choose a period and a grouping (per day / per month), then
//  prints an A4 report with the salon identity (logo, name, contacts) in the
//  application's black + gold palette, as a structured table:
//    Période | Réservations | Prestations | Ventes | Recettes | Dépenses | Bénéfice
// =============================================================================

type Grouping = 'day' | 'month';

interface Row {
  key: string;
  label: string;
  count: number;
  prestations: number;
  sales: number;
  expenses: number;
}

const GOLD = '#D4AF37';
const GOLD_SOFT = '#F7F0DA';
const INK = '#0B0B0D';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const money = (n: number) =>
  new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' DA';

const PrintReport: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(today);
  const [grouping, setGrouping] = useState<Grouping>('day');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const buildRows = async (): Promise<Row[]> => {
    const [resR, salesR, expR, purR, ppR, empR] = await Promise.all([
      supabase.from('reservations').select('date, paid_amount, status')
        .gte('date', startDate).lte('date', endDate).neq('status', 'cancelled').limit(10000),
      supabase.from('product_sales').select('date, paid_amount')
        .gte('date', startDate).lte('date', endDate).limit(10000),
      supabase.from('expenses').select('date, cost')
        .gte('date', startDate).lte('date', endDate).limit(10000),
      supabase.from('purchases').select('date, paid_amount')
        .gte('date', startDate).lte('date', endDate).limit(10000),
      supabase.from('product_purchases').select('date, paid_amount')
        .gte('date', startDate).lte('date', endDate).limit(10000),
      supabase.from('employee_payments').select('date, amount, type')
        .gte('date', startDate).lte('date', endDate).limit(10000),
    ]);
    const firstError = [resR, salesR, expR, purR, ppR, empR].find(r => r.error)?.error;
    if (firstError) throw firstError;

    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const keyOf = (d: string) => (grouping === 'day' ? d.slice(0, 10) : d.slice(0, 7));
    const periods = grouping === 'day'
      ? eachDayOfInterval({ start, end }).map(d => ({ key: format(d, 'yyyy-MM-dd'), label: format(d, 'EEEE dd MMMM yyyy', { locale: fr }) }))
      : eachMonthOfInterval({ start, end }).map(d => ({ key: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: fr }) }));

    const rows = new Map<string, Row>(periods.map(p => [p.key, { ...p, count: 0, prestations: 0, sales: 0, expenses: 0 }]));
    const add = (date: string | null, field: 'prestations' | 'sales' | 'expenses', amount: number, countIt = false) => {
      if (!date) return;
      const row = rows.get(keyOf(date));
      if (!row) return;
      row[field] += Number(amount) || 0;
      if (countIt) row.count += 1;
    };

    (resR.data || []).forEach((r: any) => add(r.date, 'prestations', r.paid_amount, true));
    (salesR.data || []).forEach((s: any) => add(s.date, 'sales', s.paid_amount));
    (expR.data || []).forEach((e: any) => add(e.date, 'expenses', e.cost));
    (purR.data || []).forEach((p: any) => add(p.date, 'expenses', p.paid_amount));
    (ppR.data || []).forEach((p: any) => add(p.date, 'expenses', p.paid_amount));
    // Absences are deductions, not money paid out.
    (empR.data || []).filter((p: any) => p.type !== 'absence').forEach((p: any) => add(p.date, 'expenses', p.amount));

    return [...rows.values()];
  };

  const buildHtml = (rows: Row[], config: any) => {
    const tot = rows.reduce((a, r) => ({
      count: a.count + r.count, prestations: a.prestations + r.prestations,
      sales: a.sales + r.sales, expenses: a.expenses + r.expenses,
    }), { count: 0, prestations: 0, sales: 0, expenses: 0 });
    const totIncome = tot.prestations + tot.sales;
    const totNet = totIncome - tot.expenses;

    const contacts = [config.phone, config.location].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
    const socials = [
      config.facebook && `Facebook : ${config.facebook}`,
      config.instagram && `Instagram : ${config.instagram}`,
      config.tiktok && `TikTok : ${config.tiktok}`,
    ].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');

    const kpi = (label: string, value: string, dark = false) => `
      <div style="flex:1;padding:12px 14px;border-radius:10px;${dark ? `background:${INK};color:${GOLD};` : `background:${GOLD_SOFT};color:${INK};`}border:1px solid ${GOLD};">
        <div style="font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;opacity:.75;">${label}</div>
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:700;margin-top:4px;">${value}</div>
      </div>`;

    const td = 'padding:7px 10px;border-bottom:1px solid #ECE6D3;';
    const num = td + 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;';
    const body = rows.map((r, i) => {
      const income = r.prestations + r.sales;
      const net = income - r.expenses;
      const empty = r.count === 0 && income === 0 && r.expenses === 0;
      return `<tr style="background:${i % 2 ? '#FBF8EF' : '#fff'};${empty ? 'color:#A8A398;' : ''}">
        <td style="${td}text-transform:capitalize;font-weight:600;">${esc(r.label)}</td>
        <td style="${num}text-align:center;">${r.count}</td>
        <td style="${num}">${money(r.prestations)}</td>
        <td style="${num}">${money(r.sales)}</td>
        <td style="${num}font-weight:700;">${money(income)}</td>
        <td style="${num}color:${empty ? '#A8A398' : '#B42318'};">${money(r.expenses)}</td>
        <td style="${num}font-weight:700;color:${empty ? '#A8A398' : net >= 0 ? '#067647' : '#B42318'};">${money(net)}</td>
      </tr>`;
    }).join('');

    const th = `padding:9px 10px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:${GOLD};background:${INK};`;
    const periodLabel = `${format(parseISO(startDate), 'dd/MM/yyyy')} — ${format(parseISO(endDate), 'dd/MM/yyyy')}`;

    return `
<div style="width:190mm;margin:0 auto;padding:12mm 10mm;background:#fff;color:${INK};font-family:'Inter',-apple-system,'Segoe UI',Roboto,sans-serif;font-size:11px;line-height:1.45;">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:20px;padding-bottom:14px;border-bottom:3px solid ${GOLD};">
    <div style="display:flex;align-items:center;gap:14px;">
      ${config.logo ? `<div style="width:70px;height:70px;border-radius:50%;overflow:hidden;border:3px solid ${GOLD};background:${INK};flex-shrink:0;">
        <img src="${esc(config.logo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>` : ''}
      <div>
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:25px;font-weight:700;">${esc(config.name || 'Salon de Beauté')}</div>
        ${config.slogan ? `<div style="font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-top:2px;">${esc(config.slogan)}</div>` : ''}
        ${contacts ? `<div style="font-size:10px;color:#6E6A62;margin-top:5px;">${contacts}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;padding:7px 14px;background:${INK};color:${GOLD};border-radius:8px;font-family:'Playfair Display',Georgia,serif;font-size:15px;font-weight:700;letter-spacing:.08em;">RAPPORT DES GAINS</div>
      <div style="font-size:10px;color:#6E6A62;margin-top:6px;">Période : <b style="color:${INK};">${periodLabel}</b></div>
      <div style="font-size:10px;color:#6E6A62;">Regroupement : <b style="color:${INK};">${grouping === 'day' ? 'Par jour' : 'Par mois'}</b></div>
      <div style="font-size:9px;color:#9A968C;margin-top:2px;">Édité le ${format(new Date(), 'dd/MM/yyyy à HH:mm')}</div>
    </div>
  </div>

  <div style="display:flex;gap:10px;margin:16px 0;">
    ${kpi('Réservations', String(tot.count))}
    ${kpi('Total recettes', money(totIncome))}
    ${kpi('Total dépenses', money(tot.expenses))}
    ${kpi('Bénéfice net', money(totNet), true)}
  </div>

  <table style="width:100%;border-collapse:collapse;border:1px solid ${GOLD};">
    <thead><tr>
      <th style="${th}text-align:left;">${grouping === 'day' ? 'Jour' : 'Mois'}</th>
      <th style="${th}text-align:center;">Rés.</th>
      <th style="${th}text-align:right;">Prestations</th>
      <th style="${th}text-align:right;">Ventes</th>
      <th style="${th}text-align:right;">Recettes</th>
      <th style="${th}text-align:right;">Dépenses</th>
      <th style="${th}text-align:right;">Bénéfice</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr style="background:${GOLD};color:${INK};font-weight:800;">
      <td style="padding:10px;text-transform:uppercase;letter-spacing:.1em;font-size:10px;">Total</td>
      <td style="padding:10px;text-align:center;">${tot.count}</td>
      <td style="padding:10px;text-align:right;white-space:nowrap;">${money(tot.prestations)}</td>
      <td style="padding:10px;text-align:right;white-space:nowrap;">${money(tot.sales)}</td>
      <td style="padding:10px;text-align:right;white-space:nowrap;">${money(totIncome)}</td>
      <td style="padding:10px;text-align:right;white-space:nowrap;">${money(tot.expenses)}</td>
      <td style="padding:10px;text-align:right;white-space:nowrap;">${money(totNet)}</td>
    </tr></tfoot>
  </table>

  <div style="margin-top:10px;font-size:9px;color:#9A968C;">
    Recettes = montants encaissés (prestations + ventes produits). Dépenses = charges, achats fournisseurs et paiements employés.
  </div>
  <div style="margin-top:18px;padding-top:10px;border-top:1px solid ${GOLD};text-align:center;font-size:9.5px;color:#6E6A62;">
    ${socials || esc(config.name || '')}
  </div>
</div>`;
  };

  const handlePrint = async () => {
    setError('');
    if (!startDate || !endDate) { setError('Veuillez choisir la période'); return; }
    if (startDate > endDate) { setError('La date de début doit être antérieure à la date de fin'); return; }

    // Open the window synchronously (inside the click) so popup blockers allow it.
    const w = window.open('', '_blank', 'width=1000,height=800');
    if (!w) { setError("Impossible d'ouvrir la fenêtre d'impression (popup bloquée)."); return; }
    w.document.write('<p style="font-family:sans-serif;padding:40px;color:#888">Préparation du rapport…</p>');

    setIsBusy(true);
    try {
      const [rows, cfg] = await Promise.all([
        buildRows(),
        supabase.from('store_config').select('*').eq('id', 1).single(),
      ]);
      const c: any = cfg.data || {};
      const config = { ...c, logo: c.logo_url };
      w.document.open();
      w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
        <title>Rapport des gains ${startDate} - ${endDate}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
        <style>
          *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
          body{background:#fff;}
          thead{display:table-header-group;} tfoot{display:table-row-group;} tr{page-break-inside:avoid;}
          @page{size:A4;margin:0;}
        </style></head><body>${buildHtml(rows, config)}</body></html>`);
      w.document.close();
      const go = () => { w.focus(); w.print(); };
      const img = w.document.querySelector('img');
      if (img && !img.complete) {
        img.addEventListener('load', go, { once: true });
        img.addEventListener('error', go, { once: true });
        setTimeout(go, 2500);
      } else {
        setTimeout(go, 400);
      }
    } catch (err: any) {
      w.close();
      setError('Erreur lors de la génération : ' + (err?.message || err));
    } finally {
      setIsBusy(false);
    }
  };

  const groupBtn = (g: Grouping, label: string, Icon: any) => (
    <button
      type="button"
      onClick={() => setGrouping(g)}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all',
        grouping === g ? 'border-accent bg-accent/10 text-accent' : 'border-border text-ink/50 hover:border-accent/40'
      )}
    >
      <Icon size={16} /> {label}
    </button>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="card-premium w-full max-w-lg p-8 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center">
                  <Printer className="text-accent" size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-serif font-bold text-ink">Imprimer un rapport</h3>
                  <p className="text-xs text-ink/50">Gains par jour ou par mois sur une période</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-accent/10 text-ink/50"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[['Date de début', startDate, setStartDate], ['Date de fin', endDate, setEndDate]].map(([label, value, set]: any) => (
                <div key={label}>
                  <label className="block text-xs font-bold text-ink/50 mb-1.5 uppercase tracking-wider">{label}</label>
                  <div className="relative">
                    <input type="date" value={value} onChange={e => set(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/30" />
                    <Calendar size={15} className="absolute right-3 top-3.5 text-ink/30 pointer-events-none" />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-ink/50 mb-1.5 uppercase tracking-wider">Afficher les gains</label>
              <div className="flex gap-3">
                {groupBtn('day', 'Par jour', CalendarDays)}
                {groupBtn('month', 'Par mois', CalendarRange)}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
                <AlertCircle size={15} />{error}
              </div>
            )}

            <button onClick={handlePrint} disabled={isBusy}
              className="w-full px-6 py-3.5 rounded-xl bg-accent text-on-accent font-bold text-sm shadow-lg shadow-accent/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {isBusy ? <><Loader2 size={16} className="animate-spin" />Préparation…</> : <><Printer size={16} />Imprimer le rapport</>}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PrintReport;
