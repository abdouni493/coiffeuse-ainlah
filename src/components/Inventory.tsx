import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Truck, 
  ShoppingBag, 
  FileText, 
  Plus, 
  Search, 
  History, 
  Edit2, 
  Trash2, 
  Eye, 
  Phone, 
  MapPin,
  CreditCard,
  ArrowRight,
  Printer,
  AlertCircle,
  X,
  Filter,
  Download,
  Clock,
  Check,
  DollarSign
} from 'lucide-react';
import { Supplier, Purchase } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface InventoryProps {
  initialTab?: 'suppliers' | 'purchases' | 'invoices';
}

const Inventory: React.FC<InventoryProps> = ({ initialTab = 'suppliers' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'purchases' | 'invoices'>(initialTab);
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<Supplier | Purchase | any | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState(false);
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean; purchase: Purchase | null }>({ isOpen: false, purchase: null });
  const [paymentAmount, setPaymentAmount] = useState('');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'supplier' | 'purchase' | 'invoice';
    id: string;
    name: string;
  } | null>(null);

  const [supplierHistory, setSupplierHistory] = useState<{
    isOpen: boolean;
    supplier?: Supplier;
  }>({ isOpen: false });

  const [newSupplier, setNewSupplier] = useState({ fullName: '', phone: '', address: '' });
  const [newPurchase, setNewPurchase] = useState({ supplierId: '', description: '', cost: 0, paidAmount: 0 });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      console.log('[FETCH] Starting data fetch...');
      
      // Fetch Suppliers
      console.log('[FETCH] Fetching suppliers...');
      const { data: sData, error: sError } = await supabase.from('suppliers').select('*');
      if (sError) {
        console.error('[FETCH ERROR] Error fetching suppliers:', sError);
      } else {
        console.log('[FETCH SUCCESS] Suppliers fetched:', sData?.length || 0);
        setSuppliers(sData.map(s => ({ id: s.id, fullName: s.full_name, phone: s.phone, address: s.address })));
      }

      // Fetch Purchases
      console.log('[FETCH] Fetching purchases...');
      const { data: pData, error: pError } = await supabase.from('purchases').select('*').order('date', { ascending: false });
      if (pError) {
        console.error('[FETCH ERROR] Error fetching purchases:', pError);
      } else {
        console.log('[FETCH SUCCESS] Purchases fetched:', pData?.length || 0);
        setPurchases(pData.map(p => ({ id: p.id, supplierId: p.supplier_id, description: p.description, cost: p.cost, paidAmount: p.paid_amount, date: p.date })));
      }

      // Fetch Invoices (Reservations) with all details
      console.log('[FETCH] Fetching invoices...');
      const { data: iData, error: iError } = await supabase.from('reservations').select('*').order('date', { ascending: false });
      if (iError) {
        console.error('[FETCH ERROR] Error fetching invoices:', iError);
        setInvoices([]);
      } else {
        console.log('[FETCH] Processing', iData?.length || 0, 'invoices with details...');
        const invoicesWithDetails = await Promise.all((iData || []).map(async (i) => {
          // Fetch prestation details
          const { data: prestationData } = await supabase.from('prestations').select('*').eq('id', i.prestation_id).single();
          
          // Fetch worker details
          let workerData = null;
          if (i.worker_id) {
            const { data: wData } = await supabase.from('profiles').select('*').eq('id', i.worker_id).single();
            workerData = wData;
          }
          
          // Fetch service details
          let servicesData = [];
          if (i.service_ids && i.service_ids.length > 0) {
            const { data: sData } = await supabase.from('services').select('*').in('id', i.service_ids);
            servicesData = sData || [];
          }
          
          return {
            id: i.id,
            client: i.client_name,
            phone: i.client_phone,
            date: i.date,
            time: i.time,
            amount: i.total_price,
            paidAmount: i.paid_amount,
            status: i.status,
            prestationId: i.prestation_id,
            prestationName: prestationData?.name,
            serviceIds: i.service_ids,
            services: servicesData,
            workerId: i.worker_id,
            workerName: workerData?.full_name,
            createdAt: i.created_at,
            finalizedAt: i.finalized_at
          };
        }));
        console.log('[FETCH SUCCESS] Invoices with details processed:', invoicesWithDetails.length);
        setInvoices(invoicesWithDetails);
      }

      console.log('[FETCH] All data fetched successfully');
    } catch (error) {
      console.error('[FETCH CRITICAL ERROR]:', error);
    } finally {
      setIsLoading(false);
      console.log('[FETCH] Loading state set to false');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddSupplier = async () => {
    const supplierData = {
      full_name: newSupplier.fullName,
      phone: newSupplier.phone,
      address: newSupplier.address
    };

    if (editingItem && 'fullName' in editingItem) {
      const { error } = await supabase.from('suppliers').update(supplierData).eq('id', editingItem.id);
      if (error) console.error('Error updating supplier:', error);
      setEditingItem(null);
    } else {
      const { error } = await supabase.from('suppliers').insert([supplierData]);
      if (error) console.error('Error adding supplier:', error);
    }
    
    fetchData();
    setIsAdding(false);
    setNewSupplier({ fullName: '', phone: '', address: '' });
  };

  const handleAddPurchase = async () => {
    const purchaseData = {
      supplier_id: newPurchase.supplierId,
      description: newPurchase.description,
      cost: newPurchase.cost,
      paid_amount: newPurchase.paidAmount,
      date: new Date().toISOString().split('T')[0]
    };

    if (editingItem && 'cost' in editingItem) {
      const { error } = await supabase.from('purchases').update(purchaseData).eq('id', editingItem.id);
      if (error) console.error('Error updating purchase:', error);
      setEditingItem(null);
    } else {
      const { error } = await supabase.from('purchases').insert([purchaseData]);
      if (error) console.error('Error adding purchase:', error);
    }
    
    fetchData();
    setIsAdding(false);
    setNewPurchase({ supplierId: '', description: '', cost: 0, paidAmount: 0 });
  };

  const openEditPurchase = (purchase: Purchase) => {
    setEditingPurchase({ ...purchase });
  };

  const handleSavePurchase = async () => {
    if (!editingPurchase) return;
    const purchaseData = {
      supplier_id: editingPurchase.supplierId,
      description: editingPurchase.description,
      cost: parseFloat(editingPurchase.cost),
      paid_amount: parseFloat(editingPurchase.paidAmount),
      date: editingPurchase.date
    };

    const { error } = await supabase
      .from('purchases')
      .update(purchaseData)
      .eq('id', editingPurchase.id);

    if (error) {
      console.error('Error updating purchase:', error);
    } else {
      fetchData();
      setEditingPurchase(null);
    }
  };

  const handlePayDebt = async () => {
    if (!paymentModal.purchase || !paymentAmount) return;
    const newPaidAmount = paymentModal.purchase.paidAmount + parseFloat(paymentAmount);
    
    const { error } = await supabase
      .from('purchases')
      .update({ paid_amount: newPaidAmount })
      .eq('id', paymentModal.purchase.id);

    if (error) {
      console.error('Error updating payment:', error);
    } else {
      fetchData();
      setPaymentModal({ isOpen: false, purchase: null });
      setPaymentAmount('');
    }
  };

  const handleSaveInvoice = async () => {
    if (!editingInvoice) return;
    const invoiceData = {
      client_name: editingInvoice.client,
      client_phone: editingInvoice.phone,
      total_price: parseFloat(editingInvoice.amount)
    };

    const { error } = await supabase
      .from('reservations')
      .update(invoiceData)
      .eq('id', editingInvoice.id);

    if (error) {
      console.error('Error updating invoice:', error);
    } else {
      fetchData();
      setEditingInvoice(null);
    }
  };

  const confirmDelete = (type: 'supplier' | 'purchase' | 'invoice', id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, type, id, name });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      console.warn('[DELETE] No item selected for deletion');
      return;
    }

    try {
      const itemType = deleteConfirm.type;
      const itemId = deleteConfirm.id;
      
      console.log(`[DELETE] Starting ${itemType} deletion:`, itemId);
      
      let table = '';
      if (itemType === 'supplier') {
        table = 'suppliers';
      } else if (itemType === 'purchase') {
        table = 'purchases';
      } else if (itemType === 'invoice') {
        table = 'reservations';
      }

      if (!table) {
        console.error('[DELETE ERROR] Unknown delete type:', itemType);
        throw new Error('Type de suppression inconnu');
      }

      console.log(`[DELETE] Deleting from table: ${table} with id: ${itemId}`);
      
      // Delete the item and get the response
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq('id', itemId)
        .select();

      console.log(`[DELETE] Delete response:`, { data, error, rowCount: data?.length });

      if (error) {
        console.error(`[DELETE ERROR] Failed to delete ${itemType}:`, error);
        throw error;
      }

      // Check if deletion was actually successful
      if (!data || data.length === 0) {
        console.warn('[DELETE WARNING] Delete returned no rows - RLS policies may be blocking deletion');
        throw new Error('La suppression a échoué - vérifiez vos permissions');
      }

      console.log(`[DELETE SUCCESS] ${itemType} deleted successfully from ${table}`);
      
      // Update local state immediately
      if (itemType === 'supplier') {
        setSuppliers(prev => prev.filter(s => s.id !== itemId));
      } else if (itemType === 'purchase') {
        setPurchases(prev => prev.filter(p => p.id !== itemId));
      } else if (itemType === 'invoice') {
        setInvoices(prev => prev.filter(i => i.id !== itemId));
      }
      
      // Close the modal
      setDeleteConfirm(null);
      
      console.log(`[DELETE] ${itemType} removed from UI successfully`);
    } catch (error) {
      console.error(`[DELETE CRITICAL ERROR] ${deleteConfirm?.type}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DELETE ERROR MESSAGE]:', errorMessage);
      alert(`Erreur lors de la suppression: ${errorMessage}`);
      setDeleteConfirm(null);
      // Refetch data to ensure UI is in sync with database
      console.log('[DELETE] Refetching data after error...');
      await fetchData();
    }
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingItem(s);
    setNewSupplier({ fullName: s.fullName, phone: s.phone, address: s.address });
    setIsAdding(true);
  };

  const handlePrint = (invoice: any) => {
    const printContent = document.createElement('div');
    printContent.style.display = 'none';
    const htmlContent = `
      <html>
        <head>
          <title>Facture ${invoice.id}</title>
          <style>
            * { margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background: #f5f5f5; }
            @media print { body { padding: 0; background: white; } }
            .invoice-container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 3px solid #F27D26; padding-bottom: 30px; margin-bottom: 30px; }
            .logo-section h1 { font-size: 28px; font-weight: bold; color: #F27D26; margin-bottom: 5px; }
            .logo-section p { font-size: 14px; color: #666; }
            .invoice-title { text-align: right; }
            .invoice-title h2 { font-size: 24px; color: #333; margin-bottom: 10px; }
            .invoice-title p { font-size: 14px; color: #666; }
            .client-info { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .info-section h3 { font-size: 12px; color: #999; text-transform: uppercase; font-weight: bold; margin-bottom: 10px; letter-spacing: 1px; }
            .info-section p { font-size: 14px; color: #333; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin: 40px 0; }
            table th { background: #F27D26; color: white; padding: 15px; text-align: left; font-size: 12px; font-weight: bold; text-transform: uppercase; }
            table td { padding: 15px; border-bottom: 1px solid #eee; font-size: 14px; }
            table tr:last-child td { border-bottom: 2px solid #333; }
            .totals { display: flex; justify-content: flex-end; margin-top: 40px; }
            .totals-section { width: 300px; }
            .total-line { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; border-bottom: 1px solid #eee; }
            .total-line.grand-total { font-size: 18px; font-weight: bold; color: #F27D26; border-bottom: 2px solid #F27D26; margin-top: 10px; padding: 15px 0; }
            .footer { text-align: center; margin-top: 60px; padding-top: 30px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
            @media print {
              .invoice-container { box-shadow: none; }
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <div class="header">
              <div class="logo-section">
                <h1>Éclat & Soie</h1>
                <p>Votre beauté, notre passion</p>
              </div>
              <div class="invoice-title">
                <h2>FACTURE</h2>
                <p><strong>#${invoice.id.slice(0, 8).toUpperCase()}</strong></p>
              </div>
            </div>

            <div class="client-info">
              <div class="info-section">
                <h3>Facturé à</h3>
                <p><strong>${invoice.client || 'Client'}</strong></p>
                <p>${invoice.phone || ''}</p>
              </div>
              <div class="info-section" style="text-align: right;">
                <h3>Date de facture</h3>
                <p><strong>${new Date(invoice.date).toLocaleDateString('fr-FR')}</strong></p>
                <p>Statut: <strong>${invoice.status === 'finalized' ? 'Finalisée' : 'En attente'}</strong></p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Prestation / Service</th>
                  <th style="text-align: right;">Prix Unitaire</th>
                  <th style="text-align: right;">Montant</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${invoice.prestationName || 'Service'}</td>
                  <td style="text-align: right;">-</td>
                  <td style="text-align: right; font-weight: bold;">${(invoice.amount || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA</td>
                </tr>
                ${(invoice.services || []).map((s: any) => `
                  <tr>
                    <td>→ ${s.name}</td>
                    <td style="text-align: right;">${(s.price || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA</td>
                    <td style="text-align: right; font-weight: bold;">${(s.price || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="totals">
              <div class="totals-section">
                <div class="total-line">
                  <span>Sous-total:</span>
                  <span>${(invoice.amount || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA</span>
                </div>
                <div class="total-line">
                  <span>Montant payé:</span>
                  <span>${(invoice.paidAmount || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA</span>
                </div>
                <div class="total-line grand-total">
                  <span>Reste à payer:</span>
                  <span>${Math.max(0, (invoice.amount || 0) - (invoice.paidAmount || 0)).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA</span>
                </div>
              </div>
            </div>

            <div class="footer">
              <p>Merci pour votre confiance!</p>
              <p>Téléphone: 06 12 34 56 78 | Instagram: @eclat_soie_salon</p>
            </div>
          </div>
        </body>
      </html>
    `;
    
    printContent.innerHTML = htmlContent;
    document.body.appendChild(printContent);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    }
    document.body.removeChild(printContent);
  };

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold text-ink tracking-tight">Fournisseurs</h2>
          <p className="text-ink/40 mt-2 font-medium">Gérez la liste de vos fournisseurs</p>
        </div>
      </div>

      {activeSubTab === 'suppliers' && (
        <div className="space-y-8">
          <div className="flex justify-end">
            <button 
              onClick={() => setIsAdding(!isAdding)}
              className="btn-gradient shimmer flex items-center gap-2.5 px-8 py-3"
            >
              {isAdding ? 'Annuler' : <><Plus size={20} /> Nouveau Fournisseur</>}
            </button>
          </div>

          {isAdding && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-premium p-8 grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Nom Complet</label>
                <input 
                  type="text" 
                  value={newSupplier.fullName}
                  onChange={e => setNewSupplier({...newSupplier, fullName: e.target.value})}
                  className="input-premium" 
                  placeholder="Ex: L'Oréal Professionnel"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Téléphone</label>
                <input 
                  type="text" 
                  value={newSupplier.phone}
                  onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})}
                  className="input-premium" 
                  placeholder="021..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Adresse</label>
                <input 
                  type="text" 
                  value={newSupplier.address}
                  onChange={e => setNewSupplier({...newSupplier, address: e.target.value})}
                  className="input-premium" 
                  placeholder="Ville, Quartier..."
                />
              </div>
              <div className="md:col-span-3 flex justify-end pt-4">
                <button onClick={handleAddSupplier} className="btn-gradient px-10 py-3">Enregistrer Fournisseur</button>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {suppliers.map((s, idx) => (
              <motion.div 
                key={s.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="card-premium p-8 group hover:translate-y-[-4px] transition-all duration-300"
              >
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-inner group-hover:bg-accent group-hover:text-white transition-all duration-500">
                    <Truck size={32} />
                  </div>
                  <div>
                    <h4 className="font-serif font-bold text-xl text-ink tracking-tight">{s.fullName}</h4>
                    <p className="text-xs text-ink/40 font-medium mt-0.5">Fournisseur agréé</p>
                  </div>
                </div>
                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-4 text-sm text-ink/60 font-medium">
                    <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center text-accent/60">
                      <Phone size={16} />
                    </div>
                    <span>{s.phone}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-ink/60 font-medium">
                    <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center text-accent/60">
                      <MapPin size={16} />
                    </div>
                    <span className="truncate">{s.address}</span>
                  </div>
                </div>
                <div className="pt-6 border-t border-border flex gap-3">
                  <button 
                    onClick={() => setSupplierHistory({ isOpen: true, supplier: s })}
                    className="flex-1 py-3 rounded-xl bg-primary-bg text-ink/60 font-bold text-xs hover:bg-accent hover:text-white transition-all duration-300 flex items-center justify-center gap-2 shadow-sm"
                  >
                    <History size={16} /> Historique
                  </button>
                  <button 
                    onClick={() => openEditSupplier(s)}
                    className="p-3 rounded-xl bg-primary-bg text-ink/40 hover:text-accent hover:bg-white border border-transparent hover:border-accent/20 transition-all duration-300 shadow-sm"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => confirmDelete('supplier', s.id, s.fullName)}
                    className="p-3 rounded-xl bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'purchases' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 justify-between">
            <button 
              onClick={() => setIsAdding(!isAdding)}
              className="btn-gradient shimmer flex items-center gap-2.5 px-8 py-3 w-fit"
            >
              {isAdding ? 'Annuler' : <><Plus size={20} /> Nouvel Achat</>}
            </button>
            <div className="flex gap-3 w-full md:w-auto">
              <div className="flex items-center flex-1 md:flex-none bg-primary-bg rounded-2xl px-5 py-3 border border-border/50 shadow-inner group focus-within:border-accent/40 transition-all">
                <Search size={18} className="text-ink/30 group-focus-within:text-accent transition-colors" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par description..." 
                  className="bg-transparent border-none focus:ring-0 text-sm ml-3 flex-1 text-ink placeholder:text-ink/20 font-medium" 
                />
              </div>
              <button 
                onClick={() => setDebtFilter(!debtFilter)}
                className={cn(
                  "px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 flex items-center gap-2 shadow-sm",
                  debtFilter
                    ? "bg-red-500 text-white border border-red-600"
                    : "bg-primary-bg text-ink/40 hover:text-accent border border-border/50 hover:border-accent/40"
                )}
              >
                <DollarSign size={18} />
                <span className="hidden md:inline">Impayées</span>
              </button>
            </div>
          </div>

          {isAdding && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-premium p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Fournisseur</label>
                <select 
                  value={newPurchase.supplierId}
                  onChange={e => setNewPurchase({...newPurchase, supplierId: e.target.value})}
                  className="input-premium"
                >
                  <option value="">Sélectionner...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Description</label>
                <input 
                  type="text" 
                  value={newPurchase.description}
                  onChange={e => setNewPurchase({...newPurchase, description: e.target.value})}
                  className="input-premium" 
                  placeholder="Ex: Commande Shampoings"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Coût Total (DA)</label>
                <input 
                  type="number" 
                  value={newPurchase.cost}
                  onChange={e => setNewPurchase({...newPurchase, cost: Number(e.target.value)})}
                  className="input-premium" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Montant Payé (DA)</label>
                <input 
                  type="number" 
                  value={newPurchase.paidAmount}
                  onChange={e => setNewPurchase({...newPurchase, paidAmount: Number(e.target.value)})}
                  className="input-premium" 
                />
              </div>
              <div className="lg:col-span-4 flex justify-end pt-4">
                <button onClick={handleAddPurchase} className="btn-gradient px-10 py-3">Enregistrer Achat</button>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {purchases
              .filter(p => {
                const matchSearch = p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                   (suppliers.find(s => s.id === p.supplierId)?.fullName || '').toLowerCase().includes(searchQuery.toLowerCase());
                const matchDebt = !debtFilter || (p.paidAmount < p.cost);
                return matchSearch && matchDebt;
              })
              .map((p, idx) => (
              <motion.div 
                key={p.id} 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="card-premium p-6 md:p-8 group hover:shadow-lg transition-all duration-300 flex flex-col"
              >
                <div className="mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h4 className="font-serif font-bold text-lg text-ink tracking-tight line-clamp-2">{p.description}</h4>
                      <p className="text-sm text-ink/60 font-medium mt-2">
                        <span className="text-ink/40">Fournisseur:</span> <span className="text-accent">{suppliers.find(s => s.id === p.supplierId)?.fullName || '-'}</span>
                      </p>
                    </div>
                    <span className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap",
                      p.paidAmount >= p.cost
                        ? "bg-green-50 text-green-600 border-green-100"
                        : "bg-red-50 text-red-500 border-red-100"
                    )}>
                      {p.paidAmount >= p.cost ? "Payé" : "Impayé"}
                    </span>
                  </div>
                  <p className="text-xs text-ink/40 font-medium mt-3">
                    Date: <span className="text-ink">{p.date}</span>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-gradient-to-br from-primary-bg to-primary-bg/50 rounded-2xl border border-border/50">
                  <div className="text-center">
                    <p className="text-[9px] text-ink/40 uppercase tracking-widest font-bold mb-1">Total</p>
                    <p className="font-serif font-bold text-ink">{formatCurrency(p.cost)}</p>
                  </div>
                  <div className="text-center">
                    <p className={cn(
                      "text-[9px] uppercase tracking-widest font-bold mb-1",
                      p.paidAmount > 0 ? "text-green-600" : "text-ink/40"
                    )}>Payé</p>
                    <p className={cn(
                      "font-serif font-bold",
                      p.paidAmount > 0 ? "text-green-600" : "text-ink/40"
                    )}>{formatCurrency(p.paidAmount)}</p>
                  </div>
                  <div className="text-center">
                    <p className={cn(
                      "text-[9px] uppercase tracking-widest font-bold mb-1",
                      p.paidAmount < p.cost ? "text-red-500" : "text-green-600"
                    )}>Reste</p>
                    <p className={cn(
                      "font-serif font-bold",
                      p.paidAmount < p.cost ? "text-red-500" : "text-green-600"
                    )}>{formatCurrency(p.cost - p.paidAmount)}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-auto">
                  {p.paidAmount < p.cost && (
                    <button 
                      onClick={() => setPaymentModal({ isOpen: true, purchase: p })}
                      className="flex-1 py-3 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 border border-green-100 transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
                    >
                      <DollarSign size={16} /> Payer
                    </button>
                  )}
                  <button 
                    onClick={() => openEditPurchase(p)}
                    className="flex-1 py-3 rounded-xl bg-primary-bg text-ink/40 hover:text-accent hover:bg-white border border-transparent hover:border-accent/20 transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Edit2 size={16} /> Éditer
                  </button>
                  <button 
                    onClick={() => confirmDelete('purchase', p.id, p.description)}
                    className="p-3 rounded-xl bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {purchases.filter(p => {
            const matchSearch = p.description.toLowerCase().includes(searchQuery.toLowerCase());
            const matchDebt = !debtFilter || (p.paidAmount < p.cost);
            return matchSearch && matchDebt;
          }).length === 0 && (
            <div className="text-center py-16">
              <ShoppingBag size={48} className="mx-auto mb-4 text-ink/10" />
              <p className="text-ink/40 font-medium">Aucun achat trouvé</p>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'invoices' && (
        <div className="space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-premium p-6 md:p-8 flex flex-col md:flex-row gap-6 items-end justify-between"
          >
            <div>
              <h3 className="font-serif font-bold text-2xl text-ink tracking-tight">Historique des Factures</h3>
              <p className="text-sm text-ink/40 font-medium mt-2">Consultez, éditez et imprimez les factures de vos clients</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <div className="flex items-center flex-1 md:flex-none bg-primary-bg rounded-2xl px-5 py-3 border border-border/50 shadow-inner group focus-within:border-accent/40 transition-all">
                <Search size={18} className="text-ink/30 group-focus-within:text-accent transition-colors" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par client..." 
                  className="bg-transparent border-none focus:ring-0 text-sm ml-3 flex-1 text-ink placeholder:text-ink/20 font-medium" 
                />
              </div>
              <button 
                onClick={() => setDebtFilter(!debtFilter)}
                className={cn(
                  "px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 flex items-center gap-2 shadow-sm",
                  debtFilter
                    ? "bg-red-500 text-white border border-red-600"
                    : "bg-primary-bg text-ink/40 hover:text-accent border border-border/50 hover:border-accent/40"
                )}
              >
                <Filter size={18} />
                <span className="hidden md:inline">Impayées</span>
              </button>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {invoices
              .filter(inv => {
                const matchSearch = inv.client.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                   (inv.prestationName || '').toLowerCase().includes(searchQuery.toLowerCase());
                const matchDebt = !debtFilter || (inv.paidAmount < inv.amount);
                return matchSearch && matchDebt;
              })
              .map((invoice, idx) => (
              <motion.div
                key={invoice.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="card-premium p-6 md:p-8 group hover:shadow-lg transition-all duration-300 flex flex-col"
              >
                <div className="mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-[10px] text-ink/30 uppercase tracking-widest font-bold mb-1">Facture</p>
                      <h3 className="font-serif font-bold text-xl text-ink tracking-tight">FAC-{invoice.id.slice(0, 8).toUpperCase()}</h3>
                    </div>
                    <span className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                      invoice.paidAmount >= invoice.amount
                        ? "bg-green-50 text-green-600 border-green-100"
                        : "bg-red-50 text-red-500 border-red-100"
                    )}>
                      {invoice.paidAmount >= invoice.amount ? "Payée" : "Impayée"}
                    </span>
                  </div>
                  <p className="text-sm text-ink/60 font-medium mt-3">
                    <span className="text-ink/40">Client:</span> <span className="text-ink font-bold">{invoice.client}</span>
                  </p>
                  {invoice.prestationName && (
                    <p className="text-sm text-ink/60 font-medium mt-2">
                      <span className="text-ink/40">Prestation:</span> <span className="text-accent font-bold">{invoice.prestationName}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-3 mb-6 pb-6 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-ink/40 font-medium">Date</span>
                    <span className="font-medium text-ink text-sm">{new Date(invoice.date).toLocaleDateString('fr-FR')}</span>
                  </div>
                  {invoice.workerName && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-ink/40 font-medium">Travailleur</span>
                      <span className="font-medium text-ink text-sm">{invoice.workerName}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-ink/40 font-medium">Téléphone</span>
                    <span className="font-medium text-ink text-sm">{invoice.phone || '-'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-primary-bg/50 p-3 rounded-xl border border-border/30 text-center">
                    <p className="text-[9px] text-ink/30 uppercase tracking-widest font-bold mb-1">Total</p>
                    <p className="font-serif font-bold text-accent text-base">{formatCurrency(invoice.amount)}</p>
                  </div>
                  <div className={cn(
                    "p-3 rounded-xl border text-center",
                    invoice.paidAmount > 0
                      ? "bg-green-50/50 border-green-100/50"
                      : "bg-primary-bg/50 border-border/30"
                  )}>
                    <p className={cn(
                      "text-[9px] uppercase tracking-widest font-bold mb-1",
                      invoice.paidAmount > 0 ? "text-green-600/60" : "text-ink/30"
                    )}>Payé</p>
                    <p className={cn(
                      "font-serif font-bold text-base",
                      invoice.paidAmount > 0 ? "text-green-600" : "text-ink/40"
                    )}>{formatCurrency(invoice.paidAmount)}</p>
                  </div>
                  <div className={cn(
                    "p-3 rounded-xl border text-center",
                    invoice.paidAmount < invoice.amount
                      ? "bg-red-50/50 border-red-100/50"
                      : "bg-green-50/50 border-green-100/50"
                  )}>
                    <p className={cn(
                      "text-[9px] uppercase tracking-widest font-bold mb-1",
                      invoice.paidAmount < invoice.amount ? "text-red-500/60" : "text-green-600/60"
                    )}>Reste</p>
                    <p className={cn(
                      "font-serif font-bold text-base",
                      invoice.paidAmount < invoice.amount ? "text-red-500" : "text-green-600"
                    )}>{formatCurrency(Math.max(0, invoice.amount - invoice.paidAmount))}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-auto">
                  <button 
                    onClick={() => setViewingInvoice(invoice)}
                    className="flex-1 py-3 rounded-xl bg-primary-bg text-ink/40 hover:text-accent hover:bg-white border border-transparent hover:border-accent/20 transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Eye size={16} /> Détails
                  </button>
                  <button 
                    onClick={() => setEditingInvoice(invoice)}
                    className="p-3 rounded-xl bg-primary-bg text-ink/40 hover:text-accent hover:bg-white border border-transparent hover:border-accent/20 transition-all shadow-sm"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handlePrint(invoice)}
                    className="p-3 rounded-xl bg-primary-bg text-ink/40 hover:text-accent hover:bg-white border border-transparent hover:border-accent/20 transition-all shadow-sm"
                  >
                    <Printer size={18} />
                  </button>
                  <button 
                    onClick={() => confirmDelete('invoice', invoice.id, `Facture ${invoice.id.slice(0, 8)}`)}
                    className="p-3 rounded-xl bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {invoices.filter(inv => {
            const matchSearch = inv.client.toLowerCase().includes(searchQuery.toLowerCase());
            const matchDebt = !debtFilter || (inv.paidAmount < inv.amount);
            return matchSearch && matchDebt;
          }).length === 0 && (
            <div className="text-center py-16">
              <FileText size={48} className="mx-auto mb-4 text-ink/10" />
              <p className="text-ink/40 font-medium">Aucune facture trouvée</p>
            </div>
          )}
        </div>
      )}
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[24px] md:rounded-[32px] p-6 md:p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-6">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">Confirmer la suppression</h3>
                <p className="text-sm md:text-base text-ink/40 font-medium">
                  Êtes-vous sûr de vouloir supprimer <span className="text-ink font-bold">"{deleteConfirm.name}"</span> ? Cette action est irréversible.
                </p>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 md:py-4 rounded-2xl bg-white border border-border font-bold text-ink/40 hover:text-ink transition-all">Annuler</button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 py-3 md:py-4 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Invoice Modal */}
      <AnimatePresence>
        {viewingInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingInvoice(null)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-2xl md:text-3xl font-serif font-bold text-ink tracking-tight">Détails de la facture</h3>
                    <p className="text-sm text-ink/40 font-medium mt-1">FAC-{viewingInvoice.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <button onClick={() => setViewingInvoice(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-4">
                    <div className="p-4 bg-primary-bg rounded-2xl border border-border/50">
                      <p className="text-[10px] text-ink/30 uppercase tracking-widest font-bold mb-2">Informations Client</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-ink/40 mb-0.5">Nom du client</p>
                          <p className="font-bold text-ink text-base">{viewingInvoice.client}</p>
                        </div>
                        <div>
                          <p className="text-xs text-ink/40 mb-0.5">Téléphone</p>
                          <p className="font-medium text-ink text-base">{viewingInvoice.phone || '-'}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-primary-bg rounded-2xl border border-border/50">
                      <p className="text-[10px] text-ink/30 uppercase tracking-widest font-bold mb-2">Informations de Prestation</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-ink/40 mb-0.5">Type de prestation</p>
                          <p className="font-bold text-accent text-base">{viewingInvoice.prestationName || '-'}</p>
                        </div>
                        {viewingInvoice.workerName && (
                          <div>
                            <p className="text-xs text-ink/40 mb-0.5">Travailleur assigné</p>
                            <p className="font-medium text-ink text-base">{viewingInvoice.workerName}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-primary-bg rounded-2xl border border-border/50">
                      <p className="text-[10px] text-ink/30 uppercase tracking-widest font-bold mb-2">Date et Heure</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-ink/40 mb-0.5">Date de réservation</p>
                          <p className="font-medium text-ink text-base flex items-center gap-2">
                            <Clock size={16} className="text-accent" />
                            {new Date(viewingInvoice.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        </div>
                        {viewingInvoice.time && (
                          <div>
                            <p className="text-xs text-ink/40 mb-0.5">Heure</p>
                            <p className="font-medium text-ink text-base">{viewingInvoice.time}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={cn(
                      "p-4 rounded-2xl border",
                      viewingInvoice.paidAmount >= viewingInvoice.amount
                        ? "bg-green-50 border-green-100"
                        : "bg-red-50 border-red-100"
                    )}>
                      <p className={cn(
                        "text-[10px] uppercase tracking-widest font-bold mb-2",
                        viewingInvoice.paidAmount >= viewingInvoice.amount
                          ? "text-green-600"
                          : "text-red-500"
                      )}>Statut du Paiement</p>
                      <div className="flex items-center gap-2">
                        {viewingInvoice.paidAmount >= viewingInvoice.amount ? (
                          <>
                            <Check size={18} className="text-green-600" />
                            <p className="font-bold text-green-600">Facture Payée Intégralement</p>
                          </>
                        ) : (
                          <>
                            <DollarSign size={18} className="text-red-500" />
                            <p className="font-bold text-red-500">Facture Partiellement Payée</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {(viewingInvoice.services || []).length > 0 && (
                  <div className="mb-8 p-4 bg-primary-bg rounded-2xl border border-border/50">
                    <p className="text-[10px] text-ink/30 uppercase tracking-widest font-bold mb-4">Services Additionnels</p>
                    <div className="space-y-3">
                      {viewingInvoice.services.map((service: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-xl border border-border/50">
                          <div>
                            <p className="font-medium text-ink text-sm">{service.name}</p>
                            {service.description && <p className="text-xs text-ink/40 mt-0.5">{service.description}</p>}
                          </div>
                          <p className="font-bold text-accent text-sm">{formatCurrency(service.price || 0)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 mb-8 p-6 bg-gradient-to-br from-primary-bg to-accent/5 rounded-2xl border border-accent/20">
                  <div className="text-center">
                    <p className="text-[10px] text-ink/40 uppercase tracking-widest font-bold mb-2">Montant Total</p>
                    <p className="font-serif font-bold text-2xl text-ink">{formatCurrency(viewingInvoice.amount)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-green-600 uppercase tracking-widest font-bold mb-2">Montant Payé</p>
                    <p className="font-serif font-bold text-2xl text-green-600">{formatCurrency(viewingInvoice.paidAmount)}</p>
                  </div>
                  <div className="text-center">
                    <p className={cn(
                      "text-[10px] uppercase tracking-widest font-bold mb-2",
                      viewingInvoice.paidAmount < viewingInvoice.amount
                        ? "text-red-500"
                        : "text-green-600"
                    )}>Reste à Payer</p>
                    <p className={cn(
                      "font-serif font-bold text-2xl",
                      viewingInvoice.paidAmount < viewingInvoice.amount
                        ? "text-red-500"
                        : "text-green-600"
                    )}>{formatCurrency(Math.max(0, viewingInvoice.amount - viewingInvoice.paidAmount))}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => { handlePrint(viewingInvoice); setViewingInvoice(null); }}
                    className="flex-1 btn-gradient py-4 flex items-center justify-center gap-2"
                  >
                    <Printer size={20} /> Imprimer
                  </button>
                  <button 
                    onClick={() => { setEditingInvoice(viewingInvoice); setViewingInvoice(null); }}
                    className="flex-1 py-4 bg-primary-bg text-ink/40 hover:text-accent border border-border rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Edit2 size={20} /> Modifier
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Invoice Modal */}
      <AnimatePresence>
        {editingInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingInvoice(null)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-ink tracking-tight">Modifier la facture</h3>
                  <button onClick={() => setEditingInvoice(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-primary-bg rounded-2xl border border-border/50">
                    <p className="text-[10px] text-ink/30 uppercase tracking-widest font-bold mb-2">Facture</p>
                    <p className="font-serif font-bold text-lg text-ink">FAC-{editingInvoice.id.slice(0, 8).toUpperCase()}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Nom du Client</label>
                    <input 
                      type="text" 
                      value={editingInvoice.client}
                      onChange={e => setEditingInvoice({...editingInvoice, client: e.target.value})}
                      className="w-full input-premium" 
                      placeholder="Nom du client..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Téléphone du Client</label>
                    <input 
                      type="text" 
                      value={editingInvoice.phone}
                      onChange={e => setEditingInvoice({...editingInvoice, phone: e.target.value})}
                      className="w-full input-premium" 
                      placeholder="Numéro de téléphone..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Montant Total (DA)</label>
                    <input 
                      type="number" 
                      value={editingInvoice.amount}
                      onChange={e => setEditingInvoice({...editingInvoice, amount: Number(e.target.value)})}
                      className="w-full input-premium" 
                      placeholder="0"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3 p-4 bg-primary-bg rounded-2xl border border-border/50 text-center">
                    <div>
                      <p className="text-[9px] text-ink/40 uppercase tracking-widest font-bold mb-1">Total</p>
                      <p className="font-serif font-bold text-accent">{formatCurrency(editingInvoice.amount)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-green-600 uppercase tracking-widest font-bold mb-1">Payé</p>
                      <p className="font-serif font-bold text-green-600">{formatCurrency(editingInvoice.paidAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-red-500 uppercase tracking-widest font-bold mb-1">Reste</p>
                      <p className="font-serif font-bold text-red-500">{formatCurrency(Math.max(0, editingInvoice.amount - editingInvoice.paidAmount))}</p>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setEditingInvoice(null)}
                      className="flex-1 py-4 bg-white border border-border rounded-2xl font-bold text-ink/40 hover:text-ink transition-all"
                    >
                      Annuler
                    </button>
                    <button 
                      onClick={handleSaveInvoice}
                      className="flex-1 btn-gradient py-4"
                    >
                      Enregistrer les modifications
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Pay Debt Modal */}
      <AnimatePresence>
        {paymentModal.isOpen && paymentModal.purchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPaymentModal({ isOpen: false, purchase: null })}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-6 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-ink tracking-tight">Payer la Dépense</h3>
                  <button onClick={() => setPaymentModal({ isOpen: false, purchase: null })} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-primary-bg rounded-2xl border border-border/50">
                    <p className="text-[10px] text-ink/30 uppercase tracking-widest font-bold mb-2">Description de l'Achat</p>
                    <p className="font-bold text-ink text-lg">{paymentModal.purchase.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-4 bg-primary-bg rounded-2xl border border-border/50">
                    <div>
                      <p className="text-[10px] text-ink/40 uppercase tracking-widest font-bold mb-2">Montant Total</p>
                      <p className="font-serif font-bold text-xl text-ink">{formatCurrency(paymentModal.purchase.cost)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-green-600 uppercase tracking-widest font-bold mb-2">Déjà Payé</p>
                      <p className="font-serif font-bold text-xl text-green-600">{formatCurrency(paymentModal.purchase.paidAmount)}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-red-50/50 rounded-2xl border border-red-100/50">
                    <p className="text-[10px] text-red-500 uppercase tracking-widest font-bold mb-2">Reste à Payer</p>
                    <p className="font-serif font-bold text-2xl text-red-500">{formatCurrency(paymentModal.purchase.cost - paymentModal.purchase.paidAmount)}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Montant du Paiement (DA)</label>
                    <input 
                      type="number" 
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      max={paymentModal.purchase.cost - paymentModal.purchase.paidAmount}
                      className="w-full input-premium" 
                      placeholder="0"
                    />
                  </div>

                  {paymentAmount && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 bg-gradient-to-br from-green-50 to-green-50/50 rounded-2xl border border-green-100 space-y-4"
                    >
                      <div>
                        <p className="text-[10px] text-green-600 uppercase tracking-widest font-bold mb-4">Récapitulatif du Paiement</p>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                            <span className="text-sm text-ink/60">Montant actuel payé</span>
                            <span className="font-bold text-ink">{formatCurrency(paymentModal.purchase.paidAmount)}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                            <span className="text-sm text-ink/60">Nouveau paiement</span>
                            <span className="font-bold text-green-600">+ {formatCurrency(parseFloat(paymentAmount || '0'))}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-green-100/30 rounded-xl border border-green-200">
                            <span className="text-sm font-bold text-green-700">Total après paiement</span>
                            <span className="font-bold text-lg text-green-700">{formatCurrency(paymentModal.purchase.paidAmount + parseFloat(paymentAmount || '0'))}</span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-green-100">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-green-600">Nouveau Reste à Payer:</span>
                          <span className="font-bold text-2xl text-green-600">{formatCurrency(Math.max(0, paymentModal.purchase.cost - (paymentModal.purchase.paidAmount + parseFloat(paymentAmount || '0'))))}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setPaymentModal({ isOpen: false, purchase: null })}
                      className="flex-1 py-4 bg-white border border-border rounded-2xl font-bold text-ink/40 hover:text-ink transition-all"
                    >
                      Annuler
                    </button>
                    <button 
                      onClick={handlePayDebt}
                      disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                      className="flex-1 py-4 bg-green-500 text-white font-bold rounded-2xl hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirmer le Paiement
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Purchase Modal */}
      <AnimatePresence>
        {editingPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPurchase(null)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-ink tracking-tight">Éditer l'Achat</h3>
                  <button onClick={() => setEditingPurchase(null)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Fournisseur</label>
                    <select 
                      value={editingPurchase.supplierId}
                      onChange={e => setEditingPurchase({...editingPurchase, supplierId: e.target.value})}
                      className="w-full input-premium"
                    >
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Description</label>
                    <input 
                      type="text" 
                      value={editingPurchase.description}
                      onChange={e => setEditingPurchase({...editingPurchase, description: e.target.value})}
                      className="w-full input-premium" 
                      placeholder="Description de l'achat..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Coût Total (DA)</label>
                    <input 
                      type="number" 
                      value={editingPurchase.cost}
                      onChange={e => setEditingPurchase({...editingPurchase, cost: Number(e.target.value)})}
                      className="w-full input-premium" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Montant Payé (DA)</label>
                    <input 
                      type="number" 
                      value={editingPurchase.paidAmount}
                      onChange={e => setEditingPurchase({...editingPurchase, paidAmount: Number(e.target.value)})}
                      className="w-full input-premium" 
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3 p-4 bg-primary-bg rounded-2xl border border-border/50 text-center">
                    <div>
                      <p className="text-[9px] text-ink/40 uppercase tracking-widest font-bold mb-1">Total</p>
                      <p className="font-serif font-bold text-ink">{formatCurrency(editingPurchase.cost)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-green-600 uppercase tracking-widest font-bold mb-1">Payé</p>
                      <p className="font-serif font-bold text-green-600">{formatCurrency(editingPurchase.paidAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-red-500 uppercase tracking-widest font-bold mb-1">Reste</p>
                      <p className="font-serif font-bold text-red-500">{formatCurrency(Math.max(0, editingPurchase.cost - editingPurchase.paidAmount))}</p>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setEditingPurchase(null)}
                      className="flex-1 py-4 bg-white border border-border rounded-2xl font-bold text-ink/40 hover:text-ink transition-all"
                    >
                      Annuler
                    </button>
                    <button 
                      onClick={handleSavePurchase}
                      className="flex-1 btn-gradient py-4"
                    >
                      Enregistrer les modifications
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Supplier History Modal */}
      <AnimatePresence>
        {supplierHistory.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSupplierHistory({ isOpen: false })}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6 md:mb-8">
                  <div>
                    <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">Historique d'achat</h3>
                    <p className="text-xs md:text-sm text-ink/40 font-medium">{supplierHistory.supplier?.fullName}</p>
                  </div>
                  <button onClick={() => setSupplierHistory({ isOpen: false })} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {purchases.filter(p => p.supplierId === supplierHistory.supplier?.id).length > 0 ? (
                    purchases
                      .filter(p => p.supplierId === supplierHistory.supplier?.id)
                      .map(p => (
                        <div key={p.id} className="p-4 md:p-5 rounded-2xl border border-border flex justify-between items-center hover:bg-accent/[0.02] transition-all">
                          <div>
                            <p className="font-bold text-ink text-sm md:text-base">{p.description}</p>
                            <p className="text-[10px] md:text-xs text-ink/40 font-medium mt-1">{p.date}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-serif font-bold text-accent text-sm md:text-base">{formatCurrency(p.cost)}</p>
                            <p className="text-[9px] md:text-[10px] text-green-600 font-bold uppercase tracking-widest mt-1">Payé: {formatCurrency(p.paidAmount)}</p>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-12 text-ink/20">
                      <ShoppingBag size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-medium">Aucun achat enregistré</p>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => setSupplierHistory({ isOpen: false })}
                  className="w-full py-3 md:py-4 rounded-2xl bg-white border border-border font-bold text-ink/40 hover:text-ink transition-all mt-8"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Inventory;
