// Utilidades para cálculo de comisiones de métodos de pago
export const calculatePaymentCommission = (method: string, amount: number): number => {
  switch (method) {
    case 'tarjeta':
      return amount * 0.04; // 4% que asume el vendedor
    case 'crédito':
    case 'efectivo':
    case 'transferencia':
    default:
      return 0; // Sin comisión
  }
};

// Calcula el recargo que paga el cliente por el método de pago
export const calculateCustomerSurcharge = (method: string, amount: number): number => {
  switch (method) {
    case 'tarjeta':
      return amount * 0.03; // 3% que paga el cliente
    default:
      return 0;
  }
};

export const getPaymentMethodLabel = (method: string): string => {
  switch (method) {
    case 'efectivo': return 'Efectivo';
    case 'transferencia': return 'Transferencia';
    case 'tarjeta': return 'Tarjeta';
    case 'crédito': return 'Crédito';
    case 'credit': return 'Saldo a favor';
    default: return method;
  }
};