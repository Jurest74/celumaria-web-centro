// Comportamiento del nucleo de calculos de venta que no depende de las reglas
// de cobro con tarjeta (esas viven en ventas.reglas.test.ts).

import { describe, it, expect } from 'vitest';
import { calculateSaleTotal, calculateCreditUsed } from './salesCalculations';
import { salesCalculations } from './calculations';
import { calculatePaymentCommission, calculateCustomerSurcharge } from './paymentCommission';
import { parseNumberInput, formatNumberInput } from './currency';

const item = (salePrice: number, purchasePrice: number, quantity: number) => ({
  productId: 'p1', productName: 'Equipo', quantity, salePrice, purchasePrice,
  totalRevenue: salePrice * quantity,
  totalCost: purchasePrice * quantity,
  profit: (salePrice - purchasePrice) * quantity,
}) as any;

describe('tasas de comision y recargo', () => {
  it('tarjeta: 4% lo asume el vendedor, 3% lo paga el cliente', () => {
    expect(calculatePaymentCommission('tarjeta', 100000)).toBe(4000);
    expect(calculateCustomerSurcharge('tarjeta', 100000)).toBe(3000);
  });

  it('efectivo, transferencia y credito no tienen comision ni recargo', () => {
    for (const m of ['efectivo', 'transferencia', 'crédito']) {
      expect(calculatePaymentCommission(m, 100000)).toBe(0);
      expect(calculateCustomerSurcharge(m, 100000)).toBe(0);
    }
  });
});

describe('descuentos', () => {
  it('el descuento se topa al subtotal: nunca deja un total negativo', () => {
    const r = calculateSaleTotal([item(100000, 60000, 1)], 500000, 'efectivo', [], false);
    expect(r.appliedDiscount).toBe(100000);
    expect(r.total).toBe(0);
  });

  it('un descuento parcial baja el total y la ganancia', () => {
    const r = calculateSaleTotal([item(100000, 60000, 1)], 20000, 'efectivo', [], false);
    expect(r.total).toBe(80000);
    expect(r.totalProfit).toBe(20000);
  });
});

describe('saldo a favor disponible', () => {
  it('solo cubre lo que falta despues de los otros medios de pago', () => {
    expect(calculateCreditUsed(50000, 100000, [{ method: 'efectivo', amount: 70000 }])).toBe(30000);
  });

  it('nunca usa mas saldo del disponible', () => {
    expect(calculateCreditUsed(20000, 100000, [])).toBe(20000);
  });

  it('no usa saldo si ya esta todo pago', () => {
    expect(calculateCreditUsed(50000, 100000, [{ method: 'efectivo', amount: 100000 }])).toBe(0);
  });
});

describe('PENDIENTE: dos calculateSaleTotal distintos siguen conviviendo', () => {
  // El de calculations.ts ignora comisiones y recargo. Ya no se usa para la
  // ganancia de una devolucion (ese camino pasa por recalcularTrasDevolucion),
  // pero salesThunks lo sigue llamando para subtotal y total. Este caso deja
  // constancia de la diferencia para que no reaparezca por otra via.
  it('en efectivo ambos coinciden', () => {
    const items = [item(100000, 60000, 2)];
    const a = calculateSaleTotal(items, 0, 'efectivo', [], false);
    const b = salesCalculations.calculateSaleTotal(items, 0);
    expect(b.totalProfit).toBe(a.totalProfit);
  });

  it('en tarjeta discrepan: uno cuenta recargo y comision, el otro ninguno', () => {
    const items = [item(100000, 60000, 2)];
    const a = calculateSaleTotal(items, 0, 'tarjeta', [], false);
    const b = salesCalculations.calculateSaleTotal(items, 0);
    expect(a.totalProfit).toBe(78000);  // 206000 - 120000 - 8000
    expect(b.totalProfit).toBe(80000);  // 200000 - 120000
  });
});

describe('formato y parseo de montos', () => {
  it('ida y vuelta de un entero con separador de miles', () => {
    expect(formatNumberInput('1500000')).toBe('1.500.000');
    expect(parseNumberInput('1.500.000')).toBe(1500000);
  });

  it('texto sin digitos es cero', () => {
    expect(parseNumberInput('abc')).toBe(0);
    expect(parseNumberInput('')).toBe(0);
  });
});
