import { describe, it, expect } from 'vitest';
import { montosLiquidacion, metodosDePago, montoPorMetodo } from './liquidacion';

describe('montosLiquidacion', () => {
  it('sin repuestos toda la mano de obra es el precio, mitad para el técnico', () => {
    expect(montosLiquidacion({ serviceCost: 100000 })).toEqual({
      serviceCost: 100000, partsCost: 0, laborCost: 100000, technicianShare: 50000
    });
  });

  it('usa el precio actual aunque laborCost y technicianShare guardados sean viejos', () => {
    // Servicio creado a 100.000 y editado a 150.000 sin recalcular.
    const r = montosLiquidacion({ serviceCost: 150000, laborCost: 100000, technicianShare: 50000, items: [] });
    expect(r.laborCost).toBe(150000);
    expect(r.technicianShare).toBe(75000);
  });

  it('descuenta los repuestos actuales', () => {
    const r = montosLiquidacion({ serviceCost: 150000, items: [{ totalCost: 30000 }, { totalCost: 20000 }] });
    expect(r.partsCost).toBe(50000);
    expect(r.laborCost).toBe(100000);
    expect(r.technicianShare).toBe(50000);
  });

  it('si los repuestos superan el precio la mano de obra es 0', () => {
    expect(montosLiquidacion({ serviceCost: 50000, items: [{ totalCost: 80000 }] }).technicianShare).toBe(0);
  });

  it('servicios anteriores al costo total usan la mano de obra guardada', () => {
    expect(montosLiquidacion({ laborCost: 40000 }).technicianShare).toBe(20000);
    expect(montosLiquidacion({ laborCost: 40000, technicianShare: 25000 }).technicianShare).toBe(25000);
  });
});

describe('metodosDePago', () => {
  it('pago viejo sin paymentMethods usa paymentMethod', () => {
    expect([...metodosDePago([{ amount: 50000, paymentMethod: 'transferencia' }])]).toEqual(['transferencia']);
  });

  it('pago combinado cuenta cada método', () => {
    const r = metodosDePago([{ amount: 80000, paymentMethod: 'efectivo', paymentMethods: [
      { method: 'efectivo', amount: 30000 }, { method: 'transferencia', amount: 50000 }
    ] }]);
    expect(r.has('efectivo')).toBe(true);
    expect(r.has('transferencia')).toBe(true);
  });

  it('pagado todo con saldo a favor no cuenta como efectivo', () => {
    const r = metodosDePago([{ amount: 40000, paymentMethod: 'efectivo', paymentMethods: [{ method: 'credit', amount: 40000 }] }]);
    expect([...r]).toEqual(['saldo']);
  });

  it('montos negativos (devoluciones, sobrepagos) no cuentan', () => {
    const r = metodosDePago([
      { amount: 60000, paymentMethod: 'transferencia', paymentMethods: [{ method: 'transferencia', amount: 60000 }] },
      { amount: -10000, paymentMethod: 'efectivo', paymentMethods: [{ method: 'efectivo', amount: -10000 }] }
    ]);
    expect([...r]).toEqual(['transferencia']);
  });

  it('sin pagos no tiene métodos', () => {
    expect(metodosDePago(undefined).size).toBe(0);
    expect(metodosDePago([]).size).toBe(0);
  });
});

describe('montoPorMetodo', () => {
  const pagos = [
    { amount: 150000, paymentMethod: 'efectivo', paymentMethods: [
      { method: 'efectivo', amount: 50000 }, { method: 'transferencia', amount: 100000 }
    ] },
    { amount: 20000, paymentMethod: 'transferencia' },
    { amount: -10000, paymentMethod: 'efectivo', paymentMethods: [{ method: 'efectivo', amount: -10000 }] },
  ];

  it('suma solo la parte pagada con ese método', () => {
    expect(montoPorMetodo(pagos, 'transferencia')).toBe(120000);
  });

  it('resta las devoluciones hechas con ese método', () => {
    expect(montoPorMetodo(pagos, 'efectivo')).toBe(40000);
  });

  it('sin pagos de ese método da 0', () => {
    expect(montoPorMetodo(pagos, 'tarjeta')).toBe(0);
    expect(montoPorMetodo(undefined, 'efectivo')).toBe(0);
  });
});
