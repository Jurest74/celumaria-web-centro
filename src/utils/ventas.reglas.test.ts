// Reglas de negocio acordadas para el cobro con tarjeta:
//  - El cliente paga el precio + 3%. El cajero teclea el monto YA con el
//    recargo sumado, asi que el recargo es lo que entro por encima del
//    precio, no un 3% que el sistema deba volver a sumar.
//  - El negocio recibe lo que se cobro; el datafono retiene su 4% sobre eso.
//  - Devolver un producto recalcula todo en proporcion.

import { describe, it, expect } from 'vitest';
import { calculateSaleTotal, getTotalPaidAmount, recalcularTrasDevolucion, montoMaximoPago, restantePorPagar } from './salesCalculations';
import { parseNumberInput } from './currency';

const item = (salePrice: number, purchasePrice: number, quantity: number) => ({
  productId: 'p1', productName: 'Equipo', quantity, salePrice, purchasePrice,
  totalRevenue: salePrice * quantity,
  totalCost: purchasePrice * quantity,
  profit: (salePrice - purchasePrice) * quantity,
}) as any;

describe('venta con tarjeta: la ganancia cuenta el recargo que pago el cliente', () => {
  it('pago unico: el sistema suma el 3% y la ganancia lo incluye', () => {
    const r = calculateSaleTotal([item(100000, 60000, 1)], 0, 'tarjeta', [], false);
    expect(r.customerSurcharge).toBe(3000);
    expect(r.finalTotal).toBe(103000);
    expect(r.totalCommissions).toBe(4000);
    // entra 103.000, sale 60.000 de costo y 4.000 de comision
    expect(r.totalProfit).toBe(39000);
  });

  it('efectivo no cambia: sin recargo ni comision', () => {
    const r = calculateSaleTotal([item(100000, 60000, 1)], 0, 'efectivo', [], false);
    expect(r.customerSurcharge).toBe(0);
    expect(r.finalTotal).toBe(100000);
    expect(r.totalProfit).toBe(40000);
  });
});

describe('pagos multiples: el recargo es lo cobrado por encima del precio', () => {
  it('el cajero teclea 103.000 de un precio de 100.000', () => {
    const pagos = [{ method: 'tarjeta', amount: 103000, commission: 4120 }];
    const r = calculateSaleTotal([item(100000, 60000, 1)], 0, 'tarjeta', pagos, true);
    // NO se vuelve a aplicar 3% sobre 103.000 (eso daba 3.090 y un total de 103.090)
    expect(r.customerSurcharge).toBe(3000);
    expect(r.finalTotal).toBe(103000);
    expect(r.totalCommissions).toBe(4120);
    expect(r.totalProfit).toBe(103000 - 60000 - 4120);
  });

  it('si se cobro justo el precio, no hubo recargo', () => {
    const pagos = [{ method: 'efectivo', amount: 100000, commission: 0 }];
    const r = calculateSaleTotal([item(100000, 60000, 1)], 0, 'efectivo', pagos, true);
    expect(r.customerSurcharge).toBe(0);
    expect(r.finalTotal).toBe(100000);
  });

  it('un abono parcial no inventa recargo', () => {
    const pagos = [{ method: 'efectivo', amount: 40000, commission: 0 }];
    const r = calculateSaleTotal([item(100000, 60000, 1)], 0, 'efectivo', pagos, true);
    expect(r.customerSurcharge).toBe(0);
    expect(r.finalTotal).toBe(100000);
  });
});

describe('devolucion: se recalcula todo en proporcion', () => {
  const ventaOriginal = {
    total: 200000, totalCost: 120000, customerSurcharge: 6000,
    totalCommissions: 8240, finalTotal: 206000,
  };

  it('devolver la mitad baja recargo, comision y total a la mitad', () => {
    const r = recalcularTrasDevolucion(ventaOriginal, { total: 100000, totalCost: 60000 });
    expect(r.customerSurcharge).toBe(3000);
    expect(r.totalCommissions).toBe(4120);
    expect(r.finalTotal).toBe(103000);
    expect(r.totalProfit).toBe(103000 - 60000 - 4120);
  });

  it('devolver todo deja la venta en cero, no con el recargo viejo', () => {
    const r = recalcularTrasDevolucion(ventaOriginal, { total: 0, totalCost: 0 });
    expect(r.customerSurcharge).toBe(0);
    expect(r.totalCommissions).toBe(0);
    expect(r.finalTotal).toBe(0);
    expect(r.totalProfit).toBe(0);
  });

  it('una venta en efectivo no gana recargo al devolver', () => {
    const efectivo = { total: 200000, totalCost: 120000, customerSurcharge: 0, totalCommissions: 0, finalTotal: 200000 };
    const r = recalcularTrasDevolucion(efectivo, { total: 100000, totalCost: 60000 });
    expect(r.customerSurcharge).toBe(0);
    expect(r.finalTotal).toBe(100000);
    expect(r.totalProfit).toBe(40000);
  });
});

describe('saldo a favor: no se cuenta dos veces aunque venga en la lista', () => {
  it('una entrada credit ya presente no se suma de nuevo', () => {
    const metodos = [
      { method: 'efectivo', amount: 60000 },
      { method: 'credit', amount: 40000 },
    ];
    expect(getTotalPaidAmount(metodos, 40000, true, 100000)).toBe(100000);
  });

  it('sin entrada credit, el saldo se aplica igual que antes', () => {
    const metodos = [{ method: 'efectivo', amount: 60000 }];
    expect(getTotalPaidAmount(metodos, 40000, true, 100000)).toBe(100000);
  });
});

describe('montos tecleados: solo pesos enteros', () => {
  it('acepta enteros con separador de miles', () => {
    expect(parseNumberInput('1.500.000')).toBe(1500000);
  });

  it('un negativo no se convierte en positivo: es invalido', () => {
    expect(parseNumberInput('-5000')).toBe(0);
  });

  it('un monto con centavos es invalido, no se multiplica por cien', () => {
    expect(parseNumberInput('1.500,50')).toBe(0);
  });

  it('texto sin digitos sigue siendo cero', () => {
    expect(parseNumberInput('abc')).toBe(0);
  });
});

describe('pagos multiples: limites del campo de monto con recargo', () => {
  const items = [item(100000, 60000, 1)];
  it('con tarjeta se puede teclear el precio restante mas el 3%', () => {
    expect(montoMaximoPago('tarjeta', 100000)).toBe(103000);
    expect(montoMaximoPago('efectivo', 100000)).toBe(100000);
  });

  it('una tarjeta con recargo cubre el precio y el recargo queda registrado', () => {
    const pagos = [{ method: 'tarjeta', amount: 103000, commission: 4120 }];
    expect(restantePorPagar(100000, pagos)).toBe(0);
    const r = calculateSaleTotal(items, 0, 'efectivo', pagos, true);
    expect(r.customerSurcharge).toBe(3000);
    expect(r.finalTotal).toBe(103000);
  });

  it('efectivo y tarjeta: el recargo aplica solo a la parte con tarjeta', () => {
    const pagos = [{ method: 'efectivo', amount: 50000 }];
    const restante = restantePorPagar(100000, pagos);
    expect(restante).toBe(50000);
    const tarjeta = montoMaximoPago('tarjeta', restante);
    expect(tarjeta).toBe(51500);
    const todos = [...pagos, { method: 'tarjeta', amount: tarjeta, commission: tarjeta * 0.04 }];
    expect(restantePorPagar(100000, todos)).toBe(0);
    expect(calculateSaleTotal(items, 0, 'efectivo', todos, true).customerSurcharge).toBe(1500);
  });

  it('tarjeta primero y efectivo despues: el efectivo cubre solo el precio restante', () => {
    const pagos = [{ method: 'tarjeta', amount: 51500 }];
    expect(restantePorPagar(100000, pagos)).toBe(50000);
    expect(montoMaximoPago('efectivo', 50000)).toBe(50000);
  });

  it('una tarjeta sin recargo deja saldo pendiente', () => {
    expect(restantePorPagar(100000, [{ method: 'tarjeta', amount: 100000 }])).toBeGreaterThan(2900);
  });

  it('montos que no dan exacto redondean hacia arriba y no dejan centavos pendientes', () => {
    const restante = 33333;
    const tarjeta = montoMaximoPago('tarjeta', restante);
    expect(restantePorPagar(restante, [{ method: 'tarjeta', amount: tarjeta }])).toBe(0);
  });
});
