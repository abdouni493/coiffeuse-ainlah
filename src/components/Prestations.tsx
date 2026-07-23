import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Edit2, Trash2, Scissors, Sparkles, Star, X, Check, AlertCircle } from 'lucide-react';
import { Prestation, Service } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';

const Prestations: React.FC = () => {
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const [prestationsRes, servicesRes] = await Promise.all([
      supabase.from('prestations').select('*'),
      supabase.from('services').select('*')
    ]);

    if (prestationsRes.data) setPrestations(prestationsRes.data);
    if (servicesRes.data) setServices(servicesRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'prestation' | 'service';
    mode: 'add' | 'edit';
    item?: Prestation | Service;
  }>({
    isOpen: false,
    type: 'prestation',
    mode: 'add'
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'prestation' | 'service';
    id: string;
    name: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: ''
  });

  const openModal = (type: 'prestation' | 'service', mode: 'add' | 'edit', item?: Prestation | Service) => {
    setModal({ isOpen: true, type, mode, item });
    if (item) {
      setFormData({
        name: item.name,
        description: item.description || '',
        price: item.price.toString()
      });
    } else {
      setFormData({ name: '', description: '', price: '' });
    }
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  const handleSave = async () => {
    const table = modal.type === 'prestation' ? 'prestations' : 'services';
    const itemData = {
      name: formData.name,
      description: formData.description,
      price: Number(formData.price)
    };

    if (modal.mode === 'edit' && modal.item) {
      const { error } = await supabase
        .from(table)
        .update(itemData)
        .eq('id', modal.item.id);
      if (error) console.error(`Error updating ${modal.type}:`, error);
    } else {
      const { error } = await supabase
        .from(table)
        .insert([itemData]);
      if (error) console.error(`Error adding ${modal.type}:`, error);
    }
    
    fetchData();
    closeModal();
  };

  const confirmDelete = (type: 'prestation' | 'service', id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, type, id, name });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const table = deleteConfirm.type === 'prestation' ? 'prestations' : 'services';
    
    try {
      console.log(`[DELETE] Starting ${deleteConfirm.type} deletion:`, deleteConfirm.id);
      
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq('id', deleteConfirm.id)
        .select();

      if (error) {
        console.error(`[DELETE ERROR] Failed to delete ${deleteConfirm.type}:`, error);
        throw error;
      }

      await fetchData();
      setDeleteConfirm(null);
    } catch (error) {
      console.error(`[DELETE CRITICAL ERROR] ${deleteConfirm.type}:`, error);
      alert(`Erreur lors de la suppression: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-16 pb-20">
      <section className="space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-4xl font-serif font-bold text-ink tracking-tight flex items-center gap-4">
              <Scissors className="text-accent" size={32} /> Prestations
            </h2>
            <p className="text-ink/40 mt-2 font-medium">Gérez vos catégories de prestations principales et leurs tarifs</p>
          </div>
          <button 
            onClick={() => openModal('prestation', 'add')}
            className="btn-gradient shimmer flex items-center gap-2.5 px-8 py-3"
          >
            <Plus size={20} /> Ajouter une prestation
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {prestations.map((p, idx) => (
            <motion.div 
              key={p.id} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="card-premium p-8 flex flex-col group hover:translate-y-[-4px] transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-inner group-hover:bg-accent group-hover:text-white transition-all duration-500">
                  <Scissors size={28} />
                </div>
                <div className="flex gap-2 opacity-100 transition-all duration-300">
                  <button 
                    onClick={() => openModal('prestation', 'edit', p)}
                    className="p-2.5 rounded-xl bg-white border border-border text-ink/40 hover:text-accent hover:border-accent/40 transition-all shadow-sm"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => confirmDelete('prestation', p.id, p.name)}
                    className="p-2.5 rounded-xl bg-white border border-border text-red-400 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <h4 className="font-serif font-bold text-2xl text-ink tracking-tight mb-3">{p.name}</h4>
              <p className="text-sm text-ink/40 mb-8 font-medium leading-relaxed line-clamp-2">{p.description}</p>
              <div className="mt-auto pt-6 border-t border-border flex items-center justify-between">
                <span className="text-2xl font-serif font-bold text-accent">{formatCurrency(p.price)}</span>
                <div className="flex items-center gap-1.5 text-ink/20">
                  <Star size={14} fill="currentColor" className="text-accent" />
                  <span className="text-xs font-bold text-ink/40">Populaire</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-4xl font-serif font-bold text-ink tracking-tight flex items-center gap-4">
              <Sparkles className="text-accent" size={32} /> Services Additionnels
            </h2>
            <p className="text-ink/40 mt-2 font-medium">Options et suppléments pour personnaliser les rendez-vous</p>
          </div>
          <button 
            onClick={() => openModal('service', 'add')}
            className="px-8 py-3 rounded-2xl bg-white border border-border text-sm font-bold text-ink/60 hover:text-accent hover:border-accent/40 transition-all duration-300 flex items-center gap-2.5 shadow-sm"
          >
            <Plus size={20} /> Ajouter un service
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s, idx) => (
            <motion.div 
              key={s.id} 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="card-premium p-6 flex items-center justify-between group hover:bg-accent/[0.02] transition-all duration-300"
            >
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-primary-bg/50 border border-border/50 flex items-center justify-center text-accent group-hover:scale-110 transition-transform duration-500">
                  <Star size={24} />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-lg text-ink tracking-tight">{s.name}</h4>
                  <p className="text-xs text-ink/40 font-medium mt-0.5">{s.description || 'Service complémentaire'}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-serif font-bold text-xl text-accent">{formatCurrency(s.price)}</span>
                <div className="flex gap-1 opacity-100 transition-all duration-300">
                  <button 
                    onClick={() => openModal('service', 'edit', s)}
                    className="p-2 text-ink/30 hover:text-accent transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => confirmDelete('service', s.id, s.name)}
                    className="p-2 text-ink/30 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {modal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden mx-auto max-h-[90vh] flex flex-col"
            >
              <div className="p-5 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">
                    {modal.mode === 'add' ? 'Ajouter' : 'Modifier'} {modal.type === 'prestation' ? 'une prestation' : 'un service'}
                  </h3>
                  <button onClick={closeModal} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Nom</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full input-premium" 
                      placeholder="Ex: Coiffure Femme"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Description</label>
                    <textarea 
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full input-premium min-h-[100px] py-4" 
                      placeholder="Description détaillée..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Prix (DA)</label>
                    <input 
                      type="number" 
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                      className="w-full input-premium" 
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={closeModal} className="flex-1 py-4 rounded-2xl bg-white border border-border font-bold text-ink/40 hover:text-ink transition-all">Annuler</button>
                  <button 
                    onClick={handleSave}
                    disabled={!formData.name || !formData.price}
                    className="flex-1 btn-gradient shimmer py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check size={20} /> Enregistrer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              className="relative w-full max-w-md bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden mx-auto"
            >
              <div className="p-6 md:p-8 text-center space-y-6">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto">
                  <AlertCircle size={32} className="md:size-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">Confirmer la suppression</h3>
                  <p className="text-sm md:text-base text-ink/40 font-medium">
                    Êtes-vous sûr de vouloir supprimer <span className="text-ink font-bold">"{deleteConfirm.name}"</span> ? Cette action est irréversible.
                  </p>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-4 rounded-2xl bg-white border border-border font-bold text-ink/40 hover:text-ink transition-all">Annuler</button>
                  <button 
                    onClick={handleDelete}
                    className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Prestations;
