export type Role = 'admin' | 'worker' | 'super_admin';

export type Employee = User;

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  avatar?: string;
  phone?: string;
  address?: string;
  paymentType?: 'days' | 'month' | 'percentage';
  percentage?: number;
  dailyRate?: number;
  monthlyRate?: number;
  hireDate?: string;
  createdAt?: string;
  /** Per-worker interface/action permissions, e.g. { reservations: ['view','create'] } */
  permissions?: Record<string, string[]>;
}

export interface Prestation {
  id: string;
  name: string;
  description?: string;
  price: number;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  price: number;
}

export interface Reservation {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  prestationId: string;
  prestationName?: string;
  serviceIds: string[];
  date: string;
  time: string;
  totalPrice: number;
  paidAmount: number;
  status: 'pending' | 'finalized' | 'cancelled' | 'completed';
  workerId?: string;
  createdBy: string;
  finalizedAt?: string;
  finalized_by?: string;
  createdAt?: string;
  isWalkIn?: boolean; // "Sur place": client created & finalized in the same visit
}

export interface Supplier {
  id: string;
  fullName: string;
  phone: string;
  address: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  description: string;
  cost: number;
  paidAmount: number;
  date: string;
}

export interface Expense {
  id: string;
  name: string;
  description: string;
  cost: number;
  date: string;
}

export interface EmployeePayment {
  id: string;
  employeeId: string;
  amount: number;
  type: 'salary' | 'acompte' | 'absence';
  description: string;
  date: string;
  status?: 'paid' | 'unpaid'; // Track payment status
  paid?: boolean; // Legacy field for backwards compatibility
  reservation_details?: string; // JSON string containing reservation details for journalier payments
}

export interface StoreConfig {
  name: string;
  logo?: string;
  slogan: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  phone: string;
  location: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  createdAt?: string;
}

export interface ProductBrand {
  id: string;
  name: string;
  createdAt?: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  barcode?: string;
  categoryId?: string;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  sellByDetail: boolean;
  detailUnitQty?: number;
  detailUnit?: string;
  minStock: number;
  priceSell: number;
  priceLastBuy?: number;
  currentStock: number;
  currentDetailStock?: number;
  createdAt?: string;
}

export interface ProductPurchase {
  id: string;
  supplierId?: string;
  supplierName?: string;
  date: string;
  totalCost: number;
  paidAmount: number;
  status: 'paid' | 'debt';
  items: ProductPurchaseItem[];
  payments?: PurchasePayment[];
  createdAt?: string;
}

export interface ProductPurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName?: string;
  quantityBought: number;
  priceBuy: number;
  priceSell: number;
  minStock?: number;
  sellByDetail?: boolean;
  detailUnitQty?: number;
}

export interface PurchasePayment {
  id: string;
  purchaseId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  createdAt?: string;
}

export interface Sale {
  id: string;
  clientId?: string;
  clientName: string;
  clientPhone?: string;
  date: string;
  totalAmount: number;
  paidAmount: number;
  status: 'paid' | 'debt';
  items: SaleItem[];
  payments?: SalePayment[];
  invoiceNumber?: string;
  createdAt?: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  isDetail: boolean;
  detailQtyUsed?: number;
  detailUnit?: string;
}

export interface SalePayment {
  id: string;
  saleId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface ReservationProduct {
  id: string;
  reservationId: string;
  productId: string;
  productName?: string;
  quantity: number;
  price: number;
  isDetail: boolean;
  detailQtyUsed?: number;
  detailUnit?: string;
}
