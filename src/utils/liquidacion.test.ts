import { describe, it, expect } from 'vitest';
import { montosLiquidacion } from './liquidacion';

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
