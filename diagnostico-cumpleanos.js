// Script de diagnóstico para cumpleaños
// Ejecutar en la consola del navegador para debuggear

console.log('=== DIAGNÓSTICO DE CUMPLEAÑOS ===');

// 1. Verificar si hay clientes en el store
const state = window.__REDUX_DEVTOOLS_EXTENSION__ ? 
  window.__REDUX_DEVTOOLS_EXTENSION__.getState() : 
  console.log('Redux DevTools no disponible');

if (state) {
  const customers = state.firebase?.customers?.items || [];
  console.log('📋 Total clientes:', customers.length);
  
  // 2. Mostrar clientes con fechas de cumpleaños
  const customersWithBirthdays = customers.filter(c => c.birthDate);
  console.log('🎂 Clientes con fecha de cumpleaños:', customersWithBirthdays.length);
  
  customersWithBirthdays.forEach(customer => {
    console.log(`- ${customer.name}: ${customer.birthDate}`);
  });
  
  // 3. Calcular cumpleaños próximos (mismo algoritmo del hook)
  const today = new Date();
  const currentYear = today.getFullYear();
  const upcomingBirthdays = [];
  
  customersWithBirthdays.forEach(customer => {
    try {
      const birthDateParts = customer.birthDate.split('-');
      if (birthDateParts.length !== 3) return;
      
      const birthMonth = parseInt(birthDateParts[1], 10) - 1;
      const birthDay = parseInt(birthDateParts[2], 10);
      
      let birthdayThisYear = new Date(currentYear, birthMonth, birthDay);
      
      if (birthdayThisYear < today) {
        birthdayThisYear = new Date(currentYear + 1, birthMonth, birthDay);
      }
      
      const timeDifference = birthdayThisYear.getTime() - today.getTime();
      const daysUntilBirthday = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
      
      if (daysUntilBirthday >= 0 && daysUntilBirthday <= 5) {
        upcomingBirthdays.push({
          name: customer.name,
          birthDate: customer.birthDate,
          daysUntil: daysUntilBirthday,
          calculatedDate: birthdayThisYear.toLocaleDateString('es-CO')
        });
      }
    } catch (error) {
      console.error(`Error procesando cumpleaños de ${customer.name}:`, error);
    }
  });
  
  console.log('🎉 Cumpleaños próximos (próximos 5 días):', upcomingBirthdays);
  
  // 4. Verificar localStorage (nuevo sistema de conteo diario)
  const today_str = new Date().toISOString().split('T')[0];
  const storageKey = `birthdayNotificationCount_${today_str}`;
  const currentCount = parseInt(localStorage.getItem(storageKey) || '0', 10);
  console.log('📅 Fecha de hoy:', today_str);
  console.log('� Notificaciones mostradas hoy:', currentCount, '/ 2');
  console.log('✅ Puede mostrar notificación:', currentCount < 2 && upcomingBirthdays.length > 0);
  
} else {
  console.log('❌ No se puede acceder al estado de Redux');
}

// 5. Función helper para testear fechas
window.testBirthday = function(dateString) {
  console.log(`\n=== TESTING DATE: ${dateString} ===`);
  
  const today = new Date();
  const currentYear = today.getFullYear();
  
  try {
    const birthDateParts = dateString.split('-');
    const birthMonth = parseInt(birthDateParts[1], 10) - 1;
    const birthDay = parseInt(birthDateParts[2], 10);
    
    let birthdayThisYear = new Date(currentYear, birthMonth, birthDay);
    
    console.log('Cumpleaños este año:', birthdayThisYear);
    console.log('Fecha actual:', today);
    
    if (birthdayThisYear < today) {
      birthdayThisYear = new Date(currentYear + 1, birthMonth, birthDay);
      console.log('Cumpleaños siguiente año:', birthdayThisYear);
    }
    
    const timeDifference = birthdayThisYear.getTime() - today.getTime();
    const daysUntilBirthday = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
    
    console.log('Días hasta cumpleaños:', daysUntilBirthday);
    console.log('Está en rango de 5 días:', daysUntilBirthday >= 0 && daysUntilBirthday <= 5);
    
  } catch (error) {
    console.error('Error:', error);
  }
};

console.log('\n💡 Usa testBirthday("YYYY-MM-DD") para probar una fecha específica');
console.log('💡 Ejemplo: testBirthday("1990-07-20")');

// 6. Funciones para gestionar el nuevo sistema de conteo
window.resetTodayBirthdayCount = function() {
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `birthdayNotificationCount_${today}`;
  localStorage.removeItem(storageKey);
  console.log(`✅ Se eliminó el contador de notificaciones para hoy (${today})`);
  console.log('💡 Ahora recarga la página o vuelve a iniciar sesión para probar');
};

window.checkBirthdayCount = function() {
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `birthdayNotificationCount_${today}`;
  const currentCount = parseInt(localStorage.getItem(storageKey) || '0', 10);
  console.log(`📊 Notificaciones mostradas hoy (${today}): ${currentCount}/2`);
  return currentCount;
};

console.log('💡 Usa resetTodayBirthdayCount() para resetear el contador del día');
console.log('💡 Usa checkBirthdayCount() para ver cuántas notificaciones se han mostrado hoy');
console.log('💡 La notificación se mostrará máximo 2 veces por día por usuario');
