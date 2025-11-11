import React, { useState, useRef, useEffect } from 'react';
import { Plus, ShoppingCart, Package, Scan, X, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectProducts } from '../store/selectors';
import { purchasesService } from '../services/firebase/firestore';
import { PurchaseItem } from '../types';
import { formatCurrency, formatNumber, formatNumberInput, parseNumberInput } from '../utils/currency';
import { useNotification } from '../contexts/NotificationContext';
import { useSectionRealtime } from '../hooks/useOnDemandData';

interface PurchaseForm extends Omit<PurchaseItem, 'totalCost' | 'previousStock' | 'previousPurchasePrice' | 'previousSalePrice'> {
  totalCost: number;
}

export function Purchases() {
  useSectionRealtime('products');
  useSectionRealtime('purchases');

  const products = useAppSelector(selectProducts);
  const { showError, showWarning } = useNotification();
  
  const [currentPurchase, setCurrentPurchase] = useState<PurchaseForm[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [purchasePriceDisplay, setPurchasePriceDisplay] = useState('');
  const [salePrice, setSalePrice] = useState(0);
  const [salePriceDisplay, setSalePriceDisplay] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchMode, setSearchMode] = useState<'dropdown' | 'barcode'>('dropdown');
  const [isProcessing, setIsProcessing] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [notes, setNotes] = useState('');
  const [notification, setNotification] = useState<{
    show: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);
  
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  // Función para mostrar notificaciones
  const showNotificationLocal = (type: 'success' | 'error', title: string, message: string) => {
    setNotification({ show: true, type, title, message });
    // Auto-ocultar después de 4 segundos
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Focus barcode input when switching to barcode mode
  useEffect(() => {
    if (searchMode === 'barcode' && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [searchMode]);

  // Auto-set purchase and sale price when product is selected
  useEffect(() => {
    if (selectedProduct) {
      const product = products.find(p => p.id === selectedProduct);
      if (product) {
        setPurchasePrice(product.purchasePrice);
        setPurchasePriceDisplay(formatCurrency(product.purchasePrice));
        setSalePrice(product.salePrice);
        setSalePriceDisplay(formatCurrency(product.salePrice));
      }
    }
  }, [selectedProduct, products]);

  // Sync display values with actual values
  useEffect(() => {
    setPurchasePrice(parseNumberInput(purchasePriceDisplay));
  }, [purchasePriceDisplay]);

  useEffect(() => {
    setSalePrice(parseNumberInput(salePriceDisplay));
  }, [salePriceDisplay]);

  const handleBarcodeSearch = (barcode: string) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      setSelectedProduct(product.id);
      setBarcodeInput('');
      setPurchasePrice(product.purchasePrice);
      setPurchasePriceDisplay(formatCurrency(product.purchasePrice));
      setSalePrice(product.salePrice);
      setSalePriceDisplay(formatCurrency(product.salePrice));
      // Auto-add to purchase if product found
      addProductToPurchase(product.id, 1, product.purchasePrice, product.salePrice);
    } else {
      // Show error feedback
      setBarcodeInput('');
      showError('Producto no encontrado', 'No se encontró un producto con ese código de barras');
    }
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      handleBarcodeSearch(barcodeInput.trim());
    }
  };

  const addProductToPurchase = (productId: string, qty: number, pricePerUnit: number, newSalePriceValue?: number) => {
    const product = products.find(p => p.id === productId);
    if (!product || qty <= 0 || pricePerUnit <= 0) {
      if (!product) {
        showError('Error', 'Producto no encontrado');
      } else if (qty <= 0) {
        showError('Error', 'La cantidad debe ser mayor a cero');
      } else if (pricePerUnit <= 0) {
        showError('Error', 'El precio de compra debe ser mayor a cero');
      }
      return;
    }

    // Usar el precio de venta actual del producto si no se proporciona uno nuevo
    const finalSalePrice = newSalePriceValue || product.salePrice;

    const existingItem = currentPurchase.find(item => item.productId === product.id);
    
    if (existingItem) {
      // Si ya existe, actualizar cantidad y recalcular precio promedio
      const totalCurrentCost = existingItem.quantity * existingItem.purchasePrice;
      const totalNewCost = qty * pricePerUnit;
      const totalQuantity = existingItem.quantity + qty;
      const averagePrice = (totalCurrentCost + totalNewCost) / totalQuantity;
      
      setCurrentPurchase(prev => prev.map(item =>
        item.productId === product.id
          ? { 
              ...item, 
              quantity: totalQuantity,
              purchasePrice: Math.round(averagePrice), // Redondear para evitar decimales largos
              totalCost: totalQuantity * Math.round(averagePrice),
              newSalePrice: finalSalePrice
            }
          : item
      ));
    } else {
      const newItem: PurchaseForm = {
        productId: product.id,
        productName: product.name,
        quantity: qty,
        purchasePrice: pricePerUnit,
        totalCost: qty * pricePerUnit,
        newSalePrice: finalSalePrice,
      };
      setCurrentPurchase(prev => [...prev, newItem]);
    }
  };

  const addToPurchase = () => {
    if (!selectedProduct) {
      showWarning('Selecciona un producto', 'Debes seleccionar un producto antes de agregarlo a la compra');
      return;
    }
    const parsedPrice = parseNumberInput(purchasePriceDisplay);
    const parsedSalePrice = parseNumberInput(salePriceDisplay);
    if (parsedPrice <= 0) {
      showWarning('Precio inválido', 'El precio de compra debe ser mayor a cero');
      return;
    }
    if (parsedSalePrice <= 0) {
      showWarning('Precio de venta inválido', 'El precio de venta debe ser mayor a cero');
      return;
    }
    addProductToPurchase(selectedProduct, parseInt(quantity) || 1, parsedPrice, parsedSalePrice);
    setSelectedProduct('');
    setQuantity('1');
    setPurchasePrice(0);
    setPurchasePriceDisplay('');
    setSalePrice(0);
    setSalePriceDisplay('');
    setProductSearch(''); // Limpiar el campo de búsqueda después de agregar
  };

  const removeFromPurchase = (productId: string) => {
    setCurrentPurchase(prev => prev.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      return;
    }

    setCurrentPurchase(prev => prev.map(item =>
      item.productId === productId
        ? { 
            ...item, 
            quantity: newQuantity,
            totalCost: newQuantity * item.purchasePrice
          }
        : item
    ));
  };

  const updatePurchasePrice = (productId: string, newPrice: number) => {
    if (newPrice <= 0) {
      return;
    }

    setCurrentPurchase(prev => prev.map(item =>
      item.productId === productId
        ? { 
            ...item, 
            purchasePrice: newPrice,
            totalCost: item.quantity * newPrice
          }
        : item
    ));
  };

  const updateSalePrice = (productId: string, newSalePrice: number) => {
    if (newSalePrice <= 0) {
      return;
    }

    setCurrentPurchase(prev => prev.map(item =>
      item.productId === productId
        ? { 
            ...item, 
            newSalePrice: newSalePrice
          }
        : item
    ));
  };

  const calculatePurchaseTotal = () => {
    const totalCost = currentPurchase.reduce((sum, item) => sum + item.totalCost, 0);
    const totalItems = currentPurchase.reduce((sum, item) => sum + item.quantity, 0);
    
    return { totalCost, totalItems };
  };

  const completePurchase = async () => {
    if (currentPurchase.length === 0) {
      showWarning('Compra vacía', 'Debes agregar al menos un producto a la compra');
      return;
    }

    const { totalCost, totalItems } = calculatePurchaseTotal();
    
    if (totalCost <= 0) {
      showError('Total inválido', 'El total de la compra debe ser mayor a cero');
      return;
    }

    setIsProcessing(true);
    try {
      // Preparar datos de compra con información adicional del inventario actual
      const purchaseItems: PurchaseItem[] = await Promise.all(
        currentPurchase.map(async (item) => {
          const product = products.find(p => p.id === item.productId);
          if (!product) {
            throw new Error(`Producto no encontrado: ${item.productId}`);
          }
          
          return {
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            totalCost: item.totalCost,
            previousStock: product.stock,
            previousPurchasePrice: product.purchasePrice,
            newSalePrice: item.newSalePrice,
            previousSalePrice: product.salePrice,
          };
        })
      );

      const purchaseData: any = {
        items: purchaseItems,
        totalCost,
        totalItems,
      };
      
      // Solo incluir notes si tiene contenido
      const trimmedNotes = notes.trim();
      if (trimmedNotes) {
        purchaseData.notes = trimmedNotes;
      }
      
      // Procesar la compra en Firebase
      await purchasesService.add(purchaseData);
      
      // Limpiar el formulario
      setCurrentPurchase([]);
      setNotes('');
      setSelectedProduct('');
      setQuantity('1');
      setPurchasePrice(0);
      setPurchasePriceDisplay('');
      setSalePrice(0);
      setSalePriceDisplay('');
      setBarcodeInput('');
      
      showNotificationLocal(
        'success',
        'Compra registrada',
        `Compra por ${formatCurrency(totalCost)} procesada exitosamente. ${formatNumber(totalItems)} producto(s) agregado(s) al inventario.`
      );
    } catch (error) {
      let errorMessage = 'Error desconocido al procesar la compra';
      if (error instanceof Error) {
        if (error.message.includes('permission-denied')) {
          errorMessage = 'No tienes permisos para registrar compras. Verifica que estés logueado como administrador.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Error de conexión. Verifica tu conexión a internet.';
        } else if (error.message.includes('quota-exceeded')) {
          errorMessage = 'Se ha excedido la cuota de Firebase. Intenta más tarde.';
        } else {
          errorMessage = error.message;
        }
      }
      showNotificationLocal('error', 'Error al procesar compra', errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const { totalCost, totalItems } = calculatePurchaseTotal();

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compras</h1>
          <p className="text-gray-500 mt-1">Registra nuevas compras de productos y actualiza el inventario</p>
        </div>

        {/* Formulario de registro - Ocupa toda la pantalla */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Registro de Compras
          </h3>

          <div className="space-y-6">
            {/* Search Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1 max-w-md">
              <button
                onClick={() => setSearchMode('dropdown')}
                disabled={isProcessing}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                  searchMode === 'dropdown'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Lista de Productos
              </button>
              <button
                onClick={() => setSearchMode('barcode')}
                disabled={isProcessing}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center disabled:opacity-50 ${
                  searchMode === 'barcode'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Scan className="h-4 w-4 mr-1" />
                Código de Barras
              </button>
            </div>

            {/* Product Selection */}
            {searchMode === 'dropdown' ? (
              <div className="space-y-6">
                <div className="relative w-full max-w-2xl">
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        ref={productInputRef}
                        type="text"
                        placeholder="Buscar por nombre o referencia..."
                        value={productSearch}
                        onChange={e => {
                          setProductSearch(e.target.value);
                          setShowProductDropdown(true);
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                        disabled={isProcessing}
                        className="px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full disabled:opacity-50"
                      />
                      {showProductDropdown && productSearch && (
                        <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto mt-1">
                          {products.filter(p => 
                            p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                            (p.referencia && p.referencia.toLowerCase().includes(productSearch.toLowerCase()))
                          ).length === 0 ? (
                            <div className="p-4 text-gray-500 text-sm">No hay productos</div>
                          ) : (
                            products
                              .filter(p => 
                                p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                                (p.referencia && p.referencia.toLowerCase().includes(productSearch.toLowerCase()))
                              )
                              .map(product => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onMouseDown={() => {
                                    setSelectedProduct(product.id);
                                    setProductSearch(product.name);
                                    setPurchasePrice(product.purchasePrice);
                                    setPurchasePriceDisplay(formatCurrency(product.purchasePrice));
                                    setSalePrice(product.salePrice);
                                    setSalePriceDisplay(formatCurrency(product.salePrice));
                                    setShowProductDropdown(false);
                                    setTimeout(() => productInputRef.current?.blur(), 0);
                                  }}
                                  className={`w-full text-left px-4 py-3 hover:bg-blue-50 ${selectedProduct === product.id ? 'bg-blue-100' : ''}`}
                                >
                                  <div>
                                    <div className="font-medium text-base">{product.name}</div>
                                    <div className="text-sm text-gray-500 mt-1">
                                      {product.referencia && <span className="mr-3">Ref: {product.referencia}</span>}
                                      Stock: {formatNumber(product.stock)} | Compra: {formatCurrency(product.purchasePrice)} | Venta: {formatCurrency(product.salePrice)}
                                    </div>
                                    <div className="text-xs text-green-600 mt-1">
                                      Margen: {product.salePrice > 0 ? Math.round(((product.salePrice - product.purchasePrice) / product.salePrice) * 100) : 0}%
                                    </div>
                                  </div>
                                </button>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Purchase details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cantidad
                    </label>
                    <input
                      type="text"
                      value={quantity}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Solo permitir números
                        if (value === '' || /^\d+$/.test(value)) {
                          setQuantity(value);
                        }
                      }}
                      onFocus={(e) => {
                        // Borrar el contenido cuando se hace foco si es el valor por defecto
                        if (e.target.value === '1') {
                          setQuantity('');
                        }
                      }}
                      onBlur={(e) => {
                        // Validar al perder el foco
                        const value = e.target.value;
                        if (value === '' || parseInt(value) <= 0) {
                          setQuantity('1');
                        }
                      }}
                      disabled={isProcessing}
                      className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Precio de Compra (c/u)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={purchasePriceDisplay}
                        onChange={(e) => setPurchasePriceDisplay(formatNumberInput(e.target.value))}
                        disabled={isProcessing}
                        className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nuevo Precio de Venta
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={salePriceDisplay}
                        onChange={(e) => setSalePriceDisplay(formatNumberInput(e.target.value))}
                        disabled={isProcessing}
                        className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={addToPurchase}
                      disabled={!selectedProduct || parseInt(quantity) <= 0 || purchasePrice <= 0 || salePrice <= 0 || isProcessing}
                      className="w-full bg-blue-600 text-white px-6 py-3 text-base rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      <Plus className="h-5 w-5 mr-2" />
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center space-x-3">
                  <Scan className="h-6 w-6 text-gray-400" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="Escanea o ingresa código de barras..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyPress={handleBarcodeKeyPress}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleBarcodeSearch(barcodeInput.trim())}
                    disabled={!barcodeInput.trim() || isProcessing}
                    className="bg-green-600 text-white px-6 py-3 text-base rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Agregar
                  </button>
                </div>
                <p className="text-sm text-gray-500 ml-9">
                  Presiona Enter o haz clic en Agregar después de escanear/ingresar el código de barras
                </p>
              </div>
            )}

            {/* Current Purchase Items */}
            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <h4 className="font-medium text-gray-900 mb-4">Productos en la compra</h4>
              <div className="max-h-96 overflow-y-auto">
                {currentPurchase.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No hay artículos agregados a la compra</p>
                ) : (
                  <div className="space-y-3">
                    {currentPurchase.map((item) => (
                      <div key={item.productId} className="flex justify-between items-center p-4 bg-white rounded-lg border border-gray-200">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{item.productName}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {(() => {
                              const product = products.find(p => p.id === item.productId);
                              return product?.referencia ? `Ref: ${product.referencia} • ` : '';
                            })()}
                            {formatNumber(item.quantity)} unidades × {formatCurrency(item.purchasePrice)}
                          </div>
                          <div className="text-sm text-blue-600 mt-1">
                            Precio venta: {formatCurrency(item.newSalePrice)}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 ml-4">
                          <div className="flex flex-col items-center space-y-2">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                                disabled={isProcessing}
                                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-lg font-medium disabled:opacity-50"
                              >
                                -
                              </button>
                              <input
                                type="text"
                                value={item.quantity}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Solo permitir números
                                  if (value === '' || /^\d+$/.test(value)) {
                                    const parsedValue = parseInt(value) || 0;
                                    if (parsedValue > 0) {
                                      updateQuantity(item.productId, parsedValue);
                                    }
                                  }
                                }}
                                onFocus={(e) => {
                                  e.target.select();
                                }}
                                onBlur={(e) => {
                                  const value = e.target.value;
                                  if (value === '' || parseInt(value) <= 0) {
                                    updateQuantity(item.productId, 1);
                                  }
                                }}
                                disabled={isProcessing}
                                className="w-20 text-center font-medium px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                              />
                              <button
                                onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                                disabled={isProcessing}
                                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-lg font-medium disabled:opacity-50"
                              >
                                +
                              </button>
                            </div>
                            <div className="text-xs text-gray-500 font-medium">Cantidad</div>
                          </div>
                          <div className="flex flex-col items-center space-y-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.purchasePrice}
                              onChange={(e) => updatePurchasePrice(item.productId, Math.max(0, parseFloat(e.target.value) || 0))}
                              disabled={isProcessing}
                              className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-center"
                            />
                            <div className="text-xs text-gray-500 font-medium">Compra</div>
                          </div>
                          <div className="flex flex-col items-center space-y-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.newSalePrice}
                              onChange={(e) => updateSalePrice(item.productId, Math.max(0, parseFloat(e.target.value) || 0))}
                              disabled={isProcessing}
                              className="w-24 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-center"
                            />
                            <div className="text-xs text-blue-600 font-medium">Venta</div>
                          </div>
                          <div className="flex flex-col items-center space-y-2">
                            <span className="font-semibold text-lg text-green-600">{formatCurrency(item.totalCost)}</span>
                            <div className="text-xs text-gray-500 font-medium">Total</div>
                          </div>
                          <button
                            onClick={() => removeFromPurchase(item.productId)}
                            disabled={isProcessing}
                            className="text-red-600 hover:text-red-800 w-8 h-8 flex items-center justify-center text-xl disabled:opacity-50"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Purchase Summary */}
            {currentPurchase.length > 0 && (
              <div className="border-t pt-6 space-y-4 bg-gray-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex justify-between text-base">
                    <span className="font-medium">Total de productos:</span>
                    <span className="font-semibold">{formatNumber(totalItems)} unidades</span>
                  </div>
                  
                  <div className="flex justify-between font-bold text-xl">
                    <span>Costo Total:</span>
                    <span className="text-green-600">{formatCurrency(totalCost)}</span>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isProcessing}
                    rows={3}
                    className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    placeholder="Ej: Proveedor, factura #, observaciones..."
                  />
                </div>

                <button
                  onClick={completePurchase}
                  disabled={totalCost <= 0 || isProcessing}
                  className="w-full bg-green-600 text-white px-6 py-4 text-lg rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-6 w-6" />
                      <span>Registrar Compra</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-[103] max-w-sm w-full">
          <div className={`rounded-lg shadow-lg border-l-4 p-4 ${
            notification.type === 'success' 
              ? 'bg-green-50 border-green-400' 
              : 'bg-red-50 border-red-400'
          }`}>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                {notification.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
              </div>
              <div className="ml-3 w-0 flex-1">
                <p className={`text-sm font-medium ${
                  notification.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {notification.title}
                </p>
                <p className={`mt-1 text-sm ${
                  notification.type === 'success' ? 'text-green-700' : 'text-red-700'
                }`}>
                  {notification.message}
                </p>
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  onClick={() => setNotification(null)}
                  className={`rounded-md inline-flex ${
                    notification.type === 'success' 
                      ? 'text-green-400 hover:text-green-600' 
                      : 'text-red-400 hover:text-red-600'
                  } focus:outline-none`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
