/**
 * Persuasion Templates Service
 * Manages rotation of persuasive follow-up message templates
 * Ensures variety and avoids repetition for better user engagement
 * 
 * Stage-based templates for:
 * - ASK_GENRE: Suggest examples + option "Escribe: 1,2,3 o 'otro'"
 * - ASK_CAPACITY_OK: Explain capacity in 1 line + ask for "OK"
 * - CONFIRM_SUMMARY: Ask "Sí/No" + adjustment option
 */

import type { UserSession } from '../../types/global';
import { ConversationStage } from '../types/ConversationStage';

/**
 * Template categories for different follow-up strategies
 * Updated to align with recommendedMessageAngle types: 'value', 'benefit', 'urgency'
 */
export type TemplateCategory = 
  | 'value'              // Value proposition focus
  | 'benefit'            // Benefits and features focus
  | 'urgency';           // Time-sensitive messaging

/**
 * Content type variants for personalization
 */
export type ContentTypeVariant = 'music' | 'videos' | 'movies' | 'general';

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
 * Stage-based follow-up template structure
 */
export interface StageFollowUpTemplate {
  id: string;
  stage: ConversationStage;
  contentVariant: ContentTypeVariant;
  message: string;
  cta: string;  // Clear call-to-action
}

/**
 * User's template history for rotation tracking
 */
interface TemplateHistory {
  lastTemplateId: string | null;
  lastUsedAt: Date | null;
  usedTemplateIds: string[];  // Track all used template IDs to avoid repetition
}

/**
 * In-memory cache for template history per user (phone -> history)
 * Prevents consecutive repetition of templates
 */
const userTemplateHistory = new Map<string, TemplateHistory>();

/**
 * Stage-based follow-up templates catalog
 * 3-5 templates per stage with clear CTAs
 */
const STAGE_TEMPLATES: StageFollowUpTemplate[] = [
  // ============= ASK_GENRE Stage Templates =============
  // For users who need to select content genres
  
  // Music variants
  {
    id: 'ask_genre_music_1',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'music',
    message: `¡Hola! 🎵 Estabas eligiendo géneros para tu USB de música.

Te dejo algunas opciones populares:
1️⃣ Rock & Pop Clásico
2️⃣ Reggaetón & Urbano
3️⃣ Baladas & Románticas
4️⃣ Salsa & Tropical
5️⃣ Vallenato & Regional`,
    cta: `Escribe: 1, 2, 3, 4, 5 o "otro" si prefieres algo diferente 😊`
  },
  {
    id: 'ask_genre_music_2',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'music',
    message: `Hola 👋 ¡Tu USB musical está esperando!

¿Qué géneros te gustaría?
1️⃣ Clásicos de los 80s y 90s
2️⃣ Éxitos Actuales
3️⃣ Música en Inglés
4️⃣ Mix de Todo un Poco`,
    cta: `Solo escribe el número o "otro" para contarme tu preferencia 🎶`
  },
  {
    id: 'ask_genre_music_3',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'music',
    message: `¡Hola! 🎧 Quedamos pendientes con tu selección de música.

Las categorías más pedidas son:
1️⃣ Reggaetón & Urbano
2️⃣ Rock en Español
3️⃣ Bachata & Merengue
4️⃣ Pop Internacional`,
    cta: `¿Cuál te gusta? Escribe 1, 2, 3, 4 o dime si quieres "otro" estilo`
  },
  {
    id: 'ask_genre_music_4',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'music',
    message: `Hola 🎵 ¿Listo para armar tu USB perfecta?

Tengo colecciones increíbles de:
1️⃣ Los Mejores Clásicos
2️⃣ Música para Fiestas
3️⃣ Para Relajarse
4️⃣ De Todo un Poco`,
    cta: `Elige tu número favorito o escribe "otro" para personalizar`
  },

  // Video variants
  {
    id: 'ask_genre_videos_1',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'videos',
    message: `¡Hola! 🎬 Tu USB de videoclips te espera.

Categorías disponibles:
1️⃣ Videoclips Pop & Rock
2️⃣ Reggaetón & Urbano
3️⃣ Clásicos de los 80s-90s
4️⃣ Mix Variado HD`,
    cta: `Escribe: 1, 2, 3, 4 o "otro" si buscas algo específico 📺`
  },
  {
    id: 'ask_genre_videos_2',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'videos',
    message: `Hola 👋 ¡Vamos con tu USB de videos!

Tengo colecciones de:
1️⃣ Videos Musicales HD
2️⃣ Conciertos Completos
3️⃣ Karaoke con Letra
4️⃣ Mix de Todo`,
    cta: `¿Cuál prefieres? Solo escribe el número o "otro"`
  },
  {
    id: 'ask_genre_videos_3',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'videos',
    message: `¡Hola! 📺 ¿Retomamos tu USB de videos?

Las más vendidas:
1️⃣ Éxitos en 4K
2️⃣ Retro & Nostálgicos
3️⃣ Fiestas & Eventos
4️⃣ Variado Premium`,
    cta: `Dime tu opción: 1, 2, 3, 4 o escribe "otro"`
  },

  // Movies variants
  {
    id: 'ask_genre_movies_1',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'movies',
    message: `¡Hola! 🎬 Tu USB de películas está lista para armarse.

Géneros populares:
1️⃣ Acción & Aventura
2️⃣ Comedia
3️⃣ Terror & Suspenso
4️⃣ Drama & Romance
5️⃣ Ciencia Ficción`,
    cta: `Escribe: 1, 2, 3, 4, 5 o "otro" para algo diferente 🍿`
  },
  {
    id: 'ask_genre_movies_2',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'movies',
    message: `Hola 👋 ¡Tu USB de pelis te espera!

¿Qué te gustaría ver?
1️⃣ Clásicos del Cine
2️⃣ Estrenos Recientes
3️⃣ Series Completas
4️⃣ Animadas & Familia`,
    cta: `Solo escribe el número o "otro" si tienes algo en mente`
  },
  {
    id: 'ask_genre_movies_3',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'movies',
    message: `¡Hola! 🍿 Quedamos con tu USB de películas pendiente.

Las más pedidas:
1️⃣ Marvel & DC
2️⃣ Terror Clásico
3️⃣ Comedia Romántica
4️⃣ Documentales`,
    cta: `¿Cuál te llama? Escribe 1, 2, 3, 4 o dime "otro"`
  },

  // General variants (when content type unknown)
  {
    id: 'ask_genre_general_1',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'general',
    message: `¡Hola! 👋 Estabas personalizando tu USB.

¿Qué tipo de contenido prefieres?
1️⃣ Música 🎵
2️⃣ Videos Musicales 📺
3️⃣ Películas & Series 🎬
4️⃣ Mix de Todo 🎁`,
    cta: `Escribe: 1, 2, 3, 4 o cuéntame qué te gustaría`
  },
  {
    id: 'ask_genre_general_2',
    stage: ConversationStage.ASK_GENRE,
    contentVariant: 'general',
    message: `Hola 😊 ¡Tu USB personalizada está esperando!

Puedo armarla con:
1️⃣ Tus canciones favoritas
2️⃣ Videoclips en HD
3️⃣ Películas y series
4️⃣ Un poco de todo`,
    cta: `¿Qué prefieres? Solo escribe el número o "otro"`
  },

  // ============= ASK_CAPACITY_OK Stage Templates =============
  // For users who need to confirm capacity selection
  
  {
    id: 'ask_capacity_ok_1',
    stage: ConversationStage.ASK_CAPACITY_OK,
    contentVariant: 'general',
    message: `¡Hola! 📦 La capacidad que elegiste permite almacenar miles de archivos con calidad premium.`,
    cta: `¿Confirmamos esta opción? Responde "OK" o dime si prefieres otra capacidad`
  },
  {
    id: 'ask_capacity_ok_2',
    stage: ConversationStage.ASK_CAPACITY_OK,
    contentVariant: 'general',
    message: `Hola 👋 Tu USB tendrá espacio de sobra para todo tu contenido favorito sin comprometer calidad.`,
    cta: `Escribe "OK" para confirmar o "cambiar" si quieres otra capacidad`
  },
  {
    id: 'ask_capacity_ok_3',
    stage: ConversationStage.ASK_CAPACITY_OK,
    contentVariant: 'general',
    message: `¡Hola! 💾 Con la capacidad seleccionada tendrás espacio suficiente para años de entretenimiento.`,
    cta: `¿Seguimos adelante? Solo escribe "OK" o dime si quieres ajustar`
  },
  {
    id: 'ask_capacity_ok_4',
    stage: ConversationStage.ASK_CAPACITY_OK,
    contentVariant: 'music',
    message: `Hola 🎵 La capacidad elegida cabe +5,000 canciones en calidad HD sin problema.`,
    cta: `¿Confirmamos? Escribe "OK" o "cambiar" para otra opción`
  },
  {
    id: 'ask_capacity_ok_5',
    stage: ConversationStage.ASK_CAPACITY_OK,
    contentVariant: 'videos',
    message: `¡Hola! 📺 Tu USB tendrá espacio para cientos de videos HD con la capacidad elegida.`,
    cta: `¿Te parece bien? Responde "OK" o dime si prefieres otra`
  },

  // ============= CONFIRM_SUMMARY Stage Templates =============
  // For users who need to confirm order summary
  
  {
    id: 'confirm_summary_1',
    stage: ConversationStage.CONFIRM_SUMMARY,
    contentVariant: 'general',
    message: `¡Hola! 📋 Tu pedido está casi listo.

Solo necesito tu confirmación para procesarlo y enviártelo.`,
    cta: `¿Todo bien? Responde "Sí" para confirmar o "No, quiero ajustar" si deseas cambiar algo`
  },
  {
    id: 'confirm_summary_2',
    stage: ConversationStage.CONFIRM_SUMMARY,
    contentVariant: 'general',
    message: `Hola 👋 Tienes un pedido pendiente por confirmar.

Revísalo y me dices si está todo correcto.`,
    cta: `Escribe "Sí" para proceder o dime qué te gustaría cambiar`
  },
  {
    id: 'confirm_summary_3',
    stage: ConversationStage.CONFIRM_SUMMARY,
    contentVariant: 'general',
    message: `¡Hola! ✅ Tu USB personalizada está lista para prepararse.

Solo falta tu confirmación final.`,
    cta: `¿Confirmamos? Responde "Sí/No" - Si quieres ajustar algo, dime qué cambiar`
  },
  {
    id: 'confirm_summary_4',
    stage: ConversationStage.CONFIRM_SUMMARY,
    contentVariant: 'general',
    message: `Hola 😊 Tu resumen de pedido te está esperando.

Puedo procesarlo tan pronto me confirmes.`,
    cta: `¿Listo? Escribe "Sí" para confirmar - O dime si necesitas modificar algo`
  },
  {
    id: 'confirm_summary_5',
    stage: ConversationStage.CONFIRM_SUMMARY,
    contentVariant: 'general',
    message: `¡Hola! 🚀 Tu pedido está a un paso de ser enviado.

Solo necesito que revises y confirmes.`,
    cta: `Responde "Sí" para procesar o cuéntame qué quieres ajustar`
  }
];

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

// ============= Stage-Based Template Functions =============

/**
 * Determine content type variant from session data
 */
function getContentVariant(session: UserSession): ContentTypeVariant {
  const sessionAny = session as any;
  const contentType = sessionAny.contentType || session.conversationData?.selectedType;
  
  if (!contentType) return 'general';
  
  const contentLower = String(contentType).toLowerCase();
  if (contentLower.includes('music') || contentLower.includes('musica')) return 'music';
  if (contentLower.includes('video') || contentLower.includes('clip')) return 'videos';
  if (contentLower.includes('movie') || contentLower.includes('pelicula') || contentLower.includes('serie')) return 'movies';
  
  return 'general';
}

/**
 * Get or initialize template history for a user
 */
function getTemplateHistory(phone: string): TemplateHistory {
  if (!userTemplateHistory.has(phone)) {
    userTemplateHistory.set(phone, {
      lastTemplateId: null,
      lastUsedAt: null,
      usedTemplateIds: []
    });
  }
  return userTemplateHistory.get(phone)!;
}

/**
 * Record template usage to prevent consecutive repetition
 */
function recordTemplateUsage(phone: string, templateId: string): void {
  const history = getTemplateHistory(phone);
  history.lastTemplateId = templateId;
  history.lastUsedAt = new Date();
  
  // Keep track of used templates (max 10 to allow rotation)
  if (!history.usedTemplateIds.includes(templateId)) {
    history.usedTemplateIds.push(templateId);
  }
  
  // Reset history after using all available templates for rotation
  if (history.usedTemplateIds.length > 10) {
    history.usedTemplateIds = [templateId];
  }
}

/**
 * Select a stage-based follow-up template with rotation logic
 * Ensures the same template is not used consecutively for the same user
 * 
 * @param session - User session
 * @param stage - Conversation stage
 * @returns Selected template with message and CTA combined
 */
export function selectStageTemplate(
  session: UserSession,
  stage: ConversationStage
): { templateId: string; message: string; fullMessage: string } {
  const phone = session.phone || session.phoneNumber || 'unknown';
  const contentVariant = getContentVariant(session);
  const history = getTemplateHistory(phone);
  
  // Get templates matching this stage
  let availableTemplates = STAGE_TEMPLATES.filter(t => t.stage === stage);
  
  // Filter by content variant, with fallback to general
  const variantTemplates = availableTemplates.filter(
    t => t.contentVariant === contentVariant || t.contentVariant === 'general'
  );
  
  if (variantTemplates.length > 0) {
    availableTemplates = variantTemplates;
  }
  
  if (availableTemplates.length === 0) {
    console.warn(`⚠️ No stage templates found for stage ${stage}, using fallback`);
    return {
      templateId: 'fallback',
      message: `¡Hola! 👋 ¿Podemos continuar con tu pedido?`,
      fullMessage: `¡Hola! 👋 ¿Podemos continuar con tu pedido?\n\nResponde SÍ para seguir o cuéntame si tienes alguna duda.`
    };
  }
  
  // Filter out the last used template to avoid consecutive repetition
  const freshTemplates = history.lastTemplateId
    ? availableTemplates.filter(t => t.id !== history.lastTemplateId)
    : availableTemplates;
  
  // Use fresh templates if available, otherwise reset and use any
  const finalTemplates = freshTemplates.length > 0 ? freshTemplates : availableTemplates;
  
  // Random selection for natural variation
  const randomIndex = Math.floor(Math.random() * finalTemplates.length);
  const selectedTemplate = finalTemplates[randomIndex];
  
  // Personalize with user name if available
  let message = selectedTemplate.message;
  const firstName = session.name ? session.name.split(' ')[0] : null;
  if (firstName && message.includes('¡Hola!')) {
    message = message.replace('¡Hola!', `¡Hola ${firstName}!`);
  } else if (firstName && message.includes('Hola ')) {
    message = message.replace('Hola ', `Hola ${firstName} `);
  }
  
  // Build full message with CTA
  const fullMessage = `${message}\n\n${selectedTemplate.cta}`;
  
  // Record this template as used
  recordTemplateUsage(phone, selectedTemplate.id);
  
  console.log(`📝 Selected stage template: ${selectedTemplate.id} for stage ${stage} (content: ${contentVariant})`);
  
  return {
    templateId: selectedTemplate.id,
    message: message,
    fullMessage: fullMessage
  };
}

/**
 * Build a complete stage-based follow-up message
 * This is the main entry point for stage-based follow-ups
 * 
 * @param session - User session
 * @param stage - Conversation stage (ASK_GENRE, ASK_CAPACITY_OK, CONFIRM_SUMMARY, etc.)
 * @param context - Additional context (capacity, contentType, etc.)
 * @returns Complete follow-up message with clear CTA
 */
export function buildStageFollowUpMessage(
  session: UserSession,
  stage: ConversationStage,
  context?: { capacity?: string; contentType?: string; price?: number }
): { message: string; templateId: string; hasClearCTA: boolean } {
  const result = selectStageTemplate(session, stage);
  
  let message = result.fullMessage;
  
  // Add context-specific personalization
  if (context) {
    // Add capacity info for ASK_CAPACITY_OK stage
    if (context.capacity && stage === ConversationStage.ASK_CAPACITY_OK) {
      message = message.replace(
        'capacidad que elegiste',
        `capacidad de ${context.capacity} que elegiste`
      );
      message = message.replace(
        'capacidad seleccionada',
        `capacidad de ${context.capacity}`
      );
      message = message.replace(
        'capacidad elegida',
        `capacidad de ${context.capacity}`
      );
    }
    
    // Add price info for CONFIRM_SUMMARY stage
    if (context.price && stage === ConversationStage.CONFIRM_SUMMARY) {
      const priceFormatted = context.price.toLocaleString('es-CO');
      message += `\n\n💰 Total: $${priceFormatted} (Envío GRATIS incluido)`;
    }
  }
  
  return {
    message,
    templateId: result.templateId,
    hasClearCTA: true  // All stage templates have clear CTAs
  };
}

/**
 * Get all available templates for a stage (for testing/admin purposes)
 */
export function getStageTemplates(stage: ConversationStage): StageFollowUpTemplate[] {
  return STAGE_TEMPLATES.filter(t => t.stage === stage);
}

/**
 * Get template history for a user (for debugging/admin purposes)
 */
export function getUserTemplateHistory(phone: string): TemplateHistory | null {
  return userTemplateHistory.get(phone) || null;
}

/**
 * Clear template history for a user (useful after long periods or for testing)
 */
export function clearUserTemplateHistory(phone: string): void {
  userTemplateHistory.delete(phone);
}

/**
 * Validate that a message has a clear call-to-action
 */
export function hasStrongCTA(message: string): boolean {
  const ctaPatterns = [
    /responde?\s*(["']?)(sí|si|no|ok|1|2|3|4|5)(["']?)/i,
    /escribe\s*[:.]?\s*(["']?)(\d|otro|sí|si|no|ok)(["']?)/i,
    /¿.*\?/,  // Question mark
    /dime\s+(qué|si|cual)/i,
    /confirma/i,
    /elige/i,
    /cuéntame/i
  ];
  
  return ctaPatterns.some(pattern => pattern.test(message));
}

// Export the stage templates for testing
export { STAGE_TEMPLATES };

console.log('✅ Persuasion Templates Service initialized with rotation logic and stage-based templates');
