import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, User, Phone, MapPin, Briefcase, DollarSign, Calendar, X, Check, AlertCircle, Lock, Mail, MinusCircle, PlusCircle, History, ShieldCheck } from 'lucide-react';
import { User as Employee, EmployeePayment } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { supabase, createSignupClient } from '../lib/supabase';
import { PERMISSION_CATALOG, PermissionMap } from '../lib/permissions';

const Employees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payments, setPayments] = useState<EmployeePayment[]>([]);
  const [paidPeriods, setPaidPeriods] = useState<Array<{
    workerId: string;
    startDate: string;
    endDate: string;
    totalDays: number;
  }>>([]);
  const [reservationWorkerEarnings, setReservationWorkerEarnings] = useState<Array<{
    workerId: string;
    amount: number;
    status: 'paid' | 'unpaid';
    reservationId: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string } | null>(null);

  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; employee: Employee | null }>({
    isOpen: false,
    employee: null
  });

  const [historyData, setHistoryData] = useState<{
    works: Array<{
      id: string;
      name: string;
      date: string;
      status?: string;
      price?: number;
      paidAmount?: number;
      paymentType?: string;
      percentage?: number;
      reservationWorkerStatus?: string;
    }>;
    payments: EmployeePayment[];
  }>({
    works: [],
    payments: []
  });

  const [selectedPaymentDetails, setSelectedPaymentDetails] = useState<{
    isOpen: boolean;
    payment: EmployeePayment | null;
    reservations: Array<{
      clientName: string;
      date: string;
      amount: number;
      percentage?: number;
    }>;
  }>({
    isOpen: false,
    payment: null,
    reservations: []
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
    dailyRate: '',
    monthlyRate: '',
    username: '',
    email: '',
    password: '',
    hireDate: new Date().toISOString().split('T')[0],
    permissions: {} as PermissionMap,
  });

  const [isSaving, setIsSaving] = useState(false);

  const [paymentFormData, setPaymentFormData] = useState({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [dailyPaymentData, setDailyPaymentData] = useState({
    days: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [dateRangeOverride, setDateRangeOverride] = useState({
    lastPaymentDate: '',
    currentDate: new Date().toISOString().split('T')[0]
  });

  // Journalier payment interface state
  const [journalierPaymentMode, setJournalierPaymentMode] = useState<{
    isActive: boolean;
    selectedReservationIds: string[];
    searchTerm: string;
    searchResults: Array<{
      reservationId: string;
      reservationWorkerId: string;
      clientName: string;
      clientPhone: string;
      date: string;
      amount: number;
      paymentStatus: 'paid' | 'unpaid';
    }>;
    workerReservations: Array<{
      reservationId: string;
      reservationWorkerId: string;
      clientName: string;
      clientPhone: string;
      date: string;
      amount: number;
      paymentStatus: 'paid' | 'unpaid';
    }>;
    totalAmount: number;
    paymentAmount: string;
    paymentPercentage: string;
    usePercentage: boolean;
  }>({
    isActive: false,
    selectedReservationIds: [],
    searchTerm: '',
    searchResults: [],
    workerReservations: [],
    totalAmount: 0,
    paymentAmount: '',
    paymentPercentage: '',
    usePercentage: false,
  });

  // Percentage payment interface state — lists the worker's UNPAID commission
  // reservations together with their unpaid acomptes/absences and an editable
  // net amount that the admin can override before validating the payment.
  const [percentagePaymentMode, setPercentagePaymentMode] = useState<{
    isActive: boolean;
    reservations: Array<{
      reservationWorkerId: string;
      reservationId: string;
      clientName: string;
      clientPhone: string;
      date: string;
      basePrice: number;
      commission: number;
      percentage: number;
    }>;
    editedAmount: string;
  }>({
    isActive: false,
    reservations: [],
    editedAmount: '',
  });

  // Helper function to format date without timezone conversion
  const formatDateWithoutTimezone = (dateString: string): string => {
    if (!dateString) return 'N/A';
    // Handle both date (YYYY-MM-DD) and timestamp formats
    const dateOnly = dateString.split('T')[0];
    const [year, month, day] = dateOnly.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('fr-FR');
  };

  // Helper function to parse date string to Date object WITHOUT timezone conversion
  const parseDateString = (dateString: string): Date => {
    if (!dateString) return new Date();
    const dateOnly = dateString.split('T')[0];
    const [year, month, day] = dateOnly.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day));
  };

  // Helper function to fetch paid periods for a worker
  const fetchPaidPeriods = async (workerId: string): Promise<Array<{ startDate: Date; endDate: Date; }>> => {
    try {
      const { data, error } = await supabase
        .from('worker_daily_payment_periods')
        .select('start_date, end_date')
        .eq('worker_id', workerId)
        .eq('status', 'paid');

      if (error) {
        console.error('Error fetching paid periods:', error);
        return [];
      }

      return (data || []).map(p => ({
        startDate: parseDateString(p.start_date),
        endDate: parseDateString(p.end_date)
      }));
    } catch (err) {
      console.error('Error in fetchPaidPeriods:', err);
      return [];
    }
  };

  // Helper function to check if a date is within any paid period
  const isDateInPaidPeriod = (date: Date, paidPeriods: Array<{ startDate: Date; endDate: Date; }>): boolean => {
    return paidPeriods.some(period =>
      date >= period.startDate && date <= period.endDate
    );
  };

  const fetchData = async () => {
    setIsLoading(true);

    // Fetch profiles (employees)
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    } else {
      // Map Supabase snake_case to our camelCase types and filter out admins and super_admin
      const mappedEmployees: Employee[] = (profilesData || [])
        .filter(p => p.role !== 'admin' && p.role !== 'super_admin') // Filter out admin and super_admin users
        .map(p => ({
          id: p.id,
          username: p.username,
          email: p.email || '',
          fullName: p.full_name,
          role: p.role,
          avatarUrl: p.avatar_url,
          phone: p.phone,
          address: p.address,
          paymentType: p.payment_type,
          percentage: p.percentage,
          dailyRate: p.daily_rate,
          monthlyRate: p.monthly_rate,
          hireDate: p.hire_date,
          permissions: p.permissions || {}
        }));
      setEmployees(mappedEmployees);
    }

    // Fetch payments
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('employee_payments')
      .select('*');

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError);
    } else {
      const mappedPayments: EmployeePayment[] = (paymentsData || []).map(p => ({
        id: p.id,
        employeeId: p.employee_id,
        amount: p.amount,
        type: p.type,
        description: p.description,
        date: p.date,
        status: p.status || 'unpaid',
        reservation_details: p.reservation_details ? JSON.stringify(p.reservation_details) : undefined
      }));
      setPayments(mappedPayments);
    }

    // Fetch payment periods for daily workers
    const { data: periodsData, error: periodsError } = await supabase
      .from('worker_daily_payment_periods')
      .select('worker_id, start_date, end_date, total_days')
      .eq('status', 'paid');

    if (periodsError) {
      console.error('Error fetching payment periods:', periodsError);
    } else {
      const mappedPeriods = (periodsData || []).map(p => ({
        workerId: p.worker_id,
        startDate: p.start_date,
        endDate: p.end_date,
        totalDays: p.total_days
      }));
      setPaidPeriods(mappedPeriods);
    }

    // Fetch reservation worker earnings
    const { data: reservationWorkersData, error: reservationWorkersError } = await supabase
      .from('reservation_workers')
      .select('worker_id, amount, status, reservation_id');

    if (reservationWorkersError) {
      console.error('Error fetching reservation workers - table may not exist:', reservationWorkersError);
      setReservationWorkerEarnings([]);
    } else {
      console.log('Reservation workers fetched:', reservationWorkersData, 'Count:', (reservationWorkersData || []).length);
      const mappedData = (reservationWorkersData || []).map((rw: any) => ({
        workerId: rw.worker_id,
        amount: rw.amount || 0,
        status: rw.status || 'unpaid',
        reservationId: rw.reservation_id
      }));
      console.log('Mapped reservation worker data:', mappedData);
      setReservationWorkerEarnings(mappedData);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveEmployee = async () => {
    // Validate required fields
    if (!formData.fullName || !formData.username) {
      alert('Veuillez remplir tous les champs requis');
      return;
    }

    // Validate hired date is provided
    if (!formData.hireDate) {
      alert('Veuillez sélectionner la date d\'embauche');
      return;
    }

    // For new employees, require email and password
    if (!editingEmployee) {
      if (!formData.email || !formData.password) {
        alert('Veuillez entrer l\'email et le mot de passe');
        return;
      }
    }

    // Validate payment amount is provided
    if (formData.paymentType === 'month' && !formData.monthlyRate) {
      alert('Veuillez entrer le salaire mensuel');
      return;
    }
    if (formData.paymentType === 'days' && !formData.dailyRate) {
      alert('Veuillez entrer le tarif journalier');
      return;
    }
    if (formData.paymentType === 'percentage' && !formData.percentage) {
      alert('Veuillez entrer le pourcentage de commission');
      return;
    }

    const employeeData = {
      username: formData.username,
      full_name: formData.fullName,
      role: formData.role,
      phone: formData.phone,
      address: formData.address,
      email: formData.email || null,
      payment_type: formData.paymentType,
      percentage: formData.paymentType === 'percentage' ? Number(formData.percentage) : null,
      daily_rate: formData.paymentType === 'days' ? Number(formData.dailyRate) : null,
      monthly_rate: formData.paymentType === 'month' ? Number(formData.monthlyRate) : null,
      hire_date: formData.hireDate,
      // Only workers carry a permission map; admins implicitly have everything.
      permissions: formData.role === 'worker' ? formData.permissions : {},
    };

    if (editingEmployee) {
      // Update existing employee profile
      const { error } = await supabase
        .from('profiles')
        .update(employeeData)
        .eq('id', editingEmployee.id);

      if (error) {
        console.error('Error updating profile:', error);
        alert('Erreur lors de la mise à jour: ' + error.message);
      } else {
        setIsModalOpen(false);
        resetForm();
        fetchData();
      }
    } else {
      // Adding a new employee → create a real Supabase Auth account (so the
      // worker can log in), exactly like the admin account is created.
      //
      // We sign up through an ISOLATED client (createSignupClient) whose session
      // is never persisted, so the admin stays logged in — no fragile
      // save/restore of the admin session is required.
      //
      // The DB trigger `handle_new_user` already inserts a base profile row for
      // the new auth user, so we must NOT insert a second one (that caused the
      // "profiles_pkey" duplicate-key 409). Instead we UPSERT to fill in the
      // remaining fields (payment config, permissions, …).
      setIsSaving(true);
      try {
        const signupClient = createSignupClient();
        const { data: authData, error: authError } = await signupClient.auth.signUp({
          email: formData.email.toLowerCase().trim(),
          password: formData.password,
          options: {
            data: {
              username:  formData.username,
              full_name: formData.fullName,
              role:      formData.role, // trigger persists this role on the profile
            },
          },
        });

        if (authError) {
          console.error('Error creating auth user:', authError);
          if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
            alert('Erreur: Cet email est déjà utilisé. Veuillez utiliser un email différent.');
          } else if (authError.message?.includes('Invalid email')) {
            alert('Erreur: Format d\'email invalide. Veuillez vérifier votre email.');
          } else {
            alert('Erreur lors de la création du compte: ' + authError.message);
          }
          return;
        }

        if (!authData?.user?.id) {
          console.error('Auth response:', authData);
          alert('Erreur: Impossible de créer le compte');
          return;
        }

        // Fill in the profile the trigger created (upsert = no duplicate key).
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({ id: authData.user.id, ...employeeData }, { onConflict: 'id' });

        if (profileError) {
          console.error('Error saving profile:', profileError);
          alert('Erreur lors de l\'enregistrement du profil: ' + profileError.message);
          return;
        }

        setIsModalOpen(false);
        resetForm();
        fetchData();
      } catch (error: any) {
        console.error('Error creating employee:', error);
        alert('Erreur: ' + error.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      phone: '',
      address: '',
      role: 'worker',
      paymentType: 'month',
      percentage: '',
      dailyRate: '',
      monthlyRate: '',
      username: '',
      email: '',
      password: '',
      hireDate: new Date().toISOString().split('T')[0],
      permissions: {},
    });
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      fullName: emp.fullName,
      phone: emp.phone || '',
      address: emp.address || '',
      role: (emp.role === 'admin' ? 'admin' : 'worker') as 'admin' | 'worker',
      paymentType: emp.paymentType || 'month',
      percentage: emp.percentage?.toString() || '',
      dailyRate: emp.dailyRate?.toString() || '',
      monthlyRate: emp.monthlyRate?.toString() || '',
      username: emp.username,
      email: emp.email || '',
      password: '',
      hireDate: emp.hireDate || '',
      permissions: (emp.permissions as PermissionMap) || {},
    });
    setIsModalOpen(true);
  };

  // Toggle a single (interface, action) permission in the form. Granting any
  // action auto-grants "view" (needed to open the interface); removing "view"
  // clears the whole interface.
  const togglePermission = (interfaceId: string, action: string) => {
    setFormData(prev => {
      const current = new Set(prev.permissions[interfaceId] || []);
      if (current.has(action)) {
        current.delete(action);
        if (action === 'view') current.clear();
      } else {
        current.add(action);
        if (action !== 'view') current.add('view');
      }
      const next: PermissionMap = { ...prev.permissions };
      if (current.size === 0) delete next[interfaceId];
      else next[interfaceId] = Array.from(current);
      return { ...prev, permissions: next };
    });
  };

  const openHistoryModal = async (emp: Employee) => {
    try {
      // Show modal immediately with existing data
      setHistoryModal({
        isOpen: true,
        employee: emp
      });

      // Filter payments for this employee from already loaded data
      const employeePayments = payments.filter(p => p.employeeId === emp.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (emp.paymentType === 'days') {
        // For journalier workers: fetch all paid and unpaid reservations from reservation_workers
        const { data: journalierData, error: journalierError } = await supabase
          .from('reservation_workers')
          .select(`
            id,
            reservation_id,
            worker_id,
            amount,
            percentage,
            status,
            reservations(
              id,
              client_name,
              date,
              total_price,
              paid_amount
            )
          `)
          .eq('worker_id', emp.id)
          .eq('payment_type', 'days')
          .order('created_at', { ascending: false });

        if (!journalierError && journalierData) {
          const works = journalierData.map((wr: any) => ({
            id: wr.reservation_id,
            name: wr.reservations?.client_name || 'Client',
            date: wr.reservations?.date || new Date().toISOString().split('T')[0],
            status: 'completed',
            price: wr.amount || 0,
            paidAmount: wr.reservations?.paid_amount || 0,
            paymentType: 'days',
            percentage: 0,
            reservationWorkerStatus: wr.status
          }));

          setHistoryData({
            works,
            payments: employeePayments
          });
        }
      } else {
        // For other payment types: use existing reservation_worker_earnings
        const works = reservationWorkerEarnings
          .filter(rw => rw.workerId === emp.id)
          .map(rw => ({
            id: rw.reservationId,
            name: `Réservation #${rw.reservationId.substring(0, 8)}`,
            date: new Date().toISOString().split('T')[0],
            status: 'completed',
            price: rw.amount || 0,
            paidAmount: 0,
            paymentType: '',
            percentage: 0,
            reservationWorkerStatus: rw.status
          }));

        setHistoryData({
          works,
          payments: employeePayments
        });

        // Fetch detailed reservation info in background
        if (reservationWorkerEarnings.filter(rw => rw.workerId === emp.id).length > 0) {
          supabase
            .from('reservation_workers')
            .select(`
              reservation_id,
              worker_id,
              amount,
              status,
              reservations(client_name, date)
            `)
            .eq('worker_id', emp.id)
            .then(({ data: workerReservationsData, error: workerReservationsError }) => {
              if (!workerReservationsError && workerReservationsData) {
                const detailedWorks = workerReservationsData.map((wr: any) => ({
                  id: wr.reservation_id,
                  name: wr.reservations?.client_name || 'Client',
                  date: wr.reservations?.date || new Date().toISOString().split('T')[0],
                  status: 'completed',
                  price: wr.amount || 0,
                  paidAmount: 0,
                  paymentType: '',
                  percentage: 0,
                  reservationWorkerStatus: wr.status
                }));
                setHistoryData(prev => ({
                  ...prev,
                  works: detailedWorks
                }));
              }
            });
        }
      }
    } catch (error) {
      console.error('Error opening history modal:', error);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deleteConfirm) {
      console.warn('[DELETE] No employee selected for deletion');
      return;
    }

    try {
      // Prevent double-clicks
      setIsDeletingId(deleteConfirm.id);

      const employeeIdToDelete = deleteConfirm.id;
      console.log('[DELETE] Starting employee deletion:', employeeIdToDelete);

      // First, delete all associated payments (in case CASCADE isn't set up)
      console.log('[DELETE] Deleting associated payments...');
      const { data: deletedPayments, error: paymentsError } = await supabase
        .from('employee_payments')
        .delete()
        .eq('employee_id', employeeIdToDelete)
        .select(); // Add select() to verify deletion

      console.log('[DELETE] Payments deletion response:', { data: deletedPayments, error: paymentsError });

      if (paymentsError) {
        console.error('[DELETE ERROR] Failed to delete payments:', paymentsError);
        // Don't throw - continue with deletion even if payments delete fails
      }

      // Delete reservation worker records
      console.log('[DELETE] Deleting reservation worker records...');
      const { data: deletedWorkers, error: resWorkerError } = await supabase
        .from('reservation_workers')
        .delete()
        .eq('worker_id', employeeIdToDelete)
        .select(); // Add select() to verify deletion

      console.log('[DELETE] Workers deletion response:', { data: deletedWorkers, error: resWorkerError });

      if (resWorkerError) {
        console.error('[DELETE ERROR] Failed to delete reservation workers:', resWorkerError);
        // Don't throw - continue with deletion even if workers delete fails
      }

      // Delete worker_reservation_payments if it exists
      console.log('[DELETE] Deleting worker reservation payments...');
      const { data: deletedWorkerPayments, error: workerPaymentsError } = await supabase
        .from('worker_reservation_payments')
        .delete()
        .eq('worker_id', employeeIdToDelete)
        .select();

      console.log('[DELETE] Worker payments deletion response:', { data: deletedWorkerPayments, error: workerPaymentsError });

      // Finally, delete the employee profile
      console.log('[DELETE] Deleting employee profile...');
      const { data: deletedProfile, error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', employeeIdToDelete)
        .select(); // Add select() to verify deletion

      console.log('[DELETE] Profile deletion response:', { data: deletedProfile, error: profileError });

      if (profileError) {
        console.error('[DELETE ERROR] Failed to delete profile:', profileError);
        throw profileError;
      }

      // Check if deletion was actually successful
      if (!deletedProfile || deletedProfile.length === 0) {
        console.warn('[DELETE WARNING] Delete returned no rows - checking if RLS policies are blocking deletion');
        // Even though no error, the delete didn't actually happen
        // This is usually due to RLS policies
        throw new Error('La suppression a échoué silencieusement - vérifiez les permissions RLS');
      }

      console.log('[DELETE SUCCESS] Employee and all related records deleted:', deletedProfile);

      // Update local state immediately
      setEmployees(prev => prev.filter(emp => emp.id !== employeeIdToDelete));
      setPayments(prev => prev.filter(p => p.employeeId !== employeeIdToDelete));
      setReservationWorkerEarnings(prev => prev.filter(rw => rw.workerId !== employeeIdToDelete));

      setDeleteConfirm(null);
      setIsDeletingId(null);
    } catch (error) {
      console.error('[DELETE CRITICAL ERROR]:', error);
      alert(`Erreur lors de la suppression: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      setIsDeletingId(null);
      setDeleteConfirm(null);
      // Refetch data to ensure UI is in sync with database
      console.log('[DELETE] Refetching data after error...');
      await fetchData();
    }
  };

  const handleAddPaymentAction = async () => {
    if (!paymentModal.employee) return;

    const paymentData = {
      employee_id: paymentModal.employee.id,
      type: paymentModal.type,
      amount: Number(paymentFormData.amount),
      description: paymentFormData.description,
      date: paymentFormData.date,
      status: 'unpaid' // New acomptes/absences are always unpaid initially
    };

    const { data: insertedPayment, error } = await supabase
      .from('employee_payments')
      .insert([paymentData])
      .select();

    if (error) {
      console.error('Error adding payment:', error);
    } else {
      // Update local state immediately instead of full refetch
      if (insertedPayment && insertedPayment.length > 0) {
        const newPayment = insertedPayment[0];
        setPayments(prev => [...prev, {
          id: newPayment.id,
          employeeId: newPayment.employee_id,
          amount: newPayment.amount,
          type: newPayment.type,
          description: newPayment.description,
          date: newPayment.date,
          status: newPayment.status || 'unpaid'
        }]);
      }
    }

    setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
    setPaymentFormData({
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
    setDateRangeOverride({ lastPaymentDate: '', currentDate: new Date().toISOString().split('T')[0] });
  };

  const handleValidatePayment = async () => {
    if (!paymentModal.employee) return;

    try {
      const employeeId = paymentModal.employee.id;

      // Get current calculation details with custom days if provided
      const customDays = paymentModal.employee.paymentType === 'days' && dailyPaymentData.days ? parseInt(dailyPaymentData.days) : undefined;
      const details = paymentModal.employee.paymentType === 'percentage'
        ? calculatePercentageEarnings(employeeId)
        : calculateNetSalary(employeeId, customDays);

      // Get the date of the last salary payment to match the calculation logic
      const lastSalaryPayment = payments
        .filter(p => p.employeeId === employeeId && p.type === 'salary')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      const lastPaymentDate = lastSalaryPayment ? new Date(lastSalaryPayment.date) : new Date('2000-01-01');

      // Get unpaid acomptes and absences created on or after the last salary payment
      // This matches the calculation logic exactly
      const unpaidDeductions = payments.filter(p =>
        p.employeeId === employeeId &&
        (p.type === 'acompte' || p.type === 'absence') &&
        new Date(p.date) >= lastPaymentDate &&
        (p.status === 'unpaid' || !p.status)
      );

      // For percentage workers, check if there are unpaid work earnings instead
      const unpaidWorkEarnings = paymentModal.employee?.paymentType === 'percentage'
        ? reservationWorkerEarnings.filter(rw => rw.workerId === employeeId && rw.status === 'unpaid')
        : [];

      // For regular workers, check deductions; for percentage workers, check work earnings
      const hasPaymentToProcess = paymentModal.employee?.paymentType === 'percentage'
        ? unpaidWorkEarnings.length > 0
        : details.net > 0;

      if (!hasPaymentToProcess) {
        alert('Aucune déduction à payer');
        return;
      }

      // Create salary payment record with included deductions info
      let description = '';
      if (paymentModal.employee?.paymentType === 'percentage') {
        description = `Paiement du salaire - Commissions: ${unpaidWorkEarnings.length} travaux`;
      } else if (paymentModal.employee?.paymentType === 'days') {
        const employee = employees.find(e => e.id === employeeId);
        const lastPaidDate = lastPaymentDate > new Date('2000-01-01') ? lastPaymentDate : parseDateString(employee?.hireDate || '');
        const fromDate = new Date(lastPaidDate.getTime() + 1000 * 60 * 60 * 24);
        const toDate = new Date();
        const daysCount = customDays || details.days;
        description = `Paiement journalier - ${fromDate.toLocaleDateString('fr-FR')} au ${toDate.toLocaleDateString('fr-FR')} (${daysCount} jours)`;
      } else {
        description = `Paiement du salaire - Déductions incluses: ${unpaidDeductions.length}`;
      }

      const salaryPayment = {
        employee_id: employeeId,
        type: 'salary',
        amount: details.net,
        description: description,
        date: new Date().toISOString().split('T')[0],
        status: 'paid'
      };

      const { error: salaryError } = await supabase
        .from('employee_payments')
        .insert([salaryPayment]);

      if (salaryError) {
        console.error('Error creating salary payment:', salaryError);
        alert('Erreur lors de la création du paiement');
        return;
      }

      // For daily workers, record the payment period
      if (paymentModal.employee?.paymentType === 'days') {
        const employee = employees.find(e => e.id === employeeId);
        const lastSalaryPayment = payments
          .filter(p => p.employeeId === employeeId && p.type === 'salary')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        const lastPaidDate = lastSalaryPayment ? lastSalaryPayment.date : employee?.hireDate;
        const startDate = lastPaidDate ? new Date(new Date(lastPaidDate).getTime() + 1000 * 60 * 60 * 24) : parseDateString(employee?.hireDate || '');
        const endDate = new Date();
        const daysCount = customDays || details.days;

        const periodRecord = {
          worker_id: employeeId,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          total_days: daysCount,
          daily_rate: employee?.dailyRate || 0,
          total_amount: details.net,
          payment_date: new Date().toISOString().split('T')[0],
          status: 'paid',
          description: description
        };

        const { error: periodError, data: periodData } = await supabase
          .from('worker_daily_payment_periods')
          .insert([periodRecord]);

        if (periodError) {
          console.error('Error recording daily payment period:', periodError);
          // Don't fail the whole operation, just log it
        } else {
          console.log('Daily payment period recorded successfully');
          // Update paidPeriods state immediately with the new period
          const newPeriodItem = {
            workerId: employeeId,
            startDate: periodRecord.start_date,
            endDate: periodRecord.end_date,
            totalDays: periodRecord.total_days
          };
          setPaidPeriods(prev => [...prev, newPeriodItem]);
        }
      }

      // Mark all unpaid deductions as paid - use a batch update if possible
      let updateCount = 0;

      // Try batch update first
      if (unpaidDeductions.length > 0) {
        const deductionIds = unpaidDeductions.map(d => d.id);
        console.log('Attempting to mark deductions as paid:', deductionIds);
        const { error: batchError, data: batchData } = await supabase
          .from('employee_payments')
          .update({ status: 'paid' })
          .in('id', deductionIds);

        if (batchError) {
          console.error('Batch update failed, trying individual updates:', batchError);
          // Fallback to individual updates
          for (const deduction of unpaidDeductions) {
            const { error: updateError } = await supabase
              .from('employee_payments')
              .update({ status: 'paid' })
              .eq('id', deduction.id);

            if (updateError) {
              console.error(`Error marking deduction ${deduction.id} as paid:`, updateError);
            } else {
              updateCount++;
            }
          }
        } else {
          updateCount = unpaidDeductions.length;
          console.log(`Batch update successful: ${updateCount} deductions marked as paid`);
        }

        console.log(`Updated ${updateCount} of ${unpaidDeductions.length} deductions to paid status`);
      }

      // Also mark all unpaid reservation worker earnings as paid
      if (paymentModal.employee.paymentType === 'percentage') {
        const unpaidReservationEarnings = reservationWorkerEarnings.filter(
          rw => rw.workerId === employeeId && rw.status === 'unpaid'
        );

        if (unpaidReservationEarnings.length > 0) {
          const reservationIds = unpaidReservationEarnings.map(rw => rw.reservationId);
          const { error: reservationUpdateError } = await supabase
            .from('reservation_workers')
            .update({ status: 'paid' })
            .eq('worker_id', employeeId)
            .in('reservation_id', reservationIds);

          if (reservationUpdateError) {
            console.error('Error marking reservation worker earnings as paid:', reservationUpdateError);
          } else {
            console.log(`Marked ${unpaidReservationEarnings.length} reservation earnings as paid`);
          }
        }
      }

      // Refresh data and close modal  - use selective update instead of full refetch
      // Update payments locally for better performance
      const updatedPayments = payments.map(p => {
        if (unpaidDeductions.some(d => d.id === p.id)) {
          return { ...p, status: 'paid' as const };
        }
        return p;
      });

      setPayments(updatedPayments);

      // Update reservation worker earnings locally
      if (paymentModal.employee.paymentType === 'percentage') {
        setReservationWorkerEarnings(prevEarnings =>
          prevEarnings.map(rw =>
            rw.workerId === employeeId && rw.status === 'unpaid'
              ? { ...rw, status: 'paid' as const }
              : rw
          )
        );
      }

      setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
      setDailyPaymentData({ days: '', date: new Date().toISOString().split('T')[0] });
      setDateRangeOverride({ lastPaymentDate: '', currentDate: new Date().toISOString().split('T')[0] });

    } catch (error) {
      console.error('Error during payment validation:', error);
      alert('Une erreur s\'est produite lors de la validation du paiement');
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce paiement/acompte/absence?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('employee_payments')
        .delete()
        .eq('id', paymentId);

      if (error) {
        console.error('Error deleting payment:', error);
        alert('Erreur lors de la suppression');
        return;
      }

      setPayments(prevPayments => prevPayments.filter(p => p.id !== paymentId));

      // Optionally refresh in background
      fetchData().catch(err => console.error('Error refreshing data after delete:', err));
    } catch (error) {
      console.error('Error:', error);
      alert('Une erreur s\'est produite');
    }
  };

  // ===== JOURNALIER PAYMENT FUNCTIONS =====
  const loadJournalierReservations = async (workerId: string) => {
    try {
      console.log('Loading journalier reservations for worker:', workerId);

      // Query reservation_workers entries for this worker with status='unpaid' only
      const { data: existingData, error: existingError } = await supabase
        .from('reservation_workers')
        .select(`
          id,
          reservation_id,
          payment_type,
          status,
          reservations (
            id,
            client_name,
            client_phone,
            date,
            total_price,
            status,
            finalized_by,
            paid_amount
          )
        `)
        .eq('worker_id', workerId)
        .eq('payment_type', 'days')
        .eq('status', 'unpaid');

      if (existingError) throw existingError;

      // Get all reservation_ids already tracked in reservation_workers (paid or unpaid)
      const { data: allRwData, error: allRwError } = await supabase
        .from('reservation_workers')
        .select('reservation_id, status')
        .eq('worker_id', workerId)
        .eq('payment_type', 'days');

      if (allRwError) throw allRwError;

      // IDs that are already in reservation_workers (any status)
      const trackedReservationIds = new Set((allRwData || []).map((rw: any) => rw.reservation_id));
      // IDs that are paid
      const paidReservationIds = new Set(
        (allRwData || []).filter((rw: any) => rw.status === 'paid').map((rw: any) => rw.reservation_id)
      );

      // Completed reservations finalized by this worker not yet in reservation_workers
      const { data: completedData, error: completedError } = await supabase
        .from('reservations')
        .select('*')
        .eq('finalized_by', workerId)
        .eq('status', 'completed');

      if (completedError) throw completedError;

      console.log('Unpaid reservation_workers entries:', existingData);
      console.log('Completed reservations finalized by worker:', completedData);

      // Process unpaid reservation_workers entries
      const fromReservationWorkers = (existingData || []).map((rw: any) => ({
        reservationId: rw.reservation_id,
        reservationWorkerId: rw.id,
        clientName: rw.reservations?.client_name || '',
        clientPhone: rw.reservations?.client_phone || '',
        date: rw.reservations?.date || '',
        amount: rw.reservations?.total_price || 0,
        paymentStatus: 'unpaid' as const,
      })).filter(r => r.reservationId);

      // Reservations not yet tracked at all (not in reservation_workers)
      const fromCompleted = (completedData || [])
        .filter((res: any) => !trackedReservationIds.has(res.id)) // Only those not tracked yet
        .map((res: any) => ({
          reservationId: res.id,
          reservationWorkerId: null,
          clientName: res.client_name || '',
          clientPhone: res.client_phone || '',
          date: res.date || '',
          amount: res.total_price || 0,
          paymentStatus: 'unpaid' as const,
        }));

      const allReservations = [...fromReservationWorkers, ...fromCompleted];

      console.log('Processed unpaid journalier reservations:', allReservations);

      setJournalierPaymentMode(prev => ({
        ...prev,
        isActive: true,
        workerReservations: allReservations,
        searchResults: [],
        selectedReservationIds: [],
        totalAmount: 0,
        paymentAmount: '',
        paymentPercentage: '',
        usePercentage: false,
      }));
    } catch (error) {
      console.error('Error loading journalier reservations:', error);
      alert('Erreur lors du chargement des réservations');
    }
  };

  const searchJournalierReservations = async (workerId: string, searchTerm: string) => {
    try {
      if (!searchTerm.trim()) {
        setJournalierPaymentMode(prev => ({
          ...prev,
          searchResults: [],
        }));
        return;
      }

      console.log('Searching journalier reservations for:', { workerId, searchTerm });

      const searchLower = searchTerm.toLowerCase();

      // Query both reservation_workers and ALL completed reservations (not just by this worker)
      // This allows workers to add any completed reservation to their payment list
      const { data: rwData, error: rwError } = await supabase
        .from('reservation_workers')
        .select(`
          id,
          reservation_id,
          payment_type,
          status,
          reservations (
            id,
            client_name,
            client_phone,
            date,
            total_price,
            status,
            finalized_by
          )
        `)
        .eq('worker_id', workerId)
        .eq('payment_type', 'days')
        .eq('status', 'unpaid');

      if (rwError) throw rwError;

      // Query ALL completed reservations
      const { data: completedData, error: completedError } = await supabase
        .from('reservations')
        .select('*')
        .eq('status', 'completed');

      if (completedError) throw completedError;

      // Get all reservation_ids already tracked for this worker in reservation_workers
      const { data: allRwData } = await supabase
        .from('reservation_workers')
        .select('reservation_id, status')
        .eq('worker_id', workerId)
        .eq('payment_type', 'days');

      const trackedReservationIds = new Set((allRwData || []).map((rw: any) => rw.reservation_id));

      console.log('All reservation_workers data:', rwData);
      console.log('All completed reservations:', completedData);

      const matchesSearch = (clientName: string, clientPhone: string) => {
        return clientName.toLowerCase().includes(searchLower) ||
          clientPhone.toLowerCase().includes(searchLower);
      };

      // Process unpaid reservation_workers results - filter by search term
      const fromReservationWorkers = (rwData || [])
        .filter((rw: any) =>
          matchesSearch(
            rw.reservations?.client_name || '',
            rw.reservations?.client_phone || ''
          )
        )
        .map((rw: any) => ({
          reservationId: rw.reservation_id,
          reservationWorkerId: rw.id,
          clientName: rw.reservations?.client_name || '',
          clientPhone: rw.reservations?.client_phone || '',
          date: rw.reservations?.date || '',
          amount: rw.reservations?.total_price || 0,
          paymentStatus: 'unpaid' as const,
        })).filter(r => r.reservationId);

      // Completed reservations not yet tracked at all
      const fromCompleted = (completedData || [])
        .filter((res: any) => !trackedReservationIds.has(res.id)) // Not yet in reservation_workers
        .filter((res: any) =>
          matchesSearch(
            res.client_name || '',
            res.client_phone || ''
          )
        )
        // Exclude ones already shown in fromReservationWorkers
        .filter((res: any) => !fromReservationWorkers.find(r => r.reservationId === res.id))
        .map((res: any) => ({
          reservationId: res.id,
          reservationWorkerId: null,
          clientName: res.client_name || '',
          clientPhone: res.client_phone || '',
          date: res.date || '',
          amount: res.total_price || 0,
          paymentStatus: 'unpaid' as const,
        }));

      const allResults = [...fromReservationWorkers, ...fromCompleted];

      console.log('Filtered search results:', allResults);

      setJournalierPaymentMode(prev => ({
        ...prev,
        searchResults: allResults,
      }));
    } catch (error) {
      console.error('Error searching reservations:', error);
      alert('Erreur lors de la recherche');
    }
  };


  const toggleReservationSelection = (reservationId: string) => {
    setJournalierPaymentMode(prev => {
      const isSelected = prev.selectedReservationIds.includes(reservationId);
      const newSelected = isSelected
        ? prev.selectedReservationIds.filter(id => id !== reservationId)
        : [...prev.selectedReservationIds, reservationId];

      // Calculate total from selected reservations
      const allReservations = [...prev.workerReservations, ...prev.searchResults];
      const selectedReservations = allReservations.filter(r => newSelected.includes(r.reservationId));
      const newTotal = selectedReservations.reduce((sum, r) => sum + r.amount, 0);

      return {
        ...prev,
        selectedReservationIds: newSelected,
        totalAmount: newTotal,
      };
    });
  };

  const calculateJournalierPayment = () => {
    const { totalAmount, usePercentage, paymentPercentage } = journalierPaymentMode;

    if (usePercentage && paymentPercentage) {
      const percentage = parseFloat(paymentPercentage);
      return (totalAmount * percentage) / 100;
    }
    return 0;
  };

  const saveJournalierPayment = async () => {
    if (!paymentModal.employee) return;
    if (journalierPaymentMode.selectedReservationIds.length === 0) {
      alert('Veuillez sélectionner au moins une réservation');
      return;
    }

    const finalAmount = journalierPaymentMode.usePercentage
      ? calculateJournalierPayment()
      : parseFloat(journalierPaymentMode.paymentAmount || '0');

    if (finalAmount <= 0) {
      alert('Veuillez entrer un montant valide');
      return;
    }

    try {
      const allReservations = [...journalierPaymentMode.workerReservations, ...journalierPaymentMode.searchResults];
      const selectedReservations = allReservations.filter(r =>
        journalierPaymentMode.selectedReservationIds.includes(r.reservationId)
      );

      // 1. Update reservation_workers status to 'paid' for those that already have an entry
      const reservationWorkerIds = selectedReservations
        .map(r => r.reservationWorkerId)
        .filter((id): id is string => id !== null && id !== undefined);

      if (reservationWorkerIds.length > 0) {
        const { error: updateError } = await supabase
          .from('reservation_workers')
          .update({ status: 'paid' })
          .in('id', reservationWorkerIds);

        if (updateError) throw updateError;
      }

      // 2. For reservations NOT yet in reservation_workers (reservationWorkerId === null),
      //    insert new entries with status='paid'
      const newEntries = selectedReservations.filter(r => r.reservationWorkerId === null);
      if (newEntries.length > 0) {
        const insertRows = newEntries.map(r => ({
          reservation_id: r.reservationId,
          worker_id: paymentModal.employee!.id,
          payment_type: 'days',
          amount: r.amount,
          percentage: 0,
          status: 'paid',
        }));

        const { error: insertError } = await supabase
          .from('reservation_workers')
          .insert(insertRows);

        if (insertError) throw insertError;
      }

      // 3. Build reservation details for history record (include phone from workerReservations)
      const reservationDetails = selectedReservations.map(r => ({
        clientName: r.clientName,
        clientPhone: r.clientPhone,
        date: r.date,
        amount: r.amount,
        percentage: journalierPaymentMode.usePercentage ? parseFloat(journalierPaymentMode.paymentPercentage) : undefined
      }));

      const description = journalierPaymentMode.usePercentage
        ? `Paiement journalier - ${selectedReservations.length} réservations (${journalierPaymentMode.paymentPercentage}%)`
        : `Paiement journalier - ${selectedReservations.length} réservations`;

      // 4. Create employee_payments record
      const { error: paymentError } = await supabase
        .from('employee_payments')
        .insert([{
          employee_id: paymentModal.employee.id,
          type: 'salary',
          amount: finalAmount,
          description: description,
          date: new Date().toISOString().split('T')[0],
          status: 'paid',
          reservation_details: reservationDetails  // store as jsonb directly
        }]);

      if (paymentError) throw paymentError;


      // Close the payment interface and reset
      setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
      setJournalierPaymentMode({
        isActive: false,
        selectedReservationIds: [],
        searchTerm: '',
        searchResults: [],
        workerReservations: [],
        totalAmount: 0,
        paymentAmount: '',
        paymentPercentage: '',
        usePercentage: false,
      });

      // Refresh data to reflect all changes
      fetchData();
    } catch (error) {
      console.error('Error saving journalier payment:', error);
      alert('Erreur lors de l\'enregistrement du paiement');
    }
  };

  // ===== PERCENTAGE PAYMENT FUNCTIONS =====

  // Unpaid acomptes/absences for a worker (from already-loaded payments state).
  const getUnpaidDeductions = (workerId: string) => {
    const items = payments.filter(p =>
      p.employeeId === workerId &&
      (p.type === 'acompte' || p.type === 'absence') &&
      (p.status === 'unpaid' || !p.status)
    );
    const acomptes = items.filter(p => p.type === 'acompte');
    const absences = items.filter(p => p.type === 'absence');
    return {
      items,
      totalAcomptes: acomptes.reduce((s, p) => s + (p.amount || 0), 0),
      totalAbsences: absences.reduce((s, p) => s + (p.amount || 0), 0),
      total: items.reduce((s, p) => s + (p.amount || 0), 0),
    };
  };

  // Load all UNPAID commission reservations for a percentage worker and
  // pre-compute the net amount (commissions − unpaid acomptes/absences).
  const loadPercentageReservations = async (workerId: string) => {
    try {
      const { data, error } = await supabase
        .from('reservation_workers')
        .select(`
          id, reservation_id, amount, percentage, status,
          reservations ( id, client_name, client_phone, date, total_price )
        `)
        .eq('worker_id', workerId)
        .eq('payment_type', 'percentage')
        .eq('status', 'unpaid')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const reservations = (data || []).map((rw: any) => ({
        reservationWorkerId: rw.id,
        reservationId: rw.reservation_id,
        clientName: rw.reservations?.client_name || 'Client',
        clientPhone: rw.reservations?.client_phone || '',
        date: rw.reservations?.date || '',
        basePrice: rw.reservations?.total_price || 0,
        commission: rw.amount || 0,
        percentage: rw.percentage || 0,
      }));

      const deductions = getUnpaidDeductions(workerId);
      const totalCommission = reservations.reduce((s, r) => s + r.commission, 0);
      const net = totalCommission - deductions.total;

      setPercentagePaymentMode({
        isActive: true,
        reservations,
        editedAmount: net > 0 ? String(Math.round(net * 100) / 100) : '0',
      });
    } catch (err) {
      console.error('Error loading percentage reservations:', err);
      alert('Erreur lors du chargement des réservations');
    }
  };

  const savePercentagePayment = async () => {
    if (!paymentModal.employee) return;
    const employeeId = paymentModal.employee.id;
    const amount = parseFloat(percentagePaymentMode.editedAmount || '0');
    if (isNaN(amount) || amount < 0) {
      alert('Veuillez entrer un montant valide');
      return;
    }

    try {
      const { reservations } = percentagePaymentMode;
      const deductions = getUnpaidDeductions(employeeId);

      // 1. Record the salary payment (with the reservations breakdown).
      const reservationDetails = reservations.map(r => ({
        clientName: r.clientName,
        clientPhone: r.clientPhone,
        date: r.date,
        amount: r.commission,
        percentage: r.percentage,
      }));
      const description =
        `Paiement commissions - ${reservations.length} réservation(s)` +
        (deductions.items.length ? `, ${deductions.items.length} déduction(s)` : '');

      const { error: payErr } = await supabase.from('employee_payments').insert([{
        employee_id: employeeId,
        type: 'salary',
        amount,
        description,
        date: new Date().toISOString().split('T')[0],
        status: 'paid',
        reservation_details: reservationDetails,
      }]);
      if (payErr) throw payErr;

      // 2. Mark the paid commission reservations.
      const rwIds = reservations.map(r => r.reservationWorkerId).filter(Boolean);
      if (rwIds.length > 0) {
        const { error } = await supabase
          .from('reservation_workers')
          .update({ status: 'paid' })
          .in('id', rwIds);
        if (error) throw error;
      }

      // 3. Mark the included acomptes/absences as paid.
      if (deductions.items.length > 0) {
        const { error } = await supabase
          .from('employee_payments')
          .update({ status: 'paid' })
          .in('id', deductions.items.map(d => d.id));
        if (error) throw error;
      }

      setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
      setPercentagePaymentMode({ isActive: false, reservations: [], editedAmount: '' });
      fetchData();
    } catch (err) {
      console.error('Error saving percentage payment:', err);
      alert('Erreur lors de l\'enregistrement du paiement');
    }
  };

  const calculateNetSalary = (employeeId: string, customDays?: number) => {
    // Get the actual employee to fetch their real salary amount
    const employee = employees.find(emp => emp.id === employeeId);

    // Use the real amount based on payment type
    let baseSalary = 0;
    let actualDays = 0;
    let calculationStartDate = new Date();

    if (employee?.paymentType === 'days' && employee?.dailyRate) {
      // Calculate days from last paid period or hire date to current date
      if (customDays !== undefined) {
        actualDays = customDays;
      } else {
        // Get the last paid period for this worker
        const workerPaidPeriods = paidPeriods.filter(p => p.workerId === employeeId);
        let startDate: Date;

        if (workerPaidPeriods.length > 0) {
          // Get the most recent paid period
          const lastPaidPeriod = workerPaidPeriods.reduce((latest, current) => {
            const latestEnd = parseDateString(latest.endDate);
            const currentEnd = parseDateString(current.endDate);
            return currentEnd > latestEnd ? current : latest;
          });
          // Start from day after last paid period
          const lastPaidDate = parseDateString(lastPaidPeriod.endDate);
          startDate = new Date(lastPaidDate);
          startDate.setDate(startDate.getDate() + 1);
          calculationStartDate = startDate;
        } else {
          // No paid periods, start from hire date
          startDate = employee.hireDate ? parseDateString(employee.hireDate) : new Date();
          calculationStartDate = startDate;
        }

        // Get the actual current date from system (without time component)
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        // Count days between start date and today (inclusive of start date, inclusive of today)
        let daysCount = 0;
        const loopDate = new Date(startDate);
        loopDate.setHours(0, 0, 0, 0);

        while (loopDate <= currentDate) {
          daysCount++;
          loopDate.setDate(loopDate.getDate() + 1);
        }

        actualDays = daysCount;
      }
      baseSalary = employee.dailyRate * actualDays;
    } else if (employee?.paymentType === 'month' && employee?.monthlyRate) {
      baseSalary = employee.monthlyRate;
    } else {
      baseSalary = 0;
    }

    // Get the date of the last salary payment to only count new deductions after that
    const lastSalaryPayment = payments
      .filter(p => p.employeeId === employeeId && p.type === 'salary')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const lastPaymentDate = lastSalaryPayment ? new Date(lastSalaryPayment.date) : new Date('2000-01-01');

    // Only include UNPAID acomptes and absences created on or after the last salary payment
    const empPayments = payments.filter(p =>
      p.employeeId === employeeId &&
      (p.type === 'acompte' || p.type === 'absence') &&
      new Date(p.date) >= lastPaymentDate &&
      (p.status === 'unpaid' || !p.status) // Include unpaid or those without status (backwards compatibility)
    );
    const totalDeductions = empPayments.reduce((sum, p) => sum + p.amount, 0);
    return {
      base: baseSalary,
      days: actualDays || 0,
      deductions: totalDeductions,
      net: baseSalary - totalDeductions,
      acomptes: empPayments.filter(p => p.type === 'acompte').reduce((sum, p) => sum + p.amount, 0),
      absences: empPayments.filter(p => p.type === 'absence').reduce((sum, p) => sum + p.amount, 0),
      calculationStartDate: calculationStartDate
    };
  };

  const calculatePercentageEarnings = (employeeId: string) => {
    // For percentage workers, calculate earnings based on commission from reservations
    const employee = employees.find(emp => emp.id === employeeId);
    const empPayments = payments.filter(p => p.employeeId === employeeId && p.type === 'salary');

    // Get the date of the last salary payment to only count new deductions on or after that
    const lastSalaryPayment = empPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const lastPaymentDate = lastSalaryPayment ? new Date(lastSalaryPayment.date) : new Date('2000-01-01');

    // Only include UNPAID deductions created on or after the last salary payment
    const deductions = payments.filter(p =>
      p.employeeId === employeeId &&
      (p.type === 'acompte' || p.type === 'absence') &&
      new Date(p.date) >= lastPaymentDate &&
      (p.status === 'unpaid' || !p.status) // Include unpaid or those without status
    );

    const totalDeductions = deductions.reduce((sum, p) => sum + p.amount, 0);

    // Calculate earnings from reservation work (unpaid only)
    const allWorksForEmployee = reservationWorkerEarnings.filter(rw => rw.workerId === employeeId);
    const unpaidWorksForEmployee = allWorksForEmployee.filter(rw => rw.status === 'unpaid');
    const reservationEarnings = unpaidWorksForEmployee.reduce((sum, rw) => sum + rw.amount, 0);

    console.log(`calculatePercentageEarnings for employee ${employeeId}:`, {
      allWorks: allWorksForEmployee,
      unpaidWorks: unpaidWorksForEmployee,
      totalEarnings: reservationEarnings,
      allReservationWorkerEarnings: reservationWorkerEarnings
    });

    return {
      base: reservationEarnings,
      total: reservationEarnings,
      days: 0,
      deductions: totalDeductions,
      net: reservationEarnings - totalDeductions,
      acomptes: deductions.filter(p => p.type === 'acompte').reduce((sum, p) => sum + p.amount, 0),
      absences: deductions.filter(p => p.type === 'absence').reduce((sum, p) => sum + p.amount, 0),
      calculationStartDate: new Date()
    };
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold text-ink tracking-tight">Employés</h2>
          <p className="text-ink/40 mt-2 font-medium">Gérez votre équipe, leurs rôles et leurs rémunérations</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingEmployee(null); setIsModalOpen(true); }}
          className="btn-gradient shimmer flex items-center gap-2.5 px-8 py-3"
        >
          <Plus size={20} />
          Ajouter un employé
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {employees.map((emp, idx) => (
          <motion.div
            key={emp.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="card-premium p-8 group hover:translate-y-[-4px] transition-all duration-300"
          >
            <div className="flex items-center gap-5 mb-8">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-inner group-hover:bg-accent group-hover:text-on-accent transition-all duration-500">
                  <User size={40} />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center shadow-sm">
                  <Briefcase size={14} className="text-accent" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-serif font-bold text-2xl text-ink tracking-tight truncate">{emp.fullName}</h4>
                <span className={cn(
                  "inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mt-1.5 border",
                  emp.role === 'admin' ? "bg-purple-50 text-purple-600 border-purple-100" : "bg-blue-50 text-blue-600 border-blue-100"
                )}>
                  {emp.role === 'admin' ? 'Administrateur' : 'Employé'}
                </span>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-4 text-sm text-ink/60 font-medium">
                <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center text-accent/60">
                  <Phone size={16} />
                </div>
                <span>{emp.phone}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-ink/60 font-medium">
                <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center text-accent/60">
                  <MapPin size={16} />
                </div>
                <span className="truncate">{emp.address}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-ink/60 font-medium">
                <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center text-accent/60">
                  <Calendar size={16} />
                </div>
                <span>Embauché le: <span className="text-accent font-bold">{formatDateWithoutTimezone(emp.hireDate)}</span></span>
              </div>
              <div className="flex items-center gap-4 text-sm text-ink/60 font-medium">
                <div className="w-8 h-8 rounded-lg bg-primary-bg flex items-center justify-center text-accent/60">
                  <DollarSign size={16} />
                </div>
                <span>Rémunération: <span className="text-accent font-bold">{
                  emp.paymentType === 'percentage' ? `${emp.percentage}%` :
                    emp.paymentType === 'month' ? formatCurrency(emp.monthlyRate || 0) + ' /mois' :
                      'Paiement à la journée'
                }</span></span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-6">
              <button
                onClick={() => openHistoryModal(emp)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-primary-bg hover:bg-blue-50 text-ink/60 hover:text-blue-500 transition-all text-[10px] font-bold uppercase tracking-wider"
              >
                <History size={16} /> Historique
              </button>
              <button
                onClick={() => { setPaymentModal({ isOpen: true, employee: emp, type: 'acompte' }); setPaymentFormData({ amount: '', description: '', date: new Date().toISOString().split('T')[0] }); setDateRangeOverride({ lastPaymentDate: '', currentDate: new Date().toISOString().split('T')[0] }); }}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-primary-bg hover:bg-accent/10 text-ink/60 hover:text-accent transition-all text-[10px] font-bold uppercase tracking-wider"
              >
                <PlusCircle size={16} /> Acompte
              </button>
              <button
                onClick={() => { setPaymentModal({ isOpen: true, employee: emp, type: 'absence' }); setPaymentFormData({ amount: '', description: '', date: new Date().toISOString().split('T')[0] }); setDateRangeOverride({ lastPaymentDate: '', currentDate: new Date().toISOString().split('T')[0] }); }}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-primary-bg hover:bg-red-50 text-ink/60 hover:text-red-500 transition-all text-[10px] font-bold uppercase tracking-wider"
              >
                <MinusCircle size={16} /> Absence
              </button>
              <button
                onClick={() => {
                  if (emp.paymentType === 'days') {
                    // For journalier workers, load their reservations
                    setPaymentModal({ isOpen: true, employee: emp, type: 'payment' });
                    loadJournalierReservations(emp.id);
                  } else if (emp.paymentType === 'percentage') {
                    // For percentage workers, load unpaid commissions + deductions
                    setPaymentModal({ isOpen: true, employee: emp, type: 'payment' });
                    loadPercentageReservations(emp.id);
                  } else {
                    // For monthly workers, use the traditional payment interface
                    setPaymentModal({ isOpen: true, employee: emp, type: 'payment' });
                    setPaymentFormData({ amount: '', description: '', date: new Date().toISOString().split('T')[0] });
                    setDateRangeOverride({ lastPaymentDate: '', currentDate: new Date().toISOString().split('T')[0] });
                  }
                }}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-accent text-on-accent hover:bg-accent/90 transition-all text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-accent/20"
              >
                <DollarSign size={16} /> Paiement
              </button>
            </div>

            <div className="pt-6 border-t border-border flex gap-3">
              <button
                onClick={() => openEditModal(emp)}
                className="flex-1 py-3 rounded-xl bg-primary-bg text-ink/60 font-bold text-xs hover:bg-accent hover:text-on-accent transition-all duration-300 flex items-center justify-center gap-2 shadow-sm"
              >
                <Edit2 size={16} /> Modifier
              </button>
              <button
                onClick={() => setDeleteConfirm({ isOpen: true, id: emp.id, name: emp.fullName })}
                disabled={isDeletingId === emp.id}
                className="p-3 rounded-xl bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Payment/Acompte/Absence Modal */}
      <AnimatePresence mode="wait">
        {paymentModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setPaymentModal({ isOpen: false, employee: null, type: 'acompte' }); setDailyPaymentData({ days: '', date: new Date().toISOString().split('T')[0] }); setDateRangeOverride({ lastPaymentDate: '', currentDate: new Date().toISOString().split('T')[0] }); setPercentagePaymentMode({ isActive: false, reservations: [], editedAmount: '' }); }}
              className="fixed inset-0 bg-overlay backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-surface rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col mx-auto"
            >
              <div className="p-5 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">
                    {paymentModal.type === 'acompte' ? 'Nouvel Acompte' :
                      paymentModal.type === 'absence' ? 'Nouvelle Absence' :
                        'Calcul du Paiement'}
                  </h3>
                  <button onClick={() => { setPaymentModal({ isOpen: false, employee: null, type: 'acompte' }); setDailyPaymentData({ days: '', date: new Date().toISOString().split('T')[0] }); setDateRangeOverride({ lastPaymentDate: '', currentDate: new Date().toISOString().split('T')[0] }); setPercentagePaymentMode({ isActive: false, reservations: [], editedAmount: '' }); }} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="flex items-center gap-4 p-4 bg-primary-bg/50 rounded-2xl border border-border/30">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                    <User size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink/30 uppercase tracking-widest">Employé</p>
                    <p className="font-bold text-ink">{paymentModal.employee?.fullName}</p>
                  </div>
                </div>

                {/* JOURNALIER PAYMENT INTERFACE */}
                {paymentModal.type === 'payment' && paymentModal.employee?.paymentType === 'days' && journalierPaymentMode.isActive && (
                  <div className="space-y-5">
                    {/* Unpaid Reservations */}
                    <div className="p-5 bg-surface border border-border rounded-2xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-gradient-to-b from-accent to-accent/60 rounded-full"></div>
                        <h3 className="text-sm font-bold text-ink uppercase tracking-widest">Réservations non payées</h3>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                        {journalierPaymentMode.workerReservations.length === 0 ? (
                          <div className="p-4 bg-ink/5 rounded-lg text-center">
                            <p className="text-xs text-ink/40 font-medium">Aucune réservation non payée</p>
                          </div>
                        ) : (
                          journalierPaymentMode.workerReservations.map(reservation => (
                            <label key={reservation.reservationId} className="flex items-center gap-3 p-3 bg-ink/2 rounded-lg cursor-pointer hover:bg-accent/5 transition-colors border border-transparent hover:border-accent/20">
                              <input
                                type="checkbox"
                                checked={journalierPaymentMode.selectedReservationIds.includes(reservation.reservationId)}
                                onChange={() => toggleReservationSelection(reservation.reservationId)}
                                className="w-4 h-4 accent-accent rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-ink truncate">{reservation.clientName}</p>
                                <p className="text-[10px] text-ink/60 mt-0.5">{reservation.clientPhone} • {new Date(reservation.date).toLocaleDateString('fr-FR')}</p>
                              </div>
                              <p className="font-serif font-bold text-accent text-xs whitespace-nowrap">{formatCurrency(reservation.amount)}</p>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Search for additional reservations */}
                    <div className="p-5 bg-surface border border-border rounded-2xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-500/60 rounded-full"></div>
                        <h3 className="text-sm font-bold text-ink uppercase tracking-widest">Ajouter d'autres réservations</h3>
                      </div>
                      <input
                        type="text"
                        placeholder="Rechercher par nom ou téléphone..."
                        value={journalierPaymentMode.searchTerm}
                        onChange={(e) => {
                          setJournalierPaymentMode(prev => ({ ...prev, searchTerm: e.target.value }));
                          searchJournalierReservations(paymentModal.employee!.id, e.target.value);
                        }}
                        className="w-full input-premium text-xs mb-3"
                      />
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {journalierPaymentMode.searchResults.length === 0 ? (
                          journalierPaymentMode.searchTerm && (
                            <div className="p-4 bg-ink/5 rounded-lg text-center">
                              <p className="text-xs text-ink/40 font-medium">Aucune réservation trouvée</p>
                            </div>
                          )
                        ) : (
                          journalierPaymentMode.searchResults.map(reservation => (
                            <label key={reservation.reservationId} className="flex items-center gap-3 p-3 bg-ink/2 rounded-lg cursor-pointer hover:bg-green-500/5 transition-colors border border-transparent hover:border-green-500/20">
                              <input
                                type="checkbox"
                                checked={journalierPaymentMode.selectedReservationIds.includes(reservation.reservationId)}
                                onChange={() => toggleReservationSelection(reservation.reservationId)}
                                className="w-4 h-4 accent-green-500 rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-ink truncate">{reservation.clientName}</p>
                                <p className="text-[10px] text-ink/60 mt-0.5">{reservation.clientPhone} • {new Date(reservation.date).toLocaleDateString('fr-FR')}</p>
                              </div>
                              <p className="font-serif font-bold text-green-600 text-xs whitespace-nowrap">{formatCurrency(reservation.amount)}</p>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Total and Payment Options */}
                    <div className="p-5 bg-surface border border-border rounded-2xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-gradient-to-b from-accent to-accent/60 rounded-full"></div>
                        <h3 className="text-sm font-bold text-ink uppercase tracking-widest">Détails du paiement</h3>
                      </div>
                      <div className="space-y-3">
                        {/* Total */}
                        <div className="flex justify-between items-center p-3 bg-gradient-to-r from-accent/5 to-transparent rounded-lg border border-accent/20">
                          <span className="text-sm text-ink/70 font-medium">Total sélectionné</span>
                          <span className="font-serif font-bold text-lg text-accent">{formatCurrency(journalierPaymentMode.totalAmount)}</span>
                        </div>

                        {/* Payment type selector */}
                        <div className="space-y-3 mt-4">
                          <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-accent/5 border border-border transition-colors">
                            <input
                              type="radio"
                              checked={!journalierPaymentMode.usePercentage}
                              onChange={() => setJournalierPaymentMode(prev => ({ ...prev, usePercentage: false }))}
                              className="w-4 h-4 accent-accent"
                            />
                            <span className="text-sm font-medium text-ink">Montant fixe</span>
                          </label>
                          {!journalierPaymentMode.usePercentage && (
                            <input
                              type="number"
                              placeholder="Entrez le montant à payer"
                              value={journalierPaymentMode.paymentAmount}
                              onChange={(e) => setJournalierPaymentMode(prev => ({ ...prev, paymentAmount: e.target.value }))}
                              className="w-full input-premium text-xs ml-7"
                              max={journalierPaymentMode.totalAmount}
                            />
                          )}
                        </div>

                        <div className="space-y-3">
                          <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-accent/5 border border-border transition-colors">
                            <input
                              type="radio"
                              checked={journalierPaymentMode.usePercentage}
                              onChange={() => setJournalierPaymentMode(prev => ({ ...prev, usePercentage: true }))}
                              className="w-4 h-4 accent-accent"
                            />
                            <span className="text-sm font-medium text-ink">Pourcentage</span>
                          </label>
                          {journalierPaymentMode.usePercentage && (
                            <div className="space-y-3 ml-7">
                              <input
                                type="number"
                                placeholder="Entrez le pourcentage (0-100)"
                                value={journalierPaymentMode.paymentPercentage}
                                onChange={(e) => setJournalierPaymentMode(prev => ({ ...prev, paymentPercentage: e.target.value }))}
                                className="w-full input-premium text-xs"
                                min="0"
                                max="100"
                              />
                              {journalierPaymentMode.paymentPercentage && (
                                <div className="flex justify-between items-center p-3 bg-gradient-to-r from-green-500/5 to-transparent rounded-lg border border-green-500/20">
                                  <span className="text-sm text-ink/70 font-medium">Montant à payer ({journalierPaymentMode.paymentPercentage}%)</span>
                                  <span className="font-serif font-bold text-lg text-green-600">{formatCurrency(calculateJournalierPayment())}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PERCENTAGE PAYMENT INTERFACE */}
                {paymentModal.type === 'payment' && paymentModal.employee?.paymentType === 'percentage' && percentagePaymentMode.isActive && (() => {
                  const totalCommission = percentagePaymentMode.reservations.reduce((s, r) => s + r.commission, 0);
                  const deductions = getUnpaidDeductions(paymentModal.employee!.id);
                  const net = totalCommission - deductions.total;
                  return (
                    <div className="space-y-5 mt-5">
                      {/* Unpaid commission reservations */}
                      <div className="p-5 bg-surface border border-border rounded-2xl shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-1 h-6 bg-gradient-to-b from-accent to-accent/60 rounded-full"></div>
                          <h3 className="text-sm font-bold text-ink uppercase tracking-widest">Réservations non payées ({percentagePaymentMode.reservations.length})</h3>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {percentagePaymentMode.reservations.length === 0 ? (
                            <div className="p-4 bg-ink/5 rounded-lg text-center">
                              <p className="text-xs text-ink/40 font-medium">Aucune réservation non payée</p>
                            </div>
                          ) : (
                            percentagePaymentMode.reservations.map(r => (
                              <div key={r.reservationWorkerId} className="flex items-center gap-3 p-3 bg-ink/2 rounded-lg border border-border/40">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-ink truncate">{r.clientName}</p>
                                  <p className="text-[10px] text-ink/60 mt-0.5">
                                    {r.clientPhone ? r.clientPhone + ' • ' : ''}{r.date ? new Date(r.date).toLocaleDateString('fr-FR') : ''} • {r.percentage}% de {formatCurrency(r.basePrice)}
                                  </p>
                                </div>
                                <p className="font-serif font-bold text-accent text-xs whitespace-nowrap">{formatCurrency(r.commission)}</p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="mt-3 flex justify-between items-center px-3 py-2 rounded-lg border border-accent/20 bg-accent/5">
                          <span className="text-xs font-bold text-ink/50 uppercase tracking-wider">Total commissions</span>
                          <span className="font-serif font-bold text-accent">{formatCurrency(totalCommission)}</span>
                        </div>
                      </div>

                      {/* Unpaid acomptes & absences */}
                      {deductions.items.length > 0 && (
                        <div className="p-5 bg-surface border border-border rounded-2xl shadow-sm">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-1 h-6 bg-gradient-to-b from-red-500 to-red-500/60 rounded-full"></div>
                            <h3 className="text-sm font-bold text-ink uppercase tracking-widest">Acomptes & absences non payés</h3>
                          </div>
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                            {deductions.items.map(d => (
                              <div key={d.id} className="flex items-center justify-between p-3 bg-red-50/60 rounded-lg border border-red-100">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-red-700">{d.type === 'acompte' ? 'Acompte' : 'Absence'}</p>
                                  <p className="text-[10px] text-red-500/70 mt-0.5 truncate">{d.description || ''} {d.date ? '• ' + new Date(d.date).toLocaleDateString('fr-FR') : ''}</p>
                                </div>
                                <p className="font-serif font-bold text-red-500 text-xs">-{formatCurrency(d.amount)}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex justify-between items-center px-3 py-2 rounded-lg border border-red-100 bg-red-50/40">
                            <span className="text-xs font-bold text-red-500/60 uppercase tracking-wider">Total déductions</span>
                            <span className="font-serif font-bold text-red-500">-{formatCurrency(deductions.total)}</span>
                          </div>
                        </div>
                      )}

                      {/* Net + editable amount */}
                      <div className="p-5 bg-surface border border-border rounded-2xl shadow-sm space-y-3">
                        <div className="flex justify-between items-center p-3 bg-primary-bg/50 rounded-lg border border-border/30">
                          <span className="text-sm text-ink/50 font-medium">Net calculé (commissions − déductions)</span>
                          <span className="font-serif font-bold text-lg text-ink">{formatCurrency(net)}</span>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-ink/40 uppercase tracking-widest ml-1">Montant à payer (modifiable)</label>
                          <div className="relative">
                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                            <input
                              type="number"
                              value={percentagePaymentMode.editedAmount}
                              onChange={e => setPercentagePaymentMode(prev => ({ ...prev, editedAmount: e.target.value }))}
                              className="w-full input-premium pl-12 text-lg font-bold"
                              placeholder="0.00 DA"
                            />
                          </div>
                          {net > 0 && (
                            <button
                              type="button"
                              onClick={() => setPercentagePaymentMode(prev => ({ ...prev, editedAmount: String(Math.round(net * 100) / 100) }))}
                              className="text-[11px] font-bold text-accent hover:underline ml-1"
                            >
                              Réinitialiser au net calculé ({formatCurrency(net)})
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {paymentModal.type === 'payment' && !(paymentModal.employee?.paymentType === 'days' && journalierPaymentMode.isActive) && !(paymentModal.employee?.paymentType === 'percentage' && percentagePaymentMode.isActive) ? (
                  <div className="space-y-5">
                    {(() => {
                      const employee = paymentModal.employee!;
                      const customDays = employee.paymentType === 'days' && dailyPaymentData.days ? parseInt(dailyPaymentData.days) : undefined;
                      const details = employee.paymentType === 'percentage'
                        ? calculatePercentageEarnings(employee.id)
                        : calculateNetSalary(employee.id, customDays);

                      return (
                        <>
                          {employee.paymentType === 'days' && (
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                              <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3">Paie Journalière</p>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs text-blue-600 mb-2">Tarier journalier: <span className="font-bold">{formatCurrency(employee.dailyRate || 0)}</span></p>
                                  {(() => {
                                    const workerPaidPeriods = paidPeriods.filter(p => p.workerId === employee.id);
                                    let lastPaymentDate: Date | null = null;

                                    if (workerPaidPeriods.length > 0) {
                                      const lastPaidPeriod = workerPaidPeriods.reduce((latest, current) => {
                                        const latestEnd = parseDateString(latest.endDate);
                                        const currentEnd = parseDateString(current.endDate);
                                        return currentEnd > latestEnd ? current : latest;
                                      });
                                      lastPaymentDate = new Date(parseDateString(lastPaidPeriod.endDate));
                                    } else {
                                      // Fallback: check payments history for last salary payment
                                      const lastSalaryPayment = payments
                                        .filter(p => p.employeeId === employee.id && p.type === 'salary')
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                      if (lastSalaryPayment) {
                                        lastPaymentDate = new Date(lastSalaryPayment.date);
                                      }
                                    }

                                    // Use override dates if set, otherwise use calculated dates
                                    const displayLastPaymentDate = dateRangeOverride.lastPaymentDate
                                      ? new Date(parseDateString(dateRangeOverride.lastPaymentDate))
                                      : lastPaymentDate;

                                    const displayCurrentDate = dateRangeOverride.currentDate
                                      ? new Date(parseDateString(dateRangeOverride.currentDate))
                                      : new Date();

                                    // Calculate days between last payment and current date
                                    let daysBetween = 0;
                                    if (displayLastPaymentDate) {
                                      const tempDate = new Date(displayLastPaymentDate);
                                      tempDate.setHours(0, 0, 0, 0);
                                      const currentDateNormalized = new Date(displayCurrentDate);
                                      currentDateNormalized.setHours(0, 0, 0, 0);

                                      // Get the earlier and later dates
                                      const earlierDate = tempDate <= currentDateNormalized ? tempDate : currentDateNormalized;
                                      const laterDate = tempDate > currentDateNormalized ? tempDate : currentDateNormalized;

                                      // Count days from earlier to later date (inclusive)
                                      let loopDate = new Date(earlierDate);
                                      while (loopDate <= laterDate) {
                                        daysBetween++;
                                        loopDate.setDate(loopDate.getDate() + 1);
                                      }

                                      // Don't count the first day, only count from day after
                                      daysBetween = daysBetween > 0 ? daysBetween - 1 : 0;
                                    }

                                    return (
                                      <div className="space-y-2">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Dernière paie le</label>
                                          <input
                                            type="date"
                                            value={dateRangeOverride.lastPaymentDate || (lastPaymentDate ? lastPaymentDate.toISOString().split('T')[0] : '')}
                                            onChange={e => setDateRangeOverride({ ...dateRangeOverride, lastPaymentDate: e.target.value })}
                                            className="w-full input-premium text-xs"
                                          />
                                          {lastPaymentDate && !dateRangeOverride.lastPaymentDate && (
                                            <p className="text-[10px] text-blue-500 italic">Détecté: {lastPaymentDate.toLocaleDateString('fr-FR')}</p>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Date actuelle</label>
                                          <input
                                            type="date"
                                            value={dateRangeOverride.currentDate}
                                            onChange={e => setDateRangeOverride({ ...dateRangeOverride, currentDate: e.target.value })}
                                            className="w-full input-premium text-xs"
                                          />
                                        </div>
                                        <p className="text-xs text-blue-500 italic">Jours écoulés: <span className="font-bold">{daysBetween} jour{daysBetween !== 1 ? 's' : ''}</span></p>
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-blue-600 uppercase tracking-widest">Nombre de jours</label>
                                  <input
                                    type="number"
                                    value={dailyPaymentData.days}
                                    onChange={e => setDailyPaymentData({ ...dailyPaymentData, days: e.target.value })}
                                    className="w-full input-premium"
                                    placeholder={`${details.days} jours`}
                                  />
                                  {!dailyPaymentData.days && <p className="text-[10px] text-blue-500 italic">Par défaut: {details.days} jours (du {details.calculationStartDate ? details.calculationStartDate.toLocaleDateString('fr-FR') : 'N/A'} à aujourd'hui)</p>}
                                </div>
                              </div>
                            </div>
                          )}
                          {employee.paymentType === 'percentage' && (
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                              <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Paie Pourcentage</p>
                              <p className="text-sm text-blue-600">Rémunération basée sur {employee.percentage}% des services effectués</p>
                            </div>
                          )}
                          {employee.paymentType === 'month' && (
                            <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                              <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3">Paie Mensuelle</p>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs text-green-600 mb-2">Salaire mensuel: <span className="font-bold">{formatCurrency(employee.monthlyRate || 0)}</span></p>
                                  {(() => {
                                    const workerPaidPeriods = paidPeriods.filter(p => p.workerId === employee.id);
                                    let lastPaymentDate: Date | null = null;

                                    if (workerPaidPeriods.length > 0) {
                                      const lastPaidPeriod = workerPaidPeriods.reduce((latest, current) => {
                                        const latestEnd = parseDateString(latest.endDate);
                                        const currentEnd = parseDateString(current.endDate);
                                        return currentEnd > latestEnd ? current : latest;
                                      });
                                      lastPaymentDate = new Date(parseDateString(lastPaidPeriod.endDate));
                                    } else {
                                      // Fallback: check payments history for last salary payment
                                      const lastSalaryPayment = payments
                                        .filter(p => p.employeeId === employee.id && p.type === 'salary')
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                      if (lastSalaryPayment) {
                                        lastPaymentDate = new Date(lastSalaryPayment.date);
                                      }
                                    }

                                    // Use override dates if set, otherwise use calculated dates
                                    const displayLastPaymentDate = dateRangeOverride.lastPaymentDate
                                      ? new Date(parseDateString(dateRangeOverride.lastPaymentDate))
                                      : lastPaymentDate;

                                    const displayCurrentDate = dateRangeOverride.currentDate
                                      ? new Date(parseDateString(dateRangeOverride.currentDate))
                                      : new Date();

                                    // Calculate days between last payment and current date
                                    let daysBetween = 0;
                                    if (displayLastPaymentDate) {
                                      const tempDate = new Date(displayLastPaymentDate);
                                      tempDate.setHours(0, 0, 0, 0);
                                      const currentDateNormalized = new Date(displayCurrentDate);
                                      currentDateNormalized.setHours(0, 0, 0, 0);

                                      // Get the earlier and later dates
                                      const earlierDate = tempDate <= currentDateNormalized ? tempDate : currentDateNormalized;
                                      const laterDate = tempDate > currentDateNormalized ? tempDate : currentDateNormalized;

                                      // Count days from earlier to later date (inclusive)
                                      let loopDate = new Date(earlierDate);
                                      while (loopDate <= laterDate) {
                                        daysBetween++;
                                        loopDate.setDate(loopDate.getDate() + 1);
                                      }

                                      // Don't count the first day, only count from day after
                                      daysBetween = daysBetween > 0 ? daysBetween - 1 : 0;
                                    }

                                    return (
                                      <div className="space-y-2">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Dernière paie le</label>
                                          <input
                                            type="date"
                                            value={dateRangeOverride.lastPaymentDate || (lastPaymentDate ? lastPaymentDate.toISOString().split('T')[0] : '')}
                                            onChange={e => setDateRangeOverride({ ...dateRangeOverride, lastPaymentDate: e.target.value })}
                                            className="w-full input-premium text-xs"
                                          />
                                          {lastPaymentDate && !dateRangeOverride.lastPaymentDate && (
                                            <p className="text-[10px] text-green-500 italic">Détecté: {lastPaymentDate.toLocaleDateString('fr-FR')}</p>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Date actuelle</label>
                                          <input
                                            type="date"
                                            value={dateRangeOverride.currentDate}
                                            onChange={e => setDateRangeOverride({ ...dateRangeOverride, currentDate: e.target.value })}
                                            className="w-full input-premium text-xs"
                                          />
                                        </div>
                                        <p className="text-xs text-green-500 italic">Jours écoulés: <span className="font-bold">{daysBetween} jour{daysBetween !== 1 ? 's' : ''}</span></p>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="flex justify-between items-center p-4 bg-primary-bg/50 rounded-2xl border border-border/30">
                            <span className="text-sm text-ink/40 font-medium">
                              {employee.paymentType === 'percentage' ? 'Total Gains' : employee.paymentType === 'days' ? `Salaire (${details.days} j)` : 'Salaire de base'}
                            </span>
                            <span className="font-serif font-bold text-lg text-ink">{formatCurrency(details.base)}</span>
                          </div>

                          {/* Show works breakdown for percentage workers */}
                          {employee.paymentType === 'percentage' && (
                            <div className="p-4 bg-accent/5 rounded-2xl border border-accent/20">
                              <p className="text-xs font-bold text-accent uppercase tracking-widest mb-3">Travaux Effectués</p>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {(() => {
                                  const worksForEmployee = reservationWorkerEarnings.filter(
                                    rw => rw.workerId === employee.id && rw.status === 'unpaid'
                                  );
                                  const debugTotal = worksForEmployee.reduce((sum, w) => sum + w.amount, 0);
                                  console.log(`DEBUG: Employee ${employee.id}, works:`, worksForEmployee, 'total:', debugTotal);
                                  if (worksForEmployee.length === 0) {
                                    return <p className="text-xs text-ink/40">Aucun travail non payé</p>;
                                  }
                                  return worksForEmployee.map((work, idx) => (
                                    <div key={idx} className="flex justify-between text-xs p-2 bg-surface/30 rounded">
                                      <span className="text-ink/60">Réservation #{work.reservationId.substring(0, 8)}</span>
                                      <span className="font-bold text-accent">{formatCurrency(work.amount)}</span>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between items-center p-4 bg-red-50/50 rounded-2xl border border-red-100/50">
                            <span className="text-sm text-red-500/60 font-medium">Total Acomptes</span>
                            <span className="font-serif font-bold text-lg text-red-500">-{formatCurrency(details.acomptes)}</span>
                          </div>
                          <div className="flex justify-between items-center p-4 bg-red-50/50 rounded-2xl border border-red-100/50">
                            <span className="text-sm text-red-500/60 font-medium">Coût Absences</span>
                            <span className="font-serif font-bold text-lg text-red-500">-{formatCurrency(details.absences)}</span>
                          </div>
                          <div className="pt-8 mt-4 border-t border-border flex justify-between items-center">
                            <span className="font-serif font-bold text-xl text-ink">Net à payer</span>
                            <span className="text-3xl font-serif font-bold text-accent tracking-tight">{formatCurrency(details.net)}</span>
                          </div>
                          <button
                            onClick={handleValidatePayment}
                            className="w-full btn-gradient shimmer mt-8 py-4 flex items-center justify-center gap-3"
                          >
                            <DollarSign size={22} /> Valider le Paiement
                          </button>
                        </>
                      );
                    })()}
                  </div>
                ) : paymentModal.type === 'payment' && paymentModal.employee?.paymentType === 'days' && journalierPaymentMode.isActive ? (
                  <div className="flex gap-4 pt-8">
                    <button
                      onClick={() => {
                        setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
                        setJournalierPaymentMode({
                          isActive: false,
                          selectedReservationIds: [],
                          searchTerm: '',
                          searchResults: [],
                          workerReservations: [],
                          totalAmount: 0,
                          paymentAmount: '',
                          paymentPercentage: '',
                          usePercentage: false,
                        });
                      }}
                      className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={saveJournalierPayment}
                      disabled={journalierPaymentMode.selectedReservationIds.length === 0 || (!journalierPaymentMode.paymentAmount && !journalierPaymentMode.paymentPercentage)}
                      className="flex-1 btn-gradient shimmer py-4 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Check size={20} /> Enregistrer le Paiement
                    </button>
                  </div>
                ) : paymentModal.type === 'payment' && paymentModal.employee?.paymentType === 'percentage' && percentagePaymentMode.isActive ? (
                  <div className="flex gap-4 pt-8">
                    <button
                      onClick={() => {
                        setPaymentModal({ isOpen: false, employee: null, type: 'acompte' });
                        setPercentagePaymentMode({ isActive: false, reservations: [], editedAmount: '' });
                      }}
                      className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={savePercentagePayment}
                      disabled={percentagePaymentMode.reservations.length === 0 && (!paymentModal.employee || getUnpaidDeductions(paymentModal.employee.id).items.length === 0)}
                      className="flex-1 btn-gradient shimmer py-4 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Check size={20} /> Valider le Paiement
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">
                        {paymentModal.type === 'acompte' ? 'Montant de l\'acompte (DA)' : 'Coût de l\'absence (DA)'}
                      </label>
                      <input
                        type="number"
                        value={paymentFormData.amount}
                        onChange={e => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
                        className="w-full input-premium"
                        placeholder="0.00 DA"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Date</label>
                      <input
                        type="date"
                        value={paymentFormData.date}
                        onChange={e => setPaymentFormData({ ...paymentFormData, date: e.target.value })}
                        className="w-full input-premium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-ink/30 uppercase tracking-widest ml-1">Description / Motif</label>
                      <textarea
                        value={paymentFormData.description}
                        onChange={e => setPaymentFormData({ ...paymentFormData, description: e.target.value })}
                        className="w-full input-premium h-32 pt-4"
                        placeholder="Détails..."
                      ></textarea>
                    </div>
                    <button
                      onClick={handleAddPaymentAction}
                      disabled={!paymentFormData.amount}
                      className="w-full btn-gradient py-4 disabled:opacity-50"
                    >
                      Enregistrer {paymentModal.type === 'acompte' ? 'l\'acompte' : 'l\'absence'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Employee Modal */}
      <AnimatePresence mode="wait">
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-overlay backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-surface rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col mx-auto"
            >
              <div className="p-5 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">
                    {editingEmployee ? 'Modifier l\'employé' : 'Ajouter un employé'}
                  </h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Nom Complet</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                        className="w-full input-premium pl-12"
                        placeholder="Prénom Nom"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Téléphone</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full input-premium pl-12"
                        placeholder="05..."
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Adresse</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                      <input
                        type="text"
                        value={formData.address}
                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                        className="w-full input-premium pl-12"
                        placeholder="Adresse complète"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Poste</label>
                    <select
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value as any })}
                      className="w-full input-premium"
                    >
                      <option value="worker">Employé (Worker)</option>
                      <option value="admin">Administrateur</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Type de Paiement</label>
                    <select
                      value={formData.paymentType}
                      onChange={e => setFormData({ ...formData, paymentType: e.target.value as any })}
                      className="w-full input-premium"
                    >
                      <option value="month">Mensuel</option>
                      <option value="days">Journalier</option>
                      <option value="percentage">Pourcentage</option>
                    </select>
                  </div>
                  {formData.paymentType === 'month' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Salaire Mensuel (DA)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                        <input
                          type="number"
                          value={formData.monthlyRate}
                          onChange={e => setFormData({ ...formData, monthlyRate: e.target.value })}
                          className="w-full input-premium pl-12"
                          placeholder="Ex: 60000"
                        />
                      </div>
                    </div>
                  )}
                  {formData.paymentType === 'days' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Tarif Journalier (DA)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                        <input
                          type="number"
                          value={formData.dailyRate}
                          onChange={e => setFormData({ ...formData, dailyRate: e.target.value })}
                          className="w-full input-premium pl-12"
                          placeholder="Ex: 2000"
                        />
                      </div>
                    </div>
                  )}
                  {formData.paymentType === 'percentage' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Pourcentage de commission (%)</label>
                      <div className="relative">
                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.percentage}
                          onChange={e => setFormData({ ...formData, percentage: e.target.value })}
                          className="w-full input-premium pl-12"
                          placeholder="Ex: 30"
                        />
                      </div>
                      <p className="text-[10px] text-ink/40 ml-1">L'employé gagne ce pourcentage de chaque prestation qu'il finalise.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Date d'embauche</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                      <input
                        type="date"
                        value={formData.hireDate}
                        onChange={e => setFormData({ ...formData, hireDate: e.target.value })}
                        className="w-full input-premium pl-12"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 pt-4 border-t border-border">
                    <h4 className="text-sm font-bold text-ink/40 mb-4">Informations de connexion</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Nom d'utilisateur</label>
                        <input
                          type="text"
                          value={formData.username}
                          onChange={e => setFormData({ ...formData, username: e.target.value })}
                          className="w-full input-premium"
                          placeholder="username"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                          <input
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            className="w-full input-premium pl-12"
                            placeholder="email@salon.dz"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-ink/30 ml-1">Mot de passe</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={18} />
                          <input
                            type="password"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            className="w-full input-premium pl-12"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Permissions editor — workers only (admins have full access) */}
                  {formData.role === 'worker' && (
                    <div className="md:col-span-2 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck size={18} className="text-accent" />
                        <h4 className="text-sm font-bold text-ink/60">Permissions & accès</h4>
                      </div>
                      <p className="text-[11px] text-ink/40 mb-4">
                        Choisissez les interfaces et les actions autorisées pour cet employé. Sans accès, l'interface reste masquée.
                      </p>
                      <div className="space-y-3">
                        {PERMISSION_CATALOG.map(iface => {
                          const acts = formData.permissions[iface.id] || [];
                          const canView = acts.includes('view');
                          return (
                            <div
                              key={iface.id}
                              className={cn(
                                'rounded-2xl border p-4 transition-colors',
                                canView ? 'border-accent/30 bg-accent/5' : 'border-border bg-primary-bg/40',
                              )}
                            >
                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={canView}
                                  onChange={() => togglePermission(iface.id, 'view')}
                                  className="w-4 h-4 accent-accent rounded"
                                />
                                <span className="text-sm font-bold text-ink">{iface.label}</span>
                              </label>
                              {canView && iface.actions.length > 1 && (
                                <div className="flex flex-wrap gap-2 mt-3 ml-7">
                                  {iface.actions.filter(a => a.id !== 'view').map(a => {
                                    const active = acts.includes(a.id);
                                    return (
                                      <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => togglePermission(iface.id, a.id)}
                                        className={cn(
                                          'px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all',
                                          active
                                            ? 'bg-accent text-on-accent border-accent'
                                            : 'bg-surface text-ink/50 border-border hover:border-accent/40',
                                        )}
                                      >
                                        {a.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsModalOpen(false)} disabled={isSaving} className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all disabled:opacity-50">Annuler</button>
                  <button
                    onClick={handleSaveEmployee}
                    disabled={isSaving}
                    className="flex-1 btn-gradient shimmer py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <><div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin"></div> Enregistrement...</>
                    ) : (
                      <><Check size={20} /> Enregistrer</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence mode="wait">
        {deleteConfirm?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto">
                  <AlertCircle size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-serif font-bold text-ink tracking-tight">Confirmer la suppression</h3>
                  <p className="text-ink/40 font-medium">
                    Êtes-vous sûr de vouloir supprimer <span className="text-ink font-bold">"{deleteConfirm.name}"</span> ? Cette action est irréversible.
                  </p>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }} className="flex-1 py-4 rounded-2xl bg-surface border border-border font-bold text-ink/40 hover:text-ink transition-all">Annuler</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(); }}
                    disabled={isDeletingId === deleteConfirm?.id}
                    className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeletingId === deleteConfirm?.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin"></div>
                        Suppression...
                      </>
                    ) : (
                      'Supprimer'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence mode="wait">
        {historyModal.isOpen && historyModal.employee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryModal({ isOpen: false, employee: null })}
              className="fixed inset-0 bg-overlay backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-surface rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col mx-auto"
            >
              <div className="sticky top-0 bg-gradient-to-r from-accent/10 to-accent/5 border-b border-border p-5 md:p-8 flex justify-between items-center z-10">
                <div>
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">
                    Historique de {historyModal.employee.fullName}
                  </h3>
                  <p className="text-sm text-ink/40 mt-1">Tous les travaux, paiements, acomptes et absences</p>
                </div>
                <button
                  onClick={() => setHistoryModal({ isOpen: false, employee: null })}
                  className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1">
                <div className="p-5 md:p-8 space-y-8">

                  {/* Employee Info Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-primary-bg rounded-2xl border border-border/30">
                      <p className="text-xs font-bold uppercase tracking-widest text-ink/30 mb-2">Type de Paiement</p>
                      <p className="text-sm font-bold text-accent">
                        {historyModal.employee.paymentType === 'percentage' ? `${historyModal.employee.percentage}%` :
                          historyModal.employee.paymentType === 'month' ? 'Mensuel' : 'Journalier'}
                      </p>
                    </div>
                    <div className="p-4 bg-primary-bg rounded-2xl border border-border/30">
                      <p className="text-xs font-bold uppercase tracking-widest text-ink/30 mb-2">Total Travaux</p>
                      <p className="text-sm font-bold text-accent">{historyData.works.length}</p>
                    </div>
                    <div className="p-4 bg-primary-bg rounded-2xl border border-border/30">
                      <p className="text-xs font-bold uppercase tracking-widest text-ink/30 mb-2">Total Acomptes</p>
                      <p className="text-sm font-bold text-accent">
                        {formatCurrency(historyData.payments
                          .filter(p => p.type === 'acompte')
                          .reduce((sum, p) => sum + p.amount, 0))}
                      </p>
                    </div>
                    <div className="p-4 bg-primary-bg rounded-2xl border border-border/30">
                      <p className="text-xs font-bold uppercase tracking-widest text-ink/30 mb-2">Total Absences</p>
                      <p className="text-sm font-bold text-red-500">
                        {formatCurrency(historyData.payments
                          .filter(p => p.type === 'absence')
                          .reduce((sum, p) => sum + p.amount, 0))}
                      </p>
                    </div>
                  </div>

                  {/* Totals Summary for Journalier Workers */}
                  {historyModal.employee.paymentType === 'days' && historyData.works.length > 0 && (
                    <div className="p-6 bg-gradient-to-r from-accent/15 to-amber-50 rounded-2xl border border-accent/30">
                      <h4 className="font-serif font-bold text-ink mb-4 text-lg flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-accent"></div>
                        Résumé des Paiements Journaliers
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 bg-surface rounded-xl border border-accent/20">
                          <p className="text-xs text-ink/40 font-bold uppercase tracking-widest mb-1">Total Payé</p>
                          <p className="text-lg md:text-xl font-serif font-bold text-green-600">
                            {formatCurrency(historyData.works.filter(w => w.reservationWorkerStatus === 'paid').reduce((sum, w) => sum + (w.price || 0), 0))}
                          </p>
                        </div>
                        <div className="p-3 bg-surface rounded-xl border border-accent/20">
                          <p className="text-xs text-ink/40 font-bold uppercase tracking-widest mb-1">Total Non Payé</p>
                          <p className="text-lg md:text-xl font-serif font-bold text-orange-600">
                            {formatCurrency(historyData.works.filter(w => w.reservationWorkerStatus === 'unpaid').reduce((sum, w) => sum + (w.price || 0), 0))}
                          </p>
                        </div>
                        <div className="p-3 bg-surface rounded-xl border border-accent/20">
                          <p className="text-xs text-ink/40 font-bold uppercase tracking-widest mb-1">Travaux Payés</p>
                          <p className="text-lg md:text-xl font-serif font-bold text-green-600">
                            {historyData.works.filter(w => w.reservationWorkerStatus === 'paid').length}
                          </p>
                        </div>
                        <div className="p-3 bg-surface rounded-xl border border-accent/20">
                          <p className="text-xs text-ink/40 font-bold uppercase tracking-widest mb-1">Travaux Non Payés</p>
                          <p className="text-lg md:text-xl font-serif font-bold text-orange-600">
                            {historyData.works.filter(w => w.reservationWorkerStatus === 'unpaid').length}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tabs or sections */}
                  <div className="space-y-6">
                    {/* Works Section */}
                    <div>
                      <h4 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                        <Briefcase size={20} className="text-accent" />
                        Travaux Effectués ({historyData.works.length})
                      </h4>
                      {historyData.works.length > 0 ? (
                        <div className="space-y-3">
                          {historyData.works.map((work) => (
                            <div key={work.id} className="p-4 bg-primary-bg rounded-xl border border-border/30 hover:border-accent/30 transition-all">
                              <div className="flex justify-between items-start gap-4">
                                <div className="flex-1">
                                  <h5 className="font-bold text-ink">{work.name}</h5>
                                  <p className="text-xs text-ink/40 mt-1">
                                    {new Date(work.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-accent">{formatCurrency(work.price)}</p>
                                  <span className={cn(
                                    "inline-block text-xs font-bold px-3 py-1 rounded-lg mt-2",
                                    work.reservationWorkerStatus === 'paid' ? 'bg-green-50 text-green-600' :
                                      work.reservationWorkerStatus === 'unpaid' ? 'bg-orange-50 text-orange-600' :
                                        'bg-gray-50 text-gray-600'
                                  )}>
                                    {work.reservationWorkerStatus === 'paid' ? 'Payé' :
                                      work.reservationWorkerStatus === 'unpaid' ? 'Non Payé' : 'Statut Inconnu'}
                                  </span>
                                </div>
                              </div>
                              {historyModal.employee.paymentType === 'percentage' && (
                                <div className="mt-3 pt-3 border-t border-border/30">

                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 bg-primary-bg rounded-xl text-center text-ink/40">
                          <Briefcase size={32} className="mx-auto opacity-20 mb-2" />
                          <p className="font-medium">Aucun travail enregistré</p>
                        </div>
                      )}
                    </div>

                    {/* Acomptes Section */}
                    <div>
                      <h4 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                        <DollarSign size={20} className="text-blue-600" />
                        Acomptes ({historyData.payments.filter(p => p.type === 'acompte').length})
                      </h4>
                      {historyData.payments.filter(p => p.type === 'acompte').length > 0 ? (
                        <div className="space-y-3">
                          {historyData.payments.filter(p => p.type === 'acompte').map((payment) => (
                            <div key={payment.id} className="p-4 bg-blue-50 rounded-xl border border-blue-100 hover:border-blue-300 transition-all">
                              <div className="flex justify-between items-start gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="font-bold text-blue-900">Acompte</h5>
                                    <span className={cn(
                                      "inline-block text-xs font-bold px-2 py-1 rounded-md",
                                      payment.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                                    )}>
                                      {payment.status === 'paid' ? 'PAYÉ' : 'NON PAYÉ'}
                                    </span>
                                  </div>
                                  {payment.description && (
                                    <p className="text-xs text-blue-600/60">{payment.description}</p>
                                  )}
                                  <p className="text-xs text-blue-600/40 mt-2">
                                    {new Date(payment.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                  </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-2">
                                  <p className="text-lg font-bold text-blue-600">+{formatCurrency(payment.amount)}</p>
                                  <button
                                    onClick={() => handleDeletePayment(payment.id)}
                                    className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-blue-50 rounded-xl text-center text-blue-400">
                          <p className="font-medium text-sm">Aucun acompte enregistré</p>
                        </div>
                      )}
                    </div>

                    {/* Absences Section */}
                    <div>
                      <h4 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                        <AlertCircle size={20} className="text-red-600" />
                        Absences ({historyData.payments.filter(p => p.type === 'absence').length})
                      </h4>
                      {historyData.payments.filter(p => p.type === 'absence').length > 0 ? (
                        <div className="space-y-3">
                          {historyData.payments.filter(p => p.type === 'absence').map((payment) => (
                            <div key={payment.id} className="p-4 bg-red-50 rounded-xl border border-red-100 hover:border-red-300 transition-all">
                              <div className="flex justify-between items-start gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="font-bold text-red-900">Absence</h5>
                                    <span className={cn(
                                      "inline-block text-xs font-bold px-2 py-1 rounded-md",
                                      payment.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                                    )}>
                                      {payment.status === 'paid' ? 'PAYÉ' : 'NON PAYÉ'}
                                    </span>
                                  </div>
                                  {payment.description && (
                                    <p className="text-xs text-red-600/60">{payment.description}</p>
                                  )}
                                  <p className="text-xs text-red-600/40 mt-2">
                                    {new Date(payment.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                  </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-2">
                                  <p className="text-lg font-bold text-red-600">-{formatCurrency(payment.amount)}</p>
                                  <button
                                    onClick={() => handleDeletePayment(payment.id)}
                                    className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-red-50 rounded-xl text-center text-red-400">
                          <p className="font-medium text-sm">Aucune absence enregistrée</p>
                        </div>
                      )}
                    </div>

                    {/* Salary Payments Section */}
                    <div>
                      <h4 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                        <Check size={20} className="text-green-600" />
                        Paiements de Salaire ({historyData.payments.filter(p => p.type === 'salary').length})
                      </h4>
                      {historyData.payments.filter(p => p.type === 'salary').length > 0 ? (
                        <div className="space-y-3">
                          {historyData.payments.filter(p => p.type === 'salary').map((payment) => (
                            <motion.button
                              key={payment.id}
                              onClick={() => {
                                try {
                                  let reservationDetails: any[] = [];
                                  if (payment.reservation_details) {
                                    const raw = payment.reservation_details;
                                    // Handle both JSON string and already-parsed array
                                    if (typeof raw === 'string') {
                                      reservationDetails = JSON.parse(raw);
                                    } else if (Array.isArray(raw)) {
                                      reservationDetails = raw;
                                    } else {
                                      // It may be a stringified object stored as jsonb
                                      reservationDetails = JSON.parse(JSON.stringify(raw));
                                    }
                                  }
                                  setSelectedPaymentDetails({
                                    isOpen: true,
                                    payment: payment,
                                    reservations: reservationDetails
                                  });
                                } catch (e) {
                                  console.error('Error parsing reservation_details:', e);
                                  setSelectedPaymentDetails({
                                    isOpen: true,
                                    payment: payment,
                                    reservations: []
                                  });
                                }
                              }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="w-full text-left p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 hover:border-green-400 hover:shadow-md transition-all cursor-pointer"
                            >
                              <div className="flex justify-between items-start gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="font-bold text-green-900">Paiement de Salaire</h5>
                                    <span className="inline-block text-xs font-bold px-2 py-1 rounded-md bg-green-100 text-green-700">
                                      PAYÉ
                                    </span>
                                  </div>
                                  {payment.description && (
                                    <p className="text-xs text-green-700 font-medium mt-1">{payment.description}</p>
                                  )}
                                  <p className="text-xs text-green-600/60 mt-2">
                                    Payé le: {new Date(payment.date).toLocaleDateString('fr-FR', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                  </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-2">
                                  <p className="text-lg font-serif font-bold text-green-700">+{formatCurrency(payment.amount)}</p>
                                  <div className="text-xs text-green-600/40 font-medium cursor-pointer hover:text-green-700">Détails →</div>
                                </div>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-green-50 rounded-xl text-center text-green-400">
                          <p className="font-medium text-sm">Aucun paiement enregistré</p>
                        </div>
                      )}
                    </div>

                    {/* Summary for Percentage Payment */}
                    {historyModal.employee.paymentType === 'percentage' && historyData.works.length > 0 && (
                      <div className="p-6 bg-gradient-to-r from-accent/10 to-accent/5 rounded-xl border border-accent/20">
                        <h5 className="font-bold text-ink mb-4">Résumé des Paiements en Pourcentage</h5>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-ink/40 mb-1">Total Travaux</p>
                            <p className="font-bold text-accent">
                              {formatCurrency(historyData.works.reduce((sum, w) => sum + (w.price || 0), 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-ink/40 mb-1">Travaux Non Payés</p>
                            <p className="font-bold text-orange-600">
                              {formatCurrency(historyData.works.filter(w => w.reservationWorkerStatus === 'unpaid').reduce((sum, w) => sum + (w.price || 0), 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-ink/40 mb-1">Travaux Payés</p>
                            <p className="font-bold text-green-600">
                              {formatCurrency(historyData.works.filter(w => w.reservationWorkerStatus === 'paid').reduce((sum, w) => sum + (w.price || 0), 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-ink/40 mb-1">Total Acomptes</p>
                            <p className="font-bold text-blue-600">
                              {formatCurrency(historyData.payments.filter(p => p.type === 'acompte').reduce((sum, p) => sum + p.amount, 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-ink/40 mb-1">Total Absences</p>
                            <p className="font-bold text-red-600">
                              {formatCurrency(historyData.payments.filter(p => p.type === 'absence').reduce((sum, p) => sum + p.amount, 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-ink/40 mb-1">Solde</p>
                            <p className={cn(
                              "font-bold",
                              (historyData.works.filter(w => w.reservationWorkerStatus === 'unpaid').reduce((sum, w) => sum + (w.price || 0), 0) -
                                historyData.payments.filter(p => p.type === 'acompte').reduce((sum, p) => sum + p.amount, 0) +
                                historyData.payments.filter(p => p.type === 'absence').reduce((sum, p) => sum + p.amount, 0)) >= 0 ? 'text-green-600' : 'text-red-600'
                            )}>
                              {formatCurrency(
                                historyData.works.filter(w => w.reservationWorkerStatus === 'unpaid').reduce((sum, w) => sum + (w.price || 0), 0) -
                                historyData.payments.filter(p => p.type === 'acompte').reduce((sum, p) => sum + p.amount, 0) +
                                historyData.payments.filter(p => p.type === 'absence').reduce((sum, p) => sum + p.amount, 0)
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-surface border-t border-border p-5 md:p-8 flex gap-4">
                <button
                  onClick={() => setHistoryModal({ isOpen: false, employee: null })}
                  className="flex-1 py-3 rounded-xl bg-primary-bg text-ink/60 font-bold hover:bg-accent/10 transition-all"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Details Modal */}
      <AnimatePresence mode="wait">
        {selectedPaymentDetails.isOpen && selectedPaymentDetails.payment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPaymentDetails({ isOpen: false, payment: null, reservations: [] })}
              className="fixed inset-0 bg-overlay backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-surface rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col mx-auto"
            >
              <div className="sticky top-0 bg-gradient-to-r from-green-500/10 to-green-400/5 border-b border-border p-5 md:p-8 flex justify-between items-center z-10">
                <div>
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-ink tracking-tight">
                    Détails du Paiement
                  </h3>
                  <p className="text-sm text-ink/40 mt-1">{selectedPaymentDetails.payment.description}</p>
                </div>
                <button
                  onClick={() => setSelectedPaymentDetails({ isOpen: false, payment: null, reservations: [] })}
                  className="p-2 rounded-xl hover:bg-primary-bg text-ink/20 hover:text-ink transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1">
                <div className="p-5 md:p-8 space-y-6">

                  {/* Payment Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                      <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-2">Montant Total</p>
                      <p className="text-2xl font-serif font-bold text-green-700">
                        {formatCurrency(selectedPaymentDetails.payment.amount)}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">Date de Paiement</p>
                      <p className="text-lg font-bold text-blue-700">
                        {new Date(selectedPaymentDetails.payment.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="p-4 bg-accent/10 rounded-2xl border border-accent/30">
                      <p className="text-xs font-bold uppercase tracking-widest text-accent mb-2">Réservations</p>
                      <p className="text-lg font-bold text-accent">
                        {selectedPaymentDetails.reservations.length}
                      </p>
                    </div>
                  </div>

                  {/* Reservations List */}
                  {selectedPaymentDetails.reservations.length > 0 ? (
                    <div>
                      <h4 className="text-lg font-bold text-ink mb-4">Réservations Incluses</h4>
                      <div className="space-y-3">
                        {selectedPaymentDetails.reservations.map((res, index) => (
                          <div key={index} className="p-4 bg-primary-bg rounded-xl border border-border/50 hover:border-accent/30 transition-all">
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                                    <span className="text-xs font-bold text-accent">{index + 1}</span>
                                  </div>
                                  <h5 className="font-bold text-ink">{res.clientName}</h5>
                                </div>
                                <p className="text-xs text-ink/40 ml-11">
                                  {new Date(res.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-serif font-bold text-accent text-sm">{formatCurrency(res.amount)}</p>
                                {res.percentage && (
                                  <span className="inline-block text-xs font-bold text-accent/60 mt-1">
                                    {res.percentage.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-4 bg-gradient-to-r from-accent/10 to-accent/5 rounded-xl border border-accent/20">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-ink">Total</span>
                          <span className="font-serif font-bold text-lg text-accent">
                            {formatCurrency(selectedPaymentDetails.reservations.reduce((sum, r) => sum + r.amount, 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 bg-primary-bg rounded-xl text-center">
                      <p className="text-ink/40 font-medium">Aucune information de réservation disponible</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 bg-surface border-t border-border p-5 md:p-8 flex gap-4">
                <button
                  onClick={() => setSelectedPaymentDetails({ isOpen: false, payment: null, reservations: [] })}
                  className="flex-1 py-3 rounded-xl bg-primary-bg text-ink/60 font-bold hover:bg-accent/10 transition-all"
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

export default Employees;
