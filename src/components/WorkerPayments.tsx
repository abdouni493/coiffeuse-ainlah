import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, Clock, AlertCircle, Check, TrendingUp, Calendar, 
  ChevronDown, ChevronUp, Wallet, X, Receipt, Users
} from 'lucide-react';
import { User as UserType, EmployeePayment } from '../types';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface WorkerPaymentsProps {
  user: UserType;
}

interface ReservationDetail {
  clientName: string;
  clientPhone?: string;
  date: string;
  amount: number;
  percentage?: number;
}

const WorkerPayments: React.FC<WorkerPaymentsProps> = ({ user }) => {
  const [allPayments, setAllPayments] = useState<EmployeePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'salary' | 'acompte' | 'absence'>('all');

  useEffect(() => {
    fetchPaymentData();
  }, [user.id]);

  const fetchPaymentData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('employee_payments')
        .select('*')
        .eq('employee_id', user.id)
        .order('date', { ascending: false });

      if (!error && data) {
        const mapped: EmployeePayment[] = data.map(p => ({
          id: p.id,
          employeeId: p.employee_id,
          amount: p.amount,
          type: p.type,
          description: p.description,
          date: p.date,
          status: p.status || 'unpaid',
          reservation_details: p.reservation_details
            ? (typeof p.reservation_details === 'string'
                ? p.reservation_details
                : JSON.stringify(p.reservation_details))
            : undefined
        }));
        setAllPayments(mapped);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const parseReservationDetails = (raw?: string): ReservationDetail[] => {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const salaryPayments = allPayments.filter(p => p.type === 'salary');
  const acomptePayments = allPayments.filter(p => p.type === 'acompte');
  const absencePayments = allPayments.filter(p => p.type === 'absence');

  const totalSalary = salaryPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAcomptes = acomptePayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAbsences = absencePayments.reduce((s, p) => s + (p.amount || 0), 0);

  const filteredPayments = activeTab === 'all' ? allPayments
    : activeTab === 'salary' ? salaryPayments
    : activeTab === 'acompte' ? acomptePayments
    : absencePayments;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  const typeConfig = {
    salary: { label: 'Paiement Salaire', color: 'emerald', icon: Check, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    acompte: { label: 'Acompte', color: 'blue', icon: Wallet, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
    absence: { label: 'Absence', color: 'red', icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
        <p className="text-ink/40 font-medium animate-pulse">Chargement de vos paiements...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-serif font-bold text-ink tracking-tight">Mes Paiements</h2>
        <p className="text-ink/40 mt-2 font-medium">Consultez l'historique de vos salaires, acomptes et absences</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Total Salaires', value: totalSalary, icon: Check, gradient: 'from-emerald-500/10 to-emerald-400/5', border: 'border-emerald-200/60', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
          { label: 'Total Acomptes', value: totalAcomptes, icon: Wallet, gradient: 'from-blue-500/10 to-blue-400/5', border: 'border-blue-200/60', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600', valueColor: 'text-blue-700' },
          { label: 'Total Absences', value: totalAbsences, icon: AlertCircle, gradient: 'from-red-500/10 to-red-400/5', border: 'border-red-200/60', iconBg: 'bg-red-500/10', iconColor: 'text-red-600', valueColor: 'text-red-700' },
          { label: 'Net Reçu', value: totalSalary, icon: TrendingUp, gradient: 'from-accent/10 to-accent/5', border: 'border-accent/30', iconBg: 'bg-accent/10', iconColor: 'text-accent', valueColor: 'text-accent' },
        ].map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className={`card-premium p-6 bg-gradient-to-br ${card.gradient} border ${card.border}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-ink/50 uppercase tracking-widest mb-3">{card.label}</p>
                <p className={`text-2xl font-serif font-bold ${card.valueColor} tracking-tight`}>
                  {formatCurrency(card.value)}
                </p>
              </div>
              <div className={`w-11 h-11 rounded-2xl ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                <card.icon size={20} className={card.iconColor} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tab Filters */}
      <div className="flex gap-2 bg-primary-bg/60 p-1.5 rounded-2xl border border-border/40 w-fit">
        {([
          { key: 'all', label: 'Tous', count: allPayments.length },
          { key: 'salary', label: 'Salaires', count: salaryPayments.length },
          { key: 'acompte', label: 'Acomptes', count: acomptePayments.length },
          { key: 'absence', label: 'Absences', count: absencePayments.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'bg-white shadow-sm text-accent border border-accent/20'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              activeTab === tab.key ? 'bg-accent/10 text-accent' : 'bg-ink/10 text-ink/50'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Payment List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredPayments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="card-premium p-16 text-center"
            >
              <Receipt size={48} className="mx-auto text-ink/10 mb-4" />
              <p className="text-ink/40 font-medium">Aucun paiement dans cette catégorie</p>
            </motion.div>
          ) : (
            filteredPayments.map((payment, idx) => {
              const cfg = typeConfig[payment.type] || typeConfig.salary;
              const Icon = cfg.icon;
              const reservations = parseReservationDetails(payment.reservation_details);
              const isExpanded = expandedId === payment.id;
              const hasDetails = reservations.length > 0;

              return (
                <motion.div
                  key={payment.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: idx * 0.04 }}
                  className={`card-premium overflow-hidden border ${cfg.border} transition-all duration-300`}
                >
                  {/* Main Row */}
                  <button
                    onClick={() => hasDetails && setExpandedId(isExpanded ? null : payment.id)}
                    className={`w-full p-5 flex items-center gap-4 text-left transition-colors ${hasDetails ? 'cursor-pointer hover:bg-primary-bg/30' : 'cursor-default'}`}
                  >
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-2xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={20} className={cfg.text} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-ink">{cfg.label}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${cfg.badge}`}>
                          {payment.status === 'paid' ? 'PAYÉ' : 'NON PAYÉ'}
                        </span>
                      </div>
                      {payment.description && (
                        <p className="text-xs text-ink/50 mt-0.5 font-medium truncate max-w-md">{payment.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-ink/40 mt-1">
                        <Calendar size={11} />
                        <span>{formatDate(payment.date)}</span>
                        {hasDetails && (
                          <>
                            <span className="text-ink/20">•</span>
                            <Users size={11} />
                            <span>{reservations.length} réservation{reservations.length > 1 ? 's' : ''}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Amount + expand */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className={`font-serif font-bold text-xl ${cfg.text}`}>
                        {payment.type === 'absence' ? '-' : '+'}{formatCurrency(payment.amount)}
                      </p>
                      {hasDetails && (
                        <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                          <ChevronDown size={16} className={cfg.text} />
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Expanded Reservation Details */}
                  <AnimatePresence>
                    {isExpanded && hasDetails && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className={`border-t ${cfg.border} ${cfg.bg} px-5 py-4`}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-3">Réservations incluses</p>
                          <div className="space-y-2">
                            {reservations.map((res, i) => (
                              <div key={i} className="flex items-center justify-between p-3 bg-white/70 rounded-xl border border-white/80 shadow-sm">
                                <div className="flex items-center gap-3">
                                  <div className={`w-7 h-7 rounded-full ${cfg.bg} border ${cfg.border} flex items-center justify-center`}>
                                    <span className={`text-xs font-bold ${cfg.text}`}>{i + 1}</span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-ink">{res.clientName}</p>
                                    <div className="flex items-center gap-2 text-[11px] text-ink/50 mt-0.5">
                                      {res.clientPhone && <span>{res.clientPhone}</span>}
                                      {res.clientPhone && <span>•</span>}
                                      <span>{new Date(res.date).toLocaleDateString('fr-FR')}</span>
                                      {res.percentage && (
                                        <>
                                          <span>•</span>
                                          <span className={`font-bold ${cfg.text}`}>{res.percentage}%</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <p className={`font-serif font-bold text-sm ${cfg.text}`}>
                                  {formatCurrency(res.amount)}
                                </p>
                              </div>
                            ))}
                          </div>
                          {/* Total row */}
                          <div className={`mt-3 flex justify-between items-center px-3 py-2 rounded-xl border ${cfg.border} bg-white/40`}>
                            <span className="text-xs font-bold text-ink/50 uppercase tracking-wider">Total réservations</span>
                            <span className={`font-serif font-bold ${cfg.text}`}>
                              {formatCurrency(reservations.reduce((s, r) => s + r.amount, 0))}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default WorkerPayments;
