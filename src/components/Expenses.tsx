import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, Wallet, Tag, Calendar, Search, Filter, X, AlertCircle } from 'lucide-react';
import { Expense } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';

const Expenses: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cost: '',
    date: new Date().toISOString().split('T')[0],
  });

  const fetchExpenses = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching expenses:', error);
    } else {
      setExpenses(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => 
      exp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormData({
      name: '',
      description: '',
      cost: '',
      date: new Date().toISOString().split('T')[0],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      name: expense.name,
      description: expense.description,
      cost: expense.cost.toString(),
      date: expense.date,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const expenseData = {
      name: formData.name,
      description: formData.description,
      cost: parseFloat(formData.cost),
      date: formData.date,
    };

    if (editingExpense) {
      const { error } = await supabase
        .from('expenses')
        .update(expenseData)
        .eq('id', editingExpense.id);
      if (error) console.error('Error updating expense:', error);
    } else {
      const { error } = await supabase
        .from('expenses')
        .insert([expenseData]);
      if (error) console.error('Error inserting expense:', error);
    }
    
    fetchExpenses();
    setIsModalOpen(false);
  };

  const confirmDelete = (id: string) => {
    setExpenseToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!expenseToDelete) {
      console.warn('[DELETE] No expense selected for deletion');
      return;
    }
    
    try {
      console.log('[DELETE] Starting expense deletion:', expenseToDelete);
      
      const { data, error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseToDelete)
        .select();

      if (error) {
        console.error('[DELETE ERROR] Failed to delete expense:', error);
        throw error;
      }

      setIsDeleteModalOpen(false);
      setExpenseToDelete(null);
      await fetchExpenses();
    } catch (error) {
      console.error('[DELETE CRITICAL ERROR] Expense deletion failed:', error);
      alert(`Erreur lors de la suppression: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsDeleteModalOpen(false);
      setExpenseToDelete(null);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold text-ink tracking-tight">Dépenses du Magasin</h2>
          <p className="text-ink/40 mt-2 font-medium">Suivez tous les frais fixes et variables de votre établissement</p>
        </div>
        <button 
          onClick={handleOpenAddModal}
          className="btn-gradient shimmer flex items-center gap-2.5 px-8 py-3"
        >
          <Plus size={20} /> Nouvelle Dépense
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex gap-4">
            <div className="flex-1 flex items-center bg-primary-bg/50 rounded-2xl px-5 py-3 border border-border/50 shadow-inner group focus-within:border-accent/40 transition-all">
              <Search size={20} className="text-ink/30 group-focus-within:text-accent transition-colors" />
              <input 
                type="text" 
                placeholder="Rechercher une dépense..." 
                className="bg-transparent border-none focus:ring-0 text-sm ml-3 w-full text-ink placeholder:text-ink/20 font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="p-3.5 rounded-2xl bg-white border border-border text-ink/40 hover:text-accent hover:border-accent/40 transition-all shadow-sm">
              <Filter size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredExpenses.map((exp, idx) => (
              <motion.div 
                key={exp.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="card-premium p-6 group hover:translate-y-[-4px] transition-all duration-300"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-400 group-hover:bg-red-500 group-hover:text-white transition-all duration-500">
                    <Wallet size={24} />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleOpenEditModal(exp)}
                      className="p-2 rounded-lg bg-primary-bg text-ink/40 hover:text-accent transition-all"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => confirmDelete(exp.id)}
                      className="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-serif font-bold text-xl text-ink tracking-tight truncate">{exp.name}</h4>
                    <p className="text-xs text-ink/40 font-medium mt-1 line-clamp-2 h-8">{exp.description}</p>
                  </div>
                  
                  <div className="pt-4 border-t border-border flex justify-between items-end">
                    <div className="flex items-center gap-1.5 text-[10px] text-ink/30 font-bold uppercase tracking-widest">
                      <Calendar size={12} />
                      {new Date(exp.date).toLocaleDateString('fr-FR')}
                    </div>
                    <p className="font-serif font-bold text-2xl text-red-500">{formatCurrency(exp.cost)}</p>
                  </div>
                </div>
              </motion.div>
            ))}

            {filteredExpenses.length === 0 && (
              <div className="col-span-full text-center py-20 bg-primary-bg/30 rounded-3xl border border-dashed border-border">
                <Wallet className="mx-auto text-ink/10 mb-4" size={48} />
                <p className="text-ink/40 font-medium">Aucune dépense trouvée</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card-premium p-8 bg-gradient-to-br from-accent to-accent/80 text-white border-none shadow-xl shadow-accent/20 relative overflow-hidden"
          >
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
            <h3 className="text-xl font-serif font-bold mb-2 relative z-10">Total Dépenses</h3>
            <p className="text-white/60 text-sm mb-8 relative z-10 font-medium">Mois de Mars 2025</p>
            <div className="text-5xl font-serif font-bold mb-10 relative z-10 tracking-tight">
              {formatCurrency(expenses.reduce((acc, curr) => acc + curr.cost, 0))}
            </div>
          </motion.div>


        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-ink/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 border-b border-border/50 flex items-center justify-between bg-primary-bg/30">
                <div>
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-ink">
                    {editingExpense ? 'Modifier la dépense' : 'Nouvelle Dépense'}
                  </h3>
                  <p className="text-xs md:text-sm text-ink/40 font-medium mt-1">
                    {editingExpense ? 'Mettre à jour les détails' : 'Enregistrer un nouveau frais'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 md:p-3 rounded-2xl hover:bg-white text-ink/40 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto custom-scrollbar">
                <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-ink/40 ml-1">Nom de la dépense</label>
                    <div className="relative group">
                      <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20 group-focus-within:text-accent transition-colors" size={18} />
                      <input
                        required
                        type="text"
                        placeholder="Ex: Loyer, Facture Sonelgaz..."
                        className="w-full pl-12 pr-4 py-4 bg-primary-bg/50 border-border/50 rounded-2xl focus:ring-accent focus:border-accent transition-all font-medium text-ink"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-ink/40 ml-1">Description</label>
                    <textarea
                      placeholder="Détails supplémentaires..."
                      className="w-full px-4 py-4 bg-primary-bg/50 border-border/50 rounded-2xl focus:ring-accent focus:border-accent transition-all font-medium text-ink h-24 resize-none"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 ml-1">Montant (DA)</label>
                      <div className="relative group">
                        <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20 group-focus-within:text-accent transition-colors" size={18} />
                        <input
                          required
                          type="number"
                          placeholder="0.00"
                          className="w-full pl-12 pr-4 py-4 bg-primary-bg/50 border-border/50 rounded-2xl focus:ring-accent focus:border-accent transition-all font-medium text-ink"
                          value={formData.cost}
                          onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-ink/40 ml-1">Date</label>
                      <div className="relative group">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20 group-focus-within:text-accent transition-colors" size={18} />
                        <input
                          required
                          type="date"
                          className="w-full pl-12 pr-4 py-4 bg-primary-bg/50 border-border/50 rounded-2xl focus:ring-accent focus:border-accent transition-all font-medium text-ink"
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl bg-primary-bg text-ink/60 font-bold hover:bg-border/50 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] py-4 rounded-2xl bg-accent text-white font-bold shadow-lg shadow-accent/20 hover:bg-accent/90 transition-all"
                  >
                    {editingExpense ? 'Mettre à jour' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-ink/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mx-auto mb-6">
                <AlertCircle size={40} />
              </div>
              <h3 className="text-2xl font-serif font-bold text-ink mb-2">Confirmer la suppression</h3>
              <p className="text-ink/40 font-medium mb-8">
                Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action est irréversible.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={(e) => { e.stopPropagation(); setIsDeleteModalOpen(false); }}
                  className="flex-1 py-4 rounded-2xl bg-primary-bg text-ink/60 font-bold hover:bg-border/50 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Expenses;
