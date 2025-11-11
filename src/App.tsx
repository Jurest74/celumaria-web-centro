import { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './store';
import { AuthProvider } from './contexts/AuthContext';
import { FirebaseProvider } from './contexts/FirebaseContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { PrivateRoute } from './components/PrivateRoute';
import { ProtectedComponent } from './components/ProtectedComponent';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Categories } from './components/Categories';
import { Purchases } from './components/Purchases';
import { Sales } from './components/Sales';
import { SalesHistory } from './components/SalesHistory';
import { TechnicalServiceHistory } from './components/TechnicalServiceHistory';
import { PurchasesHistory } from './components/PurchasesHistory';
import { Customers } from './components/Customers';
import { Layaway } from './components/Layaway';
import { TechnicalService } from './components/TechnicalService';
import { Reports } from './components/Reports';
import { UserManagement } from './components/UserManagement';
import { TechnicianManagement } from './components/TechnicianManagement';
import { TechnicianLiquidationComponent } from './components/TechnicianLiquidation';
import { MyDailySales } from './components/MyDailySales';
import { Courtesies } from './components/Courtesies';
import { BirthdayNotification } from './components/BirthdayNotification';
import { useNavigationData } from './hooks/useOnDemandData';
import { useAuth } from './contexts/AuthContext';

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
        {renderCurrentView()}
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