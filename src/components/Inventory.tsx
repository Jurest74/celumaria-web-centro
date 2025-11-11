import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, Package, TrendingUp, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { selectProducts, selectActiveCategories } from '../store/selectors';
import { productsService } from '../services/firebase/firestore';
import { deleteProduct } from '../store/slices/productsSlice';
import { useFirebase } from '../contexts/FirebaseContext';
import { Product } from '../types';
import { formatCurrency, formatNumber, formatNumberInput, parseNumberInput } from '../utils/currency';
import { useNotification } from '../contexts/NotificationContext';
import { usePaginatedProducts } from '../hooks/usePaginatedProducts';

export function Inventory() {
  // Redux selectors para estadísticas generales
  const allProducts = useAppSelector(selectProducts);
  const categories = useAppSelector(selectActiveCategories);
  const { showSuccess, showError, showConfirm } = useNotification();
  const dispatch = useAppDispatch();
  const firebase = useFirebase();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allProductsLocal, setAllProductsLocal] = useState<Product[]>([]);
  
  // Estados para campos de entrada formateados
  const [purchasePriceDisplay, setPurchasePriceDisplay] = useState('');
  const [salePriceDisplay, setSalePriceDisplay] = useState('');
  const [stockDisplay, setStockDisplay] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  
  const formRef = useRef<HTMLFormElement>(null);
  
  // Función para cargar todos los productos para estadísticas
  const loadAllProducts = useCallback(async () => {
    try {
      const products = await productsService.getAll();
      setAllProductsLocal(products);
    } catch (error) {
      console.error('Error loading all products for stats:', error);
    }
  }, []);

  // Cargar productos al inicio
  useEffect(() => {
    loadAllProducts();
  }, [loadAllProducts]);

  // Hook de paginación para productos
  const {
    products: paginatedProducts,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    refetch
  } = usePaginatedProducts({
    searchTerm,
    categoryFilter: selectedCategory,
    stockFilter,
    sortBy: 'name',
    sortOrder: 'asc',
    itemsPerPage: 15
  });

  // Efecto para inicializar valores cuando se edita un producto
  useEffect(() => {
    if (editingProduct) {
      setPurchasePriceDisplay(formatNumberInput(editingProduct.purchasePrice));
      setSalePriceDisplay(formatNumberInput(editingProduct.salePrice));
      setStockDisplay(formatNumberInput(editingProduct.stock));
      setSelectedCategoryId(editingProduct.categoryId);
    } else {
      setPurchasePriceDisplay('');
      setSalePriceDisplay('');
      setStockDisplay('');
      setSelectedCategoryId('');
    }
  }, [editingProduct]);

  // Los productos ya están filtrados y paginados por el hook
  const filteredProducts = paginatedProducts;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);

      const purchasePrice = parseNumberInput(purchasePriceDisplay);
      const salePrice = parseNumberInput(salePriceDisplay);
      const stock = parseNumberInput(stockDisplay);
      const categoryId = formData.get('categoryId') as string;

      if (salePrice <= purchasePrice) {
        showError('Error de validación', 'El precio de venta debe ser mayor al precio de compra');
        setIsLoading(false);
        return;
      }

      // Obtener nombre de categoría
      const selectedCategoryObj = categories.find(c => c.id === categoryId);
      const categoryName = selectedCategoryObj?.name || 'Sin categoría';

      const productData = {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        purchasePrice,
        salePrice,
        stock,
        categoryId,
        category: categoryName,
        referencia: formData.get('referencia')?.toString() || '',
        barcode: formData.get('barcode')?.toString() || '',
        ...(isCellphoneCategory(categoryId) && { imei: formData.get('imei')?.toString() || '' }),
      };

      console.log('Datos del producto:', productData);

      // Validación de duplicados de barcode
      const barcode = productData.barcode.trim();
      if (barcode) {
        const db = (await import('firebase/firestore')).getFirestore();
        const { query, collection, where, getDocs, limit } = await import('firebase/firestore');
        const productsRef = collection(db, 'products');
        let q;
        if (editingProduct) {
          q = query(productsRef, where('barcode', '==', barcode), where('__name__', '!=', editingProduct.id), limit(1));
        } else {
          q = query(productsRef, where('barcode', '==', barcode), limit(1));
        }
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          showError('Error de validación', 'Ya existe otro producto con el mismo código de barras.');
          setIsLoading(false);
          return;
        }
      }

      // Validación de duplicados de IMEI (solo para productos celulares)
      if (isCellphoneCategory(categoryId)) {
        const imei = productData.imei?.trim();
        if (imei) {
          const db = (await import('firebase/firestore')).getFirestore();
          const { query, collection, where, getDocs, limit } = await import('firebase/firestore');
          const productsRef = collection(db, 'products');
          let q;
          if (editingProduct) {
            q = query(productsRef, where('imei', '==', imei), where('__name__', '!=', editingProduct.id), limit(1));
          } else {
            q = query(productsRef, where('imei', '==', imei), limit(1));
          }
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            showError('Error de validación', 'Ya existe otro producto con el mismo IMEI.');
            setIsLoading(false);
            return;
          }
        }
      }

      if (editingProduct) {
        console.log('Actualizando producto:', editingProduct.id);
        await productsService.update(editingProduct.id, productData);

        formRef.current?.reset();
        setPurchasePriceDisplay('');
        setSalePriceDisplay('');
        setStockDisplay('');
        setSelectedCategoryId('');

        setEditingProduct(null);
        setShowAddForm(false);

        showSuccess(
          'Producto actualizado',
          `El producto "${productData.name}" se actualizó correctamente`
        );
        // Actualizar la lista paginada
        refetch();
        // Recargar todos los productos para estadísticas
        await loadAllProducts();
        // Forzar actualización de estadísticas del inventario
        setRefreshKey(prev => prev + 1);
        console.log('Producto actualizado exitosamente');
      } else {
        console.log('Creando nuevo producto');
        const newProductId = await productsService.add(productData);
        console.log('Nuevo producto creado con ID:', newProductId);

        formRef.current?.reset();
        setPurchasePriceDisplay('');
        setSalePriceDisplay('');
        setStockDisplay('');
        setSelectedCategoryId('');

        setShowAddForm(false);

        showSuccess(
          'Producto creado',
          `El producto "${productData.name}" se creó correctamente`
        );
        // Actualizar la lista paginada
        refetch();
        // Recargar todos los productos para estadísticas
        await loadAllProducts();
        // Forzar actualización de estadísticas del inventario
        setRefreshKey(prev => prev + 1);
      }

    } catch (error) {
      console.error('Error saving product:', error);

      let errorMessage = 'Error desconocido al guardar el producto';

      if (error instanceof Error) {
        if (error.message.includes('permission-denied')) {
          errorMessage = 'No tienes permisos para guardar productos. Verifica que estés logueado como administrador.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Error de conexión. Verifica tu conexión a internet.';
        } else if (error.message.includes('quota-exceeded')) {
          errorMessage = 'Se ha excedido la cuota de Firebase. Intenta más tarde.';
        } else {
          errorMessage = error.message;
        }
      }

      showError('Error al guardar producto', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (product: Product) => {
    showConfirm(
      'Confirmar eliminación',
      `¿Estás seguro de que quieres eliminar el producto "${product.name}"? Esta acción no se puede deshacer.`,
      async () => {
        setIsDeletingProduct(true);
        try {
          await productsService.delete(product.id);
          // Forzar recarga completa desde Firebase para actualizar dashboard
          await firebase.forceLoadProducts();
          // Recargar todos los productos para estadísticas
          await loadAllProducts();
          // Forzar actualización de estadísticas del inventario
          setRefreshKey(prev => prev + 1);
          showSuccess(
            'Producto eliminado',
            `El producto "${product.name}" se eliminó correctamente`
          );
          // Actualizar la lista paginada
          refetch();
        } catch (error) {
          console.error('Error deleting product:', error);
          showError(
            'Error al eliminar',
            'No se pudo eliminar el producto. Inténtalo de nuevo.'
          );
        } finally {
          setIsDeletingProduct(false);
        }
      }
    );
  };

  const calculateMargin = (purchasePrice: number, salePrice: number) => {
    if (typeof purchasePrice !== 'number' || typeof salePrice !== 'number' || 
        isNaN(purchasePrice) || isNaN(salePrice) || salePrice <= 0) {
      return '0';
    }
    
    const margin = ((salePrice - purchasePrice) / salePrice * 100);
    
    if (isNaN(margin) || !isFinite(margin)) {
      return '0';
    }
    
    return margin.toFixed(1);
  };

  const getCategoryName = (product: Product) => {
    if (product.categoryId) {
      const category = categories.find(c => c.id === product.categoryId);
      return category?.name || product.category || 'Sin categoría';
    }
    return product.category || 'Sin categoría';
  };

  const getCategoryColor = (product: Product) => {
    if (product.categoryId) {
      const category = categories.find(c => c.id === product.categoryId);
      return category?.color || '#6B7280';
    }
    return '#6B7280';
  };

  const getStockFilterText = (filter: string) => {
    switch (filter) {
      case 'low': return 'Pocas Unidades (≤5)';
      case 'out': return 'Sin Stock (0)';
      case 'all': return 'Todos los niveles';
      default: return 'Todos los niveles';
    }
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product);
    setShowAddForm(true);
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setShowAddForm(false);
    setPurchasePriceDisplay('');
    setSalePriceDisplay('');
    setStockDisplay('');
    setSelectedCategoryId('');
    formRef.current?.reset();
  };

  // Función para determinar si una categoría requiere IMEI
  const isCellphoneCategory = (categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    return category?.name.toLowerCase().includes('celulares');
  };


  // Estadísticas/resúmenes de inventario usando productos locales actualizados
  const totalProducts = useMemo(() => allProductsLocal.length, [allProductsLocal, refreshKey]);
  const outOfStock = useMemo(() => allProductsLocal.filter((p: Product) => p.stock === 0).length, [allProductsLocal, refreshKey]);
  const lowStock = useMemo(() => allProductsLocal.filter((p: Product) => p.stock > 0 && p.stock <= 5).length, [allProductsLocal, refreshKey]);
  const totalInventoryValue = useMemo(() => allProductsLocal.reduce((acc: number, p: Product) => acc + (typeof p.purchasePrice === 'number' && typeof p.stock === 'number' ? p.purchasePrice * p.stock : 0), 0), [allProductsLocal, refreshKey]);
  const totalPotentialSales = useMemo(() => allProductsLocal.reduce((acc: number, p: Product) => acc + (typeof p.salePrice === 'number' && typeof p.stock === 'number' ? p.salePrice * p.stock : 0), 0), [allProductsLocal, refreshKey]);


  return (
    <div className="space-y-4 sm:space-y-6 max-w-full overflow-x-hidden relative">
      {/* Loading overlay durante eliminación */}
      {isDeletingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            <p className="text-lg font-medium text-gray-900">Eliminando producto...</p>
            <p className="text-sm text-gray-500">Por favor espera mientras se procesa la eliminación</p>
          </div>
        </div>
      )}
      <div className="mb-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Inventario</h1>
            <p className="text-gray-600 mt-1">Administra los productos, precios y niveles de stock de tu tienda</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>Agregar Producto</span>
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas de Inventario */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
              <Package className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Total Productos
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
              {totalProducts}
            </p>
          </div>
        </div>

        <div className={`group relative rounded-lg shadow-lg border p-2 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ease-out ${
          outOfStock > 0 
            ? 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200 hover:shadow-red-500/20 hover:border-red-300' 
            : 'bg-white border-gray-300 hover:shadow-xl hover:border-gray-400'
        }`}>
          <div className="text-center">
            <div className={`w-5 h-5 mx-auto mb-1 rounded flex items-center justify-center group-hover:scale-110 transition-all duration-300 ${
              outOfStock > 0 
                ? 'bg-red-50 group-hover:bg-red-100' 
                : 'bg-slate-100 group-hover:bg-slate-200'
            }`}>
              <AlertTriangle className={`w-3 h-3 transition-colors duration-300 ${
                outOfStock > 0 ? 'text-red-600 group-hover:text-red-700' : 'text-slate-500 group-hover:text-slate-600'
              }`} />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Sin Stock
            </p>
            <p className={`text-base font-bold transition-colors duration-300 ${
              outOfStock > 0 ? 'text-red-600 group-hover:text-red-800' : 'text-slate-900 group-hover:text-slate-700'
            }`}>
              {outOfStock}
            </p>
          </div>
        </div>

        <div className={`group relative rounded-lg shadow-lg border p-2 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ease-out ${
          lowStock > 0 
            ? 'bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-200 hover:shadow-orange-500/20 hover:border-orange-300' 
            : 'bg-white border-gray-300 hover:shadow-xl hover:border-gray-400'
        }`}>
          <div className="text-center">
            <div className={`w-5 h-5 mx-auto mb-1 rounded flex items-center justify-center group-hover:scale-110 transition-all duration-300 ${
              lowStock > 0 
                ? 'bg-orange-50 group-hover:bg-orange-100' 
                : 'bg-slate-100 group-hover:bg-slate-200'
            }`}>
              <AlertTriangle className={`w-3 h-3 transition-colors duration-300 ${
                lowStock > 0 ? 'text-orange-600 group-hover:text-orange-700' : 'text-slate-500 group-hover:text-slate-600'
              }`} />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Bajo Stock
            </p>
            <p className={`text-base font-bold transition-colors duration-300 ${
              lowStock > 0 ? 'text-orange-600 group-hover:text-orange-800' : 'text-slate-900 group-hover:text-slate-700'
            }`}>
              {lowStock}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
              <TrendingUp className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Valor Inventario
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">
              {formatCurrency(totalInventoryValue)}
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl p-3 sm:p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 max-w-full">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, descripción, referencia, código de barras o IMEI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:gap-4 w-full md:w-auto">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full md:w-auto"
            >
              <option value="all">Todas las Categorías</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div className="relative w-full md:w-auto">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as 'all' | 'low' | 'out')}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none w-full md:w-auto"
              >
                <option value="all">Todos los niveles</option>
                <option value="low">Pocas Unidades (≤5)</option>
                <option value="out">Sin Stock (0)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Filter Summary */}
        {(searchTerm || selectedCategory !== 'all' || stockFilter !== 'all') && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-blue-800 font-medium">Filtros activos:</span>
              
              {searchTerm && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Búsqueda: "{searchTerm}"
                </span>
              )}
              
              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Categoría: {categories.find(c => c.id === selectedCategory)?.name}
                </span>
              )}
              
              {stockFilter !== 'all' && (
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  stockFilter === 'low' ? 'bg-orange-100 text-orange-800' : 
                  stockFilter === 'out' ? 'bg-red-100 text-red-800' : 
                  'bg-gray-100 text-gray-800'
                }`}>
                  {getStockFilterText(stockFilter)}
                </span>
              )}
              
              <span className="text-blue-600 font-medium">
                {loading ? 'Cargando...' : `(${filteredProducts.length} productos encontrados)`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Product Form */}
      {(showAddForm || editingProduct) && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingProduct ? 'Editar Producto' : 'Agregar Nuevo Producto'}
            </h3>
            <button
              onClick={cancelEdit}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                name="name"
                defaultValue={editingProduct?.name || ''}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referencia (Opcional)</label>
              <input
                type="text"
                name="referencia"
                defaultValue={editingProduct?.referencia || ''}
                disabled={isLoading}
                placeholder="Ej: REF001, SKU123, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <select
                name="categoryId"
                value={selectedCategoryId || editingProduct?.categoryId || categories[0]?.id || ''}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Compra (COP)</label>
              <input
                type="text"
                value={purchasePriceDisplay}
                onChange={(e) => setPurchasePriceDisplay(formatNumberInput(e.target.value))}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Venta (COP)</label>
              <input
                type="text"
                value={salePriceDisplay}
                onChange={(e) => setSalePriceDisplay(formatNumberInput(e.target.value))}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad en Stock</label>
              <input
                type="text"
                value={stockDisplay}
                onChange={(e) => setStockDisplay(formatNumberInput(e.target.value))}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de Barras (Opcional)</label>
              <input
                type="text"
                name="barcode"
                defaultValue={editingProduct?.barcode || ''}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            {/* Campo IMEI - Solo para productos de categoría Celulares */}
            {isCellphoneCategory(selectedCategoryId || editingProduct?.categoryId || categories[0]?.id || '') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IMEI</label>
                <input
                  type="text"
                  name="imei"
                  defaultValue={editingProduct?.imei || ''}
                  disabled={isLoading}
                  placeholder="Ej: 123456789012345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1">Número IMEI del dispositivo celular</p>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={editingProduct?.description || ''}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            <div className="md:col-span-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                <span>
                  {isLoading ? 'Guardando...' : editingProduct ? 'Actualizar Producto' : 'Agregar Producto'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cards para productos en móviles */}
      <div className="grid gap-3 sm:hidden">
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Cargando productos...</p>
          </div>
        )}
        {!loading && filteredProducts.map((product) => {
          const margin = calculateMargin(product.purchasePrice, product.salePrice);
      // const profit = (typeof product.salePrice === 'number' && typeof product.purchasePrice === 'number')
      //   ? product.salePrice - product.purchasePrice
      //   : 0;
          return (
            <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-gray-900 text-base">{product.name}</div>
                <span className="px-2 py-1 rounded-full text-xs text-white font-medium" style={{ backgroundColor: getCategoryColor(product) }}>{getCategoryName(product)}</span>
              </div>
              {product.referencia && (
                <div className="text-xs text-blue-600 font-medium">Ref: {product.referencia}</div>
              )}
              <div className="text-xs text-gray-500 mb-1">{product.description}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-gray-100 px-2 py-1 rounded">Compra: {formatCurrency(product.purchasePrice)}</span>
                <span className="bg-gray-100 px-2 py-1 rounded">Venta: {formatCurrency(product.salePrice)}</span>
                <span className={`px-2 py-1 rounded ${parseFloat(margin) >= 30 ? 'bg-green-100 text-green-800' : parseFloat(margin) >= 15 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>Margen: {margin}%</span>
                <span className={`px-2 py-1 rounded ${product.stock === 0 ? 'bg-red-100 text-red-800' : product.stock <= 5 ? 'bg-orange-100 text-orange-800' : product.stock <= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{product.stock === 0 ? 'Sin stock' : `${formatNumber(product.stock)} unidades`}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => startEdit(product)} className="flex-1 text-blue-600 hover:text-blue-900 p-2 rounded hover:bg-blue-50 transition-colors text-xs font-medium">Editar</button>
                <button onClick={() => handleDelete(product)} className="flex-1 text-red-600 hover:text-red-900 p-2 rounded hover:bg-red-50 transition-colors text-xs font-medium">Eliminar</button>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Tabla solo visible en pantallas sm o mayores */}
      <div className="bg-white rounded-xl p-3 sm:p-6 shadow-sm border border-gray-100 overflow-x-auto hidden sm:block">
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Cargando productos...</p>
          </div>
        )}
        {!loading && (
          <div className="w-full">
            <table className="w-full divide-y divide-gray-200 text-xs sm:text-sm table-auto">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight">Producto</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight hidden lg:table-cell">Ref</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight hidden lg:table-cell">IMEI</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight hidden md:table-cell">Categoría</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight">P. Compra</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight">P. Venta</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight hidden xl:table-cell">Margen</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight">Stock</th>
                  <th className="px-1 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-tight">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product) => {
                const margin = calculateMargin(product.purchasePrice, product.salePrice);
                const profit = (typeof product.salePrice === 'number' && typeof product.purchasePrice === 'number') 
                  ? product.salePrice - product.purchasePrice 
                  : 0;
                return (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-1 sm:px-3 py-2">
                      <div>
                        <div className="flex items-center">
                          <div className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-32">{product.name}</div>
                          {product.stock <= 5 && product.stock > 0 && (
                            <AlertTriangle className="ml-1 h-3 w-3 text-orange-500" aria-label="Pocas unidades" />
                          )}
                          {product.stock === 0 && (
                            <AlertTriangle className="ml-1 h-3 w-3 text-red-500" aria-label="Sin stock" />
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-32 hidden sm:block">{product.description}</div>
                      </div>
                    </td>
                    <td className="px-1 sm:px-3 py-2 text-xs text-gray-500 hidden lg:table-cell">
                      {product.referencia || '-'}
                    </td>
                    <td className="px-1 sm:px-3 py-2 text-xs text-gray-500 hidden lg:table-cell">
                      {product.imei || '-'}
                    </td>
                    <td className="px-1 sm:px-3 py-2 hidden md:table-cell">
                      <span 
                        className="px-1 py-1 rounded text-xs text-white font-medium truncate max-w-16 inline-block"
                        style={{ backgroundColor: getCategoryColor(product) }}
                      >
                        {getCategoryName(product)}
                      </span>
                    </td>
                    <td className="px-1 sm:px-3 py-2 text-xs text-gray-900">
                      {formatCurrency(typeof product.purchasePrice === 'number' ? product.purchasePrice : 0)}
                    </td>
                    <td className="px-1 sm:px-3 py-2 text-xs text-gray-900">
                      {formatCurrency(typeof product.salePrice === 'number' ? product.salePrice : 0)}
                    </td>
                    <td className="px-1 sm:px-3 py-2 hidden xl:table-cell">
                      <span className={`inline-flex px-1 py-1 text-xs font-semibold rounded ${
                        parseFloat(margin) >= 30 
                          ? 'bg-green-100 text-green-800' 
                          : parseFloat(margin) >= 15 
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {margin}%
                      </span>
                    </td>
                    <td className="px-1 sm:px-3 py-2">
                      <span className={`inline-flex px-1 py-1 text-xs font-semibold rounded ${
                        product.stock === 0
                          ? 'bg-red-100 text-red-800' 
                          : product.stock <= 5 
                          ? 'bg-orange-100 text-orange-800'
                          : product.stock <= 10 
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {product.stock === 0 ? '0' : formatNumber(product.stock)}
                      </span>
                    </td>
                    <td className="px-1 sm:px-3 py-2">
                      <div className="flex space-x-1">
                        <button
                          onClick={() => startEdit(product)}
                          className="text-blue-600 hover:text-blue-900 p-0.5 rounded hover:bg-blue-50 transition-colors"
                          title="Editar"
                        >
                          <Edit className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          className="text-red-600 hover:text-red-900 p-0.5 rounded hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Controles de paginación */}
      {(filteredProducts.length > 0 || currentPage > 1) && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Información de página */}
            <div className="text-sm text-gray-600">
              <span>Página <span className="font-medium">{currentPage}</span></span>
              {loading && <span className="ml-2 text-blue-600">Cargando...</span>}
              {error && <span className="ml-2 text-red-600">Error: {error}</span>}
            </div>
            
            {/* Botones de navegación */}
            <div className="flex items-center space-x-2">
              <button
                onClick={prevPage}
                disabled={!hasPrevPage || loading}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </button>
              
              <button
                onClick={nextPage}
                disabled={!hasNextPage || loading}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredProducts.length === 0 && !loading && (
        <div className="bg-white rounded-xl p-6 sm:p-12 text-center shadow-sm border border-gray-100">
          <div className="text-gray-400 mb-4">
            <Package className="h-10 w-10 sm:h-12 sm:w-12 mx-auto" />
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No se encontraron productos</h3>
          <p className="text-gray-500 text-xs sm:text-base">
            {searchTerm || selectedCategory !== 'all' || stockFilter !== 'all'
              ? 'Intenta ajustar tus criterios de búsqueda o filtro.'
              : 'Comienza agregando tu primer producto al inventario.'
            }
      {/* Sin paginación, solo filtrado en memoria */}
          </p>
          {stockFilter === 'low' && (
            <p className="text-orange-600 mt-2 text-xs sm:text-sm">
              ¡Excelente! No tienes productos con pocas unidades.
            </p>
          )}
          {stockFilter === 'out' && (
            <p className="text-green-600 mt-2 text-xs sm:text-sm">
              ¡Perfecto! No tienes productos sin stock.
            </p>
          )}
        </div>
      )}
    </div>
  );
}