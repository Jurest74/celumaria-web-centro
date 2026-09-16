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
