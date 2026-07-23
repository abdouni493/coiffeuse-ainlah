import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, User, Phone, MapPin, Briefcase, DollarSign, Calendar, X, Check, AlertCircle, Lock, Mail, MinusCircle, PlusCircle, History, Loader } from 'lucide-react';
import { User as Employee, EmployeePayment } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import * as DataService from '../lib/dataService';

// ============================================================================
// OPTIMIZED EMPLOYEES COMPONENT
// ============================================================================

const EmployeesOptimized: React.FC = () => {
  // ========== STATE MANAGEMENT ==========
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<EmployeePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string } | null>(null);
  
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
  });

  const [paymentFormData, setPaymentFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  // ========== UTILITY FUNCTIONS ==========
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(amount).replace('DZD', 'DA');
  }, []);

  // ========== DATA FETCHING ==========
  // Use optimized data service with caching and batch loading
  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Batch fetch employees and payments in parallel
      const [employeesData, paymentsData] = await Promise.all([
        DataService.fetchEmployees(),
        DataService.fetchEmployeePayments()
      ]);

      setEmployees(employeesData);
      setPayments(paymentsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // ========== COMPUTED DATA (MEMOIZED) ==========
  const employeePaymentsMap = useMemo(() => {
    const map = new Map<string, EmployeePayment[]>();
    payments.forEach(payment => {
      const current = map.get(payment.employeeId) || [];
      current.push(payment);
      map.set(payment.employeeId, current);
    });
    return map;
  }, [payments]);

  const employeeStats = useMemo(() => {
    return new Map(
      employees.map(emp => {
        const empPayments = employeePaymentsMap.get(emp.id) || [];
        const totalPaid = empPayments.reduce((sum, p) => 
          p.type === 'salary' ? sum + p.amount : sum, 0
        );
        const totalAdvances = empPayments.reduce((sum, p) => 
          p.type === 'acompte' ? sum + p.amount : sum, 0
        );
        const totalAbsences = empPayments.reduce((sum, p) => 
          p.type === 'absence' ? sum + p.amount : sum, 0
        );

        return [emp.id, { totalPaid, totalAdvances, totalAbsences, totalPayments: empPayments.length }];
      })
    );
  }, [employees, employeePaymentsMap]);

  // ========== CRUD OPERATIONS ==========
  const handleAddOrEditEmployee = useCallback(async () => {
    if (!formData.fullName || !formData.username) {
      alert('Please fill all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const employeeData = {
        full_name: formData.fullName,
        phone: formData.phone,
        address: formData.address,
        role: formData.role,
        payment_type: formData.paymentType,
        percentage: formData.percentage ? parseFloat(formData.percentage) : null,
        username: formData.username,
      };

      if (editingEmployee) {
        // Use optimized update
        const result = await DataService.updateRecord('profiles', editingEmployee.id, employeeData);
        if (result.success) {
          setEmployees(employees.map(e => 
            e.id === editingEmployee.id 
              ? { ...e, ...formData, percentage: formData.percentage ? parseFloat(formData.percentage) : undefined } 
              : e
          ));
          setIsModalOpen(false);
          resetForm();
        } else {
          alert('Error updating employee: ' + result.error);
        }
      } else {
        // Use optimized insert with generated ID from Supabase auth
        const result = await DataService.insertRecord('profiles', employeeData);
        if (result.success) {
          await fetchAllData(); // Refresh data
          setIsModalOpen(false);
          resetForm();
        } else {
          alert('Error creating employee: ' + result.error);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingEmployee, employees, fetchAllData]);

  const handleDeleteEmployee = useCallback(async () => {
    if (!deleteConfirm?.id) return;

    setIsSubmitting(true);
    try {
      const result = await DataService.deleteRecord('profiles', deleteConfirm.id);
      if (result.success) {
        setEmployees(employees.filter(e => e.id !== deleteConfirm.id));
        setDeleteConfirm(null);
      } else {
        alert('Error deleting employee: ' + result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteConfirm?.id, employees]);

  const handleAddPayment = useCallback(async () => {
    if (!paymentModal.employee || !paymentFormData.amount) {
      alert('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const paymentData = {
        employee_id: paymentModal.employee.id,
        amount: parseFloat(paymentFormData.amount),
        type: paymentModal.type === 'payment' ? 'salary' : paymentModal.type,
        description: paymentFormData.description,
        date: paymentFormData.date,
      };

      const result = await DataService.insertRecord('employee_payments', paymentData);
      if (result.success) {
        setPayments([...payments, {
          id: result.data?.id,
          employeeId: paymentModal.employee.id,
          amount: parseFloat(paymentFormData.amount),
          type: paymentModal.type === 'payment' ? 'salary' : paymentModal.type,
          description: paymentFormData.description,
          date: paymentFormData.date
        }]);
        setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
        resetPaymentForm();
      } else {
        alert('Error adding payment: ' + result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [paymentModal, paymentFormData, payments]);

  // ========== HELPER FUNCTIONS ==========
  const resetForm = useCallback(() => {
    setFormData({
      fullName: '',
      phone: '',
      address: '',
      role: 'worker',
      paymentType: 'month',
      percentage: '',
      username: '',
    });
    setEditingEmployee(null);
  }, []);

  const resetPaymentForm = useCallback(() => {
    setPaymentFormData({
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
  }, []);

  const handleEditEmployee = useCallback((employee: Employee) => {
    setFormData({
      fullName: employee.fullName,
      phone: employee.phone || '',
      address: employee.address || '',
      role: (employee.role === 'super_admin' ? 'admin' : employee.role) as 'admin' | 'worker',
      paymentType: employee.paymentType || 'month',
      percentage: employee.percentage?.toString() || '',
      username: employee.username,
    });
    setEditingEmployee(employee);
    setIsModalOpen(true);
  }, []);

  // ========== RENDER ==========
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
          <Loader className="w-12 h-12 text-blue-500" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Employees</h1>
            <p className="text-gray-600 mt-2">{employees.length} total employees</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Employee
          </motion.button>
        </div>

        {/* Employees Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {employees.map(employee => {
              const stats = employeeStats.get(employee.id);
              return (
                <motion.div
                  key={employee.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="bg-surface rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6"
                >
                  {/* Employee Info */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">{employee.fullName}</h3>
                        <p className="text-sm text-gray-500">@{employee.username}</p>
                      </div>
                    </div>
                    <span className={cn(
                      'px-3 py-1 rounded-full text-sm font-semibold',
                      employee.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    )}>
                      {employee.role}
                    </span>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2 mb-4 text-sm text-gray-600">
                    {employee.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {employee.phone}
                      </div>
                    )}
                    {employee.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {employee.address}
                      </div>
                    )}
                  </div>

                  {/* Payment Info */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Payment Type:</span>
                      <span className="font-semibold text-gray-900">{employee.paymentType}</span>
                    </div>
                    {employee.percentage && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Percentage:</span>
                        <span className="font-semibold text-gray-900">{employee.percentage}%</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-gray-600">Total Paid:</span>
                      <span className="font-bold text-green-600">{formatCurrency(stats?.totalPaid || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Advances:</span>
                      <span className="font-bold text-orange-600">{formatCurrency(stats?.totalAdvances || 0)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleEditEmployee(employee)}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 py-2 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setPaymentModal({ isOpen: true, employee, type: 'acompte' })}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-100 text-green-700 hover:bg-green-200 py-2 rounded-lg transition-colors"
                    >
                      <DollarSign className="w-4 h-4" />
                      Payment
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setDeleteConfirm({ isOpen: true, id: employee.id, name: employee.fullName })}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-100 text-red-700 hover:bg-red-200 py-2 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {employees.length === 0 && (
          <div className="text-center py-12">
            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No employees found</p>
          </div>
        )}
      </div>

      {/* Add/Edit Employee Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-surface rounded-2xl shadow-2xl max-w-md w-full p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingEmployee ? 'Edit Employee' : 'Add Employee'}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Username *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="john_doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="+213"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="123 Main St"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value as 'admin' | 'worker' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="worker">Worker</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Type</label>
                  <select
                    value={formData.paymentType}
                    onChange={e => setFormData({ ...formData, paymentType: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="days">Per Day</option>
                    <option value="month">Per Month</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>

                {formData.paymentType === 'percentage' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Percentage (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.percentage}
                      onChange={e => setFormData({ ...formData, percentage: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="15"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddOrEditEmployee}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setPaymentModal({ isOpen: false, employee: null, type: 'acompte' })}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-surface rounded-2xl shadow-2xl max-w-md w-full p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Add Payment</h2>
                <button
                  onClick={() => setPaymentModal({ isOpen: false, employee: null, type: 'acompte' })}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Employee</p>
                  <p className="text-lg font-bold text-gray-900">{paymentModal.employee?.fullName}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Type</label>
                  <div className="flex gap-3">
                    {(['acompte', 'payment', 'absence'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setPaymentModal({ ...paymentModal, type })}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg font-semibold transition-colors',
                          paymentModal.type === type
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Amount *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentFormData.amount}
                    onChange={e => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="1000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                  <input
                    type="text"
                    value={paymentFormData.description}
                    onChange={e => setPaymentFormData({ ...paymentFormData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Payment for..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={paymentFormData.date}
                    onChange={e => setPaymentFormData({ ...paymentFormData, date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setPaymentModal({ isOpen: false, employee: null, type: 'acompte' })}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddPayment}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'Adding...' : 'Add Payment'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm?.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-surface rounded-2xl shadow-2xl max-w-sm w-full p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Delete Employee?</h3>
              <p className="text-center text-gray-600 mb-6">
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDeleteEmployee}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Deleting...' : 'Delete'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EmployeesOptimized;
