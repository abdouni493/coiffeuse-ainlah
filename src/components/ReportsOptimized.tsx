import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Calendar, Filter, Download, Loader } from 'lucide-react';
import { cn } from '../lib/utils';
import * as DataService from '../lib/dataService';
import { useDebounce } from '../lib/hooks';

// ============================================================================
// OPTIMIZED REPORTS COMPONENT
// ============================================================================

const ReportsOptimized: React.FC = () => {
  // ========== STATE MANAGEMENT ==========
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const [reportType, setReportType] = useState<'revenue' | 'expenses' | 'employees' | 'inventory'>('revenue');
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' })
      .format(amount)
      .replace('DZD', 'DA');
  }, []);

  // ========== DATA FETCHING ==========
  const generateReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await DataService.fetchReportData(dateRange);

      switch (reportType) {
        case 'revenue':
          setReportData(processRevenueReport(data.reservations));
          break;
        case 'expenses':
          setReportData(processExpenseReport(data.purchases, data.expenses));
          break;
        case 'employees':
          setReportData(processEmployeeReport(data.payments));
          break;
        case 'inventory':
          setReportData(processInventoryReport(data.purchases));
          break;
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, reportType]);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  // ========== REPORT PROCESSING FUNCTIONS ==========
  const processRevenueReport = useCallback((reservations: any[]) => {
    const byDate = new Map<string, { completed: number; pending: number; cancelled: number }>();
    const byPrestation = new Map<string, number>();

    reservations.forEach(r => {
      // By date
      const dateStr = r.date;
      const current = byDate.get(dateStr) || { completed: 0, pending: 0, cancelled: 0 };
      current[r.status] = (current[r.status] || 0) + r.total_price;
      byDate.set(dateStr, current);

      // By prestation
      const prev = byPrestation.get(r.prestation_id) || 0;
      byPrestation.set(r.prestation_id, prev + r.total_price);
    });

    const dailyData = Array.from(byDate.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, data]) => ({
        date,
        completed: data.completed || 0,
        pending: data.pending || 0,
        total: (data.completed || 0) + (data.pending || 0),
      }));

    const totalRevenue = reservations.reduce((sum, r) => sum + r.total_price, 0);
    const totalPaid = reservations.reduce((sum, r) => sum + (r.paid_amount || 0), 0);
    const totalDue = totalRevenue - totalPaid;

    return {
      dailyData,
      totalRevenue,
      totalPaid,
      totalDue,
      completedCount: reservations.filter(r => r.status === 'completed').length,
      averageTicket: reservations.length > 0 ? totalRevenue / reservations.length : 0,
    };
  }, []);

  const processExpenseReport = useCallback((purchases: any[], expenses: any[]) => {
    const allExpenses = [
      ...purchases.map(p => ({ ...p, type: 'purchase' })),
      ...expenses.map(e => ({ ...e, type: 'expense' })),
    ];

    const byDate = new Map<string, number>();
    const byType = { purchase: 0, expense: 0 };

    allExpenses.forEach(e => {
      const date = e.date;
      const current = byDate.get(date) || 0;
      byDate.set(date, current + (e.cost || 0));
      byType[e.type] += e.cost || 0;
    });

    const dailyData = Array.from(byDate.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, amount]) => ({ date, amount }));

    const totalExpenses = allExpenses.reduce((sum, e) => sum + (e.cost || 0), 0);

    return {
      dailyData,
      byType,
      totalExpenses,
      averageDaily: allExpenses.length > 0 ? totalExpenses / new Set(Array.from(byDate.keys())).size : 0,
    };
  }, []);

  const processEmployeeReport = useCallback((payments: any[]) => {
    const byEmployee = new Map<string, { count: number; amount: number; type: string }>();

    payments.forEach(p => {
      const current = byEmployee.get(p.employee_id) || { count: 0, amount: 0, type: p.type };
      current.count += 1;
      current.amount += p.amount || 0;
      byEmployee.set(p.employee_id, current);
    });

    const data = Array.from(byEmployee.entries())
      .map(([id, data]) => ({
        id,
        count: data.count,
        amount: data.amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    return { data, totalPaid, paymentCount: payments.length };
  }, []);

  const processInventoryReport = useCallback((purchases: any[]) => {
    const bySupplier = new Map<string, { count: number; totalCost: number; paid: number }>();

    purchases.forEach(p => {
      const current = bySupplier.get(p.supplier_id) || { count: 0, totalCost: 0, paid: 0 };
      current.count += 1;
      current.totalCost += p.cost || 0;
      current.paid += p.paid_amount || 0;
      bySupplier.set(p.supplier_id, current);
    });

    const data = Array.from(bySupplier.entries())
      .map(([id, data]) => ({
        id,
        count: data.count,
        totalCost: data.totalCost,
        paid: data.paid,
        due: data.totalCost - data.paid,
      }));

    const totalCost = purchases.reduce((sum, p) => sum + (p.cost || 0), 0);
    const totalPaid = purchases.reduce((sum, p) => sum + (p.paid_amount || 0), 0);

    return { data, totalCost, totalPaid, totalDue: totalCost - totalPaid };
  }, []);

  // ========== RENDER FUNCTIONS ==========
  const renderRevenueReport = () => {
    if (!reportData) return null;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Revenue"
            value={formatCurrency(reportData.totalRevenue)}
            color="bg-blue-100 text-blue-700"
          />
          <SummaryCard
            title="Total Paid"
            value={formatCurrency(reportData.totalPaid)}
            color="bg-green-100 text-green-700"
          />
          <SummaryCard
            title="Total Due"
            value={formatCurrency(reportData.totalDue)}
            color="bg-orange-100 text-orange-700"
          />
          <SummaryCard
            title="Average Ticket"
            value={formatCurrency(reportData.averageTicket)}
            color="bg-purple-100 text-purple-700"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartContainer title="Daily Revenue">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={reportData.dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="completed" stroke="#10b981" name="Completed" />
                <Line type="monotone" dataKey="pending" stroke="#f59e0b" name="Pending" />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" name="Total" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>

          <ChartContainer title="Completion Rate">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Completed', value: reportData.completedCount },
                    { name: 'Pending', value: reportData.totalRevenue - reportData.completedCount },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip formatter={(value) => `${value} reservations`} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </div>
    );
  };

  const renderExpenseReport = () => {
    if (!reportData) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard
            title="Total Expenses"
            value={formatCurrency(reportData.totalExpenses)}
            color="bg-red-100 text-red-700"
          />
          <SummaryCard
            title="Purchases"
            value={formatCurrency(reportData.byType.purchase)}
            color="bg-blue-100 text-blue-700"
          />
          <SummaryCard
            title="Other Expenses"
            value={formatCurrency(reportData.byType.expense)}
            color="bg-purple-100 text-purple-700"
          />
        </div>

        <ChartContainer title="Expenses Over Time">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={reportData.dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="amount" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    );
  };

  const renderEmployeeReport = () => {
    if (!reportData) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard
            title="Total Paid"
            value={formatCurrency(reportData.totalPaid)}
            color="bg-green-100 text-green-700"
          />
          <SummaryCard
            title="Payment Count"
            value={reportData.paymentCount}
            color="bg-blue-100 text-blue-700"
          />
        </div>

        <ChartContainer title="Top Employees by Payment">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={reportData.data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="id" type="category" width={100} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="amount" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    );
  };

  const renderInventoryReport = () => {
    if (!reportData) return null;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Cost"
            value={formatCurrency(reportData.totalCost)}
            color="bg-blue-100 text-blue-700"
          />
          <SummaryCard
            title="Total Paid"
            value={formatCurrency(reportData.totalPaid)}
            color="bg-green-100 text-green-700"
          />
          <SummaryCard
            title="Total Due"
            value={formatCurrency(reportData.totalDue)}
            color="bg-orange-100 text-orange-700"
          />
          <SummaryCard
            title="Purchase Count"
            value={reportData.data.length}
            color="bg-purple-100 text-purple-700"
          />
        </div>

        <ChartContainer title="Purchases by Supplier">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={reportData.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="id" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="totalCost" fill="#3b82f6" name="Total Cost" />
              <Bar dataKey="paid" fill="#10b981" name="Paid" />
              <Bar dataKey="due" fill="#ef4444" name="Due" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    );
  };

  const getReportContent = () => {
    switch (reportType) {
      case 'revenue':
        return renderRevenueReport();
      case 'expenses':
        return renderExpenseReport();
      case 'employees':
        return renderEmployeeReport();
      case 'inventory':
        return renderInventoryReport();
      default:
        return null;
    }
  };

  // ========== MAIN RENDER ==========
  return (
    <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Reports & Analytics</h1>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Report Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="revenue">Revenue Report</option>
                  <option value="expenses">Expenses Report</option>
                  <option value="employees">Employee Payments</option>
                  <option value="inventory">Inventory Report</option>
                </select>
              </div>

              {/* From Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">From Date</label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">To Date</label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Refresh Button */}
              <div className="flex items-end">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={generateReport}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : <Filter className="w-5 h-5" />}
                  {isLoading ? 'Loading...' : 'Generate'}
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Report Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
              <Loader className="w-12 h-12 text-blue-500" />
            </motion.div>
          </div>
        ) : (
          <motion.div
            key={reportType}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {getReportContent()}
          </motion.div>
        )}
      </div>
    </div>
  );
};

// ========== HELPER COMPONENTS ==========

const SummaryCard: React.FC<{ title: string; value: any; color: string }> = ({ title, value, color }) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className={cn('rounded-xl p-6 text-center', color)}
  >
    <p className="text-sm font-semibold opacity-75">{title}</p>
    <p className="text-2xl font-bold mt-2">{typeof value === 'number' ? value.toFixed(0) : value}</p>
  </motion.div>
);

const ChartContainer: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <h3 className="text-lg font-bold text-gray-900 mb-4">{title}</h3>
    {children}
  </div>
);

export default ReportsOptimized;
