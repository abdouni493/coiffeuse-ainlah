import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag, Plus, Search, Trash2, Eye, CreditCard, X, Check,
  Loader2, User, Phone, Barcode, Printer, AlertCircle
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { StoreConfig } from '../types';

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  isDetail: boolean;
  detailQtyUsed?: number;
  detailUnit?: string;
}

interface SaleRecord {
  id: string;
  clientName: string;
  clientPhone?: string;
  date: string;
  totalAmount: number;
  paidAmount: number;
  status: 'paid' | 'debt';
  invoiceNumber?: string;
  itemCount: number;
}

interface SalesProps {
  config: StoreConfig;
}

const Sales: React.FC<SalesProps> = ({ config }) => {
  // Product search
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [showProductDrop, setShowProductDrop] = useState(false);
  const [barcodeScanMode, setBarcodeScanMode] = useState(false);
  const [detailModal, setDetailModal] = useState<any | null>(null);
  const [detailQty, setDetailQty] = useState(0);
  const [detailPrice, setDetailPrice] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const productDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Client
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<any[]>([]);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id?: string; name: string; phone?: string } | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const clientDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Payment
  const [received, setReceived] = useState(0);

  // Sales history
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'paid' | 'debt'>('all');
  const [modal, setModal] = useState<'invoice' | 'details' | 'pay' | 'delete' | null>(null);
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [savedSaleId, setSavedSaleId] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const totalCart = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const changeDue = received - totalCart;

  const fetchSales = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('product_sales')
      .select('id, client_name, client_phone, date, total_amount, paid_amount, invoice_number, sale_items(id)')
      .order('date', { ascending: false })
      .limit(200);
    setSales((data || []).map((s: any) => ({
      id: s.id,
      clientName: s.client_name,
      clientPhone: s.client_phone,
      date: s.date,
      totalAmount: parseFloat(s.total_amount) || 0,
      paidAmount: parseFloat(s.paid_amount) || 0,
      status: parseFloat(s.paid_amount) >= parseFloat(s.total_amount) ? 'paid' : 'debt',
      invoiceNumber: s.invoice_number,
      itemCount: s.sale_items?.length || 0,
    })));
    setIsLoading(false);
  };

  useEffect(() => { fetchSales(); }, []);

  // Auto-fill received = total
  useEffect(() => { setReceived(totalCart); }, [totalCart]);

  // Auto-focus in scan mode
  useEffect(() => {
    if (barcodeScanMode && searchRef.current) searchRef.current.focus();
  }, [barcodeScanMode]);

  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) { setProductResults([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, name, barcode, sell_by_detail, detail_unit_qty, detail_unit, min_stock')
      .or(`name.ilike.%${q}%,barcode.ilike.%${q}%`)
      .limit(10);

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
    setProductResults(results.filter(r => r.sell_by_detail ? r.currentDetailStock > 0 : r.currentStock > 0));
  }, []);

  const handleProductSearch = (q: string) => {
    setProductQuery(q);
    setShowProductDrop(true);
    if (productDebounce.current) clearTimeout(productDebounce.current);
    productDebounce.current = setTimeout(() => searchProducts(q), 300);
  };

  const selectProduct = (p: any) => {
    if (p.sell_by_detail) {
      setDetailModal(p);
      setDetailQty(0);
      const unitPrice = (p.priceSell / (p.detail_unit_qty || 1));
      setDetailPrice(unitPrice);
    } else {
      addToCart({ productId: p.id, productName: p.name, quantity: 1, unitPrice: p.priceSell, isDetail: false });
    }
    setProductQuery('');
    setShowProductDrop(false);
    if (barcodeScanMode && searchRef.current) setTimeout(() => searchRef.current?.focus(), 100);
  };

  const addDetailToCart = () => {
    if (!detailModal || detailQty <= 0) return;
    const price = detailPrice * detailQty;
    addToCart({ productId: detailModal.id, productName: detailModal.name, quantity: detailQty, unitPrice: detailPrice, isDetail: true, detailQtyUsed: detailQty, detailUnit: detailModal.detail_unit });
    setDetailModal(null);
  };

  const addToCart = (item: CartItem) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === item.productId && i.isDetail === item.isDetail);
      if (idx >= 0 && !item.isDetail) {
        return prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, item];
    });
  };

  const searchClients = useCallback(async (q: string) => {
    if (!q.trim()) { setClientResults([]); return; }
    const { data } = await supabase.from('clients').select('id, name, phone').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setClientResults(data || []);
  }, []);

  const handleClientSearch = (q: string) => {
    setClientQuery(q);
    setShowClientDrop(true);
    if (clientDebounce.current) clearTimeout(clientDebounce.current);
    clientDebounce.current = setTimeout(() => searchClients(q), 300);
  };

  const createClient = async () => {
    if (!newClientName.trim()) return;
    const { data } = await supabase.from('clients').insert([{ name: newClientName.trim(), phone: newClientPhone.trim() || null }]).select().single();
    if (data) {
      setSelectedClient({ id: data.id, name: data.name, phone: data.phone });
      setShowNewClientForm(false); setNewClientName(''); setNewClientPhone('');
    }
  };

  const generateInvoiceNumber = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `VENTE-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
  };

  const validateSale = async () => {
    if (cart.length === 0) return;
    setIsSaving(true);
    const invoiceNum = generateInvoiceNumber();
    const clientName = selectedClient?.name || 'Client passager';
    try {
      const { data: saleData, error } = await supabase
        .from('product_sales')
        .insert([{
          client_id: selectedClient?.id || null,
          client_name: clientName,
          client_phone: selectedClient?.phone || null,
          date: new Date().toISOString().split('T')[0],
          total_amount: totalCart,
          paid_amount: Math.min(received, totalCart),
          invoice_number: invoiceNum,
        }])
        .select()
        .single();
      if (error || !saleData) throw error;

      await supabase.from('sale_items').insert(
        cart.map(i => ({
          sale_id: saleData.id,
          product_id: i.productId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          is_detail: i.isDetail,
          detail_qty_used: i.detailQtyUsed || null,
          detail_unit: i.detailUnit || null,
        }))
      );

      if (received > 0) {
        await supabase.from('sale_payments').insert([{ sale_id: saleData.id, amount: Math.min(received, totalCart), date: new Date().toISOString().split('T')[0] }]);
      }

      setSavedSaleId(saleData.id);
      setInvoiceData({
        invoiceNumber: invoiceNum,
        client: { name: clientName, phone: selectedClient?.phone },
        items: cart,
        total: totalCart,
        received,
        change: changeDue,
        date: new Date(),
        store: config,
      });
      setCart([]);
      setSelectedClient(null);
      setClientQuery('');
      setReceived(0);
      await fetchSales();
      setModal('invoice');
    } catch (err) {
      console.error('Error saving sale:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const openSaleDetails = async (sale: SaleRecord) => {
    const { data } = await supabase
      .from('product_sales')
      .select('*, sale_items(*, products(name)), sale_payments(*)')
      .eq('id', sale.id)
      .single();
    setSelectedSale(data);
    setModal('details');
  };

  const openPay = async (sale: SaleRecord) => {
    const { data } = await supabase.from('product_sales').select('*, sale_payments(*)').eq('id', sale.id).single();
    setSelectedSale(data);
    setPayAmount(Math.max(0, sale.totalAmount - sale.paidAmount));
    setModal('pay');
  };

  const saveSalePayment = async () => {
    if (!selectedSale || payAmount <= 0) return;
    const newPaid = Math.min(selectedSale.total_amount, selectedSale.paid_amount + payAmount);
    await Promise.all([
      supabase.from('product_sales').update({ paid_amount: newPaid }).eq('id', selectedSale.id),
      supabase.from('sale_payments').insert([{ sale_id: selectedSale.id, amount: payAmount, date: new Date().toISOString().split('T')[0] }]),
    ]);
    await fetchSales();
    setModal(null);
  };

  const deleteSale = async () => {
    if (!selectedSale) return;
    await supabase.from('product_sales').delete().eq('id', selectedSale.id);
    await fetchSales();
    setModal(null);
  };

  const printInvoice = () => {
    if (!invoiceData) return;
    const items = invoiceData.items.map((i: CartItem) =>
      `<tr><td style="padding:6px 12px">${i.productName}${i.isDetail ? ` (${i.detailQtyUsed} ${i.detailUnit})` : ''}</td><td style="padding:6px 12px;text-align:center">${i.isDetail ? i.detailQtyUsed : i.quantity}</td><td style="padding:6px 12px;text-align:right">${formatCurrency(i.unitPrice)}</td><td style="padding:6px 12px;text-align:right;font-weight:bold">${formatCurrency(i.unitPrice * i.quantity)}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><title>Facture ${invoiceData.invoiceNumber}</title>
    <style>body{font-family:serif;max-width:600px;margin:40px auto;color:#1a1a1a}
    .header{text-align:center;border-bottom:2px solid #c8966c;padding-bottom:20px;margin-bottom:20px}
    .store-name{font-size:28px;font-weight:bold;color:#c8966c}
    .invoice-num{font-size:13px;color:#666;margin-top:6px}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th{background:#f5f5f5;padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
    td{border-bottom:1px solid #eee;font-size:14px}
    .total-row{font-size:18px;font-weight:bold;color:#c8966c}
    .footer{text-align:center;margin-top:30px;color:#999;font-size:12px}
    </style></head><body>
    <div class="header">
      <div class="store-name">${invoiceData.store.name}</div>
      <div>${invoiceData.store.slogan || ''}</div>
      <div style="font-size:12px;margin-top:4px;color:#666">${invoiceData.store.phone || ''} · ${invoiceData.store.location || ''}</div>
      <div class="invoice-num">N° ${invoiceData.invoiceNumber}</div>
      <div style="font-size:12px;color:#666">${invoiceData.date.toLocaleString('fr-FR')}</div>
    </div>
    <div style="margin-bottom:16px;font-size:14px">
      <strong>Client:</strong> ${invoiceData.client.name}${invoiceData.client.phone ? ` — ${invoiceData.client.phone}` : ''}
    </div>
    <table><thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">P. Unitaire</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${items}</tbody></table>
    <table><tbody>
      <tr class="total-row"><td style="padding:8px 12px">Total</td><td colspan="3" style="padding:8px 12px;text-align:right">${formatCurrency(invoiceData.total)}</td></tr>
      <tr><td style="padding:4px 12px;font-size:13px">Reçu</td><td colspan="3" style="padding:4px 12px;text-align:right;font-size:13px">${formatCurrency(invoiceData.received)}</td></tr>
      <tr><td style="padding:4px 12px;font-size:13px">${invoiceData.change >= 0 ? 'Monnaie rendue' : 'Reste à payer'}</td><td colspan="3" style="padding:4px 12px;text-align:right;font-size:13px;color:${invoiceData.change >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(Math.abs(invoiceData.change))}</td></tr>
    </tbody></table>
    <div class="footer">Merci pour votre visite — ${invoiceData.store.name}</div>
    <script>window.onload=()=>window.print()</script></body></html>`;
    const win = window.open('', '_blank', 'width=700,height=900');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const filteredSales = sales.filter(s => historyFilter === 'all' ? true : s.status === historyFilter);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-serif font-bold text-ink tracking-tight flex items-center gap-3">
          <ShoppingBag className="text-accent" size={36} /> Point de Vente
        </h2>
        <p className="text-ink/40 mt-2 font-medium">Enregistrez vos ventes de produits</p>
      </div>

      {/* POS Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left — product search */}
        <div className="flex-1 space-y-4">
          <div className="card-premium p-5 space-y-4">
            {/* Scan mode toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-ink">Mode scan code-barres</span>
              <button
                onClick={() => setBarcodeScanMode(!barcodeScanMode)}
                className={cn('relative w-12 h-6 rounded-full transition-all duration-300', barcodeScanMode ? 'bg-accent' : 'bg-ink/20')}
              >
                <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-surface shadow transition-all duration-300', barcodeScanMode ? 'left-7' : 'left-1')} />
              </button>
            </div>

            <div className="relative">
              {barcodeScanMode ? <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-accent/60" size={18} /> : <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" size={18} />}
              <input
                ref={searchRef}
                type="text"
                value={productQuery}
                onChange={e => handleProductSearch(e.target.value)}
                onFocus={() => setShowProductDrop(true)}
                className={cn('input-premium w-full pl-10', barcodeScanMode && 'border-accent')}
                placeholder={barcodeScanMode ? 'Scanner le code-barres...' : 'Rechercher un produit (nom ou barcode)...'}
              />
              <AnimatePresence>
                {showProductDrop && productResults.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="absolute top-full mt-2 left-0 right-0 bg-surface border border-border rounded-2xl shadow-xl z-30 overflow-hidden">
                    {productResults.map(p => (
                      <button key={p.id} onClick={() => selectProduct(p)}
                        className="w-full px-4 py-3 text-left hover:bg-accent/5 border-b border-border/50 last:border-0 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-bold text-sm text-ink">{p.name}</p>
                          <p className="text-xs text-ink/40">{p.sell_by_detail ? `${p.currentDetailStock} ${p.detail_unit} restants` : `${p.currentStock} unités`}</p>
                        </div>
                        <span className="text-sm font-bold text-accent">{formatCurrency(p.priceSell)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Cart table */}
          {cart.length > 0 && (
            <div className="card-premium overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-primary-bg/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-ink/40">Produit</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-ink/40">Qté</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">Prix u.</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-ink/40">Total</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cart.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2.5 font-medium">
                        {item.productName}
                        {item.isDetail && <span className="block text-xs text-ink/40">{item.detailQtyUsed} {item.detailUnit}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {!item.isDetail ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => setCart(prev => prev.map((i, n) => n === idx ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="w-6 h-6 rounded-full bg-ink/10 text-ink/60 hover:bg-accent hover:text-on-accent transition-all text-xs font-bold">−</button>
                            <span className="w-8 text-center font-bold">{item.quantity}</span>
                            <button onClick={() => setCart(prev => prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i))} className="w-6 h-6 rounded-full bg-ink/10 text-ink/60 hover:bg-accent hover:text-on-accent transition-all text-xs font-bold">+</button>
                          </div>
                        ) : <span className="font-bold">{item.detailQtyUsed}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-ink/60">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-accent">{formatCurrency(item.unitPrice * item.quantity)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setCart(prev => prev.filter((_, n) => n !== idx))} className="p-1.5 rounded-lg hover:bg-red-50 text-ink/30 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right — cart summary & payment */}
        <div className="lg:w-80 space-y-4">
          {/* Client selection */}
          <div className="card-premium p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-ink/40">Client</p>
            {selectedClient ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-accent/5 border border-accent/20">
                <div>
                  <p className="font-bold text-ink text-sm">{selectedClient.name}</p>
                  {selectedClient.phone && <p className="text-xs text-ink/40">{selectedClient.phone}</p>}
                </div>
                <button onClick={() => setSelectedClient(null)} className="p-1 rounded-lg hover:bg-red-50 text-ink/30 hover:text-red-500 transition-all"><X size={14} /></button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" size={16} />
                  <input type="text" value={clientQuery} onChange={e => handleClientSearch(e.target.value)} onFocus={() => setShowClientDrop(true)} className="input-premium w-full pl-9 py-2 text-sm" placeholder="Rechercher un client..." />
                  <AnimatePresence>
                    {showClientDrop && clientResults.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="absolute top-full mt-1 left-0 right-0 bg-surface border border-border rounded-2xl shadow-xl z-30 overflow-hidden">
                        {clientResults.map((c: any) => (
                          <button key={c.id} onClick={() => { setSelectedClient({ id: c.id, name: c.name, phone: c.phone }); setClientQuery(''); setShowClientDrop(false); }}
                            className="w-full px-3 py-2 text-left hover:bg-accent/5 border-b border-border/50 last:border-0 text-sm">
                            <p className="font-bold text-ink">{c.name}</p>
                            {c.phone && <p className="text-xs text-ink/40">{c.phone}</p>}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button onClick={() => setShowNewClientForm(!showNewClientForm)} className="text-xs text-accent font-bold hover:underline flex items-center gap-1"><Plus size={12} /> Nouveau client</button>
                {showNewClientForm && (
                  <div className="space-y-2 p-3 rounded-xl bg-primary-bg/40">
                    <input type="text" value={newClientName} onChange={e => setNewClientName(e.target.value)} className="input-premium w-full py-2 text-sm" placeholder="Nom *" />
                    <input type="text" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} className="input-premium w-full py-2 text-sm" placeholder="Téléphone" />
                    <button onClick={createClient} disabled={!newClientName.trim()} className="w-full py-1.5 rounded-xl bg-accent text-on-accent text-xs font-bold hover:bg-accent/90 transition-all disabled:opacity-50">Créer</button>
                  </div>
                )}
              </div>
            )}
            {!selectedClient && <p className="text-xs text-ink/30 italic">Aucun client → "Client passager"</p>}
          </div>

          {/* Payment summary */}
          <div className="card-premium p-5 space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-ink/40">Paiement</p>
            <p className="text-4xl font-serif font-bold text-accent">{formatCurrency(totalCart)}</p>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Montant reçu</label>
              <input type="number" min={0} value={received} onChange={e => setReceived(Number(e.target.value))} className="input-premium w-full" />
            </div>
            {totalCart > 0 && (
              <div className={cn('p-3 rounded-xl text-center', changeDue >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
                <p className="text-xs font-bold">{changeDue >= 0 ? 'Monnaie à rendre' : 'Reste à payer'}</p>
                <p className={cn('text-xl font-bold', changeDue >= 0 ? 'text-emerald-600' : 'text-red-500')}>{formatCurrency(Math.abs(changeDue))}</p>
              </div>
            )}
            <button onClick={validateSale} disabled={cart.length === 0 || isSaving} className="w-full btn-gradient shimmer py-3 flex items-center justify-center gap-2 disabled:opacity-40">
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Valider la vente
            </button>
          </div>
        </div>
      </div>

      {/* ─── Sales History ─── */}
      <div className="space-y-4">
        <h3 className="font-serif font-bold text-2xl text-ink">Historique des ventes</h3>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {(['all', 'paid', 'debt'] as const).map(f => (
            <button key={f} onClick={() => setHistoryFilter(f)} className={cn(
              'px-5 py-2 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all',
              historyFilter === f ? 'bg-accent text-on-accent' : 'bg-surface/40 border border-border text-ink/40 hover:text-accent hover:border-accent/40'
            )}>
              {f === 'all' ? 'Toutes' : f === 'paid' ? 'Payées' : 'Dettes'}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[200px] gap-3"><Loader2 className="animate-spin text-accent" size={28} /><span className="text-ink/40">Chargement...</span></div>
        ) : filteredSales.length === 0 ? (
          <div className="card-premium p-12 text-center"><ShoppingBag className="text-ink/20 mx-auto mb-4" size={40} /><p className="text-ink/40">Aucune vente</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredSales.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card-premium p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-ink">{s.clientName}</p>
                    <p className="text-xs text-ink/40">{new Date(s.date).toLocaleDateString('fr-FR')}</p>
                    {s.invoiceNumber && <p className="text-[10px] font-mono text-ink/30 mt-0.5">{s.invoiceNumber}</p>}
                  </div>
                  <span className={cn('px-3 py-1 rounded-full text-xs font-bold', s.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>{s.status === 'paid' ? 'Payé' : 'Dette'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-ink/40 text-xs">Produits</p><p className="font-bold">{s.itemCount}</p></div>
                  <div><p className="text-ink/40 text-xs">Total</p><p className="font-bold text-accent">{formatCurrency(s.totalAmount)}</p></div>
                  {s.status === 'debt' && <>
                    <div><p className="text-ink/40 text-xs">Payé</p><p className="font-bold text-emerald-600">{formatCurrency(s.paidAmount)}</p></div>
                    <div><p className="text-ink/40 text-xs">Reste</p><p className="font-bold text-red-500">{formatCurrency(s.totalAmount - s.paidAmount)}</p></div>
                  </>}
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  <button onClick={() => openSaleDetails(s)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold hover:bg-blue-50 text-ink/40 hover:text-blue-600 transition-all"><Eye size={14} /> Détails</button>
                  {s.status === 'debt' && <button onClick={() => openPay(s)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold hover:bg-emerald-50 text-ink/40 hover:text-emerald-600 transition-all"><CreditCard size={14} /> Payer</button>}
                  <button onClick={() => { setSelectedSale(s); setModal('delete'); }} className="p-2 rounded-xl hover:bg-red-50 text-ink/30 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      <AnimatePresence>
        {/* Detail qty modal */}
        {detailModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5">
              <h3 className="text-xl font-serif font-bold text-ink">{detailModal.name}</h3>
              <p className="text-sm text-ink/50">Stock disponible: <strong className="text-emerald-600">{detailModal.currentDetailStock} {detailModal.detail_unit}</strong></p>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Quantité à vendre ({detailModal.detail_unit})</label>
                <input type="number" min={0} max={detailModal.currentDetailStock} value={detailQty} onChange={e => { const v = Number(e.target.value); setDetailQty(v); setDetailPrice((detailModal.priceSell / (detailModal.detail_unit_qty || 1))); }} className="input-premium w-full" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Prix ({detailModal.detail_unit})</label>
                <input type="number" min={0} value={detailPrice} onChange={e => setDetailPrice(Number(e.target.value))} className="input-premium w-full" />
                <p className="text-xs text-accent font-bold mt-1">Total: {formatCurrency(detailPrice * detailQty)}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDetailModal(null)} className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-ink/60 font-medium">Annuler</button>
                <button onClick={addDetailToCart} disabled={detailQty <= 0} className="flex-1 btn-gradient py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"><Plus size={16} /> Ajouter</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Invoice modal */}
        {modal === 'invoice' && invoiceData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-5">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3"><Check className="text-emerald-600" size={28} /></div>
                <h3 className="text-xl font-serif font-bold text-ink">Vente enregistrée !</h3>
                <p className="text-ink/40 text-sm font-mono mt-1">{invoiceData.invoiceNumber}</p>
              </div>
              <div className="p-4 rounded-2xl bg-primary-bg/40 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink/50">Client</span><span className="font-bold">{invoiceData.client.name}</span></div>
                <div className="flex justify-between"><span className="text-ink/50">Total</span><span className="font-bold text-accent">{formatCurrency(invoiceData.total)}</span></div>
                <div className="flex justify-between"><span className="text-ink/50">Reçu</span><span className="font-bold text-emerald-600">{formatCurrency(invoiceData.received)}</span></div>
                {invoiceData.change !== 0 && <div className="flex justify-between"><span className="text-ink/50">{invoiceData.change >= 0 ? 'Monnaie' : 'Reste'}</span><span className={cn('font-bold', invoiceData.change >= 0 ? 'text-emerald-600' : 'text-red-500')}>{formatCurrency(Math.abs(invoiceData.change))}</span></div>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-ink/60 font-medium">Fermer</button>
                <button onClick={() => { printInvoice(); setModal(null); }} className="flex-1 btn-gradient py-2.5 flex items-center justify-center gap-2"><Printer size={16} /> Imprimer</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Details modal */}
        {modal === 'details' && selectedSale && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-8 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-ink">{selectedSale.client_name}</h3>
                    <p className="text-ink/40 text-sm">{new Date(selectedSale.date).toLocaleDateString('fr-FR')}</p>
                    {selectedSale.invoice_number && <p className="text-xs font-mono text-ink/30">{selectedSale.invoice_number}</p>}
                  </div>
                  <button onClick={() => setModal(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/40"><X size={20} /></button>
                </div>
                {selectedSale.sale_items?.length > 0 && (
                  <div className="rounded-2xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-primary-bg/50"><tr>
                        <th className="px-4 py-2 text-left text-xs font-bold text-ink/40">Produit</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-ink/40">Qté</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-ink/40">P. Unit.</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-ink/40">Total</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border">
                        {selectedSale.sale_items.map((item: any) => (
                          <tr key={item.id}>
                            <td className="px-4 py-2 font-medium">{item.products?.name}{item.is_detail && <span className="block text-xs text-ink/40">{item.detail_qty_used} {item.detail_unit}</span>}</td>
                            <td className="px-4 py-2 text-right">{item.is_detail ? item.detail_qty_used : item.quantity}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="px-4 py-2 text-right font-bold text-accent">{formatCurrency(item.unit_price * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-primary-bg/50 text-center"><p className="text-xs text-ink/40">Total</p><p className="font-bold text-accent">{formatCurrency(selectedSale.total_amount)}</p></div>
                  <div className="p-4 rounded-2xl bg-emerald-50 text-center"><p className="text-xs text-ink/40">Payé</p><p className="font-bold text-emerald-600">{formatCurrency(selectedSale.paid_amount)}</p></div>
                  <div className="p-4 rounded-2xl bg-red-50 text-center"><p className="text-xs text-ink/40">Reste</p><p className="font-bold text-red-500">{formatCurrency(Math.max(0, selectedSale.total_amount - selectedSale.paid_amount))}</p></div>
                </div>
                {selectedSale.sale_payments?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Paiements</p>
                    <div className="space-y-1">
                      {selectedSale.sale_payments.map((pay: any) => (
                        <div key={pay.id} className="flex justify-between text-sm p-2 rounded-lg bg-primary-bg/30">
                          <span className="text-ink/40">{new Date(pay.date).toLocaleDateString('fr-FR')}</span>
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

        {/* Pay debt modal */}
        {modal === 'pay' && selectedSale && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-serif font-bold text-ink">Payer la dette</h3>
                <button onClick={() => setModal(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/40"><X size={20} /></button>
              </div>
              <div className="space-y-3 p-4 rounded-2xl bg-primary-bg/40">
                <div className="flex justify-between text-sm"><span className="text-ink/40">Total vente</span><span className="font-bold">{formatCurrency(selectedSale.total_amount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-ink/40">Déjà payé</span><span className="font-bold text-emerald-600">{formatCurrency(selectedSale.paid_amount)}</span></div>
                <div className="flex justify-between text-sm border-t border-border pt-2"><span className="text-ink/40">Reste</span><span className="font-bold text-red-500">{formatCurrency(Math.max(0, selectedSale.total_amount - selectedSale.paid_amount))}</span></div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Montant à payer</label>
                <input type="number" min={0} value={payAmount} onChange={e => setPayAmount(Number(e.target.value))} className="input-premium w-full" />
                <p className="text-xs text-ink/40 mt-1">Nouveau reste: {formatCurrency(Math.max(0, selectedSale.total_amount - selectedSale.paid_amount - payAmount))}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-ink/60 font-medium">Annuler</button>
                <button onClick={saveSalePayment} disabled={payAmount <= 0} className="flex-1 btn-gradient py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"><Check size={16} /> Confirmer</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {modal === 'delete' && selectedSale && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto"><Trash2 className="text-red-500" size={24} /></div>
              <div>
                <h3 className="text-xl font-serif font-bold text-ink mb-1">Supprimer cette vente ?</h3>
                <p className="text-ink/40 text-sm">Cette action est irréversible.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-ink/60 font-medium">Annuler</button>
                <button onClick={deleteSale} className="flex-1 py-2.5 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all">Supprimer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Sales;
