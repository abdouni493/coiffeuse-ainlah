import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, TrendingUp, CheckCircle2, AlertCircle, Users,
  BarChart3, Loader2, Package, Building2, Download,
  PieChart, Play, X, Clock, Sparkles, ChevronRight, Phone,
  TrendingDown, Activity, CreditCard, FileText, ShoppingBag
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';

const Reports: React.FC = () => {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState('');
  const [selectedModal, setSelectedModal] = useState<
    'purchases' | 'workers' | 'store' | 'debts' | 'benefits' | 'prestation' | null
  >(null);
  const [selectedPrestationId, setSelectedPrestationId] = useState<string | null>(null);

  const closeModal = () => { setSelectedModal(null); setSelectedPrestationId(null); };

  const fetchData = async () => {
    setIsGenerating(true);
    setError('');
    try {
      if (!startDate || !endDate) { setError('Veuillez sélectionner les deux dates'); return; }
      if (new Date(startDate) > new Date(endDate)) { setError('La date de début doit être antérieure à la date de fin'); return; }

      const start = new Date(startDate).toISOString();
      const end = new Date(new Date(endDate).getTime() + 86400000).toISOString();

      const [resRes, purchasesRes, expensesRes, empRes, salesRes, productPurchasesRes, productsRes] = await Promise.all([
        supabase
          .from('reservations')
          .select('id, client_name, client_phone, date, total_price, paid_amount, status, prestation_id, prestations(id, name)')
          .gte('date', start).lte('date', end)
          .order('date', { ascending: true }).limit(1000),
        supabase
          .from('purchases')
          .select('id, description, cost, paid_amount, date, suppliers(full_name)')
          .gte('date', start).lte('date', end).limit(500),
        supabase
          .from('expenses')
          .select('id, name, description, cost, date')
          .gte('date', start).lte('date', end).limit(500),
        supabase
          .from('employee_payments')
          .select('id, amount, type, employee_id, date, profiles(full_name)')
          .gte('date', start).lte('date', end).limit(500),
        supabase
          .from('product_sales')
          .select('id, client_name, client_phone, date, total_amount, paid_amount, sale_items(id, product_id, quantity, unit_price, is_detail, detail_qty_used, products(name))')
          .gte('date', start).lte('date', end).limit(500),
        supabase
          .from('product_purchase_items')
          .select('product_id, quantity_bought, price_buy, price_sell, sell_by_detail, detail_unit_qty, product_purchases(date, supplier_id, suppliers(full_name))')
          .limit(2000),
        supabase
          .from('products')
          .select('id, name, min_stock, sell_by_detail, detail_unit_qty, detail_unit, product_categories(name)')
          .limit(500),
      ]);

      const reservations = resRes.data || [];
      const purchases = purchasesRes.data || [];
      const storeExpenses = expensesRes.data || [];
      const employeePayments = empRes.data || [];
      const productSales = salesRes.data || [];
      const allPurchaseItems = productPurchasesRes.data || [];
      const allProducts = productsRes.data || [];

      const completedRes = reservations.filter((r: any) => r.status === 'completed');
      const pendingRes = reservations.filter((r: any) => r.status !== 'completed');

      // Revenue = ALL reservations (not just completed)
      const totalGains = reservations.reduce((s: number, r: any) => s + (parseFloat(r.total_price) || 0), 0);
      const totalClientPaid = reservations.reduce((s: number, r: any) => s + (parseFloat(r.paid_amount) || 0), 0);
      const totalDebt = reservations.reduce((s: number, r: any) => {
        return s + Math.max(0, (parseFloat(r.total_price) || 0) - (parseFloat(r.paid_amount) || 0));
      }, 0);

      // Expenses
      const suppliesTotal = purchases.reduce((s: number, p: any) => s + (parseFloat(p.cost) || 0), 0);
      const storeTotal = storeExpenses.reduce((s: number, e: any) => s + (parseFloat(e.cost) || 0), 0);
      const salaryTotal = employeePayments.filter((p: any) => p.type === 'salary').reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);
      const otherEmpTotal = employeePayments.filter((p: any) => p.type !== 'salary').reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);
      const totalWorkerExpenses = salaryTotal + otherEmpTotal;
      const totalExpenses = suppliesTotal + storeTotal + totalWorkerExpenses;
      const netBenefit = totalClientPaid - totalExpenses;
      const marginPercentage = totalClientPaid > 0 ? (netBenefit / totalClientPaid) * 100 : 0;

      // Group debts by client phone (or name if no phone)
      const debtMap = new Map<string, any>();
      reservations.forEach((r: any) => {
        const debt = Math.max(0, (parseFloat(r.total_price) || 0) - (parseFloat(r.paid_amount) || 0));
        if (debt <= 0) return;
        const key = r.client_phone || r.client_name;
        if (debtMap.has(key)) {
          const c = debtMap.get(key);
          c.total += parseFloat(r.total_price) || 0;
          c.paid += parseFloat(r.paid_amount) || 0;
          c.debt += debt;
          c.count += 1;
          c.reservations.push(r);
        } else {
          debtMap.set(key, {
            clientName: r.client_name,
            phone: r.client_phone || '',
            total: parseFloat(r.total_price) || 0,
            paid: parseFloat(r.paid_amount) || 0,
            debt,
            count: 1,
            reservations: [r],
          });
        }
      });
      const clientDebts = Array.from(debtMap.values()).sort((a, b) => b.debt - a.debt);

      // Services from all reservations
      const svcMap = new Map<string, any>();
      reservations.forEach((r: any) => {
        const id = r.prestation_id || 'unknown';
        const name = r.prestations?.name || 'Non spécifié';
        if (!svcMap.has(id)) svcMap.set(id, { id, name, revenue: 0, paid: 0, debt: 0, count: 0, completedCount: 0, reservations: [] });
        const s = svcMap.get(id);
        s.revenue += parseFloat(r.total_price) || 0;
        s.paid += parseFloat(r.paid_amount) || 0;
        s.debt += Math.max(0, (parseFloat(r.total_price) || 0) - (parseFloat(r.paid_amount) || 0));
        s.count += 1;
        if (r.status === 'completed') s.completedCount += 1;
        s.reservations.push(r);
      });
      const topServices = Array.from(svcMap.values()).sort((a, b) => b.revenue - a.revenue);

      // Monthly breakdown
      const monthMap = new Map<string, any>();
      reservations.forEach((r: any) => {
        const d = new Date(r.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        if (!monthMap.has(key)) monthMap.set(key, { key, label, revenue: 0, paid: 0, debt: 0, count: 0 });
        const m = monthMap.get(key);
        m.revenue += parseFloat(r.total_price) || 0;
        m.paid += parseFloat(r.paid_amount) || 0;
        m.debt += Math.max(0, (parseFloat(r.total_price) || 0) - (parseFloat(r.paid_amount) || 0));
        m.count += 1;
      });
      const monthlyData = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));

      const uniqueClients = new Set(reservations.map((r: any) => r.client_phone || r.client_name));

      // ── Product Sales stats ──────────────────────────────────────────
      const totalSalesRevenue = productSales.reduce((s: number, sale: any) => s + (parseFloat(sale.total_amount) || 0), 0);
      const totalSalesPaid = productSales.reduce((s: number, sale: any) => s + (parseFloat(sale.paid_amount) || 0), 0);
      const totalSalesDebt = productSales.reduce((s: number, sale: any) => s + Math.max(0, (parseFloat(sale.total_amount) || 0) - (parseFloat(sale.paid_amount) || 0)), 0);

      // Top products sold
      const productSalesMap = new Map<string, any>();
      productSales.forEach((sale: any) => {
        (sale.sale_items || []).forEach((item: any) => {
          const id = item.product_id;
          const name = item.products?.name || 'Inconnu';
          if (!productSalesMap.has(id)) productSalesMap.set(id, { id, name, qty: 0, revenue: 0, count: 0 });
          const p = productSalesMap.get(id);
          p.qty += item.is_detail ? (item.detail_qty_used || 0) : (item.quantity || 0);
          p.revenue += (parseFloat(item.unit_price) || 0) * (item.quantity || 0);
          p.count += 1;
        });
      });
      const topProducts = Array.from(productSalesMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      // Supplier purchases total (product_purchase_items)
      const totalProductPurchases = allPurchaseItems.reduce((s: number, item: any) => s + (parseFloat(item.price_buy) || 0) * (item.quantity_bought || 0), 0);

      // ── Stock calculation per product ────────────────────────────────
      const { data: allSaleItems } = await supabase.from('sale_items').select('product_id, quantity, is_detail, detail_qty_used');
      const { data: allResProducts } = await supabase.from('reservation_products').select('product_id, quantity, is_detail, detail_qty_used');

      const productsWithStock = allProducts.map((p: any) => {
        const bought = allPurchaseItems.filter((i: any) => i.product_id === p.id);
        const sold = (allSaleItems || []).filter((i: any) => i.product_id === p.id);
        const usedInRes = (allResProducts || []).filter((i: any) => i.product_id === p.id);

        let units = 0, detailMl = 0;
        bought.forEach((b: any) => {
          if (b.sell_by_detail && b.detail_unit_qty) detailMl += (b.quantity_bought || 0) * (b.detail_unit_qty || 0);
          else units += b.quantity_bought || 0;
        });
        sold.forEach((s: any) => { if (s.is_detail) detailMl -= s.detail_qty_used || 0; else units -= s.quantity || 0; });
        usedInRes.forEach((r: any) => { if (r.is_detail) detailMl -= r.detail_qty_used || 0; else units -= r.quantity || 0; });

        const lastBuy = bought.sort((a: any, b: any) => 0).slice(-1)[0];
        const priceBuy = parseFloat(lastBuy?.price_buy) || 0;
        const currentStock = p.sell_by_detail ? detailMl : units;
        const minStock = p.sell_by_detail ? (p.min_stock || 0) * (p.detail_unit_qty || 1) : (p.min_stock || 0);
        const stockValue = p.sell_by_detail ? detailMl * (priceBuy / (p.detail_unit_qty || 1)) : units * priceBuy;

        return {
          id: p.id, name: p.name,
          categoryName: p.product_categories?.name,
          currentStock, minStock,
          stockValue, priceBuy,
          detailUnit: p.detail_unit,
          sellByDetail: p.sell_by_detail,
          isLow: currentStock <= minStock && minStock > 0,
          isOut: currentStock <= 0,
        };
      });

      const lowStockProducts = productsWithStock.filter((p: any) => p.isLow || p.isOut);
      const totalStockValue = productsWithStock.reduce((s: number, p: any) => s + (p.stockValue || 0), 0);

      setReportData({
        totalGains, totalClientPaid, totalDebt,
        purchaseCosts: suppliesTotal,
        purchaseExpenses: purchases.map((p: any) => ({ description: p.description, cost: parseFloat(p.cost) || 0, date: p.date, supplier: p.suppliers?.full_name || 'Non spécifié' })),
        storeExpenses: storeTotal,
        storeExpensesData: storeExpenses.map((e: any) => ({ description: e.name || e.description, cost: parseFloat(e.cost) || 0, date: e.date })),
        totalWorkerExpenses, salaryTotal, employeePayments,
        totalExpenses, netBenefit, marginPercentage,
        clientDebts, topServices, monthlyData,
        allReservations: reservations,
        totalReservations: reservations.length,
        completedCount: completedRes.length,
        pendingCount: pendingRes.length,
        uniqueClients: uniqueClients.size,
        averageBasket: reservations.length > 0 ? totalGains / reservations.length : 0,
        // Product sales
        totalSalesRevenue, totalSalesPaid, totalSalesDebt,
        salesCount: productSales.length,
        topProducts, allProductSales: productSales,
        totalProductPurchases,
        // Stock
        productsWithStock, lowStockProducts, totalStockValue,
      });
      setShowReport(true);
    } catch (err) {
      setError('Erreur lors de la génération du rapport.');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent/10 via-transparent to-accent/5 border border-accent/10 p-8">
        <div className="absolute -right-32 -top-32 w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center">
              <BarChart3 className="text-accent" size={24} />
            </div>
            <div>
              <h2 className="text-3xl font-serif font-bold text-ink">Rapports & Statistiques</h2>
              <p className="text-ink/50 text-sm font-medium">Analyse complète de votre activité</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-ink/50 mb-1.5 uppercase tracking-wider">Date de début</label>
              <div className="relative">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={isGenerating}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/30 text-sm font-medium bg-white disabled:bg-gray-50" />
                <Calendar size={15} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-ink/50 mb-1.5 uppercase tracking-wider">Date de fin</label>
              <div className="relative">
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isGenerating}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/30 text-sm font-medium bg-white disabled:bg-gray-50" />
                <Calendar size={15} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <button onClick={fetchData} disabled={isGenerating}
              className="px-6 py-3 rounded-xl bg-accent text-white font-bold text-sm shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 h-[46px]">
              {isGenerating ? <><Loader2 size={16} className="animate-spin" />Génération...</> : <><Play size={16} />Générer le rapport</>}
            </button>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={15} />{error}
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!showReport && !isGenerating && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="card-premium p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="text-accent" size={32} />
          </div>
          <h3 className="text-xl font-serif font-bold text-ink mb-1">Aucun rapport généré</h3>
          <p className="text-ink/50 text-sm">Sélectionnez une période et cliquez sur "Générer le rapport"</p>
        </motion.div>
      )}

      {showReport && reportData && !isGenerating && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Réservations', value: reportData.totalReservations, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
              { label: 'Finalisées', value: reportData.completedCount, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
              { label: 'En Attente', value: reportData.pendingCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Clientes Uniques', value: reportData.uniqueClients, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={cn('p-4 rounded-2xl border', s.bg, s.border)}>
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', s.bg)}>
                  <s.icon size={18} className={s.color} />
                </div>
                <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                <p className="text-xs font-medium text-ink/50 mt-0.5">{s.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Main KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Revenue */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="card-premium p-8 bg-gradient-to-br from-emerald-50 to-green-50/40 border-emerald-200/50 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-28 h-28 bg-green-200/20 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
                    <TrendingUp size={22} className="text-green-600" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-green-100 text-green-700 rounded-full border border-green-200">Chiffre d'Affaires</span>
                </div>
                <p className="text-sm text-ink/50 font-medium mb-1">Total Facturé — Toutes Réservations</p>
                <h3 className="text-3xl font-serif font-bold text-green-700 mb-4">{formatCurrency(reportData.totalGains)}</h3>
                <div className="h-1.5 w-full bg-green-200/30 rounded-full overflow-hidden mb-3">
                  <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.5 }}
                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500" />
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-green-700">{reportData.totalReservations} réservations</span>
                  <span className="text-green-600/70">Moy. {formatCurrency(reportData.averageBasket)}/rdv</span>
                </div>
              </div>
            </motion.div>

            {/* Collected */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="card-premium p-8 bg-gradient-to-br from-blue-50 to-cyan-50/40 border-blue-200/50 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-28 h-28 bg-blue-200/20 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                    <CreditCard size={22} className="text-blue-600" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-blue-100 text-blue-700 rounded-full border border-blue-200">Encaissé</span>
                </div>
                <p className="text-sm text-ink/50 font-medium mb-1">Montants Reçus des Clientes</p>
                <h3 className="text-3xl font-serif font-bold text-blue-700 mb-4">{formatCurrency(reportData.totalClientPaid)}</h3>
                <div className="h-1.5 w-full bg-blue-200/30 rounded-full overflow-hidden mb-3">
                  <motion.div initial={{ width: 0 }}
                    animate={{ width: reportData.totalGains > 0 ? `${(reportData.totalClientPaid / reportData.totalGains) * 100}%` : '0%' }}
                    transition={{ duration: 1.5 }}
                    className="h-full bg-gradient-to-r from-blue-400 to-cyan-500" />
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-blue-700">{reportData.totalGains > 0 ? ((reportData.totalClientPaid / reportData.totalGains) * 100).toFixed(0) : 0}% collecté</span>
                  <span className="text-blue-600/70">Sur {formatCurrency(reportData.totalGains)}</span>
                </div>
              </div>
            </motion.div>

            {/* Debts */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              onClick={() => setSelectedModal('debts')}
              className="card-premium p-8 bg-gradient-to-br from-red-50 to-orange-50/40 border-red-200/50 relative overflow-hidden cursor-pointer group">
              <div className="absolute -right-10 -top-10 w-28 h-28 bg-red-200/20 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
                    <AlertCircle size={22} className="text-red-600" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-red-100 text-red-700 rounded-full border border-red-200">Dettes Clientes</span>
                </div>
                <p className="text-sm text-ink/50 font-medium mb-1">Montants Impayés — Toutes Réservations</p>
                <h3 className="text-3xl font-serif font-bold text-red-700 mb-4">{formatCurrency(reportData.totalDebt)}</h3>
                <div className="h-1.5 w-full bg-red-200/30 rounded-full overflow-hidden mb-3">
                  <motion.div initial={{ width: 0 }}
                    animate={{ width: reportData.totalGains > 0 ? `${Math.min(100, (reportData.totalDebt / reportData.totalGains) * 100)}%` : '0%' }}
                    transition={{ duration: 1.5 }}
                    className="h-full bg-gradient-to-r from-red-400 to-orange-500" />
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-red-700">{reportData.clientDebts.length} clientes débitrices</span>
                  <span className="text-red-600/70 group-hover:underline">Voir détails →</span>
                </div>
              </div>
            </motion.div>

            {/* Net Benefit */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              onClick={() => setSelectedModal('benefits')}
              className={cn('card-premium p-8 relative overflow-hidden cursor-pointer group',
                reportData.netBenefit >= 0
                  ? 'bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20'
                  : 'bg-gradient-to-br from-red-50 to-orange-50/40 border-red-200/50'
              )}>
              <div className="absolute -right-10 -top-10 w-28 h-28 bg-accent/10 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center',
                    reportData.netBenefit >= 0 ? 'bg-accent/20' : 'bg-red-100')}>
                    {reportData.netBenefit >= 0
                      ? <TrendingUp size={22} className="text-accent" />
                      : <TrendingDown size={22} className="text-red-600" />}
                  </div>
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border',
                    reportData.netBenefit >= 0
                      ? 'bg-accent/20 text-accent border-accent/30'
                      : 'bg-red-100 text-red-700 border-red-200'
                  )}>Bénéfice Net</span>
                </div>
                <p className="text-sm text-ink/50 font-medium mb-1">Bilan après dépenses (sur encaissé)</p>
                <h3 className={cn('text-3xl font-serif font-bold mb-4',
                  reportData.netBenefit >= 0 ? 'text-accent' : 'text-red-600')}>
                  {formatCurrency(reportData.netBenefit)}
                </h3>
                <div className={cn('h-1.5 w-full rounded-full overflow-hidden mb-3',
                  reportData.netBenefit >= 0 ? 'bg-accent/20' : 'bg-red-200/30')}>
                  <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.5 }}
                    className={cn('h-full', reportData.netBenefit >= 0 ? 'bg-accent' : 'bg-red-500')} />
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className={reportData.netBenefit >= 0 ? 'text-accent' : 'text-red-700'}>
                    {reportData.marginPercentage.toFixed(1)}% de marge
                  </span>
                  <span className="text-ink/40 group-hover:underline">Voir détails →</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Expense breakdown */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="card-premium p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-serif font-bold text-ink flex items-center gap-2">
                <TrendingDown size={20} className="text-red-500" />
                Détail des Dépenses
              </h3>
              <span className="text-sm font-semibold text-ink/50">Total: <span className="text-red-600">{formatCurrency(reportData.totalExpenses)}</span></span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Achats & Fournitures', amount: reportData.purchaseCosts, count: reportData.purchaseExpenses?.length || 0, unit: 'articles', icon: Package, color: 'red', modal: 'purchases' as const },
                { label: 'Frais Magasin', amount: reportData.storeExpenses, count: reportData.storeExpensesData?.length || 0, unit: 'charges', icon: Building2, color: 'purple', modal: 'store' as const },
                { label: 'Rémunérations', amount: reportData.totalWorkerExpenses, count: reportData.employeePayments?.length || 0, unit: 'paiements', icon: Users, color: 'amber', modal: 'workers' as const },
              ].map((item, i) => {
                const pct = reportData.totalExpenses > 0 ? (item.amount / reportData.totalExpenses) * 100 : 0;
                const c: any = {
                  red: { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-600', bar: 'bg-red-500', icon: 'bg-red-100' },
                  purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-600', bar: 'bg-purple-500', icon: 'bg-purple-100' },
                  amber: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-600', bar: 'bg-amber-500', icon: 'bg-amber-100' },
                }[item.color];
                return (
                  <motion.div key={i} whileHover={{ scale: 1.02 }} onClick={() => setSelectedModal(item.modal)}
                    className={cn('p-5 rounded-2xl border cursor-pointer transition-shadow hover:shadow-md', c.bg, c.border)}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', c.icon)}>
                        <item.icon size={18} className={c.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-ink/60">{item.label}</p>
                        <p className={cn('text-lg font-bold', c.text)}>{formatCurrency(item.amount)}</p>
                      </div>
                      <ChevronRight size={15} className="text-ink/30 flex-shrink-0" />
                    </div>
                    <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mb-2">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1 }}
                        className={cn('h-full rounded-full', c.bar)} />
                    </div>
                    <div className="flex justify-between text-xs text-ink/50">
                      <span>{item.count} {item.unit}</span>
                      <span>{pct.toFixed(0)}% des dépenses</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Monthly breakdown (only shown when > 1 month) */}
          {reportData.monthlyData?.length > 1 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="card-premium p-8">
              <h3 className="text-xl font-serif font-bold text-ink mb-6 flex items-center gap-2">
                <Activity size={20} className="text-accent" />
                Évolution Mensuelle
              </h3>
              <div className="overflow-x-auto rounded-xl border border-border/20">
                <table className="w-full text-sm text-left">
                  <thead className="bg-primary-bg/50 border-b border-border/20">
                    <tr>
                      {['Mois', 'Réservations', 'CA Facturé', 'Encaissé', 'Reste Dû'].map(h => (
                        <th key={h} className={cn('px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink/40', h !== 'Mois' && h !== 'Réservations' ? 'text-right' : '')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {reportData.monthlyData.map((m: any, i: number) => (
                      <tr key={i} className="hover:bg-accent/[0.02] transition-colors">
                        <td className="px-4 py-3 font-semibold text-ink capitalize">{m.label}</td>
                        <td className="px-4 py-3 text-ink/60 text-center">{m.count}</td>
                        <td className="px-4 py-3 font-semibold text-ink text-right">{formatCurrency(m.revenue)}</td>
                        <td className="px-4 py-3 font-semibold text-green-600 text-right">{formatCurrency(m.paid)}</td>
                        <td className={cn('px-4 py-3 font-semibold text-right', m.debt > 0 ? 'text-red-600' : 'text-green-600')}>
                          {m.debt > 0 ? formatCurrency(m.debt) : '✓ Soldé'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border/30 bg-primary-bg/30 font-bold">
                      <td className="px-4 py-3 text-ink">Total</td>
                      <td className="px-4 py-3 text-ink text-center">{reportData.totalReservations}</td>
                      <td className="px-4 py-3 text-ink text-right">{formatCurrency(reportData.totalGains)}</td>
                      <td className="px-4 py-3 text-green-600 text-right">{formatCurrency(reportData.totalClientPaid)}</td>
                      <td className="px-4 py-3 text-red-600 text-right">{formatCurrency(reportData.totalDebt)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Service performance */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="space-y-4">
            <h3 className="text-xl font-serif font-bold text-ink flex items-center gap-2">
              <Sparkles size={20} className="text-accent" />
              Performances par Prestation
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportData.topServices?.length > 0 ? reportData.topServices.map((svc: any, i: number) => {
                const palettes = [
                  { bg: 'from-emerald-50 to-green-50/40', border: 'border-emerald-200/50', text: 'text-emerald-700', bar: 'from-emerald-400 to-green-500' },
                  { bg: 'from-blue-50 to-cyan-50/40', border: 'border-blue-200/50', text: 'text-blue-700', bar: 'from-blue-400 to-cyan-500' },
                  { bg: 'from-purple-50 to-pink-50/40', border: 'border-purple-200/50', text: 'text-purple-700', bar: 'from-purple-400 to-pink-500' },
                  { bg: 'from-amber-50 to-orange-50/40', border: 'border-amber-200/50', text: 'text-amber-700', bar: 'from-amber-400 to-orange-500' },
                  { bg: 'from-rose-50 to-red-50/40', border: 'border-rose-200/50', text: 'text-rose-700', bar: 'from-rose-400 to-red-500' },
                ];
                const p = palettes[i % palettes.length];
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.05 }}
                    onClick={() => { setSelectedPrestationId(svc.id); setSelectedModal('prestation'); }}
                    className={cn('card-premium p-6 bg-gradient-to-br cursor-pointer hover:shadow-lg transition-all group', p.bg, p.border)}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-ink truncate">{svc.name}</h4>
                        <p className="text-xs text-ink/50 mt-0.5">
                          {svc.count} réservation{svc.count > 1 ? 's' : ''} • {svc.completedCount} finalisée{svc.completedCount > 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-ink/30 group-hover:translate-x-1 transition-transform mt-1 flex-shrink-0" />
                    </div>
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-ink/50">Facturé</span>
                        <span className={cn('font-bold', p.text)}>{formatCurrency(svc.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1 }}
                          className={cn('h-full bg-gradient-to-r', p.bar)} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-ink/50">Encaissé</span>
                        <span className="font-semibold text-green-600">{formatCurrency(svc.paid)}</span>
                      </div>
                      <div className="h-1 bg-white/60 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }}
                          animate={{ width: svc.revenue > 0 ? `${(svc.paid / svc.revenue) * 100}%` : '0%' }}
                          transition={{ duration: 1 }}
                          className="h-full bg-gradient-to-r from-green-400 to-emerald-500" />
                      </div>
                    </div>
                    {svc.debt > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-1.5">
                        <AlertCircle size={11} />
                        Reste dû: {formatCurrency(svc.debt)}
                      </div>
                    )}
                  </motion.div>
                );
              }) : (
                <div className="col-span-full text-center py-8 text-ink/40">Aucune prestation sur cette période</div>
              )}
            </div>
          </motion.div>

          {/* Reservations table */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="card-premium p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-serif font-bold text-ink flex items-center gap-2">
                <FileText size={20} className="text-accent" />
                Toutes les Réservations
              </h3>
              <span className="text-sm text-ink/50 font-medium">{reportData.totalReservations} au total</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/20">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-primary-bg/50 border-b border-border/20">
                  <tr>
                    {['Cliente', 'Date', 'Prestation', 'Montant', 'Payé', 'Reste', 'Statut'].map((h, i) => (
                      <th key={h} className={cn('px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink/40',
                        i >= 3 && i <= 5 ? 'text-right' : '')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {reportData.allReservations?.length > 0 ? reportData.allReservations.map((res: any, i: number) => {
                    const debt = Math.max(0, (parseFloat(res.total_price) || 0) - (parseFloat(res.paid_amount) || 0));
                    return (
                      <tr key={i} className="hover:bg-accent/[0.02] transition-colors">
                        <td className="px-4 py-3 font-semibold text-ink">{res.client_name}</td>
                        <td className="px-4 py-3 text-ink/60 whitespace-nowrap">{new Date(res.date).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3 text-ink/60 max-w-[180px] truncate">{res.prestations?.name || '-'}</td>
                        <td className="px-4 py-3 font-semibold text-ink text-right whitespace-nowrap">{formatCurrency(res.total_price)}</td>
                        <td className="px-4 py-3 font-semibold text-green-600 text-right whitespace-nowrap">{formatCurrency(res.paid_amount)}</td>
                        <td className={cn('px-4 py-3 font-semibold text-right whitespace-nowrap', debt > 0 ? 'text-red-600' : 'text-green-600')}>
                          {debt > 0 ? formatCurrency(debt) : '✓'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            res.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                            {res.status === 'completed' ? 'Finalisée' : 'En Attente'}
                          </span>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-ink/40">Aucune réservation dans cette période</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* ── Section Ventes Produits ─────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="space-y-4">
            <h3 className="text-xl font-serif font-bold text-ink flex items-center gap-2">
              <ShoppingBag size={20} className="text-accent" />
              Ventes Produits
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Nombre de ventes', value: reportData.salesCount, suffix: '', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                { label: 'Total encaissé', value: formatCurrency(reportData.totalSalesPaid), suffix: '', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                { label: 'Dettes clients', value: formatCurrency(reportData.totalSalesDebt), suffix: '', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 + i * 0.04 }}
                  className={cn('p-5 rounded-2xl border', s.bg, s.border)}>
                  <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs font-medium text-ink/50 mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>

            {reportData.topProducts?.length > 0 && (
              <div className="card-premium p-6">
                <h4 className="font-bold text-ink mb-4 text-sm uppercase tracking-widest text-ink/40">Top 5 produits vendus</h4>
                <div className="space-y-3">
                  {reportData.topProducts.map((p: any, i: number) => {
                    const maxRev = reportData.topProducts[0]?.revenue || 1;
                    return (
                      <div key={p.id} className="flex items-center gap-4">
                        <span className="text-xs font-bold text-ink/30 w-5">#{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-bold text-ink">{p.name}</span>
                            <span className="text-sm font-bold text-accent">{formatCurrency(p.revenue)}</span>
                          </div>
                          <div className="h-2 bg-primary-bg rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${(p.revenue / maxRev) * 100}%` }} transition={{ duration: 1, delay: 0.6 + i * 0.1 }}
                              className="h-full bg-gradient-to-r from-accent to-accent/60 rounded-full" />
                          </div>
                        </div>
                        <span className="text-xs text-ink/40 w-16 text-right">{p.qty} vendus</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {reportData.allProductSales?.length > 0 && (
              <div className="card-premium overflow-hidden">
                <div className="p-5 border-b border-border">
                  <h4 className="font-bold text-ink text-sm">Toutes les ventes produits</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-primary-bg/50"><tr>
                      {['Client', 'Date', 'Produits', 'Total', 'Payé', 'Reste', 'Statut'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-ink/40">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {reportData.allProductSales.slice(0, 50).map((sale: any, i: number) => {
                        const debt = Math.max(0, (parseFloat(sale.total_amount) || 0) - (parseFloat(sale.paid_amount) || 0));
                        return (
                          <tr key={i} className="hover:bg-primary-bg/20">
                            <td className="px-4 py-2.5 font-medium">{sale.client_name}</td>
                            <td className="px-4 py-2.5 text-ink/50">{new Date(sale.date).toLocaleDateString('fr-FR')}</td>
                            <td className="px-4 py-2.5">{sale.sale_items?.length || 0}</td>
                            <td className="px-4 py-2.5 font-bold text-accent">{formatCurrency(sale.total_amount)}</td>
                            <td className="px-4 py-2.5 text-emerald-600">{formatCurrency(sale.paid_amount)}</td>
                            <td className={cn('px-4 py-2.5', debt > 0 ? 'text-red-500 font-bold' : 'text-emerald-600')}>{debt > 0 ? formatCurrency(debt) : '✓'}</td>
                            <td className="px-4 py-2.5"><span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', debt <= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>{debt <= 0 ? 'Payé' : 'Dette'}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>

          {/* ── Section Produits & Stock ──────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="space-y-4">
            <h3 className="text-xl font-serif font-bold text-ink flex items-center gap-2">
              <Package size={20} className="text-accent" />
              Produits & Stock
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Produits en catalogue', value: reportData.productsWithStock?.length || 0, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                { label: 'Valeur totale du stock', value: formatCurrency(reportData.totalStockValue || 0), color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/20' },
                { label: 'Alertes stock faible', value: reportData.lowStockProducts?.length || 0, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.04 }}
                  className={cn('p-5 rounded-2xl border', s.bg, s.border)}>
                  <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs font-medium text-ink/50 mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>

            {reportData.lowStockProducts?.length > 0 && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-2">
                <h4 className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> Produits en alerte ou rupture</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {reportData.lowStockProducts.map((p: any) => (
                    <div key={p.id} className={cn('p-3 rounded-xl flex items-center justify-between', p.isOut ? 'bg-red-100' : 'bg-orange-50')}>
                      <div>
                        <p className="font-bold text-sm text-ink">{p.name}</p>
                        {p.categoryName && <p className="text-xs text-ink/40">{p.categoryName}</p>}
                      </div>
                      <span className={cn('text-sm font-bold', p.isOut ? 'text-red-600' : 'text-orange-500')}>
                        {p.currentStock.toLocaleString()} {p.sellByDetail ? p.detailUnit : 'u'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card-premium overflow-hidden">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h4 className="font-bold text-ink text-sm">Stock par produit</h4>
                <span className="text-xs text-ink/40">Valeur totale: {formatCurrency(reportData.totalStockValue || 0)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-primary-bg/50"><tr>
                    {['Produit', 'Catégorie', 'Stock actuel', 'Stock min', 'Valeur stock', 'Statut'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-ink/40">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {(reportData.productsWithStock || []).map((p: any, i: number) => (
                      <tr key={i} className="hover:bg-primary-bg/20">
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 text-ink/50">{p.categoryName || '—'}</td>
                        <td className={cn('px-4 py-2.5 font-bold', p.isOut ? 'text-red-600' : p.isLow ? 'text-orange-500' : 'text-emerald-600')}>
                          {p.currentStock.toLocaleString()} {p.sellByDetail ? p.detailUnit : 'u'}
                        </td>
                        <td className="px-4 py-2.5 text-ink/50">{p.minStock} {p.sellByDetail ? p.detailUnit : 'u'}</td>
                        <td className="px-4 py-2.5 font-bold text-accent">{formatCurrency(p.stockValue)}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold',
                            p.isOut ? 'bg-red-100 text-red-600' : p.isLow ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-700'
                          )}>
                            {p.isOut ? 'Rupture' : p.isLow ? 'Bas' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>

          {/* Modals */}
          <AnimatePresence>
            {selectedModal && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={closeModal}>
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">

                  {/* Modal header */}
                  <div className={cn('p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0',
                    selectedModal === 'purchases' ? 'bg-gradient-to-r from-red-50 to-orange-50' :
                    selectedModal === 'store' ? 'bg-gradient-to-r from-purple-50 to-pink-50' :
                    selectedModal === 'workers' ? 'bg-gradient-to-r from-amber-50 to-yellow-50' :
                    selectedModal === 'debts' ? 'bg-gradient-to-r from-red-50 to-rose-50' :
                    selectedModal === 'benefits' ? 'bg-gradient-to-r from-green-50 to-emerald-50' :
                    'bg-gradient-to-r from-accent/10 to-accent/5'
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center',
                        selectedModal === 'purchases' ? 'bg-red-100 text-red-600' :
                        selectedModal === 'store' ? 'bg-purple-100 text-purple-600' :
                        selectedModal === 'workers' ? 'bg-amber-100 text-amber-600' :
                        selectedModal === 'debts' ? 'bg-red-100 text-red-600' :
                        selectedModal === 'benefits' ? 'bg-green-100 text-green-600' :
                        'bg-accent/20 text-accent'
                      )}>
                        {selectedModal === 'purchases' ? <Package size={20} /> :
                         selectedModal === 'store' ? <Building2 size={20} /> :
                         selectedModal === 'workers' ? <Users size={20} /> :
                         selectedModal === 'debts' ? <AlertCircle size={20} /> :
                         selectedModal === 'benefits' ? <TrendingUp size={20} /> :
                         <Sparkles size={20} />}
                      </div>
                      <h2 className="text-xl font-serif font-bold text-ink">
                        {selectedModal === 'purchases' ? 'Achats & Fournitures' :
                         selectedModal === 'store' ? 'Frais Magasin' :
                         selectedModal === 'workers' ? 'Rémunérations' :
                         selectedModal === 'debts' ? 'Dettes Clientes' :
                         selectedModal === 'benefits' ? 'Bilan Financier' :
                         reportData.topServices?.find((s: any) => s.id === selectedPrestationId)?.name || 'Prestation'}
                      </h2>
                    </div>
                    <button onClick={closeModal} className="w-9 h-9 rounded-xl hover:bg-black/10 transition-colors flex items-center justify-center">
                      <X size={20} />
                    </button>
                  </div>

                  {/* Modal body */}
                  <div className="p-6 overflow-y-auto flex-1 space-y-3">

                    {selectedModal === 'purchases' && (
                      <>
                        {reportData.purchaseExpenses?.length > 0 ? (
                          <>
                            {reportData.purchaseExpenses.map((e: any, i: number) => (
                              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <Package size={15} className="text-red-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-ink truncate">{e.description}</p>
                                    <p className="text-xs text-ink/50">{e.supplier} • {new Date(e.date).toLocaleDateString('fr-FR')}</p>
                                  </div>
                                </div>
                                <p className="font-bold text-red-600 flex-shrink-0">{formatCurrency(e.cost)}</p>
                              </motion.div>
                            ))}
                            <div className="p-4 bg-red-100/50 rounded-xl flex justify-between border border-red-200">
                              <span className="font-bold text-ink">Total Achats</span>
                              <span className="text-xl font-bold text-red-600">{formatCurrency(reportData.purchaseCosts)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-10 text-ink/40"><Package size={36} className="mx-auto mb-2 text-gray-200" /><p>Aucun achat enregistré</p></div>
                        )}
                      </>
                    )}

                    {selectedModal === 'store' && (
                      <>
                        {reportData.storeExpensesData?.length > 0 ? (
                          <>
                            {reportData.storeExpensesData.map((e: any, i: number) => (
                              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                className="p-4 bg-purple-50 rounded-xl border border-purple-100 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                    <Building2 size={15} className="text-purple-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-ink truncate">{e.description}</p>
                                    <p className="text-xs text-ink/50">{new Date(e.date).toLocaleDateString('fr-FR')}</p>
                                  </div>
                                </div>
                                <p className="font-bold text-purple-600 flex-shrink-0">{formatCurrency(e.cost)}</p>
                              </motion.div>
                            ))}
                            <div className="p-4 bg-purple-100/50 rounded-xl flex justify-between border border-purple-200">
                              <span className="font-bold text-ink">Total Frais Magasin</span>
                              <span className="text-xl font-bold text-purple-600">{formatCurrency(reportData.storeExpenses)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-10 text-ink/40"><Building2 size={36} className="mx-auto mb-2 text-gray-200" /><p>Aucun frais magasin</p></div>
                        )}
                      </>
                    )}

                    {selectedModal === 'workers' && (
                      <>
                        {reportData.employeePayments?.length > 0 ? (
                          <>
                            {reportData.employeePayments.map((p: any, i: number) => (
                              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <Users size={15} className="text-amber-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-ink">{p.profiles?.full_name || 'Employé'}</p>
                                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded uppercase',
                                        p.type === 'salary' ? 'bg-green-100 text-green-700' :
                                        p.type === 'acompte' ? 'bg-blue-100 text-blue-700' :
                                        'bg-red-100 text-red-700')}>
                                        {p.type === 'salary' ? 'Salaire' : p.type === 'acompte' ? 'Acompte' : 'Absence'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-ink/50">{new Date(p.date).toLocaleDateString('fr-FR')}</p>
                                  </div>
                                </div>
                                <p className="font-bold text-amber-600 flex-shrink-0">{formatCurrency(p.amount)}</p>
                              </motion.div>
                            ))}
                            <div className="p-4 bg-amber-100/50 rounded-xl flex justify-between border border-amber-200">
                              <span className="font-bold text-ink">Total Rémunérations</span>
                              <span className="text-xl font-bold text-amber-600">{formatCurrency(reportData.totalWorkerExpenses)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-10 text-ink/40"><Users size={36} className="mx-auto mb-2 text-gray-200" /><p>Aucun paiement employé</p></div>
                        )}
                      </>
                    )}

                    {selectedModal === 'debts' && (
                      <>
                        {reportData.clientDebts?.length > 0 ? (
                          <>
                            <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-center text-sm text-red-700 font-medium">
                              {reportData.clientDebts.length} cliente{reportData.clientDebts.length > 1 ? 's' : ''} avec montants impayés —
                              Total: <strong>{formatCurrency(reportData.totalDebt)}</strong>
                            </div>
                            {reportData.clientDebts.map((d: any, i: number) => (
                              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                className="p-4 bg-red-50 rounded-xl border border-red-100">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <p className="font-bold text-ink">{d.clientName}</p>
                                    {d.phone && (
                                      <div className="flex items-center gap-1 text-xs text-ink/50 mt-0.5">
                                        <Phone size={11} /><span>{d.phone}</span>
                                      </div>
                                    )}
                                    <p className="text-xs text-ink/50 mt-0.5">{d.count} réservation{d.count > 1 ? 's' : ''}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xl font-bold text-red-600">{formatCurrency(d.debt)}</p>
                                    <p className="text-xs text-ink/50">à percevoir</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                  <div className="p-2 bg-white rounded-lg border border-gray-100 flex justify-between">
                                    <span className="text-ink/50">Total</span>
                                    <span className="font-semibold">{formatCurrency(d.total)}</span>
                                  </div>
                                  <div className="p-2 bg-white rounded-lg border border-green-100 flex justify-between">
                                    <span className="text-ink/50">Payé</span>
                                    <span className="font-semibold text-green-600">{formatCurrency(d.paid)}</span>
                                  </div>
                                </div>
                                <div className="h-1.5 bg-red-200 rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }}
                                    animate={{ width: d.total > 0 ? `${(d.paid / d.total) * 100}%` : '0%' }}
                                    transition={{ duration: 0.8 }}
                                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500" />
                                </div>
                                <p className="text-[10px] text-ink/40 text-right mt-1">
                                  {d.total > 0 ? ((d.paid / d.total) * 100).toFixed(0) : 0}% recouvré
                                </p>
                              </motion.div>
                            ))}
                          </>
                        ) : (
                          <div className="text-center py-10">
                            <CheckCircle2 size={36} className="mx-auto mb-2 text-green-300" />
                            <p className="text-ink/40 font-medium">Aucune dette — Toutes les clientes sont à jour !</p>
                          </div>
                        )}
                      </>
                    )}

                    {selectedModal === 'benefits' && (
                      <div className="space-y-3">
                        <div className="p-5 bg-blue-50 rounded-xl border border-blue-100">
                          <p className="text-xs font-bold text-ink/50 uppercase tracking-wider mb-3">Revenus Encaissés</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CreditCard size={16} className="text-blue-600" />
                              <span className="font-medium text-sm text-ink">Total Encaissé</span>
                            </div>
                            <span className="text-xl font-bold text-blue-600">{formatCurrency(reportData.totalClientPaid)}</span>
                          </div>
                          <p className="text-xs text-ink/40 mt-2">
                            Sur {formatCurrency(reportData.totalGains)} facturés ({reportData.totalGains > 0 ? ((reportData.totalClientPaid / reportData.totalGains) * 100).toFixed(0) : 0}% collecté)
                          </p>
                        </div>
                        <p className="text-xs font-bold text-ink/50 uppercase tracking-wider pt-1">Dépenses</p>
                        {[
                          { label: 'Achats & Fournitures', amount: reportData.purchaseCosts, icon: Package, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
                          { label: 'Frais Magasin', amount: reportData.storeExpenses, icon: Building2, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
                          { label: 'Rémunérations', amount: reportData.totalWorkerExpenses, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                        ].map((item, i) => (
                          <motion.div key={i} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                            className={cn('p-4 rounded-xl border', item.bg, item.border)}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <item.icon size={15} className={item.color} />
                                <span className="font-medium text-sm text-ink">{item.label}</span>
                              </div>
                              <span className={cn('font-bold', item.color)}>-{formatCurrency(item.amount)}</span>
                            </div>
                          </motion.div>
                        ))}
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                          className={cn('p-5 rounded-xl border-2 text-center',
                            reportData.netBenefit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
                          <p className="text-xs font-bold text-ink/50 uppercase tracking-wider mb-2">Bénéfice Net</p>
                          <p className={cn('text-3xl font-serif font-bold', reportData.netBenefit >= 0 ? 'text-green-600' : 'text-red-600')}>
                            {formatCurrency(reportData.netBenefit)}
                          </p>
                          <p className={cn('text-sm font-medium mt-1', reportData.netBenefit >= 0 ? 'text-green-600' : 'text-red-600')}>
                            {reportData.netBenefit >= 0 ? '✓ Bénéfice' : '✗ Perte'} • Marge: {reportData.marginPercentage.toFixed(1)}%
                          </p>
                          <p className="text-xs text-ink/40 mt-1">
                            {formatCurrency(reportData.totalClientPaid)} encaissé − {formatCurrency(reportData.totalExpenses)} dépenses
                          </p>
                        </motion.div>
                      </div>
                    )}

                    {selectedModal === 'prestation' && selectedPrestationId && (() => {
                      const svc = reportData.topServices?.find((s: any) => s.id === selectedPrestationId);
                      if (!svc) return null;
                      return (
                        <div className="space-y-3">
                          <div className="p-4 bg-accent/5 rounded-xl border border-accent/20">
                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div>
                                <p className="text-xl font-bold text-accent">{svc.count}</p>
                                <p className="text-xs text-ink/50">Réservations</p>
                              </div>
                              <div>
                                <p className="text-xl font-bold text-green-600">{formatCurrency(svc.paid)}</p>
                                <p className="text-xs text-ink/50">Encaissé</p>
                              </div>
                              <div>
                                <p className="text-xl font-bold text-ink">{formatCurrency(svc.revenue)}</p>
                                <p className="text-xs text-ink/50">Total Facturé</p>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {svc.reservations?.map((res: any, i: number) => {
                              const debt = Math.max(0, (parseFloat(res.total_price) || 0) - (parseFloat(res.paid_amount) || 0));
                              return (
                                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                  className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold text-ink text-sm">{res.client_name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <p className="text-xs text-ink/50">{new Date(res.date).toLocaleDateString('fr-FR')}</p>
                                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                                        res.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                                        {res.status === 'completed' ? 'Finalisée' : 'En attente'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-ink text-sm">{formatCurrency(res.total_price)}</p>
                                    {debt > 0
                                      ? <p className="text-xs text-red-600 font-semibold">Reste: {formatCurrency(debt)}</p>
                                      : <p className="text-xs text-green-600 font-semibold">✓ Payé</p>}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                          {svc.debt > 0 && (
                            <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex justify-between">
                              <span className="text-sm font-semibold text-red-700">Total reste dû</span>
                              <span className="font-bold text-red-600">{formatCurrency(svc.debt)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Export */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="flex gap-3 justify-center pt-2">
            <button className="px-6 py-3 rounded-xl bg-white border border-gray-200 hover:shadow-md transition-all flex items-center gap-2 text-sm font-semibold text-ink">
              <Download size={15} />Télécharger PDF
            </button>
            <button className="px-6 py-3 rounded-xl bg-accent text-white shadow-lg shadow-accent/20 hover:shadow-xl transition-all flex items-center gap-2 text-sm font-semibold">
              <PieChart size={15} />Exporter Données
            </button>
          </motion.div>

        </motion.div>
      )}
    </div>
  );
};

export default Reports;
