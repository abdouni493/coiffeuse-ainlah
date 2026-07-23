import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Store, 
  User as UserIcon, 
  Database, 
  Upload, 
  Save, 
  Facebook, 
  Instagram, 
  Phone, 
  MapPin, 
  Mail, 
  Lock,
  Shield,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  Music2
} from 'lucide-react';
import { User, StoreConfig } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface ConfigurationProps {
  user: User;
  config: StoreConfig;
}

const Configuration: React.FC<ConfigurationProps> = ({ user, config: initialConfig }) => {
  const [activeTab, setActiveTab] = useState<'store' | 'profile' | 'database'>('profile');
  const [config, setConfig] = useState<StoreConfig>({
    name: initialConfig?.name || '',
    slogan: initialConfig?.slogan || '',
    phone: initialConfig?.phone || '',
    location: initialConfig?.location || '',
    facebook: initialConfig?.facebook || '',
    instagram: initialConfig?.instagram || '',
    tiktok: initialConfig?.tiktok || '',
    logo: initialConfig?.logo || ''
  });
  const [profile, setProfile] = useState(user);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const restoreInputRef = React.useRef<HTMLInputElement>(null);
  
  // Only show store and database tabs for admins
  const isWorker = user.role === 'worker';

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from('store_config')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (error) {
      console.error('Error fetching store config:', error);
    } else if (data) {
      setConfig({
        name: data.name || '',
        slogan: data.slogan || '',
        phone: data.phone || '',
        location: data.location || '',
        facebook: data.facebook || '',
        instagram: data.instagram || '',
        tiktok: data.tiktok || '',
        logo: data.logo_url || ''
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'avatar' | 'restore') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'restore') {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          
          if (data.salon_config) {
            const { error } = await supabase
              .from('store_config')
              .upsert(data.salon_config);
            if (error) throw error;
          }
          
          window.location.reload();
        } catch (err) {
          console.error('Restore error:', err);
          alert('Erreur lors de la restauration : ' + (err instanceof Error ? err.message : 'Fichier invalide'));
        }
      };
      reader.readAsText(file);
      return;
    }

    setIsSaving(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (type === 'logo') {
        setConfig({ ...config, logo: base64 });
      } else if (type === 'avatar') {
        setProfile({ ...profile, avatar: base64 });
      }
      setIsSaving(false);
    };
    reader.readAsDataURL(file);
  };

  const handleBackup = async () => {
    try {
      const { data: salonConfig } = await supabase.from('store_config').select('*');
      const { data: prestations } = await supabase.from('prestations').select('*');
      const { data: services } = await supabase.from('services').select('*');
      const { data: employees } = await supabase.from('profiles').select('*').neq('role', 'admin');
      
      const backupData = {
        salon_config: salonConfig,
        prestations,
        services,
        employees,
        timestamp: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_salon_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup error:', err);
      alert('Erreur lors de la création de la sauvegarde');
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    
    if (activeTab === 'store') {
      const { error } = await supabase
        .from('store_config')
        .upsert({
          id: 1,
          name: config.name || '',
          slogan: config.slogan || '',
          phone: config.phone || '',
          location: config.location || '',
          facebook: config.facebook || '',
          instagram: config.instagram || '',
          tiktok: config.tiktok || '',
          logo_url: config.logo || ''
        });
      
      if (error) {
        console.error('Error saving salon config:', error);
        alert('Erreur lors de l\'enregistrement: ' + error.message);
      } else {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } else if (activeTab === 'profile') {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.fullName,
          username: profile.username,
          avatar_url: profile.avatar
        })
        .eq('id', user.id);
      
      if (error) {
        console.error('Error saving profile:', error);
        alert('Erreur lors de l\'enregistrement: ' + error.message);
      } else {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    }
    
    setIsSaving(false);
  };

  const tabs = isWorker 
    ? [{ id: 'profile', label: 'Profil', icon: UserIcon }]
    : [
        { id: 'store', label: 'Boutique', icon: Store },
        { id: 'profile', label: 'Profil', icon: UserIcon },
        { id: 'database', label: 'Base de données', icon: Database },
      ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-ink tracking-tight">Configuration</h2>
          <p className="text-ink/60 mt-1">Gérez les paramètres de votre salon et votre profil</p>
        </div>
        
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-xl border border-green-100 shadow-sm"
            >
              <CheckCircle2 size={18} />
              <span className="text-sm font-medium">Modifications enregistrées !</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="glass rounded-3xl p-3 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300",
                  activeTab === tab.id 
                    ? "bg-accent text-on-accent shadow-lg shadow-accent/20" 
                    : "text-ink/60 hover:bg-accent/5 hover:text-accent"
                )}
              >
                <tab.icon size={20} />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="glass rounded-3xl p-6 md:p-8"
            >
              {!isWorker && activeTab === 'store' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-3xl bg-accent/10 flex items-center justify-center overflow-hidden border-2 border-dashed border-accent/20 group-hover:border-accent/40 transition-colors">
                        {config.logo ? (
                          <img src={config.logo} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <Store size={32} className="text-accent/40" />
                        )}
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleFileChange(e, 'logo')}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-2 -right-2 p-2 bg-surface rounded-xl shadow-lg border border-border text-accent hover:scale-110 transition-transform"
                      >
                        <Upload size={16} />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-ink">Logo du salon</h3>
                      <p className="text-sm text-ink/60 mt-1">Format recommandé : PNG ou JPG, min. 512x512px</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Nom du salon</label>
                      <div className="relative">
                        <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
                        <input
                          type="text"
                          value={config.name}
                          onChange={(e) => setConfig({ ...config, name: e.target.value })}
                          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                          placeholder="Ex: Éclat & Soie"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Slogan</label>
                      <input
                        type="text"
                        value={config.slogan}
                        onChange={(e) => setConfig({ ...config, slogan: e.target.value })}
                        className="w-full px-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                        placeholder="Votre beauté, notre passion"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Téléphone</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
                        <input
                          type="text"
                          value={config.phone}
                          onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                          placeholder="06 12 34 56 78"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Adresse</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
                        <input
                          type="text"
                          value={config.location}
                          onChange={(e) => setConfig({ ...config, location: e.target.value })}
                          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                          placeholder="12 Rue de la Beauté, Paris"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border">
                    <h4 className="text-sm font-bold text-ink uppercase tracking-wider mb-6 opacity-60">Réseaux Sociaux</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-ink ml-1">Facebook</label>
                        <div className="relative">
                          <Facebook className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                          <input
                            type="text"
                            value={config.facebook}
                            onChange={(e) => setConfig({ ...config, facebook: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                            placeholder="Nom de la page"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-ink ml-1">Instagram</label>
                        <div className="relative">
                          <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 text-pink-600" size={18} />
                          <input
                            type="text"
                            value={config.instagram}
                            onChange={(e) => setConfig({ ...config, instagram: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                            placeholder="@compte"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-ink ml-1">TikTok</label>
                        <div className="relative">
                          <Music2 className="absolute left-4 top-1/2 -translate-y-1/2 text-ink" size={18} />
                          <input
                            type="text"
                            value={config.tiktok}
                            onChange={(e) => setConfig({ ...config, tiktok: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                            placeholder="@compte_tiktok"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-6">
                    <button
                      onClick={handleSaveConfig}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-8 py-3 bg-accent text-on-accent rounded-2xl font-bold shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                      Enregistrer les modifications
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center overflow-hidden border-2 border-dashed border-accent/20 group-hover:border-accent/40 transition-colors">
                        {profile.avatar ? (
                          <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon size={32} className="text-accent/40" />
                        )}
                      </div>
                      <input 
                        type="file" 
                        ref={avatarInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleFileChange(e, 'avatar')}
                      />
                      <button 
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute -bottom-2 -right-2 p-2 bg-surface rounded-xl shadow-lg border border-border text-accent hover:scale-110 transition-transform"
                      >
                        <Upload size={16} />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-ink">Photo de profil</h3>
                      <p className="text-sm text-ink/60 mt-1">Visible sur la barre de navigation</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Nom complet</label>
                      <input
                        type="text"
                        value={profile.fullName}
                        onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                        className="w-full px-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Nom d'utilisateur</label>
                      <input
                        type="text"
                        value={profile.username}
                        onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                        className="w-full px-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
                        <input
                          type="email"
                          value={profile.email}
                          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-ink ml-1">Nouveau mot de passe</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
                        <input
                          type="password"
                          placeholder="Laisser vide pour ne pas changer"
                          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border focus:border-accent focus:ring-4 focus:ring-accent/5 transition-all outline-none font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-6">
                    <button
                      onClick={handleSaveConfig}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-8 py-3 bg-accent text-on-accent rounded-2xl font-bold shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                      Enregistrer le profil
                    </button>
                  </div>
                </div>
              )}

              {!isWorker && activeTab === 'database' && (
                <div className="space-y-8">
                  <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4">
                    <AlertTriangle className="text-amber-600 flex-shrink-0" size={24} />
                    <div>
                      <h4 className="font-bold text-amber-900">Zone de sécurité</h4>
                      <p className="text-sm text-amber-700 mt-1">
                        Ces actions affectent l'intégralité des données de votre application. 
                        Veuillez effectuer une sauvegarde avant toute opération de restauration.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-3xl border border-border hover:border-accent/40 transition-colors group">
                      <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
                        <Download size={24} />
                      </div>
                      <h4 className="font-bold text-ink">Sauvegarder les données</h4>
                      <p className="text-sm text-ink/60 mt-1 mb-6">Téléchargez une copie complète de votre base de données au format JSON.</p>
                      <button 
                        onClick={handleBackup}
                        className="w-full py-3 bg-surface border border-border rounded-2xl font-bold text-ink hover:bg-accent hover:text-on-accent hover:border-accent transition-all"
                      >
                        Créer une sauvegarde
                      </button>
                    </div>

                    <div className="p-6 rounded-3xl border border-border hover:border-red-100 transition-colors group">
                      <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-500 mb-4 group-hover:scale-110 transition-transform">
                        <RefreshCw size={24} />
                      </div>
                      <h4 className="font-bold text-ink">Restaurer les données</h4>
                      <p className="text-sm text-ink/60 mt-1 mb-6">Importez un fichier de sauvegarde pour restaurer vos données.</p>
                      <input 
                        type="file" 
                        ref={restoreInputRef} 
                        className="hidden" 
                        accept=".json" 
                        onChange={(e) => handleFileChange(e, 'restore')}
                      />
                      <button 
                        onClick={() => restoreInputRef.current?.click()}
                        className="w-full py-3 bg-surface border border-border rounded-2xl font-bold text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
                      >
                        Restaurer depuis un fichier
                      </button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border">
                    <div className="flex items-center justify-between p-4 bg-ink/5 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <Shield className="text-accent" size={20} />
                        <span className="text-sm font-medium text-ink">Dernière sauvegarde automatique</span>
                      </div>
                      <span className="text-sm font-bold text-ink/40 italic">Aujourd'hui à 04:00</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Configuration;
