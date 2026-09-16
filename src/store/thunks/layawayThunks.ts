// Este archivo se conserva intencionalmente vacío. Los thunks que existían
// (`processLayawayCreation`, `processAddProductsToLayaway`, `cancelLayaway`)
// sólo despachaban reducers en memoria — el plan separe quedaba reflejado en
// pantalla pero NUNCA se persistía en Firestore, ni se reservaba stock en la
// BD. Eran un foot-gun: si alguien los llamaba, el inventario se "movía" en
// la UI sin tocar la verdad de la base de datos.
//
// Toda la operación real de planes separe vive en `Layaway.tsx`, llamando a
// `layawaysService.add/update/delete/addProductsToLayaway` y
// `productsService.updateStock` (que sí escriben en Firestore con increment()
// y writeBatch).
export {};