import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, DollarSign, Clock, FileText, Settings, LogOut, User, Mail, Lock, 
  Camera, Edit2, Save, X, Eye, EyeOff, AlertCircle 
} from 'lucide-react';
import { User as UserType } from '../types';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface WorkerDashboardProps {
  user: UserType;
  onLogout: () => void;
}

const WorkerDashboard: React.FC<WorkerDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [reservations, setReservations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [acomptes, setAcomptes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [profileData, setProfileData] = useState({
    fullName: user.fullName,
    username: user.username,
    email: '',
    phone: user.phone || '',
    address: user.address || '',
    newPassword: '',
    confirmPassword: '',
    avatarUrl: user.avatar || ''
  });
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  useEffect(() => {
    fetchWorkerData();
  }, [user.id]);

  const fetchWorkerData = async () => {
    setIsLoading(true);
    try {
      // Fetch worker's reservations and earnings
      const { data: reservationWorkers, error: rwError } = await supabase
        .from('reservation_workers')
        .select(`
          id,
          reservation_id,
          worker_id,
          payment_type,
          amount,
          percentage,
          status,
          reservations(
            id,
            client_name,
            date,
            status,
            total_price,
            paid_amount
          )
        `)
        .eq('worker_id', user.id)
        .order('reservations(date)', { ascending: false });

      if (!rwError && reservationWorkers) {
        setReservations(reservationWorkers);
      }

      // Fetch worker payments
      const { data: paymentsData, error: payError } = await supabase
        .from('employee_payments')
        .select('*')
        .eq('employee_id', user.id)
        .order('date', { ascending: false });

      if (!payError && paymentsData) {
        setPayments(paymentsData.filter(p => p.type === 'payment'));
        setAbsences(paymentsData.filter(p => p.type === 'absence'));
        setAcomptes(paymentsData.filter(p => p.type === 'acompte'));
      }

      // Fetch invoices from reservation_workers
      if (reservationWorkers) {
        setInvoices(reservationWorkers.map(rw => rw.reservations as any).filter(Boolean));
      }

      // Fetch current email from auth
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser?.user?.email) {
        setProfileData(prev => ({ ...prev, email: authUser.user.email || '' }));
      }
    } catch (error) {
      console.error('Error fetching worker data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    setProfileError('');
    setProfileSuccess('');

    try {
      if (profileData.newPassword && profileData.newPassword !== profileData.confirmPassword) {
        setProfileError('Les mots de passe ne correspondent pas');
        return;
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: profileData.fullName,
          username: profileData.username,
          phone: profileData.phone,
          address: profileData.address,
          avatar_url: profileData.avatarUrl
        })
        .eq('id', user.id);

      if (profileError) {
        setProfileError(profileError.message);
        return;
      }

      // Update password if provided
      if (profileData.newPassword) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: profileData.newPassword
        });

        if (passwordError) {
          setProfileError(passwordError.message);
          return;
        }
      }

      // Update email if changed
      if (profileData.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: profileData.email
        });

        if (emailError) {
          setProfileError(emailError.message);
          return;
        }
      }

      setProfileSuccess('Profil mis à jour avec succès!');
      setEditingProfile(false);
      setShowPasswordFields(false);
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (error: any) {
      setProfileError(error.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}_avatar.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath);

      setProfileData(prev => ({ ...prev, avatarUrl: publicUrl }));
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setProfileError('Erreur lors du téléchargement de l\'avatar');
    }
  };

  const totalEarnings = reservations.reduce((sum, rw) => sum + (rw.amount || 0), 0);
  const totalAbsences = absences.reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalAcomptes = acomptes.reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="min-h-screen bg-primary-bg">
      {/* Header */}
      <div className="bg-gradient-to-r from-accent to-accent-light text-white p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            {profileData.avatarUrl ? (
              <img 
                src={profileData.avatarUrl} 
                alt={user.fullName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{profileData.fullName}</h1>
              <p className="text-white/80">Bienvenue dans votre espace</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            Déconnexion
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-ink/10 sticky top-0 bg-white/50 backdrop-blur-sm z-40">
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: 'Vue d\'ensemble', icon: Calendar },
            { id: 'reservations', label: 'Réservations', icon: FileText },
            { id: 'payments', label: 'Paiements', icon: DollarSign },
            { id: 'invoices', label: 'Factures', icon: FileText },
            { id: 'settings', label: 'Paramètres', icon: Settings },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink/60 hover:text-ink'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div
                  whileHover={{ y: -5 }}
                  className="card-premium p-6 border-l-4 border-blue-500"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-ink/60 text-sm font-medium">Revenus Totaux</p>
                      <p className="text-3xl font-bold text-ink mt-2">{formatCurrency(totalEarnings)}</p>
                    </div>
                    <DollarSign className="text-blue-500/20 w-12 h-12" />
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5 }}
                  className="card-premium p-6 border-l-4 border-green-500"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-ink/60 text-sm font-medium">Acomptes</p>
                      <p className="text-3xl font-bold text-ink mt-2">{formatCurrency(totalAcomptes)}</p>
                    </div>
                    <Clock className="text-green-500/20 w-12 h-12" />
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5 }}
                  className="card-premium p-6 border-l-4 border-amber-500"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-ink/60 text-sm font-medium">Absences</p>
                      <p className="text-3xl font-bold text-ink mt-2">{formatCurrency(totalAbsences)}</p>
                    </div>
                    <AlertCircle className="text-amber-500/20 w-12 h-12" />
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ y: -5 }}
                  className="card-premium p-6 border-l-4 border-emerald-500"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-ink/60 text-sm font-medium">Paiements</p>
                      <p className="text-3xl font-bold text-ink mt-2">{formatCurrency(totalPaid)}</p>
                    </div>
                    <Check className="text-emerald-500/20 w-12 h-12" />
                  </div>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Reservations */}
                <motion.div className="card-premium p-6">
                  <h3 className="text-lg font-bold text-ink mb-4">Dernières Réservations</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {reservations.slice(0, 5).map(rw => (
                      <div key={rw.id} className="p-3 bg-ink/5 rounded-lg">
                        <p className="font-medium text-ink">{rw.reservations?.client_name}</p>
                        <p className="text-sm text-ink/60">{new Date(rw.reservations?.date).toLocaleDateString('fr-FR')}</p>
                        <p className="text-sm font-bold text-accent mt-1">{formatCurrency(rw.amount)}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Recent Payments */}
                <motion.div className="card-premium p-6">
                  <h3 className="text-lg font-bold text-ink mb-4">Derniers Paiements</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {payments.slice(0, 5).map(p => (
                      <div key={p.id} className="p-3 bg-ink/5 rounded-lg">
                        <p className="font-medium text-ink">Paiement</p>
                        <p className="text-sm text-ink/60">{new Date(p.date).toLocaleDateString('fr-FR')}</p>
                        <p className="text-sm font-bold text-green-600 mt-1">{formatCurrency(p.amount)}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Reservations Tab */}
          {activeTab === 'reservations' && (
            <motion.div
              key="reservations"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="card-premium p-6">
                <h2 className="text-2xl font-bold text-ink mb-6">Mes Réservations</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="text-left py-3 px-4 font-bold text-ink">Client</th>
                        <th className="text-left py-3 px-4 font-bold text-ink">Date</th>
                        <th className="text-left py-3 px-4 font-bold text-ink">Statut</th>
                        <th className="text-right py-3 px-4 font-bold text-ink">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map(rw => (
                        <tr key={rw.id} className="border-b border-ink/5 hover:bg-ink/2 transition-colors">
                          <td className="py-4 px-4 text-ink">{rw.reservations?.client_name}</td>
                          <td className="py-4 px-4 text-ink">{new Date(rw.reservations?.date).toLocaleDateString('fr-FR')}</td>
                          <td className="py-4 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              rw.reservations?.status === 'completed' ? 'bg-green-100 text-green-700' :
                              rw.reservations?.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {rw.reservations?.status}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-ink">{formatCurrency(rw.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <motion.div
              key="payments"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card-premium p-6 border-l-4 border-green-500">
                  <p className="text-ink/60 text-sm font-medium">Total Payé</p>
                  <p className="text-3xl font-bold text-green-600 mt-2">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="card-premium p-6 border-l-4 border-amber-500">
                  <p className="text-ink/60 text-sm font-medium">Acomptes</p>
                  <p className="text-3xl font-bold text-amber-600 mt-2">{formatCurrency(totalAcomptes)}</p>
                </div>
                <div className="card-premium p-6 border-l-4 border-red-500">
                  <p className="text-ink/60 text-sm font-medium">Absences</p>
                  <p className="text-3xl font-bold text-red-600 mt-2">{formatCurrency(totalAbsences)}</p>
                </div>
              </div>

              <div className="card-premium p-6">
                <h3 className="text-xl font-bold text-ink mb-4">Historique des Paiements</h3>
                <div className="space-y-3">
                  {payments.map(p => (
                    <div key={p.id} className="p-4 bg-ink/5 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium text-ink">Paiement</p>
                        <p className="text-sm text-ink/60">{new Date(p.date).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <p className="font-bold text-green-600">{formatCurrency(p.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-premium p-6">
                <h3 className="text-xl font-bold text-ink mb-4">Acomptes</h3>
                <div className="space-y-3">
                  {acomptes.map(a => (
                    <div key={a.id} className="p-4 bg-ink/5 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium text-ink">Acompte</p>
                        <p className="text-sm text-ink/60">{a.description || new Date(a.date).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <p className="font-bold text-amber-600">{formatCurrency(a.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-premium p-6">
                <h3 className="text-xl font-bold text-ink mb-4">Absences</h3>
                <div className="space-y-3">
                  {absences.map(a => (
                    <div key={a.id} className="p-4 bg-ink/5 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium text-ink">Absence</p>
                        <p className="text-sm text-ink/60">{a.description || new Date(a.date).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <p className="font-bold text-red-600">{formatCurrency(a.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Invoices Tab */}
          {activeTab === 'invoices' && (
            <motion.div
              key="invoices"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="card-premium p-6">
                <h2 className="text-2xl font-bold text-ink mb-6">Mes Factures</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {invoices.map(inv => (
                    <div key={inv.id} className="p-4 border border-ink/10 rounded-lg hover:shadow-lg transition-shadow">
                      <p className="font-bold text-ink">{inv.client_name}</p>
                      <p className="text-sm text-ink/60">{new Date(inv.date).toLocaleDateString('fr-FR')}</p>
                      <p className="text-lg font-bold text-accent mt-2">{formatCurrency(inv.total_price)}</p>
                      <span className={`inline-block mt-2 px-2 py-1 text-xs rounded font-bold ${
                        inv.status === 'completed' ? 'bg-green-100 text-green-700' :
                        inv.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="max-w-2xl">
                <div className="card-premium p-8">
                  <h2 className="text-2xl font-bold text-ink mb-6">Paramètres du Profil</h2>

                  {profileError && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 mb-6">
                      {profileError}
                    </div>
                  )}

                  {profileSuccess && (
                    <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 mb-6">
                      {profileSuccess}
                    </div>
                  )}

                  <div className="space-y-6">
                    {/* Avatar */}
                    <div>
                      <label className="text-sm font-bold uppercase text-ink/60 mb-3 block">Photo de Profil</label>
                      <div className="flex items-end gap-4">
                        <div className="w-24 h-24 rounded-full bg-ink/5 flex items-center justify-center overflow-hidden">
                          {profileData.avatarUrl ? (
                            <img src={profileData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-12 h-12 text-ink/30" />
                          )}
                        </div>
                        <label className="px-4 py-2 bg-accent text-white rounded-lg cursor-pointer hover:bg-accent-dark transition-colors">
                          <Camera size={18} className="inline mr-2" />
                          Changer
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {editingProfile ? (
                      <>
                        {/* Editable Fields */}
                        <div>
                          <label className="text-sm font-bold uppercase text-ink/60 mb-2 block">Nom Complet</label>
                          <input
                            type="text"
                            value={profileData.fullName}
                            onChange={(e) => setProfileData(prev => ({ ...prev, fullName: e.target.value }))}
                            className="input-premium w-full"
                          />
                        </div>

                        <div>
                          <label className="text-sm font-bold uppercase text-ink/60 mb-2 block">Nom d'utilisateur</label>
                          <input
                            type="text"
                            value={profileData.username}
                            onChange={(e) => setProfileData(prev => ({ ...prev, username: e.target.value }))}
                            className="input-premium w-full"
                          />
                        </div>

                        <div>
                          <label className="text-sm font-bold uppercase text-ink/60 mb-2 block">Email</label>
                          <input
                            type="email"
                            value={profileData.email}
                            onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                            className="input-premium w-full"
                          />
                        </div>

                        <div>
                          <label className="text-sm font-bold uppercase text-ink/60 mb-2 block">Téléphone</label>
                          <input
                            type="tel"
                            value={profileData.phone}
                            onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                            className="input-premium w-full"
                          />
                        </div>

                        <div>
                          <label className="text-sm font-bold uppercase text-ink/60 mb-2 block">Adresse</label>
                          <input
                            type="text"
                            value={profileData.address}
                            onChange={(e) => setProfileData(prev => ({ ...prev, address: e.target.value }))}
                            className="input-premium w-full"
                          />
                        </div>

                        {/* Password Change */}
                        <div>
                          <button
                            onClick={() => setShowPasswordFields(!showPasswordFields)}
                            className="text-accent font-medium hover:underline flex items-center gap-2"
                          >
                            {showPasswordFields ? <EyeOff size={18} /> : <Eye size={18} />}
                            {showPasswordFields ? 'Masquer' : 'Changer'} le mot de passe
                          </button>
                        </div>

                        {showPasswordFields && (
                          <>
                            <div>
                              <label className="text-sm font-bold uppercase text-ink/60 mb-2 block">Nouveau Mot de Passe</label>
                              <input
                                type="password"
                                value={profileData.newPassword}
                                onChange={(e) => setProfileData(prev => ({ ...prev, newPassword: e.target.value }))}
                                className="input-premium w-full"
                                placeholder="••••••••"
                              />
                            </div>

                            <div>
                              <label className="text-sm font-bold uppercase text-ink/60 mb-2 block">Confirmer le Mot de Passe</label>
                              <input
                                type="password"
                                value={profileData.confirmPassword}
                                onChange={(e) => setProfileData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                className="input-premium w-full"
                                placeholder="••••••••"
                              />
                            </div>
                          </>
                        )}

                        {/* Buttons */}
                        <div className="flex gap-3 pt-6">
                          <button
                            onClick={handleUpdateProfile}
                            className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors font-medium"
                          >
                            <Save size={20} />
                            Enregistrer
                          </button>
                          <button
                            onClick={() => {
                              setEditingProfile(false);
                              setShowPasswordFields(false);
                              setProfileData({
                                fullName: user.fullName,
                                username: user.username,
                                email: profileData.email,
                                phone: user.phone || '',
                                address: user.address || '',
                                newPassword: '',
                                confirmPassword: '',
                                avatarUrl: user.avatar || ''
                              });
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-ink/10 text-ink rounded-lg hover:bg-ink/20 transition-colors font-medium"
                          >
                            <X size={20} />
                            Annuler
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Read-only Fields */}
                        <div>
                          <label className="text-xs font-bold uppercase text-ink/60">Nom Complet</label>
                          <p className="text-lg font-medium text-ink mt-1">{profileData.fullName}</p>
                        </div>

                        <div>
                          <label className="text-xs font-bold uppercase text-ink/60">Nom d'utilisateur</label>
                          <p className="text-lg font-medium text-ink mt-1">{profileData.username}</p>
                        </div>

                        <div>
                          <label className="text-xs font-bold uppercase text-ink/60">Email</label>
                          <p className="text-lg font-medium text-ink mt-1">{profileData.email}</p>
                        </div>

                        <div>
                          <label className="text-xs font-bold uppercase text-ink/60">Téléphone</label>
                          <p className="text-lg font-medium text-ink mt-1">{profileData.phone || '-'}</p>
                        </div>

                        <div>
                          <label className="text-xs font-bold uppercase text-ink/60">Adresse</label>
                          <p className="text-lg font-medium text-ink mt-1">{profileData.address || '-'}</p>
                        </div>

                        <button
                          onClick={() => setEditingProfile(true)}
                          className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors font-medium mt-6"
                        >
                          <Edit2 size={20} />
                          Modifier le Profil
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Icon import fix
const Check = ({ className }: any) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default WorkerDashboard;
