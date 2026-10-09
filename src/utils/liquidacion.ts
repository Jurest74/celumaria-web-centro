// Montos de un servicio técnico para liquidarle al técnico.
//
// En el sistema de costo total (serviceCost) la mano de obra es lo que queda
// del precio después de los repuestos, repartida 50/50 entre técnico y
// negocio. Se calcula siempre con el precio y los repuestos actuales en vez de
// confiar en laborCost / technicianShare guardados: esos campos no se
// recalculaban al editar el precio o eliminar un repuesto, así que en servicios
// ya guardados pueden estar desactualizados.
//
// Los servicios anteriores al costo total no tienen serviceCost y guardan la
// mano de obra directamente.

export interface ServicioLiquidable {
  serviceCost?: number;
  laborCost?: number;
  technicianShare?: number;
  items?: { totalCost?: number }[];
}

export const PARTICIPACION_TECNICO = 0.5;

export const montosLiquidacion = (servicio: ServicioLiquidable): {
  serviceCost: number;
  partsCost: number;
  laborCost: number;
  technicianShare: number;
} => {
  const partsCost = (servicio.items || []).reduce((sum, item) => sum + (item.totalCost || 0), 0);

  if (servicio.serviceCost !== undefined) {
    const laborCost = Math.max(0, servicio.serviceCost - partsCost);
    return {
      serviceCost: servicio.serviceCost,
      partsCost,
      laborCost,
      technicianShare: laborCost * PARTICIPACION_TECNICO
    };
  }

  const laborCost = servicio.laborCost || 0;
  return {
    serviceCost: 0,
    partsCost,
    laborCost,
    technicianShare: servicio.technicianShare ?? laborCost * PARTICIPACION_TECNICO
  };
};

// Métodos con que el cliente pagó un servicio, para filtrar la liquidación.
//
// Un pago puede combinar varios métodos en paymentMethods; paymentMethod solo
// guarda el principal y cae en 'efectivo' cuando todo se pagó con saldo a
// favor, así que se usa únicamente en pagos viejos sin paymentMethods. Los
// montos negativos (devoluciones, sobrepagos pasados a saldo a favor) no son
// dinero recibido y no cuentan. 'credit' y 'crédito' son el mismo saldo a favor.

export type MetodoPagoLiquidacion = 'efectivo' | 'transferencia' | 'tarjeta' | 'saldo';

export interface PagoConMetodo {
  amount: number;
  paymentMethod?: string;
  paymentMethods?: { method: string; amount: number }[];
}

const normalizarMetodo = (metodo: string): MetodoPagoLiquidacion | null => {
  if (metodo === 'efectivo' || metodo === 'transferencia' || metodo === 'tarjeta') return metodo;
  if (metodo === 'credit' || metodo === 'crédito') return 'saldo';
  return null;
};

const partesDePago = (pago: PagoConMetodo): { method: string; amount: number }[] =>
  Array.isArray(pago.paymentMethods) && pago.paymentMethods.length > 0
    ? pago.paymentMethods
    : [{ method: pago.paymentMethod || 'efectivo', amount: pago.amount }];

export const metodosDePago = (payments: PagoConMetodo[] | undefined): Set<MetodoPagoLiquidacion> => {
  const metodos = new Set<MetodoPagoLiquidacion>();
  for (const pago of payments || []) {
    for (const parte of partesDePago(pago)) {
      const metodo = normalizarMetodo(parte.method);
      if (metodo && parte.amount > 0) metodos.add(metodo);
    }
  }
  return metodos;
};

// Lo recibido con un método, neto: aquí sí restan las devoluciones hechas con
// ese mismo método, como en el total pagado del servicio.
export const montoPorMetodo = (payments: PagoConMetodo[] | undefined, metodo: MetodoPagoLiquidacion): number =>
  (payments || []).reduce((total, pago) =>
    total + partesDePago(pago)
      .filter(parte => normalizarMetodo(parte.method) === metodo)
      .reduce((sum, parte) => sum + parte.amount, 0), 0);
