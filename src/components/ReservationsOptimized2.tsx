import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Calendar as CalendarIcon, Clock, User, Phone, Check, X, Edit2, Trash2, 
  AlertCircle, DollarSign, Printer, Eye, ChevronRight, ChevronLeft
} from 'lucide-react';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Reservation, Prestation, Service, User as Employee, StoreConfig } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { fetchReservations, fetchDashboardData } from '../lib/dataService';
import { useDebounce, usePagination } from '../lib/hooks';

interface ReservationsOptimizedProps {
  user: Employee;
  config: StoreConfig;
}

const ReservationsOptimized: React.FC<ReservationsOptimizedProps> = ({ user: currentUser, config }) => {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPrestationId, setFilteredPrestationId] = useState<string | 'all'>('all');
  const [debtFilter, setDebtFilter] = useState<'all' | 'debt'>('all');
  const [dateRange, setDateRange] = useState({ start: new Date(), end: addDays(new Date(), 30) });
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string } | null>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount).replace('DZD', 'DA');
  };

  // OPTIMIZED: Parallel data fetching with Promise.all
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Parallel fetch of dashboard data (includes reservations)
      const [dashboardData, presData, servData, empData] = await Promise.all([
        fetchDashboardData(),
        supabase.from('prestations').select('*'),
        supabase.from('services').select('*'),
        supabase.from('profiles').select('*').neq('role', 'admin')
      ]);

      if (dashboardData.reservations) {
        setReservations(dashboardData.reservations);
      }
      
      if (presData.data) {
        setPrestations(presData.data.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          createdAt: p.created_at
        })));
      }

      if (servData.data) {
        setServices(servData.data.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price,
          createdAt: s.created_at
        })));
      }

      if (empData.data) {
        setEmployees(empData.data.map(e => ({
          id: e.id,
          username: e.username,
          email: e.email || '',
          fullName: e.full_name,
          role: e.role,
          avatarUrl: e.avatar_url,
          phone: e.phone,
          address: e.address,
          paymentType: e.payment_type,
          percentage: e.percentage,
          createdAt: e.created_at
        })));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // OPTIMIZED: Memoized filtered data with date range
  const filteredReservations = useMemo(() => {
    return reservations.filter(res => {
      const resDate = new Date(res.date);
      const inDateRange = resDate >= dateRange.start && resDate <= dateRange.end;
      
      const matchesSearch = debouncedSearchQuery === '' ||
        res.clientName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        res.clientPhone?.includes(debouncedSearchQuery) ||
        (res.clientId?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ?? false);
      
      const matchesPrestation = filteredPrestationId === 'all' || res.prestationId === filteredPrestationId;
      
      const matchesDebt = debtFilter === 'all' || (res.totalPrice - (res.paidAmount || 0)) > 0;
      
      return inDateRange && matchesSearch && matchesPrestation && matchesDebt;
    });
  }, [reservations, debouncedSearchQuery, filteredPrestationId, debtFilter, dateRange]);

  // OPTIMIZED: Pagination with explicit typing
  const { currentItems, currentPage, totalPages, goToPage } = usePagination<Reservation>(filteredReservations, 15);

  // OPTIMIZED: Memoized statistics
  const stats = useMemo(() => {
    const total = filteredReservations.reduce((sum, r) => sum + r.totalPrice, 0);
    const paid = filteredReservations.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
    const due = total - paid;

    return { total, paid, due, count: filteredReservations.length };
  }, [filteredReservations]);

  // OPTIMIZED: Memoized add reservation handler
  const handleAddReservation = useCallback(async (data: Partial<Reservation>) => {
    try {
      const { error } = await supabase
        .from('reservations')
        .insert([{
          client_name: data.clientName,
          client_phone: data.clientPhone,
          date: data.date,
          time: data.time,
          prestation_id: data.prestationId,
          worker_id: data.workerId || currentUser.id,
          total_price: data.totalPrice,
          status: 'pending',
          created_by: currentUser.id,
        }]);

      if (error) throw error;

      // If there are services, add them
      if (data.serviceIds && data.serviceIds.length > 0) {
        // This would be handled separately with reservation_services table
      }

      await fetchData();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error adding reservation:', error);
      alert('Error adding reservation');
    }
  }, [currentUser, fetchData]);

  // OPTIMIZED: Memoized update handler
  const handleUpdateReservation = useCallback(async (id: string, data: Partial<Reservation>) => {
    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          client_name: data.clientName,
          client_phone: data.clientPhone,
          date: data.date,
          time: data.time,
          total_price: data.totalPrice,
          paid_amount: data.paidAmount,
          status: data.status,
        })
        .eq('id', id);

      if (error) throw error;

      await fetchData();
      setSelectedReservation(null);
    } catch (error) {
      console.error('Error updating reservation:', error);
      alert('Error updating reservation');
    }
  }, [fetchData]);

  // OPTIMIZED: Memoized delete handler
  const handleDeleteReservation = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchData();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting reservation:', error);
      alert('Error deleting reservation');
    }
  }, [fetchData]);

  // Calendar view data
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getReservationsForDay = useCallback((day: Date) => {
    return filteredReservations.filter(res => isSameDay(new Date(res.date), day));
  }, [filteredReservations]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Reservations</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setView(view === 'list' ? 'calendar' : 'list')}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            {view === 'list' ? 'Calendar' : 'List'} View
          </button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setSelectedReservation(null);
              setIsModalOpen(true);
            }}
            className="bg-gradient-to-r from-primary to-orange-500 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:shadow-lg transition-shadow"
          >
            <Plus size={20} />
            New Reservation
          </motion.button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-600 text-sm font-semibold">Total Reservations</p>
          <p className="text-2xl font-bold text-gray-800">{stats.count}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-600 text-sm font-semibold">Total Revenue</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.total)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-600 text-sm font-semibold">Paid</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.paid)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-600 text-sm font-semibold">Due</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.due)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={filteredPrestationId}
          onChange={(e) => setFilteredPrestationId(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Prestations</option>
          {prestations.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={debtFilter}
          onChange={(e) => setDebtFilter(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Status</option>
          <option value="debt">With Debt</option>
        </select>
      </div>

      {/* List View */}
      {view === 'list' && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Client</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date & Time</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Prestation</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Paid</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((reservation) => {
                  const prestation = prestations.find(p => p.id === reservation.prestationId);
                  const debt = reservation.totalPrice - (reservation.paidAmount || 0);

                  return (
                    <motion.tr
                      key={reservation.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-800">{reservation.clientName}</p>
                          <p className="text-xs text-gray-500">{reservation.clientPhone || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-800">{format(new Date(reservation.date), 'dd MMM yyyy', { locale: fr })}</p>
                        <p className="text-xs text-gray-500">{reservation.time}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-700">{prestation?.name || 'N/A'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-800">{formatCurrency(reservation.totalPrice)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-blue-600">{formatCurrency(reservation.paidAmount || 0)}</p>
                        {debt > 0 && <p className="text-xs text-red-500">Due: {formatCurrency(debt)}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          'inline-block px-3 py-1 text-xs font-semibold rounded-full',
                          reservation.status === 'finalized' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        )}>
                          {reservation.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            onClick={() => {
                              setSelectedReservation(reservation);
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            onClick={() => setDeleteConfirm({ isOpen: true, id: reservation.id })}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 p-4 bg-gray-50 border-t">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => currentPage - 2 + i).filter(p => p > 0 && p <= totalPages).map(page => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={cn(
                    'px-3 py-1 rounded-lg font-semibold transition-all',
                    currentPage === page
                      ? 'bg-primary text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  )}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-gray-800">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </h2>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center font-semibold text-gray-600 py-2">
                {day}
              </div>
            ))}
            {calendarDays.map((day) => {
              const dayReservations = getReservationsForDay(day);
              return (
                <div
                  key={day.toString()}
                  className={cn(
                    'p-2 rounded-lg border-2 min-h-[100px] cursor-pointer transition-all hover:shadow-lg',
                    dayReservations.length > 0
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 bg-white'
                  )}
                >
                  <p className="font-semibold text-gray-800">{format(day, 'd')}</p>
                  <div className="space-y-1 mt-1">
                    {dayReservations.slice(0, 2).map(res => (
                      <div
                        key={res.id}
                        className="text-xs bg-primary text-white p-1 rounded truncate cursor-pointer hover:bg-orange-500 transition-colors"
                        onClick={() => {
                          setSelectedReservation(res);
                          setIsModalOpen(true);
                        }}
                      >
                        {res.clientName}
                      </div>
                    ))}
                    {dayReservations.length > 2 && (
                      <p className="text-xs text-gray-500 px-1">+{dayReservations.length - 2} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirm?.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeleteConfirm(null)}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4"
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="text-red-600" size={24} />
                  <h2 className="text-xl font-bold text-gray-800">Delete Reservation</h2>
                </div>
                <p className="text-gray-700 mb-6">
                  Are you sure you want to delete this reservation? This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDeleteReservation(deleteConfirm.id)}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReservationsOptimized;
