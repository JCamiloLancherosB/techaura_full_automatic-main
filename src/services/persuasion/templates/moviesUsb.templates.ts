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
    'Podemos ajustar capacidad y mantener lo esencial.',
    commonTemplates.riskReversal,
    commonTemplates.ctas.chooseCapacity
  ].join('\n'),
  quickReplies: ['1', '2'],
  meta: { strategy: 'objectionHandling' }
});

export const moviesUsbTemplates = {
  onboarding: (context: UserContext): TemplateConfig => {
    const isReturning = (context.history?.previousOrdersCount || 0) > 0;
    if (isReturning) {
      const pref = context.preferences?.genres?.slice(0, 2).join(' y ');
      return {
        text: [
          `🍿 ¡Hola${context.firstName ? ` ${context.firstName}` : ''}!`,
          pref ? `Sigo con ${pref} como base.` : 'Tengo tus sagas guardadas.',
          commonTemplates.ctas.continueWithPrefs(pref || 'tu selección')
        ].join('\n'),
        quickReplies: ['Sí', 'No'],
        meta: { strategy: 'clarity' }
      };
    }
    return {
      text: [
        '🍿 USB de películas y series HD/4K.',
        'Incluye sagas completas y series top.',
        commonTemplates.socialProof[0],
        '¿Qué géneros o títulos te interesan?'
      ].join('\n'),
      quickReplies: ['Ver precios', 'Personalizar'],
      meta: { strategy: 'socialProof' }
    };
  },
  preferences: (context: UserContext): TemplateConfig => ({
    text: [
      `✅ Selección ${personalize(context)} registrada.`,
      commonTemplates.riskReversal,
      commonTemplates.ctas.showPrices
    ].join('\n'),
    quickReplies: ['OK', 'Cambiar'],
    meta: { strategy: 'riskReversal' }
  }),
  capacityChoice: (context: UserContext): TemplateConfig => ({
    text: [
      `Recomendación rápida ${personalize(context)}:`,
      '1) 128GB (~120 películas) ⭐',
      '2) 256GB (~250 películas)',
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
      '¿Seguimos con tu USB de películas/series?',
      commonTemplates.socialProof[1],
      'Responde "OK" y te muestro opciones.'
    ].join('\n'),
    quickReplies: ['OK', 'Ver precios'],
    meta: { strategy: 'followUp' }
  })
};
