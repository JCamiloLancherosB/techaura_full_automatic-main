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
    'Podemos ajustar capacidad sin perder tus géneros clave.',
    commonTemplates.riskReversal,
    commonTemplates.ctas.chooseCapacity
  ].join('\n'),
  quickReplies: ['1', '2'],
  meta: { strategy: 'objectionHandling' }
});

export const videosUsbTemplates = {
  onboarding: (context: UserContext): TemplateConfig => {
    const isReturning = (context.history?.previousOrdersCount || 0) > 0;
    if (isReturning) {
      const pref = context.preferences?.genres?.slice(0, 2).join(' y ');
      return {
        text: [
          `🎬 ¡Bienvenido de nuevo${context.firstName ? `, ${context.firstName}` : ''}!`,
          pref ? `Seguimos con ${pref}.` : 'Tengo tus preferencias guardadas.',
          commonTemplates.ctas.continueWithPrefs(pref || 'tus gustos')
        ].join('\n'),
        quickReplies: ['Sí', 'No'],
        meta: { strategy: 'clarity' }
      };
    }
    return {
      text: [
        '🎬 *USB de Videoclips HD/4K*',
        '',
        '📺 *Contenido que puedes personalizar:*',
        '• Géneros: Reggaetón, Salsa, Bachata, Rock, Vallenato, Baladas',
        '• Artistas: Bad Bunny, Marc Anthony, Romeo Santos, Queen, Carlos Vives',
        '• Listo para TV, carro, celular y más',
        '',
        commonTemplates.socialProof[0],
        '',
        '¿Qué géneros o artistas prefieres? 👇',
        '_(También puedes escribir "PRECIOS" para ver opciones)_'
      ].join('\n'),
      quickReplies: ['Ver precios', 'Personalizar'],
      meta: { strategy: 'socialProof' }
    };
  },
  preferences: (context: UserContext): TemplateConfig => ({
    text: [
      `✅ Selección ${personalize(context)} confirmada.`,
      commonTemplates.riskReversal,
      commonTemplates.ctas.showPrices
    ].join('\n'),
    quickReplies: ['OK', 'Cambiar'],
    meta: { strategy: 'riskReversal' }
  }),
  capacityChoice: (context: UserContext): TemplateConfig => ({
    text: [
      `Opciones sugeridas ${personalize(context)}:`,
      '1) 32GB (1.000 videos)',
      '2) 64GB (2.000 videos) ⭐',
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
      '¡Hola! 👋 ¿Seguimos con tu USB de videoclips?',
      '',
      '💰 *Opciones disponibles:*',
      '• 8GB (260 videos) - $54.900',
      '• 32GB (1,000 videos) - $84.900 ⭐',
      '• 64GB (2,000 videos) - $119.900',
      '',
      '🚚 Envío GRATIS + Pago contraentrega',
      commonTemplates.socialProof[1],
      '',
      'Elige capacidad (1=8GB, 2=32GB, 3=64GB) o escríbenos qué géneros te gustan 👇'
    ].join('\n'),
    quickReplies: ['1', '2', '3', 'Ver más'],
    meta: { strategy: 'followUp' }
  })
};
