import type { UserContext } from '../../../types/UserContext';
import { commonTemplates } from './common.templates';

type TemplateConfig = {
  text: string;
  quickReplies?: string[];
  meta?: { strategy: string };
};

const personalize = (context: UserContext) => {
  const genre = context.preferences?.genres?.[0];
  return genre ? `de ${genre}` : 'a tu gusto';
};

const objection = (_context: UserContext): TemplateConfig => ({
  text: [
    'Lo entiendo. Podemos ajustar capacidad para cuidar presupuesto.',
    commonTemplates.riskReversal,
    commonTemplates.ctas.chooseCapacity
  ].join('\n'),
  quickReplies: ['1', '2'],
  meta: { strategy: 'objectionHandling' }
});

export const musicUsbTemplates = {
  onboarding: (context: UserContext): TemplateConfig => {
    const isReturning = (context.history?.previousOrdersCount || 0) > 0;
    if (isReturning) {
      const pref = context.preferences?.genres?.slice(0, 2).join(' y ');
      return {
        text: [
          `🎵 ¡Qué gusto tenerte de vuelta${context.firstName ? `, ${context.firstName}` : ''}!`,
          pref ? `Tengo guardado ${pref}.` : 'Tengo tus gustos guardados.',
          commonTemplates.ctas.continueWithPrefs(pref || 'tus preferencias')
        ].join('\n'),
        quickReplies: ['Sí', 'No'],
        meta: { strategy: 'clarity' }
      };
    }

    return {
      text: [
        '🎵 USB de música personalizada.',
        'Incluye miles de canciones organizadas y listas para usar.',
        `${commonTemplates.socialProof[0]}`,
        '¿Qué géneros o artistas te gustan?'
      ].join('\n'),
      quickReplies: ['Ver precios', 'Personalizar'],
      meta: { strategy: 'socialProof' }
    };
  },
  preferences: (context: UserContext): TemplateConfig => ({
    text: [
      `✅ Selección ${personalize(context)} lista.`,
      commonTemplates.riskReversal,
      commonTemplates.ctas.showPrices
    ].join('\n'),
    quickReplies: ['OK', 'Cambiar'],
    meta: { strategy: 'riskReversal' }
  }),
  capacityChoice: (context: UserContext): TemplateConfig => ({
    text: [
      `Te recomiendo 2 opciones según ${personalize(context)}:`,
      '1) 32GB (5.000 canciones)',
      '2) 64GB (10.000 canciones) ⭐',
      commonTemplates.ctas.chooseCapacity
    ].join('\n'),
    quickReplies: ['1', '2'],
    meta: { strategy: 'choiceArchitecture' }
  }),
  confirmation: (context: UserContext): TemplateConfig => ({
    text: [
      `Resumen: USB ${personalize(context)}${context.cart?.capacity ? `, ${context.cart.capacity}` : ''}.`,
      context.cart?.priceQuoted ? `Precio: $${context.cart.priceQuoted.toLocaleString('es-CO')}.` : '',
      commonTemplates.ctas.confirmSetup
    ].filter(Boolean).join('\n'),
    quickReplies: ['Sí', 'No'],
    meta: { strategy: 'clarity' }
  }),
  objection,
  followUp: (_context: UserContext): TemplateConfig => ({
    text: [
      '¿Seguimos con tu USB de música?',
      commonTemplates.socialProof[1],
      commonTemplates.ctas.askPreferences
    ].join('\n'),
    quickReplies: ['Sí', 'Ver precios'],
    meta: { strategy: 'followUp' }
  })
};
