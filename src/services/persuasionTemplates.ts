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
  // --- Attempt 1: Re-engage Warm ---
  {
    id: 'reeng_warm_1_a',
    category: 're-engage_warm',
    attemptNumber: 1,
    message: `¡Hola! 😊
    
Vi que estuviste mirando nuestras USBs personalizadas.
¿Puedo ayudarte con algo?

👉 Cuéntame qué tipo de contenido te interesa y te muestro las mejores opciones.

Responde cuando quieras, estoy aquí para ayudarte.`
  },
  {
    id: 'reeng_warm_1_b',
    category: 're-engage_warm',
    attemptNumber: 1,
    message: `Hola 👋

Parece que algo quedó pendiente en tu consulta.
¿Te gustaría que conversemos sobre las opciones de USBs personalizadas?

✨ Tengo varias capacidades y puedo ayudarte a elegir la ideal para ti.

¿Te muestro las opciones?`
  },
  {
    id: 'reeng_warm_1_c',
    category: 're-engage_warm',
    attemptNumber: 1,
    message: `¡Hola de nuevo! 😊

Me quedé pensando en tu consulta sobre USBs personalizadas.
¿Sigues interesado/a?

🎵 Puedo ayudarte con música, películas o videos.
Responde y seguimos. 👍`
  },

  // --- Attempt 2: Value/Benefit + Discount ---
  {
    id: 'value_disc_2_a',
    category: 'value_benefit',
    attemptNumber: 2,
    message: `¡Hola! 🌟

¡Tenemos una promoción especial hoy!

✨ OFERTA EXCLUSIVA:
• 10% descuento adicional al confirmar hoy
• Envío GRATIS a toda Colombia
• Playlist personalizada + carátulas incluidas
• Garantía 7 días de satisfacción

💰 8GB $54.900 • 32GB $84.900 • 64GB $119.900 • 128GB $159.900

📱 Responde 1/2/3/4 para reservar tu USB con el descuento.`,
    useMediaPath: true
  },
  {
    id: 'value_disc_2_b',
    category: 'discount_offer',
    attemptNumber: 2,
    message: `Hey! 👋

Solo por hoy: 15% OFF en cualquier USB personalizada.

🎁 INCLUYE:
• Contenido curado a tu gusto
• Envío express GRATIS
• Carátulas profesionales
• Soporte de por vida

¿Te armo una con descuento? Responde el número:
1️⃣ 8GB | 2️⃣ 32GB | 3️⃣ 64GB | 4️⃣ 128GB`,
    useMediaPath: true
  },
  {
    id: 'social_proof_2_a',
    category: 'social_proof',
    attemptNumber: 2,
    message: `Hola! 🌟

+500 clientes felices este mes eligieron nuestras USBs personalizadas.
⭐⭐⭐⭐⭐ 4.9/5 estrellas

🔥 OFERTA HOY:
• USB personalizada con 10% OFF
• Envío GRATIS
• Lista en 24-48 horas

💰 Desde $54.900 (8GB) hasta $159.900 (128GB)

¿Armamos la tuya? Responde 1/2/3/4 según capacidad.`
  },

  // --- Attempt 3: Urgency (Soft) + Final Offer ---
  {
    id: 'urgency_final_3_a',
    category: 'urgency_soft',
    attemptNumber: 3,
    message: `¡Hola! ⚡

*ÚLTIMA OPORTUNIDAD* 🔥

Esta es tu última chance para aprovechar nuestra oferta especial:

🎁 PACK ESPECIAL DE HOY:
• USB personalizada a tu gusto
• 15% OFF - Solo válido HOY
• Envío express GRATIS (24-48h)
• Soporte técnico de por vida

💰 8GB $54.900 • 32GB $84.900 • 64GB $119.900 • 128GB $159.900

⏰ Oferta expira en pocas horas.

👉 Responde 1/2/3/4 para cerrar tu pedido AHORA

📊 *Mini-encuesta rápida (opcional):*
¿Qué tan útil te parece este producto del 1 al 5?
(1=No me interesa, 5=¡Me encanta!)

Tu opinión nos ayuda a mejorar. 🙏`,
    useMediaPath: true
  },
  {
    id: 'content_teaser_3_a',
    category: 'content_teaser',
    attemptNumber: 3,
    message: `Hola! 🎵

Antes de irme, déjame mostrarte lo que incluye:

🎁 TU USB PERSONALIZADA:
✅ Playlist curada con tus géneros favoritos
✅ Organizada por carpetas (artista/género)
✅ Carátulas de alta calidad
✅ Índice PDF impreso
✅ Reparación GRATIS en 7 días si algo falla

*OFERTA FINAL:* 15% OFF solo hoy

¿La confirmamos? 
1️⃣ 8GB $46.715 | 2️⃣ 32GB $72.215
3️⃣ 64GB $101.915 | 4️⃣ 128GB $135.915

Si no te interesa, no hay problema. ¡Que tengas un gran día! 😊`
  },
  {
    id: 'urgency_final_3_b',
    category: 'urgency_soft',
    attemptNumber: 3,
    message: `👋 ¡Última llamada!

Vi que consultaste sobre USBs personalizadas.
Esta es mi oferta final para ti:

💎 SUPER COMBO:
• USB personalizada (elige capacidad)
• 15% descuento aplicado
• Envío express GRATIS
• Regalo sorpresa incluido

De $54.900 a $159.900 según capacidad
Con 15% OFF: desde $46.715

⏰ Solo válido las próximas horas.

Responde 1/2/3/4 o "no gracias" si prefieres.
Tu opinión es importante para nosotros. 🙏`
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
  
  return {
    lastTemplateId: (conversationData.lastTemplateUsed as string) || null,
    lastTemplateUsedAt: (conversationData.lastTemplateUsedAt as string) || null,
    totalTemplatesUsed: (conversationData.templatesUsedHistory as string[] || []).length
  };
}

console.log('✅ Persuasion Templates Service initialized with rotation logic');
