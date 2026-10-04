// Cuentas de un servicio técnico que deben salir siempre del precio actual.
//
// En el sistema de precio total (serviceCost) el cliente paga el precio
// acordado, tenga los repuestos que tenga. Los campos guardados totalAmount y
// remainingBalance no se actualizaban al editar el precio, así que varias
// acciones calculaban con un total viejo: el aviso tras un pago mostraba un
// saldo falso, y borrar un pago dejaba "terminado" un servicio que quedaba
// debiendo. Estas funciones son la única cuenta del saldo.

interface ServicioConPagos {
  serviceCost?: number;
  laborCost?: number;
  items?: { totalCost?: number }[];
  payments?: { amount: number }[];
}

export const totalDelServicio = (servicio: ServicioConPagos): number => {
  if (servicio.serviceCost !== undefined) return servicio.serviceCost;
  const repuestos = (servicio.items || []).reduce((sum, item) => sum + (item.totalCost || 0), 0);
  return repuestos + (servicio.laborCost || 0);
};

export const totalPagadoServicio = (servicio: ServicioConPagos): number =>
  (servicio.payments || []).reduce((sum, pago) => sum + (pago.amount || 0), 0);

export const saldoDelServicio = (servicio: ServicioConPagos): number =>
  totalDelServicio(servicio) - totalPagadoServicio(servicio);

/** Parte de un pago que se cubrió con saldo a favor del cliente. */
export const saldoAFavorDelPago = (pago: { paymentMethods?: { method: string; amount: number }[] }): number =>
  (pago.paymentMethods || [])
    .filter(metodo => metodo.method === 'credit' && metodo.amount > 0)
    .reduce((sum, metodo) => sum + metodo.amount, 0);
