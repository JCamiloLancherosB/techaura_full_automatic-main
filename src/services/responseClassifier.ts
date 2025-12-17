/**
 * Response Classifier Service
 * Classifies user responses to determine follow-up behavior
 */

export type ResponseCategory = 
  | 'NEGATIVE'      // User declined or wants to opt-out
  | 'COMPLETED'     // User already completed/decided
  | 'CONFIRMATION'  // User confirmed receipt
  | 'POSITIVE'      // User is interested
  | 'NEUTRAL';      // Default category

export interface ClassificationResult {
  category: ResponseCategory;
  confidence: number; // 0-1
  matchedKeywords: string[];
}

/**
 * Keywords for negative responses (opt-out intent)
 */
const NEGATIVE_KEYWORDS = [
  // Spanish
  'no', 'no me interesa', 'no gracias', 'no quiero', 'no deseo',
  'parar', 'detener', 'cancelar', 'eliminar', 'borrar', 'remover',
  'ya no', 'no más', 'suficiente', 'basta', 'deja de', 'dejar de',
  'no molestar', 'no contactar', 'no enviar', 'no mandar',
  'no estoy interesado', 'no estoy interesada', 'no me llames',
  'no me escribas', 'no me contactes', 'déjame en paz',
  'bloquear', 'dar de baja', 'desuscribir', 'unsuscribe',
  // English
  'stop', 'unsubscribe', 'opt out', 'opt-out', 'optout',
  'remove', 'delete', 'cancel', 'quit', 'leave me alone',
  'not interested', 'no thanks', 'no thank you'
];

/**
 * Keywords for completed/decided responses
 */
const COMPLETED_KEYWORDS = [
  // Spanish
  'ya elegí', 'ya elegi', 'ya decidí', 'ya decidi', 'ya escogí', 'ya escogi',
  'ya compré', 'ya compre', 'ya lo hice', 'ya está', 'ya esta', 'ya lo tengo',
  'ya lo conseguí', 'ya lo consegui', 'ya lo obtuve', 'ya pedí', 'ya pedi',
  'ya ordené', 'ya ordene', 'ya realicé', 'ya realice', 'ya hecho',
  'ya lo resolví', 'ya lo resolvi', 'ya solucioné', 'ya solucione',
  'ya finalicé', 'ya finalice', 'ya terminé', 'ya termine',
  'listo ya', 'ya todo listo', 'todo listo', 'ya todo bien',
  // English
  'already chose', 'already decided', 'already bought', 'already purchased',
  'already got it', 'already have it', 'already done', 'all set',
  'already ordered', 'done already'
];

/**
 * Keywords for confirmation responses
 */
const CONFIRMATION_KEYWORDS = [
  // Spanish
  'recibido', 'ok', 'okay', 'vale', 'entendido', 'comprendo',
  'sí recibí', 'si recibi', 'si recibí', 'sí', 'si', 'claro',
  'perfecto', 'excelente', 'gracias', 'muchas gracias',
  'lo tengo', 'lo vi', 'lo leí', 'lo lei', 'visto',
  // English
  'received', 'got it', 'understood', 'roger', 'ack', 'acknowledged',
  'thanks', 'thank you', 'ok thanks', 'thanks received'
];

/**
 * Keywords for positive/interested responses
 */
const POSITIVE_KEYWORDS = [
  // Spanish
  'sí me interesa', 'si me interesa', 'me interesa', 'interesado', 'interesada',
  'quiero', 'deseo', 'necesito', 'busco', 'quisiera', 'me gustaría', 'me gustaria',
  'cuánto', 'cuanto', 'precio', 'costo', 'valor', 'cuánto cuesta', 'cuanto cuesta',
  'más información', 'mas información', 'más info', 'mas info', 'dime más', 'dime mas',
  'cuéntame', 'cuentame', 'explícame', 'explicame', 'háblame', 'hablame',
  'continuar', 'seguir', 'adelante', 'proceder',
  // English
  'interested', 'want', 'need', 'would like', 'tell me more',
  'how much', 'price', 'cost', 'continue', 'proceed', 'yes please'
];

/**
 * Normalize text for matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[¿?¡!.,;:]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains any keywords from the list
 */
function containsKeywords(text: string, keywords: string[]): { matched: boolean; keywords: string[] } {
  const normalized = normalizeText(text);
  const matchedKeywords: string[] = [];
  
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    
    // Exact word match or phrase match
    const regex = new RegExp(`\\b${normalizedKeyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(normalized)) {
      matchedKeywords.push(keyword);
    }
  }
  
  return {
    matched: matchedKeywords.length > 0,
    keywords: matchedKeywords
  };
}

/**
 * Classify user response
 */
export function classifyResponse(message: string): ClassificationResult {
  if (!message || message.trim().length === 0) {
    return {
      category: 'NEUTRAL',
      confidence: 0,
      matchedKeywords: []
    };
  }

  const text = message.trim();
  
  // Check negative keywords first (highest priority)
  const negativeCheck = containsKeywords(text, NEGATIVE_KEYWORDS);
  if (negativeCheck.matched) {
    return {
      category: 'NEGATIVE',
      confidence: 0.95,
      matchedKeywords: negativeCheck.keywords
    };
  }
  
  // Check completed keywords
  const completedCheck = containsKeywords(text, COMPLETED_KEYWORDS);
  if (completedCheck.matched) {
    return {
      category: 'COMPLETED',
      confidence: 0.9,
      matchedKeywords: completedCheck.keywords
    };
  }
  
  // Check confirmation keywords
  const confirmationCheck = containsKeywords(text, CONFIRMATION_KEYWORDS);
  if (confirmationCheck.matched) {
    // If message is very short (1-3 words) and matches confirmation, high confidence
    const wordCount = text.split(/\s+/).length;
    const confidence = wordCount <= 3 ? 0.85 : 0.7;
    
    return {
      category: 'CONFIRMATION',
      confidence,
      matchedKeywords: confirmationCheck.keywords
    };
  }
  
  // Check positive keywords
  const positiveCheck = containsKeywords(text, POSITIVE_KEYWORDS);
  if (positiveCheck.matched) {
    return {
      category: 'POSITIVE',
      confidence: 0.8,
      matchedKeywords: positiveCheck.keywords
    };
  }
  
  // Default to neutral
  return {
    category: 'NEUTRAL',
    confidence: 0.5,
    matchedKeywords: []
  };
}

/**
 * Determine if message should trigger opt-out
 */
export function shouldOptOut(message: string): boolean {
  const classification = classifyResponse(message);
  return classification.category === 'NEGATIVE' && classification.confidence >= 0.8;
}

/**
 * Determine if message indicates completion/closed
 */
export function shouldMarkClosed(message: string): boolean {
  const classification = classifyResponse(message);
  return classification.category === 'COMPLETED' && classification.confidence >= 0.8;
}

/**
 * Determine if message is a simple confirmation
 */
export function isSimpleConfirmation(message: string): boolean {
  const classification = classifyResponse(message);
  return classification.category === 'CONFIRMATION' && classification.confidence >= 0.7;
}

/**
 * Determine if message shows interest
 */
export function showsInterest(message: string): boolean {
  const classification = classifyResponse(message);
  return classification.category === 'POSITIVE' && classification.confidence >= 0.7;
}
