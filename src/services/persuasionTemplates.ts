/**
 * Persuasion Templates Service
 * Manages rotation of persuasive follow-up message templates
 * Ensures variety and avoids repetition for better user engagement
 */

import type { UserSession } from '../../types/global';

/**
 * Template categories for different follow-up strategies
 */
export type TemplateCategory = 
  | 're-engage_warm'      // Friendly re-engagement
  | 'value_benefit'       // Highlight value proposition
  | 'discount_offer'      // Price incentive (10-15% off)
  | 'urgency_soft'        // Subtle time pressure
  | 'content_teaser'      // Preview what they'll get
  | 'social_proof';       // Testimonial/popular choice

/**
 * Template structure
 */
export interface PersuasionTemplate {
  id: string;
  category: TemplateCategory;
  attemptNumber: 1 | 2 | 3;  // Which follow-up attempt this is for
  message: string;
  useMediaPath?: boolean;    // Whether to include pricing table image
}

/**
 * All available persuasion templates
 * Messages are short, human, and have subtle CTAs
 */
const TEMPLATES: PersuasionTemplate[] = [
  // --- Attempt 1: Re-engage Warm (Short & Contextual) ---
  {
    id: 'reeng_warm_1_a',
    category: 're-engage_warm',
    attemptNumber: 1,
    message: `Hola, soy de TechAura. Vi que estabas interesado en nuestras USBs personalizadas. 
¿Te gustaría que te ayude a elegir la mejor opción para ti? Responde cuando tengas un momento 👍`
  },
  {
    id: 'reeng_warm_1_b',
    category: 're-engage_warm',
    attemptNumber: 1,
    message: `Hola 👋 ¿Retomamos tu consulta sobre la USB personalizada?
Con gusto te ayudo a encontrar exactamente lo que necesitas.`
  },
  {
    id: 'reeng_warm_1_c',
    category: 're-engage_warm',
    attemptNumber: 1,
    message: `Hola, te escribo de TechAura. Quedamos pendientes con tu USB personalizada.
¿Qué tipo de contenido prefieres: música, películas o videos?`
  },
  {
    id: 'reeng_warm_1_d',
    category: 're-engage_warm',
    attemptNumber: 1,
    message: `Hola 🎶 ¿Continuamos con tu pedido?
Te puedo mostrar las opciones y precios cuando gustes. Sin compromiso.`
  },

  // --- Attempt 2: Value/Benefit + Soft CTA ---
  {
    id: 'value_disc_2_a',
    category: 'value_benefit',
    attemptNumber: 2,
    message: `Hola. Te quería comentar que tenemos USB personalizada con envío incluido.
Desde $59.900. ¿Te interesa que te muestre las capacidades disponibles?`,
    useMediaPath: true
  },
  {
    id: 'value_disc_2_b',
    category: 'discount_offer',
    attemptNumber: 2,
    message: `Hola 👋 Tenemos una promoción especial que podría interesarte.
USB personalizada desde $59.900 con envío gratis. ¿Te gustaría conocer más detalles?`,
    useMediaPath: true
  },
  {
    id: 'social_proof_2_a',
    category: 'social_proof',
    attemptNumber: 2,
    message: `Hola. Llevo varios años en esto y te puedo decir que más de 500 clientes han quedado muy satisfechos este mes.
USB personalizada desde $59.900 + envío gratis. ¿Te interesa?`
  },

  // --- Attempt 3: Gentle Final Check ---
  {
    id: 'urgency_final_3_a',
    category: 'urgency_soft',
    attemptNumber: 3,
    message: `Hola 🎵 Una última consulta: ¿Te gustaría que armemos tu USB personalizada?
Desde $59.900 con envío incluido. Si te interesa, responde SÍ. Si no, con gusto entiendo 👍`,
    useMediaPath: true
  },
  {
    id: 'content_teaser_3_a',
    category: 'content_teaser',
    attemptNumber: 3,
    message: `Hola 🎁 La USB personalizada estaría lista en 24-48 horas.
Todo incluido desde $59.900 con envío gratis.
¿La confirmamos? SÍ/NO`
  },
  {
    id: 'urgency_final_3_b',
    category: 'urgency_soft',
    attemptNumber: 3,
    message: `👋 ¿Te puedo ayudar con tu USB personalizada?
Si quieres continuar responde SÍ, o NO GRACIAS si prefieres dejarlo por ahora.
Gracias por tu tiempo 😊`
  }
];

/**
 * Get user's last used template from session
 */
function getLastUsedTemplateId(session: UserSession): string | null {
  return (session.conversationData?.lastTemplateUsed as string) || null;
}

/**
 * Select next template for user, avoiding repetition
 */
export function selectNextTemplate(
  session: UserSession,
  attemptNumber: 1 | 2 | 3
): PersuasionTemplate {
  // Get templates for this attempt number
  const availableTemplates = TEMPLATES.filter(t => t.attemptNumber === attemptNumber);
  
  if (availableTemplates.length === 0) {
    throw new Error(`No templates found for attempt ${attemptNumber}`);
  }
  
  // Get last used template
  const lastUsedId = getLastUsedTemplateId(session);
  
  // Filter out the last used template to avoid repetition
  const freshTemplates = lastUsedId 
    ? availableTemplates.filter(t => t.id !== lastUsedId)
    : availableTemplates;
  
  // If all templates were used, reset and use any
  const finalTemplates = freshTemplates.length > 0 ? freshTemplates : availableTemplates;
  
  // Random selection from available templates
  const randomIndex = Math.floor(Math.random() * finalTemplates.length);
  const selectedTemplate = finalTemplates[randomIndex];
  
  console.log(`📝 Selected template for attempt ${attemptNumber}: ${selectedTemplate.id} (category: ${selectedTemplate.category})`);
  
  return selectedTemplate;
}

/**
 * Mark template as used in user session
 */
export function markTemplateAsUsed(session: UserSession, templateId: string): void {
  if (!session.conversationData) {
    session.conversationData = {};
  }
  
  session.conversationData.lastTemplateUsed = templateId;
  session.conversationData.lastTemplateUsedAt = new Date().toISOString();
}

/**
 * Build complete follow-up message with template
 */
export function buildFollowUpMessage(
  session: UserSession,
  attemptNumber: 1 | 2 | 3
): { message: string; templateId: string; useMediaPath: boolean } {
  const template = selectNextTemplate(session, attemptNumber);
  
  // Personalize with user's name if available
  let message = template.message;
  if (session.name && !message.includes(session.name.split(' ')[0])) {
    // Only add name if template doesn't already have a greeting
    if (!message.startsWith('¡Hola') && !message.startsWith('Hola') && !message.startsWith('Hey')) {
      const firstName = session.name.split(' ')[0];
      message = `¡Hola ${firstName}! 😊\n\n` + message;
    }
  }
  
  return {
    message,
    templateId: template.id,
    useMediaPath: template.useMediaPath || false
  };
}

/**
 * Get template statistics for a session
 */
export function getTemplateStats(session: UserSession): {
  lastTemplateId: string | null;
  lastTemplateUsedAt: string | null;
  totalTemplatesUsed: number;
} {
  const conversationData = session.conversationData || {};
  const templatesHistory = (conversationData.templatesUsedHistory as string[]) || [];
  
  return {
    lastTemplateId: (conversationData.lastTemplateUsed as string) || null,
    lastTemplateUsedAt: (conversationData.lastTemplateUsedAt as string) || null,
    totalTemplatesUsed: templatesHistory.length
  };
}

/**
 * Helper function to generate personalized greeting from user name
 * Exported for potential reuse in other modules
 */
export function getPersonalizedGreeting(session: UserSession): string {
  const name = session.name ? session.name.split(' ')[0] : '';
  return name ? `¡Hola ${name}!` : '¡Hola!';
}

/**
 * Build contextual follow-up message based on user's current stage
 * This prevents sending generic "I have your consultation" messages when user is mid-checkout
 */
export function getContextualFollowUpMessage(session: UserSession): string | null {
  const stage = session.stage || 'initial';
  const greet = getPersonalizedGreeting(session);
  
  console.log(`🎯 Building contextual follow-up for stage: ${stage}`);
  
  // If user is collecting data (name, address, shipping info)
  const dataCollectionStages = ['collecting_name', 'collecting_address', 'collecting_data', 'data_auto_detected'];
  if (dataCollectionStages.includes(stage)) {
    return `${greet} 👋 Para completar tu pedido, necesito tus datos de envío:
Nombre completo, ciudad, dirección y teléfono. ¿Me los puedes compartir? 📦`;
  }
  
  // If user is at payment stage
  const paymentStages = ['collecting_payment', 'payment_confirmed'];
  if (paymentStages.includes(stage)) {
    return `${greet} 👋 Para finalizar, ¿cuál método de pago prefieres?
Acepto: Efectivo ✅ | Transferencia | Nequi | Daviplata 💳`;
  }
  
  // If user is waiting to select capacity (most critical stage)
  if (stage === 'awaiting_capacity') {
    return `${greet} Te escribo para ver qué capacidad te acomoda mejor:
1️⃣ 64GB | 2️⃣ 128GB (más popular) | 3️⃣ 256GB | 4️⃣ 512GB
Responde con el número que prefieras 🎵`;
  }
  
  // If user was viewing prices or made capacity selection
  const pricingStages = ['pricing', 'prices_shown'];
  if (pricingStages.includes(stage)) {
    return `${greet} ¿Ya tuviste chance de revisar las capacidades?
💡 Te recomiendo la 128GB, es la que más se vende. Responde 1/2/3/4 según tu preferencia 🎵`;
  }
  
  // If user was customizing/selecting genres
  const customizationStages = ['personalization', 'genre_selection', 'customizing'];
  if (customizationStages.includes(stage)) {
    // Note: Using type assertion to access flow-specific properties (movieGenres)
    // These are added dynamically by specific flows like moviesUsb
    const sessionAny = session as any;
    const hasGenres = sessionAny.selectedGenres?.length > 0 || sessionAny.movieGenres?.length > 0;
    
    if (hasGenres) {
      return `${greet} 👋 Ya tengo anotados tus géneros preferidos 🎬
¿Pasamos a ver las capacidades disponibles? Escribe SÍ cuando gustes`;
    }
    
    return `${greet} 👋 ¿Retomamos tu selección?
Cuando estés listo, escribe OK y te muestro los precios`;
  }
  
  // If user showed interest but didn't proceed
  if (stage === 'interested') {
    return `${greet} ¿Te gustaría que te muestre las capacidades y precios?
Tenemos opciones desde $59.900. Responde SÍ cuando quieras 🎵`;
  }
  
  // For other stages or initial contact, return null to use standard templates
  return null;
}

/**
 * Build personalized follow-up message using user interests and history
 * This enhances standard templates with context-aware personalization
 */
export function buildPersonalizedFollowUp(
  session: UserSession,
  attemptNumber: 1 | 2 | 3,
  userInterests: { 
    contentType?: string;
    preferredCapacity?: string;
    priceSensitive?: boolean;
    urgencyLevel?: string;
    mainObjection?: string;
  },
  recommendations: {
    shouldMentionPaymentPlan?: boolean;
    shouldMentionDiscount?: boolean;
  }
): { message: string; templateId: string; useMediaPath: boolean } {
  const template = selectNextTemplate(session, attemptNumber);
  const greet = getPersonalizedGreeting(session);
  
  let message = template.message;
  
  // Personalize based on user interests
  if (userInterests && recommendations) {
    // Add personalized intro based on content type preference
    if (userInterests.contentType === 'musica' && !message.includes('música') && !message.includes('musica')) {
      message = message.replace(/USB personalizada/i, 'USB de música personalizada');
    } else if (userInterests.contentType === 'videos') {
      message = message.replace(/USB personalizada/i, 'USB de videos');
    } else if (userInterests.contentType === 'peliculas') {
      message = message.replace(/USB personalizada/i, 'USB de películas y series');
    }
    
    // Highlight preferred capacity if known
    if (userInterests.preferredCapacity) {
      const capacity = userInterests.preferredCapacity;
      message = message.replace(/\bUSB\b/i, `USB de ${capacity}`);
    }
    
    // Add payment plan offer if user asked about it
    if (recommendations.shouldMentionPaymentPlan && !message.includes('pago')) {
      message += '\n\n💳 *Bonus:* Acepto pago en 2 cuotas sin interés.';
    }
    
    // Emphasize discount for price-sensitive users
    if (recommendations.shouldMentionDiscount && userInterests.priceSensitive) {
      message = message.replace(/10% OFF/g, '15% OFF ESPECIAL');
      message = message.replace(/15% OFF/g, '20% OFF EXCLUSIVO PARA TI');
    }
    
    // Add urgency for high-urgency users
    if (userInterests.urgencyLevel === 'high' && !message.includes('urgente')) {
      message += '\n\n⚡ Puedo preparártela en 24h si confirmas hoy.';
    }
    
    // Add social proof for trust-concerned users
    if (userInterests.mainObjection === 'trust' && !message.includes('cliente')) {
      message += '\n\n⭐ +500 clientes satisfechos este mes. Garantía total.';
    }
  }
  
  return {
    message,
    templateId: template.id,
    useMediaPath: template.useMediaPath || false
  };
}

console.log('✅ Persuasion Templates Service initialized with rotation logic');
