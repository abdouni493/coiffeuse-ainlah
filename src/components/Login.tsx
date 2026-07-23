import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, User as UserIcon, Scissors, ArrowRight } from 'lucide-react';
import { Role } from '../types';
import { supabase } from '../lib/supabase';
import { fetchUserProfile } from '../lib/utils';

interface LoginProps {
  onLogin: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isSignup, setIsSignup]               = useState(false);
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName]               = useState('');
  const [username, setUsername]               = useState('');
  const [isLoading, setIsLoading]             = useState(false);
  const [error, setError]                     = useState('');
  const [logoUrl, setLogoUrl]                 = useState<string | null>(null);
  const [storeName, setStoreName]             = useState<string>('Salon');
  // null = still checking; true = an admin already exists (hide create button)
  const [adminExists, setAdminExists]         = useState<boolean | null>(null);

  React.useEffect(() => { fetchConfigData(); checkAdminExists(); }, []);

  const fetchConfigData = async () => {
    try {
      const { data } = await supabase
        .from('store_config')
        .select('logo_url, name')
        .eq('id', 1)
        .single();
      if (data) {
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.name)     setStoreName(data.name);
      }
    } catch { /* silently skip */ }
  };

  // Ask the DB whether the salon already has an admin. If yes, the "create
  // admin account" option disappears for good.
  const checkAdminExists = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_exists');
      if (error) { setAdminExists(true); return; } // fail safe: hide creation
      setAdminExists(Boolean(data));
      if (data) setIsSignup(false);
    } catch {
      setAdminExists(true);
    }
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message || 'Identifiants invalides');
        return;
      }

      if (data?.user) {
        const profileData = await fetchUserProfile(data.user.id);
        if (!profileData) {
          setError('Profil introuvable. Veuillez réessayer.');
          return;
        }
        onLogin({
          id:          data.user.id,
          username:    profileData.username,
          email:       data.user.email,
          fullName:    profileData.full_name,
          role:        profileData.role,
          avatar:      profileData.avatar_url,
          phone:       profileData.phone,
          address:     profileData.address,
          paymentType: profileData.payment_type,
          percentage:  profileData.percentage,
          dailyRate:   profileData.daily_rate,
          monthlyRate: profileData.monthly_rate,
          createdAt:   profileData.created_at,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Connexion échouée');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Signup ─────────────────────────────────────────────────────────────────
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!fullName || !username || !email || !password) {
        setError('Tous les champs sont obligatoires');
        return;
      }
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas');
        return;
      }
      if (password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }

      // 1. Create the auth user. The DB trigger `handle_new_user` reads this
      //    metadata and creates the matching profile (first account → admin).
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username:  username.trim(),
            full_name: fullName.trim(),
            role:      'admin',
          },
        },
      });
      if (authError) { setError(authError.message || "Erreur lors de la création du compte"); return; }
      if (!data?.user) { setError("Erreur inattendue lors de la création du compte"); return; }

      // 2. Make sure we have an active session. If "Confirm email" is enabled
      //    in Supabase, signUp returns no session — sign in explicitly.
      let session = data.session;
      if (!session) {
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError || !signInData.session) {
          setError("Compte créé. Confirmez votre email (ou désactivez la confirmation d'email dans Supabase) puis connectez-vous.");
          setIsSignup(false);
          return;
        }
        session = signInData.session;
      }

      // 3. Load the freshly-created profile and log in.
      const profile = await fetchUserProfile(session.user.id);
      onLogin({
        id:          session.user.id,
        username:    profile?.username || username.trim(),
        email:       session.user.email || email,
        fullName:    profile?.full_name || fullName.trim(),
        role:        (profile?.role as Role) || 'admin',
        avatar:      profile?.avatar_url,
        createdAt:   profile?.created_at || new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'inscription");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEmail(''); setPassword(''); setConfirmPassword('');
    setFullName(''); setUsername(''); setError('');
  };

  const toggleMode = () => { resetForm(); setIsSignup(!isSignup); };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-primary-bg flex items-center justify-center p-4 md:p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full -z-10 opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent-light/10 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="w-full max-w-md card-premium p-8 md:p-12 relative"
      >
        <div className="flex flex-col items-center mb-12">
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 rounded-3xl bg-linear-to-br from-accent to-accent-light flex items-center justify-center shadow-2xl shadow-accent/30 mb-8"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain rounded-3xl" />
            ) : (
              <Scissors className="text-white w-10 h-10" />
            )}
          </motion.div>
          <h1 className="text-4xl font-serif font-bold text-ink tracking-tight">
            {isSignup ? 'Créer un Compte' : 'Bienvenue'}
          </h1>
          <p className="text-ink/40 mt-3 font-medium text-center">
            {isSignup
              ? 'Créez votre compte pour accéder au salon'
              : `Connectez-vous à votre espace ${storeName}`}
          </p>
        </div>

        <form onSubmit={isSignup ? handleSignupSubmit : handleLoginSubmit} className="space-y-8">
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {isSignup ? (
            <>
              {/* Full name */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Nom Complet</label>
                <div className="relative group">
                  <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 group-focus-within:text-accent transition-colors" size={20} />
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="Marie Dupont" className="w-full input-premium pl-14" required disabled={isLoading} />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Nom d'utilisateur</label>
                <div className="relative group">
                  <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 group-focus-within:text-accent transition-colors" size={20} />
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="marie_salon" className="w-full input-premium pl-14" required disabled={isLoading} />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 group-focus-within:text-accent transition-colors" size={20} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="marie@salon.fr" className="w-full input-premium pl-14" required disabled={isLoading} />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Mot de passe</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 group-focus-within:text-accent transition-colors" size={20} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" className="w-full input-premium pl-14" required disabled={isLoading} />
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Confirmer le mot de passe</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 group-focus-within:text-accent transition-colors" size={20} />
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" className="w-full input-premium pl-14" required disabled={isLoading} />
                </div>
              </div>

              <button type="submit" disabled={isLoading}
                className="w-full btn-gradient shimmer flex items-center justify-center gap-3 group py-4 disabled:opacity-50">
                <span className="tracking-wide">{isLoading ? 'Création en cours...' : 'Créer un Compte'}</span>
                <ArrowRight size={20} className="group-hover:translate-x-1.5 transition-transform duration-300" />
              </button>

              <div className="text-center">
                <p className="text-ink/60 text-sm">
                  Vous avez déjà un compte?{' '}
                  <button type="button" onClick={toggleMode}
                    className="text-accent font-bold hover:text-accent-light transition-colors">
                    Se connecter
                  </button>
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Email */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 group-focus-within:text-accent transition-colors" size={20} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="marie@salon.fr" className="w-full input-premium pl-14" required disabled={isLoading} />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-widest text-ink/60 ml-1">Mot de passe</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/30 group-focus-within:text-accent transition-colors" size={20} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" className="w-full input-premium pl-14" required disabled={isLoading} />
                </div>
              </div>

              <button type="submit" disabled={isLoading}
                className="w-full btn-gradient shimmer flex items-center justify-center gap-3 group py-4 disabled:opacity-50">
                <span className="tracking-wide">{isLoading ? 'Connexion en cours...' : 'Se connecter'}</span>
                <ArrowRight size={20} className="group-hover:translate-x-1.5 transition-transform duration-300" />
              </button>

              {adminExists === false && (
                <div className="text-center">
                  <p className="text-ink/60 text-sm">
                    Première utilisation?{' '}
                    <button type="button" onClick={toggleMode}
                      className="text-accent font-bold hover:text-accent-light transition-colors">
                      Créer le compte administrateur
                    </button>
                  </p>
                </div>
              )}
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
