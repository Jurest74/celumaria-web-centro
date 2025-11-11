import { useEffect, useState } from 'react';
import { Gift, X } from 'lucide-react';
import { useBirthdayNotifications } from '../hooks/useBirthdayNotifications';

interface BirthdayNotificationProps {
  onDismiss?: () => void;
}

export function BirthdayNotification({ onDismiss }: BirthdayNotificationProps) {
  const { upcomingBirthdays, hasUpcomingBirthdays, birthdayCount, isLoaded } = useBirthdayNotifications();
  const [isVisible, setIsVisible] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    // Solo proceder cuando los datos estén cargados
    if (isLoaded) {
      if (hasUpcomingBirthdays) {
        // Solo mostrar si hay cumpleaños próximos
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 500);

        return () => clearTimeout(timer);
      } else {
        // Si no hay cumpleaños próximos, llamar onDismiss para ocultar desde el padre
        if (onDismiss) {
          onDismiss();
        }
      }
    }
  }, [isLoaded, hasUpcomingBirthdays, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  const getNotificationText = () => {
    // Calcular cuántos cumplen hoy, mañana, etc.
    const todayCount = upcomingBirthdays.filter(b => b.daysUntilBirthday === 0).length;
    const tomorrowCount = upcomingBirthdays.filter(b => b.daysUntilBirthday === 1).length;
    const laterCount = birthdayCount - todayCount - tomorrowCount;
    
    // Debug temporal
    console.log('Debug cumpleaños:', {
      birthdayCount,
      todayCount,
      tomorrowCount,
      laterCount,
      upcomingBirthdays: upcomingBirthdays.map(b => ({ name: b.customer.name, days: b.daysUntilBirthday }))
    });
    
    // Priorizar mostrar los más urgentes
    if (todayCount > 0) {
      if (todayCount === birthdayCount) {
        // Solo hay cumpleaños hoy
        return `${todayCount} cliente${todayCount > 1 ? 's' : ''} cumple${todayCount === 1 ? '' : 'n'} años hoy`;
      } else {
        // Hay cumpleaños hoy + otros días
        return `${todayCount} cliente${todayCount > 1 ? 's' : ''} cumple${todayCount === 1 ? '' : 'n'} años hoy (+${birthdayCount - todayCount} más)`;
      }
    }
    
    if (tomorrowCount > 0) {
      if (tomorrowCount === birthdayCount) {
        // Solo hay cumpleaños mañana
        return `${tomorrowCount} cliente${tomorrowCount > 1 ? 's' : ''} cumple${tomorrowCount === 1 ? '' : 'n'} años mañana`;
      } else {
        // Hay cumpleaños mañana + otros días
        return `${tomorrowCount} cliente${tomorrowCount > 1 ? 's' : ''} cumple${tomorrowCount === 1 ? '' : 'n'} años mañana (+${birthdayCount - tomorrowCount} más)`;
      }
    }
    
    // Solo hay cumpleaños en días posteriores
    return `${birthdayCount} cliente${birthdayCount > 1 ? 's' : ''} cumple${birthdayCount === 1 ? '' : 'n'} años pronto`;
  };

  // Agrupar cumpleaños por días para mejor visualización
  const groupedBirthdays = upcomingBirthdays.reduce((acc, birthday) => {
    const key = birthday.daysUntilBirthday;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(birthday);
    return acc;
  }, {} as Record<number, typeof upcomingBirthdays>);

  const getDayGroupTitle = (days: number) => {
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Mañana';
    return `En ${days} días`;
  };

  if (!hasUpcomingBirthdays || !isVisible) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div className="relative">
        {/* Notificación principal */}
        <div
          className="bg-gradient-to-r from-purple-500 to-[#90c5e7] text-white px-4 py-3 rounded-lg shadow-lg cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-105 flex items-center space-x-3 min-w-[280px]"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="flex items-center space-x-2 flex-1">
            <Gift className="h-5 w-5 animate-bounce" />
            <div>
              <p className="font-medium text-sm">{getNotificationText()}</p>
              <p className="text-xs opacity-90">Pasa el cursor para ver detalles</p>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
            title="Cerrar notificación"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tooltip con detalles */}
        {showTooltip && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-10 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Gift className="h-5 w-5 text-purple-500" />
                <h3 className="font-semibold text-gray-800">Próximos Cumpleaños</h3>
              </div>
              {birthdayCount > 5 && (
                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full font-medium">
                  {birthdayCount} total
                </span>
              )}
            </div>
            
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {Object.entries(groupedBirthdays)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([days, birthdays]) => (
                <div key={days} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">
                      {getDayGroupTitle(Number(days))}
                    </h4>
                    <span className="text-xs text-gray-500">
                      ({birthdays.length} cliente{birthdays.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  
                  <div className="space-y-1 ml-2">
                    {birthdays.slice(0, 8).map((birthday) => (
                      <div
                        key={birthday.customer.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm truncate">
                            {birthday.customer.name}
                          </p>
                          <p className="text-xs text-gray-600">
                            {birthday.birthdayDate}
                          </p>
                        </div>
                        
                        <div className="flex items-center space-x-1">
                          {birthday.daysUntilBirthday === 0 && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                              Hoy
                            </span>
                          )}
                          {birthday.daysUntilBirthday === 1 && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium">
                              Mañana
                            </span>
                          )}
                          {birthday.daysUntilBirthday > 1 && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                              {birthday.daysUntilBirthday}d
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {birthdays.length > 8 && (
                      <div className="p-2 bg-gray-100 rounded-md text-center">
                        <p className="text-xs text-gray-600">
                          +{birthdays.length - 8} más en este día
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  💡 Considera enviar felicitaciones
                </p>
                {birthdayCount > 10 && (
                  <p className="text-xs font-medium text-purple-600">
                    ¡Temporada alta de cumpleaños! 🎉
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
