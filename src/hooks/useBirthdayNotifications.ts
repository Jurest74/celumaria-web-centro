import { useEffect, useState } from 'react';
import { useAppSelector } from './useAppSelector';
import { selectCustomers } from '../store/selectors';
import { Customer } from '../types';
import { bogotaDateKey, BOGOTA_TIME_ZONE } from '../utils/dateUtils';

interface BirthdayCustomer {
  customer: Customer;
  daysUntilBirthday: number;
  birthdayDate: string;
}

const BOGOTA_OFFSET = '-05:00';

export function useBirthdayNotifications() {
  const customers = useAppSelector(selectCustomers);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<BirthdayCustomer[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const getUpcomingBirthdays = (customers: Customer[], daysAhead = 5): BirthdayCustomer[] => {
    // "Hoy" en Colombia (no del navegador)
    const todayKey = bogotaDateKey();
    const [tYearStr] = todayKey.split('-');
    const currentYear = parseInt(tYearStr, 10);
    // Mediodía Bogotá del día actual, como instante UTC absoluto
    const todayMs = new Date(`${todayKey}T12:00:00.000${BOGOTA_OFFSET}`).getTime();
    const upcomingBirthdayCustomers: BirthdayCustomer[] = [];

    customers.forEach(customer => {
      if (!customer.birthDate) return;

      try {
        // Parsear la fecha de cumpleaños (formato YYYY-MM-DD)
        const birthDateParts = customer.birthDate.split('-');
        if (birthDateParts.length !== 3) return;

        const birthMonth = birthDateParts[1].padStart(2, '0');
        const birthDay = birthDateParts[2].padStart(2, '0');

        // Cumpleaños de este año en Bogotá (mediodía → instante UTC bien definido)
        let birthdayMs = new Date(`${currentYear}-${birthMonth}-${birthDay}T12:00:00.000${BOGOTA_OFFSET}`).getTime();
        if (birthdayMs < todayMs) {
          birthdayMs = new Date(`${currentYear + 1}-${birthMonth}-${birthDay}T12:00:00.000${BOGOTA_OFFSET}`).getTime();
        }

        const daysUntilBirthday = Math.round((birthdayMs - todayMs) / 86_400_000);

        // Solo incluir si el cumpleaños es en los próximos 'daysAhead' días
        if (daysUntilBirthday >= 0 && daysUntilBirthday <= daysAhead) {
          const birthdayDate = new Date(birthdayMs).toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            timeZone: BOGOTA_TIME_ZONE,
          });

          upcomingBirthdayCustomers.push({
            customer,
            daysUntilBirthday,
            birthdayDate,
          });
        }
      } catch (error) {
        console.warn(`Error parsing birth date for customer ${customer.name}:`, error);
      }
    });

    // Ordenar por días hasta el cumpleaños
    return upcomingBirthdayCustomers.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);
  };

  useEffect(() => {
    if (customers && customers.length > 0) {
      const upcoming = getUpcomingBirthdays(customers, 5);
      setUpcomingBirthdays(upcoming);
      setIsLoaded(true);
    } else {
      setUpcomingBirthdays([]);
      // Solo marcar como loaded si ya se intentó cargar los clientes
      if (customers !== undefined) {
        setIsLoaded(true);
      }
    }
  }, [customers]);

  return {
    upcomingBirthdays,
    hasUpcomingBirthdays: upcomingBirthdays.length > 0,
    birthdayCount: upcomingBirthdays.length,
    isLoaded,
  };
}
