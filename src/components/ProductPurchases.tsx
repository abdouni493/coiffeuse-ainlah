import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingCart, Plus, Search, Trash2, Eye, Edit2, CreditCard,
  X, Check, LayoutGrid, List, Loader2, Layers
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface CartItem {
  productId: string;
  productName: string;
  barcode?: string;
  quantityBought: number;
  priceBuy: number;
  priceSell: number;
  minStock: number;
  sellByDetail: boolean;
  detailUnitQty: number;
  currentStock: number;
}

interface PurchaseRecord {
  id: string;
  supplierId?: string;
  supplierName: string;
  date: string;
  totalCost: number;
  paidAmount: number;
  status: 'paid' | 'debt';
  itemCount: number;
}

const ProductPurchases: React.FC = () => {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);

  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [itemForm, setItemForm] = useState({
    qty: 1, priceBuy: 0, priceSell: 0, minStock: 5,
    sellByDetail: false, detailUnitQty: 1,
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [versement, setVersement] = useState(0);
  const [versementEdited, setVersementEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [modal, setModal] = useState<'details' | 'pay' | 'delete' | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState(0);

  const totalCart = cart.reduce((s, i) => s + i.quantityBought * i.priceBuy, 0);
  const reste = totalCart - versement;

  const fetchSuppliers = useCallback(async () => {
    const { data } = await supabase.from('suppliers').select('id, full_name').order('full_name');
    setSuppliers(data || []);
  }, []);

  const fetchPurchases = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('product_purchases')
      .select('id, date, total_cost, paid_amount, supplier_id, suppliers(full_name), product_purchase_items(id)')
      .order('date', { ascending: false })
      .limit(200);
    setPurchases(
      (data || []).map((p: any) => ({
        id: p.id,
        supplierId: p.supplier_id,
        supplierName: p.suppliers?.full_name || 'Non spécifié',
        date: p.date,
        totalCost: parseFloat(p.total_cost) || 0,
        paidAmount: parseFloat(p.paid_amount) || 0,
        status: parseFloat(p.paid_amount) >= parseFloat(p.total_cost) ? 'paid' : 'debt',
        itemCount: p.product_purchase_items?.length || 0,
      }))
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchSuppliers();
    fetchPurchases();
  }, [fetchSuppliers, fetchPurchases]);

  useEffect(() => {
    if (!versementEdited) setVersement(totalCart);
  }, [totalCart, versementEdited]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) { setProductResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, barcode, min_stock, sell_by_detail, detail_unit_qty, detail_unit')
      .or(`name.ilike.%${q}%,barcode.ilike.%${q}%`)
      .limit(10);

    const results = await Promise.all((data || []).map(async (p: any) => {
      const [{ data: bought }, { data: sold }, { data: usedRes }] = await Promise.all([
        supabase.from('product_purchase_items').select('quantity_bought').eq('product_id', p.id),
        supabase.from('sale_items').select('quantity').eq('product_id', p.id),
        supabase.from('reservation_products').select('quantity').eq('product_id', p.id),
      ]);
      const stock =
        (bought || []).reduce((s: number, r: any) => s + r.quantity_bought, 0) -
        (sold || []).reduce((s: number, r: any) => s + r.quantity, 0) -
        (usedRes || []).reduce((s: number, r: any) => s + r.quantity, 0);
      const { data: lastPrice } = await supabase
        .from('product_purchase_items').select('price_sell, price_buy')
        .eq('product_id', p.id).order('created_at', { ascending: false }).limit(1).single();
      return { ...p, currentStock: stock, lastPriceSell: lastPrice?.price_sell || 0, lastPriceBuy: lastPrice?.price_buy || 0 };
    }));
    setProductResults(results);
    setIsSearching(false);
  }, []);

  const handleProductSearch = (q: string) => {
    setProductQuery(q);
    setShowDropdown(true);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => searchProducts(q), 350);
  };

  const selectProduct = (p: any) => {
    setSelectedProduct(p);
    setItemForm({
      qty: 1,
      priceBuy: p.lastPriceBuy || 0,
      priceSell: p.lastPriceSell || 0,
      minStock: p.min_stock || 5,
      sellByDetail: p.sell_by_detail || false,
      detailUnitQty: p.detail_unit_qty || 1,
    });
    setProductQuery(p.name);
    setShowDropdown(false);
    setProductResults([]);
  };

  const addToCart = () => {
    if (!selectedProduct || itemForm.qty <= 0 || itemForm.priceBuy <= 0) return;
    const item: CartItem = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      barcode: selectedProduct.barcode,
      quantityBought: itemForm.qty,
      priceBuy: itemForm.priceBuy,
      priceSell: itemForm.priceSell,
      minStock: itemForm.minStock,
      sellByDetail: itemForm.sellByDetail,
      detailUnitQty: itemForm.detailUnitQty,
      currentStock: selectedProduct.currentStock,
    };
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === selectedProduct.id);
      return idx >= 0 ? prev.map((i, n) => n === idx ? item : i) : [...prev, item];
    });
    resetProductForm();
    setVersementEdited(false);
  };

  const resetProductForm = () => {
    setSelectedProduct(null);
    setProductQuery('');
    setItemForm({ qty: 1, priceBuy: 0, priceSell: 0, minStock: 5, sellByDetail: false, detailUnitQty: 1 });
    setProductResults([]);
    setShowDropdown(false);
  };

  const resetModal = () => {
    setCart([]);
    setSupplierId('');
    setOrderDate(new Date().toISOString().split('T')[0]);
    setVersement(0);
    setVersementEdited(false);
    setEditingPurchaseId(null);
    resetProductForm();
  };

  const savePurchase = async () => {
    if (cart.length === 0) return;
    setIsSaving(true);
    try {
      const paidAmt = Math.min(versement, totalCart);
      const items = cart.map(i => ({
        product_id: i.productId,
        quantity_bought: i.quantityBought,
        price_buy: i.priceBuy,
        price_sell: i.priceSell,
        min_stock: i.minStock,
        sell_by_detail: i.sellByDetail,
        detail_unit_qty: i.sellByDetail ? i.detailUnitQty : null,
      }));

      if (editingPurchaseId) {
        await supabase.from('product_purchases').update({
          supplier_id: supplierId || null,
          date: orderDate,
          total_cost: totalCart,
          paid_amount: paidAmt,
        }).eq('id', editingPurchaseId);
        await supabase.from('product_purchase_items').delete().eq('purchase_id', editingPurchaseId);
        await supabase.from('product_purchase_items').insert(
          items.map(i => ({ ...i, purchase_id: editingPurchaseId }))
        );
      } else {
        const { data: pd, error } = await supabase
          .from('product_purchases')
          .insert([{ supplier_id: supplierId || null, date: orderDate, total_cost: totalCart, paid_amount: paidAmt }])
          .select().single();
        if (error || !pd) throw error;
        await supabase.from('product_purchase_items').insert(items.map(i => ({ ...i, purchase_id: pd.id })));
        if (paidAmt > 0) {
          await supabase.from('purchase_payments').insert([{ purchase_id: pd.id, amount: paidAmt, date: orderDate }]);
        }
      }

      await Promise.all(cart.map(i =>
        supabase.from('products').update({
          min_stock: i.minStock,
          sell_by_detail: i.sellByDetail,
          detail_unit_qty: i.sellByDetail ? i.detailUnitQty : null,
          price_sell: i.priceSell,
        }).eq('id', i.productId)
      ));

      resetModal();
      setShowPurchaseModal(false);
      await fetchPurchases();
    } catch (err) {
      console.error('Error saving purchase:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const openEditPurchase = async (purchase: PurchaseRecord) => {
    const { data } = await supabase
      .from('product_purchases')
      .select('*, product_purchase_items(*, products(name, barcode))')
      .eq('id', purchase.id).single();
    if (!data) return;
    setEditingPurchaseId(purchase.id);
    setSupplierId(data.supplier_id || '');
    setOrderDate(data.date);
    setVersement(parseFloat(data.paid_amount) || 0);
    setVersementEdited(true);
    setCart((data.product_purchase_items || []).map((item: any) => ({
      productId: item.product_id,
      productName: item.products?.name || 'Produit inconnu',
      barcode: item.products?.barcode,
      quantityBought: item.quantity_bought,
      priceBuy: item.price_buy,
      priceSell: item.price_sell,
      minStock: item.min_stock || 5,
      sellByDetail: item.sell_by_detail || false,
      detailUnitQty: item.detail_unit_qty || 1,
      currentStock: 0,
    })));
    setShowPurchaseModal(true);
  };

  const openDetails = async (purchase: PurchaseRecord) => {
    const { data } = await supabase
      .from('product_purchases')
      .select('*, suppliers(full_name), product_purchase_items(*, products(name, barcode)), purchase_payments(*)')
      .eq('id', purchase.id).single();
    setSelectedPurchase(data);
    setModal('details');
  };

  const openPay = async (purchase: PurchaseRecord) => {
    const { data } = await supabase
      .from('product_purchases')
      .select('*, suppliers(full_name), purchase_payments(*)')
      .eq('id', purchase.id).single();
    setSelectedPurchase(data);
    setPayAmount(Math.max(0, purchase.totalCost - purchase.paidAmount));
    setModal('pay');
  };

  const savePayment = async () => {
    if (!selectedPurchase || payAmount <= 0) return;
    const newPaid = Math.min(
      parseFloat(selectedPurchase.total_cost),
      parseFloat(selectedPurchase.paid_amount) + payAmount
    );
    await Promise.all([
      supabase.from('product_purchases').update({ paid_amount: newPaid }).eq('id', selectedPurchase.id),
      supabase.from('purchase_payments').insert([{
        purchase_id: selectedPurchase.id,
        amount: payAmount,
        date: new Date().toISOString().split('T')[0],
      }]),
    ]);
    await fetchPurchases();
    setModal(null);
  };

  const deletePurchase = async () => {
    if (!selectedPurchase) return;
    await supabase.from('product_purchases').delete().eq('id', selectedPurchase.id);
    await fetchPurchases();
    setModal(null);
  };

  // ── Card actions row ────────────────────────────────────────────────
  const PurchaseActions = ({ p }: { p: PurchaseRecord }) => (
    <div className="flex gap-1.5 pt-3 border-t border-border">
      <button onClick={() => openDetails(p)}
        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold hover:bg-blue-50 text-ink/40 hover:text-blue-600 transition-all">
        <Eye size={13} /> Détails
      </button>
      <button onClick={() => openEditPurchase(p)}
        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold hover:bg-amber-50 text-ink/40 hover:text-amber-600 transition-all">
        <Edit2 size={13} /> Modifier
      </button>
      {p.status === 'debt' && (
        <button onClick={() => openPay(p)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold hover:bg-emerald-50 text-ink/40 hover:text-emerald-600 transition-all">
          <CreditCard size={13} /> Payer
        </button>
      )}
      <button onClick={() => { setSelectedPurchase(p); setModal('delete'); }}
        className="p-2 rounded-xl hover:bg-red-50 text-ink/30 hover:text-red-500 transition-all">
        <Trash2 size={13} />
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-serif font-bold text-ink tracking-tight flex items-center gap-3">
            <ShoppingCart className="text-accent" size={36} /> Achats Produits
          </h2>
          <p className="text-ink/40 mt-2 font-medium">Gérez vos achats auprès des fournisseurs</p>
        </div>
        <button
          onClick={() => { resetModal(); setShowPurchaseModal(true); }}
          className="btn-gradient flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus size={20} /> Nouvel Achat
        </button>
      </div>

      {/* ── Purchase History ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif font-bold text-2xl text-ink">
            Historique des achats
            {!isLoading && (
              <span className="ml-3 text-sm font-normal font-sans text-ink/40">({purchases.length})</span>
            )}
          </h3>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('cards')}
              className={cn('p-2.5 rounded-xl transition-all', viewMode === 'cards' ? 'bg-accent text-white' : 'bg-white/40 border border-border text-ink/40 hover:text-accent')}>
              <LayoutGrid size={18} />
            </button>
            <button onClick={() => setViewMode('table')}
              className={cn('p-2.5 rounded-xl transition-all', viewMode === 'table' ? 'bg-accent text-white' : 'bg-white/40 border border-border text-ink/40 hover:text-accent')}>
              <List size={18} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[220px] gap-3">
            <Loader2 className="animate-spin text-accent" size={28} />
            <span className="text-ink/40">Chargement...</span>
          </div>
        ) : purchases.length === 0 ? (
          <div className="card-premium p-14 text-center">
            <ShoppingCart className="text-ink/15 mx-auto mb-4" size={52} />
            <p className="text-ink/50 text-lg font-semibold mb-1">Aucun achat enregistré</p>
            <p className="text-ink/30 text-sm mb-6">Commencez par créer votre premier achat fournisseur</p>
            <button onClick={() => { resetModal(); setShowPurchaseModal(true); }}
              className="btn-gradient flex items-center gap-2 mx-auto">
              <Plus size={18} /> Créer un achat
            </button>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {purchases.map((p, i) => (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="card-premium p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-ink">{p.supplierName}</p>
                    <p className="text-xs text-ink/40 mt-0.5">{new Date(p.date).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <span className={cn('px-3 py-1 rounded-full text-xs font-bold',
                    p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                    {p.status === 'paid' ? 'Payé' : 'Dette'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="p-3 rounded-xl bg-primary-bg/60">
                    <p className="text-ink/40 text-xs">Articles</p>
                    <p className="font-bold text-ink">{p.itemCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-primary-bg/60">
                    <p className="text-ink/40 text-xs">Total</p>
                    <p className="font-bold text-accent">{formatCurrency(p.totalCost)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50">
                    <p className="text-ink/40 text-xs">Payé</p>
                    <p className="font-bold text-emerald-600">{formatCurrency(p.paidAmount)}</p>
                  </div>
                  <div className={cn('p-3 rounded-xl', p.status === 'debt' ? 'bg-red-50' : 'bg-emerald-50')}>
                    <p className="text-ink/40 text-xs">Reste</p>
                    <p className={cn('font-bold', p.status === 'debt' ? 'text-red-500' : 'text-emerald-600')}>
                      {formatCurrency(Math.max(0, p.totalCost - p.paidAmount))}
                    </p>
                  </div>
                </div>
                <PurchaseActions p={p} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="card-premium overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-primary-bg/50">
                  <tr>
                    {['Date', 'Fournisseur', 'Articles', 'Total', 'Payé', 'Reste', 'Statut', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-ink/40 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchases.map(p => (
                    <tr key={p.id} className="hover:bg-primary-bg/20 transition-colors">
                      <td className="px-4 py-3">{new Date(p.date).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3 font-medium">{p.supplierName}</td>
                      <td className="px-4 py-3">{p.itemCount}</td>
                      <td className="px-4 py-3 font-bold text-accent">{formatCurrency(p.totalCost)}</td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">{formatCurrency(p.paidAmount)}</td>
                      <td className={cn('px-4 py-3 font-medium', p.status === 'debt' ? 'text-red-500' : 'text-emerald-600')}>
                        {formatCurrency(Math.max(0, p.totalCost - p.paidAmount))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold',
                          p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                          {p.status === 'paid' ? 'Payé' : 'Dette'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openDetails(p)} title="Détails"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-ink/30 hover:text-blue-600 transition-all"><Eye size={14} /></button>
                          <button onClick={() => openEditPurchase(p)} title="Modifier"
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-ink/30 hover:text-amber-600 transition-all"><Edit2 size={14} /></button>
                          {p.status === 'debt' && (
                            <button onClick={() => openPay(p)} title="Payer"
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-ink/30 hover:text-emerald-600 transition-all"><CreditCard size={14} /></button>
                          )}
                          <button onClick={() => { setSelectedPurchase(p); setModal('delete'); }} title="Supprimer"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-ink/30 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          NEW / EDIT PURCHASE SLIDE PANEL
      ════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showPurchaseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowPurchaseModal(false); resetModal(); }}
              className="absolute inset-0 bg-ink/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Modal header */}
              <div className="p-6 md:p-8 border-b border-border/50 flex items-center justify-between bg-primary-bg/30 flex-shrink-0">
                <div>
                  <h3 className="text-xl font-serif font-bold text-ink">
                    {editingPurchaseId ? "Modifier l'achat" : 'Nouvel Achat'}
                  </h3>
                  <p className="text-xs text-ink/40 mt-0.5">
                    {cart.length} produit{cart.length !== 1 ? 's' : ''} · Total: {formatCurrency(totalCart)}
                  </p>
                </div>
                <button onClick={() => { setShowPurchaseModal(false); resetModal(); }}
                  className="p-2 rounded-xl hover:bg-primary-bg text-ink/40 hover:text-ink transition-all">
                  <X size={22} />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-7">

                {/* ─── Product Search ─── */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-ink/40">Ajouter un produit</h4>
                  <div className="relative" ref={dropdownRef}>
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30 pointer-events-none" size={17} />
                    {isSearching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-accent animate-spin" size={15} />}
                    <input
                      type="text" value={productQuery}
                      onChange={e => handleProductSearch(e.target.value)}
                      onFocus={() => productResults.length > 0 && setShowDropdown(true)}
                      className="input-premium w-full pl-11"
                      placeholder="Rechercher par nom ou code-barres..."
                    />
                    <AnimatePresence>
                      {showDropdown && productResults.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                          className="absolute top-full mt-2 left-0 right-0 bg-white border border-border rounded-2xl shadow-2xl z-30 overflow-hidden">
                          {productResults.map(p => (
                            <button key={p.id} onClick={() => selectProduct(p)}
                              className="w-full px-4 py-3 text-left hover:bg-accent/5 border-b border-border/40 last:border-0 flex items-center justify-between gap-4 transition-colors">
                              <div>
                                <p className="font-bold text-sm text-ink">{p.name}</p>
                                {p.barcode && <p className="text-xs text-ink/40 font-mono mt-0.5">{p.barcode}</p>}
                              </div>
                              <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                                p.currentStock > (p.min_stock || 5) ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                                Stock: {p.currentStock}
                              </span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ─── Item Form ─── */}
                  <AnimatePresence>
                    {selectedProduct && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden">
                        <div className="p-5 rounded-2xl bg-accent/5 border border-accent/20 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-accent text-base">{selectedProduct.name}</p>
                              {selectedProduct.barcode && (
                                <p className="text-xs text-ink/40 font-mono mt-0.5">{selectedProduct.barcode}</p>
                              )}
                            </div>
                            <span className="text-xs bg-white border border-border px-2.5 py-1 rounded-lg text-ink/50 flex-shrink-0">
                              Stock: {selectedProduct.currentStock} u
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Quantité achetée *</label>
                              <input type="number" min={1} value={itemForm.qty}
                                onChange={e => setItemForm(f => ({ ...f, qty: Number(e.target.value) }))}
                                className="input-premium w-full" />
                            </div>
                            <div>
                              <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Prix achat / u (DA) *</label>
                              <input type="number" min={0} value={itemForm.priceBuy}
                                onChange={e => setItemForm(f => ({ ...f, priceBuy: Number(e.target.value) }))}
                                className="input-premium w-full" />
                            </div>
                            <div>
                              <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Prix vente / u (DA) *</label>
                              <input type="number" min={0} value={itemForm.priceSell}
                                onChange={e => setItemForm(f => ({ ...f, priceSell: Number(e.target.value) }))}
                                className="input-premium w-full" />
                            </div>
                            <div>
                              <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Stock min. alerte</label>
                              <input type="number" min={0} value={itemForm.minStock}
                                onChange={e => setItemForm(f => ({ ...f, minStock: Number(e.target.value) }))}
                                className="input-premium w-full" />
                            </div>
                          </div>

                          {/* Sell by detail toggle */}
                          <div className="p-4 rounded-xl bg-white/70 border border-border/60 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-sm text-ink">Vendre en détail</p>
                                <p className="text-xs text-ink/40 mt-0.5">Ex: vendre 10 ml depuis un flacon de 50 ml</p>
                              </div>
                              <button
                                onClick={() => setItemForm(f => ({ ...f, sellByDetail: !f.sellByDetail }))}
                                className={cn('relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0',
                                  itemForm.sellByDetail ? 'bg-accent' : 'bg-ink/20')}>
                                <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300',
                                  itemForm.sellByDetail ? 'left-6' : 'left-1')} />
                              </button>
                            </div>
                            <AnimatePresence>
                              {itemForm.sellByDetail && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden">
                                  <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">
                                    Quantité dans une unité complète
                                  </label>
                                  <input type="number" min={1} value={itemForm.detailUnitQty}
                                    onChange={e => setItemForm(f => ({ ...f, detailUnitQty: Number(e.target.value) }))}
                                    className="input-premium w-full"
                                    placeholder="Ex: 50 pour un flacon de 50 ml" />
                                  <p className="text-xs text-ink/30 mt-1.5">
                                    Chaque unité contiendra {itemForm.detailUnitQty} unité{itemForm.detailUnitQty !== 1 ? 's' : ''} de détail
                                  </p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Item subtotal preview */}
                          {itemForm.priceBuy > 0 && (
                            <div className="flex justify-between items-center text-sm px-1">
                              <span className="text-ink/40">Sous-total cet article</span>
                              <span className="font-bold text-ink">{formatCurrency(itemForm.qty * itemForm.priceBuy)}</span>
                            </div>
                          )}

                          <div className="flex gap-3 pt-1">
                            <button onClick={resetProductForm}
                              className="px-4 py-2.5 rounded-2xl border border-border text-ink/60 font-medium hover:bg-white/60 transition-all">
                              Annuler
                            </button>
                            <button onClick={addToCart}
                              disabled={!selectedProduct || itemForm.qty <= 0 || itemForm.priceBuy <= 0}
                              className="btn-gradient flex items-center gap-2 disabled:opacity-50">
                              <Plus size={17} />
                              {cart.some(i => i.productId === selectedProduct?.id) ? 'Mettre à jour' : 'Ajouter au panier'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

                {/* ─── Cart ─── */}
                {cart.length > 0 && (
                  <section className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-ink/40">
                      Panier · {cart.length} article{cart.length > 1 ? 's' : ''}
                    </h4>
                    <div className="rounded-2xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-primary-bg/60">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-bold text-ink/40">Produit</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">Qté</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">Achat</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">Vente</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">S-Total</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {cart.map(item => (
                            <tr key={item.productId} className="hover:bg-primary-bg/30 group">
                              <td className="px-4 py-3">
                                <p className="font-medium text-ink leading-tight">{item.productName}</p>
                                {item.sellByDetail && (
                                  <p className="text-xs text-accent/70 mt-0.5 flex items-center gap-1">
                                    <Layers size={10} /> Détail · {item.detailUnitQty} u/unité
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-medium">{item.quantityBought}</td>
                              <td className="px-4 py-3 text-right text-ink/70">{formatCurrency(item.priceBuy)}</td>
                              <td className="px-4 py-3 text-right text-accent font-medium">{formatCurrency(item.priceSell)}</td>
                              <td className="px-4 py-3 text-right font-bold">{formatCurrency(item.quantityBought * item.priceBuy)}</td>
                              <td className="pr-3">
                                <button
                                  onClick={() => setCart(prev => prev.filter(i => i.productId !== item.productId))}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-ink/20 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-border bg-primary-bg/40">
                          <tr>
                            <td colSpan={4} className="px-4 py-3 text-sm font-bold text-ink/50">Total commande</td>
                            <td className="px-4 py-3 text-right font-bold text-lg text-accent">{formatCurrency(totalCart)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                )}

                {/* ─── Order info + Payment ─── */}
                {cart.length > 0 && (
                  <section className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-ink/40">Informations commande</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Fournisseur</label>
                        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input-premium w-full">
                          <option value="">— Aucun fournisseur —</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Date de l'achat</label>
                        <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="input-premium w-full" />
                      </div>
                    </div>

                    {/* Payment block */}
                    <div className="p-5 rounded-2xl bg-ink text-white space-y-4">
                      <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Paiement</p>
                      <div className="flex justify-between items-center">
                        <span className="text-white/60 text-sm">Total commande</span>
                        <span className="font-bold text-xl">{formatCurrency(totalCart)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-3">
                        <span className="text-white/60 text-sm">Versement</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0} max={totalCart} value={versement}
                            onChange={e => { setVersement(Number(e.target.value)); setVersementEdited(true); }}
                            className="w-36 px-3 py-2 rounded-xl bg-white/10 text-white text-right border border-white/20 focus:outline-none focus:border-white/50 transition-all"
                          />
                          <button
                            onClick={() => { setVersement(totalCart); setVersementEdited(false); }}
                            className="text-xs bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg text-white/60 transition-all"
                            title="Payer en totalité">
                            Tout
                          </button>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                        <span className="text-white/60 text-sm">Reste à payer</span>
                        <div className="text-right">
                          <span className={cn('text-2xl font-bold', reste <= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {formatCurrency(Math.max(0, reste))}
                          </span>
                          <span className={cn('block text-xs font-semibold mt-0.5', reste <= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {reste <= 0 ? '✓ Payé intégralement' : '⚠ Sera enregistré comme dette'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {/* Modal footer */}
              <div className="p-6 md:p-8 border-t border-border/50 bg-primary-bg/30 flex gap-4 flex-shrink-0">
                <button onClick={() => { setShowPurchaseModal(false); resetModal(); }}
                  className="flex-1 py-4 rounded-2xl bg-primary-bg text-ink/60 font-bold hover:bg-border/50 transition-all">
                  Annuler
                </button>
                <button onClick={savePurchase} disabled={isSaving || cart.length === 0}
                  className="flex-[2] py-4 rounded-2xl bg-accent text-white font-bold shadow-lg shadow-accent/20 hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {editingPurchaseId ? "Mettre à jour" : "Enregistrer l'achat"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>

        {/* ── Details Modal ── */}
        {modal === 'details' && selectedPurchase && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-8 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-ink">
                      {selectedPurchase.suppliers?.full_name || 'Sans fournisseur'}
                    </h3>
                    <p className="text-ink/40 text-sm mt-1">
                      {new Date(selectedPurchase.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={cn('px-3 py-1.5 rounded-full text-xs font-bold',
                      parseFloat(selectedPurchase.paid_amount) >= parseFloat(selectedPurchase.total_cost)
                        ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                      {parseFloat(selectedPurchase.paid_amount) >= parseFloat(selectedPurchase.total_cost) ? 'Payé' : 'Dette'}
                    </span>
                    <button onClick={() => setModal(null)}
                      className="p-2 rounded-xl hover:bg-primary-bg text-ink/40 transition-all"><X size={20} /></button>
                  </div>
                </div>

                {selectedPurchase.product_purchase_items?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-3">Produits commandés</h4>
                    <div className="rounded-2xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-primary-bg/50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-bold text-ink/40">Produit</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">Qté</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">P. Achat</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">P. Vente</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">Sous-total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {selectedPurchase.product_purchase_items.map((item: any) => (
                            <tr key={item.id} className="hover:bg-primary-bg/20">
                              <td className="px-4 py-2.5">
                                <p className="font-medium">{item.products?.name || '—'}</p>
                                {item.sell_by_detail && (
                                  <p className="text-xs text-accent/60 mt-0.5">Détail · {item.detail_unit_qty} u/unité</p>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">{item.quantity_bought}</td>
                              <td className="px-4 py-2.5 text-right">{formatCurrency(item.price_buy)}</td>
                              <td className="px-4 py-2.5 text-right text-accent font-bold">{formatCurrency(item.price_sell)}</td>
                              <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(item.quantity_bought * item.price_buy)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-primary-bg/60 text-center">
                    <p className="text-xs text-ink/40 mb-1">Total</p>
                    <p className="font-bold text-accent">{formatCurrency(selectedPurchase.total_cost)}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-50 text-center">
                    <p className="text-xs text-ink/40 mb-1">Payé</p>
                    <p className="font-bold text-emerald-600">{formatCurrency(selectedPurchase.paid_amount)}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-red-50 text-center">
                    <p className="text-xs text-ink/40 mb-1">Reste</p>
                    <p className="font-bold text-red-500">{formatCurrency(Math.max(0, selectedPurchase.total_cost - selectedPurchase.paid_amount))}</p>
                  </div>
                </div>

                {selectedPurchase.purchase_payments?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-3">Historique des paiements</h4>
                    <div className="space-y-2">
                      {selectedPurchase.purchase_payments.map((pay: any, idx: number) => (
                        <div key={pay.id} className="flex justify-between items-center p-3 rounded-xl bg-primary-bg/40">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-sm text-ink/50">{new Date(pay.date).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <span className="font-bold text-emerald-600">{formatCurrency(pay.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Pay Debt Modal ── */}
        {modal === 'pay' && selectedPurchase && (() => {
          const totalDebt = parseFloat(selectedPurchase.total_cost) || 0;
          const alreadyPaid = parseFloat(selectedPurchase.paid_amount) || 0;
          const currentRest = Math.max(0, totalDebt - alreadyPaid);
          const newRest = Math.max(0, currentRest - payAmount);
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 12 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-ink">Payer la dette</h3>
                    <p className="text-sm text-ink/40 mt-0.5">
                      {selectedPurchase.suppliers?.full_name || 'Sans fournisseur'}
                    </p>
                  </div>
                  <button onClick={() => setModal(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/40"><X size={20} /></button>
                </div>

                <div className="space-y-2 p-4 rounded-2xl bg-primary-bg/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-ink/40">Total commande</span>
                    <span className="font-bold">{formatCurrency(totalDebt)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink/40">Déjà payé</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(alreadyPaid)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                    <span className="text-ink/40">Reste actuel</span>
                    <span className="font-bold text-red-500">{formatCurrency(currentRest)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-ink/40 block">Montant à verser maintenant</label>
                  <div className="flex gap-2">
                    <input type="number" min={0} max={currentRest} value={payAmount}
                      onChange={e => setPayAmount(Number(e.target.value))}
                      className="input-premium flex-1" />
                    <button onClick={() => setPayAmount(currentRest)}
                      className="px-3 py-2 rounded-xl border border-border text-xs font-bold hover:bg-primary-bg text-ink/60 transition-all">
                      Tout
                    </button>
                  </div>
                  <div className={cn('flex justify-between items-center p-3 rounded-xl text-sm',
                    newRest === 0 ? 'bg-emerald-50' : 'bg-amber-50/60')}>
                    <span className="text-ink/40">Nouveau reste après paiement</span>
                    <span className={cn('font-bold', newRest === 0 ? 'text-emerald-600' : 'text-amber-600')}>
                      {formatCurrency(newRest)}
                    </span>
                  </div>
                </div>

                {selectedPurchase.purchase_payments?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Paiements précédents</p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {selectedPurchase.purchase_payments.map((pay: any, idx: number) => (
                        <div key={pay.id} className="flex justify-between items-center p-2.5 rounded-xl bg-primary-bg/40 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-ink/40">{new Date(pay.date).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <span className="font-bold text-emerald-600">{formatCurrency(pay.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setModal(null)}
                    className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-ink/60 font-medium">
                    Annuler
                  </button>
                  <button onClick={savePayment} disabled={payAmount <= 0}
                    className="flex-1 btn-gradient py-2.5 disabled:opacity-50 flex items-center justify-center gap-2">
                    <Check size={16} /> Confirmer le paiement
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}

        {/* ── Delete Modal ── */}
        {modal === 'delete' && selectedPurchase && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 12 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold text-ink mb-1">Supprimer cet achat ?</h3>
                <p className="text-ink/40 text-sm">Cette action est irréversible. L'historique des paiements sera également supprimé.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModal(null)}
                  className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-ink/60 font-medium">
                  Annuler
                </button>
                <button onClick={deletePurchase}
                  className="flex-1 py-2.5 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all">
                  Supprimer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};

export default ProductPurchases;
