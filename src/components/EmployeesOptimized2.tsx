import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, User, Phone, MapPin, Briefcase, DollarSign, Calendar, X, Check, AlertCircle, Lock, Mail, MinusCircle, PlusCircle, History, Search } from 'lucide-react';
import { User as Employee, EmployeePayment } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { fetchEmployees, fetchEmployeePayments, batchInsert, batchUpdate } from '../lib/dataService';
import { useDebounce, usePagination, useThrottle } from '../lib/hooks';

const EmployeesOptimized: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<EmployeePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'worker' | 'admin'>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string } | null>(null);
  
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; employee: Employee | null }>({
    isOpen: false,
    employee: null
  });

  const [historyData, setHistoryData] = useState<{
    works: Array<{ id: string; name: string; date: string; status?: string }>;
    payments: EmployeePayment[];
  }>({
    works: [],
    payments: []
  });
  
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean; employee: Employee | null; type: 'acompte' | 'absence' | 'payment' }>({
    isOpen: false,
    employee: null,
    type: 'acompte'
  });

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    address: '',
    role: 'worker' as 'admin' | 'worker',
    paymentType: 'month' as 'days' | 'month' | 'percentage',
    percentage: '',
    username: '',
    email: '',
    password: '',
    createdAt: new Date().toISOString().split('T')[0],
  });

  const [paymentFormData, setPaymentFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Debounce search for better performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount).replace('DZD', 'DA');
  };

  // OPTIMIZED: Parallel fetch with caching
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Parallel fetch from optimized service
      const [fetchedEmployees, fetchedPayments] = await Promise.all([
        fetchEmployees(),
        fetchEmployeePayments()
      ]);

      setEmployees(fetchedEmployees);
      setPayments(fetchedPayments);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // OPTIMIZED: Memoized filtered and paginated data
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = debouncedSearchQuery === '' ||
        emp.fullName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        emp.phone?.includes(debouncedSearchQuery) ||
        emp.username.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      
      const matchesRole = filterRole === 'all' || emp.role === filterRole;
      
      return matchesSearch && matchesRole;
    });
  }, [employees, debouncedSearchQuery, filterRole]);

  // Pagination with explicit typing
  const { currentItems, currentPage, totalPages, goToPage } = usePagination<Employee>(filteredEmployees, 10);

  // OPTIMIZED: Memoized payment stats computed from payment map
  const paymentStats = useMemo(() => {
    const stats = new Map<string, { total: number; advances: number; absences: number }>();
    
    payments.forEach(payment => {
      const existing = stats.get(payment.employeeId) || { total: 0, advances: 0, absences: 0 };
      existing.total += payment.amount;
      if (payment.type === 'acompte') existing.advances += payment.amount;
      if (payment.type === 'absence') existing.absences += payment.amount;
      stats.set(payment.employeeId, existing);
    });
    
    return stats;
  }, [payments]);

  // OPTIMIZED: Memoized add employee handler
  const handleAddEmployee = useCallback(async () => {
    if (!formData.fullName || !formData.username) return;

    try {
      // Sign up new user in Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email || `${formData.username}@salondebeatue.local`,
        password: formData.password || Math.random().toString(36).slice(-8)
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      // Add to profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          username: formData.username,
          full_name: formData.fullName,
          email: formData.email,
          role: formData.role,
          phone: formData.phone,
          address: formData.address,
          payment_type: formData.paymentType,
          percentage: formData.percentage ? parseFloat(formData.percentage) : null,
        }]);

      if (profileError) throw profileError;

      // Refresh data with caching
      await fetchData();
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('Error adding employee');
    }
  }, [formData, fetchData]);

  // OPTIMIZED: Memoized update handler
  const handleUpdateEmployee = useCallback(async () => {
    if (!editingEmployee) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.fullName,
          phone: formData.phone,
          address: formData.address,
          payment_type: formData.paymentType,
          percentage: formData.percentage ? parseFloat(formData.percentage) : null,
        })
        .eq('id', editingEmployee.id);

      if (error) throw error;

      await fetchData();
      setIsModalOpen(false);
      setEditingEmployee(null);
      resetForm();
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Error updating employee');
    }
  }, [editingEmployee, formData, fetchData]);

  // OPTIMIZED: Memoized delete handler
  const handleDeleteEmployee = useCallback(async (employeeId: string) => {
    try {
      await supabase
        .from('profiles')
        .delete()
        .eq('id', employeeId);

      await fetchData();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Error deleting employee');
    }
  }, [fetchData]);

  // OPTIMIZED: Memoized add payment handler
  const handleAddPayment = useCallback(async () => {
    if (!paymentModal.employee || !paymentFormData.amount) return;

    try {
      const { error } = await supabase
        .from('employee_payments')
        .insert([{
          employee_id: paymentModal.employee.id,
          amount: parseFloat(paymentFormData.amount),
          type: paymentModal.type,
          description: paymentFormData.description,
          date: paymentFormData.date,
        }]);

      if (error) throw error;

      await fetchData();
      setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
      setPaymentFormData({ amount: '', description: '', date: new Date().toISOString().split('T')[0] });
    } catch (error) {
      console.error('Error adding payment:', error);
      alert('Error adding payment');
    }
  }, [paymentModal, paymentFormData, fetchData]);

  // OPTIMIZED: Memoized view history handler
  const handleViewHistory = useCallback(async (employee: Employee) => {
    setHistoryModal({ isOpen: true, employee });
    
    const employeePayments = payments.filter(p => p.employeeId === employee.id);
    setHistoryData({
      works: [], // Would fetch from reservations if needed
      payments: employeePayments
    });
  }, [payments]);

  const resetForm = () => {
    setFormData({
      fullName: '',
      phone: '',
      address: '',
      role: 'worker',
      paymentType: 'month',
      percentage: '',
      username: '',
      email: '',
      password: '',
      createdAt: new Date().toISOString().split('T')[0],
    });
  };

  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      fullName: employee.fullName,
      phone: employee.phone || '',
      address: employee.address || '',
      role: employee.role,
      paymentType: employee.paymentType,
      percentage: employee.percentage?.toString() || '',
      username: employee.username,
      email: employee.email || '',
      password: '',
      createdAt: employee.createdAt
    });
    setIsModalOpen(true);
  };

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
        <h1 className="text-3xl font-bold text-gray-800">Employees</h1>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setEditingEmployee(null);
            resetForm();
            setIsModalOpen(true);
          }}
          className="bg-gradient-to-r from-primary to-orange-500 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:shadow-lg transition-shadow"
        >
          <Plus size={20} />
          Add Employee
        </motion.button>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by name, phone, or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Roles</option>
          <option value="worker">Workers</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Contact</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Payment Type</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total Paid</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map((employee) => {
                const stats = paymentStats.get(employee.id);
                return (
                  <motion.tr
                    key={employee.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white">
                          {employee.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{employee.fullName}</p>
                          <p className="text-xs text-gray-500">@{employee.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-gray-700">{employee.phone || 'N/A'}</p>
                      <p className="text-xs text-gray-500">{employee.address || 'No address'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                        {employee.paymentType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-800">{formatCurrency(stats?.total || 0)}</p>
                      <p className="text-xs text-gray-500">Advances: {formatCurrency(stats?.advances || 0)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          onClick={() => openEditModal(employee)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          onClick={() => handleViewHistory(employee)}
                          className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                          title="History"
                        >
                          <History size={18} />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          onClick={() => setDeleteConfirm({ isOpen: true, id: employee.id, name: employee.fullName })}
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
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

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />

                <input
                  type="text"
                  placeholder="Username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={!!editingEmployee}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                />

                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />

                <input
                  type="tel"
                  placeholder="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />

                <input
                  type="text"
                  placeholder="Address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />

                <div className="grid grid-cols-2 gap-4">
                  <select
                    value={formData.paymentType}
                    onChange={(e) => setFormData({ ...formData, paymentType: e.target.value as any })}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="days">Per Day</option>
                    <option value="month">Monthly</option>
                    <option value="percentage">Percentage</option>
                  </select>

                  <input
                    type="number"
                    placeholder="Percentage (%)"
                    value={formData.percentage}
                    onChange={(e) => setFormData({ ...formData, percentage: e.target.value })}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {!editingEmployee && (
                  <input
                    type="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>

              <div className="sticky bottom-0 bg-gray-50 border-t p-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={editingEmployee ? handleUpdateEmployee : handleAddEmployee}
                  className="px-6 py-2 bg-gradient-to-r from-primary to-orange-500 text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
                >
                  {editingEmployee ? 'Update' : 'Add'} Employee
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal.isOpen && paymentModal.employee && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPaymentModal({ isOpen: false, employee: null, type: 'acompte' })}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4"
            >
              <div className="border-b p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Add Payment</h2>
                <button
                  onClick={() => setPaymentModal({ isOpen: false, employee: null, type: 'acompte' })}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-gray-700 font-semibold">{paymentModal.employee.fullName}</p>

                <div className="flex gap-2">
                  {(['acompte', 'absence', 'payment'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setPaymentModal({ ...paymentModal, type })}
                      className={cn(
                        'flex-1 px-4 py-2 rounded-lg font-semibold transition-all',
                        paymentModal.type === type
                          ? 'bg-primary text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      )}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  placeholder="Amount"
                  value={paymentFormData.amount}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />

                <input
                  type="date"
                  value={paymentFormData.date}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />

                <textarea
                  placeholder="Description"
                  value={paymentFormData.description}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="bg-gray-50 border-t p-6 flex justify-end gap-3">
                <button
                  onClick={() => setPaymentModal({ isOpen: false, employee: null, type: 'acompte' })}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleAddPayment}
                  className="px-6 py-2 bg-primary text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
                >
                  Add Payment
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {historyModal.isOpen && historyModal.employee && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHistoryModal({ isOpen: false, employee: null })}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">{historyModal.employee.fullName} - History</h2>
                <button
                  onClick={() => setHistoryModal({ isOpen: false, employee: null })}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Payment History</h3>
                <div className="space-y-2">
                  {historyData.payments.map(payment => (
                    <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-800">{payment.type}</p>
                        <p className="text-xs text-gray-500">{payment.date}</p>
                      </div>
                      <p className="font-semibold text-primary">{formatCurrency(payment.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <h2 className="text-xl font-bold text-gray-800">Delete Employee</h2>
                </div>
                <p className="text-gray-700 mb-6">
                  Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
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
                    onClick={() => handleDeleteEmployee(deleteConfirm.id)}
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

export default EmployeesOptimized;
