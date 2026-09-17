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
    // El cajero teclea el monto con el recargo ya sumado, asi que el recargo
    // es lo que entro por encima del precio. Calcularlo como un 3% del monto
    // tecleado lo aplicaba sobre una cifra que ya lo incluia.
    const cobrado = paymentMethods.reduce((sum, payment) => sum + payment.amount, 0);
    customerSurcharge = Math.max(0, cobrado - total);
  } else {
    totalCommissions = calculatePaymentCommission(paymentMethod, total);
    customerSurcharge = calculateCustomerSurcharge(paymentMethod, total);
  }

  const finalTotal = total + customerSurcharge;
  // El negocio recibe finalTotal: el recargo que paga el cliente es ingreso,
  // igual que la comision del datafono es un egreso.
  const totalProfit = finalTotal - totalCost - totalCommissions;
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

/**
 * Parte de un pago que cubre el precio, sin el recargo que paga el cliente.
 *
 * Con tarjeta el cajero teclea el monto con el recargo ya sumado (103.000 por
 * un precio de 100.000), así que lo que abona al precio es el monto dividido
 * por 1 + recargo.
 */
export const principalDePago = (method: string, amount: number): number => {
  const tasaRecargo = calculateCustomerSurcharge(method, 1);
  return tasaRecargo > 0 ? amount / (1 + tasaRecargo) : amount;
};

/**
 * Monto máximo que se puede teclear con un método para cubrir lo que falta
 * del precio: con tarjeta incluye el recargo. Se redondea hacia arriba al peso
 * para que el pago alcance a cubrir el restante.
 *
 * Antes el campo no dejaba pasar del restante sin recargo: en pagos múltiples
 * era imposible teclear el recargo de tarjeta y nunca quedaba registrado.
 */
export const montoMaximoPago = (method: string, restante: number): number => {
  if (restante <= 0) return 0;
  const tasaRecargo = calculateCustomerSurcharge(method, 1);
  return tasaRecargo > 0 ? Math.ceil(restante * (1 + tasaRecargo)) : restante;
};

/** Lo que falta cubrir del precio, contando solo la parte de cada pago que abona al precio. */
export const restantePorPagar = (total: number, paymentMethods: ExtendedPaymentMethod[]): number => {
  const cubierto = paymentMethods.reduce((sum, p) => sum + principalDePago(p.method, p.amount), 0);
  const restante = total - cubierto;
  // Menos de un peso es redondeo del recargo, no saldo pendiente.
  return restante < 1 ? 0 : restante;
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
  // Se excluyen las entradas de saldo a favor ya presentes: el saldo se suma
  // una sola vez, abajo. Sin esto, una lista que ya trae 'credit' lo cuenta dos veces.
  let paid = paymentMethods
    .filter(p => p.method !== 'credit')
    .reduce((sum, payment) => sum + payment.amount, 0);

  const creditEnLista = paymentMethods
    .filter(p => p.method === 'credit')
    .reduce((sum, payment) => sum + payment.amount, 0);

  if (applyCredit && customerCredit > 0) {
    paid += calculateCreditUsed(customerCredit, total, paymentMethods);
  } else {
    paid += creditEnLista;
  }

  return paid;
};

/**
 * Recalcula los totales de una venta despues de devolver parte de sus items.
 * El recargo que pago el cliente y la comision del datafono bajan en la misma
 * proporcion que el total, de modo que la venta queda como si se hubiera
 * hecho por la cantidad final.
 */
export const recalcularTrasDevolucion = (
  original: { total: number; totalCost: number; customerSurcharge?: number; totalCommissions?: number; finalTotal?: number },
  recalculado: { total: number; totalCost: number }
): { total: number; totalCost: number; customerSurcharge: number; totalCommissions: number; finalTotal: number; totalProfit: number; profitMargin: number } => {
  const proporcion = original.total > 0 ? recalculado.total / original.total : 0;

  const customerSurcharge = (original.customerSurcharge || 0) * proporcion;
  const totalCommissions = (original.totalCommissions || 0) * proporcion;
  const finalTotal = recalculado.total + customerSurcharge;
  const totalProfit = finalTotal - recalculado.totalCost - totalCommissions;

  return {
    total: recalculado.total,
    totalCost: recalculado.totalCost,
    customerSurcharge,
    totalCommissions,
    finalTotal,
    totalProfit,
    profitMargin: recalculado.total > 0 ? (totalProfit / recalculado.total) * 100 : 0,
  };
};
/**
 * Ganancia y costo reales de una venta: si lleva cortesías, su costo se
 * descuenta (realProfit / realTotalCost). Antes Gestión de Ventas lo hacía
 * pero el Panel de Control y Reportes usaban totalProfit / totalCost, así que
 * la misma venta mostraba ganancias distintas según la pantalla.
 */
export const gananciaReal = (venta: { courtesyItems?: unknown[]; realProfit?: number; totalProfit?: number }): number =>
  venta.courtesyItems && venta.courtesyItems.length > 0
    ? (venta.realProfit ?? venta.totalProfit ?? 0)
    : (venta.totalProfit ?? 0);

export const costoReal = (venta: { courtesyItems?: unknown[]; realTotalCost?: number; totalCost?: number }): number =>
  venta.courtesyItems && venta.courtesyItems.length > 0
    ? (venta.realTotalCost ?? venta.totalCost ?? 0)
    : (venta.totalCost ?? 0);
