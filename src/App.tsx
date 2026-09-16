import { useState, useEffect, lazy, Suspense } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './store';
import { AuthProvider } from './contexts/AuthContext';
import { FirebaseProvider } from './contexts/FirebaseContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { PrivateRoute } from './components/PrivateRoute';
import { ProtectedComponent } from './components/ProtectedComponent';
import { Layout } from './components/Layout';
import { TechnicianLiquidationComponent } from './components/TechnicianLiquidation';
import { BirthdayNotification } from './components/BirthdayNotification';
import { useNavigationData } from './hooks/useOnDemandData';
import { useAuth } from './contexts/AuthContext';

// Cada pantalla se descarga cuando se entra a ella. Antes todas se
// importaban de forma estatica y el navegador bajaba el sistema completo
// —incluida la libreria de graficas, que solo usa Reportes— para mostrar
// el login.
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = lazy(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const Categories = lazy(() => import('./components/Categories').then(m => ({ default: m.Categories })));
const Purchases = lazy(() => import('./components/Purchases').then(m => ({ default: m.Purchases })));
const Sales = lazy(() => import('./components/Sales').then(m => ({ default: m.Sales })));
const SalesHistory = lazy(() => import('./components/SalesHistory').then(m => ({ default: m.SalesHistory })));
const TechnicalServiceHistory = lazy(() => import('./components/TechnicalServiceHistory').then(m => ({ default: m.TechnicalServiceHistory })));
const PurchasesHistory = lazy(() => import('./components/PurchasesHistory').then(m => ({ default: m.PurchasesHistory })));
const Customers = lazy(() => import('./components/Customers').then(m => ({ default: m.Customers })));
const Layaway = lazy(() => import('./components/Layaway').then(m => ({ default: m.Layaway })));
const TechnicalService = lazy(() => import('./components/TechnicalService').then(m => ({ default: m.TechnicalService })));
const Reports = lazy(() => import('./components/Reports').then(m => ({ default: m.Reports })));
const UserManagement = lazy(() => import('./components/UserManagement').then(m => ({ default: m.UserManagement })));
const TechnicianManagement = lazy(() => import('./components/TechnicianManagement').then(m => ({ default: m.TechnicianManagement })));
const MyDailySales = lazy(() => import('./components/MyDailySales').then(m => ({ default: m.MyDailySales })));
const Courtesies = lazy(() => import('./components/Courtesies').then(m => ({ default: m.Courtesies })));


function AppContent() {
  const [currentView, setCurrentView] = useState('dashboard');
  const { showBirthdayNotification, dismissBirthdayNotification } = useAuth();
  const [localShowNotification, setLocalShowNotification] = useState(false);
  
  useNavigationData(currentView);

  // Sincronizar con el estado del AuthContext
  useEffect(() => {
    if (showBirthdayNotification) {
      setLocalShowNotification(true);
    }
  }, [showBirthdayNotification]);

  const handleDismissNotification = () => {
    setLocalShowNotification(false);
    dismissBirthdayNotification();
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'inventory':
        return (
          <ProtectedComponent permission="inventory">
            <Inventory />
          </ProtectedComponent>
        );
      case 'categories':
        return (
          <ProtectedComponent permission="categories">
            <Categories />
          </ProtectedComponent>
        );
      case 'purchases':
        return (
          <ProtectedComponent permission="purchases">
            <Purchases />
          </ProtectedComponent>
        );
      case 'sales':
        return (
          <ProtectedComponent permission="sales">
            <Sales />
          </ProtectedComponent>
        );
      case 'sales-history':
        return (
          <ProtectedComponent permission="salesHistory">
            <SalesHistory />
          </ProtectedComponent>
        );
      case 'my-daily-sales':
        return (
          <ProtectedComponent permission="myDailySales">
            <MyDailySales />
          </ProtectedComponent>
        );
      case 'purchases-history':
        return (
          <ProtectedComponent permission="purchasesHistory">
            <PurchasesHistory />
          </ProtectedComponent>
        );
      case 'customers':
        return (
          <ProtectedComponent permission="customers">
            <Customers />
          </ProtectedComponent>
        );
      case 'courtesies':
        return (
          <ProtectedComponent permission="courtesies">
            <Courtesies />
          </ProtectedComponent>
        );
      case 'layaway':
        return (
          <ProtectedComponent permission="layaway">
            <Layaway />
          </ProtectedComponent>
        );
      case 'technical-service':
        return (
          <ProtectedComponent permission="technicalService">
            <TechnicalService />
          </ProtectedComponent>
        );
      case 'technical-service-center':
        return (
          <ProtectedComponent permission="technicalServiceCenter">
            <TechnicalServiceHistory />
          </ProtectedComponent>
        );
      case 'reports':
        return (
          <ProtectedComponent permission="reports">
            <Reports />
          </ProtectedComponent>
        );
      case 'user-management':
        return (
          <ProtectedComponent permission="userManagement">
            <UserManagement />
          </ProtectedComponent>
        );
      case 'technician-management':
        return (
          <ProtectedComponent permission="technicianManagement">
            <TechnicianManagement />
          </ProtectedComponent>
        );
      case 'technician-liquidation':
        return (
          <ProtectedComponent permission="technicianLiquidation">
            <TechnicianLiquidationComponent />
          </ProtectedComponent>
        );
      default:
        return (
          <ProtectedComponent permission="dashboard">
            <Dashboard />
          </ProtectedComponent>
        );
    }
  };

  return (
    <>
      <Layout currentView={currentView} onViewChange={setCurrentView}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              Cargando…
            </div>
          }
        >
          {renderCurrentView()}
        </Suspense>
      </Layout>
      
      {/* Notificación de cumpleaños */}
      {localShowNotification && (
        <BirthdayNotification onDismiss={handleDismissNotification} />
      )}
    </>
  );
}

function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#90c5e7] mx-auto mb-4"></div>
            <p className="text-gray-600">Inicializando aplicación...</p>
          </div>
        </div>
      } persistor={persistor}>
        <AuthProvider>
          <PrivateRoute>
            <FirebaseProvider>
              <NotificationProvider>
                <AppContent />
              </NotificationProvider>
            </FirebaseProvider>
          </PrivateRoute>
        </AuthProvider>
      </PersistGate>
    </Provider>
  );
}

export default App;