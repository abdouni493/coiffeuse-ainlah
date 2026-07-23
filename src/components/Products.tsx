import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Plus, Search, Edit2, Trash2, Eye, X, Check, Barcode,
  Printer, AlertCircle, ChevronDown, Loader2
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Product, ProductCategory, ProductBrand } from '../types';

// ─── Barcode SVG renderer ──────────────────────────────────────────────────
function renderBarcodeSVG(code: string, width = 200, height = 60): string {
  const EAN13_PATTERN: Record<string, string[]> = {
    L: ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'],
    G: ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'],
    R: ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'],
  };
  const PARITIES = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  if (code.length !== 13) return '';
  const digits = code.split('').map(Number);
  const firstDigit = digits[0];
  const parity = PARITIES[firstDigit];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += EAN13_PATTERN[parity[i]][digits[i + 1]];
  bits += '01010';
  for (let i = 7; i < 13; i++) bits += EAN13_PATTERN['R'][digits[i]];
  bits += '101';
  const barWidth = width / bits.length;
  let rects = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      rects += `<rect x="${(i * barWidth).toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="black"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;
}

function generateEAN13(): string {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  let sum = 0;
  digits.forEach((d, i) => { sum += i % 2 === 0 ? d : d * 3; });
  const check = (10 - (sum % 10)) % 10;
  return [...digits, check].join('');
}

// ─── Stock calculation helper ──────────────────────────────────────────────
async function calcStock(productId: string): Promise<{ units: number; detail: number }> {
  const [{ data: purchased }, { data: sold }, { data: usedInRes }] = await Promise.all([
    supabase.from('product_purchase_items').select('quantity_bought, sell_by_detail, detail_unit_qty').eq('product_id', productId),
    supabase.from('sale_items').select('quantity, is_detail, detail_qty_used').eq('product_id', productId),
    supabase.from('reservation_products').select('quantity, is_detail, detail_qty_used').eq('product_id', productId),
  ]);
  let units = 0;
  let detailMl = 0;
  (purchased || []).forEach((p: any) => {
    if (p.sell_by_detail && p.detail_unit_qty) detailMl += p.quantity_bought * p.detail_unit_qty;
    else units += p.quantity_bought;
  });
  (sold || []).forEach((s: any) => {
    if (s.is_detail) detailMl -= s.detail_qty_used || 0;
    else units -= s.quantity;
  });
  (usedInRes || []).forEach((r: any) => {
    if (r.is_detail) detailMl -= r.detail_qty_used || 0;
    else units -= r.quantity;
  });
  return { units, detail: detailMl };
}

// ─── Main Component ────────────────────────────────────────────────────────
const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | 'details' | 'delete' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // form state
  const [form, setForm] = useState({
    name: '', description: '', barcode: '', categoryId: '', brandId: '',
    sellByDetail: false, detailUnitQty: 500, detailUnit: 'ml', minStock: 5,
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [showNewBrand, setShowNewBrand] = useState(false);

  // purchase history for details modal
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);

  const fetchAll = async () => {
    setIsLoading(true);
    const [{ data: pData }, { data: cData }, { data: bData }] = await Promise.all([
      supabase.from('products').select(`*, product_categories(name), product_brands(name)`).order('created_at', { ascending: false }),
      supabase.from('product_categories').select('*').order('name'),
      supabase.from('product_brands').select('*').order('name'),
    ]);

    const rawProducts = pData || [];
    // Fetch latest price from purchases
    const { data: lastPrices } = await supabase
      .from('product_purchase_items')
      .select('product_id, price_sell, price_buy')
      .order('created_at', { ascending: false });

    const priceMap: Record<string, { sell: number; buy: number }> = {};
    (lastPrices || []).forEach((lp: any) => {
      if (!priceMap[lp.product_id]) priceMap[lp.product_id] = { sell: lp.price_sell, buy: lp.price_buy };
    });

    const productsWithStock: Product[] = await Promise.all(
      rawProducts.map(async (p: any) => {
        const stock = await calcStock(p.id);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          barcode: p.barcode,
          categoryId: p.category_id,
          categoryName: p.product_categories?.name,
          brandId: p.brand_id,
          brandName: p.product_brands?.name,
          sellByDetail: p.sell_by_detail || false,
          detailUnitQty: p.detail_unit_qty,
          detailUnit: p.detail_unit,
          minStock: p.min_stock || 0,
          priceSell: priceMap[p.id]?.sell || 0,
          priceLastBuy: priceMap[p.id]?.buy || 0,
          currentStock: stock.units,
          currentDetailStock: stock.detail,
          createdAt: p.created_at,
        };
      })
    );

    setProducts(productsWithStock);
    setCategories((cData || []).map((c: any) => ({ id: c.id, name: c.name })));
    setBrands((bData || []).map((b: any) => ({ id: b.id, name: b.name })));
    setIsLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => {
    setForm({ name: '', description: '', barcode: '', categoryId: '', brandId: '', sellByDetail: false, detailUnitQty: 500, detailUnit: 'ml', minStock: 5 });
    setShowNewCategory(false); setShowNewBrand(false);
    setNewCategoryName(''); setNewBrandName('');
  };

  const openCreate = () => { resetForm(); setModal('create'); };
  const openEdit = (p: Product) => {
    setSelectedProduct(p);
    setForm({ name: p.name, description: p.description || '', barcode: p.barcode || '', categoryId: p.categoryId || '', brandId: p.brandId || '', sellByDetail: p.sellByDetail, detailUnitQty: p.detailUnitQty || 500, detailUnit: p.detailUnit || 'ml', minStock: p.minStock });
    setModal('edit');
  };
  const openDetails = async (p: Product) => {
    setSelectedProduct(p);
    const { data } = await supabase
      .from('product_purchase_items')
      .select('*, product_purchases(date, suppliers(full_name))')
      .eq('product_id', p.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setPurchaseHistory(data || []);
    setModal('details');
  };

  const createCategory = async () => {
    if (!newCategoryName.trim()) return;
    const { data } = await supabase.from('product_categories').insert([{ name: newCategoryName.trim() }]).select().single();
    if (data) {
      setCategories(prev => [...prev, { id: data.id, name: data.name }]);
      setForm(f => ({ ...f, categoryId: data.id }));
      setShowNewCategory(false); setNewCategoryName('');
    }
  };

  const createBrand = async () => {
    if (!newBrandName.trim()) return;
    const { data } = await supabase.from('product_brands').insert([{ name: newBrandName.trim() }]).select().single();
    if (data) {
      setBrands(prev => [...prev, { id: data.id, name: data.name }]);
      setForm(f => ({ ...f, brandId: data.id }));
      setShowNewBrand(false); setNewBrandName('');
    }
  };

  const saveProduct = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      barcode: form.barcode.trim() || null,
      category_id: form.categoryId || null,
      brand_id: form.brandId || null,
      sell_by_detail: form.sellByDetail,
      detail_unit_qty: form.sellByDetail ? form.detailUnitQty : null,
      detail_unit: form.sellByDetail ? form.detailUnit : null,
      min_stock: form.minStock,
    };
    if (modal === 'edit' && selectedProduct) {
      await supabase.from('products').update(payload).eq('id', selectedProduct.id);
    } else {
      await supabase.from('products').insert([payload]);
    }
    await fetchAll();
    setModal(null);
    setIsSaving(false);
  };

  const deleteProduct = async () => {
    if (!selectedProduct) return;
    await supabase.from('products').delete().eq('id', selectedProduct.id);
    await fetchAll();
    setModal(null);
  };

  const printBarcode = (barcode: string, name: string) => {
    const svg = renderBarcodeSVG(barcode, 240, 80);
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Code-barres</title><style>
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:monospace;background:#fff}
      p{margin:4px 0;font-size:13px;color:#333}
    </style></head><body>${svg}<p>${barcode}</p><p style="font-weight:bold">${name}</p>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  const stockColor = (p: Product) => {
    const stock = p.sellByDetail ? (p.currentDetailStock || 0) : p.currentStock;
    const min = p.sellByDetail ? (p.minStock * (p.detailUnitQty || 1)) : p.minStock;
    if (stock <= 0) return 'text-red-600';
    if (stock <= min) return 'text-red-500';
    if (stock <= min * 1.5) return 'text-orange-500';
    return 'text-emerald-600';
  };

  const CATEGORY_COLORS = ['bg-purple-100 text-purple-700', 'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-cyan-100 text-cyan-700'];

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.barcode || '').includes(searchQuery) ||
    (p.categoryName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold text-ink tracking-tight flex items-center gap-3">
            <Package className="text-accent" size={36} /> Produits
          </h2>
          <p className="text-ink/40 mt-2 font-medium">Gérez l'inventaire des produits de votre salon</p>
        </div>
        <button onClick={openCreate} className="btn-gradient shimmer flex items-center gap-2.5 px-6 py-2.5">
          <Plus size={20} /> Ajouter un produit
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={20} />
        <input
          type="text" placeholder="Rechercher par nom, code-barres ou catégorie..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-2xl bg-surface/40 border border-border text-ink placeholder:text-ink/40 font-medium focus:outline-none focus:border-accent/40 focus:bg-surface transition-all"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh] gap-3">
          <Loader2 className="animate-spin text-accent" size={32} />
          <span className="text-ink/40 font-medium">Chargement des produits...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-16 text-center">
          <Package className="text-ink/20 mx-auto mb-4" size={48} />
          <h3 className="text-xl font-serif font-bold text-ink mb-1">Aucun produit</h3>
          <p className="text-ink/40 text-sm">Ajoutez votre premier produit pour commencer</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((p, i) => {
            const colorClass = CATEGORY_COLORS[categories.findIndex(c => c.id === p.categoryId) % CATEGORY_COLORS.length] || CATEGORY_COLORS[0];
            const stock = p.sellByDetail ? (p.currentDetailStock || 0) : p.currentStock;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card-premium p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-bold text-lg text-ink truncate">{p.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {p.categoryName && <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', colorClass)}>{p.categoryName}</span>}
                      {p.brandName && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-ink/10 text-ink/60">{p.brandName}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn('text-3xl font-bold', stockColor(p))}>{stock.toLocaleString()}</p>
                    <p className="text-xs text-ink/40">{p.sellByDetail ? p.detailUnit : 'unités'}</p>
                    <p className="text-[10px] text-ink/30 mt-0.5">min: {p.sellByDetail ? `${p.minStock * (p.detailUnitQty || 1)} ${p.detailUnit}` : `${p.minStock} u`}</p>
                  </div>
                </div>

                {p.barcode && (
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-primary-bg/50">
                    <Barcode size={16} className="text-ink/30 flex-shrink-0" />
                    <span className="font-mono text-xs text-ink/50 truncate">{p.barcode}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <div>
                    <p className="text-xs text-ink/40">Prix de vente</p>
                    <p className="font-bold text-accent">{formatCurrency(p.priceSell)}</p>
                    {p.sellByDetail && <p className="text-[10px] text-ink/40">Détail · unité: {p.detailUnitQty} {p.detailUnit}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openDetails(p)} className="p-2 rounded-xl hover:bg-blue-50 text-ink/40 hover:text-blue-600 transition-all" title="Voir détails"><Eye size={18} /></button>
                    <button onClick={() => openEdit(p)} className="p-2 rounded-xl hover:bg-accent/10 text-ink/40 hover:text-accent transition-all" title="Modifier"><Edit2 size={18} /></button>
                    <button onClick={() => { setSelectedProduct(p); setModal('delete'); }} className="p-2 rounded-xl hover:bg-red-50 text-ink/40 hover:text-red-500 transition-all" title="Supprimer"><Trash2 size={18} /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(modal === 'create' || modal === 'edit') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif font-bold text-ink">{modal === 'create' ? 'Ajouter un produit' : 'Modifier le produit'}</h3>
                  <button onClick={() => setModal(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/40"><X size={20} /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left column */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Nom du produit *</label>
                      <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-premium w-full" placeholder="Ex: Shampoing kératine" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Description</label>
                      <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-premium w-full resize-none h-20" placeholder="Description optionnelle..." />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Code-barres</label>
                      <div className="flex gap-2">
                        <input type="text" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} className="input-premium flex-1" placeholder="EAN-13" />
                        <button onClick={() => setForm(f => ({ ...f, barcode: generateEAN13() }))} className="px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs font-bold hover:bg-accent/20 transition-all whitespace-nowrap">Générer</button>
                        {form.barcode && form.barcode.length === 13 && (
                          <button onClick={() => printBarcode(form.barcode, form.name)} className="px-3 py-2 rounded-xl bg-ink/5 text-ink/60 text-xs font-bold hover:bg-ink/10 transition-all" title="Imprimer"><Printer size={16} /></button>
                        )}
                      </div>
                    </div>
                    {/* Category */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Catégorie</label>
                      <div className="flex gap-2">
                        <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="input-premium flex-1">
                          <option value="">-- Aucune --</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button onClick={() => setShowNewCategory(!showNewCategory)} className="px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs font-bold hover:bg-accent/20 transition-all"><Plus size={16} /></button>
                      </div>
                      {showNewCategory && (
                        <div className="flex gap-2 mt-2">
                          <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} className="input-premium flex-1 py-2" placeholder="Nom de la catégorie" onKeyDown={e => e.key === 'Enter' && createCategory()} />
                          <button onClick={createCategory} className="px-3 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-200 transition-all"><Check size={16} /></button>
                        </div>
                      )}
                    </div>
                    {/* Brand */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Marque</label>
                      <div className="flex gap-2">
                        <select value={form.brandId} onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))} className="input-premium flex-1">
                          <option value="">-- Aucune --</option>
                          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <button onClick={() => setShowNewBrand(!showNewBrand)} className="px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs font-bold hover:bg-accent/20 transition-all"><Plus size={16} /></button>
                      </div>
                      {showNewBrand && (
                        <div className="flex gap-2 mt-2">
                          <input type="text" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} className="input-premium flex-1 py-2" placeholder="Nom de la marque" onKeyDown={e => e.key === 'Enter' && createBrand()} />
                          <button onClick={createBrand} className="px-3 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-200 transition-all"><Check size={16} /></button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl border border-border bg-primary-bg/30">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-bold text-ink">Vente au détail</label>
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, sellByDetail: !f.sellByDetail }))}
                          className={cn('relative w-12 h-6 rounded-full transition-all duration-300', form.sellByDetail ? 'bg-accent' : 'bg-ink/20')}
                        >
                          <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-surface shadow transition-all duration-300', form.sellByDetail ? 'left-7' : 'left-1')} />
                        </button>
                      </div>
                      {form.sellByDetail && (
                        <div className="space-y-3 pt-3 border-t border-border">
                          <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Quantité totale par unité</label>
                            <input type="number" value={form.detailUnitQty} onChange={e => setForm(f => ({ ...f, detailUnitQty: Number(e.target.value) }))} className="input-premium w-full" placeholder="Ex: 500" />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1 block">Unité</label>
                            <select value={form.detailUnit} onChange={e => setForm(f => ({ ...f, detailUnit: e.target.value }))} className="input-premium w-full">
                              {['ml', 'g', 'cl', 'L', 'kg', 'oz'].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 mb-1.5 block">Stock minimal d'alerte</label>
                      <input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: Number(e.target.value) }))} className="input-premium w-full" />
                      {form.sellByDetail && <p className="text-xs text-ink/40 mt-1">Alerte si stock &lt; {form.minStock * form.detailUnitQty} {form.detailUnit}</p>}
                    </div>
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-700 font-medium flex items-start gap-2">
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                        Le prix d'achat, le prix de vente et la quantité en stock sont définis automatiquement lors des achats fournisseurs.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button onClick={() => setModal(null)} className="px-6 py-2.5 rounded-2xl border border-border text-ink/60 hover:bg-primary-bg font-medium transition-all">Annuler</button>
                  <button onClick={saveProduct} disabled={!form.name.trim() || isSaving} className="btn-gradient px-6 py-2.5 disabled:opacity-50 flex items-center gap-2">
                    {isSaving && <Loader2 size={16} className="animate-spin" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {modal === 'details' && selectedProduct && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif font-bold text-ink">{selectedProduct.name}</h3>
                  <button onClick={() => setModal(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/40"><X size={20} /></button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selectedProduct.categoryName && <div><span className="text-ink/40">Catégorie:</span> <span className="font-bold">{selectedProduct.categoryName}</span></div>}
                  {selectedProduct.brandName && <div><span className="text-ink/40">Marque:</span> <span className="font-bold">{selectedProduct.brandName}</span></div>}
                  {selectedProduct.barcode && <div><span className="text-ink/40">Code-barres:</span> <span className="font-mono">{selectedProduct.barcode}</span></div>}
                  <div><span className="text-ink/40">Stock min:</span> <span className="font-bold">{selectedProduct.minStock} {selectedProduct.sellByDetail ? selectedProduct.detailUnit : 'u'}</span></div>
                  <div><span className="text-ink/40">Prix vente:</span> <span className="font-bold text-accent">{formatCurrency(selectedProduct.priceSell)}</span></div>
                  <div>
                    <span className="text-ink/40">Stock actuel:</span>
                    <span className={cn('font-bold ml-1', stockColor(selectedProduct))}>
                      {selectedProduct.sellByDetail ? `${selectedProduct.currentDetailStock} ${selectedProduct.detailUnit}` : `${selectedProduct.currentStock} u`}
                    </span>
                  </div>
                </div>
                {purchaseHistory.length > 0 && (
                  <div>
                    <h4 className="font-bold text-ink mb-3 text-sm uppercase tracking-widest text-ink/40">Historique des achats</h4>
                    <div className="overflow-x-auto rounded-2xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-primary-bg/50"><tr>
                          <th className="px-4 py-2 text-left text-xs font-bold text-ink/40">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-bold text-ink/40">Fournisseur</th>
                          <th className="px-4 py-2 text-right text-xs font-bold text-ink/40">Qté</th>
                          <th className="px-4 py-2 text-right text-xs font-bold text-ink/40">Prix achat</th>
                          <th className="px-4 py-2 text-right text-xs font-bold text-ink/40">Prix vente</th>
                        </tr></thead>
                        <tbody className="divide-y divide-border">
                          {purchaseHistory.map((h: any) => (
                            <tr key={h.id} className="hover:bg-primary-bg/30">
                              <td className="px-4 py-2">{h.product_purchases?.date ? new Date(h.product_purchases.date).toLocaleDateString('fr-FR') : '—'}</td>
                              <td className="px-4 py-2">{h.product_purchases?.suppliers?.full_name || '—'}</td>
                              <td className="px-4 py-2 text-right font-bold">{h.quantity_bought}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(h.price_buy)}</td>
                              <td className="px-4 py-2 text-right text-accent font-bold">{formatCurrency(h.price_sell)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {modal === 'delete' && selectedProduct && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-surface rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
                <Trash2 className="text-red-500" size={28} />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-serif font-bold text-ink mb-2">Supprimer ce produit ?</h3>
                <p className="text-ink/50 text-sm">«&nbsp;{selectedProduct.name}&nbsp;» sera définitivement supprimé.</p>
                {(selectedProduct.currentStock > 0 || (selectedProduct.currentDetailStock || 0) > 0) && (
                  <p className="mt-3 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl flex items-center gap-2">
                    <AlertCircle size={14} /> Ce produit a encore des mouvements de stock.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 rounded-2xl border border-border text-ink/60 hover:bg-primary-bg font-medium transition-all">Annuler</button>
                <button onClick={deleteProduct} className="flex-1 px-4 py-2.5 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all">Supprimer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Products;
