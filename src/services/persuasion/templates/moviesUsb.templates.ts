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
        '🍿 *USB de Películas y Series HD/4K*',
        '',
        '🎬 *Contenido que puedes personalizar:*',
        '• Sagas completas: Marvel, Star Wars, Harry Potter, LOTR',
        '• Series top: Breaking Bad, Game of Thrones, The Office',
        '• Géneros: Acción, Comedia, Drama, Terror, Romance, Animadas',
        '',
        commonTemplates.socialProof[0],
        '',
        '¿Qué géneros o películas te gustan? 👇',
        '_(También puedes escribir "PRECIOS" para ver opciones)_'
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
      '¡Hola! 👋 ¿Seguimos con tu USB de películas/series?',
      '',
      '💰 *Opciones disponibles:*',
      '• 64GB (~55 películas) - $119.900',
      '• 128GB (~120 películas) - $159.900 ⭐',
      '• 256GB (~250 películas) - $229.900',
      '',
      '🚚 Envío GRATIS + Pago contraentrega',
      commonTemplates.socialProof[1],
      '',
      'Elige capacidad (1=64GB, 2=128GB, 3=256GB) o escríbenos qué géneros te gustan 👇'
    ].join('\n'),
    quickReplies: ['1', '2', '3', 'Ver más'],
    meta: { strategy: 'followUp' }
  })
};
