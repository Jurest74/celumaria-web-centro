// Utilidades para cálculos de ventas
import { SaleItem } from '../types';
import { calculatePaymentCommission, calculateCustomerSurcharge } from './paymentCommission';

export interface SaleTotal {
  subtotal: number;
  appliedDiscount: number;
  total: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  totalCommissions: number;
  customerSurcharge: number;
  finalTotal: number;
}

export interface ExtendedPaymentMethod {
  method: string;
  amount: number;
  commission?: number;
}

export const calculateSaleTotal = (
  currentSale: SaleItem[],
  discount: number,
  paymentMethod: string,
  paymentMethods: ExtendedPaymentMethod[],
  useMultiplePayments: boolean
): SaleTotal => {
  const subtotal = currentSale.reduce((sum, item) => sum + item.totalRevenue, 0);
  const totalCost = currentSale.reduce((sum, item) => sum + item.totalCost, 0);
  const appliedDiscount = Math.min(discount, subtotal);
  const total = subtotal - appliedDiscount;
  
  let totalCommissions = 0;
  let customerSurcharge = 0;
  
  if (useMultiplePayments) {
    totalCommissions = paymentMethods.reduce((sum, payment) => sum + (payment.commission || 0), 0);
    customerSurcharge = paymentMethods.reduce((sum, payment) => sum + calculateCustomerSurcharge(payment.method, payment.amount), 0);
  } else {
    totalCommissions = calculatePaymentCommission(paymentMethod, total);
    customerSurcharge = calculateCustomerSurcharge(paymentMethod, total);
  }
  
  const finalTotal = total + customerSurcharge;
  const totalProfit = total - totalCost - totalCommissions;
  const profitMargin = total > 0 ? (totalProfit / total) * 100 : 0;
  
  return { 
    subtotal, 
    appliedDiscount, 
    total, 
    totalCost, 
    totalProfit, 
    profitMargin, 
    totalCommissions,
    customerSurcharge,
    finalTotal
  };
};

export const calculateCreditUsed = (
  customerCredit: number,
  total: number,
  paymentMethods: ExtendedPaymentMethod[]
): number => {
  const paidWithoutCredit = paymentMethods
    .filter(p => p.method !== 'credit')
    .reduce((sum, p) => sum + p.amount, 0);
  
  return Math.min(customerCredit, Math.max(0, total - paidWithoutCredit));
};

export const getTotalPaidAmount = (
  paymentMethods: ExtendedPaymentMethod[],
  customerCredit: number,
  applyCredit: boolean,
  total: number
): number => {
  let paid = paymentMethods.reduce((sum, payment) => sum + payment.amount, 0);
  
  if (applyCredit && customerCredit > 0) {
    const creditUsed = calculateCreditUsed(customerCredit, total, paymentMethods);
    paid += creditUsed;
  }
  
  return paid;
};