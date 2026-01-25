import type { UserContext } from '../../../types/UserContext';

export const commonTemplates = {
  ctas: {
    chooseCapacity: 'Elige una opción con el número para avanzar.',
    confirmSetup: '¿Confirmo así? (Sí/No)',
    continueWithPrefs: (pref: string) => `¿Seguimos con ${pref}? (Sí/No)`,
    askPreferences: 'Dime 2 géneros o artistas para personalizar.',
    showPrices: '¿Quieres ver capacidades? Responde "OK".'
  },
  socialProof: [
    '🌟 +900 clientes este mes eligieron USB personalizadas.',
    '⭐ 4.9/5 reseñas verificadas.'
  ],
  urgency: (context: UserContext) =>
    context.signals?.urgency === 'high'
      ? '⏱️ Si lo necesitas para hoy/mañana, confirmemos ahora.'
      : '',
  riskReversal: '🛡️ Ajustamos el contenido si algo no te gusta.'
};
