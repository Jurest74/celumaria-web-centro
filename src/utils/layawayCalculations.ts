// Utilidades para cálculos de planes separe
import { Sale, Product, Customer } from '../types';

export interface LayawayPayment {
  id: string;
  amount: number;
  method: string;
  commission: number;
  date: Date;
}

export interface LayawayPlan {
  id: string;
  customerId: string;
  products: LayawayProduct[];
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  totalPaid: number;
  remainingAmount: number;
  payments: LayawayPayment[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  pickupHistory: PickupRecord[];
}

export interface LayawayProduct {
  productId: string;
  name: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
  quantityPickedUp: number;
  remainingQuantity: number;
}

export interface PickupRecord {
  id: string;
  productId: string;
  quantity: number;
  date: Date;
  pickedUpBy: string;
}

export interface LayawayFormData {
  customerId: string;
  products: Array<{
    productId: string;
    quantity: number;
    size: string;
    color: string;
  }>;
  initialPayment: number;
  paymentMethod: string;
}

export interface LayawayState {
  plans: LayawayPlan[];
  selectedPlan: LayawayPlan | null;
  loading: boolean;
  error: string | null;
}

export interface PaymentFormData {
  amount: number;
  method: string;
  useMultiplePayments: boolean;
  paymentMethods: Array<{
    method: string;
    amount: number;
    commission?: number;
  }>;
}

export const calculateLayawayTotals = (products: LayawayProduct[]) => {
  const totalAmount = products.reduce((sum, product) => sum + product.totalPrice, 0);
  const totalCost = products.reduce((sum, product) => sum + product.totalCost, 0);
  const totalProfit = totalAmount - totalCost;
  
  return {
    totalAmount,
    totalCost,
    totalProfit,
    profitMargin: totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0
  };
};

export const calculateRemainingAmount = (totalAmount: number, totalPaid: number): number => {
  return Math.max(0, totalAmount - totalPaid);
};

export const calculateTotalPaid = (payments: LayawayPayment[]): number => {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
};

export const canCompletePickup = (product: LayawayProduct): boolean => {
  return product.remainingQuantity > 0;
};

export const calculatePickupProgress = (products: LayawayProduct[]): number => {
  const totalQuantity = products.reduce((sum, product) => sum + product.quantity, 0);
  const pickedUpQuantity = products.reduce((sum, product) => sum + product.quantityPickedUp, 0);
  
  return totalQuantity > 0 ? (pickedUpQuantity / totalQuantity) * 100 : 0;
};

export const getLayawayStatus = (plan: LayawayPlan): 'pending_payment' | 'pending_pickup' | 'completed' | 'cancelled' => {
  if (plan.status === 'cancelled') return 'cancelled';
  
  const remainingAmount = calculateRemainingAmount(plan.totalAmount, plan.totalPaid);
  const pickupProgress = calculatePickupProgress(plan.products);
  
  if (remainingAmount > 0) return 'pending_payment';
  if (pickupProgress < 100) return 'pending_pickup';
  return 'completed';
};

export const formatLayawayDate = (date: Date): string => {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const validateLayawayPayment = (
  amount: number,
  remainingAmount: number,
  customerCredit: number,
  applyCredit: boolean
): { isValid: boolean; error?: string } => {
  if (amount <= 0) {
    return { isValid: false, error: 'El monto debe ser mayor a cero' };
  }
  
  const availableCredit = applyCredit ? customerCredit : 0;
  const maxPayment = remainingAmount + availableCredit;
  
  if (amount > maxPayment) {
    return { 
      isValid: false, 
      error: `El monto no puede ser mayor a ${maxPayment.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}` 
    };
  }
  
  return { isValid: true };
};

export const calculatePaymentDistribution = (
  totalPayment: number,
  remainingAmount: number,
  customerCredit: number,
  applyCredit: boolean
): { toDebt: number; toCredit: number; creditUsed: number } => {
  const creditUsed = applyCredit ? Math.min(customerCredit, remainingAmount) : 0;
  const toDebt = Math.min(totalPayment, remainingAmount - creditUsed);
  const toCredit = Math.max(0, totalPayment - toDebt);
  
  return { toDebt, toCredit, creditUsed };
};