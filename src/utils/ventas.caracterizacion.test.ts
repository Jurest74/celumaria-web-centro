// Caracterizacion del nucleo de plata: fija el comportamiento ACTUAL de los
// calculos de venta para que cualquier cambio futuro salte aqui.
//
// Varios casos documentan divergencias reales entre dos implementaciones que
// conviven. No se corrigen aqui a proposito: cambiar el numero cambia cifras
// contables y esa decision no es del codigo. Cada uno esta marcado con
// DIVERGENCIA y dice cual es el efecto observable.

import { describe, it, expect } from 'vitest';
import {
  calculateSaleTotal as totalConComisiones,
  calculateCreditUsed,
  getTotalPaidAmount,
} from './salesCalculations';
import { salesCalculations } from './calculations';
import { calculatePaymentCommission, calculateCustomerSurcharge } from './paymentCommission';
import { parseNumberInput, formatNumberInput } from './currency';

const item = (salePrice: number, purchasePrice: number, quantity: number) => ({
  productId: 'p1',
  productName: 'Equipo',
  quantity,
  salePrice,
  purchasePrice,
  totalRevenue: salePrice * quantity,
  totalCost: purchasePrice * quantity,
  profit: (salePrice - purchasePrice) * quantity,
}) as any;

describe('comisiones y recargos de metodo de pago', () => {
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

describe('calculateSaleTotal (salesCalculations: el que usa la venta al crearse)', () => {
  it('descuento se topa al subtotal: nunca deja un total negativo', () => {
    const r = totalConComisiones([item(100000, 60000, 1)], 500000, 'efectivo', [], false);
    expect(r.appliedDiscount).toBe(100000);
    expect(r.total).toBe(0);
  });

  it('en efectivo, la ganancia es total - costo', () => {
    const r = totalConComisiones([item(100000, 60000, 1)], 0, 'efectivo', [], false);
    expect(r.totalProfit).toBe(40000);
    expect(r.finalTotal).toBe(100000);
  });

  it('en tarjeta, la comision del 4% sale de la ganancia y el cliente paga 3% mas', () => {
    const r = totalConComisiones([item(100000, 60000, 1)], 0, 'tarjeta', [], false);
    expect(r.totalCommissions).toBe(4000);
    expect(r.customerSurcharge).toBe(3000);
    expect(r.totalProfit).toBe(36000);   // 40000 - 4000
    expect(r.finalTotal).toBe(103000);   // 100000 + 3000
  });

  it('DIVERGENCIA: el recargo que paga el cliente no entra en la ganancia', () => {
    // El negocio recibe 103.000 y paga 4.000 de comision, pero la ganancia
    // registrada ignora los 3.000 cobrados al cliente. Efecto observable:
    // toda venta con tarjeta reporta 3% menos de ganancia de la que deja.
    const r = totalConComisiones([item(100000, 60000, 1)], 0, 'tarjeta', [], false);
    const entraCaja = r.finalTotal;
    const gananciaReal = entraCaja - r.totalCost - r.totalCommissions;
    expect(gananciaReal).toBe(39000);
    expect(r.totalProfit).toBe(36000);
    expect(gananciaReal - r.totalProfit).toBe(r.customerSurcharge);
  });
});

describe('DIVERGENCIA: dos calculateSaleTotal distintos conviven', () => {
  // La venta se crea con el de salesCalculations (resta comisiones) y se
  // recalcula, tras una devolucion, con el de calculations (no las resta).
  const items = [item(100000, 60000, 2)];

  it('en efectivo ambos coinciden', () => {
    const a = totalConComisiones(items, 0, 'efectivo', [], false);
    const b = salesCalculations.calculateSaleTotal(items, 0);
    expect(b.totalProfit).toBe(a.totalProfit);
  });

  it('en tarjeta discrepan exactamente en la comision', () => {
    // Efecto observable: devolver un producto de una venta con tarjeta sube
    // la ganancia registrada, porque el recalculo olvida la comision.
    const a = totalConComisiones(items, 0, 'tarjeta', [], false);
    const b = salesCalculations.calculateSaleTotal(items, 0);
    expect(a.totalProfit).toBe(72000);   // 80000 - 8000 de comision
    expect(b.totalProfit).toBe(80000);   // sin comision
    expect(b.totalProfit - a.totalProfit).toBe(a.totalCommissions);
  });
});

describe('saldo a favor del cliente', () => {
  it('solo cubre lo que falta despues de los otros medios de pago', () => {
    const r = calculateCreditUsed(50000, 100000, [{ method: 'efectivo', amount: 70000 }]);
    expect(r).toBe(30000);
  });

  it('nunca usa mas saldo del disponible', () => {
    expect(calculateCreditUsed(20000, 100000, [])).toBe(20000);
  });

  it('no usa saldo si ya esta todo pago', () => {
    expect(calculateCreditUsed(50000, 100000, [{ method: 'efectivo', amount: 100000 }])).toBe(0);
  });

  it('DIVERGENCIA: si el saldo ya viene en la lista, getTotalPaidAmount lo cuenta dos veces', () => {
    // Efecto observable: la pantalla puede dar por pagada una venta que no lo esta.
    const metodos = [
      { method: 'efectivo', amount: 60000 },
      { method: 'credit', amount: 40000 },
    ];
    const pagado = getTotalPaidAmount(metodos, 40000, true, 100000);
    expect(pagado).toBe(140000);            // deberia ser 100000
    const sinDoble = metodos.reduce((s, p) => s + p.amount, 0);
    expect(sinDoble).toBe(100000);
  });
});

describe('parseo de montos escritos por el cajero', () => {
  it('ida y vuelta de un entero con separador de miles', () => {
    expect(formatNumberInput('1500000')).toBe('1.500.000');
    expect(parseNumberInput('1.500.000')).toBe(1500000);
  });

  it('el signo menos se descarta: un negativo se vuelve positivo', () => {
    expect(parseNumberInput('-5000')).toBe(5000);
  });

  it('DIVERGENCIA: los decimales se pegan como enteros, multiplicando por 100', () => {
    // "1.500,50" en formato colombiano son mil quinientos con cincuenta.
    expect(parseNumberInput('1.500,50')).toBe(150050);
  });

  it('texto sin digitos es cero', () => {
    expect(parseNumberInput('abc')).toBe(0);
    expect(parseNumberInput('')).toBe(0);
  });
});
