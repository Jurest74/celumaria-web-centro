import { useEffect, useState } from 'react';
import { useAppSelector } from './useAppSelector';
import { selectCustomers } from '../store/selectors';
import { Customer } from '../types';

interface BirthdayCustomer {
  customer: Customer;
  daysUntilBirthday: number;
  birthdayDate: string;
}

export function useBirthdayNotifications() {
  const customers = useAppSelector(selectCustomers);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<BirthdayCustomer[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const getUpcomingBirthdays = (customers: Customer[], daysAhead = 5): BirthdayCustomer[] => {
    // Crear fecha de hoy sin hora para comparaciones correctas
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    const upcomingBirthdayCustomers: BirthdayCustomer[] = [];

    customers.forEach(customer => {
      if (!customer.birthDate) return;

      try {
        // Parsear la fecha de cumpleaños (formato YYYY-MM-DD)
        const birthDateParts = customer.birthDate.split('-');
        if (birthDateParts.length !== 3) return;

        const birthMonth = parseInt(birthDateParts[1], 10) - 1; // Mes en JavaScript es 0-indexed
        const birthDay = parseInt(birthDateParts[2], 10);

        // Crear fecha de cumpleaños para este año sin hora
        let birthdayThisYear = new Date(currentYear, birthMonth, birthDay);
        birthdayThisYear.setHours(0, 0, 0, 0);
        
        // Si el cumpleaños ya pasó este año, usar el próximo año
        if (birthdayThisYear < today) {
          birthdayThisYear = new Date(currentYear + 1, birthMonth, birthDay);
          birthdayThisYear.setHours(0, 0, 0, 0);
        }

        // Calcular días hasta el cumpleaños
        const timeDifference = birthdayThisYear.getTime() - today.getTime();
        const daysUntilBirthday = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

        // Debug temporal para verificar cálculos
        console.log(`Cliente: ${customer.name}, Fecha nacimiento: ${customer.birthDate}, Días hasta cumpleaños: ${daysUntilBirthday}`);

        // Solo incluir si el cumpleaños es en los próximos 'daysAhead' días
        if (daysUntilBirthday >= 0 && daysUntilBirthday <= daysAhead) {
          const birthdayDate = birthdayThisYear.toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long'
          });

          upcomingBirthdayCustomers.push({
            customer,
            daysUntilBirthday,
            birthdayDate
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
    isLoaded
  };
}
