/**
 * Persuasion Templates Service
 * Manages rotation of persuasive follow-up message templates
 * Ensures variety and avoids repetition for better user engagement
 */

import type { UserSession } from '../../types/global';

/**
 * Template categories for different follow-up strategies
 * Updated to align with recommendedMessageAngle types: 'value', 'benefit', 'urgency'
 */
export type TemplateCategory = 
  | 'value'              // Value proposition focus
  | 'benefit'            // Benefits and features focus
  | 'urgency';           // Time-sensitive messaging

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
 * Categories aligned with message angles: 'value', 'benefit', 'urgency'
 */
const TEMPLATES: PersuasionTemplate[] = [
  // --- Attempt 1: Value proposition (educate and inform) ---
  {
    id: 'value_1_a',
    category: 'value',
    attemptNumber: 1,
    message: `¡Hola! 👋 Soy de TechAura y me quedé con la duda de cómo te puedo ayudar con tu USB personalizada.

¿Tienes alguna pregunta sobre las opciones? Estoy aquí para ayudarte a elegir la mejor para ti 😊`
  },
  {
    id: 'value_1_b',
    category: 'value',
    attemptNumber: 1,
    message: `Hola 👋 ¿Sigues buscando tu USB perfecta?

Déjame contarte: tengo opciones desde 64GB hasta 512GB, todas con contenido personalizado. ¿Hablamos? 🎵`
  },
  {
    id: 'value_1_c',
    category: 'value',
    attemptNumber: 1,
    message: `¡Hola! Quedamos pendientes con tu USB 😊

Cuéntame, ¿qué tipo de contenido te gustaría? Tengo música, películas, series... ¡Lo que prefieras! 🎬🎵`
  },
  {
    id: 'value_1_d',
    category: 'value',
    attemptNumber: 1,
    message: `Hola 🎶 ¿Te gustaría que retomemos tu pedido?

Puedo mostrarte todas las capacidades disponibles y ayudarte a elegir. ¿Cuándo te viene bien?`
  },

  // --- Attempt 2: Benefits (show what they get) ---
  {
    id: 'benefit_2_a',
    category: 'benefit',
    attemptNumber: 2,
    message: `¡Hola! 😊 Te tengo una excelente noticia:

💿 USB personalizada desde $59.900
📦 Envío GRATIS a toda Colombia
🎁 Contenido 100% a tu gusto

¿Te muestro las capacidades? Solo responde SÍ`,
    useMediaPath: true
  },
  {
    id: 'benefit_2_b',
    category: 'benefit',
    attemptNumber: 2,
    message: `Hola 👋 Te reservé una promoción especial:

✅ USB personalizada desde $59.900
✅ Envío gratis sin mínimo de compra
✅ Lista en 24-48 horas

¿La confirmamos? Responde con un SÍ y arrancamos 🎵`,
    useMediaPath: true
  },
  {
    id: 'benefit_2_c',
    category: 'benefit',
    attemptNumber: 2,
    message: `¡Hola! 👋 Mira, este mes han confiado en mí más de 500 clientes satisfechos.

La USB más vendida: 128GB desde $59.900 + envío incluido 🎵

¿Te gustaría unirte a ellos? Solo dime SÍ y te explico todo`
  },

  // --- Attempt 3: Urgency (final call to action) ---
  {
    id: 'urgency_3_a',
    category: 'urgency',
    attemptNumber: 3,
    message: `Hola 👋 Esta es mi última oportunidad de ayudarte:

🎵 USB personalizada desde $59.900
📦 Envío gratis a toda Colombia
⚡ Lista en 24-48 horas

Si te interesa, solo responde SÍ
Si no es para ti, con mucho gusto lo entiendo 😊`,
    useMediaPath: true
  },
  {
    id: 'urgency_3_b',
    category: 'urgency',
    attemptNumber: 3,
    message: `¡Última llamada! 🎁

Tu USB personalizada puede estar lista en 24-48h:
💿 Todo el contenido que quieras
📦 Envío gratis incluido
💰 Desde $59.900

¿Nos animamos? Responde SÍ o NO para saber tu decisión`
  },
  {
    id: 'urgency_3_c',
    category: 'urgency',
    attemptNumber: 3,
    message: `Hola 👋 Antes de despedirme, quiero saber:

¿Te gustaría que preparemos tu USB personalizada?

✅ Responde SÍ si quieres continuar
❌ Responde NO si prefieres dejarlo

De todas formas, gracias por tu tiempo y cualquier cosa, aquí estoy 😊`
  }
];

/**
 * Get user's last used template from session
 */
function getLastUsedTemplateId(session: UserSession): string | null {
  return (session.conversationData?.lastTemplateUsed as string) || null;
}

/**
 * Select template by category and attempt number
 * NEW: Uses recommended message angle to select appropriate template
 */
function selectTemplateByCategory(
  session: UserSession,
  attemptNumber: 1 | 2 | 3,
  preferredCategory: TemplateCategory
): PersuasionTemplate {
  // Get templates for this attempt number and preferred category
  let availableTemplates = TEMPLATES.filter(
    t => t.attemptNumber === attemptNumber && t.category === preferredCategory
  );
  
  // Fallback: if no templates match preferred category, use any for this attempt
  if (availableTemplates.length === 0) {
    console.log(`⚠️ No templates found for category "${preferredCategory}" in attempt ${attemptNumber}, falling back to any category`);
    availableTemplates = TEMPLATES.filter(t => t.attemptNumber === attemptNumber);
  }
  
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
 * Select next template for user, avoiding repetition
 * LEGACY: Kept for backward compatibility
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
 * Uses template rotation to avoid sending the same message twice
 * Automatically selects a template that wasn't used in the last attempt
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
 * ENHANCED: Now includes order confirmation messages and better personalization
 */
export function getContextualFollowUpMessage(session: UserSession): string | null {
  const stage = session.stage || 'initial';
  const greet = getPersonalizedGreeting(session);
  
  console.log(`🎯 Building contextual follow-up for stage: ${stage}`);
  
  // CRITICAL: Check if user has a draft order that needs confirmation
  const orderData = session.orderData;
  const sessionAny = session as any;
  if (orderData && orderData.status === 'draft' && orderData.totalPrice) {
    const capacity = sessionAny.capacity || orderData.selectedCapacity || 'tu capacidad elegida';
    const price = orderData.totalPrice.toLocaleString('es-CO');
    
    // Check what data we already have for draft orders too
    const hasName = !!session.name;
    const hasAddress = !!sessionAny.customerData?.direccion || !!sessionAny.shippingAddress;
    const hasCity = !!sessionAny.customerData?.ciudad || !!sessionAny.city;
    
    // Build dynamic data request for draft orders
    let missingData: string[] = [];
    if (!hasName) missingData.push('✅ Tu nombre completo');
    if (!hasCity) missingData.push('✅ Ciudad');
    if (!hasAddress) missingData.push('✅ Dirección de envío');
    if (!session.phone && !session.phoneNumber) missingData.push('✅ Teléfono de contacto');
    
    const dataRequest = missingData.length > 0 
      ? `Solo necesito que confirmes:\n${missingData.join('\n')}`
      : '¿Confirmas que todo está correcto?';
    
    return `${greet} 👋 ¡Perfecto! Tu pedido está casi listo.

📦 **Resumen de tu pedido:**
💾 USB de ${capacity}
💰 Total: $${price} (Envío GRATIS incluido)

${dataRequest}

Responde con tus datos y procesamos tu pedido de inmediato 🚀`;
  }
  
  // If user is collecting data (name, address, shipping info)
  const dataCollectionStages = ['collecting_name', 'collecting_address', 'collecting_data', 'data_auto_detected'];
  if (dataCollectionStages.includes(stage)) {
    // Check what data we already have
    const hasName = !!session.name;
    const hasAddress = !!sessionAny.customerData?.direccion || !!sessionAny.shippingAddress;
    const hasCity = !!sessionAny.customerData?.ciudad || !!sessionAny.city;
    
    // Build dynamic data request based on what's missing
    let missingData: string[] = [];
    if (!hasName) missingData.push('✅ Nombre completo');
    if (!hasCity) missingData.push('✅ Ciudad');
    if (!hasAddress) missingData.push('✅ Dirección de envío');
    if (!session.phone && !session.phoneNumber) missingData.push('✅ Teléfono de contacto');
    
    if (missingData.length === 0) {
      // All data collected, move to confirmation
      return `${greet} 😊 ¡Perfecto! Ya tengo todos tus datos.

¿Confirmas que quieres proceder con tu pedido?

Responde SÍ y lo preparo de inmediato 🚀`;
    }
    
    return `${greet} 😊 ¡Estamos casi listos para completar tu pedido!

Solo necesito estos datos para el envío:
${missingData.join('\n')}

¿Me los compartes ahora? 📦`;
  }
  
  // If user is at payment stage
  const paymentStages = ['collecting_payment', 'payment_confirmed'];
  if (paymentStages.includes(stage)) {
    return `${greet} 👋 ¡Ya casi terminamos!

¿Con cuál método de pago te gustaría completar tu pedido?

💳 Acepto:
• Efectivo contra entrega
• Transferencia bancaria
• Nequi
• Daviplata

Escoge el que prefieras 😊`;
  }
  
  // If user is waiting to select capacity (most critical stage)
  if (stage === 'awaiting_capacity') {
    const contentType = sessionAny.contentType || 'contenido';
    const contentEmoji = contentType === 'musica' ? '🎵' : contentType === 'videos' ? '🎬' : contentType === 'peliculas' ? '🍿' : '💿';
    
    return `${greet} 😊 ¿Ya sabes qué capacidad quieres para tu USB de ${contentType}?

Estas son tus opciones ${contentEmoji}:
1️⃣ 64GB - Ideal para lo básico
2️⃣ 128GB - ⭐ La más popular
3️⃣ 256GB - Para colecciones grandes
4️⃣ 512GB - La más completa

Solo responde el número`;
  }
  
  // If user was viewing prices or made capacity selection
  const pricingStages = ['pricing', 'prices_shown'];
  if (pricingStages.includes(stage)) {
    const capacity = sessionAny.capacity;
    if (capacity) {
      return `${greet} 😊 Vi que te interesó la USB de ${capacity}.

¿Quieres que confirmemos tu pedido?

Responde SÍ y lo preparamos de inmediato 🚀`;
    }
    
    return `${greet} 😊 ¿Ya pudiste revisar las opciones de capacidad?

💡 La 128GB es la favorita de nuestros clientes - excelente relación calidad-precio.

Responde 1, 2, 3 o 4 para continuar 🎵`;
  }
  
  // If user was customizing/selecting genres
  const customizationStages = ['personalization', 'genre_selection', 'customizing'];
  if (customizationStages.includes(stage)) {
    const hasGenres = sessionAny.selectedGenres?.length > 0 || sessionAny.movieGenres?.length > 0;
    
    if (hasGenres) {
      const genres = sessionAny.selectedGenres || sessionAny.movieGenres;
      const genreList = genres.slice(0, 3).join(', ');
      
      return `${greet} 🎬 ¡Perfecto! Ya tengo tus géneros favoritos: ${genreList}.

¿Listo para ver las capacidades y elegir la tuya?

Escribe SÍ para continuar ✨`;
    }
    
    return `${greet} 😊 ¿Quieres que retomemos la personalización de tu USB?

Cuando estés listo, escribe OK y seguimos con los precios 🎵`;
  }
  
  // If user showed interest but didn't proceed
  if (stage === 'interested') {
    return `${greet} 😊 ¿Te gustaría conocer todas las opciones de capacidad y sus precios?

Tenemos desde $59.900 con envío gratis incluido.

Responde SÍ y te muestro todo 🎵`;
  }
  
  // For other stages or initial contact, return null to use standard templates
  return null;
}

/**
 * Build personalized follow-up message using user interests and history
 * This enhances standard templates with context-aware personalization
 * ENHANCED: Now uses recommendedMessageAngle to select appropriate template category
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
    recommendedMessageAngle?: 'value' | 'benefit' | 'urgency';
  }
): { message: string; templateId: string; useMediaPath: boolean } {
  // Use recommended angle if provided, otherwise default based on attempt number
  const preferredCategory: TemplateCategory = recommendations.recommendedMessageAngle || 
    (attemptNumber === 1 ? 'value' : attemptNumber === 2 ? 'benefit' : 'urgency');
  
  // Select template matching the recommended category and attempt number
  const template = selectTemplateByCategory(session, attemptNumber, preferredCategory);
  const greet = getPersonalizedGreeting(session);
  
  let message = template.message;
  
  // Personalize based on user interests
  if (userInterests && recommendations) {
    // Add personalized intro based on content type preference
    // Replace all occurrences (case-insensitive) with one call
    if (userInterests.contentType === 'musica' && !message.includes('música') && !message.includes('musica')) {
      message = message.replace(/USB personalizada/gi, 'USB musical personalizada');
    } else if (userInterests.contentType === 'videos') {
      message = message.replace(/USB personalizada/gi, 'USB de videos');
    } else if (userInterests.contentType === 'peliculas' || userInterests.contentType === 'movies') {
      message = message.replace(/USB personalizada/gi, 'USB de películas y series');
    }
    
    // Highlight preferred capacity if known and not already mentioned
    if (userInterests.preferredCapacity && !message.includes(userInterests.preferredCapacity)) {
      // Only replace standalone "USB" not already followed by "de" or "personalizada"
      message = message.replace(/\bUSB\b(?!\s+(de|personalizada|musical))/gi, `USB de ${userInterests.preferredCapacity}`);
    }
    
    // Handle price objection specifically
    if (userInterests.mainObjection === 'price') {
      // Add value justification
      if (!message.includes('plan') && !message.includes('cuotas')) {
        message += '\n\n💳 Acepto pago en 2 cuotas sin interés para mayor comodidad.';
      }
      // Emphasize free shipping
      if (!message.includes('gratis') && !message.includes('GRATIS')) {
        message += '\n📦 Envío GRATIS incluido - Sin costos adicionales.';
      }
    }
    
    // Handle shipping objection
    if (userInterests.mainObjection === 'shipping') {
      if (!message.includes('24') && !message.includes('48')) {
        message += '\n\n⚡ Entrega rápida: 24-48 horas en toda Colombia.';
      }
    }
    
    // Add payment plan offer if user is price sensitive
    if (recommendations.shouldMentionPaymentPlan && userInterests.priceSensitive) {
      if (!message.includes('pago') && !message.includes('cuotas')) {
        message += '\n\n💳 *Plan de pago:* 50% al reservar + 50% contra entrega.';
      }
    }
    
    // Emphasize discount for price-sensitive users
    if (recommendations.shouldMentionDiscount && userInterests.priceSensitive) {
      message = message.replace(/10% OFF/g, '15% OFF ESPECIAL');
      message = message.replace(/15% OFF/g, '20% OFF EXCLUSIVO PARA TI');
    }
    
    // Add urgency for high-urgency users
    if (userInterests.urgencyLevel === 'high' && !message.includes('urgente') && !message.includes('24h')) {
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
