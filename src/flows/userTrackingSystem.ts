import fs, { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { businessDB } from '../mysql-database';
import { join } from 'path';
import path from 'path';
import type { UserSession, Interaction as GlobalInteraction } from '../../types/global';
import {
  calculateDemographicsSummary,
  calculatePreferencesSummary
} from './analyticsSummaryHelpers';
import { musicData } from './musicUsb';
import { videoData } from './videosUsb';
import { sessionLock } from '../services/sessionLock';
import { flowLogger } from '../services/flowLogger';
import { canReceiveFollowUps, hasReachedDailyLimit, resetFollowUpCounterIfNeeded, incrementFollowUpCounter } from '../services/incomingMessageHandler';

// ===== Type guards and helpers =====
/**
 * Extended conversation data interface for WhatsApp chat metadata
 */
interface ExtendedConversationData {
  whatsappChatActive?: boolean;
  whatsappChatMeta?: {
    activatedAt?: string;
    deactivatedAt?: string;
    agentId?: string | null;
    agentName?: string | null;
    source?: string;
    autoReleased?: boolean;
    autoReleasedAt?: string;
    autoReleasedReason?: string;
  };
  lastUnreadSweep?: string;
  followUpHistory?: string[];
  [key: string]: any; // Allow other properties
}

/**
 * Type guard to check if businessDB has updateUserSession method
 */
function hasUpdateUserSession(db: any): db is { updateUserSession: (phone: string, updates: any) => Promise<boolean> } {
  return db && typeof db.updateUserSession === 'function';
}

// ===== Anti-exceso y deduplicación =====
import crypto from 'crypto';

// ===== JID FORMATTING HELPER =====
/**
 * Ensures a phone number is formatted as a valid WhatsApp JID (e.g., "573001234567@s.whatsapp.net")
 * This prevents "Cannot read properties of undefined (reading 'id')" errors in Baileys
 */
export function ensureJID(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error(`Phone number must be a non-empty string, received: ${typeof phone}`);
  }
  
  // If already has JID suffix, return as-is
  if (phone.endsWith('@s.whatsapp.net') || phone.endsWith('@c.us')) {
    return phone;
  }
  
  // Remove any existing suffixes and clean the number
  const cleaned = phone
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/@lid$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/@broadcast$/i, '')
    .trim();
  
  // Return with proper JID suffix
  return `${cleaned}@s.whatsapp.net`;
}

// === CONFIGURACIÓN ANTI-BLOQUEO ===
const ANTI_BAN_CONFIG = {
  minDelay: 2000, // Mínimo 2 segundos de espera
  maxDelay: 15000, // Máximo 15 segundos de espera
  maxMessagesPerMinute: 8, // Límite de seguridad
  safetyCoolDown: 60000 // 1 minuto de pausa si se excede
};

let messageCounter = 0;
let lastResetTime = Date.now();

// ===== WORK/REST SCHEDULER (45 min work / 15 min rest) =====
interface WorkRestScheduler {
  isWorking: boolean;
  currentPeriodStartedAt: number;
  workDurationMs: number;  // 45 minutes
  restDurationMs: number;  // 15 minutes
}

const WORK_REST_SCHEDULER: WorkRestScheduler = {
  isWorking: true,
  currentPeriodStartedAt: Date.now(),
  workDurationMs: 45 * 60 * 1000,  // 45 minutes
  restDurationMs: 15 * 60 * 1000   // 15 minutes
};

/**
 * Check if we're in a work period (not rest period)
 * Returns true if we're in work mode, false if in rest mode
 */
function isInWorkPeriod(): boolean {
  const now = Date.now();
  const elapsed = now - WORK_REST_SCHEDULER.currentPeriodStartedAt;
  
  if (WORK_REST_SCHEDULER.isWorking) {
    // Check if work period has ended
    if (elapsed >= WORK_REST_SCHEDULER.workDurationMs) {
      // Switch to rest period
      WORK_REST_SCHEDULER.isWorking = false;
      WORK_REST_SCHEDULER.currentPeriodStartedAt = now;
      const restEndTime = new Date(now + WORK_REST_SCHEDULER.restDurationMs);
      console.log(`😴 Entrando en período de descanso de 15 minutos. Reanudaremos a las ${restEndTime.toLocaleTimeString()}`);
      return false;
    }
    return true;
  } else {
    // Check if rest period has ended
    if (elapsed >= WORK_REST_SCHEDULER.restDurationMs) {
      // Switch back to work period
      WORK_REST_SCHEDULER.isWorking = true;
      WORK_REST_SCHEDULER.currentPeriodStartedAt = now;
      const workEndTime = new Date(now + WORK_REST_SCHEDULER.workDurationMs);
      console.log(`💼 Reanudando período de trabajo de 45 minutos. Descanso a las ${workEndTime.toLocaleTimeString()}`);
      return true;
    }
    return false;
  }
}

/**
 * Get time remaining in current period (work or rest)
 */
function getTimeRemainingInCurrentPeriod(): { minutes: number; isWorkPeriod: boolean } {
  const now = Date.now();
  const elapsed = now - WORK_REST_SCHEDULER.currentPeriodStartedAt;
  const periodDuration = WORK_REST_SCHEDULER.isWorking 
    ? WORK_REST_SCHEDULER.workDurationMs 
    : WORK_REST_SCHEDULER.restDurationMs;
  const remaining = Math.max(0, periodDuration - elapsed);
  
  return {
    minutes: Math.ceil(remaining / 60000),
    isWorkPeriod: WORK_REST_SCHEDULER.isWorking
  };
}

// Función para simular comportamiento humano (typing...)
const randomDelay = async (): Promise<void> => {
  const delay = Math.floor(Math.random() * (ANTI_BAN_CONFIG.maxDelay - ANTI_BAN_CONFIG.minDelay + 1)) + ANTI_BAN_CONFIG.minDelay;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Función para verificar límite de tasa (Rate Limiting)
const checkRateLimit = (): boolean => {
  const now = Date.now();
  if (now - lastResetTime > 60000) {
    messageCounter = 0;
    lastResetTime = now;
  }

  if (messageCounter >= ANTI_BAN_CONFIG.maxMessagesPerMinute) {
    console.warn('⚠️ ALERTA ANTI-BAN: Límite de velocidad alcanzado. Pausando envíos.');
    return false;
  }

  messageCounter++;
  return true;
};

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Unified send window check: 08:00-22:00 only
 * This replaces all individual hour checks throughout the codebase
 */
function isWithinAllowedSendWindow(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 8 && h <= 22;
}

// Maintain backward compatibility
function isHourAllowed(date = new Date()): boolean {
  return isWithinAllowedSendWindow(date);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((Math.abs(a.getTime() - b.getTime())) / 86400000);
}

// === NUEVO: helper para excluir contactos con chat activo de WhatsApp ===
export function isWhatsAppChatActive(session: UserSession): boolean {
  const tags = (session.tags || []).map(t => t.toLowerCase());

  // Cualquier tag que sugiera chat humano activo en WhatsApp
  const hasWaTag = tags.some(t =>
    t === 'whatsapp_chat' ||
    t === 'chat_activo' ||
    t.startsWith('wa_chat') ||
    t.startsWith('whatsapp_') ||
    t.includes('soporte_whatsapp') ||
    t.includes('agente_whatsapp')
  );

  const flag = !!(session.conversationData && (session.conversationData as any).whatsappChatActive === true);

  return hasWaTag || flag;
}

// ===== NUEVO: Verificación de progreso significativo =====
export function hasSignificantProgress(session: UserSession): boolean {
  // 1. Ha seleccionado capacidad
  const hasSelectedCapacity = !!(
    (session as any).capacity ||
    (session.conversationData as any)?.selectedCapacity ||
    (session.customization as any)?.capacity ||
    (session.orderData as any)?.capacity
  );

  // 2. Ha proporcionado datos de envío
  const hasShippingData = !!(
    (session as any).customerData?.direccion ||
    (session as any).shippingAddress ||
    (session.conversationData as any)?.shippingData?.address ||
    (session.orderData as any)?.customerInfo?.address
  );

  // 3. Ha proporcionado datos personales completos
  const hasPersonalData = !!(
    session.name &&
    (
      (session as any).customerData?.nombre ||
      (session as any).customerData?.celular ||
      (session.conversationData as any)?.personalData?.fullName
    )
  );

  // 4. Tiene un pedido en progreso o confirmado
  const hasActiveOrder = !!(
    (session as any).orderId ||
    (session.orderData && ['draft', 'processing', 'confirmed', 'paid'].includes(session.orderData.status))
  );

  // 5. Ha personalizado contenido (géneros, artistas, etc.)
  const hasCustomizedContent = !!(
    ((session as any).selectedGenres && (session as any).selectedGenres.length > 0) ||
    ((session as any).mentionedArtists && (session as any).mentionedArtists.length > 0) ||
    ((session.preferences as any)?.musicGenres && (session.preferences as any).musicGenres.length > 2) ||
    ((session.conversationData as any)?.customization?.genres)
  );

  // 6. Está en etapa avanzada del proceso
  const isInAdvancedStage = [
    'closing',
    'order_confirmed',
    'processing',
    'payment_pending',
    'shipping',
    'completed',
    'converted'
  ].includes(session.stage);

  // Si cumple 2 o más condiciones, tiene progreso significativo
  const progressIndicators = [
    hasSelectedCapacity,
    hasShippingData,
    hasPersonalData,
    hasActiveOrder,
    hasCustomizedContent,
    isInAdvancedStage
  ].filter(Boolean).length;

  return progressIndicators >= 2;
}

// ===== Defensive session normalization to avoid null/undefined blocking follow-ups =====
/**
 * Normalizes session data to ensure all required fields are valid before follow-up checks.
 * Prevents null/undefined/invalid dates from blocking follow-up sends.
 */
export function normalizeSessionForFollowUp(session: UserSession): UserSession {
  const normalized = { ...session };
  
  // Normalize tags array
  if (!Array.isArray(normalized.tags)) {
    normalized.tags = [];
  }
  
  // Normalize stage with default
  if (!normalized.stage || typeof normalized.stage !== 'string') {
    normalized.stage = 'initial';
  }
  
  // Normalize conversationData
  if (!normalized.conversationData || typeof normalized.conversationData !== 'object') {
    normalized.conversationData = {};
  }
  
  // Normalize followUpHistory array
  const followUpHistory = normalized.conversationData.followUpHistory;
  if (!Array.isArray(followUpHistory)) {
    normalized.conversationData.followUpHistory = [];
  }
  
  // Normalize followUpCount24h to number
  if (typeof normalized.followUpCount24h !== 'number' || isNaN(normalized.followUpCount24h)) {
    normalized.followUpCount24h = 0;
  }
  
  // Safe date parsing for lastInteraction
  if (!normalized.lastInteraction || !(normalized.lastInteraction instanceof Date)) {
    try {
      if (normalized.lastInteraction) {
        normalized.lastInteraction = new Date(normalized.lastInteraction);
        if (isNaN(normalized.lastInteraction.getTime())) {
          normalized.lastInteraction = new Date(); // fallback to now
        }
      } else {
        normalized.lastInteraction = new Date(); // fallback to now
      }
    } catch {
      normalized.lastInteraction = new Date();
    }
  }
  
  // Safe date parsing for lastFollowUp (can be undefined)
  if (normalized.lastFollowUp && !(normalized.lastFollowUp instanceof Date)) {
    try {
      const parsed = new Date(normalized.lastFollowUp);
      normalized.lastFollowUp = isNaN(parsed.getTime()) ? undefined : parsed;
    } catch {
      normalized.lastFollowUp = undefined;
    }
  }
  
  // Safe date parsing for lastUserReplyAt (can be undefined)
  if (normalized.lastUserReplyAt && !(normalized.lastUserReplyAt instanceof Date)) {
    try {
      const parsed = new Date(normalized.lastUserReplyAt);
      normalized.lastUserReplyAt = isNaN(parsed.getTime()) ? undefined : parsed;
    } catch {
      normalized.lastUserReplyAt = undefined;
    }
  }
  
  // Safe date parsing for lastFollowUpResetAt (can be undefined)
  if (normalized.lastFollowUpResetAt && !(normalized.lastFollowUpResetAt instanceof Date)) {
    try {
      const parsed = new Date(normalized.lastFollowUpResetAt);
      normalized.lastFollowUpResetAt = isNaN(parsed.getTime()) ? undefined : parsed;
    } catch {
      normalized.lastFollowUpResetAt = undefined;
    }
  }
  
  return normalized;
}

// ===== NUEVO: Verificación completa antes de enviar seguimiento =====
export function canSendFollowUpToUser(session: UserSession): { ok: boolean; reason?: string } {
  // Normalize session before applying rules to avoid null/undefined issues
  const normalizedSession = normalizeSessionForFollowUp(session);
  
  // 1. Check contact status (OPT_OUT or CLOSED)
  const contactCheck = canReceiveFollowUps(normalizedSession);
  if (!contactCheck.can) {
    const reason = contactCheck.reason || 'contact_status_blocked';
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: ${reason}`);
    return { ok: false, reason };
  }
  
  // 2. Check if user has reached daily limit (max 1 follow-up per 24h)
  if (hasReachedDailyLimit(normalizedSession)) {
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: daily_limit_reached`);
    return { ok: false, reason: 'daily_limit_reached' };
  }
  
  // 3. Chat activo de WhatsApp
  if (isWhatsAppChatActive(normalizedSession)) {
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: whatsapp_chat_active`);
    return { ok: false, reason: 'whatsapp_chat_active' };
  }

  // 4. Usuario ya convertido o completado
  if (normalizedSession.stage === 'converted' || normalizedSession.stage === 'completed') {
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: already_converted`);
    return { ok: false, reason: 'already_converted' };
  }

  // 5. Usuario con decisión tomada (eligió capacidad, dio datos)
  if (normalizedSession.tags && normalizedSession.tags.includes('decision_made')) {
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: decision_already_made`);
    return { ok: false, reason: 'decision_already_made' };
  }

  // 6. Blocked stages that should not receive automatic follow-ups (critical order process)
  const blockedStages = [
    'converted',
    'completed',
    'order_confirmed',
    'processing',
    'payment_confirmed',
    'shipping',
    'closing', // User is closing the purchase
    'awaiting_payment' // User is providing payment data
  ];

  if (blockedStages.includes(normalizedSession.stage)) {
    const reason = `blocked_stage: ${normalizedSession.stage}`;
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: ${reason}`);
    return { ok: false, reason };
  }

  // 7. Verify maximum follow-ups per user limit
  const followUpHistory = (normalizedSession.conversationData?.followUpHistory || []) as string[];
  if (followUpHistory.length >= 4) { // Reduced from 6 to 4 to be less insistent
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: max_followups_reached (${followUpHistory.length}/4)`);
    return { ok: false, reason: 'max_followups_reached' };
  }

  // 8. Verify minimum time since last follow-up (HARDENED: 8h default, 4h with progress)
  if (normalizedSession.lastFollowUp) {
    const hoursSinceLastFollowUp = (Date.now() - normalizedSession.lastFollowUp.getTime()) / 36e5;
    // HARDENED: Increased from 6h/3h to 8h/4h to reduce rapid re-contacts
    const minHours = hasSignificantProgress(normalizedSession) ? 4 : 8;

    if (hoursSinceLastFollowUp < minHours) {
      const reason = `too_soon: ${hoursSinceLastFollowUp.toFixed(1)}h < ${minHours}h`;
      console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: ${reason}`);
      return { ok: false, reason };
    }
  }

  // 9. Verify sufficient silence since user's last reply (ANTI-BAN: 20min minimum, 60-120min for proactive)
  if (normalizedSession.lastUserReplyAt) {
    const minutesSinceLastReply = (Date.now() - normalizedSession.lastUserReplyAt.getTime()) / 60000;
    
    // ANTI-BAN: Minimum 20 minutes since last user interaction before any proactive message
    // Higher thresholds for users without significant progress to avoid spam
    const minReplyWait = hasSignificantProgress(normalizedSession) ? 60 : 120;
    if (minutesSinceLastReply < minReplyWait) {
      const reason = `recent_user_reply: ${minutesSinceLastReply.toFixed(0)}min < ${minReplyWait}min`;
      console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: ${reason}`);
      return { ok: false, reason };
    }
  }
  
  // 10. Verify sufficient silence since last interaction (ANTI-BAN: 20min absolute minimum)
  const minutesSinceLastInteraction = (Date.now() - normalizedSession.lastInteraction.getTime()) / 60000;

  // ANTI-BAN: Enforce absolute minimum of 20 minutes since last interaction for proactive messages
  // This prevents rapid re-contact that could trigger WhatsApp bans
  if (minutesSinceLastInteraction < 20) {
    const reason = `recent_interaction: ${minutesSinceLastInteraction.toFixed(0)}min < 20min (anti-ban minimum)`;
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: ${reason}`);
    return { ok: false, reason };
  }

  // Additional threshold for users without significant progress (60-120min)
  const minSilenceMinutes = hasSignificantProgress(normalizedSession) ? 60 : 120;

  if (minutesSinceLastInteraction < minSilenceMinutes) {
    const reason = `insufficient_silence: ${minutesSinceLastInteraction.toFixed(0)}min < ${minSilenceMinutes}min`;
    console.log(`🚫 Follow-up blocked for ${normalizedSession.phone}: ${reason}`);
    return { ok: false, reason };
  }

  return { ok: true };
}

// Limites globales de envío
const RATE_GLOBAL = {
  perHourMax: 10000,
  perDayMax: 50000,
  hourWindowStart: Date.now(),
  hourCount: 0,
  dayWindowStart: Date.now(),
  dayCount: 0
};

function resetIfNeeded() {
  // Solo para debug; no aplicamos bloqueo real
  RATE_GLOBAL.hourWindowStart = Date.now();
  RATE_GLOBAL.dayWindowStart = Date.now();
}

function canSendGlobal(): boolean {
  return true; // sin bloqueo global real
}

function markGlobalSent() {
  RATE_GLOBAL.hourCount++;
  RATE_GLOBAL.dayCount++;
}

// Por-usuario: ACTUALIZADO con verificación de progreso
function canSendUserFollowUp(session: UserSession): { ok: boolean; reason?: string } {
  // Usar la verificación mejorada que considera progreso del usuario
  const result = canSendFollowUpToUser(session);
  
  // Si tiene progreso significativo, aplicar límites más flexibles
  if (!result.ok && hasSignificantProgress(session)) {
    const hoursSinceLastFollowUp = session.lastFollowUp 
      ? (Date.now() - new Date(session.lastFollowUp).getTime()) / 3600000 
      : 999;
    
    // Permitir seguimiento cada 12h en lugar de 24h para usuarios con progreso
    if (hoursSinceLastFollowUp >= 12) {
      console.log(`✅ Usuario con progreso significativo: permitiendo seguimiento después de ${hoursSinceLastFollowUp.toFixed(1)}h`);
      return { ok: true };
    }
  }
  
  return result;
}

function recordUserFollowUp(session: UserSession) {
  session.lastFollowUp = new Date();
  session.conversationData = session.conversationData || {};
  const history: string[] = (session.conversationData.followUpHistory || []) as string[];
  history.push(new Date().toISOString());
  session.conversationData.followUpHistory = history.slice(-10);
}

// === NUEVO: Reset de recordatorios tras compra/convertido ===
export function resetFollowUpCountersForUser(session: UserSession) {
  session.conversationData = session.conversationData || {};
  session.conversationData.followUpHistory = [];
  session.lastFollowUp = undefined as any;
  session.lastFollowUpMsg = undefined;
}

// ===== Control de retraso entre mensajes (3 segundos entre usuarios) =====
let lastFollowUpTimestamp = 0;
const FOLLOWUP_DELAY_MS = 3000; // 3 segundos como baseline coherente

async function waitForFollowUpDelay() {
  const now = Date.now();
  const elapsed = now - lastFollowUpTimestamp;
  if (elapsed < FOLLOWUP_DELAY_MS) {
    const waitTime = FOLLOWUP_DELAY_MS - elapsed;
    console.log(`⏳ Esperando ${waitTime}ms antes del próximo seguimiento...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastFollowUpTimestamp = Date.now();
}

export type SentimentType = 'positive' | 'neutral' | 'negative';
export interface Interaction extends GlobalInteraction { }
type Channel = 'WhatsApp' | 'Instagram' | 'Telegram' | 'Web';

function createInteraction(
  message: string,
  type: 'user_message' | 'bot_message' | 'system_event',
  options?: {
    intent?: string;
    sentiment?: SentimentType;
    engagement_level?: number;
    channel?: string;
    respondedByBot?: boolean;
    metadata?: Record<string, any>;
  }
): Interaction {
  return {
    timestamp: new Date(),
    message: (message || '').toString().trim(),
    type,
    intent: options?.intent || 'general',
    sentiment: options?.sentiment || 'neutral',
    engagement_level: options?.engagement_level || 50,
    channel: options?.channel || 'WhatsApp',
    respondedByBot: options?.respondedByBot || false,
    ...(options?.metadata ? { metadata: options.metadata } : {})
  };
}

export interface ExtendedContext {
  currentFlow: string;
  from: string;
  body: string;
  name?: string;
  pushName?: string;
  session?: UserSession;
}

interface AIAnalysis {
  buyingIntent: number;
  interests: string[];
  nextBestAction: string;
  followUpTime: Date;
  riskLevel: 'low' | 'medium' | 'high';
  engagementScore: number;
  probabilityToConvert: number;
  churnLikelihood: number;
}

type USBContentType = 'musica' | 'videos' | 'peliculas';

const musicOptions = [
  { id: 1, label: '8GB', desc: '1,400 canciones', price: 54900, emoji: '🚀' },
  { id: 2, label: '32GB', desc: '5,000 canciones', price: 84900, emoji: '🌟' },
  { id: 3, label: '64GB', desc: '10,000 canciones', price: 119900, emoji: '🔥' },
  { id: 4, label: '128GB', desc: '25,000 canciones', price: 154900, emoji: '🏆' }
];

const videoOptions = [
  { id: 1, label: '8GB', desc: '260 videos', price: 54900 },
  { id: 2, label: '32GB', desc: '1,000 videos', price: 84900 },
  { id: 3, label: '64GB', desc: '2,000 videos', price: 119900 },
  { id: 4, label: '128GB', desc: '4,000 videos', price: 154900 }
];

const movieOptions = [
  { id: 1, label: '8GB', desc: 'Hasta 10 películas o 30 episodios', price: 54900 },
  { id: 2, label: '32GB', desc: 'Hasta 30 películas o 90 episodios', price: 84900 },
  { id: 3, label: '64GB', desc: 'Hasta 70 películas o 210 episodios', price: 119900 },
  { id: 4, label: '128GB', desc: '140 películas o 420 episodios', price: 154900 }
];

const musicGenres = [
  'bachata', 'bailables', 'baladas', 'banda', 'blues', 'boleros', 'clasica', 'country',
  'cumbia', 'diciembre', 'electronica', 'funk', 'gospel', 'hiphop', 'indie', 'jazz',
  'merengue', 'metal', 'norteñas', 'punk', 'r&b', 'rancheras', 'reggaeton', 'rock',
  'salsa', 'techno', 'vallenato', 'pop', 'tropical', 'cristiana', 'trap', 'house', 'k-pop',
  'reggae', 'latino', 'romántica', 'urbano', 'alternativo', 'electropop', 'ska'
];

// ===== HELPERS PARA MENSAJES DE PRECIOS POR TIPO DE USB =====

// Rutas de imágenes de tablas de precios
const PRICING_IMAGES = {
  music: path.resolve(__dirname, '../Portada/pricing_music_table.png'),
  videos: path.resolve(__dirname, '../Portada/pricing_video_table.png'),
  movies: path.resolve(__dirname, '../Portada/pricing_movies_table.png')
};

// Determina el tipo de contenido principal según flujo actual o intereses
function detectContentTypeForSession(session: UserSession): USBContentType {
  const flow = (session.currentFlow || '').toLowerCase();
  if (/musicusb|music|capacity_music/.test(flow)) return 'musica';
  if (/videosusb|video|capacityvideo/.test(flow)) return 'videos';
  if (/moviesusb|movies|peliculas|movies_/.test(flow)) return 'peliculas';

  const interests = (session.interests || []).map(i => i.toLowerCase());
  if (interests.some(i => i.includes('music'))) return 'musica';
  if (interests.some(i => i.includes('video'))) return 'videos';
  if (interests.some(i => i.includes('movie') || i.includes('pelicula'))) return 'peliculas';

  // Fallback por preferencias/conversationData
  const cd = (session.conversationData || {}) as any;
  if (cd.selectedType === 'music') return 'musica';
  if (cd.selectedType === 'videos') return 'videos';
  if (cd.selectedType === 'movies') return 'peliculas';

  return 'musica';
}

// Construye payload (texto + imagen de tabla de precios) según tipo de contenido
async function buildPricingFollowUpPayload(session: UserSession): Promise<{ body: string; mediaPath?: string; }> {
  const type = detectContentTypeForSession(session);
  const body = buildSoftPricingMessage(session, type);

  let mediaPath: string | undefined;
  const imgPath =
    type === 'musica'
      ? PRICING_IMAGES.music
      : type === 'videos'
        ? PRICING_IMAGES.videos
        : PRICING_IMAGES.movies;

  console.log('[PRICING_IMG] Tipo:', type, '| Ruta calculada:', imgPath);

  try {
    if (imgPath) {
      await fs.promises.access(imgPath);
      console.log('[PRICING_IMG] Imagen encontrada, usando:', imgPath);
      mediaPath = imgPath;
    }
  } catch (e) {
    console.warn(`⚠️ No se encontró imagen de precios para tipo=${type} en ruta ${imgPath}`, e);
    mediaPath = undefined;
  }

  return { body, mediaPath };
}

function buildIrresistibleOffer(session: UserSession): string {
  const name = session.name ? session.name.split(' ')[0] : ''; const greet = name ? `¡Hola ${name}!` : '¡Hola!'; const type = detectContentTypeForSession(session); const bonus = '🎁 BONUS: índice PDF + carátulas + reparación gratuita si algo falla (7 días).'; const prices = '💰 8GB $54.900 • 32GB $84.900 • 64GB $119.900 • 128GB $159.900.'; const cta = 'Responde 1/2/3/4 y te la dejo reservada ahora mismo.';
  if (type === 'musica') {
    return [
      `${greet} 🔥 Oferta de hoy (solo por pocas horas):`,
      '• Upgrade -15% aplicado al confirmar',
      '• 2da USB -35% (ideal para regalo)',
      prices,
      bonus,
      cta
    ].join('\n');
  }
  if (type === 'videos') {
    return [
      `${greet} 🔥 Oferta de hoy en USB de VIDEOS:`,
      '• Combo Música+Videos -25%',
      prices,
      bonus,
      cta
    ].join('\n');
  }
  return [
    `${greet} 🔥 Oferta de hoy en USB de PELÍCULAS/SERIES:`,
    '• Garantía de compatibilidad + envío GRATIS',
    prices,
    bonus,
    cta
  ].join('\n');
}

const PERSUASION_TECHNIQUES = {
  scarcity: [
    "⏳ Últimas horas con envío gratis hoy",
    "🏁 Cierra ahora y dejo tu USB armada hoy mismo",
    "⏰ Solo quedan 3 USBs con tu configuración personalizada",
    "🔥 Oferta válida solo hasta medianoche - ¡No la pierdas!",
    "📦 Últimas unidades disponibles con envío gratis"
  ],
  social_proof: [
    "🌟 +500 clientes felices este mes eligieron esta USB",
    "👥 María de Bogotá acaba de pedir la misma configuración que tú",
    "⭐ 4.9/5 estrellas - La USB más recomendada del mes"
  ],
  authority: [
    "🏆 Recomendado por expertos en audio como la mejor calidad",
    "🎵 Certificado por ingenieros de sonido profesionales",
    "📱 Tecnología avalada por +1000 DJs profesionales"
  ],
  reciprocity: [
    "🎁 Como agradecimiento, te incluyo una playlist exclusiva GRATIS",
    "💝 Por ser cliente VIP, te regalo 2GB adicionales",
    "🌟 Bonus especial: audífonos premium de cortesía"
  ]
} as const;

const trackUserMetrics = (metrics: {
  phoneNumber: string;
  stage: string;
  intent: string;
  messageType?: string;
  buyingIntent: number;
  flow: string;
  isPredetermined: boolean;
}) => {
  try {
    console.log(`📊 [METRICS] ${metrics.phoneNumber}: Stage=${metrics.stage}, Intent=${metrics.intent}, BuyingIntent=${metrics.buyingIntent}%`);
  } catch (error) {
    console.warn('⚠️ Error en trackUserMetrics:', error);
  }
};

// Variables globales
export const userSessions: Map<string, UserSession> = new Map();
export const followUpQueue = new Map<string, NodeJS.Timeout>();
let botInstance: any = null;

// ✅ CACHE GLOBAL PARA CONTROL DE PROCESAMIENTO
declare global {
  // eslint-disable-next-line no-var
  var processingCache: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var userSessions: Map<string, UserSession> | undefined;
}

// Clase de gestión de sesiones
class UserTrackingSystem {
  private sessionsFile: string;
  private dataDir: string;

  constructor() {
    this.dataDir = join(process.cwd(), 'data');
    this.sessionsFile = join(this.dataDir, 'user_sessions.json');
    this.ensureDataDirectory();
    this.loadSessions();
    this.startAutoSave();
    this.startCleanupTask();
  }

  private ensureDataDirectory() {
    try {
      if (!existsSync(this.dataDir)) {
        mkdirSync(this.dataDir, { recursive: true });
        console.log('📁 Directorio de datos creado');
      }
    } catch (error) {
      console.error('❌ Error creando directorio de datos:', error);
    }
  }

  private loadSessions() {
    try {
      if (!existsSync(this.sessionsFile)) return;

      const data = readFileSync(this.sessionsFile, 'utf8');
      if (!data || !data.trim()) return;

      const sessionsArray = JSON.parse(data);
      if (!Array.isArray(sessionsArray)) return;

      sessionsArray.forEach((session: any) => {
        const dateFields = ['lastInteraction', 'createdAt', 'updatedAt', 'lastActivity', 'lastFollowUp'];
        dateFields.forEach(f => {
          if (session[f]) session[f] = new Date(session[f]);
        });

        if (Array.isArray(session.interactions)) {
          session.interactions = session.interactions.map((i: any) => ({
            ...i,
            timestamp: i.timestamp ? new Date(i.timestamp) : new Date()
          }));
        }

        userSessions.set(session.phoneNumber || session.phone, session);
      });

      console.log(`📊 Cargadas ${userSessions.size} sesiones de usuario`);
    } catch (error) {
      console.error('❌ Error cargando sesiones:', error);
    }
  }

  private saveSessions() {
    try {
      const sessionsArray = Array.from(userSessions.values());
      const json = jsonStringifySafe(sessionsArray, 2);
      writeFileSync(this.sessionsFile, json, 'utf8');
    } catch (error) {
      console.error('❌ Error guardando sesiones:', error);
    }
  }

  private startAutoSave() {
    setInterval(() => this.saveSessions(), 30000);
  }

  private startCleanupTask() {
    setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
  }

  private cleanupOldSessions() {
    const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    Array.from(userSessions.entries()).forEach(([phoneNumber, session]) => {
      if (session.lastInteraction < cutoffTime && session.stage !== 'converted') {
        userSessions.delete(phoneNumber);
        if (followUpQueue.has(phoneNumber)) {
          clearTimeout(followUpQueue.get(phoneNumber)!);
          followUpQueue.delete(phoneNumber);
        }
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Limpiadas ${cleaned} sesiones antiguas`);
    }
  }

  public async getUserSession(phoneNumber: string): Promise<UserSession> {
    let session = userSessions.get(phoneNumber);

    if (!session) {
      session = this.createDefaultUserSession(phoneNumber);
      userSessions.set(phoneNumber, session);
      console.log(`✅ Nueva sesión creada para ${phoneNumber}`);
    } else {
      session.lastInteraction = new Date();
      session.lastActivity = new Date();
      session.isActive = true;
    }

    return session;
  }

  private createDefaultUserSession(phoneNumber: string): UserSession {
    const now = new Date();
    return {
      phone: phoneNumber,
      phoneNumber: phoneNumber,
      name: '',
      buyingIntent: 0,
      stage: 'initial',
      interests: [],
      conversationData: {},
      currentFlow: 'initial',
      currentStep: 'welcome',
      createdAt: now,
      updatedAt: now,
      lastInteraction: now,
      lastActivity: now,
      interactions: [],
      isFirstMessage: true,
      isPredetermined: false,
      skipWelcome: false,
      tags: [],
      messageCount: 0,
      isActive: true,
      isNewUser: true,
      isReturningUser: false,
      followUpSpamCount: 0,
      totalOrders: 0,
      demographics: {},
      preferences: {},
      customization: {
        step: 0,
        preferences: {},
        totalPrice: 0,
      }
    };
  }
}

// Instancia única del sistema
const trackingSystem = new UserTrackingSystem();

export function toPlainJSON(input: any, maxDepth = 3): any {
  const seen = new WeakSet();
  function walk(val: any, depth: number): any {
    if (val == null) return val;
    if (depth <= 0) return '[MaxDepth]';
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') return val;
    if (t === 'bigint') return val.toString();
    if (t === 'function' || t === 'symbol') return undefined;

    if (Array.isArray(val)) return val.slice(0, 100).map(v => walk(v, depth - 1));

    if (t === 'object') {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);

      const ctor = val.constructor && val.constructor.name;
      if (ctor && ['Map', 'Set', 'WeakMap', 'WeakSet', 'Timeout', 'Immediate'].includes(ctor)) {
        return `[${ctor}]`;
      }

      const out: any = {};
      for (const k of Object.keys(val)) {
        out[k] = walk(val[k], depth - 1);
      }
      return out;
    }
    return undefined;
  }
  return walk(input, maxDepth);
}

// util global segura
export function jsonStringifySafe(value: any, space: number = 2): string {
  const seen = new WeakSet();
  const MAX_ARRAY = 5000;

  function replacer(this: any, key: string, val: any) {
    if (typeof val === 'function' || typeof val === 'symbol') return undefined;

    if (
      val instanceof Map || val instanceof Set ||
      val instanceof WeakMap || val instanceof WeakSet
    ) {
      return { type: Object.prototype.toString.call(val), size: (val as any).size };
    }

    if (val && typeof val === 'object') {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }

    if (Array.isArray(val) && val.length > MAX_ARRAY) {
      return [...val.slice(0, MAX_ARRAY), `...+${val.length - MAX_ARRAY} more`];
    }

    if (val && typeof val === 'object') {
      const ctor = val.constructor && val.constructor.name;
      if (ctor === 'Timeout' || ctor === 'Immediate') return `[${ctor}]`;
    }

    return val;
  }

  try {
    return JSON.stringify(value, replacer, space);
  } catch {
    return JSON.stringify({ error: 'stringify_failed' });
  }
}

export function validateSentiment(sentiment: any): SentimentType {
  if (typeof sentiment === 'string') {
    const normalizedSentiment = sentiment.toLowerCase().trim();
    if (normalizedSentiment === 'positive' || normalizedSentiment === 'positivo') return 'positive';
    if (normalizedSentiment === 'negative' || normalizedSentiment === 'negativo') return 'negative';
    if (normalizedSentiment === 'neutral') return 'neutral';
  }
  return 'neutral';
}

function createSafeInteraction(
  message: string,
  type: 'user_message' | 'bot_message' | 'system_event',
  analysis?: {
    intent?: string;
    sentiment?: any;
    engagement?: number;
  },
  channel?: string
): Interaction {
  return {
    message,
    timestamp: new Date(),
    type,
    intent: analysis?.intent || 'general',
    sentiment: analysis?.sentiment ? validateSentiment(analysis.sentiment) : 'neutral',
    engagement_level: analysis?.engagement || 50,
    channel: channel || 'WhatsApp',
    respondedByBot: false
  };
}

// Clase de IA Simple
class SimpleAI {
  static analyzeMessage(message: string, currentFlow: string): {
    intent: string;
    sentiment: SentimentType;
    engagement: number
  } {
    const msg = (message || '').toLowerCase();
    let intent = 'unknown';

    if (currentFlow.includes('music') && musicGenres.some(genre => msg.includes(genre))) {
      intent = 'music_customization';
    } else if (/(precio|costo|valor|cuesta)/.test(msg)) {
      intent = 'pricing';
    } else if (/(ok|continuar|siguiente|perfecto)/.test(msg)) {
      intent = 'continue';
    } else if (/(comprar|quiero|me interesa|ordenar)/.test(msg)) {
      intent = 'buying';
    } else if (/(no me interesa|no quiero|cancelar|no gracias)/.test(msg)) {
      intent = 'rejection';
    } else if (/(personalizado|cambiar|agregar)/.test(msg)) {
      intent = 'customization';
    } else if (/(sí|si|genial|excelente|perfecto)/.test(msg)) {
      intent = 'positive_response';
    }

    let sentiment: SentimentType = 'neutral';
    const positiveWords = ['genial', 'perfecto', 'excelente', 'me gusta', 'interesante', 'bueno', 'sí', 'si', 'ok', 'continuar', 'gracias', 'super', 'increíble'];
    const negativeWords = ['no me interesa', 'no quiero', 'caro', 'cancelar', 'después', 'luego', 'aburrido', 'demorado', 'malo'];

    if (positiveWords.some(word => msg.includes(word))) sentiment = 'positive';
    else if (negativeWords.some(word => msg.includes(word))) sentiment = 'negative';

    let engagement = 5;
    if (sentiment === 'positive') engagement += 3;
    if (sentiment === 'negative') engagement -= 2;
    if (msg.length > 50) engagement += 1;
    if (intent === 'buying') engagement += 3;
    if (intent === 'music_customization') engagement += 2;
    if (intent === 'continue') engagement += 1;

    return { intent, sentiment, engagement: Math.max(1, Math.min(10, engagement)) };
  }

  static analyzeBuyingIntent(session: UserSession): number {
    let score = 0;
    const recentInteractions = session.interactions?.slice(-5) || [];

    recentInteractions.forEach(interaction => {
      if (interaction.intent === 'buying') score += 25;
      if (interaction.intent === 'pricing') score += 15;
      if (interaction.intent === 'music_customization') score += 12;
      if (interaction.intent === 'customization') score += 10;
      if (interaction.intent === 'continue') score += 8;
      if (interaction.intent === 'positive_response') score += 5;
      if (interaction.sentiment === 'positive') score += 5;
      if (interaction.sentiment === 'negative') score -= 10;
      score += interaction.engagement_level || 0;
    });

    if (session.tags?.includes('VIP')) score += 10;
    if ((session as any).isVIP) score += 10;
    if (session.tags?.includes('blacklist')) score = 0;

    return Math.max(0, Math.min(100, score));
  }

  static getNextBestAction(session: UserSession): string {
    const buyingIntent = this.analyzeBuyingIntent(session);
    const timeSinceLastInteraction = Date.now() - session.lastInteraction.getTime();
    const hoursSinceLastInteraction = timeSinceLastInteraction / (1000 * 60 * 60);

    if (buyingIntent > 70) return 'send_pricing_offer';
    if (buyingIntent > 50) return 'send_demo_samples';
    if (hoursSinceLastInteraction > 24 && (session.stage === 'interested' || session.stage === 'customizing')) return 'follow_up_interested';
    if (hoursSinceLastInteraction > 72 && session.stage === 'customizing') return 'follow_up_urgent';
    if (session.interactions?.slice(-1)[0]?.sentiment === 'negative') return 'send_special_offer';
    if (session.tags?.includes('blacklist')) return 'do_not_contact';

    return 'monitor';
  }

  static engagementScore(session: UserSession): number {
    const engagementLevels = session.interactions?.map(i => i.engagement_level || 0) || [];
    if (!engagementLevels.length) return 0;
    return Math.round(engagementLevels.reduce((a, b) => a + b, 0) / engagementLevels.length * 10);
  }

  static probabilityToConvert(session: UserSession): number {
    return Math.round((this.analyzeBuyingIntent(session) + this.engagementScore(session)) / 2);
  }

  static churnLikelihood(session: UserSession): number {
    let risk = 0;
    const last = session.interactions?.slice(-1)[0];
    const mins = (Date.now() - session.lastInteraction.getTime()) / (1000 * 60);

    if (mins > 240) risk += 30;
    if (mins > 1440) risk += 50;
    if (last?.sentiment === 'negative') risk += 30;
    if (session.stage === 'abandoned') risk += 30;

    return Math.min(100, risk);
  }
}

// Utilidades
function asUSBContentType(input: string): USBContentType {
  if (input === 'musica' || input === 'videos' || input === 'peliculas') return input;
  return 'musica';
}

function generateUSBSelectionMessage(contentType: USBContentType): string {
  if (contentType === 'musica') {
    return `🎵 ¡Selecciona la cantidad de canciones y lleva tu música favorita a todas partes! 🎶

  ${musicOptions.map(opt => `${opt.id}. ${opt.emoji} ${opt.label} - ¡${opt.desc} por solo $${opt.price.toLocaleString('es-CO')}!`).join('\n')}
              
  👉 Escribe el número de tu elección y comienza a disfrutar!`;
  }
  if (contentType === 'videos') {
    return `🎬 Selecciona la cantidad de vídeos en USB que deseas:

  ${videoOptions.map(opt => `${opt.id}. ${opt.label} - ${opt.desc} - $${opt.price.toLocaleString('es-CO')}`).join('\n')}
  Escribe el número de tu elección:`;
  }
  return `🍿 Selecciona cualquier película o serie, o solicita todo variado:

  ${movieOptions.map(opt => `${opt.id}. USB ${opt.label}: ${opt.desc}. 👉 Oferta exclusiva: $${opt.price.toLocaleString('es-CO')}`).join('\n')}
  *En la opción 4 (128GB), disfruta de un 30% de descuento en la segunda USB.*`;
}

function getUSBPriceDesc(contentType: USBContentType, optionId: number) {
  if (contentType === 'musica') return musicOptions.find(opt => opt.id === optionId);
  if (contentType === 'videos') return videoOptions.find(opt => opt.id === optionId);
  return movieOptions.find(opt => opt.id === optionId);
}

function detectSessionStage(session: UserSession, analysis: { intent: string, sentiment: SentimentType }, message: string): string {
  const msg = message.toLowerCase();

  if (/\bbaladas\b/.test(msg) && /(60|70|80|90)/.test(msg) && /(sin relleno|sin repetidas|no repetidas)/i.test(msg)) {
    return 'customizing';
  }

  if (/finalizar pedido|confirmar compra|método de pago|transferencia|pago|nombre completo|dirección|celular|envío a|pagar|factura|comprobante|recibo|domicilio/.test(msg)) {
    return 'closing';
  }
  if (/(quiero|deseo|voy a|me interesa|comprar|listo para|confirmo|realizar pedido|adquirir|pido|hazme el pedido)/.test(msg) ||
    analysis.intent === 'buying') {
    return 'interested';
  }
  if (/(cuánto|cuanto|precio|costo|valor|cuánto vale|descuento|promoción|oferta|pago|formas de pago|precio final)/.test(msg) ||
    analysis.intent === 'pricing') {
    return 'pricing';
  }
  if (/(demo|ejemplo|muestra|quiero escuchar|quiero ver|playlist|personalizada|géneros a incluir|puedes agregar|puedes quitar)/.test(msg) ||
    analysis.intent === 'customization' || analysis.intent === 'music_customization') {
    return 'customizing';
  }
  if (/(sí|si|me gusta|genial|excelente|ok|perfecto|dale|continúa|avísame|dime más|interesante)/.test(msg) ||
    analysis.intent === 'positive_response') {
    if (session.stage === 'customizing' || session.stage === 'pricing') return session.stage;
    return 'interested';
  }
  if (/(no quiero|no me interesa|muy caro|más adelante|luego|después|no gracias|tal vez|no por ahora|cancelar)/.test(msg) ||
    analysis.intent === 'rejection' ||
    analysis.sentiment === 'negative') {
    return 'abandoned';
  }
  if (session.lastInteraction && (Date.now() - session.lastInteraction.getTime() > 2 * 24 * 60 * 60 * 1000)) {
    return 'inactive';
  }
  return session.stage || 'initial';
}

// Funciones principales
export const getUserSession = async (phoneNumber: string): Promise<UserSession> => {
  const validPhone = validatePhoneNumber(phoneNumber);

  if (!validPhone) {
    console.error(`❌ Intento de crear sesión con número inválido: ${phoneNumber}`);
    throw new Error(`Número de teléfono inválido: ${phoneNumber}`);
  }

  return await trackingSystem.getUserSession(validPhone);
};

interface SessionOptions {
  messageType?: string;
  confidence?: number;
  isPredetermined?: boolean;
  routerDecision?: {
    targetFlow: string;
    shouldRedirect: boolean;
  };
  metadata?: Record<string, any>;
  step?: string;
}

export const updateUserSession = async (
  phoneNumber: string,
  message: string,
  currentFlow: string,
  step?: string | null,
  isProcessing: boolean = false,
  options?: SessionOptions,
  pushName?: string
): Promise<void> => {
  // Use session lock to prevent race conditions
  return await sessionLock.withLock(phoneNumber, async () => {
    try {
      const validatedPhone = validatePhoneNumber(phoneNumber);
      if (!validatedPhone) {
        console.error('❌ Número de teléfono inválido:', phoneNumber);
        return;
      }

      const parentHint =
        /music|capacity_music|shipping_data|additional_products|capacity_comparison/i.test(currentFlow) ? 'musicUsb' :
          /video|capacityvideo|videosusb/i.test(currentFlow) ? 'videosUsb' :
            /movie|moviesusb|movies_/i.test(currentFlow) ? 'moviesUsb' :
              undefined;

      const normalizedFlow = normalizeFlowAlias(currentFlow, parentHint);

      const validFlows = [
        'welcome', 'welcomeFlow',
        'catalog', 'catalogFlow',
        'customization', 'customizationFlow', 'customizationStarted',
        'order', 'orderFlow', 'payment_flow',
        'music', 'musicUsb',
        'audioFlow', 'herramientasFlow',
        'videos', 'videosUsb',
        'movies', 'moviesUsb',
        'media_received', 'audio_received',
        'cross_sell'
      ];

      let finalFlow = normalizedFlow;
      if (!validFlows.includes(finalFlow)) {
        if (finalFlow.endsWith('Flow')) {
          const base = finalFlow.replace(/Flow$/i, '');
          if (validFlows.includes(base)) finalFlow = base;
        }
        if (!validFlows.includes(finalFlow)) {
          console.warn(`⚠️ Flujo no reconocido (${currentFlow}). Normalizando a ${parentHint || 'welcomeFlow'}`);
          finalFlow = parentHint || 'welcomeFlow';
        }
      }

      const sanitizedMessage = sanitizeMessage(message);
      if (!sanitizedMessage && !options?.isPredetermined) {
        console.warn('⚠️ Mensaje vacío, continúo sin registrar interacción de texto');
      }

      const session = await getUserSession(validatedPhone);
      const now = new Date();
      const previousFlow = session.currentFlow;

      session.lastInteraction = now;
      session.lastActivity = now;
      session.updatedAt = now;
      session.messageCount = (session.messageCount || 0) + (sanitizedMessage ? 1 : 0);
      session.currentFlow = finalFlow;
      session.isActive = true;

    let analysis: { intent: string; sentiment: SentimentType; engagement: number };
    try {
      analysis = await performIntelligentAnalysis(sanitizedMessage || '', finalFlow, session);
    } catch {
      analysis = {
        intent: extractBasicIntent(sanitizedMessage || ''),
        sentiment: 'neutral',
        engagement: 50
      };
    }

    // Boost de intención si el último en hablar fue el usuario y pidió precios/capacidad
    const lowerMsg = (sanitizedMessage || '').toLowerCase();
    if (/(precio|costo|vale|8gb|32gb|64gb|128gb|ok)/.test(lowerMsg)) {
      session.buyingIntent = Math.min((session.buyingIntent || 50) + 8, 100);
      session.stage = session.stage === 'initial' ? 'pricing' : session.stage;
    }

    if (options?.metadata && typeof options.metadata === 'object') {
      session.conversationData = session.conversationData || {};
      const safeMeta = toPlainJSON(options.metadata, 3);
      session.conversationData.metadata = {
        ...toPlainJSON(session.conversationData.metadata || {}, 3),
        ...safeMeta,
        lastUpdate: new Date().toISOString()
      };
    }

    if (options?.routerDecision && typeof options.routerDecision === 'object') {
      session.conversationData = session.conversationData || {};
      session.conversationData.routerDecision = {
        targetFlow: options.routerDecision.targetFlow,
        shouldRedirect: options.routerDecision.shouldRedirect,
        timestamp: now.toISOString()
      };
    }

    if (sanitizedMessage && sanitizedMessage.trim().length > 0) {
      const newInteraction: Interaction = {
        timestamp: now,
        message: sanitizedMessage.substring(0, 500),
        type: 'user_message',
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        engagement_level: analysis.engagement,
        channel: (session.interactions?.slice(-1).find(i => !!i.channel)?.channel) || 'WhatsApp',
        respondedByBot: true,
        metadata: {
          flow: finalFlow,
          messageType: options?.messageType,
          confidence: options?.confidence,
          isPredetermined: options?.isPredetermined || false,
          previousFlow,
          sessionStage: session.stage,
          messageLength: sanitizedMessage.length
        }
      };
      session.interactions = session.interactions || [];
      session.interactions.push(newInteraction);
      if (session.interactions.length > 500) {
        session.interactions = session.interactions.slice(-500);
      }
    }

    if (!session.customization || typeof session.customization !== 'object') {
      session.customization = {
        step: 0,
        preferences: {},
        totalPrice: 0,
        startedAt: now,
        selectedType: (options?.messageType as any) || null,
        confidence: options?.confidence || 0,
        lastUpdate: now.toISOString()
      } as any;
    } else {
      const customizationExtended = session.customization as any;
      if (options?.messageType && !customizationExtended.selectedType) customizationExtended.selectedType = options.messageType;
      if (options?.confidence && !customizationExtended.confidence) customizationExtended.confidence = options.confidence;
      customizationExtended.lastUpdate = now.toISOString();
    }

    const flowStepMap: Record<string, number> = {
      'welcome': 0,
      'welcomeFlow': 0,
      'customizationFlow': 1,
      'musicUsb': 2,
      'videosUsb': 2,
      'moviesUsb': 2,
      'musicPreferences': 3,
      'designPreferences': 4,
      'technicalSpecs': 5,
      'accessoriesSelected': 6,
      'orderFlow': 7,
      'payment_flow': 8,
      'confirmed': 9
    };
    if (finalFlow in flowStepMap && session.customization) {
      (session.customization as any).step = flowStepMap[finalFlow];
      const cext = session.customization as any;
      if (finalFlow === 'musicUsb') cext.selectedType = 'music';
      if (finalFlow === 'videosUsb') cext.selectedType = 'videos';
      if (finalFlow === 'moviesUsb') cext.selectedType = 'movies';
    }

    const intentInterestMap: Record<string, string> = {
      'music': 'music',
      'video': 'videos',
      'movie': 'movies',
      'customization': 'customization',
      'purchase': 'purchase',
      'pricing': 'pricing',
      'technical': 'technical_specs'
    };
    for (const [intentKey, interest] of Object.entries(intentInterestMap)) {
      if (analysis.intent.includes(intentKey) && !(session.interests || []).includes(interest)) {
        session.interests = session.interests || [];
        session.interests.push(interest);
      }
    }

    const prevStage = session.stage || 'initial';
    let newStage = prevStage;
    try {
      newStage = await detectAdvancedStage(session, analysis, sanitizedMessage || '', options);
    } catch {
      newStage = detectBasicStage(sanitizedMessage || '', session, analysis);
    }
    if (prevStage !== newStage) {
      session.conversationData = session.conversationData || {};
      session.conversationData.stageHistory = session.conversationData.stageHistory || [];
      session.conversationData.stageHistory.push({
        from: prevStage,
        to: newStage,
        timestamp: now.toISOString(),
        trigger: (sanitizedMessage || '').substring(0, 100)
      });
    }
    session.stage = newStage;

    try {
      const aiAnalysis = await performAdvancedAIAnalysis(session, options);
      if (aiAnalysis) {
        (session as any).aiAnalysis = aiAnalysis;
        session.buyingIntent = aiAnalysis.buyingIntent;
        session.conversationData = session.conversationData || {};
        (session.conversationData as any).aiInsights = (session.conversationData as any).aiInsights || [];
        (session.conversationData as any).aiInsights.push({
          timestamp: now.toISOString(),
          buyingIntent: aiAnalysis.buyingIntent,
          confidence: options?.confidence || 0,
          messageType: options?.messageType,
          insights: aiAnalysis.insights || []
        });
        if ((session.conversationData as any).aiInsights.length > 10) {
          (session.conversationData as any).aiInsights = (session.conversationData as any).aiInsights.slice(-10);
        }
      }
    } catch {
      session.buyingIntent = calculateBasicBuyingIntent(session, analysis);
    }

    try {
      if (!global.userSessions) global.userSessions = new Map();
      global.userSessions.set(validatedPhone, session);

      if (typeof (businessDB as any)?.updateUserSession === 'function') {
        const payload: any = { ...session };
        const existing = await (businessDB as any).getUserSession(validatedPhone).catch(() => null);
        let mergedInteractions = session.interactions || [];
        if (existing?.interactions) {
          const existingParsed = Array.isArray(existing.interactions) ? existing.interactions : safeJSON(existing.interactions, []);
          mergedInteractions = [...existingParsed.slice(-100), ...session.interactions].slice(-200);
        }
        payload.preferences = jsonStringifySafe(payload.preferences || {});
        payload.demographics = jsonStringifySafe(payload.demographics || {});
        payload.interactions = jsonStringifySafe(mergedInteractions || []);
        payload.interests = jsonStringifySafe(session.interests || []);
        payload.conversationData = jsonStringifySafe(session.conversationData || {});
        await (businessDB as any).updateUserSession(validatedPhone, payload);
      }
    } catch (persistError) {
      console.error('❌ Error persistiendo sesión:', persistError);
    }

    try {
      if (typeof scheduleFollowUp === 'function' &&
        session.stage !== 'converted' &&
        session.stage !== 'order_confirmed' &&
        !(session.tags || []).includes('blacklist') &&
        (session.buyingIntent > 30 || session.stage === 'pricing' || session.stage === 'customizing')) {
        scheduleFollowUp(validatedPhone);
      }
    } catch (followUpError) {
      console.warn('⚠️ Error programando seguimiento:', followUpError);
    }

    console.log(`📊 [${validatedPhone}] Intent=${analysis.intent} | Sentiment=${analysis.sentiment} | Stage=${session.stage} | BuyingIntent=${session.buyingIntent}% | Flow=${finalFlow}`);
    userSessions.set(validatedPhone, session);
    
    // Log flow transition if flow changed
    if (previousFlow && previousFlow !== finalFlow) {
      await logFlowTransition(validatedPhone, previousFlow, finalFlow, session.stage || 'unknown');
    }
    } catch (error) {
      console.error(`❌ Error crítico en updateUserSession para ${phoneNumber}:`, error);
    }
  });
};

/**
 * Log flow transition to database and flow logger
 */
export async function logFlowTransition(
  phone: string,
  fromFlow: string,
  toFlow: string,
  stage: string,
  trigger: string = 'user_action'
): Promise<void> {
  try {
    // Log to database
    await businessDB.logFlowTransition({
      phone,
      fromFlow,
      toFlow,
      fromStage: stage,
      toStage: stage,
      trigger,
      metadata: { timestamp: new Date() }
    });
    
    // Log to flow logger service
    await flowLogger.logPhaseStart(phone, toFlow, stage);
    
    console.log(`📊 Flow transition logged: ${phone} ${fromFlow} -> ${toFlow}`);
  } catch (error) {
    console.error('❌ Error logging flow transition:', error);
  }
}

// ==== Análisis y detección auxiliares ====

async function performIntelligentAnalysis(
  message: string,
  currentFlow: string,
  session: UserSession
): Promise<{ intent: string, sentiment: SentimentType, engagement: number }> {
  try {
    const intent = extractAdvancedIntent(message, currentFlow);
    const sentiment = analyzeAdvancedSentiment(message);
    const engagement = calculateAdvancedEngagement(message, session);
    return { intent, sentiment, engagement };
  } catch {
    return {
      intent: extractBasicIntent(message),
      sentiment: 'neutral',
      engagement: 50
    };
  }
}

function extractAdvancedIntent(message: string, currentFlow: string): string {
  const cleanMessage = (message || '').toLowerCase().trim();
  const flowIntents: Record<string, string[]> = {
    'musicUsb': ['music', 'song', 'playlist', 'genre'],
    'videosUsb': ['video', 'clip', 'documentary', 'tutorial'],
    'moviesUsb': ['movie', 'film', 'series', 'show'],
    'orderFlow': ['buy', 'purchase', 'order', 'price'],
    'datosCliente': ['address', 'phone', 'payment', 'name']
  };
  if (flowIntents[currentFlow]) {
    for (const keyword of flowIntents[currentFlow]) {
      if (cleanMessage.includes(keyword)) return keyword;
    }
  }
  return extractBasicIntent(message);
}

function analyzeAdvancedSentiment(message: string): SentimentType {
  const positiveWords = ['excelente', 'perfecto', 'genial', 'increíble', 'me gusta', 'interesante', 'sí', 'si'];
  const negativeWords = ['no', 'mal', 'terrible', 'horrible', 'no me gusta', 'luego', 'después'];
  const cleanMessage = (message || '').toLowerCase();
  const positiveCount = positiveWords.filter(word => cleanMessage.includes(word)).length;
  const negativeCount = negativeWords.filter(word => cleanMessage.includes(word)).length;
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function calculateAdvancedEngagement(message: string, session: UserSession): number {
  let engagement = 50;
  if (message.length > 50) engagement += 10;
  if (message.length > 100) engagement += 10;
  if (message.includes('?')) engagement += 15;
  const emojiCount = (message.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
  engagement += Math.min(emojiCount * 5, 20);
  if (session.interactions && session.interactions.length > 3) engagement += 10;
  return Math.min(Math.max(engagement, 0), 100);
}

async function detectAdvancedStage(
  session: UserSession,
  analysis: any,
  message: string,
  options?: any
): Promise<string> {
  if (options?.isPredetermined) return `interested_${options.messageType || 'general'}`;
  if (analysis.intent.includes('buy') || analysis.intent.includes('purchase')) return 'ready_to_buy';
  if (analysis.intent.includes('price') || analysis.intent.includes('cost') || analysis.intent === 'pricing') return 'pricing';
  return detectBasicStage(message, session, analysis);
}

// Contadores de seguimiento
let FOLLOWUP_SENT_TOTAL = 0;
let FOLLOWUP_SENT_WINDOW = 0;
let FOLLOWUP_LAST_WINDOW_AT = Date.now();

function logFollowUpSent(phone: string, urgency: 'high' | 'medium' | 'low', channel: Channel) {
  FOLLOWUP_SENT_TOTAL++;
  FOLLOWUP_SENT_WINDOW++;
  console.log(`📬 [FOLLOWUP][#${FOLLOWUP_SENT_TOTAL}] Enviado a ${phone} | urg=${urgency} | ch=${channel} | ventana=${FOLLOWUP_SENT_WINDOW}`);
}

setInterval(() => {
  console.log(`⏱️ [FOLLOWUP] Ventana cerrada. Enviados en la última hora: ${FOLLOWUP_SENT_WINDOW}. Total histórico: ${FOLLOWUP_SENT_TOTAL}.`);
  FOLLOWUP_SENT_WINDOW = 0;
  FOLLOWUP_LAST_WINDOW_AT = Date.now();
}, 60 * 60 * 1000);

async function performAdvancedAIAnalysis(session: UserSession, options?: any): Promise<any> {
  const buyingIntent = calculateAdvancedBuyingIntent(session, options);
  const riskLevel = (() => {
    const hours = (Date.now() - session.lastInteraction.getTime()) / 36e5;
    if (hours > 48) return 'high';
    if (hours > 12) return 'medium';
    return 'low';
  })();
  return {
    buyingIntent,
    riskLevel,
    insights: [
      `Origen: ${options?.isPredetermined ? 'Predeterminado' : 'Libre'}`,
      `Confianza: ${options?.confidence || 0}`,
      `Tipo: ${options?.messageType || 'general'}`
    ]
  };
}

function calculateAdvancedBuyingIntent(session: UserSession, options?: any): number {
  let intent = session.buyingIntent || 50;
  if (options?.isPredetermined) intent += 20;
  if (options?.confidence && options.confidence > 0.8) intent += 15;
  if (options?.messageType && ['music', 'videos', 'movies'].includes(options.messageType)) intent += 10;
  intent += Math.min((session.messageCount || 0), 10);
  return Math.min(Math.max(intent, 0), 100);
}

function extractBasicIntent(message: string): string {
  if (!message || typeof message !== 'string') return 'general';
  const msg = message.toLowerCase().trim();
  if (/(precio|costo|vale|cuánto|cuanto)/.test(msg)) return 'pricing_inquiry';
  if (/(comprar|pedido|orden|quiero)/.test(msg)) return 'purchase_intent';
  if (/(personalizar|customizar|diseñar)/.test(msg)) return 'customization_interest';
  if (/(catálogo|productos|opciones|mostrar)/.test(msg)) return 'product_inquiry';
  if (/(gracias|perfecto|excelente|genial)/.test(msg)) return 'positive_feedback';
  if (/(no|cancelar|después|luego)/.test(msg)) return 'negative_response';
  if (/^[1-4]$/.test(msg)) return 'option_selection';
  return 'general_inquiry';
}

function analyzeBasicSentiment(message: string): SentimentType {
  if (!message || typeof message !== 'string') return 'neutral';
  const msg = message.toLowerCase().trim();
  const positivePatterns = [
    /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
    /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
    /\b(amor|amo|encanta|fascina|ideal|justo|necesito)\b/
  ];
  const negativePatterns = [
    /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego)\b/,
    /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
    /\b(aburrido|feo|horrible|odio|detesto|molesta)\b/
  ];
  for (const pattern of positivePatterns) if (pattern.test(msg)) return 'positive';
  for (const pattern of negativePatterns) if (pattern.test(msg)) return 'negative';
  return 'neutral';
}

const calculateBasicEngagement = (message: string, session: UserSession): number => {
  let engagement = 50;
  if (message.length > 20) engagement += 10;
  if (message.includes('?')) engagement += 5;
  if (session.messageCount > 3) engagement += 10;
  if (session.interests && session.interests.length > 0) engagement += 15;
  return Math.min(Math.max(engagement, 0), 100);
};

const detectBasicStage = (message: string, session: UserSession, analysis: any): string => {
  const lowerMessage = (message || '').toLowerCase();
  if (lowerMessage.includes('comprar') || lowerMessage.includes('pedido')) return 'purchase_intent';
  if (/^[1-4]$/.test((message || '').trim())) return 'option_selected';
  if (/(precio|costo)/.test(lowerMessage)) return 'pricing';
  if (lowerMessage.includes('personalizar')) return 'customization_interest';
  if (lowerMessage.includes('catálogo')) return 'browsing';
  if (analysis.sentiment === 'positive' && session.stage === 'price_inquiry') return 'interested';
  return session.stage || 'initial';
};

const calculateBasicBuyingIntent = (session: UserSession, analysis: any): number => {
  let intent = session.buyingIntent || 50;
  if (session.stage === 'purchase_intent') intent += 20;
  if (session.stage === 'price_inquiry') intent += 15;
  if (session.stage === 'customization_interest') intent += 10;
  if (analysis.sentiment === 'positive') intent += 5;
  if (session.messageCount > 5) intent += 10;
  if (session.interactions && session.interactions.length > 3) intent += 5;
  return Math.min(Math.max(intent, 0), 100);
};

const performAIAnalysis = async (session: UserSession): Promise<any | null> => {
  try {
    const aiAnalysis: any = {
      buyingIntent: session.buyingIntent || 50,
      interests: session.interests || [],
      nextBestAction: 'show_catalog',
      followUpTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      riskLevel: 'low',
      engagementScore: 50,
      probabilityToConvert: 50,
      churnLikelihood: 20
    };

    if (typeof SimpleAI.analyzeBuyingIntent === 'function') {
      const buyingIntent = SimpleAI.analyzeBuyingIntent(session);
      if (typeof buyingIntent === 'number' && buyingIntent >= 0 && buyingIntent <= 100) {
        aiAnalysis.buyingIntent = Math.round(buyingIntent);
      }
    }

    if (typeof SimpleAI.getNextBestAction === 'function') {
      const nextAction = SimpleAI.getNextBestAction(session);
      if (typeof nextAction === 'string' && nextAction.trim().length > 0) {
        aiAnalysis.nextBestAction = nextAction;
      }
    }

    if (typeof SimpleAI.engagementScore === 'function') {
      const engagement = SimpleAI.engagementScore(session);
      if (typeof engagement === 'number' && engagement >= 0 && engagement <= 100) {
        aiAnalysis.engagementScore = Math.round(engagement);
      }
    }

    return aiAnalysis;

  } catch (aiError) {
    console.warn('⚠️ Error en análisis AI completo:', aiError);
    return null;
  }
};

const getFollowUpDelay = (session: UserSession): number => {
  const baseDelay = 2 * 60 * 60 * 1000;
  const last = (session.interactions || []).slice(-1)[0];
  const lastWasUser = last?.type === 'user_message';
  if ((session as any).aiAnalysis?.buyingIntent && (session as any).aiAnalysis.buyingIntent > 70) return 30 * 60 * 1000;
  if (session.stage === 'pricing') return lastWasUser ? 45 * 60 * 1000 : 60 * 60 * 1000;
  if (session.stage === 'interested') return 60 * 60 * 1000;
  if ((session as any).aiAnalysis?.riskLevel === 'high') return 4 * 60 * 60 * 1000;
  return baseDelay;
};

// ===== VALIDACIÓN MEJORADA DE TELÉFONOS =====
function isValidPhoneNumberInternal(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;

  if (phone.includes('@g.us') ||
    phone.includes('@lid') ||
    phone.includes('@broadcast') ||
    phone.includes('@newsletter')) {
    return false;
  }

  const cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.length < 10 || cleaned.length > 15) return false;
  if (cleaned.startsWith('+') && cleaned.length < 11) return false;

  if (/^0+$/.test(cleaned.replace(/\+/g, ''))) return false;
  if (cleaned.length > 15) return false;

  return true;
}

// ===== NORMALIZAR TELÉFONO (REMOVER SUFIJOS) =====
function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;

  let normalized = phone
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/@lid$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/@broadcast$/i, '')
    .trim();

  return isValidPhoneNumberInternal(normalized) ? normalized : null;
}

// ===== LIMPIEZA INMEDIATA DE NÚMEROS INVÁLIDOS =====
export function cleanInvalidPhones() {
  let cleaned = 0;

  userSessions.forEach((session, phone) => {
    if (!isValidPhoneNumberInternal(phone)) {
      userSessions.delete(phone);
      cleaned++;
      console.log(`🗑️ Removido número inválido de sesiones: ${phone}`);
    }
  });

  followUpQueue.forEach((timeoutId, phone) => {
    if (!isValidPhoneNumberInternal(phone)) {
      clearTimeout(timeoutId);
      followUpQueue.delete(phone);
      cleaned++;
      console.log(`🗑️ Removido número inválido de cola: ${phone}`);
    }
  });

  if (cleaned > 0) {
    console.log(`✅ Limpiados ${cleaned} números inválidos del sistema`);
  }

  return cleaned;
}

// ===== LIMPIEZA PROACTIVA DE LA COLA =====
export function cleanupFollowUpQueue() {
  let cleaned = 0;

  followUpQueue.forEach((timeoutId, phone) => {
    const session = userSessions.get(phone);

    if (!isValidPhoneNumberInternal(phone) ||
      !session ||
      session.stage === 'converted' ||
      isWhatsAppChatActive(session) ||
      session.tags?.includes('blacklist')) {
      clearTimeout(timeoutId);
      followUpQueue.delete(phone);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`🧹 Limpiados ${cleaned} seguimientos de la cola`);
  }

  return cleaned;
}
const BLOCKED_STAGES = new Set(['converted', 'completed', 'order_confirmed']);

// ===== SCHEDULE FOLLOW-UP CON VALIDACIÓN REFORZADA =====
const scheduleFollowUp = (phoneNumber: string): void => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!normalizedPhone) {
    console.warn(`⚠️ Teléfono inválido/no normalizable: ${phoneNumber}`);
    return;
  }

  if (!isValidPhoneNumberInternal(normalizedPhone)) {
    console.warn(`⚠️ Teléfono rechazado tras validación: ${normalizedPhone}`);
    return;
  }

  const session = userSessions.get(normalizedPhone);
  if (!session) {
    console.warn(`⚠️ No existe sesión para: ${normalizedPhone}`);
    return;
  }

  // ⭐ NUEVO: Verificación completa con progreso significativo
  const progressCheck = canSendFollowUpToUser(session);
  if (!progressCheck.ok) {
    console.log(`[FOLLOWUP] ⏸️ Bloqueado ${normalizedPhone}: ${progressCheck.reason}`);
    return;
  }

  if (followUpQueue.has(normalizedPhone)) {
    return;
  }

  if (followUpQueue.size >= 5000) {
    console.warn(`⚠️ Cola alta (${followUpQueue.size}/5000), procedo igualmente (sin bloquear).`);

    const cleaned = cleanupFollowUpQueue();
    const invalidCleaned = cleanInvalidPhones();

    console.log(`🧹 Limpieza: ${cleaned} obsoletos + ${invalidCleaned} inválidos`);

    if (followUpQueue.size >= 500) {
      console.error(`❌ Cola sigue llena (${followUpQueue.size}/500), rechazando: ${normalizedPhone}`);
      return;
    }
  }

  const followUpDelay = getFollowUpDelay(session);
  const maxDelay = 4 * 60 * 60 * 1000;
  const actualDelay = Math.min(followUpDelay, maxDelay);

  try {
    const timeoutId = setTimeout(async () => {
      try {
        followUpQueue.delete(normalizedPhone);

        if (!isValidPhoneNumberInternal(normalizedPhone)) {
          console.error(`❌ Número se volvió inválido: ${normalizedPhone}`);
          return;
        }

        const currentSession = userSessions.get(normalizedPhone);
        if (!currentSession) return;

        // ⭐ RE-VERIFICAR solo condiciones críticas (Compra o Chat Humano)
        // No volvemos a checkear tiempos menores o restricciones suaves para asegurar el envío.
        if (currentSession.stage === 'converted' ||
          currentSession.stage === 'completed' ||
          isWhatsAppChatActive(currentSession)) {
          console.log(`⏸️ Re-check crítico bloqueó ${normalizedPhone}: estado incompatible.`);
          return;
        }

        const minutesSinceLastInteraction = (Date.now() - currentSession.lastInteraction.getTime()) / 60000;
        if (minutesSinceLastInteraction < 5) return;

        const ctxGate = analyzeContextBeforeSend(currentSession);
        if (!ctxGate.ok) {
          console.log(`⏸️ Context-gate (scheduler) bloqueó ${normalizedPhone}: ${ctxGate.reason}`);
          return;
        }

        await sendFollowUpMessage(normalizedPhone);

      } catch (execError) {
        console.error(`❌ Error ejecutando follow-up para ${normalizedPhone}:`, execError);
      }
    }, actualDelay);

    followUpQueue.set(normalizedPhone, timeoutId);
    console.log(`[FOLLOWUP] ✅ ${normalizedPhone} en ${Math.round(actualDelay / 60000)}min | Cola: ${followUpQueue.size}/500`);

  } catch (scheduleError) {
    console.error(`❌ Error programando follow-up para ${normalizedPhone}:`, scheduleError);
  }
};

// ===== LIMPIEZA AUTOMÁTICA =====
setInterval(() => {
  try {
    const obsolete = cleanupFollowUpQueue();
    const invalid = cleanInvalidPhones();

    const stats = {
      queueSize: followUpQueue.size,
      maxSize: 500,
      utilizationPercent: Math.round((followUpQueue.size / 500) * 100),
      sessionsActive: Array.from(userSessions.values()).filter(s => s.isActive).length,
      totalSessions: userSessions.size,
      cleanedObsolete: obsolete,
      cleanedInvalid: invalid
    };

    console.log(`📊 [MAINTENANCE] Cola: ${stats.queueSize}/500 (${stats.utilizationPercent}%) | Sesiones: ${stats.sessionsActive}/${stats.totalSessions} | Limpiados: ${obsolete + invalid}`);

    if (stats.utilizationPercent > 80) {
      console.error(`🚨 ALERTA CRÍTICA: Cola al ${stats.utilizationPercent}%`);
    }

  } catch (error) {
    console.error('❌ Error en limpieza automática:', error);
  }
}, 5 * 60 * 1000);

console.log('🧹 Ejecutando limpieza inicial...');
setTimeout(() => {
  const invalid = cleanInvalidPhones();
  console.log(`✅ Limpieza inicial: ${invalid} números inválidos removidos`);
}, 5000);

process.on('SIGINT', () => {
  console.log('\n🛑 Limpiando cola de seguimientos...');
  followUpQueue.forEach((timeoutId) => clearTimeout(timeoutId));
  followUpQueue.clear();
  console.log('✅ Cola limpiada');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Limpiando cola de seguimientos...');
  followUpQueue.forEach((timeoutId) => clearTimeout(timeoutId));
  followUpQueue.clear();
  console.log('✅ Cola limpiada');
  process.exit(0);
});

// ===== FUNCIÓN AUXILIAR PARA MONITOREO =====
export function getFollowUpQueueStatus() {
  const queue = Array.from(followUpQueue.entries());

  return {
    size: queue.length,
    maxSize: 1000,
    utilizationPercent: Math.round((queue.length / 1000) * 100),
    phones: queue.map(([phone]) => ({
      phone: phone.slice(-4),
      valid: isValidPhoneNumberInternal(phone)
    })),
    invalidCount: queue.filter(([phone]) => !isValidPhoneNumberInternal(phone)).length
  };
}

// ===== EXPORTAR FUNCIONES DE UTILIDAD =====
export function isValidPhoneNumber(phone: any): boolean {
  const normalized = normalizePhoneNumber(String(phone));
  return !!normalized;
}

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  followUpQueue.forEach((timeoutId, phone) => {
    const session = userSessions.get(phone);

    if (!session ||
      session.stage === 'converted' ||
      isWhatsAppChatActive(session)) {
      clearTimeout(timeoutId);
      followUpQueue.delete(phone);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`🧹 Limpiados ${cleaned} seguimientos obsoletos de la cola`);
  }

  console.log(`📊 Cola de seguimientos: ${followUpQueue.size} activos`);
}, 10 * 60 * 1000);

export const getUrgencyMessage = (urgencyLevel: 'high' | 'medium' | 'low', buyingIntent: number): string => {
  if (urgencyLevel === 'high' && buyingIntent > 70) return "⏰ Últimas horas con envío gratis. ¿Confirmamos y te dejo tu USB lista hoy?";
  else if (urgencyLevel === 'medium' && buyingIntent > 50) return "📦 Te activo el pedido con precio preferencial. ¿Avanzamos?";
  return "💬 ¿Te muestro la tabla de precios y eliges capacidad en un paso?";
};

// [BLOQUE 4] NUEVO: Oferta irresistible para silencios largos
function buildIrresistibleSilentOffer(session: UserSession): string {
  const name = session.name ? session.name.split(' ')[0] : '';
  const greet = name ? `¡Hola ${name}!` : '¡Hola!';

  const headline = '🔥 Te dejo una oferta que no vas a querer dejar pasar:';
  const bonus = '🎁 Incluye: índice en PDF, carátulas y reparación gratuita 7 días.';
  const priceBlock = getPriceBlock(); // usamos el bloque completo de precios

  return [
    `${greet} ${headline}`,
    '',
    priceBlock,
    '',
    '🚀 Además, segunda USB con *20% OFF* solo si confirmas hoy.',
    'Responde 1 / 2 / 3 / 4 y te la dejo reservada al precio de hoy.'
  ].join('\n');
}

// ===== NUEVO: Helpers de Copywriting Humanizado =====

function getTimeBasedGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function getRandomVariation(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)];
}

// Detecta si el mensaje del usuario parece una pregunta específica o compleja
function isComplexUserMessage(msg: string): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();

  // Si es muy largo, probablemente sea una duda específica
  if (m.length > 60) return true;

  // Palabras clave de dudas no relacionadas con precio directo
  const doubtKeywords = ['envío', 'garantía', 'tarda', 'demora', 'canciones', 'lista', 'artista', 'falla', 'sirve', 'carro', 'bogotá', 'medellín', 'cali', 'domicilio', 'funciona', 'pago contra'];

  // Si tiene signo de interrogación Y alguna keyword compleja
  const hasQuestionMark = m.includes('?');
  const hasKeyword = doubtKeywords.some(k => m.includes(k));

  return hasQuestionMark || (hasKeyword && m.length > 20);
}

// Construye mensaje de precios pero con tono conversacional
function buildSoftPricingMessage(session: UserSession, type: USBContentType): string {
  const name = session.name ? session.name.split(' ')[0] : '';
  const greet = name ? `¡Hola ${name}!` : getTimeBasedGreeting();

  const openers = [
    "Por aquí te dejo los precios actualizados para que los tengas a la mano 👇",
    "Te comparto la tabla de opciones para hoy:",
    "Mira, así quedaron los precios de la promo actual:",
    "Para resumirte, estas son las opciones que más están llevando hoy:"
  ];

  const priceBlock = [
    '🔹 *8GB* (Económica) → $54.900',
    '🔹 *32GB* (Recomendada) → $84.900',
    '🔹 *64GB* (Alta Calidad) → $119.900',
    '🔹 *128GB* (Coleccionista) → $159.900',
    '',
    'Incluye envío y personalización. 🚚',
    '¿Cuál se ajusta más a lo que buscas? (1, 2, 3 o 4)'
  ].join('\n');

  let header = '';
  if (type === 'musica') header = `🎶 *USB Música Personalizada*`;
  else if (type === 'videos') header = `🎬 *USB Videos Musicales*`;
  else header = `🍿 *USB Películas/Series*`;

  return `${greet} ${getRandomVariation(openers)}\n\n${header}\n${priceBlock}`;
}

export const generatePersuasiveFollowUp = (
  user: UserSession,
  urgencyLevel: 'high' | 'medium' | 'low'
): string[] => {
  const name = user.name ? user.name.split(' ')[0] : '';
  const greet = name ? `Hola ${name},` : 'Hola,';

  // Textos para usuarios que ya vieron precios pero no compraron (Seguimiento suave)
  if (urgencyLevel === 'low') {
    const lowPressureOptions = [
      "me quedé pendiente por si tenías alguna duda sobre la capacidad. ¿Te ayudo a elegir?",
      "no te quiero molestar, solo quería saber si pudiste revisar la info que te mandé antes. 👀",
      "¿qué te parecieron las opciones? Si necesitas que te recomiende alguna, avísame.",
      "estaba revisando los pedidos de hoy y me acordé de ti. ¿Te animas a confirmar tu USB?"
    ];
    return [`${greet} ${getRandomVariation(lowPressureOptions)}`];
  }

  // Textos con urgencia media/alta (Beneficio o Escasez)
  const incentives = [
    "📦 *Dato:* Si confirmas hoy, alcanzo a despachar tu pedido con envío prioritario.",
    "🛡️ Recuerda que tienes garantía total y soporte si alguna canción no te gusta.",
    "🎵 Estoy organizando las playlists de hoy. ¿Te aparto el cupo para tu USB?",
    "⏳ Me quedan pocas unidades de 64GB con la promo de hoy."
  ];

  const cta = "Si me das el OK, te tomo los datos en un minuto. 👍";

  return [
    `${greet} solo paso a recordarte:`,
    getRandomVariation(incentives),
    cta
  ];
};

const CHANNEL_COPIES: Record<Channel, {
  opener: (name?: string) => string;
  ctaHigh?: string;
  ctaMedium?: string;
  ctaLow?: string;
  footer?: string;
  mediaHint?: string;
}> = {
  WhatsApp: {
    opener: (name) => name ? `¡Hola ${name}!` : '¡Hola!',
    ctaHigh: "👉 Responde 'SÍ' para confirmar ahora y asegurar tu descuento.",
    ctaMedium: "Escribe 'PRECIO' y te habilito la mejor oferta hoy (+ envío gratis).",
    ctaLow: "¿Seguimos? Dime 8/32/64/128GB y te la dejo lista en 1 minuto.",
    footer: "Atiende este mensaje cuando puedas, guardé tu progreso. ✅",
    mediaHint: "Te dejo una muestra rápida:"
  },
  Instagram: {
    opener: (name) => name ? `Hola ${name}` : 'Hola ✨',
    ctaHigh: "Toca para confirmar y separar tu pedido ahora.",
    ctaMedium: "Escríbeme 'PRECIO' y te muestro oferta.",
    ctaLow: "¿Seguimos? Te ayudo en 1 min.",
    footer: "Guardé tu avance 💾",
    mediaHint: "Mira este demo:"
  },
  Telegram: {
    opener: (name) => name ? `Hola ${name} 👋` : 'Hola 👋',
    ctaHigh: "Responde 'SI' para confirmar el pedido.",
    ctaMedium: "Escribe 'PRECIO' para ver la oferta activa.",
    ctaLow: "¿Continuamos? Puedo crear el pedido por ti.",
    footer: "Progreso guardado.",
    mediaHint: "Preview:"
  },
  Web: {
    opener: (name) => name ? `Hola ${name}` : 'Hola',
    ctaHigh: "Confirma para finalizar ahora.",
    ctaMedium: "Pide 'PRECIO' para ver la mejor oferta disponible.",
    ctaLow: "¿Te acompaño a terminar la compra?",
    footer: "Tu sesión está guardada.",
    mediaHint: "Ejemplo:"
  }
};

// Selección de media (demo) según intereses y canal
async function buildChannelFollowUpPayload(session: UserSession, channel: Channel): Promise<{
  body: string;
  media?: { url: string; caption?: string };
}> {
  const name = session.name ? session.name.split(' ')[0] : undefined;
  const c = CHANNEL_COPIES[channel] || CHANNEL_COPIES['WhatsApp'];

  const urgency: 'high' | 'medium' | 'low' =
    session.buyingIntent > 80 ? 'high' :
      (session.buyingIntent > 60 || session.stage === 'pricing') ? 'medium' : 'low';

  const persuasiveLines = generatePersuasiveFollowUp(session, urgency);

  let channelCTA = c.ctaLow!;
  if (urgency === 'high' && c.ctaHigh) channelCTA = c.ctaHigh;
  else if (urgency === 'medium' && c.ctaMedium) channelCTA = c.ctaMedium;

  const opener = c.opener(name);
  const footer = c.footer ? `\n\n${c.footer}` : '';
  const base = [opener, ...persuasiveLines.slice(0, 3), channelCTA].join('\n');

  let media: { url: string; caption?: string } | undefined;
  try {
    const genreTopHits = musicData.genreTopHits || {};
    const videoTopHits = videoData.topHits || {};
    const interestGenre = session.interests.find(g => (genreTopHits as any)[g]) || Object.keys(genreTopHits)[0];
    const interestVideo = session.interests.find(g => (videoTopHits as any)[g]) || Object.keys(videoTopHits)[0];

    if (session.interests.some(i => i.includes('music') || i === 'musica' || (genreTopHits as any)[i])) {
      const demos = (genreTopHits as any)[interestGenre] || [];
      if (demos.length) {
        const pick = demos[Math.floor(Math.random() * demos.length)];
        media = { url: pick.file, caption: `${c.mediaHint} ${pick.name}` };
      }
    } else if (session.interests.some(i => i.includes('video') || i === 'videos' || (videoTopHits as any)[i])) {
      const demos = (videoTopHits as any)[interestVideo] || [];
      if (demos.length) {
        const pick = demos[Math.floor(Math.random() * demos.length)];
        media = { url: pick.file, caption: `${c.mediaHint} ${pick.name}` };
      }
    }
  } catch { /* silencioso */ }

  const body = base + footer;
  return { body, media };
}

function hasSentThisBody(session: UserSession, body: string): boolean {
  const h = sha256(body);
  session.conversationData = session.conversationData || {};
  const set: string[] = (session.conversationData.sentBodies || []) as string[];
  return set.includes(h);
}

function markBodyAsSent(session: UserSession, body: string) {
  const h = sha256(body);
  session.conversationData = session.conversationData || {};
  const set: string[] = (session.conversationData.sentBodies || []) as string[];
  const next = Array.from(new Set([...set, h]));
  session.conversationData.sentBodies = next.slice(-50);
}

export function canSendOnce(session: any, key: string, ttlMin = 60): boolean {
  const phoneNumber = session.phoneNumber;
  const now = Date.now();
  session.conversationData = session.conversationData || {};
  const k = `sent_${key}`;
  const last = session.conversationData[k] ? new Date(session.conversationData[k]).getTime() : 0;
  if (last && (now - last) < ttlMin * 60 * 1000) return false;
  // ANTI-BAN: Si el humano está hablando, DETENER todo bot.
  if (isWhatsAppChatActive(session)) {
    console.log(`🛡️ ANTI-BAN: Bloqueando seguimiento para ${phoneNumber} (Chat activo detectado)`);
    return false;
  }
  session.conversationData[k] = new Date().toISOString();
  return true;
}

// Define palabras que indican que el usuario ya tomó una decisión
const CLOSING_SIGNALS = [
  'de una', 'me interesa', 'compro', 'cuenta', 'nequi', 'daviplata',
  'precio', 'cuanto vale', 'ya te digo', 'ya te confirmo',
  'pago contra entrega', 'enviar a', 'listo', 'hágale'
];

function hasUserCommitted(lastUserMessage: string): boolean {
  if (!lastUserMessage) return false;
  const cleanMsg = lastUserMessage.toLowerCase();
  // Si el usuario ya mostró interés explícito, detenemos el spam de ventas
  return CLOSING_SIGNALS.some(signal => cleanMsg.includes(signal));
}

export function shouldProcessMessage(phone: string, body: string, windowMs = 15000): boolean {
  if (!global.processingCache) global.processingCache = new Map();
  const key = `${phone}:${(body || '').trim().slice(0, 80)}`;
  const now = Date.now();
  const last = global.processingCache.get(key) || 0;
  if (now - last < windowMs) return false;
  global.processingCache.set(key, now);
  return true;
}

function isRedundantMessage(history: any[], proposedMessageContent: string): boolean {
  if (!history || history.length === 0) return false;

  // Mira los últimos 5 mensajes (aumentamos el rango)
  const recentBotMessages = history
    .filter(msg => msg.from === 'bot' || msg.type === 'bot_message')
    .slice(-5);

  // 1. Texto exacto
  const isExactDuplicate = recentBotMessages.some(msg => msg.message === proposedMessageContent || msg.content === proposedMessageContent);

  // 2. Anti-Spam de Precios: Si voy a enviar precios ($) y ya envié precios hace poco.
  const isPriceSpam = proposedMessageContent.includes('$') &&
    recentBotMessages.some(msg => (msg.message || '').includes('$') || (msg.content || '').includes('$'));

  return isExactDuplicate || isPriceSpam;
}

const INTERACTION_GRACE_PERIOD = 60000; // 1 minuto

function shouldHoldFire(lastInteractionTime: number): boolean {
  const timeSinceLastMessage = Date.now() - lastInteractionTime;

  // Si el usuario habló hace menos de 1 minuto, NO enviar mensajes automáticos
  if (timeSinceLastMessage < INTERACTION_GRACE_PERIOD) {
    return true;
  }
  return false;
}

let followUpSystemPaused = false;

export function isFollowUpSystemPaused(): boolean {
  return followUpSystemPaused;
}

export const sendSecureFollowUp = async (
  phoneNumber: string,
  messages: string[],
  urgency: 'high' | 'medium' | 'low',
  channelOverride?: Channel,
  assured: boolean = false
): Promise<boolean> => {
  try {
    const currentSession = await getUserSession(phoneNumber);
    const contextGate = analyzeContextBeforeSend(currentSession);

    if (BLOCKED_STAGES.has(currentSession.stage)) {
      console.log(`🚫 Follow-up bloqueado: etapa=${currentSession.stage} para ${phoneNumber}`);
      return false;
    }

    if (isFollowUpSystemPaused()) {
      console.log('⏸️ Sistema de seguimientos pausado. Envío omitido.');
      return false;
    }
    if (!contextGate.ok) {
      console.log(`⏸️ Context-gate bloqueó follow-up a ${phoneNumber}: ${contextGate.reason}`);
      return false;
    }

    if (!botInstance) {
      console.error('❌ Bot instance no disponible');
      return false;
    }

    if (isWhatsAppChatActive(currentSession)) {
      console.log(`🚫 Excluido follow-up (chat activo WhatsApp): ${phoneNumber}`);
      return false;
    }

    const channel: Channel = channelOverride || (currentSession.interactions?.slice(-1).find(i => !!i.channel)?.channel as Channel) || 'WhatsApp';
    const payload = await buildChannelFollowUpPayload(currentSession, channel);
    const groupedMessage = payload.body || messages.join('\n\n');

    if (hasSentThisBody(currentSession, groupedMessage)) {
      console.log(`🚫 DEDUPE: cuerpo ya enviado a ${phoneNumber}. Se omite.`);
      return false;
    }

    const userGate = canSendUserFollowUp(currentSession);
    if (!userGate.ok) {
      console.log(`⏸️ Gate usuario ${phoneNumber}: ${userGate.reason}`);
      return false;
    }

    if (!canSendGlobal()) {
      console.log('⏸️ Gate global alcanzado (hora/día).');
      return false;
    }

    await waitForFollowUpDelay();

    // FIXED: Ensure phone number has proper JID format for Baileys
    const jid = ensureJID(phoneNumber);
    
    if (payload.media && typeof (botInstance as any).sendMessageWithMedia === 'function') {
      await botInstance.sendMessageWithMedia(jid, {
        body: groupedMessage,
        mediaUrl: payload.media.url,
        caption: payload.media.caption
      }, { channel });
    } else {
      await botInstance.sendMessage(jid, groupedMessage, { channel });
    }

    markGlobalSent();
    (currentSession as any).lastFollowUpMsg = groupedMessage;
    recordUserFollowUp(currentSession);
    markBodyAsSent(currentSession, groupedMessage);
    
    // ✅ NEW: Increment 24h follow-up counter
    const { incrementFollowUpCounter } = await import('../services/incomingMessageHandler');
    await incrementFollowUpCounter(currentSession);
    
    userSessions.set(phoneNumber, currentSession);

    try {
      if (typeof (businessDB as any)?.updateUserSession === 'function') {
        await (businessDB as any).updateUserSession(phoneNumber, {
          lastFollowUp: currentSession.lastFollowUp,
          conversationData: jsonStringifySafe(currentSession.conversationData || {})
        } as any);
      }
      if (typeof (businessDB as any)?.logFollowUpEvent === 'function') {
        await (businessDB as any).logFollowUpEvent({
          phone: phoneNumber,
          type: urgency,
          messages: [groupedMessage],
          success: true,
          timestamp: new Date(),
          buyingIntent: currentSession.buyingIntent
        });
      }
    } catch (e) {
      console.warn('⚠️ Persistencia follow-up:', e);
    }

    logFollowUpSent(phoneNumber, urgency, channel);
    return true;

  } catch (error) {
    console.error(`❌ Error enviando mensaje seguro a ${phoneNumber}:`, error);
    return false;
  }
};

export async function triggerChannelReminder(phone: string, channel: Channel, urgency?: 'high' | 'medium' | 'low') {
  const session = await getUserSession(phone);
  if (!session) return false;
  const u: 'high' | 'medium' | 'low' = urgency || (session.buyingIntent > 80 ? 'high' : session.buyingIntent > 60 ? 'medium' : 'low');
  const msgs = generatePersuasiveFollowUp(session, u);
  return await sendSecureFollowUp(phone, msgs, u, channel);
}

export async function triggerBulkRemindersByChannel(channel: Channel, limit: number = 50) {
  const candidates = getUsersNeedingFollowUp()
    .filter(u => {
      const lastUserMessage = [...(u.session.interactions || [])].reverse().find(i => i.type === 'user_message' && i.channel);
      const ch = (lastUserMessage?.channel as Channel) || 'WhatsApp';
      return ch === channel;
    })
    .slice(0, limit);

  let sent = 0;
  for (const c of candidates) {
    const ok = await sendFollowUpMessage(c.phone);
    if (ok !== undefined) sent++;
  }
  return { total: candidates.length, sent };
}

function lastSpeaker(session: UserSession): 'user' | 'bot' | 'system' | 'none' {
  const last = (session.interactions || []).slice(-1)[0];
  if (!last) return 'none';
  if (last.type === 'user_message') return 'user';
  if (last.type === 'bot_message') return 'bot';
  return 'system';
}

/**
 * Get appropriate follow-up timing based on user stage and buying intent
 * Returns minimum minutes to wait for different scenarios
 */
function getStageBasedFollowUpTiming(stage: string, buyingIntent: number): {
  minBotToBot: number;  // Minimum minutes before bot sends another message
  minUserToBot: number; // Minimum minutes to wait after user responds
  description: string;
} {
  // IMPROVED: High intent users get faster follow-ups (more aggressive multiplier)
  const intentMultiplier = buyingIntent > 70 ? 0.5 : buyingIntent > 50 ? 0.7 : 0.85;
  
  switch (stage) {
    case 'initial':
      return {
        minBotToBot: Math.round(120 * intentMultiplier), // RELAXED: 2 hours (from 4h)
        minUserToBot: Math.round(90 * intentMultiplier), // RELAXED: 1.5 hours (from 3h)
        description: 'Initial contact - moderate pacing'
      };
      
    case 'interested':
      return {
        minBotToBot: Math.round(60 * intentMultiplier), // RELAXED: 1 hour (from 2h)
        minUserToBot: Math.round(45 * intentMultiplier),  // RELAXED: 45 min (from 1.5h)
        description: 'Showing interest - increased engagement'
      };
      
    case 'customizing':
      return {
        minBotToBot: Math.round(45 * intentMultiplier),  // RELAXED: 45 min (from 1.5h)
        minUserToBot: Math.round(30 * intentMultiplier),  // RELAXED: 30 min (from 1h)
        description: 'Customizing product - active engagement'
      };
      
    case 'pricing':
      return {
        minBotToBot: Math.round(30 * intentMultiplier),  // RELAXED: 30 min (from 1h)
        minUserToBot: Math.round(20 * intentMultiplier),  // RELAXED: 20 min (from 45min)
        description: 'Discussing pricing - high priority'
      };
      
    case 'closing':
    case 'ready_to_buy':
      return {
        minBotToBot: Math.round(15 * intentMultiplier),  // RELAXED: 15 min (from 30min)
        minUserToBot: Math.round(10 * intentMultiplier),  // RELAXED: 10 min (from 20min)
        description: 'Ready to buy - urgent follow-up'
      };
      
    case 'abandoned':
    case 'inactive':
      return {
        minBotToBot: Math.round(180 * intentMultiplier), // RELAXED: 3 hours (from 6h)
        minUserToBot: Math.round(120 * intentMultiplier), // RELAXED: 2 hours (from 4h)
        description: 'Re-engagement attempt - slower pacing'
      };
      
    default:
      return {
        minBotToBot: 90, // RELAXED: 1.5 hours (from 3h)
        minUserToBot: 60, // RELAXED: 1 hour (from 2h)
        description: 'Default timing'
      };
  }
}

/**
 * Check all pacing rules before sending a follow-up message
 * Returns an object indicating whether sending is allowed and the reason if not
 */
async function checkAllPacingRules(): Promise<{ ok: boolean; reason?: string }> {
  // 1. Check work/rest scheduler (45min work / 15min rest)
  if (!isInWorkPeriod()) {
    const remaining = getTimeRemainingInCurrentPeriod();
    const reason = `rest_window: ${remaining.minutes} min remaining`;
    console.log(`😴 ANTI-BAN: ${reason}`);
    return { ok: false, reason };
  }
  
  // 2. Check unified send window (08:00-22:00)
  if (!isWithinAllowedSendWindow()) {
    const hour = new Date().getHours();
    const reason = `outside_hours: ${hour}:00 (allowed: 08:00-22:00)`;
    console.log(`🌙 ANTI-BAN: ${reason}`);
    return { ok: false, reason };
  }
  
  // 3. Check rate limit (8 messages/minute)
  if (!checkRateLimit()) {
    const reason = 'rate_limit_reached (8 msg/min)';
    console.log(`⚠️ ANTI-BAN: ${reason}`);
    return { ok: false, reason };
  }
  
  return { ok: true };
}

/**
 * Apply human-like delays before sending a message
 * Includes random jitter (2-15 sec) and baseline delay (3 sec)
 */
async function applyHumanLikeDelays(): Promise<void> {
  // Human-like jitter (random delay 2-15 seconds)
  await randomDelay();
  // Baseline delay between follow-ups (3 seconds)
  await waitForFollowUpDelay();
}

/**
 * Apply batch cool-down if needed
 * ANTI-BAN: Pauses ~90s after every 10 messages to prevent burst patterns
 */
async function applyBatchCooldown(messagesSent: number, batchSize: number = 10, cooldownMs: number = 90000): Promise<void> {
  if (messagesSent > 0 && messagesSent % batchSize === 0) {
    console.log(`⏸️ ANTI-BAN batch cool-down: pausing ${cooldownMs/1000}s after ${messagesSent} messages...`);
    await new Promise(resolve => setTimeout(resolve, cooldownMs));
  }
}

export const sendFollowUpMessage = async (phoneNumber: string) => {
  try {
    // Check all pacing rules (scheduler, send window, rate limit)
    const pacingCheck = await checkAllPacingRules();
    if (!pacingCheck.ok) {
      console.log(`⏸️ Skip: ${pacingCheck.reason}`);
      return false;
    }
    
    // Apply human-like delays (jitter + baseline)
    await applyHumanLikeDelays();
    
  } catch (error) {
    console.error('Error al enviar follow-up:', error);
    return false;
  }
  
  const session = userSessions.get(phoneNumber);
  if (!session) return;
  
  // Check WhatsApp chat active status
  if (isWhatsAppChatActive(session)) {
    console.log(`🚫 Skip: WhatsApp chat active for ${phoneNumber}`);
    return false;
  }

  // Verificaciones básicas y globales
  const progressCheck = canSendFollowUpToUser(session);
  if (!progressCheck.ok) {
    console.log(`🚫 Follow-up bloqueado: ${progressCheck.reason}`);
    return;
  }

  if (!canSendGlobal()) {
    console.log('⏸️ Límite global alcanzado.'); return;
  }

  // 8. Análisis del último mensaje (CONTEXTO REAL)
  const lastInfo = getLastInteractionInfo(session);
  const hoursSinceLastInteraction = lastInfo.minutesAgo / 60;

  // IMPROVED: Get stage-based timing instead of hardcoded values
  const stageTiming = getStageBasedFollowUpTiming(session.stage, session.buyingIntent || 0);
  
  console.log(`📊 Follow-up timing for ${phoneNumber}: stage=${session.stage}, buying=${session.buyingIntent}%, timing=${stageTiming.description}`);

  let body: string = "";
  let mediaPath: string | undefined;

  // === GUARDA 1: DETECTAR COMPROMISO DE COMPRA (STOP SELLING) ===
  // Si el usuario ya dijo "de una", "compro", "nequi", etc., NO enviar info de ventas.
  if (lastInfo.lastBy === 'user' && hasUserCommitted(lastInfo.lastMessage || '')) {
    console.log(`⛔ Bloqueo Inteligente: Usuario ${phoneNumber} ya mostró intención de cierre ("${lastInfo.lastMessage}").`);
    // Opcional: Podrías disparar una alerta a un humano aquí
    return;
  }

  // CASO A: El usuario habló de último
  if (lastInfo.lastBy === 'user') {

    // Sub-caso A1: Acaba de escribir hace muy poco (< configurado por stage). NO molestar.
    if (lastInfo.minutesAgo < stageTiming.minUserToBot) {
      console.log(`⏸️ User spoke ${lastInfo.minutesAgo.toFixed(0)}min ago. Waiting ${stageTiming.minUserToBot}min (${stageTiming.description})`);
      return;
    }

    const lastMsg = (lastInfo.lastMessage || '').toLowerCase();

    // Sub-caso A2: Es una pregunta compleja, queja o mensaje largo. 
    // 🛑 NO ENVIAR PRECIOS AUTOMÁTICOS.
    if (isComplexUserMessage(lastMsg)) {
      console.log(`⏸️ Usuario hizo pregunta compleja/larga. Omitiendo seguimiento automático.`);
      return;
    }

    // Sub-caso A3: Es un mensaje corto o de intención de compra (precio, ok, dale)
    else {
      // CRITICAL: Do NOT send prices if user already selected capacity or is closing
      const collectedData = getUserCollectedData(session);
      const isInClosingStage = ['closing', 'awaiting_payment', 'checkout_started', 'completed', 'converted'].includes(session.stage);
      
      if (collectedData.hasCapacity || isInClosingStage) {
        console.log(`⏸️ Usuario ya tiene capacidad seleccionada o está en etapa de cierre. NO enviar precios.`);
        return; // Don't send pricing follow-up to users who already made a decision
      }
      
      // Si pidió precio explícitamente, se manda la tabla
      if (/(precio|costo|valor|cuanto)/.test(lastMsg)) {
        const type = detectContentTypeForSession(session);
        body = buildSoftPricingMessage(session, type);
        const payload = await buildPricingFollowUpPayload(session);
        mediaPath = payload.mediaPath;
      }
      // Si fue un saludo o afirmación corta ("hola", "buenos dias", "ok") y pasaron > 30 min
      else if (lastInfo.minutesAgo > 30) {
        // Mensaje suave de re-enganche
        body = generatePersuasiveFollowUp(session, 'low')[0];
      }
    }
  }
  // CASO B: El Bot habló de último (Silencio del usuario)
  else {
    // === CRITICAL: NO enviar seguimientos si usuario ya está en etapa de cierre ===
    const collectedData = getUserCollectedData(session);
    const isInClosingStage = ['closing', 'awaiting_payment', 'checkout_started', 'completed', 'converted'].includes(session.stage);
    
    if (collectedData.hasCapacity || isInClosingStage) {
      console.log(`⏸️ Usuario ya tiene capacidad o está en cierre (stage=${session.stage}). NO enviar seguimiento automático.`);
      return; // Don't auto-follow-up users who already made a decision
    }
    
    // === GUARDA 2: NO HABLAR SOLO (Evitar monólogo del bot) ===
    // Use stage-based timing instead of hardcoded 120 minutes
    if (lastInfo.minutesAgo < stageTiming.minBotToBot) {
      console.log(`⏳ Esperando: Bot spoke ${Math.round(lastInfo.minutesAgo)}min ago. Need ${stageTiming.minBotToBot}min (${stageTiming.description})`);
      return;
    }

    // Si ha pasado mucho tiempo (> 24h), oferta irresistible
    if (hoursSinceLastInteraction > 24) {
      body = buildIrresistibleOffer(session);
    }
    // Si es seguimiento estándar
    else {
      const urgency = session.buyingIntent > 70 ? 'medium' : 'low';
      const msgs = generatePersuasiveFollowUp(session, urgency);
      body = msgs.join('\n');
    }
  }

  // === GUARDA 3: REDUNDANCIA (No repetir lo mismo) ===
  if (body && isRedundantMessage(session.interactions, body)) {
    console.log(`🔁 Redundancia detectada para ${phoneNumber}. Mensaje evitado.`);
    return;
  }

  // Si después de todo el análisis no hay cuerpo, salimos
  if (!body) return;

  // 3. Verificación de duplicados y TTL
  if (hasSentThisBody(session, body)) {
    console.log(`🚫 DEDUPE: Mensaje ya enviado a ${phoneNumber}.`);
    return;
  }

  // 4. Envío con JID formateado
  await waitForFollowUpDelay();

  try {
    // FIXED: Ensure phone number has proper JID format for Baileys
    const jid = ensureJID(phoneNumber);
    
    if (mediaPath && botInstance) {
      await botInstance.sendMessage(jid, body, { media: mediaPath });
    } else if (botInstance) {
      await botInstance.sendMessage(jid, body);
    }

    // Actualizar estados
    markGlobalSent();
    (session as any).lastFollowUpMsg = body;
    recordUserFollowUp(session);
    markBodyAsSent(session, body);
    userSessions.set(phoneNumber, session);

    console.log(`📤 Seguimiento enviado a ${phoneNumber}. Tipo: ${lastInfo.lastBy === 'user' ? 'Respuesta Diferida' : 'Proactivo'}`);

  } catch (error) {
    console.error(`❌ Error envío follow-up:`, error);
  }
};

function validateInteractionType(type: string): 'user_message' | 'bot_message' | 'system_event' {
  if (type === 'user_message' || type === 'bot_message' || type === 'system_event') return type;
  if (type === 'follow_up_response' || type === 'user_response') return 'user_message';
  if (type === 'bot_response' || type === 'automated_message') return 'bot_message';
  return 'user_message';
}

export const trackUserResponse = async (phoneNumber: string, message: string): Promise<void> => {
  try {
    if (!phoneNumber || typeof phoneNumber !== 'string') return;
    if (!message || typeof message !== 'string') message = '';

    const session = userSessions.get(phoneNumber);
    if (!session) return;

    if ((session as any).lastFollowUpMsg) {
      try {
        const sentiment = await analyzeResponseSentiment(message);
        const isPriceRelated = /precio|oferta|costo|cuanto/.test(message.toLowerCase());
        if (sentiment === 'positive' && isPriceRelated) {
          session.stage = 'interested';
          session.buyingIntent = Math.min((session.buyingIntent || 50) + 10, 100);
        } else if (sentiment === 'negative') {
          if ((session.followUpSpamCount || 0) > 2) {
            session.buyingIntent = Math.max((session.buyingIntent || 50) - 5, 0);
          }
        }

        session.interactions = session.interactions || [];
        session.interactions.push({
          timestamp: new Date(),
          message: message.trim(),
          type: validateInteractionType('follow_up_response'),
          sentiment: sentiment,
          engagement_level: sentiment === 'positive' ? 80 : sentiment === 'negative' ? 20 : 50,
          channel: 'WhatsApp',
          respondedByBot: false,
        } as Interaction);

        if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
        (session as any).lastFollowUpMsg = undefined;

      } catch (sentimentError) {
        console.error('Error al analizar sentiment de respuesta:', sentimentError);
      }
    }

    userSessions.set(phoneNumber, session);
    console.log(`📝 Respuesta registrada para ${phoneNumber}: "${message.substring(0, 50)}..."`);

  } catch (error) {
    console.error(`❌ Error en trackUserResponse para ${phoneNumber}:`, error);
  }
};

const analyzeResponseSentiment = async (message: string): Promise<SentimentType> => {
  if (!message || typeof message !== 'string') return 'neutral';
  const msg = message.toLowerCase().trim();
  if (msg.length === 0) return 'neutral';
  const positivePatterns = [
    /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
    /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
    /\b(amor|amo|encanta|fascina|ideal|justo|necesito|acepto|confirmo)\b/,
    /^(👍|🙌|👌|✌️|💪|🎉|👏|❤️|😊|🤗|😍|🥰|😘)$/
  ];
  const negativePatterns = [
    /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego|rechazar)\b/,
    /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
    /\b(aburrido|feo|horrible|odio|detesto|molesta|cancelo|cancelar)\b/,
    /^(👎|😕|😔|😢|😡|🙄|😤|😠|😒|🤔|😐|😑)$/
  ];
  for (const pattern of positivePatterns) if (pattern.test(msg)) return 'positive';
  for (const pattern of negativePatterns) if (pattern.test(msg)) return 'negative';
  if (/^[1-4]$/.test(msg)) return 'positive';
  return 'neutral';
};

export const sendDemoIfNeeded = async (session: UserSession, phoneNumber: string) => {
  if (!botInstance) return;

  function pickRandomDemo(demos: { name: string; file: string }[]): { name: string; file: string } | null {
    if (!demos || demos.length === 0) return null;
    return demos[Math.floor(Math.random() * demos.length)];
  }

  const genreTopHits = musicData.genreTopHits || {};
  const videoTopHits = videoData.topHits || {};

  const interestGenre = session.interests.find(g => (genreTopHits as any)[g]) || Object.keys(genreTopHits)[0];
  const interestVideo = session.interests.find(g => (videoTopHits as any)[g]) || Object.keys(videoTopHits)[0];

  // FIXED: Ensure phone number has proper JID format for Baileys
  const jid = ensureJID(phoneNumber);

  if (session.interests.some(i => i.includes('music') || i === 'musica' || (genreTopHits as any)[i])) {
    const demos = (genreTopHits as any)[interestGenre] || [];
    const randomDemo = pickRandomDemo(demos);
    if (randomDemo) {
      await botInstance.sendMessage(
        jid,
        {
          body: `🎧 Demo USB (${interestGenre}): ${randomDemo.name}\n¿Te gustaría tu USB con este género o prefieres mezclar varios? ¡Cuéntame!`,
          media: randomDemo.file
        }
      );
    }
    return;
  }

  if (session.interests.some(i => i.includes('video') || i === 'videos' || (videoTopHits as any)[i])) {
    const demos = (videoTopHits as any)[interestVideo] || [];
    const randomDemo = pickRandomDemo(demos);
    if (randomDemo) {
      await botInstance.sendMessage(
        jid,
        {
          body: `🎬 Demo Video (${interestVideo}): ${randomDemo.name}\n¿Quieres añadir más artistas, géneros, películas o series? ¡Personalízalo a tu gusto!`,
          media: randomDemo.file
        }
      );
    }
    return;
  }
};

export function setBotInstance(instance: any) {
  botInstance = instance;
}

export function createUserSession(phoneNumber: string): UserSession {
  const now = new Date();
  return {
    phone: phoneNumber,
    phoneNumber: phoneNumber,
    name: '',
    buyingIntent: 0,
    stage: 'initial',
    interests: [],
    conversationData: {},
    currentFlow: 'initial',
    currentStep: 'welcome',
    createdAt: now,
    updatedAt: now,
    lastInteraction: now,
    lastActivity: now,
    interactions: [],
    isFirstMessage: true,
    isPredetermined: false,
    skipWelcome: false,
    tags: [],
    messageCount: 0,
    isActive: true,
    isNewUser: true,
    isReturningUser: false,
    followUpSpamCount: 0,
    totalOrders: 0,
    demographics: {},
    preferences: {},
    customization: {
      step: 0,
      preferences: {},
      totalPrice: 0,
    }
  };
}

export function clearUserSession(phoneNumber: string): void {
  userSessions.delete(phoneNumber);
  if (followUpQueue.has(phoneNumber)) {
    clearTimeout(followUpQueue.get(phoneNumber)!);
    followUpQueue.delete(phoneNumber);
  }
  console.log(`🗑️ Sesión limpiada para usuario: ${phoneNumber}`);
}

export function getUserStats(phoneNumber: string): {
  totalInteractions: number;
  lastActivity: Date | null;
  currentFlow: string | null;
  isVIP: boolean;
  tags: string[];
} {
  const session = userSessions.get(phoneNumber);
  if (!session) {
    return { totalInteractions: 0, lastActivity: null, currentFlow: null, isVIP: false, tags: [] };
  }
  return {
    totalInteractions: session.interactions?.length || 0,
    lastActivity: session.lastActivity || null,
    currentFlow: session.currentFlow || null,
    isVIP: !!(session as any).isVIP,
    tags: session.tags || []
  };
}

export const getTopInterests = (): Array<{ interest: string; count: number }> => {
  const interestCount = new Map<string, number>();
  userSessions.forEach(session => {
    (session.interests || []).forEach(interest => {
      interestCount.set(interest, (interestCount.get(interest) || 0) + 1);
    });
  });
  return Array.from(interestCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([interest, count]) => ({ interest, count }));
};

export interface AnalyticsData {
  totalUsers: number;
  byStage: {
    initial: number;
    interested: number;
    customizing: number;
    pricing: number;
    abandoned: number;
    converted: number;
    inactive: number;
    paused: number;
  };
  avgBuyingIntent: number;
  highRiskUsers: number;
  topInterests: Array<{ interest: string; count: number }>;
  recentInteractions: Array<{
    phone: string;
    name?: string;
    stage: string;
    buyingIntent: number;
    lastInteraction: Date;
    interests?: string[];
    demographics?: any;
    preferences: Record<string, any>;
    location?: string;
  }>;
  demographicsSummary: any;
  preferencesSummary: any;
  mostActiveChannels: Array<{ channel: string; count: number }>;
  lastUpdate?: string;
}

export interface UserSpecificAnalytics {
  phone: string;
  name?: string;
  stage: string;
  buyingIntent: number;
  totalInteractions: number;
  sessionDuration: number;
  interests: string[];
  preferences: Record<string, any>;
  demographics: any;
  location?: string;
  riskLevel: string;
  conversionProbability: number;
  preferredCategories: string[];
  lastInteraction: Date;
  messageCount: number;
  responseTime: number;
  engagementScore: number;
  lastUpdate?: string;
}

// Analytics

export function getUserAnalytics(): AnalyticsData;
export function getUserAnalytics(phone: string): Promise<UserSpecificAnalytics>;
export function getUserAnalytics(phone?: string): AnalyticsData | Promise<UserSpecificAnalytics> {
  if (phone) return getUserSpecificAnalytics(phone);
  return getGeneralAnalytics();
}

function getGeneralAnalytics(): AnalyticsData {
  const sessions: UserSession[] = Array.from(userSessions.values());
  const topInteractions = getTopInterests();

  return {
    totalUsers: sessions.length,
    byStage: {
      initial: sessions.filter(s => s.stage === 'initial').length,
      interested: sessions.filter(s => s.stage === 'interested').length,
      customizing: sessions.filter(s => s.stage === 'customizing').length,
      pricing: sessions.filter(s => s.stage === 'pricing').length,
      abandoned: sessions.filter(s => s.stage === 'abandoned').length,
      converted: sessions.filter(s => s.stage === 'converted').length,
      inactive: sessions.filter(s => s.stage === 'inactive').length,
      paused: sessions.filter(s => s.stage === 'paused').length,
    },
    avgBuyingIntent: sessions.length ?
      sessions.reduce((sum, s) => sum + ((s as any).aiAnalysis?.buyingIntent || 0), 0) / sessions.length : 0,
    highRiskUsers: sessions.filter(s => (s as any).aiAnalysis?.riskLevel === 'high').length,
    topInterests: topInteractions,
    recentInteractions: sessions
      .sort((a, b) => a.lastInteraction && b.lastInteraction ? b.lastInteraction.getTime() - a.lastInteraction.getTime() : 0)
      .slice(0, 10)
      .map(s => ({
        phone: s.phone,
        name: s.name,
        stage: s.stage,
        buyingIntent: (s as any).aiAnalysis?.buyingIntent || 0,
        lastInteraction: s.lastInteraction,
        interests: s.interests,
        demographics: s.demographics,
        preferences: s.preferences,
        location: (s as any).location
      })),
    demographicsSummary: calculateDemographicsSummary(sessions),
    preferencesSummary: calculatePreferencesSummary(sessions),
    mostActiveChannels: Object.entries(
      sessions.reduce((acc, s) => {
        s.interactions?.forEach(interaction => {
          if (interaction.channel) {
            acc[interaction.channel] = (acc[interaction.channel] || 0) + 1;
          }
        });
        return acc;
      }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1]).map(([channel, count]) => ({ channel, count })),
    lastUpdate: new Date().toISOString()
  };
}

setInterval(() => {
  if (global.processingCache) {
    global.processingCache.clear();
  }
}, 10 * 60 * 1000);

function normalizeDbUser(dbUser: any): Partial<UserSession> {
  const safeJSONLocal = (v: any, fallback: any) => {
    if (v == null) return fallback;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return fallback; }
    }
    return v;
  };

  return {
    phone: dbUser.phone || dbUser.phoneNumber,
    name: dbUser.name,
    stage: dbUser.stage || 'initial',
    buyingIntent: dbUser.buying_intent ?? dbUser.buyingIntent ?? 0,
    interactions: Array.isArray(dbUser.interactions) ? dbUser.interactions : safeJSONLocal(dbUser.interactions, []),
    preferences: safeJSONLocal(dbUser.preferences, dbUser.preferences) || {},
    demographics: safeJSONLocal(dbUser.demographics, dbUser.demographics) || {},
    interests: Array.isArray(dbUser.interests) ? dbUser.interests : safeJSONLocal(dbUser.interests, []),
    location: dbUser.location,
    aiAnalysis: {
      riskLevel: dbUser.risk_level || 'low',
      buyingIntent: dbUser.buying_intent ?? 0,
      interests: Array.isArray(dbUser.interests) ? dbUser.interests : [],
      nextBestAction: dbUser.next_best_action || 'monitor',
      probabilityToConvert: dbUser.conversion_probability ?? dbUser.probability_to_convert ?? 0
    },
    createdAt: dbUser.created_at ? new Date(dbUser.created_at) : new Date(),
    updatedAt: dbUser.updated_at ? new Date(dbUser.updated_at) : new Date(),
    lastInteraction: dbUser.last_interaction ? new Date(dbUser.last_interaction) : new Date(),
    messageCount: dbUser.message_count ?? 0
  };
}

async function getUserSpecificAnalytics(phone: string): Promise<UserSpecificAnalytics> {
  const safeJSONLocal = (v: any, fallback: any) => {
    if (v == null) return fallback;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return fallback; }
    }
    return v;
  };

  try {
    const session = userSessions.get(phone);

    if (!session) {
      try {
        const dbUser = await (businessDB as any).getUserSession(phone);
        if (dbUser) {
          const norm = normalizeDbUser(dbUser);
          const preferredCategories = Array.isArray((dbUser as any).preferred_categories)
            ? (dbUser as any).preferred_categories
            : (safeJSONLocal((dbUser as any).preferred_categories, []) as string[]);

          const conversionProbability = typeof (norm as any).aiAnalysis?.probabilityToConvert === 'number'
            ? (norm as any).aiAnalysis.probabilityToConvert
            : 0;

          return {
            phone: (norm as any).phone || phone,
            name: (norm as any).name,
            stage: (norm as any).stage || 'initial',
            buyingIntent: (norm as any).buyingIntent || 0,
            totalInteractions: (norm as any).messageCount || 0,
            sessionDuration: 0,
            interests: (norm as any).interests || [],
            preferences: (norm as any).preferences || {},
            demographics: (norm as any).demographics || {},
            location: (norm as any).location,
            riskLevel: (norm as any).aiAnalysis?.riskLevel || 'low',
            conversionProbability,
            preferredCategories,
            lastInteraction: (norm as any).lastInteraction || new Date(),
            messageCount: (norm as any).messageCount || 0,
            responseTime: 0,
            engagementScore: (norm as any).aiAnalysis?.buyingIntent || 0,
            lastUpdate: new Date().toISOString()
          };
        }
      } catch (dbError) {
        console.error('❌ Error obteniendo usuario de BD:', dbError);
      }

      return {
        phone,
        stage: 'initial',
        buyingIntent: 0,
        totalInteractions: 0,
        sessionDuration: 0,
        interests: [],
        preferences: {},
        demographics: {},
        riskLevel: 'low',
        conversionProbability: 0,
        preferredCategories: [],
        lastInteraction: new Date(),
        messageCount: 0,
        responseTime: 0,
        engagementScore: 0,
        lastUpdate: new Date().toISOString()
      };
    }

    const sessionDuration = session.createdAt
      ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000)
      : 0;

    const engagementScore = calculateEngagementScore(session);
    const conversionProbability = calculateConversionProbability(session);

    return {
      phone: session.phone,
      name: session.name,
      stage: session.stage,
      buyingIntent: (session as any).aiAnalysis?.buyingIntent || session.buyingIntent || 0,
      totalInteractions: session.messageCount || 0,
      sessionDuration,
      interests: session.interests || [],
      preferences: session.preferences || {},
      demographics: session.demographics || {},
      location: (session as any).location,
      riskLevel: (session as any).aiAnalysis?.riskLevel || 'low',
      conversionProbability,
      preferredCategories: extractPreferredCategories(session),
      lastInteraction: session.lastInteraction,
      messageCount: session.messageCount || 0,
      responseTime: 0,
      engagementScore,
      lastUpdate: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error obteniendo analytics específicos del usuario:', error);
    return {
      phone,
      stage: 'initial',
      buyingIntent: 0,
      totalInteractions: 0,
      sessionDuration: 0,
      interests: [],
      preferences: {},
      demographics: {},
      riskLevel: 'low',
      conversionProbability: 0,
      preferredCategories: [],
      lastInteraction: new Date(),
      messageCount: 0,
      responseTime: 0,
      engagementScore: 0,
      lastUpdate: new Date().toISOString()
    };
  }
}

function calculateEngagementScore(session: UserSession): number {
  let score = 0;
  score += Math.min(session.messageCount || 0, 50);
  score += (session.buyingIntent || 0) * 0.3;
  const sessionMinutes = session.createdAt ? (Date.now() - new Date(session.createdAt).getTime()) / 60000 : 0;
  score += Math.min(sessionMinutes * 2, 20);
  score += Math.min((session.interests?.length || 0) * 5, 15);
  const inactiveMinutes = (Date.now() - session.lastInteraction.getTime()) / 60000;
  if (inactiveMinutes > 30) score *= 0.8;
  return Math.round(Math.min(score, 100));
}

function calculateConversionProbability(session: UserSession): number {
  let probability = 0;
  probability += (session.buyingIntent || 0) * 0.4;
  const stageWeights: Record<string, number> = {
    'initial': 5, 'interested': 15, 'customizing': 35, 'pricing': 60, 'abandoned': 10,
    'converted': 100, 'inactive': 5, 'paused': 20, 'closing': 70, 'ready_to_buy': 80
  };
  probability += stageWeights[session.stage] || 5;
  probability += Math.min((session.messageCount || 0) * 2, 20);
  const sessionMinutes = session.createdAt ? (Date.now() - new Date(session.createdAt).getTime()) / 60000 : 0;
  if (sessionMinutes > 5) probability += 10;
  if (sessionMinutes > 15) probability += 10;
  if (session.name) probability += 5;
  if ((session as any).location) probability += 5;
  if (session.preferences && Object.keys(session.preferences).length > 0) probability += 5;
  return Math.round(Math.min(probability, 100));
}

function extractPreferredCategories(session: UserSession): string[] {
  const categories: string[] = [];
  if (session.interests) {
    session.interests.forEach(interest => {
      const i = interest.toLowerCase();
      if (i.includes('música') || i.includes('music')) categories.push('Música');
      if (i.includes('video')) categories.push('Videos');
      if (i.includes('película') || i.includes('movie')) categories.push('Películas');
      if (i.includes('juego')) categories.push('Juegos');
      if (i.includes('foto')) categories.push('Fotos');
    });
  }
  if (session.preferences) {
    Object.keys(session.preferences).forEach(key => {
      if (key.includes('genre') || key.includes('genero')) categories.push('Música');
      if (key.includes('capacity') || key.includes('capacidad')) categories.push('Almacenamiento');
    });
  }
  return [...new Set(categories)];
}

function getAgeGroup(age: number): string {
  if (age < 18) return '< 18';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

export { getUserSpecificAnalytics };

export function getFollowUpSegments() {
  const now = Date.now();
  const sessions = Array.from(userSessions.values());

  const recentlyInactive: UserSession[] = [];
  const inactiveTagged: UserSession[] = [];
  const longSilent: UserSession[] = [];
  const unregistered: { phone: string }[] = [];

  sessions.forEach(s => {
    const mins = (now - s.lastInteraction.getTime()) / 60000;
    const hours = mins / 60;
    const days = hours / 24;

    if (mins >= 30 && hours < 3 && s.stage !== 'converted' && !(s.tags || []).includes('blacklist')) {
      recentlyInactive.push(s);
    }

    if (s.stage === 'inactive' && !(s.tags || []).includes('blacklist')) {
      inactiveTagged.push(s);
    }

    if (days >= 2 && s.stage !== 'converted' && !(s.tags || []).includes('blacklist')) {
      longSilent.push(s);
    }
  });

  return { recentlyInactive, inactiveTagged, longSilent, unregistered };
}

export async function registerExternalSilentUsers(phones: string[]) {
  const created: string[] = [];
  for (const p of phones) {
    const phone = validatePhoneNumber(p);
    if (!phone) continue;
    if (!userSessions.get(phone)) {
      const s = createUserSession(phone);
      s.isNewUser = true;
      s.isActive = false;
      s.stage = 'initial';
      s.buyingIntent = 20;
      userSessions.set(phone, s);
      created.push(phone);
    }
  }
  return created;
}

export async function runAssuredFollowUps(limitPerSegment = 100) {
  const { recentlyInactive, inactiveTagged, longSilent } = getFollowUpSegments();

  // Check pacing rules
  const pacingCheck = await checkAllPacingRules();
  if (!pacingCheck.ok) {
    console.log(`😴 Seguimientos en descanso: ${pacingCheck.reason}`);
    return { sent: 0, skipped: 'pacing_rules' };
  }

  let sent = 0;
  let skipped = 0;
  const BATCH_SIZE = 10; // ANTI-BAN: Send 10 messages then pause
  const BATCH_COOLDOWN_MS = 90000; // ANTI-BAN: 90 seconds between batches

  // Process recentlyInactive segment
  for (let i = 0; i < recentlyInactive.length && i < limitPerSegment; i++) {
    const s = recentlyInactive[i];
    
    // Re-check rate limiting before each send
    if (!checkRateLimit()) {
      console.log('⚠️ Rate limit reached, pausing assured follow-ups');
      break;
    }
    
    if (isWhatsAppChatActive(s)) {
      console.log(`🚫 Skip (chat active): ${s.phone}`);
      skipped++;
      continue;
    }
    
    const urgency: 'high' | 'medium' | 'low' =
      s.buyingIntent > 80 ? 'high' : (s.buyingIntent > 60 || s.stage === 'pricing') ? 'medium' : 'low';
    const msgs = generatePersuasiveFollowUp(s, urgency);
    
    // Apply human-like delays
    await applyHumanLikeDelays();
    
    const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true);
    if (ok) {
      sent++;
      await applyBatchCooldown(sent, BATCH_SIZE, BATCH_COOLDOWN_MS);
    } else {
      skipped++;
    }
  }

  // Process inactiveTagged segment
  for (let i = 0; i < inactiveTagged.length && i < limitPerSegment; i++) {
    const s = inactiveTagged[i];
    
    if (!checkRateLimit()) {
      console.log('⚠️ Rate limit reached, pausing assured follow-ups');
      break;
    }
    
    if (isWhatsAppChatActive(s)) {
      console.log(`🚫 Skip (chat active): ${s.phone}`);
      skipped++;
      continue;
    }
    
    const urgency: 'high' | 'medium' | 'low' = s.buyingIntent > 60 ? 'medium' : 'low';
    const msgs = generatePersuasiveFollowUp(s, urgency);
    msgs.unshift('🧩 Guardé tu avance. Puedo retomarlo en segundos con tus preferencias.');
    
    await applyHumanLikeDelays();
    
    const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true);
    if (ok) {
      sent++;
      await applyBatchCooldown(sent, BATCH_SIZE, BATCH_COOLDOWN_MS);
    } else {
      skipped++;
    }
  }

  // Process longSilent segment
  for (let i = 0; i < longSilent.length && i < limitPerSegment; i++) {
    const s = longSilent[i];
    
    if (!checkRateLimit()) {
      console.log('⚠️ Rate limit reached, pausing assured follow-ups');
      break;
    }
    
    if (isWhatsAppChatActive(s)) {
      console.log(`🚫 Skip (chat active): ${s.phone}`);
      skipped++;
      continue;
    }
    
    const urgency: 'high' | 'medium' | 'low' = 'low';
    const msgs = generatePersuasiveFollowUp(s, urgency);
    msgs.push('🎁 Si retomamos hoy, te incluyo una playlist exclusiva sin costo.');
    
    await applyHumanLikeDelays();
    
    const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true);
    if (ok) {
      sent++;
      await applyBatchCooldown(sent, BATCH_SIZE, BATCH_COOLDOWN_MS);
    } else {
      skipped++;
    }
  }

  console.log(`✅ Follow-ups asegurados: ${sent} enviados, ${skipped} omitidos`);
  return { sent, skipped };
}

export async function sendIrresistibleOffer(phone: string) {
  const session = await getUserSession(phone);
  if (!session || isWhatsAppChatActive(session) || !canSendOnce(session, 'irresistible_offer', 240)) return false;
  
  // Check unified pacing rules
  const pacingCheck = await checkAllPacingRules();
  if (!pacingCheck.ok) {
    console.log(`⏸️ Skip irresistible offer: ${pacingCheck.reason} for ${phone}`);
    return false;
  }
  
  const body = buildIrresistibleOffer(session);
  
  // Apply human-like delays
  await applyHumanLikeDelays();
  
  if (!botInstance) return false;
  
  // FIXED: Ensure phone number has proper JID format for Baileys
  const jid = ensureJID(phone);
  await botInstance.sendMessage(jid, body);
  
  (session as any).lastFollowUpMsg = body;
  recordUserFollowUp(session);
  markBodyAsSent(session, body);
  userSessions.set(phone, session);
  return true;
}

export function getUsersNeedingFollowUp() {
  const currentTime = new Date();
  const usersNeedingFollowUp: Array<{
    phone: string;
    session: UserSession;
    priority: string;
    minutesSinceLastInteraction: number;
    hoursSinceLastFollowUp: number;
  }> = [];

  Array.from(userSessions.entries()).forEach(([phone, session]) => {
    if (isWhatsAppChatActive(session)) return;

    const timeSinceLastInteraction = currentTime.getTime() - session.lastInteraction.getTime();
    const minutesSinceLastInteraction = timeSinceLastInteraction / 60000;
    const lastFollowUp = session.lastFollowUp || new Date(0);
    const timeSinceLastFollowUp = currentTime.getTime() - lastFollowUp.getTime();
    const hoursSinceLastFollowUp = timeSinceLastFollowUp / 36e5;

    let needsFollowUp = false;
    let priority = 'low';

    if ((session as any).aiAnalysis?.buyingIntent && (session as any).aiAnalysis.buyingIntent > 70 && minutesSinceLastInteraction > 30 && hoursSinceLastFollowUp > 2) {
      needsFollowUp = true;
      priority = 'high';
    } else if ((session as any).aiAnalysis?.buyingIntent && (session as any).aiAnalysis.buyingIntent > 50 && minutesSinceLastInteraction > 90 && hoursSinceLastFollowUp > 4) {
      needsFollowUp = true;
      priority = 'medium';
    } else if (minutesSinceLastInteraction > 180 && hoursSinceLastFollowUp > 6) {
      needsFollowUp = true;
      priority = 'low';
    }

    if (needsFollowUp && session.stage !== 'converted' && !session.tags?.includes('blacklist')) {
      usersNeedingFollowUp.push({
        phone,
        session,
        priority,
        minutesSinceLastInteraction,
        hoursSinceLastFollowUp
      });
    }
  });

  return usersNeedingFollowUp;
}

export function markVIP(phoneNumber: string) {
  const session = userSessions.get(phoneNumber);
  if (session) {
    (session as any).isVIP = true;
    session.tags = session.tags || [];
    if (!session.tags.includes('VIP')) session.tags.push('VIP');
    userSessions.set(phoneNumber, session);
  }
}

export function blacklistUser(phoneNumber: string) {
  const session = userSessions.get(phoneNumber);
  if (session) {
    session.tags = session.tags || [];
    if (!session.tags.includes('blacklist')) session.tags.push('blacklist');
    userSessions.set(phoneNumber, session);
  }
}

export function getSmartRecommendations(phone: string, userSessionsMap: Map<string, UserSession>): string[] {
  const session = userSessionsMap.get(phone);
  if (!session) return [];

  const recs: string[] = [];
  if ((session.preferences as any)?.musicGenres && (session.preferences as any).musicGenres.length > 0) {
    recs.push(`Colecciones premium de ${(session.preferences as any).musicGenres.slice(0, 2).join(' y ')}`);
  } else if (session.interests && session.interests.length > 0) {
    recs.push(`Mix especial de ${session.interests.slice(0, 2).join(' y ')}`);
  }

  switch (session.stage) {
    case 'customizing':
      recs.push('¡Prueba la opción de artistas exclusivos o mezcla de éxitos!');
      break;
    case 'pricing':
      recs.push('Consulta las ofertas flash en USBs de alta capacidad.');
      break;
    case 'interested':
      recs.push('Te recomiendo nuestro servicio de playlist personalizada.');
      break;
  }

  if ((session.preferences as any)?.capacity && (session.preferences as any).capacity.length > 0) {
    recs.push(`USB de ${(session.preferences as any).capacity[0]}GB recomendada para tu selección`);
  }

  if ((session as any).isVIP) recs.push('Acceso VIP: contenido exclusivo y atención personalizada');
  if ((session as any).purchaseHistory && (session as any).purchaseHistory.length > 0) recs.push('Nuevos lanzamientos y colecciones recientes disponibles para ti');
  if (recs.length === 0) recs.push('Descubre nuestros packs de música y películas más populares');

  return recs;
}

export function getConversationAnalysis(phone: string, userSessionsMap: Map<string, UserSession>): {
  summary: string;
  sentiment: SentimentType;
  engagement: number;
  lastIntent?: string;
  buyingIntent: number;
} {
  const session = userSessionsMap.get(phone);
  if (!session) {
    return {
      summary: 'No hay conversación registrada.',
      sentiment: 'neutral',
      engagement: 0,
      buyingIntent: 0
    };
  }

  let positive = 0, negative = 0, engagement = 0;
  let lastIntent = '';
  let total = 0;

  for (const log of session.interactions || []) {
    if (log.sentiment === 'positive') positive++;
    if (log.sentiment === 'negative') negative++;
    engagement += log.engagement_level || 0;
    if (log.intent) lastIntent = log.intent;
    total++;
  }

  let sentiment: SentimentType = 'neutral';
  if (positive > negative) sentiment = 'positive';
  else if (negative > positive) sentiment = 'negative';

  const avgEngagement = total ? Math.round(engagement / total) : 0;
  const summary = `Último mensaje: ${session.interactions?.slice(-1)[0]?.message || 'N/A'} | Última intención: ${lastIntent || 'N/A'}`;

  return {
    summary,
    sentiment,
    engagement: avgEngagement,
    lastIntent,
    buyingIntent: (session as any).aiAnalysis?.buyingIntent ?? 0
  };
}

const persuasivePhrases = [
  "USB 32GB ideal para el día a día: 5.000 canciones listas por $84.900.",
  "Sube a 64GB y llévate hasta 10.000 canciones por $119.900. Calidad + espacio.",
  "128GB para coleccionistas: 25.000 canciones por $159.900. Todo en un solo lugar.",
  "¿Playlist curada por género y década? Te la entrego lista en tu USB.",
  "Incluye sesiones exclusivas y versiones remasterizadas según tu gusto.",
  "Activa 2x1 parcial: segunda USB con 20% OFF solo hoy.",
  "Sumamos videos y series favoritas junto a tu música, todo organizado.",
  "Tu USB llega lista: nombres limpios, carpetas por artista y carátulas.",
  "Sin repeticiones ni relleno: contenido elegido manualmente.",
  "Garantía de compatibilidad en carro, parlantes y TV."
];

export function getPersuasivePhrase(): string {
  return persuasivePhrases[Math.floor(Math.random() * persuasivePhrases.length)];
}

export function validateEngagement(engagement: any): number {
  if (typeof engagement === 'number' && engagement >= 0 && engagement <= 100 && !isNaN(engagement)) return Math.round(engagement);
  return 50;
}

export function validateIntent(intent: any): string {
  if (typeof intent === 'string' && intent.trim().length > 0) return intent.trim().toLowerCase();
  return 'general';
}

export function sanitizeMessage(message: any): string {
  if (typeof message === 'string') return message.trim().substring(0, 1000);
  return '';
}

export function getPriceBlock(): string {
  return [
    '💰 Precios hoy:',
    '• 8GB $54.900 1.400 canciones o 260 vídeos • 32GB $84.900 5.000 canciones o 1.000 vídeos',
    '• 64GB $119.900 10.000 canciones o 2.000 vídeos • 128GB $159.900 22.000 canciones o 4.000 vídeos',
    'Envío GRATIS + playlist personalizada.',
    'Elige capacidad: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB'
  ].join('\n');
}

export async function sendOnce(flowDynamic: any, session: UserSession, body: string, media?: { url?: string; path?: string; caption?: string }) {
  try {
    const h = sha256(body);
    session.conversationData = session.conversationData || {};
    const set: string[] = (session.conversationData.sentBodies || []) as string[];
    if (set.includes(h)) {
      console.log('🚫 DEDUPE (flow): bloque ya enviado, omitido.');
      return;
    }
    if (media && media.path) {
      await flowDynamic([{ body, media: media.path }]);
    } else if (media && media.url) {
      await flowDynamic([{ body, media: media.url, caption: media.caption }]);
    } else {
      await flowDynamic([body]);
    }
    const next = Array.from(new Set([...set, h])).slice(-50);
    session.conversationData.sentBodies = next;
  } catch (e) {
    console.warn('⚠️ sendOnce fallo, envío normal:', e);
    await flowDynamic([body]);
  }
}

export function validatePhoneNumber(phone: any): string | null {
  if (!phone || typeof phone !== 'string') return null;

  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;

  return isValidPhoneNumberInternal(normalized) ? normalized : null;
}

function normalizeFlowAlias(flow: string, fallbackParent?: string): string {
  const f = (flow || '').toLowerCase().trim();

  const aliases: Record<string, string> = {
    'welcome_flow': 'welcomeFlow',
    'welcome': 'welcomeFlow',
    'catalog': 'catalogFlow',
    'catalog_flow': 'catalogFlow',
    'customization': 'customizationFlow',
    'customization_flow': 'customizationFlow',
    'customization_started': 'customizationFlow',
    'payment_flow': 'orderFlow',
    'order_creation': 'orderFlow',
    'processing': 'orderFlow',
    'audio_received': 'media_received',
    'media_received': 'media_received',
    'music_flow': 'musicUsb',
    'video_flow': 'videosUsb',
    'movies_flow': 'moviesUsb',
    'capacity_flow_start': 'musicUsb',
    'capacity_options_shown': 'musicUsb',
    'capacity_music': 'musicUsb',
    'capacity_comparison': 'musicUsb',
    'shipping_data_request': 'musicUsb',
    'additional_products_shown': 'musicUsb',
    'capacityvideo_initial': 'videosUsb',
    'capacityvideo_selected': 'videosUsb',
    'capacity_confirmed': 'videosUsb',
    'movies_capacity': 'moviesUsb',
    'moviesusb_capacity': 'moviesUsb',
    'moviesusb_capacityselected': 'moviesUsb',
    'moviesusb_upgradeapplied': 'moviesUsb',
    'moviesusb_shipping': 'moviesUsb',
    'moviesusb_completed': 'moviesUsb',
  };

  if (aliases[f]) return aliases[f];

  if (!aliases[f] && fallbackParent) return fallbackParent;

  return flow;
}

export function getSystemMetrics() {
  const sessions = Array.from(userSessions.values());
  const now = Date.now();
  const totalActiveSessions = sessions.filter(s => s.isActive).length;
  const totalInteractions = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
  const avgBuyingIntent = sessions.length > 0 ?
    sessions.reduce((sum, s) => sum + (s.buyingIntent || 0), 0) / sessions.length : 0;

  const avgSessionDuration = sessions.length > 0 ?
    sessions.reduce((sum, s) => {
      const duration = s.createdAt ? now - new Date(s.createdAt).getTime() : 0;
      return sum + duration;
    }, 0) / sessions.length / 60000 : 0;

  const convertedUsers = sessions.filter(s => s.stage === 'converted').length;
  const conversionRate = sessions.length > 0 ? (convertedUsers / sessions.length) * 100 : 0;

  const stageCount = new Map<string, number>();
  sessions.forEach(s => {
    const stage = s.stage || 'unknown';
    stageCount.set(stage, (stageCount.get(stage) || 0) + 1);
  });
  const topStages = Array.from(stageCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([stage, count]) => ({ stage, count }));

  let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (totalActiveSessions > 1000) systemHealth = 'warning';
  if (totalActiveSessions > 2000 || avgBuyingIntent < 30) systemHealth = 'critical';

  return {
    totalActiveSessions,
    averageSessionDuration: Math.round(avgSessionDuration),
    totalInteractions,
    averageBuyingIntent: Math.round(avgBuyingIntent),
    conversionRate: Math.round(conversionRate * 100) / 100,
    topStages,
    systemHealth
  };
}

export function getPerformanceMetrics() {
  const sessionCacheSize = userSessions.size;
  const followUpQueueSize = followUpQueue.size;
  const avgSessionSize = 2048;
  const memoryUsage = sessionCacheSize * avgSessionSize;
  const avgResponseTime = 0;
  const errorRate = 0.1;
  return {
    memoryUsage,
    sessionCacheSize,
    followUpQueueSize,
    averageResponseTime: Math.round(avgResponseTime),
    errorRate,
    lastCleanup: new Date()
  };
}

export function cleanupInactiveSessions(maxInactiveHours: number = 24): number {
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - maxInactiveHours * 60 * 60 * 1000);
  let cleaned = 0;

  Array.from(userSessions.entries()).forEach(([phoneNumber, session]) => {
    if (session.lastInteraction < cutoffTime &&
      session.stage !== 'converted' &&
      !(session as any).isVIP) {

      userSessions.delete(phoneNumber);
      if (followUpQueue.has(phoneNumber)) {
        clearTimeout(followUpQueue.get(phoneNumber)!);
        followUpQueue.delete(phoneNumber);
      }
      cleaned++;
    }
  });

  if (cleaned > 0) console.log(`🧹 Limpiadas ${cleaned} sesiones inactivas (>${maxInactiveHours}h)`);
  return cleaned;
}

export function optimizeMemoryUsage() {
  const beforeSize = userSessions.size;
  userSessions.forEach((session) => {
    if (session.conversationData?.aiInsights && (session.conversationData.aiInsights as any).length > 5) {
      (session.conversationData.aiInsights as any) = (session.conversationData.aiInsights as any).slice(-5);
    }
    if (session.conversationData?.stageHistory && (session.conversationData.stageHistory as any).length > 10) {
      (session.conversationData.stageHistory as any) = (session.conversationData.stageHistory as any).slice(-10);
    }
  });
  const cleaned = cleanupInactiveSessions(48);
  const afterSize = userSessions.size;
  return { before: beforeSize, after: afterSize, optimized: cleaned };
}

export function exportUserSessions(): string {
  try {
    const sessions = Array.from(userSessions.values());
    return JSON.stringify(sessions, null, 2);
  } catch (error) {
    console.error('❌ Error exportando sesiones:', error);
    return '[]';
  }
}

export function importUserSessions(jsonData: string): boolean {
  try {
    const sessions = safeJSON(jsonData, []);
    if (!Array.isArray(sessions)) throw new Error('Datos no válidos: se esperaba un array');
    let imported = 0;
    sessions.forEach((sessionData: any) => {
      if (sessionData.phone || sessionData.phoneNumber) {
        const phone = sessionData.phone || sessionData.phoneNumber;
        if (sessionData.lastInteraction) sessionData.lastInteraction = new Date(sessionData.lastInteraction);
        if (sessionData.createdAt) sessionData.createdAt = new Date(sessionData.createdAt);
        if (sessionData.updatedAt) sessionData.updatedAt = new Date(sessionData.updatedAt);
        userSessions.set(phone, sessionData);
        imported++;
      }
    });
    console.log(`📥 Importadas ${imported} sesiones de usuario`);
    return true;
  } catch (error) {
    console.error('❌ Error importando sesiones:', error);
    return false;
  }
}

setInterval(() => {
  const now = Date.now();
  let inactiveCount = 0;
  let followUpScheduled = 0;

  userSessions.forEach((session, phone) => {
    if (BLOCKED_STAGES.has(session.stage) || (session as any).isBlacklisted) return;

    const minsSinceLastUser = (now - session.lastInteraction.getTime()) / 60000;

    // Marcar inactivo después de 12h sin interacción
    if (minsSinceLastUser > 12 * 60 && session.stage !== 'inactive') {
      session.stage = 'inactive';
      userSessions.set(phone, session);
      inactiveCount++;
    }

    // Reglas para disparar un seguimiento de precios:
    // - Llevamos al menos 60min sin mensajes (ni usuario ni bot)
    // - No hemos enviado follow-up en la última hora
    // - No hay follow-up ya programado
    const enoughSilence = hasBeenSilentForMinutes(session, 60);
    const lastFollowUpTs = session.lastFollowUp?.getTime() || 0;
    const enoughSinceLastFollowUp = !lastFollowUpTs || (now - lastFollowUpTs) > 60 * 60 * 1000;

    if (
      enoughSilence &&
      enoughSinceLastFollowUp &&
      !followUpQueue.has(phone) &&
      !isWhatsAppChatActive(session)
    ) {
      scheduleFollowUp(phone);
      followUpScheduled++;
    }
  });

  if (inactiveCount > 0) console.log(`⚠️ ${inactiveCount} usuarios marcados como inactivos`);
  if (followUpScheduled > 0) console.log(`📅 ${followUpScheduled} seguimientos programados`);
}, 5 * 60 * 1000);

export const getOrCreateSession = async (phoneNumber: string): Promise<UserSession> => {
  return await getUserSession(phoneNumber);
};

export const updateSession = async (
  phoneNumber: string,
  updates: Partial<UserSession>
): Promise<void> => {
  try {
    const session = await getUserSession(phoneNumber);
    Object.keys(updates).forEach(key => {
      if ((updates as any)[key] !== undefined) {
        (session as any)[key] = (updates as any)[key];
      }
    });
    session.updatedAt = new Date();
    userSessions.set(phoneNumber, session);
    console.log(`📝 Sesión actualizada para ${phoneNumber}`);
  } catch (error) {
    console.error(`❌ Error actualizando sesión para ${phoneNumber}:`, error);
  }
};

export const getSessionsByStage = (stage: string): UserSession[] => {
  return Array.from(userSessions.values()).filter(session => session.stage === stage);
};

export const getSessionsByTag = (tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer' | 'decision_made'): UserSession[] => {
  return Array.from(userSessions.values()).filter(session =>
    session.tags && session.tags.includes(tag)
  );
};

export const addTagToUser = (phoneNumber: string, tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer' | 'decision_made'): boolean => {
  const session = userSessions.get(phoneNumber);
  if (session) {
    if (!session.tags) session.tags = [];
    if (!session.tags.includes(tag)) {
      session.tags.push(tag);
      session.updatedAt = new Date();
      userSessions.set(phoneNumber, session);
      return true;
    }
  }
  return false;
};

export const removeTagFromUser = (phoneNumber: string, tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer' | 'decision_made'): boolean => {
  const session = userSessions.get(phoneNumber);
  if (session && session.tags) {
    const index = session.tags.indexOf(tag);
    if (index > -1) {
      session.tags.splice(index, 1);
      session.updatedAt = new Date();
      userSessions.set(phoneNumber, session);
      return true;
    }
  }
  return false;
};

export function debugSession(phoneNumber: string): void {
  const session = userSessions.get(phoneNumber);
  if (!session) {
    console.log(`❌ No se encontró sesión para ${phoneNumber}`);
    return;
  }

  console.log(`\n🔍 DEBUG SESSION: ${phoneNumber}`);
  console.log(`📱 Nombre: ${session.name || 'N/A'}`);
  console.log(`🎯 Etapa: ${session.stage}`);
  console.log(`💡 Buying Intent: ${session.buyingIntent}%`);
  console.log(`💬 Mensajes: ${session.messageCount || 0}`);
  console.log(`🏷️ Tags: ${session.tags?.join(', ') || 'Ninguno'}`);
  console.log(`📊 Intereses: ${session.interests?.join(', ') || 'Ninguno'}`);
  console.log(`⏰ Última interacción: ${session.lastInteraction.toLocaleString()}`);
  console.log(`🔄 Flujo actual: ${session.currentFlow}`);

  if (session.interactions && session.interactions.length > 0) {
    console.log(`\n📝 Últimas 3 interacciones:`);
    session.interactions.slice(-3).forEach((interaction, index) => {
      console.log(`  ${index + 1}. [${interaction.type}] ${interaction.message.substring(0, 50)}...`);
      console.log(`     Intent: ${interaction.intent} | Sentiment: ${interaction.sentiment}`);
    });
  }

  if ((session as any).aiAnalysis) {
    console.log(`\n🤖 AI Analysis:`);
    console.log(`  Next Action: ${(session as any).aiAnalysis.nextBestAction}`);
    console.log(`  Risk Level: ${(session as any).aiAnalysis.riskLevel}`);
    console.log(`  Engagement: ${(session as any).aiAnalysis.engagementScore}`);
  }
  console.log(`\n`);
}

export function logSystemStatus(): void {
  const metrics = getSystemMetrics();
  const performance = getPerformanceMetrics();

  console.log(`\n📊 SYSTEM STATUS`);
  console.log(`🟢 Sesiones activas: ${metrics.totalActiveSessions}`);
  console.log(`💬 Total interacciones: ${metrics.totalInteractions}`);
  console.log(`🎯 Buying Intent promedio: ${metrics.averageBuyingIntent}%`);
  console.log(`📈 Tasa de conversión: ${metrics.conversionRate}%`);
  console.log(`💾 Memoria en uso: ${(performance.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
  console.log(`⏱️ Tiempo respuesta promedio: ${performance.averageResponseTime}ms`);
  console.log(`🔄 Follow-ups en cola: ${performance.followUpQueueSize}`);
  console.log(`❤️ Salud del sistema: ${metrics.systemHealth.toUpperCase()}`);
  console.log(`\n`);
}

setInterval(() => {
  const hour = new Date().getHours();
  if (hour >= 8 && hour <= 22) {
    runAssuredFollowUps(150).catch(e => console.warn('⚠️ runAssuredFollowUps error:', e));
  }
}, 2 * 60 * 60 * 1000);

setInterval(() => {
  const result = optimizeMemoryUsage();
  if (result.optimized > 0) {
    console.log(`🚀 Memoria optimizada: ${result.before} → ${result.after} sesiones (-${result.optimized})`);
  }
}, 60 * 60 * 1000);

if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    logSystemStatus();
  }, 30 * 60 * 1000);
}

console.log('✅ UserTrackingSystem completamente inicializado y optimizado');

// ====== INTEGRACIÓN DE CROSS-SELL Y REPORTES ======
import { crossSellSystem, CrossSellRecommendation } from '../services/crossSellSystem';
import { reportingSystem } from '../services/reportingSystem';

export async function generateCrossSellForUser(phoneNumber: string): Promise<CrossSellRecommendation[]> {
  const session = await getUserSession(phoneNumber);
  if (!session) {
    console.warn(`⚠️ No se encontró sesión para ${phoneNumber}`);
    return [];
  }
  const recommendations = crossSellSystem.generateRecommendations(session);
  console.log(`💎 Generadas ${recommendations.length} recomendaciones de cross-sell para ${phoneNumber}`);
  return recommendations;
}

export async function getCrossSellMessage(phoneNumber: string): Promise<string> {
  const recommendations = await generateCrossSellForUser(phoneNumber);
  return crossSellSystem.generateCrossSellMessage(recommendations);
}

export async function addCrossSellProduct(phoneNumber: string, productId: string): Promise<boolean> {
  const session = await getUserSession(phoneNumber);
  if (!session) return false;

  const product = crossSellSystem.getProductById(productId);
  if (!product) {
    console.warn(`⚠️ Producto ${productId} no encontrado`);
    return false;
  }

  if (!session.orderData) {
    session.orderData = { items: [], type: 'customized', status: 'draft' } as any;
  }
  if (!session.orderData.items) session.orderData.items = [];

  session.orderData.items.push({
    id: product.id,
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity: 1,
    unitPrice: product.price
  });

  const currentTotal = session.orderData.totalPrice || (session as any).price || 0;
  session.orderData.totalPrice = currentTotal + product.price;

  session.interactions.push({
    timestamp: new Date(),
    message: `Agregó producto: ${product.name}`,
    type: 'system_event',
    intent: 'cross_sell_added',
    sentiment: 'positive',
    engagement_level: 80,
    channel: 'WhatsApp'
  } as any);

  await updateUserSession(phoneNumber, `Producto agregado: ${product.name}`, 'cross_sell', null, false);
  console.log(`✅ Producto ${product.name} agregado al pedido de ${phoneNumber}`);
  return true;
}

export async function generateBusinessReport(): Promise<string> {
  const sessions = Array.from(userSessions.values());
  return await reportingSystem.generateBusinessReport(sessions);
}

export function generatePendingOrdersReport(): string {
  const sessions = Array.from(userSessions.values());
  return reportingSystem.generatePendingOrdersReport(sessions);
}

export async function getBusinessMetrics() {
  const sessions = Array.from(userSessions.values());

  let totalOrders = 0;
  let pendingOrders = 0;
  let completedOrders = 0;
  let totalRevenue = 0;
  let activeUsers = 0;

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  sessions.forEach(session => {
    if (session.orderData) {
      totalOrders++;
      if (session.orderData.status === 'confirmed' || session.orderData.status === 'processing') {
        completedOrders++;
        totalRevenue += session.orderData.totalPrice || (session.orderData as any).price || 0;
      } else if (session.orderData.status === 'draft') {
        pendingOrders++;
      }
    }
    if (session.lastActivity && session.lastActivity > last24h) activeUsers++;
  });

  return {
    totalOrders,
    pendingOrders,
    completedOrders,
    totalRevenue,
    activeUsers,
    totalUsers: sessions.length,
    conversionRate: sessions.length > 0 ? (completedOrders / sessions.length) * 100 : 0
  };
}

export function getTechProducts() {
  return crossSellSystem.getAllProducts();
}

export function getTechProductsByCategory(category: 'audio' | 'storage' | 'accessories' | 'cables' | 'power' | 'protection') {
  return crossSellSystem.getProductsByCategory(category);
}

export async function createAutomaticOrder(phoneNumber: string): Promise<boolean> {
  const session = await getUserSession(phoneNumber);
  if (!session) return false;

  if (!(session as any).contentType || !(session as any).capacity) {
    console.warn(`⚠️ Faltan datos para crear pedido automático: ${phoneNumber}`);
    return false;
  }

  const prices: Record<string, number> = {
    '8GB': 54900, '32GB': 84900, '64GB': 119900, '128GB': 154900, '256GB': 249900, '512GB': 399900
  };

  const basePrice = prices[(session as any).capacity] || 84900;
  const orderId = `ORD-${Date.now()}-${phoneNumber.slice(-4)}`;

  (session as any).orderId = orderId;
  session.orderData = {
    id: orderId,
    orderNumber: orderId,
    items: [{
      id: `ITEM-${Date.now()}`,
      productId: `USB-${(session as any).contentType}-${(session as any).capacity}`,
      name: `USB ${(session as any).capacity} - ${(session as any).contentType}`,
      price: basePrice,
      quantity: 1,
      unitPrice: basePrice
    }],
    type: 'customized',
    status: 'draft',
    totalPrice: basePrice,
    price: basePrice,
    createdAt: new Date(),
    startedAt: new Date(),
    customerInfo: {
      name: session.name,
      phone: phoneNumber,
      address: (session as any).customerData?.direccion
    }
  } as any;

  session.stage = 'closing';
  session.buyingIntent = Math.min((session.buyingIntent || 50) + 20, 100);

  session.interactions.push({
    timestamp: new Date(),
    message: `Pedido automático creado: ${orderId}`,
    type: 'system_event',
    intent: 'order_created',
    sentiment: 'positive',
    engagement_level: 90,
    channel: 'WhatsApp'
  } as any);

  await updateUserSession(phoneNumber, `Pedido automático creado: ${orderId}`, 'order_creation', null, false);
  console.log(`✅ Pedido automático creado para ${phoneNumber}: ${orderId}`);

  if (session.orderData?.status === 'confirmed') {
    session.stage = 'converted';
    resetFollowUpCountersForUser(session);
  }

  return true;
}

export async function getUserPreferencesSummary(phoneNumber: string): Promise<string> {
  const session = await getUserSession(phoneNumber);
  if (!session) return 'No se encontró información del usuario';

  let summary = '📊 *RESUMEN DE PREFERENCIAS*\n';
  summary += '━━━━━━━━━━━━━━━━━━━━\n\n';

  if ((session as any).contentType) summary += `🎵 Tipo de contenido: ${(session as any).contentType}\n`;
  if ((session as any).capacity) summary += `💾 Capacidad: ${(session as any).capacity}\n`;
  if ((session as any).selectedGenres && (session as any).selectedGenres.length > 0) summary += `🎼 Géneros: ${(session as any).selectedGenres.join(', ')}\n`;
  if ((session as any).mentionedArtists && (session as any).mentionedArtists.length > 0) summary += `🎤 Artistas: ${(session as any).mentionedArtists.join(', ')}\n`;
  if (session.preferences?.musicGenres && session.preferences.musicGenres.length > 0) summary += `🎶 Géneros musicales: ${session.preferences.musicGenres.join(', ')}\n`;
  if ((session as any).price) summary += `💰 Precio: $${(session as any).price.toLocaleString()}\n`;

  if (session.orderData?.items?.length) {
    summary += `\n📦 *PRODUCTOS EN EL PEDIDO*\n`;
    session.orderData.items.forEach((item, index) => {
      summary += `${index + 1}. ${item.name} - $${item.price.toLocaleString()}\n`;
    });
    summary += `\n💵 Total: $${(session.orderData.totalPrice || 0).toLocaleString()}\n`;
  }

  summary += '\n━━━━━━━━━━━━━━━━━━━━';
  return summary;
}

type InboundEvent = {
  from: string;
  body: string;
  flow?: string;
  channel?: 'WhatsApp' | 'Instagram' | 'Telegram' | 'Web' | string;
  pushName?: string;
};

type BotMessageEvent = {
  to: string;
  body: string;
  flow?: string;
  channel?: string;
};

type SystemEvent = {
  phone: string;
  message: string;
  code?: string;
  flow?: string;
  channel?: string;
  agentId?: string;
  agentName?: string;
  source?: string;
};

function detectFlowAlias(flow?: string): string {
  if (!flow) return 'keep';
  const norm = normalizeFlowAlias(flow);
  return norm || 'keep';
}

function channelOrDefault(ch?: string) {
  const c = (ch || '').toLowerCase();
  if (/insta/.test(c)) return 'Instagram';
  if (/tele/.test(c)) return 'Telegram';
  if (/web|site|shop/.test(c)) return 'Web';
  return 'WhatsApp';
}

function markWhatsAppChatActive(session: UserSession, meta?: { agentId?: string; agentName?: string; source?: string }) {
  session.tags = session.tags || [];
  if (!session.tags.includes('whatsapp_chat')) session.tags.push('whatsapp_chat');
  session.conversationData = session.conversationData || {};
  (session.conversationData as any).whatsappChatActive = true;
  (session.conversationData as any).whatsappChatMeta = {
    ...((session.conversationData as any).whatsappChatMeta || {}),
    activatedAt: new Date().toISOString(),
    agentId: meta?.agentId || ((session.conversationData as any).whatsappChatMeta?.agentId || null),
    agentName: meta?.agentName || ((session.conversationData as any).whatsappChatMeta?.agentName || null),
    source: meta?.source || ((session.conversationData as any).whatsappChatMeta?.source || 'unknown')
  };
}

function unmarkWhatsAppChatActive(session: UserSession, meta?: { agentId?: string; agentName?: string; source?: string }) {
  session.tags = session.tags || [];
  const idx = session.tags.indexOf('whatsapp_chat');
  if (idx > -1) session.tags.splice(idx, 1);
  session.conversationData = session.conversationData || {};
  (session.conversationData as any).whatsappChatActive = false;
  (session.conversationData as any).whatsappChatMeta = {
    ...((session.conversationData as any).whatsappChatMeta || {}),
    deactivatedAt: new Date().toISOString(),
    agentId: meta?.agentId || ((session.conversationData as any).whatsappChatMeta?.agentId || null),
    agentName: meta?.agentName || ((session.conversationData as any).whatsappChatMeta?.agentName || null),
    source: meta?.source || ((session.conversationData as any).whatsappChatMeta?.source || 'unknown')
  };
}

export async function onInboundMessage(ev: InboundEvent) {
  try {
    const phone = validatePhoneNumber(ev.from);
    if (!phone) return;

    const channel = channelOrDefault(ev.channel);
    const flowAlias = detectFlowAlias(ev.flow);
    const current = userSessions.get(phone)?.currentFlow || 'welcomeFlow';
    const finalFlow = flowAlias === 'keep' ? current : flowAlias;
    const confidence = (finalFlow === 'musicUsb' || finalFlow === 'videosUsb' || finalFlow === 'moviesUsb' || finalFlow === 'orderFlow') ? 0.9 : 0.7;

    await updateUserSession(
      phone,
      ev.body || '',
      finalFlow,
      null,
      false,
      {
        messageType: 'inbound_message',
        confidence,
        metadata: { channel, source: 'onInboundMessage', pushName: ev.pushName || null, receivedAt: new Date().toISOString() }
      },
      ev.pushName
    );

    await trackUserResponse(phone, ev.body || '');

    // Decidir respuesta inmediata con precios si el usuario preguntó por costo/capacidad/OK
    const session = await getUserSession(phone);
    // const decision = decideImmediateReply(session, ev.body || '');
    // if (decision.forcePricing && botInstance) {
    //   const type = detectContentTypeForSession(session);
    //   const { mediaPath } = await buildPricingFollowUpPayload(session);
    //   await waitForFollowUpDelay();
    //   if (mediaPath) await botInstance.sendMessage(phone, decision.body, { media: mediaPath });
    //   else await botInstance.sendMessage(phone, decision.body);
    //   (session as any).lastFollowUpMsg = decision.body;
    //   recordUserFollowUp(session);
    //   markBodyAsSent(session, decision.body);
    //   userSessions.set(phone, session);
    // }
  } catch (e) {
    console.error('❌ onInboundMessage error:', e);
  }
}

// export function decideImmediateReply(session: UserSession, inboundText: string): { body: string; forcePricing: boolean } {
//   const msg = (inboundText || '').toLowerCase(); const wantsPrice = /(precio|costo|cu[aá]nto|vale)/.test(msg); const wantsCapacity = /(8gb|32gb|64gb|128gb|1|2|3|4)/.test(msg); const wantsOk = /(ok|continuar|listo|perfecto|dale)/.test(msg);
//   const pricingDirect = '💰 Precios directos hoy:\n8GB $54.900 • 32GB $84.900 • 64GB $119.900 • 128GB $159.900\nEnvío GRATIS + playlist personalizada.\nResponde 1/2/3/4 para reservar.';
//   if (wantsPrice || wantsCapacity || wantsOk) {
//     return { body: pricingDirect, forcePricing: true };
//   }
//   const reminder = '¿Te muestro la tabla de precios y eliges capacidad en un paso? Responde 1/2/3/4.';
//   return { body: reminder, forcePricing: false };
// }

export async function onBotMessage(ev: BotMessageEvent) {
  try {
    const phone = validatePhoneNumber(ev.to);
    if (!phone) return;
    const session = await getUserSession(phone);
    const channel = channelOrDefault(ev.channel);
    const now = new Date();

    session.interactions = session.interactions || [];
    session.interactions.push({
      timestamp: now,
      message: (ev.body || '').substring(0, 500),
      type: 'bot_message',
      intent: 'bot_output',
      sentiment: 'neutral',
      engagement_level: 50,
      channel,
      respondedByBot: true
    } as any);

    if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
    session.updatedAt = now;
    userSessions.set(phone, session);
  } catch (e) {
    console.error('❌ onBotMessage error:', e);
  }
}

export async function onSystemEvent(ev: SystemEvent) {
  try {
    const phone = validatePhoneNumber(ev.phone);
    if (!phone) return;
    const session = await getUserSession(phone);
    const channel = channelOrDefault(ev.channel);
    const now = new Date();

    const code = (ev.code || '').toLowerCase();
    const conversionCodes = new Set(['order_confirmed', 'payment_confirmed', 'paid', 'purchase_completed']);
    if (conversionCodes.has(code)) {
      session.stage = 'converted';
      resetFollowUpCountersForUser(session);
    }
    const activateCodes = new Set([
      'human_chat_started', 'agent_assigned', 'agent_joined', 'whatsapp_chat_started', 'chat_taken', 'chat_assigned'
    ]);
    const deactivateCodes = new Set([
      'human_chat_ended', 'agent_unassigned', 'agent_left', 'whatsapp_chat_ended', 'chat_released', 'chat_closed'
    ]);

    if (activateCodes.has(code)) {
      markWhatsAppChatActive(session, { agentId: ev.agentId, agentName: ev.agentName, source: ev.source });
      console.log(`👤 Chat humano ACTIVADO (WhatsApp) para ${phone} por ${ev.agentName || ev.agentId || 'N/A'}`);
      try {
        if (typeof (businessDB as any)?.updateUserSession === 'function') {
          await (businessDB as any).updateUserSession(phone, {
            tags: jsonStringifySafe(session.tags || []),
            conversationData: jsonStringifySafe(session.conversationData || {})
          } as any);
        }
      } catch (e) {
        console.warn('⚠️ Persistencia chat activo:', e);
      }
    }

    if (deactivateCodes.has(code)) {
      unmarkWhatsAppChatActive(session, { agentId: ev.agentId, agentName: ev.agentName, source: ev.source });
      console.log(`👤 Chat humano DESACTIVADO (WhatsApp) para ${phone} por ${ev.agentName || ev.agentId || 'N/A'}`);
      try {
        if (typeof (businessDB as any)?.updateUserSession === 'function') {
          await (businessDB as any).updateUserSession(phone, {
            tags: jsonStringifySafe(session.tags || []),
            conversationData: jsonStringifySafe(session.conversationData || {})
          } as any);
        }
      } catch (e) {
        console.warn('⚠️ Persistencia chat inactivo:', e);
      }
    }

    session.interactions = session.interactions || [];
    session.interactions.push({
      timestamp: now,
      message: (ev.message || '').substring(0, 500),
      type: 'system_event',
      intent: ev.code || 'system',
      sentiment: 'neutral',
      engagement_level: 40,
      channel,
      respondedByBot: false
    } as any);

    if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
    session.updatedAt = now;
    userSessions.set(phone, session);
  } catch (e) {
    console.error('❌ onSystemEvent error:', e);
  }
}

function safeJSON(value: any, fallback: any): any {
  try {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return fallback;
      return JSON.parse(trimmed);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Check what user data has already been collected to avoid re-asking
 * Returns an object describing what information is already known
 */
export function getUserCollectedData(session: UserSession): {
  hasCapacity: boolean;
  hasGenres: boolean;
  hasArtists: boolean;
  hasContentType: boolean;
  hasPersonalInfo: boolean;
  hasShippingInfo: boolean;
  hasPaymentInfo: boolean;
  capacity?: string;
  genres?: string[];
  artists?: string[];
  contentType?: string;
  personalInfo?: { name?: string; phone?: string; email?: string };
  shippingInfo?: { address?: string; city?: string };
  completionPercentage: number;
} {
  const result: {
    hasCapacity: boolean;
    hasGenres: boolean;
    hasArtists: boolean;
    hasContentType: boolean;
    hasPersonalInfo: boolean;
    hasShippingInfo: boolean;
    hasPaymentInfo: boolean;
    capacity?: string;
    genres?: string[];
    artists?: string[];
    contentType?: string;
    personalInfo?: { name?: string; phone?: string; email?: string };
    shippingInfo?: { address?: string; city?: string };
    completionPercentage: number;
  } = {
    hasCapacity: false,
    hasGenres: false,
    hasArtists: false,
    hasContentType: false,
    hasPersonalInfo: false,
    hasShippingInfo: false,
    hasPaymentInfo: false,
    completionPercentage: 0
  };

  // Track which fields are being checked for completion percentage
  const fieldChecks = {
    capacity: false,
    genres: false,
    artists: false,
    contentType: false,
    personalInfo: false,
    shippingInfo: false,
    paymentInfo: false
  };

  // Check capacity
  const sessionAny = session as any; // Single cast for legacy properties
  const capacity = sessionAny.capacity 
    || session.conversationData?.selectedCapacity 
    || session.customization?.usbCapacity 
    || session.orderData?.selectedCapacity;
  if (capacity) {
    result.hasCapacity = true;
    result.capacity = capacity;
    fieldChecks.capacity = true;
  }

  // Check genres
  const preferencesAny = session.preferences as any;
  const conversationAny = session.conversationData as any;
  const genres = sessionAny.selectedGenres 
    || preferencesAny?.musicGenres 
    || preferencesAny?.videoGenres 
    || conversationAny?.customization?.genres;
  if (genres && Array.isArray(genres) && genres.length > 0) {
    result.hasGenres = true;
    result.genres = genres;
    fieldChecks.genres = true;
  }

  // Check artists
  const artists = sessionAny.mentionedArtists 
    || preferencesAny?.artists 
    || conversationAny?.customization?.artists;
  if (artists && Array.isArray(artists) && artists.length > 0) {
    result.hasArtists = true;
    result.artists = artists;
    fieldChecks.artists = true;
  }

  // Check content type
  const customizationAny = session.customization as any;
  const contentType = sessionAny.contentType 
    || customizationAny?.selectedType 
    || conversationAny?.selectedType;
  if (contentType) {
    result.hasContentType = true;
    result.contentType = contentType;
    fieldChecks.contentType = true;
  }

  // Check personal info
  const hasName = !!session.name;
  const hasPhone = !!session.phone || !!session.phoneNumber;
  const hasEmail = !!sessionAny.email || !!sessionAny.customerData?.email;
  if (hasName || hasEmail) {
    result.hasPersonalInfo = true;
    result.personalInfo = {
      name: session.name,
      phone: session.phone || session.phoneNumber,
      email: sessionAny.email || sessionAny.customerData?.email
    };
    fieldChecks.personalInfo = true;
  }

  // Check shipping info
  const hasAddress = !!sessionAny.customerData?.direccion 
    || !!sessionAny.shippingAddress 
    || !!conversationAny?.shippingData?.address;
  const hasCity = !!sessionAny.customerData?.ciudad 
    || !!sessionAny.city 
    || !!conversationAny?.shippingData?.city;
  if (hasAddress || hasCity) {
    result.hasShippingInfo = true;
    result.shippingInfo = {
      address: sessionAny.customerData?.direccion 
        || sessionAny.shippingAddress 
        || conversationAny?.shippingData?.address,
      city: sessionAny.customerData?.ciudad 
        || sessionAny.city 
        || conversationAny?.shippingData?.city
    };
    fieldChecks.shippingInfo = true;
  }

  // Check payment info
  const orderDataAny = session.orderData as any;
  const hasPayment = !!orderDataAny?.paymentMethod 
    || !!conversationAny?.paymentData;
  if (hasPayment) {
    result.hasPaymentInfo = true;
    fieldChecks.paymentInfo = true;
  }

  // Calculate completion percentage based on actual field count
  const totalFields = Object.keys(fieldChecks).length;
  const filledFields = Object.values(fieldChecks).filter(Boolean).length;
  result.completionPercentage = Math.round((filledFields / totalFields) * 100);

  return result;
}

/**
 * Build a comprehensive confirmation message including all collected user data
 * This ensures users see what they've already told us and don't get confused
 */
export function buildConfirmationMessage(session: UserSession, includeNextSteps: boolean = true): string {
  const collected = getUserCollectedData(session);
  
  let message = '✅ *Perfecto! Aquí está tu resumen:*\n\n';
  
  if (collected.hasContentType) {
    const typeEmoji = collected.contentType === 'musica' ? '🎵' : 
                     collected.contentType === 'videos' ? '🎬' : '🍿';
    message += `${typeEmoji} *Tipo:* USB de ${collected.contentType}\n`;
  }
  
  if (collected.hasCapacity) {
    message += `💾 *Capacidad:* ${collected.capacity}\n`;
  }
  
  if (collected.hasGenres && collected.genres) {
    message += `🎼 *Géneros seleccionados:* ${collected.genres.slice(0, 5).join(', ')}${collected.genres.length > 5 ? '...' : ''}\n`;
  }
  
  if (collected.hasArtists && collected.artists) {
    message += `🎤 *Artistas:* ${collected.artists.slice(0, 3).join(', ')}${collected.artists.length > 3 ? '...' : ''}\n`;
  }
  
  if (collected.hasPersonalInfo && collected.personalInfo) {
    if (collected.personalInfo.name) {
      message += `👤 *Nombre:* ${collected.personalInfo.name}\n`;
    }
  }
  
  if (collected.hasShippingInfo && collected.shippingInfo) {
    if (collected.shippingInfo.city) {
      message += `📍 *Ciudad:* ${collected.shippingInfo.city}\n`;
    }
  }
  
  // Add completion indicator
  message += `\n📊 *Progreso:* ${collected.completionPercentage}% completado\n`;
  
  if (includeNextSteps) {
    message += '\n';
    if (!collected.hasCapacity) {
      message += '👉 *Siguiente paso:* Selecciona la capacidad de tu USB\n';
    } else if (!collected.hasGenres && collected.contentType === 'musica') {
      message += '👉 *Siguiente paso:* Cuéntame qué géneros musicales te gustan\n';
    } else if (!collected.hasPersonalInfo) {
      message += '👉 *Siguiente paso:* Necesito tus datos para el envío\n';
    } else if (!collected.hasShippingInfo) {
      message += '👉 *Siguiente paso:* ¿A qué dirección te lo envío?\n';
    } else {
      message += '👉 *Siguiente paso:* ¡Confirmemos tu pedido!\n';
    }
  }
  
  return message;
}

export function isUrgentFollowUpNeeded(session: UserSession): boolean {
  const hoursSinceLastInteraction = (Date.now() - session.lastInteraction.getTime()) / 36e5;

  return (
    session.buyingIntent > 75 &&
    hoursSinceLastInteraction < 4 &&
    hoursSinceLastInteraction > 0.5 &&
    session.stage === 'pricing' &&
    !isWhatsAppChatActive(session)
  );
}

function analyzeContextBeforeSend(session: UserSession): { ok: boolean; reason?: string } {
  const now = new Date();

  if (!isHourAllowed(now)) return { ok: false, reason: 'outside_hours' };
  if (isWhatsAppChatActive(session)) return { ok: false, reason: 'wa_chat_active' };

  // NOTA: Ya no bloqueamos por 'hasSignificantProgress' aquí, eso se maneja en la lógica de negocio.

  const minsSinceLast = (now.getTime() - session.lastInteraction.getTime()) / 60000;

  // IMPORTANTE: Eliminamos el bloqueo "last_speaker_user" de aquí. 
  // La función sendFollowUpMessage ahora decide INTELIGENTEMENTE qué hacer.

  // Solo bloqueamos si es MUY reciente para evitar spam inmediato
  if (minsSinceLast < 10) return { ok: false, reason: 'recent_interaction' };

  // Bloqueo anti-spam masivo
  const hist = (session.conversationData?.followUpHistory || []) as string[];
  if (hist.length >= 6 && session.stage !== 'converted') return { ok: false, reason: 'max_6_per_user' };

  return { ok: true };
}

// Determina si han pasado al menos N minutos sin mensajes (ni del usuario ni del bot)
function hasBeenSilentForMinutes(session: UserSession, minutes: number): boolean {
  const now = Date.now();
  const ms = minutes * 60 * 1000;
  const last = (session.interactions || []).slice(-1)[0];
  const lastTs = last ? (last.timestamp as any as Date).getTime() : session.lastInteraction?.getTime() || 0;
  if (!lastTs) return false;
  return now - lastTs >= ms;
}

// [BLOQUE 3] NUEVO helper: quién habló de último y hace cuánto
function getLastInteractionInfo(session: UserSession): {
  lastBy: 'user' | 'bot' | 'system' | 'none';
  minutesAgo: number;
  lastIntent?: string;
  lastMessage?: string;
} {
  const logs = session.interactions || [];
  if (!logs.length) return { lastBy: 'none', minutesAgo: 9999 };

  const last = logs[logs.length - 1];
  const ms = Date.now() - new Date(last.timestamp).getTime();
  const minutesAgo = ms / 60000;

  let lastBy: 'user' | 'bot' | 'system' = 'system';
  if (last.type === 'user_message') lastBy = 'user';
  else if (last.type === 'bot_message') lastBy = 'bot';

  return {
    lastBy,
    minutesAgo,
    lastIntent: last.intent,
    lastMessage: last.message
  };
}

export function getFollowUpStats() {
  return {
    totalSent: FOLLOWUP_SENT_TOTAL,
    sentInCurrentWindow: FOLLOWUP_SENT_WINDOW,
    windowStartedAt: new Date(FOLLOWUP_LAST_WINDOW_AT),
    queueSize: followUpQueue.size,
    globalLimits: {
      perHour: RATE_GLOBAL.perHourMax,
      perDay: RATE_GLOBAL.perDayMax,
      currentHourCount: RATE_GLOBAL.hourCount,
      currentDayCount: RATE_GLOBAL.dayCount
    },
    lastMessageDelay: Date.now() - lastFollowUpTimestamp
  };
}

export function resetFollowUpCounters() {
  FOLLOWUP_SENT_TOTAL = 0;
  FOLLOWUP_SENT_WINDOW = 0;
  FOLLOWUP_LAST_WINDOW_AT = Date.now();
  RATE_GLOBAL.hourCount = 0;
  RATE_GLOBAL.dayCount = 0;
  RATE_GLOBAL.hourWindowStart = Date.now();
  RATE_GLOBAL.dayWindowStart = Date.now();
  lastFollowUpTimestamp = 0;
  console.log('🔄 Contadores de seguimiento reseteados');
}

export function pauseFollowUpSystem() {
  followUpSystemPaused = true;
  console.log('⏸️ Sistema de seguimientos PAUSADO');
}

export function resumeFollowUpSystem() {
  followUpSystemPaused = false;
  console.log('▶️ Sistema de seguimientos REANUDADO');
}

export function logConsolidatedActivity() {
  const stats = getFollowUpStats();
  const systemMetrics = getSystemMetrics();
  const performance = getPerformanceMetrics();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 REPORTE CONSOLIDADO DEL SISTEMA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🔔 SEGUIMIENTOS:');
  console.log(`   Total enviados: ${stats.totalSent}`);
  console.log(`   Ventana actual: ${stats.sentInCurrentWindow}`);
  console.log(`   Cola pendiente: ${stats.queueSize}`);
  console.log(`   Límite hora: ${stats.globalLimits.currentHourCount}/${stats.globalLimits.perHour}`);
  console.log(`   Límite día: ${stats.globalLimits.currentDayCount}/${stats.globalLimits.perDay}`);
  console.log(`   Sistema: ${followUpSystemPaused ? '⏸️ PAUSADO' : '▶️ ACTIVO'}\n`);

  console.log('👥 USUARIOS:');
  console.log(`   Sesiones activas: ${systemMetrics.totalActiveSessions}`);
  console.log(`   Total usuarios: ${userSessions.size}`);
  console.log(`   Buying Intent promedio: ${systemMetrics.averageBuyingIntent.toFixed(1)}%`);
  console.log(`   Tasa conversión: ${systemMetrics.conversionRate.toFixed(2)}%\n`);

  console.log('⚡ RENDIMIENTO:');
  console.log(`   Memoria: ${(performance.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Cache size: ${performance.sessionCacheSize}`);
  console.log(`   Salud: ${systemMetrics.systemHealth.toUpperCase()}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

setInterval(() => {
  logConsolidatedActivity();
}, 30 * 60 * 1000);

// ===== WATCHDOG: Release stuck WhatsApp chats (>6h without interaction) =====
/**
 * Automatically releases WhatsApp chat active flag for sessions that have been
 * stuck for more than 6 hours without any interaction.
 * This prevents permanently blocking follow-ups for abandoned human chats.
 */
export async function releaseStuckWhatsAppChats(): Promise<number> {
  const now = Date.now();
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  let released = 0;
  
  console.log('🔍 Watchdog: Checking for stuck WhatsApp chats...');
  
  for (const [phone, session] of userSessions.entries()) {
    // Check if WhatsApp chat is active
    if (!isWhatsAppChatActive(session)) continue;
    
    // Normalize session to ensure lastInteraction is valid
    const normalized = normalizeSessionForFollowUp(session);
    const timeSinceLastInteraction = now - normalized.lastInteraction.getTime();
    
    // If stuck for more than 6 hours, release it
    if (timeSinceLastInteraction > SIX_HOURS_MS) {
      const hoursStuck = (timeSinceLastInteraction / 36e5).toFixed(1);
      console.log(`⚠️ Watchdog: Releasing stuck WhatsApp chat for ${phone} (stuck for ${hoursStuck}h)`);
      
      // Remove whatsapp_chat tag
      session.tags = (session.tags || []).filter(tag => 
        tag !== 'whatsapp_chat' && 
        tag !== 'chat_activo' && 
        !tag.startsWith('wa_chat') &&
        !tag.startsWith('whatsapp_')
      );
      
      // Deactivate the flag in conversationData
      if (session.conversationData) {
        const extData = session.conversationData as ExtendedConversationData;
        extData.whatsappChatActive = false;
        if (extData.whatsappChatMeta) {
          extData.whatsappChatMeta.autoReleased = true;
          extData.whatsappChatMeta.autoReleasedAt = new Date().toISOString();
          extData.whatsappChatMeta.autoReleasedReason = `No interaction for ${hoursStuck}h`;
        }
      }
      
      // Keep stage consistent - if in a critical stage, leave it; otherwise move to appropriate stage
      const criticalStages = ['converted', 'completed', 'order_confirmed', 'processing', 'payment_confirmed', 'shipping'];
      if (!criticalStages.includes(session.stage)) {
        // If user had significant progress, mark as inactive; otherwise keep current stage
        if (hasSignificantProgress(session)) {
          session.stage = 'inactive';
        }
        // else keep current stage to allow follow-ups to resume
      }
      
      session.updatedAt = new Date();
      userSessions.set(phone, session);
      
      // Persist to database
      try {
        if (hasUpdateUserSession(businessDB)) {
          await businessDB.updateUserSession(phone, {
            // Note: jsonStringifySafe returns string, but database expects raw types
            // Using 'as any' to match existing pattern in codebase (see line 2348)
            tags: jsonStringifySafe(session.tags || []) as any,
            conversationData: jsonStringifySafe(session.conversationData || {}) as any,
            stage: session.stage,
            updatedAt: session.updatedAt
          });
        }
      } catch (e) {
        console.warn(`⚠️ Watchdog: Error persisting release for ${phone}:`, e);
      }
      
      released++;
    }
  }
  
  if (released > 0) {
    console.log(`✅ Watchdog: Released ${released} stuck WhatsApp chat(s)`);
  } else {
    console.log('✅ Watchdog: No stuck WhatsApp chats found');
  }
  
  return released;
}

// Schedule watchdog to run every hour
setInterval(() => {
  releaseStuckWhatsAppChats().catch(e => console.error('❌ Watchdog error:', e));
}, 60 * 60 * 1000); // Every hour

// ===== WEEKLY SWEEP: Process "no leido" WhatsApp labels =====
/**
 * Weekly scheduled task to find and re-engage with unread WhatsApp chats.
 * Sends contextual responses to elicit information and resume the proper flow.
 */
export async function processUnreadWhatsAppChats(): Promise<number> {
  console.log('📨 Weekly sweep: Processing unread WhatsApp chats with "no leido" label...');
  
  // Check pacing rules
  const pacingCheck = await checkAllPacingRules();
  if (!pacingCheck.ok) {
    console.log(`😴 Skip unread sweep: ${pacingCheck.reason}`);
    return 0;
  }
  
  let processed = 0;
  const now = new Date();
  const BATCH_SIZE = 10; // ANTI-BAN: Send 10 messages then pause
  const BATCH_COOLDOWN_MS = 90000; // ANTI-BAN: 90 seconds between batches
  
  // Find all sessions with "no leido" tag/label
  const unreadSessions: UserSession[] = [];
  for (const [phone, session] of userSessions.entries()) {
    const tags = (session.tags || []).map(t => t.toLowerCase());
    const hasNoLeidoTag = tags.some(t => 
      t === 'no leido' ||
      t === 'no_leido' ||
      t === 'noleido' ||
      t === 'unread' ||
      t.includes('no leido')
    );
    
    if (hasNoLeidoTag) {
      unreadSessions.push(session);
    }
  }
  
  console.log(`📊 Found ${unreadSessions.length} unread chat(s) to process`);
  
  for (const session of unreadSessions) {
    const phone = session.phone || session.phoneNumber;
    if (!phone) continue;
    
    // Check rate limiting before each send
    if (!checkRateLimit()) {
      console.log('⚠️ Rate limit reached, pausing unread sweep');
      break;
    }
    
    // Normalize session before checks
    const normalized = normalizeSessionForFollowUp(session);
    
    // Check if we can send a follow-up (respects anti-spam and existing rules)
    const canSend = canSendFollowUpToUser(normalized);
    if (!canSend.ok) {
      console.log(`⏭️ Skipping unread chat ${phone}: ${canSend.reason}`);
      continue;
    }
    
    // Build contextual re-engagement message
    const message = buildUnreadChatMessage(normalized);
    
    // Send the message using the bot instance
    if (botInstance && typeof botInstance.sendMessage === 'function') {
      try {
        // Apply human-like delays
        await applyHumanLikeDelays();
        
        // FIXED: Ensure phone number has proper JID format for Baileys
        const jid = ensureJID(phone);
        await botInstance.sendMessage(jid, message);
        
        console.log(`✅ Sent unread chat re-engagement to ${phone}`);
        
        // Update session state
        recordUserFollowUp(normalized);
        normalized.conversationData = normalized.conversationData || {};
        const extData = normalized.conversationData as ExtendedConversationData;
        extData.lastUnreadSweep = now.toISOString();
        
        // Remove "no leido" tag after processing
        normalized.tags = (normalized.tags || []).filter(t => 
          !['no leido', 'no_leido', 'noleido', 'unread'].includes(t.toLowerCase())
        );
        
        normalized.updatedAt = now;
        userSessions.set(phone, normalized);
        
        // Persist to database
        try {
          await incrementFollowUpCounter(normalized);
          if (hasUpdateUserSession(businessDB)) {
            await businessDB.updateUserSession(phone, {
              // Note: jsonStringifySafe returns string, but database expects raw types
              // Using 'as any' to match existing pattern in codebase (see line 2348)
              tags: jsonStringifySafe(normalized.tags || []) as any,
              conversationData: jsonStringifySafe(normalized.conversationData || {}) as any,
              lastFollowUp: normalized.lastFollowUp,
              updatedAt: normalized.updatedAt
            });
          }
        } catch (e) {
          console.warn(`⚠️ Error persisting unread sweep for ${phone}:`, e);
        }
        
        processed++;
        
        // ANTI-BAN: Batch cool-down - pause after every 10 messages
        await applyBatchCooldown(processed, BATCH_SIZE, BATCH_COOLDOWN_MS);
      } catch (e) {
        console.error(`❌ Error sending unread chat message to ${phone}:`, e);
      }
    } else {
      console.warn('⚠️ Bot instance not available for sending unread chat messages');
    }
  }
  
  console.log(`✅ Weekly sweep complete: Processed ${processed}/${unreadSessions.length} unread chat(s)`);
  return processed;
}

/**
 * Build a contextual re-engagement message for unread chats.
 * Analyzes conversation history to provide relevant follow-up.
 */
function buildUnreadChatMessage(session: UserSession): string {
  const name = session.name ? session.name.split(' ')[0] : '';
  const greet = name ? `¡Hola ${name}!` : '¡Hola!';
  
  // Check what data we've already collected
  const collected = getUserCollectedData(session);
  
  // Get last interaction context
  const lastInteraction = (session.interactions || []).slice(-3);
  const lastUserMessage = lastInteraction
    .filter(i => i.type === 'user_message')
    .slice(-1)[0];
  
  // Build contextual message based on progress and last interaction
  if (collected.completionPercentage >= 80) {
    // Close to completion - push for finalization
    return [
      `${greet} 🎯`,
      '',
      'Vi que estabas muy cerca de finalizar tu pedido personalizado.',
      `Ya tenemos el ${collected.completionPercentage}% de la información.`,
      '',
      collected.hasCapacity ? `💾 Capacidad: ${collected.capacity}` : '',
      collected.hasGenres && collected.genres ? `🎼 Géneros: ${collected.genres.slice(0, 3).join(', ')}` : '',
      '',
      '¿Quieres que finalicemos tu pedido ahora?',
      'Solo necesito confirmar algunos detalles y lo tendrás listo.',
      '',
      'Responde *SÍ* para continuar o cuéntame si quieres cambiar algo.'
    ].filter(Boolean).join('\n');
  } else if (collected.hasCapacity && collected.completionPercentage >= 50) {
    // Has capacity, decent progress - focus on personalization
    return [
      `${greet} 🎵`,
      '',
      'Tengo tu USB listo para personalizar:',
      `💾 ${collected.capacity} - ¡Excelente elección!`,
      '',
      '¿Qué géneros y artistas quieres incluir?',
      'Puedes decirme tus favoritos y yo armo una selección perfecta para ti.',
      '',
      collected.hasGenres ? `Ya tienes: ${collected.genres?.slice(0, 3).join(', ')}` : '',
      '',
      'Responde con tus géneros favoritos para continuar 🎶'
    ].filter(Boolean).join('\n');
  } else if (lastUserMessage && lastUserMessage.message) {
    // Has last message - respond contextually
    const lastMsg = lastUserMessage.message.toLowerCase();
    if (/(precio|costo|vale|cuanto)/.test(lastMsg)) {
      return [
        `${greet} 💰`,
        '',
        'Te comparto los precios de nuestras USBs:',
        '',
        '🚀 8GB - 1,400 canciones: $54.900',
        '🌟 32GB - 5,000 canciones: $84.900',
        '🔥 64GB - 10,000 canciones: $119.900',
        '🏆 128GB - 25,000 canciones: $159.900',
        '',
        '✨ INCLUYE: Envío GRATIS + Playlist personalizada + Carátulas',
        '',
        'Responde 1/2/3/4 para reservar tu USB ahora.'
      ].join('\n');
    }
  }
  
  // Generic re-engagement - persuasive offer
  return [
    `${greet} 🔥`,
    '',
    'Veo que dejaste pendiente tu USB personalizada.',
    '',
    '**OFERTA ESPECIAL HOY:**',
    '✅ 8GB $54.900 | 32GB $84.900 | 64GB $119.900 | 128GB $159.900',
    '🎁 BONUS: Envío GRATIS + Playlist curada + Carátulas + Garantía 7 días',
    '',
    '¿Te gustaría cerrar tu pedido con esta oferta?',
    'Responde 1/2/3/4 según la capacidad que prefieras.',
    '',
    'O si prefieres, cuéntame qué música/videos buscas y te ayudo a elegir.'
  ].join('\n');
}

console.log('✅ Sistema de seguimiento con retraso de 3s entre mensajes inicializado');
console.log('⏱️ Retraso configurado: 3000ms entre usuarios diferentes');
console.log('🚀 Todas las mejoras aplicadas correctamente');
console.log('👁️ Watchdog activado: liberará chats de WhatsApp bloqueados >6h');
console.log('📅 Barrido semanal configurado para chats "no leido"');
console.log('💼 Work/Rest scheduler: 45 min trabajo / 15 min descanso');
console.log('🕐 Ventana de envío unificada: 08:00-22:00');
console.log('🛡️ Anti-ban mejorado: rate limiting (8 msg/min), jitter (2-15s), batch cool-down (90s/10 msgs)');
console.log('⏰ Recency gating: 20 min mínimo desde última interacción');
console.log('📊 Batch cool-down: 90s después de cada 10 mensajes');

// Export new pacing and anti-ban functions
export { isWithinAllowedSendWindow, isInWorkPeriod, getTimeRemainingInCurrentPeriod };
