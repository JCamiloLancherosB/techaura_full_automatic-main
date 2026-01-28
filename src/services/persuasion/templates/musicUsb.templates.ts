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
        '🎵 *USB de Música Personalizada*',
        '',
        '🎶 *Contenido que puedes elegir:*',
        '• Géneros: Salsa, Vallenato, Reggaetón, Rock, Baladas, Cumbia',
        '• Artistas destacados: Bad Bunny, Marc Anthony, Carlos Vives, Queen',
        '• Incluye clásicos, éxitos actuales y más',
        '',
        `${commonTemplates.socialProof[0]}`,
        '',
        '¿Qué géneros o artistas te gustan? 👇',
        '_(También puedes escribir "PRECIOS" para ver opciones)_'
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
      '¡Hola! 👋 ¿Seguimos con tu USB de música?',
      '',
      '💰 *Opciones disponibles:*',
      '• 8GB (1,400 canciones) - $54.900',
      '• 32GB (5,000 canciones) - $84.900 ⭐',
      '• 64GB (10,000 canciones) - $119.900',
      '',
      '🚚 Envío GRATIS + Pago contraentrega',
      commonTemplates.socialProof[1],
      '',
      'Responde con el número o escribe qué géneros te gustan 👇'
    ].join('\n'),
    quickReplies: ['1', '2', '3', 'Ver más'],
    meta: { strategy: 'followUp' }
  })
};
