import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Script para resetear el stock de todos los productos a 0
 * ⚠️ ADVERTENCIA: Esta operación no se puede deshacer fácilmente
 *
 * Para usar este script:
 * 1. Abre la consola del navegador (F12)
 * 2. Importa y ejecuta la función resetAllProductsStock()
 * 3. Confirma la operación cuando se te solicite
 */

export const resetAllProductsStock = async (): Promise<{
  success: boolean;
  totalProducts: number;
  updated: number;
  errors: number;
}> => {
  try {
    console.log('🔄 Iniciando reseteo de stock...');

    // Obtener todos los productos
    const productsRef = collection(db, 'products');
    const snapshot = await getDocs(productsRef);

    const totalProducts = snapshot.docs.length;
    console.log(`📦 Total de productos encontrados: ${totalProducts}`);

    if (totalProducts === 0) {
      console.log('⚠️ No se encontraron productos');
      return { success: true, totalProducts: 0, updated: 0, errors: 0 };
    }

    // Confirmar con el usuario
    const confirmation = confirm(
      `⚠️ ADVERTENCIA ⚠️\n\n` +
      `Estás a punto de resetear el stock de ${totalProducts} productos a 0.\n\n` +
      `Esta acción no se puede deshacer fácilmente.\n\n` +
      `¿Estás seguro de que deseas continuar?`
    );

    if (!confirmation) {
      console.log('❌ Operación cancelada por el usuario');
      return { success: false, totalProducts, updated: 0, errors: 0 };
    }

    let updated = 0;
    let errors = 0;

    // Actualizar cada producto
    for (const docSnapshot of snapshot.docs) {
      try {
        const productRef = doc(db, 'products', docSnapshot.id);
        await updateDoc(productRef, {
          stock: 0,
          updatedAt: new Date().toISOString()
        });
        updated++;

        // Log de progreso cada 10 productos
        if (updated % 10 === 0) {
          console.log(`✅ Progreso: ${updated}/${totalProducts} productos actualizados`);
        }
      } catch (error) {
        console.error(`❌ Error actualizando producto ${docSnapshot.id}:`, error);
        errors++;
      }
    }

    console.log('✅ Reseteo completado!');
    console.log(`📊 Resumen:`);
    console.log(`   - Total de productos: ${totalProducts}`);
    console.log(`   - Actualizados exitosamente: ${updated}`);
    console.log(`   - Errores: ${errors}`);

    return {
      success: true,
      totalProducts,
      updated,
      errors
    };
  } catch (error) {
    console.error('❌ Error al resetear stock:', error);
    return {
      success: false,
      totalProducts: 0,
      updated: 0,
      errors: 0
    };
  }
};

/**
 * Función para resetear el stock de productos específicos por IDs
 */
export const resetSpecificProductsStock = async (productIds: string[]): Promise<{
  success: boolean;
  totalProducts: number;
  updated: number;
  errors: number;
}> => {
  try {
    console.log(`🔄 Iniciando reseteo de ${productIds.length} productos específicos...`);

    const confirmation = confirm(
      `⚠️ ADVERTENCIA ⚠️\n\n` +
      `Estás a punto de resetear el stock de ${productIds.length} productos a 0.\n\n` +
      `¿Estás seguro de que deseas continuar?`
    );

    if (!confirmation) {
      console.log('❌ Operación cancelada por el usuario');
      return { success: false, totalProducts: productIds.length, updated: 0, errors: 0 };
    }

    let updated = 0;
    let errors = 0;

    for (const productId of productIds) {
      try {
        const productRef = doc(db, 'products', productId);
        await updateDoc(productRef, {
          stock: 0,
          updatedAt: new Date().toISOString()
        });
        updated++;
        console.log(`✅ Producto ${productId} actualizado`);
      } catch (error) {
        console.error(`❌ Error actualizando producto ${productId}:`, error);
        errors++;
      }
    }

    console.log('✅ Reseteo completado!');
    console.log(`📊 Resumen:`);
    console.log(`   - Total de productos: ${productIds.length}`);
    console.log(`   - Actualizados exitosamente: ${updated}`);
    console.log(`   - Errores: ${errors}`);

    return {
      success: true,
      totalProducts: productIds.length,
      updated,
      errors
    };
  } catch (error) {
    console.error('❌ Error al resetear stock:', error);
    return {
      success: false,
      totalProducts: productIds.length,
      updated: 0,
      errors: 0
    };
  }
};

// Para usar en la consola del navegador:
// Descomentar y pegar en la consola cuando estés listo

/*
// Importar las funciones (si estás en el contexto de la app)
import { resetAllProductsStock, resetSpecificProductsStock } from './utils/resetStock';

// Resetear TODOS los productos:
resetAllProductsStock().then(result => {
  if (result.success) {
    alert(`✅ Stock reseteado exitosamente!\n\nActualizados: ${result.updated}\nErrores: ${result.errors}`);
  } else {
    alert('❌ Error al resetear stock. Ver consola para detalles.');
  }
});

// O resetear productos específicos:
resetSpecificProductsStock(['productId1', 'productId2', 'productId3']).then(result => {
  if (result.success) {
    alert(`✅ Stock reseteado exitosamente!\n\nActualizados: ${result.updated}\nErrores: ${result.errors}`);
  }
});
*/
