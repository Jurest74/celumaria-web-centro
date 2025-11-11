import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Plus, Minus, ShoppingCart, CreditCard, DollarSign, Receipt, Scan, X, User, Search, Wallet, Gift } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectProducts, selectSales } from '../store/selectors';
import { salesService, courtesiesService } from '../services/firebase/firestore';
import { SaleItem, PaymentMethod } from '../types';
import type { Customer } from '../types';
import { customersService } from '../services/firebase/firestore';
import { cancelledMoneyService } from '../services/firebase/cancelledMoney';
import { formatCurrency, formatNumber, formatNumberInput, parseNumberInput } from '../utils/currency';
import { useNotification } from '../contexts/NotificationContext';
// ⚡ OPTIMIZADO: No usar useSectionRealtime - datos se cargan al navegar
import { calculatePaymentCommission, getPaymentMethodLabel } from '../utils/paymentCommission';
import { useAuth } from '../contexts/AuthContext';
import { useFirebase } from '../contexts/FirebaseContext';
import {
  calculateSaleTotal as calcSaleTotal,
  calculateCreditUsed,
  getTotalPaidAmount,
  type ExtendedPaymentMethod
} from '../utils/salesCalculations';
import { CourtesyModal } from './CourtesyModal';

// Tipos mejorados para el estado del formulario
interface SaleFormState {
  currentSale: SaleItem[];
  selectedProduct: string;
  quantity: number;
  discount: number;
  discountDisplay: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito';
  paymentMethods: ExtendedPaymentMethod[];
  useMultiplePayments: boolean;
  courtesyItems: any[]; // Productos de cortesía
}

interface CustomerState {
  selectedCustomer: Customer | null;
  customerSearch: string;
  applyCredit: boolean;
}

interface UIState {
  isProcessing: boolean;
  productSearch: string;
  showProductDropdown: boolean;
  lastSale: any | null;
  showInvoice: boolean;
  lastAddedItem: SaleItem | null;
  showCourtesyModal: boolean;
}

export function InvoiceModal({ sale, onClose }: { sale: any; onClose: () => void }) {
  // Ref for printable area
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (printRef.current) {
      // Open a new window with the invoice content for printing
      const printContents = printRef.current.innerHTML;
      const printWindow = window.open('', '', 'width=320,height=800');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Factura</title>
              <style>
                @media print {
                  @page { margin: 0 !important; size: 75mm auto !important; }
                  * { margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; }
                  html, body {
                    width: 75mm !important;
                    min-width: 75mm !important;
                    max-width: 75mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #fff !important;
                  }
                  body, .factura-recibo {
                    font-family: monospace, Arial, sans-serif !important;
                    font-size: 15px !important;
                    width: 75mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  .factura-recibo {
                    width: 75mm !important;
                    margin: 0 auto !important;
                    padding: 0 6mm 0 12mm !important;
                  }
                  .factura-recibo .logo-text {
                    font-size: 24px !important;
                    font-weight: bold !important;
                    font-style: italic !important;
                    letter-spacing: -1px !important;
                    text-align: center !important;
                    margin: 0 auto !important;
                    display: block !important;
                    color: #000 !important;
                  }
                  .factura-recibo h2, .factura-recibo .center {
                    text-align: center !important;
                    margin: 0 !important;
                  }
                  .factura-recibo h2 {
                    font-size: 15px !important;
                    margin-bottom: 2px !important;
                  }
                  .factura-recibo table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    margin-top: 4px !important;
                  }
                  .factura-recibo th, .factura-recibo td {
                    padding: 4px 0 !important;
                    text-align: left !important;
                    font-size: 12px !important;
                  }
                  .factura-recibo th {
                    background: none !important;
                  }
                  .factura-recibo .total-row {
                    border-top: 1px solid #000 !important;
                    font-weight: bold !important;
                  }
                  .factura-recibo .totals { font-weight: bold !important; }
                  .factura-recibo .right { text-align: right !important; }
                  .factura-recibo .center { text-align: center !important; }
                  .factura-recibo .no-border { border: none !important; }
                  .factura-recibo > *:not(:last-child) { margin-bottom: 1px !important; }
                  .factura-recibo img + div { margin-top: 0 !important; }
                }
                /* Visual (modal) styles remain igual */
                body { width: 75mm; margin: 0; font-family: monospace, Arial, sans-serif; font-size: 15px; }
                .factura-recibo { width: 75mm; margin: 0 auto; padding: 0 6mm 0 12mm; }
                h2 { font-size: 17px; margin: 0 0 4px 0; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 6px; }
                th, td { padding: 4px 0; text-align: left; font-size: 15px; }
                th { background: none; }
                .total-row { border-top: 1px solid #000 !important; font-weight: bold; }
                .totals { font-weight: bold; }
                .right { text-align: right; }
                .center { text-align: center; }
                .no-border { border: none !important; }
              </style>
            </head>
            <body>
              <div class="factura-recibo">${printContents}</div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }
    }
  };

  if (!sale) return null;

  return (
    <>
      {/* Overlay oscuro con margen superior blanco, debajo del modal */}
      <div className="fixed inset-0 z-[99] pointer-events-none">
        <div className="absolute left-0 right-0 top-[5vh] bottom-0 bg-black bg-opacity-50" />
      </div>
      {/* Modal por encima del overlay */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative border border-gray-200">
          <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl">×</button>
          <div ref={printRef} className="factura-recibo">
          {/* Encabezado con logo, nombre, NIT y teléfono */}
          <div className="center" style={{ marginBottom: '12px' }}>
            <div className="logo-text" style={{ fontSize: '24px', fontWeight: 'bold', fontStyle: 'italic', letterSpacing: '-1px', textAlign: 'center', margin: '0 auto 8px auto', display: 'block' }}>CELU MARIA</div>
            <div className="center" style={{ fontSize: '12px', marginBottom: '2px', lineHeight: '1.3' }}>Carrera 45 # 71a-17</div>
            <div className="center" style={{ fontSize: '12px', marginBottom: '2px', lineHeight: '1.3' }}>Celular +57 3043884525</div>
            <div className="center" style={{ fontSize: '12px', marginBottom: '2px', lineHeight: '1.3' }}>Instagram @celu.maria</div>
          </div>
          
          <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
          
          <h2 className="font-bold mb-2 center" style={{ fontSize: '16px', margin: '8px 0' }}>Cuenta de Cobro</h2>
          <div className="text-xs text-gray-600 mb-3" style={{ marginBottom: '4px', fontSize: '11px', textAlign: 'left' }}>Fecha: {new Date().toLocaleString()}</div>
          {/* Mostrar nombre del cliente si está seleccionado */}
          {sale.customerName && (
            <div className="text-xs text-gray-900 mb-2" style={{ marginBottom: '2px', fontWeight: '500', fontSize: '11px', textAlign: 'left' }}>Cliente: {sale.customerName}</div>
          )}
          {/* Mostrar nombre del vendedor */}
          {sale.salesPersonName && (
            <div className="text-xs text-gray-700 mb-3" style={{ marginBottom: '4px', fontWeight: '500', fontSize: '11px', textAlign: 'left' }}>Vendedor: {sale.salesPersonName}</div>
          )}
          
          <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

          {/* Si es servicio técnico, mostrar detalles del servicio */}
          {sale.type === 'technical_service_payment' && sale.technicalServiceDetails ? (
            <div style={{ marginTop: '8px', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>SERVICIO TÉCNICO</div>
              <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>Equipo:</span> {sale.technicalServiceDetails.deviceBrandModel || 'N/A'}
              </div>
              {sale.technicalServiceDetails.deviceImei && (
                <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold' }}>IMEI:</span> {sale.technicalServiceDetails.deviceImei}
                </div>
              )}
              {sale.technicalServiceDetails.reportedIssue && (
                <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold' }}>Problema:</span> {sale.technicalServiceDetails.reportedIssue}
                </div>
              )}
              {sale.technicalServiceDetails.technicianName && (
                <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>Técnico:</span> {sale.technicalServiceDetails.technicianName}
                </div>
              )}
            </div>
          ) : (
            /* Tabla de productos normal */
            <table className="w-full text-xs" style={{ marginTop: '8px', marginBottom: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '4px 0', fontWeight: 'bold' }}>Producto</th>
                  <th style={{ padding: '4px 0', fontWeight: 'bold' }}>Cant</th>
                  <th style={{ padding: '4px 0', fontWeight: 'bold' }}>Precio</th>
                  <th style={{ padding: '4px 0', fontWeight: 'bold' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item: any) => (
                  <tr key={item.productId}>
                    <td style={{ padding: '3px 0' }}>
                      {item.productName}
                      {item.referencia && (
                        <div style={{ fontSize: '10px', color: '#000', marginTop: '1px' }}>
                          Ref: {item.referencia}
                        </div>
                      )}
                      {item.category?.includes('Celulares') && item.imei && (
                        <div style={{ fontSize: '10px', color: '#000', marginTop: '1px' }}>
                          IMEI: {item.imei}
                        </div>
                      )}
                    </td>
                    <td className="right" style={{ padding: '3px 0' }}>{item.quantity}</td>
                    <td className="right" style={{ padding: '3px 0' }}>{formatCurrency(item.salePrice)}</td>
                    <td className="right" style={{ padding: '3px 0' }}>{formatCurrency(item.totalRevenue)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td style={{ fontWeight: 'bold', padding: '6px 0 3px 0' }}>Total Artículos:</td>
                  <td className="right" style={{ fontWeight: 'bold', padding: '6px 0 3px 0' }}>
                    {sale.items.reduce((total: number, item: any) => total + item.quantity, 0)}
                  </td>
                  <td style={{ padding: '6px 0 3px 0' }}></td>
                  <td style={{ padding: '6px 0 3px 0' }}></td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Cortesías */}
          {sale.courtesyItems && sale.courtesyItems.length > 0 && (
            <>
              <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
              <div className="text-center" style={{ fontSize: '12px', fontWeight: 'bold', margin: '8px 0', color: '#0891b2' }}>
                CORTESÍAS
              </div>
              <table className="w-full text-xs" style={{ marginTop: '4px', marginBottom: '4px' }}>
                <tbody>
                  {sale.courtesyItems.map((courtesy: any, index: number) => (
                    <tr key={index}>
                      <td style={{ padding: '2px 0', fontSize: '11px' }}>{courtesy.productName}</td>
                      <td className="center" style={{ padding: '2px 0', fontSize: '11px' }}>{courtesy.quantity}</td>
                      <td className="right" style={{ padding: '2px 0', fontSize: '11px', textDecoration: 'line-through' }}>{formatCurrency(courtesy.normalPrice)}</td>
                      <td className="right" style={{ padding: '2px 0', fontSize: '11px', fontWeight: 'bold' }}>$0</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sale.courtesyTotalValue && (
                <div className="flex justify-between" style={{ marginTop: '4px', marginBottom: '8px', fontSize: '11px', color: '#0891b2', fontStyle: 'italic' }}>
                  <span>Valor cortesías:</span>
                  <span>{formatCurrency(sale.courtesyTotalValue)}</span>
                </div>
              )}
            </>
          )}

          <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

          <div className="mt-4" style={{ marginTop: '12px' }}>
            <div className="flex justify-between" style={{ marginBottom: '6px', fontSize: '13px' }}><span>Subtotal:</span><span>{formatCurrency(sale.subtotal)}</span></div>
            {sale.discount > 0 && (
              <div className="flex justify-between" style={{ marginBottom: '6px', fontSize: '13px' }}><span>Descuento:</span><span>-{formatCurrency(sale.discount)}</span></div>
            )}
            {sale.customerSurcharge > 0 && (
              <div className="flex justify-between text-orange-600" style={{ marginBottom: '6px', fontSize: '13px' }}><span>Recargo por método de pago:</span><span>+{formatCurrency(sale.customerSurcharge)}</span></div>
            )}
            
            <div style={{ borderBottom: '1px solid #000', margin: '8px 0' }}></div>
            
            <div className="flex justify-between totals" style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}><span>Total:</span><span>{formatCurrency(sale.finalTotal || sale.total)}</span></div>
            {/* Mostrar saldo a favor aplicado como línea separada si existe */}
            {sale.paymentMethods && sale.paymentMethods.some((p: any) => p.method === 'credit') && (
              <div className="flex justify-between text-green-700 font-semibold" style={{ marginBottom: '6px', fontSize: '13px' }}>
                <span>Saldo a favor aplicado:</span>
                <span>-{formatCurrency(sale.paymentMethods.find((p: any) => p.method === 'credit')?.amount || 0)}</span>
              </div>
            )}
            {/* Mostrar total a pagar tras saldo a favor SOLO si se usó saldo a favor */}
            {sale.paymentMethods && sale.paymentMethods.some((p: any) => p.method === 'credit') && (
              <>
                <div style={{ borderBottom: '1px solid #000', margin: '8px 0' }}></div>
                <div className="flex justify-between totals" style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
                  <span>Total a pagar tras saldo a favor:</span>
                  <span>{formatCurrency((sale.finalTotal || sale.total) - (sale.paymentMethods?.find((p: any) => p.method === 'credit')?.amount || 0))}</span>
                </div>
              </>
            )}
            {/* Métodos de pago solo para el restante (sin saldo a favor) */}
            {sale.paymentMethods && sale.paymentMethods.filter((p: any) => p.method !== 'credit').length > 0 && (
              <>
                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
                <div className="text-xs" style={{ marginTop: '8px' }}>
                  <div className="flex justify-between" style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '13px' }}><span>Métodos de pago:</span></div>
                  {sale.paymentMethods.filter((p: any) => p.method !== 'credit').map((payment: any, index: number) => (
                    <div key={index} className="flex justify-between" style={{ marginLeft: '8px', marginBottom: '4px', fontSize: '12px' }}>
                      <span>
                        {payment.method === 'efectivo' ? 'Efectivo' : 
                         payment.method === 'transferencia' ? 'Transferencia' : 
                         payment.method === 'tarjeta' ? 'Tarjeta' : 
                         payment.method === 'crédito' ? 'Crédito' : payment.method}
                        :
                      </span>
                      <span>{formatCurrency(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          
          <div style={{ borderBottom: '1px dashed #000', margin: '12px 0 8px 0' }}></div>
          
          <div className="center text-xs" style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', lineHeight: '1.3' }}>Celu María tecnología confiable, gente real, soluciones honestas!</div>
          <div className="center text-xs" style={{ fontSize: '12px', marginBottom: '4px', fontWeight: '500' }}>¡Gracias por su compra!</div>
          <div className="center text-xs" style={{ fontSize: '11px', color: '#000' }}>Carrera 45 # 71a-17</div>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <button onClick={handlePrint} className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-xs">Imprimir</button>
          <button onClick={onClose} className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 text-xs">Cerrar</button>
        </div>
      </div>
    </div>
    </>
  );
}

export function Sales() {
  // ⚡ OPTIMIZADO: NO usar listeners en tiempo real
  // Los productos se cargan al navegar a esta vista (POS)
  // Los cambios se verán al refrescar o cambiar de vista y volver

  const products = useAppSelector(selectProducts);
  const sales = useAppSelector(selectSales);
  const customers = useAppSelector(state => state.firebase.customers.items);
  const { showSuccess, showError, showWarning } = useNotification();
  const { appUser } = useAuth();
  const firebase = useFirebase();

  // Helper function to calculate sales count for last 30 days per customer
  const getSalesCountForCustomer = useCallback((customerId: string) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return sales.filter((sale: any) => {
      if (sale.customerId !== customerId) return false;
      const saleDate = new Date(sale.createdAt);
      return saleDate >= thirtyDaysAgo;
    }).length;
  }, [sales]);

  // Estado del formulario de venta
  const [saleForm, setSaleForm] = useState<SaleFormState>({
    currentSale: [],
    selectedProduct: '',
    quantity: 1,
    discount: 0,
    discountDisplay: '',
    paymentMethod: 'efectivo',
    paymentMethods: [],
    useMultiplePayments: false,
    courtesyItems: []
  });

  // Estado del cliente
  const [customerState, setCustomerState] = useState<CustomerState>({
    selectedCustomer: null,
    customerSearch: '',
    applyCredit: false
  });

  // Estado de la UI
  const [uiState, setUIState] = useState<UIState>({
    isProcessing: false,
    productSearch: '',
    showProductDropdown: false,
    lastSale: null,
    showInvoice: false,
    lastAddedItem: null,
    showCourtesyModal: false
  });

  // Referencias
  const productInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedProductIndex, setSelectedProductIndex] = useState(-1);
  const [needsScroll, setNeedsScroll] = useState(false);
  
  // Referencias para detección de escaneo automático
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputTimeRef = useRef<number>(0);
  const scanBufferRef = useRef<string>('');
  const autoProcessedRef = useRef<string>(''); // Flag para evitar doble procesamiento
  const isProcessingBarcodeRef = useRef<boolean>(false); // Flag para evitar procesamiento concurrente
  const lastAddedProductRef = useRef<{productId: string, timestamp: number} | null>(null); // Rastrear último producto agregado

  // Handlers optimizados con useCallback
  const updateSaleForm = useCallback((updates: Partial<SaleFormState>) => {
    setSaleForm(prev => ({ ...prev, ...updates }));
  }, []);

  const updateCustomerState = useCallback((updates: Partial<CustomerState>) => {
    setCustomerState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateUIState = useCallback((updates: Partial<UIState>) => {
    setUIState(prev => ({ ...prev, ...updates }));
  }, []);

  // Handlers de cortesías
  const handleOpenCourtesyModal = useCallback(() => {
    updateUIState({ showCourtesyModal: true });
  }, [updateUIState]);

  const handleCloseCourtesyModal = useCallback(() => {
    updateUIState({ showCourtesyModal: false });
  }, [updateUIState]);

  const handleAddCourtesy = useCallback((courtesyItem: any) => {
    updateSaleForm({
      courtesyItems: [...saleForm.courtesyItems, courtesyItem]
    });
  }, [updateSaleForm, saleForm.courtesyItems]);

  const handleRemoveCourtesy = useCallback((index: number) => {
    const updatedCourtesyItems = saleForm.courtesyItems.filter((_, i) => i !== index);
    updateSaleForm({ courtesyItems: updatedCourtesyItems });
  }, [updateSaleForm, saleForm.courtesyItems]);

  // Cleanup del timeout al desmontar el componente
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  // Función para verificar si necesita scroll
  const checkScrollNeeded = useCallback(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      const contentHeight = container.scrollHeight;
      const containerHeight = container.clientHeight;
      const needsScrolling = contentHeight > containerHeight;
      setNeedsScroll(needsScrolling);
    }
  }, []);

  // Effect para verificar scroll cuando cambie el contenido
  useEffect(() => {
    const timer = setTimeout(checkScrollNeeded, 150);
    return () => clearTimeout(timer);
  }, [saleForm.currentSale, saleForm.paymentMethods, saleForm.useMultiplePayments, customerState.selectedCustomer, checkScrollNeeded]);

  // Effect para verificar scroll en resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(checkScrollNeeded, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkScrollNeeded]);



  // Filtros memoizados para mejor rendimiento
  const filteredProducts = useMemo(() => {
    if (!uiState.productSearch) return products.filter(p => p.stock > 0);
    
    const search = uiState.productSearch.toLowerCase();
    
    // Si es un código de barras (solo números), buscar por código de barras exacto
    if (/^\d+$/.test(uiState.productSearch)) {
      return products.filter(p => 
        p.stock > 0 && p.barcode === uiState.productSearch
      );
    }
    
    // Si es texto, buscar por nombre o referencia
    return products.filter(p => 
      p.stock > 0 && (
        p.name.toLowerCase().includes(search) ||
        (p.referencia && p.referencia.toLowerCase().includes(search))
      )
    );
  }, [products, uiState.productSearch]);

  const filteredCustomers = useMemo(() => {
    if (!customerState.customerSearch) return customers;
    
    const search = customerState.customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(search) ||
      (c.phone && c.phone.toLowerCase().includes(search)) ||
      (c.email && c.email.toLowerCase().includes(search))
    );
  }, [customers, customerState.customerSearch]);

  // Cálculos memoizados
  const saleTotal = useMemo(() => 
    calcSaleTotal(
      saleForm.currentSale,
      saleForm.discount,
      saleForm.paymentMethod,
      saleForm.paymentMethods,
      saleForm.useMultiplePayments
    ),
    [saleForm.currentSale, saleForm.discount, saleForm.paymentMethod, saleForm.paymentMethods, saleForm.useMultiplePayments]
  );

  const creditUsed = useMemo(() => {
    if (!customerState.selectedCustomer || !customerState.applyCredit) return 0;
    return calculateCreditUsed(
      customerState.selectedCustomer.credit,
      saleTotal.total,
      saleForm.paymentMethods
    );
  }, [customerState.selectedCustomer, customerState.applyCredit, saleTotal.total, saleForm.paymentMethods]);

  const totalPaidAmount = useMemo(() => 
    getTotalPaidAmount(
      saleForm.paymentMethods,
      customerState.selectedCustomer?.credit || 0,
      customerState.applyCredit,
      saleTotal.total
    ),
    [saleForm.paymentMethods, customerState.selectedCustomer?.credit, customerState.applyCredit, saleTotal.total]
  );

  const remainingAmount = useMemo(() => 
    Math.max(0, saleTotal.total - totalPaidAmount),
    [saleTotal.total, totalPaidAmount]
  );

  const addPaymentMethod = useCallback((method: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito', amount: number) => {
    if (amount <= 0) return;
    
    const commission = calculatePaymentCommission(method, amount);
    const newPayment: ExtendedPaymentMethod = {
      method,
      amount,
      commission
    };
    
    updateSaleForm({
      paymentMethods: [...saleForm.paymentMethods, newPayment]
    });
  }, [saleForm.paymentMethods, updateSaleForm]);

  const removePaymentMethod = useCallback((index: number) => {
    updateSaleForm({
      paymentMethods: saleForm.paymentMethods.filter((_, i) => i !== index)
    });
  }, [saleForm.paymentMethods, updateSaleForm]);

  const addProductToSale = useCallback((productId: string, qty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product || qty <= 0 || qty > product.stock) {
      if (!product) {
        showError('Error', 'Producto no encontrado');
      } else if (qty > product.stock) {
        showWarning('Stock insuficiente', `Solo hay ${formatNumber(product.stock)} unidades disponibles en stock`);
      }
      return;
    }

    // Prevenir múltiples adiciones rápidas del mismo producto
    const now = Date.now();
    if (lastAddedProductRef.current && 
        lastAddedProductRef.current.productId === productId && 
        now - lastAddedProductRef.current.timestamp < 1000) { // 1 segundo de protección
      return;
    }

    setSaleForm(prev => {
      const existingItem = prev.currentSale.find(item => item.productId === product.id);
      
      if (existingItem) {
        const newQuantity = existingItem.quantity + qty;
        if (newQuantity > product.stock) {
          showWarning('Stock insuficiente', `Solo hay ${formatNumber(product.stock)} unidades disponibles en stock`);
          return prev;
        }
        
        return {
          ...prev,
          currentSale: prev.currentSale.map(item =>
            item.productId === product.id
              ? { 
                  ...item, 
                  quantity: newQuantity, 
                  totalCost: newQuantity * product.purchasePrice,
                  totalRevenue: newQuantity * product.salePrice,
                  profit: (newQuantity * product.salePrice) - (newQuantity * product.purchasePrice)
                }
              : item
          )
        };
      } else {
        const newItem: SaleItem = {
          productId: product.id,
          productName: product.name,
          quantity: qty,
          purchasePrice: product.purchasePrice,
          salePrice: product.salePrice,
          totalCost: qty * product.purchasePrice,
          totalRevenue: qty * product.salePrice,
          profit: (qty * product.salePrice) - (qty * product.purchasePrice),
          ...(product.referencia && { referencia: product.referencia }),
          ...(product.category && { category: product.category }),
          ...(product.imei && { imei: product.imei }),
        };
        
        // Registrar el producto agregado
        lastAddedProductRef.current = { productId, timestamp: now };
        
        return {
          ...prev,
          currentSale: [...prev.currentSale, newItem]
        };
      }
    });

    // Registrar el producto agregado también en caso de suma de cantidad
    lastAddedProductRef.current = { productId, timestamp: now };
  }, [products, showError, showWarning]);

  const handleBarcodeSearch = useCallback((barcode: string) => {
    // Evitar procesamiento concurrente del mismo código
    if (isProcessingBarcodeRef.current) {
      return;
    }
    
    isProcessingBarcodeRef.current = true;
    
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      if (product.stock <= 0) {
        showWarning('Stock insuficiente', 'Este producto no tiene stock disponible');
        updateUIState({ productSearch: '' });
        autoProcessedRef.current = ''; // Limpiar flag
        isProcessingBarcodeRef.current = false;
        return;
      }
      
      addProductToSale(product.id, 1);
      updateUIState({ productSearch: '' });
      showSuccess('Producto agregado', `${product.name} agregado a la venta`);
    } else {
      updateUIState({ productSearch: '' });
      showError('Producto no encontrado', 'No se encontró un producto con ese código de barras');
    }
    
    // Limpiar flags después de procesar
    autoProcessedRef.current = '';
    
    // Liberar el flag después de un pequeño delay para evitar procesamiento duplicado
    setTimeout(() => {
      isProcessingBarcodeRef.current = false;
    }, 200);
  }, [products, addProductToSale, updateUIState, showSuccess, showError, showWarning]);

  // Función para detectar escaneo automático de código de barras
  const handleAutoScan = useCallback((inputValue: string) => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastInputTimeRef.current;
    
    // Si el tiempo entre caracteres es muy corto (< 50ms), probablemente es un escáner
    if (timeDiff < 50 && inputValue.length > scanBufferRef.current.length) {
      scanBufferRef.current = inputValue;
      lastInputTimeRef.current = currentTime;
      
      // Limpiar timeout anterior
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      
      // Configurar nuevo timeout para procesar el código escaneado
      scanTimeoutRef.current = setTimeout(() => {
        const scannedValue = scanBufferRef.current.trim();
        
        // Validar que sea un código de barras válido (solo números, mínimo 6 caracteres)
        if (/^\d{6,}$/.test(scannedValue)) {
          autoProcessedRef.current = scannedValue; // Marcar como procesado automáticamente
          handleBarcodeSearch(scannedValue);
        }
        
        // Limpiar buffer
        scanBufferRef.current = '';
      }, 300); // Aumentar timeout para escáneres más lentos
    } else {
      // Entrada manual (typing normal)
      lastInputTimeRef.current = currentTime;
      scanBufferRef.current = inputValue;
    }
  }, [handleBarcodeSearch]);

  const removeFromSale = useCallback((productId: string) => {
    updateSaleForm({
      currentSale: saleForm.currentSale.filter(item => item.productId !== productId)
    });
  }, [saleForm.currentSale, updateSaleForm]);

  const increaseQuantity = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    const currentItem = saleForm.currentSale.find(item => item.productId === productId);
    
    if (!product || !currentItem) return;
    
    if (currentItem.quantity >= product.stock) {
      showWarning('Stock insuficiente', `Solo hay ${formatNumber(product.stock)} unidades disponibles`);
      return;
    }
    
    const newQuantity = currentItem.quantity + 1;
    updateSaleForm({
      currentSale: saleForm.currentSale.map(item =>
        item.productId === productId
          ? {
              ...item,
              quantity: newQuantity,
              totalCost: newQuantity * item.purchasePrice,
              totalRevenue: newQuantity * item.salePrice,
              profit: (newQuantity * item.salePrice) - (newQuantity * item.purchasePrice)
            }
          : item
      )
    });
  }, [products, saleForm.currentSale, updateSaleForm, showWarning]);

  const decreaseQuantity = useCallback((productId: string) => {
    const currentItem = saleForm.currentSale.find(item => item.productId === productId);
    
    if (!currentItem) return;
    
    if (currentItem.quantity <= 1) {
      removeFromSale(productId);
      return;
    }
    
    const newQuantity = currentItem.quantity - 1;
    updateSaleForm({
      currentSale: saleForm.currentSale.map(item =>
        item.productId === productId
          ? {
              ...item,
              quantity: newQuantity,
              totalCost: newQuantity * item.purchasePrice,
              totalRevenue: newQuantity * item.salePrice,
              profit: (newQuantity * item.salePrice) - (newQuantity * item.purchasePrice)
            }
          : item
      )
    });
  }, [saleForm.currentSale, updateSaleForm, removeFromSale]);

  const handleDiscountChange = useCallback((value: string) => {
    const numeric = parseNumberInput(value);
    const finalValue = Math.max(0, Math.min(numeric, saleTotal.subtotal));
    const finalFormatted = formatNumberInput(finalValue.toString());
    
    updateSaleForm({
      discountDisplay: finalFormatted,
      discount: finalValue
    });
  }, [saleTotal.subtotal, updateSaleForm]);

  const setDiscountFromPercentage = useCallback((percentage: number) => {
    const value = saleTotal.subtotal * percentage;
    const formatted = formatNumberInput(value.toString());
    updateSaleForm({
      discountDisplay: formatted,
      discount: value
    });
  }, [saleTotal.subtotal, updateSaleForm]);

  const completeSale = useCallback(async () => {
    if (saleForm.currentSale.length === 0) {
      showWarning('Venta vacía', 'Debes agregar al menos un producto a la venta');
      return;
    }

    if (!customerState.selectedCustomer) {
      showWarning('Cliente requerido', 'Debes seleccionar un cliente para completar la venta');
      return;
    }

    const { subtotal, appliedDiscount, total, totalCost, totalProfit, profitMargin } = saleTotal;

    if (total <= 0) {
      showError('Total inválido', 'El total de la venta debe ser mayor a cero');
      return;
    }

    updateUIState({ isProcessing: true });
    try {
      const cleanItems = saleForm.currentSale.map(item => {
        const cleanItem: any = {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          salePrice: item.salePrice,
          totalCost: item.totalCost,
          totalRevenue: item.totalRevenue,
          profit: item.profit,
        };

        // Solo agregar campos opcionales si tienen valor
        if (item.referencia) cleanItem.referencia = item.referencia;
        if (item.category) cleanItem.category = item.category;
        if (item.imei) cleanItem.imei = item.imei;

        return cleanItem;
      });

      const saleData: any = {
        items: cleanItems,
        subtotal,
        discount: appliedDiscount,
        tax: 0,
        total,
        totalCost,
        totalProfit,
        profitMargin,
        paymentMethod: saleForm.paymentMethod,
        customerId: customerState.selectedCustomer.id,
        customerName: customerState.selectedCustomer.name,
      };

      // Agregar información de métodos de pago múltiples si aplica
      if (saleForm.useMultiplePayments && saleForm.paymentMethods.length > 0) {
        saleData.paymentMethods = saleForm.paymentMethods;
        saleData.useMultiplePayments = true;
        // El finalTotal incluye recargos por métodos de pago
        if (finalTotal !== total) {
          saleData.finalTotal = finalTotal;
          saleData.customerSurcharge = customerSurcharge;
        }
      }

      if (appUser) {
        saleData.salesPersonId = appUser.uid;
        saleData.salesPersonName = appUser.displayName || appUser.email;
      }

      // Agregar cortesías si existen
      if (saleForm.courtesyItems.length > 0) {
        saleData.courtesyItems = saleForm.courtesyItems;

        // Calcular totales de cortesías
        const courtesyTotalValue = saleForm.courtesyItems.reduce((sum, item) => sum + item.totalValue, 0);
        const courtesyTotalCost = saleForm.courtesyItems.reduce((sum, item) => sum + item.totalCost, 0);

        saleData.courtesyTotalValue = courtesyTotalValue;
        saleData.courtesyTotalCost = courtesyTotalCost;
        saleData.realTotalCost = totalCost + courtesyTotalCost;
        saleData.realProfit = totalProfit - courtesyTotalCost;
      }

      const saleId = await salesService.add(saleData);

      // Registrar cortesías en la colección de courtesies
      if (saleForm.courtesyItems.length > 0) {
        const courtesyPromises = saleForm.courtesyItems.map(async (courtesyItem) => {
          const courtesy: any = {
            saleId,
            salesPersonId: appUser?.uid || '',
            salesPersonName: appUser?.displayName || appUser?.email || '',
            item: courtesyItem,
          };

          // Solo agregar campos opcionales si tienen valor
          if (customerState.selectedCustomer?.id) courtesy.customerId = customerState.selectedCustomer.id;
          if (customerState.selectedCustomer?.name) courtesy.customerName = customerState.selectedCustomer.name;
          if (courtesyItem.reason) courtesy.reason = courtesyItem.reason;

          return courtesiesService.add(courtesy);
        });

        await Promise.all(courtesyPromises);
      }

      updateUIState({ lastSale: { ...saleData, id: saleId }, showInvoice: true });
      setSaleForm({
        currentSale: [],
        selectedProduct: '',
        quantity: 1,
        discount: 0,
        discountDisplay: '',
        paymentMethod: 'efectivo',
        paymentMethods: [],
        useMultiplePayments: false,
        courtesyItems: []
      });
      updateCustomerState({ 
        applyCredit: false, 
        selectedCustomer: null, 
        customerSearch: '' 
      });
      updateUIState({ productSearch: '', lastAddedItem: null });
      
      showSuccess(
        'Venta completada',
        `Venta por ${formatCurrency(total)} procesada exitosamente.`
      );

      // Invalidar caché de ventas para que se vean inmediatamente en Gestión de Ventas
      firebase.invalidateSales();
    } catch (error) {
      console.error('Error completo al procesar venta:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al procesar la venta';
      showError('Error al procesar venta', errorMessage);
    } finally {
      updateUIState({ isProcessing: false });
    }
  }, [saleForm, customerState, saleTotal, updateUIState, updateCustomerState, showWarning, showError, showSuccess, appUser]);

  // Usar los valores memoizados del saleTotal
  const { subtotal, appliedDiscount, total, finalTotal, customerSurcharge } = saleTotal;

  return (
    <div 
      ref={containerRef}
      className="bg-gray-50 p-4"
      style={{height: 'calc(100vh - 88px)', overflow: needsScroll ? 'auto' : 'hidden'}}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Ventas</h1>
          <p className="text-gray-600 mt-1">Procesa ventas y gestiona transacciones</p>
        </div>

        {/* Layout de dos columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          
          {/* COLUMNA IZQUIERDA (60%) - Formulario */}
          <div className="lg:col-span-3 space-y-3">
            
            {/* Campo Cliente */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg shadow-lg border border-gray-300 p-3">
              <div className="flex items-center mb-2">
                <User className="h-4 w-4 text-gray-500 mr-2" />
                <label className="text-base font-semibold text-gray-900">Cliente *</label>
              </div>
              
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre, teléfono o email..."
                  value={customerState.customerSearch}
                  onChange={e => updateCustomerState({ customerSearch: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                />
                
                {/* Dropdown de clientes */}
                {customerState.customerSearch && customerState.customerSearch !== (customerState.selectedCustomer?.name || '') && (
                  <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto mt-1">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-4 text-gray-500 text-sm">No hay clientes</div>
                    ) : (
                      filteredCustomers.map(customer => (
                        <button
                          key={customer.id}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            updateCustomerState({
                              selectedCustomer: customer,
                              customerSearch: customer.name,
                              applyCredit: false
                            });
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50"
                        >
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-gray-500">
                            {customer.phone && <span className="mr-3">Tel: {customer.phone}</span>}
                            {customer.email && <span className="mr-3">Email: {customer.email}</span>}
                            Saldo: {formatCurrency(customer.credit || 0)}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Cliente seleccionado */}
              {customerState.selectedCustomer && (
                <div className="mt-4 p-3 rounded-lg bg-white border border-gray-400 shadow-md">
                  <div className="font-medium text-gray-900">{customerState.selectedCustomer.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {customerState.selectedCustomer.phone && <span className="mr-3">Tel: {customerState.selectedCustomer.phone}</span>}
                    {customerState.selectedCustomer.email && <span>Email: {customerState.selectedCustomer.email}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Búsqueda de productos */}
            <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg shadow-lg border border-gray-300 p-3">
              {/* Input unificado para búsqueda y código de barras */}

              {
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  {uiState.productSearch && /^\d+$/.test(uiState.productSearch) && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 font-medium animate-pulse">
                      Presiona Enter ↵
                    </div>
                  )}
                  <input
                    ref={productInputRef}
                    type="text"
                    placeholder="Buscar producto o escanear código de barras (automático)..."
                    value={uiState.productSearch}
                    onChange={e => {
                      const value = e.target.value;
                      updateUIState({ productSearch: value, showProductDropdown: true });
                      handleAutoScan(value);
                    }}
                    onFocus={() => updateUIState({ showProductDropdown: true })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && uiState.productSearch.trim()) {
                        e.preventDefault(); // Prevenir comportamiento por defecto
                        const searchValue = uiState.productSearch.trim();
                        
                        if (/^\d+$/.test(searchValue)) {
                          // Es un código numérico (código de barras)
                          // Verificar si ya fue procesado automáticamente
                          if (autoProcessedRef.current === searchValue) {
                            // Ya procesado, solo limpiar
                            updateUIState({ productSearch: '' });
                            autoProcessedRef.current = '';
                          } else {
                            // Procesamiento manual
                            handleBarcodeSearch(searchValue);
                          }
                        } else {
                          // Es texto, agregar el primer producto filtrado
                          if (filteredProducts.length > 0) {
                            addProductToSale(filteredProducts[0].id, 1);
                            updateUIState({ productSearch: '', showProductDropdown: false });
                            showSuccess('Producto agregado', `${filteredProducts[0].name} agregado a la venta`);
                          }
                        }
                      }
                    }}
                    className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                  />
                  
                  {/* Dropdown de productos */}
                  {uiState.showProductDropdown && uiState.productSearch && (
                    <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto mt-1">
                      {filteredProducts.length === 0 ? (
                        <div className="p-4 text-gray-500 text-sm">
                          {/^\d+$/.test(uiState.productSearch) 
                            ? `No se encontró producto con código de barras: ${uiState.productSearch}`
                            : 'No hay productos'
                          }
                        </div>
                      ) : (
                        filteredProducts.map(product => (
                          <button
                            key={product.id}
                            type="button"
                            onMouseDown={() => {
                              addProductToSale(product.id, 1);
                              updateUIState({ productSearch: '', showProductDropdown: false });
                              showSuccess('Producto agregado', `${product.name} agregado a la venta`);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-blue-50"
                          >
                            <div className="font-medium">
                              {product.name}
                              {/^\d+$/.test(uiState.productSearch) && (
                                <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                  Código: {product.barcode}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {product.referencia && <span className="mr-3">Ref: {product.referencia}</span>}
                              {formatCurrency(product.salePrice)} • Stock: {formatNumber(product.stock)}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              }
              
              <div className="mt-2 text-xs text-gray-500">
                💡 Escanea códigos de barras (automático) o busca por nombre + Enter ↵
              </div>
            </div>

            {/* Productos en la venta */}
            <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-lg shadow-lg border border-slate-300 p-3">
              <div className="flex items-center mb-2">
                <ShoppingCart className="h-4 w-4 text-cyan-600 mr-2" />
                <h3 className="text-base font-semibold text-gray-900">
                  Productos en la venta ({saleForm.currentSale.length} tipos, {saleForm.currentSale.reduce((total, item) => total + item.quantity, 0)} unidades)
                </h3>
              </div>
              
              <div className="min-h-32 bg-white rounded-lg p-3 border border-gray-200">
                {saleForm.currentSale.length === 0 ? (
                  <div className="text-center text-gray-500 py-6">
                    No hay productos agregados
                  </div>
                ) : (
                  <div className="space-y-2">
                    {saleForm.currentSale.map(item => (
                      <div key={item.productId} className="flex items-center justify-between p-3 bg-gradient-to-r from-white to-gray-50 rounded-lg border border-gray-300 shadow-md">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{item.productName}</div>
                          <div className="text-sm text-gray-500">
                            {formatCurrency(item.salePrice)} por unidad
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {/* Quantity controls */}
                          <div className="flex items-center space-x-1 bg-white border border-gray-300 rounded-lg">
                            <button
                              onClick={() => decreaseQuantity(item.productId)}
                              className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-l-lg transition-colors"
                              title="Disminuir cantidad"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2 py-1 text-sm font-medium text-gray-900 min-w-[2rem] text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => increaseQuantity(item.productId)}
                              className="p-1 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-r-lg transition-colors"
                              title="Aumentar cantidad"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="font-semibold text-blue-600 min-w-[4rem] text-right">
                            {formatCurrency(item.totalRevenue)}
                          </span>
                          <button
                            onClick={() => removeFromSale(item.productId)}
                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors"
                            title="Eliminar producto"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cortesías */}
              {saleForm.courtesyItems.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-cyan-700 mb-2 flex items-center space-x-2">
                    <Gift className="h-4 w-4" />
                    <span>Cortesías ({saleForm.courtesyItems.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {saleForm.courtesyItems.map((courtesy: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gradient-to-r from-cyan-50 to-cyan-100 rounded-lg border border-cyan-300">
                        <div className="flex-1">
                          <div className="font-medium text-cyan-900">{courtesy.productName}</div>
                          <div className="text-xs text-cyan-600">
                            Valor: {formatCurrency(courtesy.normalPrice)} × {courtesy.quantity} = {formatCurrency(courtesy.totalValue)}
                          </div>
                          {courtesy.reason && (
                            <div className="text-xs text-cyan-500 italic mt-1">
                              {courtesy.reason}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveCourtesy(index)}
                          className="p-2 text-cyan-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar cortesía"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA DERECHA (40%) - Resumen de venta */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-br from-gray-100 to-slate-100 rounded-lg shadow-lg border border-gray-300 p-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Resumen de Venta</h3>
              
              {/* Subtotal */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-base font-semibold">{formatCurrency(subtotal)}</span>
              </div>

              {/* Descuento */}
              <div className="mb-4">
                <label className="block text-gray-600 mb-2">Descuento</label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={saleForm.discountDisplay}
                      onChange={(e) => handleDiscountChange(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-1 mt-2">
                  <button
                    onClick={() => setDiscountFromPercentage(0.05)}
                    className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                  >
                    5%
                  </button>
                  <button
                    onClick={() => setDiscountFromPercentage(0.10)}
                    className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200"
                  >
                    10%
                  </button>
                  <button
                    onClick={() => setDiscountFromPercentage(0.15)}
                    className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                  >
                    15%
                  </button>
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center mb-4 text-lg font-bold border-t border-gray-200 pt-3">
                <span>TOTAL</span>
                <span>{formatCurrency(total)}</span>
              </div>

              {/* Método de pago */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <Wallet className="h-4 w-4 text-gray-500 mr-2" />
                    <label className="block text-gray-600">Método de Pago</label>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={saleForm.useMultiplePayments}
                      onChange={(e) => {
                        updateSaleForm({
                          useMultiplePayments: e.target.checked,
                          paymentMethods: e.target.checked ? saleForm.paymentMethods : []
                        });
                      }}
                      disabled={uiState.isProcessing}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 mr-2"
                    />
                    <span className="text-sm text-gray-600">Pagos múltiples</span>
                  </label>
                </div>

                {!saleForm.useMultiplePayments ? (
                  // Método de pago único (modo tradicional)
                  <select
                    value={saleForm.paymentMethod}
                    onChange={(e) => updateSaleForm({ paymentMethod: e.target.value as any })}
                    disabled={uiState.isProcessing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="crédito">Crédito</option>
                  </select>
                ) : (
                  // Modo de pagos múltiples
                  <div className="space-y-3">
                    {/* Lista de pagos agregados */}
                    {saleForm.paymentMethods.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-700">Pagos agregados:</h4>
                        {saleForm.paymentMethods.map((payment, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <div className="text-sm font-medium">
                                {getPaymentMethodLabel(payment.method)}
                              </div>
                              <div className="text-xs text-gray-600">
                                {formatCurrency(payment.amount)}
                              </div>
                            </div>
                            <button
                              onClick={() => removePaymentMethod(index)}
                              disabled={uiState.isProcessing}
                              className="text-red-600 hover:text-red-800 p-1 disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm border-t pt-2">
                          <span>Total pagado:</span>
                          <span className="font-medium">{formatCurrency(totalPaidAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Restante por pagar:</span>
                          <span className={`font-medium ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(remainingAmount)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Agregar nuevo pago */}
                    {remainingAmount > 0 && (
                      <div className="border border-gray-200 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Agregar pago:</h4>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={saleForm.paymentMethod}
                              onChange={(e) => updateSaleForm({ paymentMethod: e.target.value as any })}
                              disabled={uiState.isProcessing}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm"
                            >
                              <option value="efectivo">Efectivo</option>
                              <option value="transferencia">Transferencia</option>
                              <option value="tarjeta">Tarjeta</option>
                              <option value="crédito">Crédito</option>
                            </select>
                            <button
                              onClick={() => {
                                if (remainingAmount > 0) {
                                  addPaymentMethod(saleForm.paymentMethod, remainingAmount);
                                }
                              }}
                              disabled={uiState.isProcessing || remainingAmount <= 0}
                              className="px-3 py-2 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              Todo
                            </button>
                          </div>
                          <div className="flex gap-3">
                            <input
                              type="text"
                              placeholder="Monto"
                              disabled={uiState.isProcessing}
                              className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                              onChange={(e) => {
                                const numeric = parseNumberInput(e.target.value);
                                const limitedValue = Math.min(numeric, remainingAmount);
                                e.target.value = formatNumberInput(limitedValue.toString());
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const amount = parseNumberInput(e.currentTarget.value);
                                  if (amount > 0 && amount <= remainingAmount) {
                                    addPaymentMethod(saleForm.paymentMethod, amount);
                                    e.currentTarget.value = '';
                                  }
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement;
                                const amount = parseNumberInput(input?.value || '0');
                                if (amount > 0 && amount <= remainingAmount) {
                                  addPaymentMethod(saleForm.paymentMethod, amount);
                                  if (input) input.value = '';
                                }
                              }}
                              disabled={uiState.isProcessing}
                              className="px-6 py-3 text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Agregar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botón añadir cortesía */}
              <button
                onClick={handleOpenCourtesyModal}
                disabled={uiState.isProcessing || !customerState.selectedCustomer}
                className="w-full bg-cyan-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-cyan-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mb-3"
              >
                <Gift className="h-5 w-5" />
                <span>Añadir Cortesía</span>
              </button>

              {/* Botón completar venta */}
              <button
                onClick={completeSale}
                disabled={
                  total <= 0 ||
                  uiState.isProcessing ||
                  !customerState.selectedCustomer ||
                  saleForm.currentSale.length === 0 ||
                  (saleForm.useMultiplePayments && (saleForm.paymentMethods.length === 0 || remainingAmount > 0.01))
                }
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-400 flex items-center justify-center space-x-2"
              >
                {uiState.isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5" />
                    <span>Completar Venta</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Modal de factura */}
      {uiState.lastSale && uiState.showInvoice && (
        <InvoiceModal sale={uiState.lastSale} onClose={() => updateUIState({ showInvoice: false })} />
      )}

      {/* Modal de cortesías */}
      {uiState.showCourtesyModal && (
        <CourtesyModal
          onClose={handleCloseCourtesyModal}
          onAdd={handleAddCourtesy}
        />
      )}

      {/* Botón flotante para imprimir */}
      {uiState.lastSale && !uiState.showInvoice && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
            onClick={() => updateUIState({ showInvoice: true })}
          >
            <Receipt className="h-5 w-5" />
            Imprimir factura
          </button>
        </div>
      )}
    </div>
  );
}