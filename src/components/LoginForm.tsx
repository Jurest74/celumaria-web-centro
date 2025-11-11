import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';


export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);
  const { login, isLoading } = useAuth();

  // Mostrar mensaje de expiración de sesión si existe en localStorage
  React.useEffect(() => {
    const msg = localStorage.getItem('sessionExpiredMsg');
    if (msg) {
      setSessionExpiredMsg(msg);
    }
  }, []);

  // Limpiar el mensaje de expiración solo cuando se muestre en pantalla
  React.useEffect(() => {
    if (sessionExpiredMsg) {
      localStorage.removeItem('sessionExpiredMsg');
      localStorage.removeItem('lastLoginDate'); // Evita ciclo infinito de logout
    }
  }, [sessionExpiredMsg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // setError(''); // No limpiar aquí

    if (!email || !password) {
      setError('Por favor ingresa email y contraseña');
      return;
    }

    const loginError = await login(email, password);
    if (loginError) {
      setError(loginError);
      alert(loginError);
    } else {
      // Limpiar mensaje de expiración de sesión si el login fue exitoso
      setSessionExpiredMsg(null);
    }
  };

  // Limpiar error solo cuando el usuario edita los campos
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError('');
  };
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="w-56 h-32 mx-auto mb-2 flex items-center justify-center overflow-hidden">
            <img
              src="/celumaria.jpeg"
              alt="Celu Maria"
              className="w-56 h-56 object-cover object-top"
              style={{ background: '#fff' }}
            />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{color: '#90c5e7'}}>Sede Centro</h1>
          <p className="text-gray-600 text-base">Sistema de Control de Inventario y Ventas</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Iniciar Sesión</h2>
            <p className="text-gray-600">Accede a tu cuenta para continuar</p>
            {sessionExpiredMsg && (
              <div className="mt-4 mb-2 p-3 bg-yellow-100 border border-yellow-300 rounded text-center">
                <span className="text-yellow-800 text-base font-semibold">{sessionExpiredMsg}</span>
              </div>
            )}
            {error && (
              <div className="mt-4 mb-2 p-3 bg-red-100 border border-red-300 rounded text-center">
                <span className="text-red-700 text-base font-semibold">{error}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                  placeholder="Ingresa tu email"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
                  placeholder="Ingresa tu contraseña"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 px-4 rounded-lg font-medium hover:opacity-90 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              style={{backgroundColor: '#90c5e7'}}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Iniciando sesión...
                </div>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            © 2025 Celu Maria. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}