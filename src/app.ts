import dotenv from 'dotenv';
dotenv.config();

import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import { MysqlAdapter as Database } from '@builderbot/database-mysql';
import { adapterDB, businessDB, pool } from './mysql-database';  // Import pool for ShutdownManager

import {
  canSendOnce,
  setBotInstance,
  getUserAnalytics,
  getSmartRecommendations,
  updateUserSession,
  userSessions,
  getUserSession,
  sendFollowUpMessage,
  triggerChannelReminder,
  isWhatsAppChatActive,
  hasSignificantProgress,
  followUpQueue,          // solo se usa en /v1/followup/health y /v1/followup/cleanup (legacy/compat)
  isValidPhoneNumber,
  cleanupFollowUpQueue,
  cleanInvalidPhones,
  getPriceBlock,
  releaseStuckWhatsAppChats,
  processUnreadWhatsAppChats,
  ensureJID,  // Add ensureJID helper to prevent Baileys JID errors
  isWithinAllowedSendWindow,  // NEW: Unified send window check
  isInWorkPeriod,  // NEW: Work/rest scheduler check
  getTimeRemainingInCurrentPeriod,  // NEW: Get time remaining in current period
  checkAllPacingRules,  // NEW: Unified pacing rules checker
  randomDelay,  // NEW: Random delay for human-like behavior
  waitForFollowUpDelay as waitForFollowUpDelayFromTracking,  // NEW: Follow-up delay - alias to avoid conflict
  isStaleContact  // NEW: Check if contact is stale (>365 days inactive)
} from './flows/userTrackingSystem';

import { aiService } from './services/aiService';
import AIMonitoring from './services/aiMonitoring';
import { IntelligentRouter } from './services/intelligentRouter';
import { flowCoordinator } from './services/flowCoordinator';
import { persuasionEngine } from './services/persuasionEngine';
import { 
  canReceiveFollowUps, 
  hasReachedMaxAttempts, 
  isInCooldown 
} from './services/incomingMessageHandler';
import { conversationMemory } from './services/conversationMemory';
import { conversationAnalyzer } from './services/conversationAnalyzer';
import { initMessageDeduper, getMessageDeduper } from './services/MessageDeduper';
import { initShutdownManager, getShutdownManager } from './services/ShutdownManager';
import { stopFollowUpSystem } from './services/followUpService';
import { startupReconciler } from './services/StartupReconciler';

import flowHeadPhones from './flows/flowHeadPhones';
import flowTechnology from './flows/flowTechnology';
import flowUsb from './flows/flowUsb';
import menuFlow from './flows/menuFlow';
import menuTech from './flows/menuTech';
import pageOrCatalog from './flows/pageOrCatalog';
import flowAsesor from './flows/flowAsesor';
import musicUsb from './flows/musicUsb';
import videosUsb from './flows/videosUsb';
import moviesUsb from './flows/moviesUsb';
import gamesUsb from './flows/gamesUsb';
import mainFlow from './flows/mainFlow';
import customUsb from './flows/customUsb';
import capacityMusic from './flows/capacityMusic';
import { datosCliente } from './flows/datosCliente';
import promosUsbFlow from './flows/promosUsbFlow';
import contentSelectionFlow from './flows/contentSelectionFlow';
import testCapture from './flows/testCapture';
import trackingDashboard from './flows/trackingDashboard';
import { startControlPanel } from './controlPanel';
import capacityVideo from './flows/capacityVideo';
import comboUsb from './flows/comboUsb';
import promoUSBSoporte from './flows/promoUSBSoporte';
import prices from './flows/prices';

import aiCatchAllFlow from './flows/mainFlow';
import aiAdminFlow from './flows/aiAdminFlow';
import { iluminacionFlow, herramientasFlow, energiaFlow, audioFlow } from './flows/catalogFlow';
import customizationFlow from './flows/customizationFlow';
import orderFlow from './flows/orderFlow';
import { ControlPanelAPI } from './services/controlPanelAPI';
import { unifiedLogger } from './utils/unifiedLogger';
import { orderEventEmitter } from './services/OrderEventEmitter';
import { OrderNotificationEvent } from '../types/notificador';
import { processingJobService } from './services/ProcessingJobService';

import { exec as cpExec } from 'child_process';
import util from 'util';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import path from 'path';
import express from 'express';
import cron from 'node-cron';
const exec = util.promisify(cpExec);

unifiedLogger.info('system', 'Checking environment variables', {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Configured' : 'Not found',
  MYSQL_DB_HOST: process.env.MYSQL_DB_HOST || 'Not set',
  MYSQL_DB_USER: process.env.MYSQL_DB_USER || 'Not set',
  MYSQL_DB_NAME: process.env.MYSQL_DB_NAME || 'Not set',
  PORT: process.env.PORT || 'Not set'
});

// ==========================================
// === INTERFACES Y TIPOS ===
// ==========================================

interface ExtendedUserSession {
  phone: string;
  phoneNumber?: string;
  name?: string;
  stage?: string;
  currentFlow?: string;
  buyingIntent?: number;
  lastInteraction?: Date;
  lastFollowUp?: Date;
  followUpCount?: number;
  priorityScore?: number;
  urgencyLevel?: 'high' | 'medium' | 'low';
  isProcessing?: boolean;
  lastFollowUpReason?: string;
  interests?: string[];
  interactions?: any[];
  conversationData?: any;
  followUpSpamCount?: number;
  tags?: string[];
  // New follow-up control fields
  contactStatus?: 'ACTIVE' | 'OPT_OUT' | 'CLOSED';
  lastUserReplyAt?: Date;
  lastUserReplyCategory?: 'NEGATIVE' | 'COMPLETED' | 'CONFIRMATION' | 'POSITIVE' | 'NEUTRAL';
  followUpCount24h?: number;
  lastFollowUpResetAt?: Date;
}

interface QueuedFollowUp {
  phone: string;
  urgency: 'high' | 'medium' | 'low';
  scheduledFor: number;
  timeoutId: NodeJS.Timeout;
  attempts: number;
  reason?: string;
}

// ==========================================
// === RATE LIMITING GLOBAL ===
// ==========================================

const RATE_GLOBAL = {
  perHourMax: 60,
  perDayMax: 5000,
  hourWindowStart: Date.now(),
  hourCount: 0,
  dayWindowStart: Date.now(),
  dayCount: 0
};

function resetRateLimitsIfNeeded() {
  const now = Date.now();

  if (now - RATE_GLOBAL.hourWindowStart >= 3600000) {
    RATE_GLOBAL.hourWindowStart = now;
    RATE_GLOBAL.hourCount = 0;
    console.log('🔄 Rate limit horario reseteado');
  }

  if (now - RATE_GLOBAL.dayWindowStart >= 86400000) {
    RATE_GLOBAL.dayWindowStart = now;
    RATE_GLOBAL.dayCount = 0;
    console.log('🔄 Rate limit diario reseteado');
  }
}

function canSendGlobal(): boolean {
  resetRateLimitsIfNeeded();
  return RATE_GLOBAL.hourCount < RATE_GLOBAL.perHourMax &&
    RATE_GLOBAL.dayCount < RATE_GLOBAL.perDayMax;
}

function markGlobalSent() {
  resetRateLimitsIfNeeded();
  RATE_GLOBAL.hourCount++;
  RATE_GLOBAL.dayCount++;
}

// ==========================================
// === UTILIDADES BÁSICAS ===
// ==========================================

/**
 * Helper function to send JSON responses in Polka-compatible format
 * Polka uses Node's native response object, not Express-style res.json()
 */
function sendJson(res: any, status: number, payload: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

import { ensureDatabaseSchema } from './utils/schemaValidator';
import { validateDBProvider, detectSQLiteUsage, logDBProviderSelection, checkForSQLiteFiles } from './utils/dbConfig';

async function initializeApp() {
  try {
    console.log('🚀 Iniciando inicialización de la aplicación...');
    
    // MYSQL SSOT ENFORCEMENT - Step 1: Validate DB Provider
    console.log('🔒 MySQL SSOT: Validando configuración de base de datos...');
    validateDBProvider();
    
    // MYSQL SSOT ENFORCEMENT - Step 2: Log DB provider selection (REQUIRED)
    logDBProviderSelection();
    
    // MYSQL SSOT ENFORCEMENT - Step 3: Check for SQLite database files
    checkForSQLiteFiles();
    
    // MYSQL SSOT ENFORCEMENT - Step 4: Detect SQLite usage in runtime
    console.log('🔍 MySQL SSOT: Verificando que no se use SQLite en runtime...');
    detectSQLiteUsage();
    console.log('✅ MySQL SSOT: No se detectó uso activo de SQLite');
    
    const isConnected = await businessDB.testConnection();

    if (!isConnected) {
      console.error('❌ No se pudo conectar a MySQL. Verifica tu configuración.');
      console.error('   1. Asegúrate de que MySQL esté corriendo');
      console.error('   2. Verifica las credenciales en .env');
      console.error('   3. Verifica que la base de datos exista');
      process.exit(1);
    }

    await businessDB.initialize();
    
    // Validate and ensure database schema is correct
    await ensureDatabaseSchema();
    
    // Initialize message deduplication service
    console.log('🔧 Initializing message deduplication service...');
    initMessageDeduper(5, 1, businessDB); // 5-minute TTL, 1-minute cleanup, with DB persistence
    console.log('✅ Message deduplication initialized');
    
    // Run startup reconciliation before bot is ready
    console.log('🔄 Running startup reconciliation...');
    const reconciliationResult = await startupReconciler.reconcile();
    if (!reconciliationResult.success) {
      console.warn('⚠️  Startup reconciliation completed with errors:', reconciliationResult.errors);
    } else {
      console.log('✅ Startup reconciliation completed successfully');
    }
    
    console.log('✅ Inicialización completada exitosamente');
  } catch (error: any) {
    console.error('❌ Error crítico en inicialización:', error);
    throw error;
  }
}

let botInstance: any = null;
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+573008602789';

// Store follow-up system handle for shutdown integration
let followUpSystemHandle: any = null;

// ===== UNIFIED SEND WINDOW (08:00-22:00) =====
// Use unified send window check from userTrackingSystem
// This ensures consistent hour enforcement across all follow-up systems
const isWithinSendingWindow = isWithinAllowedSendWindow;

// Maintain backward compatibility wrapper
// Both functions use the same unified check to ensure consistency
function isHourAllowed(date = new Date()): boolean {
  return isWithinAllowedSendWindow(date);
}

const buildCrossSellSnippet = async (phone: string, session: ExtendedUserSession) => {
  try {
    const analytics = await businessDB.getUserAnalytics(phone);
    const categories = analytics?.preferredCategories || session.interests || [];

    if (categories.includes('music') || categories.includes('música')) {
      return '➕ Suma un llavero LED (+$9.900) o upgrade a 64GB con 2.000+ canciones extra.';
    }
    if (categories.includes('videos') || categories.includes('películas') || categories.includes('movies')) {
      return '➕ Agrega trailers 4K y carátulas organizadas. Upgrade a 128GB por mejor relación GB/$';
    }
    return '➕ Recomendado: funda impermeable y grabado láser del nombre.';
  } catch {
    return '➕ Recomendado: funda impermeable y grabado láser del nombre.';
  }
};

const sendAutomaticMessage = async (phoneNumber: string, messages: string[]) => {
  if (!botInstance) {
    console.error('❌ Bot instance no disponible para envío automático');
    return;
  }

  // ANTI-BAN: Check all pacing rules (send window, work/rest, rate limit)
  const pacingCheck = await checkAllPacingRules();
  if (!pacingCheck.ok) {
    console.log(`⏸️ Mensaje automático bloqueado para ${phoneNumber}: ${pacingCheck.reason}`);
    return;
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    console.log(`🚫 Teléfono inválido: ${phoneNumber}`);
    return;
  }

  try {
    // ANTI-BAN: Apply human-like delays (random 2-15s + 3s baseline)
    await randomDelay();
    await waitForFollowUpDelayFromTracking();
    
    const groupedMessage = messages.join('\n\n');
    // ANTI-BAN: Ensure JID formatting
    const jid = ensureJID(phoneNumber);
    await botInstance.sendMessage(jid, groupedMessage, {});
    await businessDB.logMessage({
      phone: phoneNumber,
      message: groupedMessage,
      type: 'outgoing',
      automated: true,
      timestamp: new Date()
    });
    markGlobalSent();
    console.log(`📤 Mensaje automático enviado a ${phoneNumber}`);
  } catch (error) {
    console.error(`❌ Error enviando mensaje automático a ${phoneNumber}:`, error);
  }
};

const generatePersonalizedFollowUp = async (
  user: ExtendedUserSession,
  urgencyLevel: 'high' | 'medium' | 'low'
): Promise<string[]> => {
  try {
    const dbUser = await businessDB.getUserSession(user.phone);
    const userAnalytics = await businessDB.getUserAnalytics(user.phone);

    const name = (dbUser?.name || user.name || 'amigo').split(' ')[0];

    // ✅ SHORTENED: Single concise message based on stage, no multiple messages
    let message = '';

    // Check stage first for contextual message
    switch (user.stage) {
      case 'customizing':
        message = `¡Hola ${name}! 🎧 ¿Seguimos personalizando tu USB?`;
        break;
      case 'awaiting_capacity':
        message = `¡Hola ${name}! 💾 ¿Qué capacidad prefieres? Responde 1/2/3/4 🎵`;
        break;
      case 'pricing':
        message = `¡Hola ${name}! 💳 ¿Viste las opciones? Cuéntame cuál te interesa 🎵`;
        break;
      case 'interested':
        message = `¡Hola ${name}! 🎶 ¿Retomamos tu pedido? Cuéntame qué necesitas 😊`;
        break;
      case 'cart_abandoned':
        message = `¡Hola ${name}! 🛒 ¿Finalizamos tu pedido? Tu USB está lista para confirmar 🎵`;
        break;
      default:
        // Default based on urgency
        if (urgencyLevel === 'high') {
          message = `¡Hola ${name}! 🔥 USB personalizada desde $59.900. ¿Te interesa? Responde SÍ 🎵`;
        } else if (urgencyLevel === 'medium') {
          message = `¡Hola ${name}! ¿Lista tu USB personalizada? Cuéntame qué buscas 😊`;
        } else {
          message = `¡Hola ${name}! ¿Te ayudo con tu USB personalizada? 🎵`;
        }
    }

    return [message];
  } catch (error) {
    console.error('❌ Error generando seguimiento personalizado:', error);
    const name = user.name?.split(' ')[0] || 'amigo';
    return [`¡Hola ${name}! ¿Seguimos con tu USB personalizada? 🎵`];
  }
};

console.log('🔧 Configurando sistema de análisis contextual...');
console.log('✅ Context Analyzer inicializado');
console.log('✅ Context Logger configurado');
console.log('✅ Middleware contextual disponible');

// ==========================================
// === POOL DE PROCESOS EXTERNOS (opcional) ===
// ==========================================

class ProcessPool {
  private activeProcesses = 0;
  private readonly MAX_PROCESSES = 10;

  async execute(command: string, opts: { timeout?: number } = {}): Promise<string> {
    while (this.activeProcesses >= this.MAX_PROCESSES) {
      await new Promise(r => setTimeout(r, 100));
    }
    this.activeProcesses++;
    try {
      const { stdout } = await exec(command, { timeout: opts.timeout ?? 5000 });
      return stdout;
    } finally {
      this.activeProcesses--;
    }
  }
}

const processPool = new ProcessPool();

// ==========================================
// === CONFIGURACIÓN DE SEGUIMIENTO ===
// ==========================================

const FOLLOWUP_CONFIG = {
  RESCHEDULE_DELAY_MS: 60 * 60 * 1000,  // 1 hour
  MIN_BUYING_INTENT_FOR_FOLLOWUP: 60,    // Minimum 60% intent
  MIN_ACTIVITY_GAP_MINUTES: 15,          // Don't send if active in last 15 min
} as const;

// ==========================================
// === SISTEMA DE COLA MEJORADO ===
// ==========================================

class FollowUpQueueManager {
  private queue: Map<string, QueuedFollowUp> = new Map();
  private readonly MAX_QUEUE_SIZE = 5000;
  private readonly PRIORITY_WEIGHTS = { high: 3, medium: 2, low: 1 };
  private readonly BACKPRESSURE_THRESHOLD = 200; // Apply backpressure when queue > 200
  private readonly MIN_BACKPRESSURE_MULTIPLIER = 0.2; // Min 20% extra delay
  private readonly MAX_BACKPRESSURE_MULTIPLIER = 0.4; // Max 40% extra delay

  add(phone: string, urgency: 'high' | 'medium' | 'low', delayMs: number, reason?: string): boolean {
    const utilization = (this.queue.size / this.MAX_QUEUE_SIZE) * 100;
    if (utilization > 80) {
      console.warn(`⚠️ Cola al ${utilization.toFixed(1)}% de capacidad (${this.queue.size}/${this.MAX_QUEUE_SIZE})`);
    }
    
    // NEW: Backpressure logic - if queue is over threshold, only accept high priority
    if (this.queue.size > this.BACKPRESSURE_THRESHOLD && urgency !== 'high') {
      console.log(`⏸️ Backpressure: Queue at ${this.queue.size}, skipping non-priority (${urgency}) follow-up for ${phone}`);
      return false;
    }

    const existing = this.queue.get(phone);
    if (existing) {
      if (this.PRIORITY_WEIGHTS[urgency] > this.PRIORITY_WEIGHTS[existing.urgency]) {
        this.remove(phone);
        console.log(`🔄 Actualizando prioridad de ${phone}: ${existing.urgency} → ${urgency}`);
      } else {
        console.log(`⏭️ ${phone} ya en cola con prioridad ${existing.urgency}`);
        return false;
      }
    }

    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      const removed = this.removeLeastPriority();
      if (!removed) {
        console.log(`⚠️ Cola llena (${this.queue.size}), no se pudo agregar ${phone}`);
        return false;
      }
    }
    
    // NEW: Apply additional delay if queue is large (slow dispatch)
    let adjustedDelayMs = delayMs;
    if (this.queue.size > this.BACKPRESSURE_THRESHOLD) {
      // Add 20-40% extra delay for backpressure
      const extraDelayMultiplier = this.MIN_BACKPRESSURE_MULTIPLIER + 
        Math.random() * (this.MAX_BACKPRESSURE_MULTIPLIER - this.MIN_BACKPRESSURE_MULTIPLIER);
      const extraDelay = delayMs * extraDelayMultiplier;
      adjustedDelayMs = delayMs + extraDelay;
      console.log(`⏱️ Backpressure delay: +${Math.round(extraDelay / 60000)}min for ${phone}`);
    }

    const timeoutId = setTimeout(async () => {
      await this.process(phone);
    }, adjustedDelayMs);

    this.queue.set(phone, {
      phone,
      urgency,
      scheduledFor: Date.now() + adjustedDelayMs,
      timeoutId,
      attempts: 0,
      reason
    });

    console.log(`➕ Encolado: ${phone} (${urgency}) en ${Math.round(adjustedDelayMs / 60000)}min | Cola: ${this.queue.size}/${this.MAX_QUEUE_SIZE}`);
    return true;
  }

  private async process(phone: string): Promise<void> {
    const item = this.queue.get(phone);
    if (!item) return;

    try {
      const session = userSessions.get(phone);
      if (!session) {
        console.log(`⚠️ Sesión no encontrada: ${phone}`);
        this.remove(phone);
        return;
      }

      // NEW: Check if contact is stale (>365 days inactive) - skip follow-ups to last year's users
      const staleCheck = isStaleContact(session);
      if (staleCheck.isStale) {
        console.log(`🚫 Stale contact, removing from queue: ${phone} - ${staleCheck.reason}`);
        this.remove(phone);
        return;
      }

      if (isWhatsAppChatActive(session)) {
        console.log(`🚫 Chat activo WhatsApp: ${phone}`);
        this.remove(phone);
        return;
      }
      
      // IMPROVED: Final validation - check if user recently interacted
      const lastInteraction = session.lastInteraction ? new Date(session.lastInteraction) : new Date(0);
      const minSinceLastInteraction = (Date.now() - lastInteraction.getTime()) / (1000 * 60);
      
      if (minSinceLastInteraction < FOLLOWUP_CONFIG.MIN_ACTIVITY_GAP_MINUTES) {
        console.log(`⏸️ Usuario activo recientemente (${Math.round(minSinceLastInteraction)}min): ${phone}`);
        // Reschedule for later
        this.remove(phone);
        this.add(phone, item.urgency, FOLLOWUP_CONFIG.RESCHEDULE_DELAY_MS, item.reason); // Try again later
        return;
      }
      
      // IMPROVED: Validate they have made some progress before sending
      const hasProgress = hasSignificantProgress(session);
      const buyingIntent = session.buyingIntent || 0;
      
      if (!hasProgress && buyingIntent < FOLLOWUP_CONFIG.MIN_BUYING_INTENT_FOR_FOLLOWUP) {
        console.log(`⏭️ Sin progreso significativo y baja intención (${buyingIntent}%): ${phone}`);
        // Don't send follow-up to users who barely engaged
        this.remove(phone);
        return;
      }

      if (!isHourAllowed()) {
        console.log(`⏰ Fuera de horario: ${phone}`);

        const tomorrow9am = new Date();
        tomorrow9am.setDate(tomorrow9am.getDate() + 1);
        tomorrow9am.setHours(9, 0, 0, 0);
        const delayMs = tomorrow9am.getTime() - Date.now();

        this.remove(phone);
        this.add(phone, item.urgency, delayMs, item.reason);
        return;
      }

      if (!canSendGlobal()) {
        console.log(`⏸️ Límite global alcanzado, reintentando en 30min: ${phone}`);
        this.remove(phone);
        this.add(phone, item.urgency, 30 * 60 * 1000, item.reason);
        return;
      }

      await waitForFollowUpDelayFromTracking();
      await sendFollowUpMessage(phone);
      markGlobalSent();

      console.log(`✅ Seguimiento enviado: ${phone} (${item.reason || 'sin razón'})`);
      this.remove(phone);

    } catch (error) {
      console.error(`❌ Error procesando ${phone}:`, error);

      if (item.attempts < 2) {
        item.attempts++;
        const retryDelay = 30 * 60 * 1000;
        this.remove(phone);
        this.add(phone, item.urgency, retryDelay, `${item.reason} (reintento ${item.attempts})`);
        console.log(`🔄 Reintento ${item.attempts}/2 para ${phone}`);
      } else {
        this.remove(phone);
        console.log(`❌ Descartado tras 2 intentos: ${phone}`);
      }
    }
  }

  private removeLeastPriority(): boolean {
    let lowestPhone: string | null = null;
    let lowestPriority = Infinity;
    let oldestScheduled = Infinity;

    this.queue.forEach((item, phone) => {
      const priority = this.PRIORITY_WEIGHTS[item.urgency];

      if (priority < lowestPriority ||
        (priority === lowestPriority && item.scheduledFor < oldestScheduled)) {
        lowestPriority = priority;
        lowestPhone = phone;
        oldestScheduled = item.scheduledFor;
      }
    });

    if (lowestPhone) {
      this.remove(lowestPhone);
      console.log(`🗑️ Removido por prioridad baja: ${lowestPhone}`);
      return true;
    }
    return false;
  }

  remove(phone: string): void {
    const item = this.queue.get(phone);
    if (item) {
      clearTimeout(item.timeoutId);
      this.queue.delete(phone);
    }
  }

  getSize(): number {
    return this.queue.size;
  }

  clear(): void {
    this.queue.forEach(item => clearTimeout(item.timeoutId));
    this.queue.clear();
    console.log('🧹 Cola completamente limpiada');
  }

  getStats() {
    const stats = {
      total: this.queue.size,
      maxSize: this.MAX_QUEUE_SIZE,
      utilizationPercent: Math.round((this.queue.size / this.MAX_QUEUE_SIZE) * 100),
      high: 0,
      medium: 0,
      low: 0,
      nextScheduled: [] as Array<{ phone: string; urgency: string; in: string; reason?: string }>
    };

    const items = Array.from(this.queue.values())
      .sort((a, b) => a.scheduledFor - b.scheduledFor);

    items.forEach(item => {
      stats[item.urgency]++;
    });

    items.slice(0, 5).forEach(item => {
      const minutesUntil = Math.round((item.scheduledFor - Date.now()) / 60000);
      stats.nextScheduled.push({
        phone: item.phone.slice(-4),
        urgency: item.urgency,
        in: minutesUntil > 0 ? `${minutesUntil}min` : 'ahora',
        reason: item.reason
      });
    });

    return stats;
  }
}

const followUpQueueManager = new FollowUpQueueManager();

// Make followUpQueueManager available globally for queue cleanup on user messages
if (typeof global !== 'undefined') {
  (global as any).followUpQueueManager = followUpQueueManager;
}

// ==========================================
// === LIMPIEZA AUTOMÁTICA DE LA COLA ===
// ==========================================

const cleanupQueueInterval = setInterval(() => {
  let cleaned = 0;
  const phonesToRemove: string[] = [];
  const cleanReasons: Record<string, string> = {};

  (followUpQueueManager as any).queue?.forEach((item: QueuedFollowUp, phone: string) => {
    const session = userSessions.get(phone);

    if (!session) {
      phonesToRemove.push(phone);
      cleanReasons[phone] = 'no_session';
      return;
    }
    
    // NEW: Remove stale contacts (>365 days inactive) - cleanup users from previous year
    const staleCheck = isStaleContact(session);
    if (staleCheck.isStale) {
      phonesToRemove.push(phone);
      cleanReasons[phone] = staleCheck.reason || 'stale_contact';
      return;
    }
    
    // Remove if user is converted or blacklisted
    if (session.stage === 'converted' || session.tags?.includes('blacklist')) {
      phonesToRemove.push(phone);
      cleanReasons[phone] = session.stage === 'converted' ? 'converted' : 'blacklisted';
      return;
    }
    
    // NEW: Remove if user has reached max follow-up attempts (3)
    if (hasReachedMaxAttempts(session)) {
      phonesToRemove.push(phone);
      cleanReasons[phone] = 'max_attempts_3';
      return;
    }
    
    // NEW: Remove if user is in active cooldown period
    const cooldownCheck = isInCooldown(session);
    if (cooldownCheck.inCooldown) {
      phonesToRemove.push(phone);
      const hours = cooldownCheck.remainingHours?.toFixed(1) || '?';
      cleanReasons[phone] = `cooldown_${hours}h`;
      return;
    }
    
    // NEW: Remove if user is not_interested or has opt-out tags
    const optOutTags = ['do_not_disturb', 'opt_out', 'no_contact'];
    const hasOptOutTag = session.tags && session.tags.some((tag: string) => optOutTags.includes(tag));
    if (session.stage === 'not_interested' || hasOptOutTag) {
      phonesToRemove.push(phone);
      cleanReasons[phone] = session.stage === 'not_interested' ? 'not_interested' : 'opt_out_tag';
      return;
    }
    
    // NEW: Remove if user cannot receive follow-ups (OPT_OUT, CLOSED)
    const canReceive = canReceiveFollowUps(session);
    if (!canReceive.can) {
      phonesToRemove.push(phone);
      cleanReasons[phone] = canReceive.reason || 'cannot_receive';
      return;
    }
  });

  phonesToRemove.forEach(phone => {
    followUpQueueManager.remove(phone);
    cleaned++;
    const reason = cleanReasons[phone] || 'unknown';
    console.log(`🧹 Removed ${phone.slice(-4)} from queue: ${reason}`);
  });

  if (cleaned > 0) {
    console.log(`🧹 Limpiados ${cleaned} seguimientos obsoletos de la cola`);
  }

  const stats = followUpQueueManager.getStats();
  console.log(`📊 Cola: ${stats.total}/${stats.maxSize} (${stats.utilizationPercent}%) | H:${stats.high} M:${stats.medium} L:${stats.low}`);
}, 15 * 60 * 1000);

// ==========================================
// === SISTEMA DE SEGUIMIENTO MEJORADO ===
// ==========================================

const activeFollowUpSystem = () => {
  console.log('🎯 Sistema de seguimiento con cola inteligente activo...');

  const systemState = {
    isRunning: false,
    lastExecution: 0,
    processedUsers: new Set<string>(),
    errorCount: 0,
    maxErrors: 10,
    cycleCount: 0
  };

  const executeFollowUpCycle = async () => {
    // Check work/rest scheduler
    if (!isInWorkPeriod()) {
      const remaining = getTimeRemainingInCurrentPeriod();
      console.log(`😴 Período de descanso activo. Reanudaremos en ${remaining.minutes} minutos.`);
      return;
    }
    
    if (!isWithinSendingWindow()) {
      console.log('⏰ Fuera de ventana horaria (08:00-22:00)');
      return;
    }

    if (systemState.isRunning) {
      console.log('⏭️ Ciclo ya en ejecución, saltando...');
      return;
    }

    if (systemState.errorCount >= systemState.maxErrors) {
      console.log('❌ Demasiados errores, sistema pausado');
      return;
    }

    const now = Date.now();
    if (now - systemState.lastExecution < 5 * 60 * 1000) {
      return;
    }

    systemState.isRunning = true;
    systemState.lastExecution = now;
    systemState.cycleCount++;

    try {
      console.log(`\n🔄 ===== CICLO ${systemState.cycleCount} =====`);

      const queueStats = followUpQueueManager.getStats();
      console.log(`📊 Cola actual: ${queueStats.total}/${queueStats.maxSize} (${queueStats.utilizationPercent}%)`);

      let activeUsers: any[] = [];
      try {
        if (typeof businessDB?.getActiveUsers === 'function') {
          activeUsers = (await businessDB.getActiveUsers(48) || []).slice(0, 20);
        } else {
          console.warn('⚠️ businessDB.getActiveUsers no disponible');
          return;
        }
      } catch (dbError) {
        console.error('❌ Error obteniendo usuarios activos:', dbError);
        systemState.errorCount++;
        return;
      }

      if (activeUsers.length === 0) {
        console.log('📭 No hay usuarios activos para seguimiento');
        return;
      }

      console.log(`📊 Analizando ${activeUsers.length} usuarios activos...`);
      let queued = 0;
      let skipped = 0;

      for (const user of activeUsers) {
        try {
          if (!user?.phone || typeof user.phone !== 'string') continue;

          const userKey = `${user.phone}_${new Date().getHours()}`;
          if (systemState.processedUsers.has(userKey)) {
            skipped++;
            continue;
          }

          const currentTime = new Date();
          const lastInteraction = user.lastInteraction ? new Date(user.lastInteraction) : new Date(0);
          const minSinceLast = (currentTime.getTime() - lastInteraction.getTime()) / (1000 * 60);
          const lastFollowUp = user.lastFollowUp ? new Date(user.lastFollowUp) : new Date(0);
          const hoursSinceFollowUp = (currentTime.getTime() - lastFollowUp.getTime()) / (1000 * 60 * 60);

          // IMPROVED: Skip if user recently interacted (active conversation)
          if (minSinceLast < 10) {
            // User was active in last 10 minutes - don't interrupt
            skipped++;
            continue;
          }
          
          // IMPROVED: Check if user is in WhatsApp active chat
          const session = userSessions.get(user.phone);
          if (session && isWhatsAppChatActive(session)) {
            skipped++;
            continue;
          }

          // NEW: Skip stale contacts (>365 days inactive) - don't enqueue users from previous year
          if (session) {
            const staleCheck = isStaleContact(session);
            if (staleCheck.isStale) {
              console.log(`⏭️ Skipping stale contact: ${user.phone} - ${staleCheck.reason}`);
              skipped++;
              continue;
            }
          }

          // ✅ NEW: Skip users in critical checkout/data collection stages
          // Don't send follow-ups when user is mid-purchase or providing data
          const criticalStages = new Set([
            'awaiting_capacity', 'collecting_data', 'collecting_name',
            'collecting_address', 'collecting_payment', 'payment_confirmed',
            'data_auto_detected', 'checkout_started', 'closing', 'order_confirmed'
          ]);
          if (user.stage && criticalStages.has(user.stage)) {
            console.log(`⏭️ Skipping user in critical stage: ${user.phone} - ${user.stage}`);
            skipped++;
            continue;
          }

          let userAnalytics: any = {};
          try {
            if (typeof businessDB?.getUserAnalytics === 'function') {
              userAnalytics = await businessDB.getUserAnalytics(user.phone) || {};
            }
          } catch (analyticsError) {
            console.warn(`⚠️ Error analytics ${user.phone}:`, analyticsError);
          }

          const buyingIntent = userAnalytics?.buyingIntent || user.buyingIntent || 0;
          
          // IMPROVED: Only send follow-ups to users with significant progress
          // Skip users who just visited but didn't engage meaningfully
          const hasProgress = session ? hasSignificantProgress(session) : false;
          
          if (!hasProgress && buyingIntent < 70) {
            // User hasn't made significant progress and intent is low
            // Wait longer before following up
            if (minSinceLast < 360) { // Less than 6 hours - too soon
              skipped++;
              continue;
            }
          }

          // IMPROVED: More conservative timing requirements
          let urgency: 'high' | 'medium' | 'low' = 'low';
          let needsFollowUp = false;
          let minDelayRequired = 2;
          let reason = '';
          let delayMinutes = 120;

          // HIGH PRIORITY - Very engaged users who showed strong intent
          if (buyingIntent > 85 && minSinceLast > 30 && hoursSinceFollowUp > 3) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 3;
            delayMinutes = 60;
            reason = 'Alta intención de compra (>85%)';
          } else if (buyingIntent > 70 && minSinceLast > 60 && hoursSinceFollowUp > 4) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 4;
            delayMinutes = 90;
            reason = 'Buena intención de compra (>70%)';
          } else if (user.stage === 'pricing' && minSinceLast > 45 && hoursSinceFollowUp > 3) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 3;
            delayMinutes = 90;
            reason = 'Consultó precios';
          } else if (user.stage === 'cart_abandoned' && minSinceLast > 60 && hoursSinceFollowUp > 4) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 4;
            delayMinutes = 120;
            reason = 'Carrito abandonado';
          } 
          // MEDIUM PRIORITY - Users in process but not urgent
          else if (user.stage === 'customizing' && minSinceLast > 90 && hoursSinceFollowUp > 6) {
            needsFollowUp = true;
            urgency = 'medium';
            minDelayRequired = 6;
            delayMinutes = 180;
            reason = 'Personalizando producto';
          } else if (user.stage === 'interested' && minSinceLast > 180 && hoursSinceFollowUp > 8) {
            needsFollowUp = true;
            urgency = 'medium';
            minDelayRequired = 8;
            delayMinutes = 240;
            reason = 'Mostró interés';
          } 
          // LOW PRIORITY - General follow-up only after significant time
          else if (minSinceLast > 480 && hoursSinceFollowUp > 12) {
            needsFollowUp = true;
            urgency = 'low';
            minDelayRequired = 12;
            delayMinutes = 360;
            reason = 'Seguimiento general';
          }

          if (needsFollowUp && hoursSinceFollowUp >= minDelayRequired) {
            const queueUtilization = (followUpQueueManager.getSize() / 1000) * 100;

            if (urgency === 'high' || queueUtilization < 80) {
              const added = followUpQueueManager.add(
                user.phone,
                urgency,
                delayMinutes * 60 * 1000,
                reason
              );

              if (added) {
                queued++;
                systemState.processedUsers.add(userKey);
                console.log(`📋 Encolado: ${user.phone} (${urgency}) - ${reason}`);
              } else {
                skipped++;
              }
            } else {
              skipped++;
            }
          }
        } catch (userError) {
          console.error(`❌ Error analizando usuario ${user?.phone}:`, userError);
          systemState.errorCount++;
          continue;
        }
      }

      console.log(`✅ Ciclo completado: ${queued} encolados, ${skipped} omitidos`);

      const finalStats = followUpQueueManager.getStats();
      console.log(`📊 Estado final: ${finalStats.total}/${finalStats.maxSize} (${finalStats.utilizationPercent}%)`);

      if (queued > 0) {
        systemState.errorCount = Math.max(0, systemState.errorCount - 1);
      }

    } catch (error) {
      console.error('❌ Error crítico en ciclo de seguimiento:', error);
      systemState.errorCount++;
    } finally {
      systemState.isRunning = false;
    }
  };

  const executeMaintenanceCycle = async () => {
    try {
      console.log('\n🧹 ===== MANTENIMIENTO DEL SISTEMA =====');

      systemState.processedUsers.clear();
      console.log('✅ Cache de usuarios procesados limpiado');

      const now = Date.now();
      if (systemState.errorCount > 0 && now - systemState.lastExecution > 60 * 60 * 1000) {
        systemState.errorCount = 0;
        console.log('🔄 Contador de errores reseteado');
      }

      if (typeof businessDB?.resetSpamCounters === 'function') {
        await businessDB.resetSpamCounters(24);
        console.log('✅ Contadores de spam reseteados');
      }

      if (typeof businessDB?.cleanInactiveSessions === 'function') {
        await businessDB.cleanInactiveSessions(7 * 24);
        console.log('✅ Sesiones inactivas limpiadas');
      }

      const stats = followUpQueueManager.getStats();
      console.log(`📊 Estadísticas:`);
      console.log(`   - Cola: ${stats.total}/${stats.maxSize} (${stats.utilizationPercent}%)`);
      console.log(`   - Prioridades: H:${stats.high} M:${stats.medium} L:${stats.low}`);
      console.log(`   - Ciclos ejecutados: ${systemState.cycleCount}`);
      console.log(`   - Errores: ${systemState.errorCount}/${systemState.maxErrors}`);
      console.log(`   - Rate limits: ${RATE_GLOBAL.hourCount}/${RATE_GLOBAL.perHourMax}h | ${RATE_GLOBAL.dayCount}/${RATE_GLOBAL.perDayMax}d`);

      if (stats.nextScheduled.length > 0) {
        console.log(`   - Próximos seguimientos:`);
        stats.nextScheduled.forEach((item, i) => {
          console.log(`     ${i + 1}. ****${item.phone} (${item.urgency}) en ${item.in} - ${item.reason || 'N/A'}`);
        });
      }

      console.log('✅ Mantenimiento completado\n');
    } catch (error) {
      console.error('❌ Error en mantenimiento:', error);
    }
  };

  const followUpInterval = setInterval(executeFollowUpCycle, 15 * 60 * 1000);
  const maintenanceInterval = setInterval(executeMaintenanceCycle, 60 * 60 * 1000);

  setTimeout(executeFollowUpCycle, 30 * 1000);

  console.log('✅ Sistema de seguimiento configurado exitosamente');
  console.log(`   - Ciclos cada 15 minutos`);
  console.log(`   - Mantenimiento cada hora`);
  console.log(`   - Cola máxima: 5000 usuarios`);
  console.log(`   - Delay entre mensajes: 3 segundos`);

  // NOTE: Cleanup is now handled by ShutdownManager - see main()
  // The intervals are registered with ShutdownManager after startup

  return {
    stop: () => {
      // Stop via ShutdownManager instead of direct cleanup
      try {
        const shutdownManager = require('./services/ShutdownManager').getShutdownManager();
        shutdownManager.initiateShutdown('MANUAL_STOP');
      } catch (error) {
        // Fallback to manual cleanup if ShutdownManager not available
        clearInterval(followUpInterval);
        clearInterval(maintenanceInterval);
        followUpQueueManager.clear();
        console.log('🛑 Sistema de seguimiento detenido (fallback)');
      }
    },
    getStatus: () => ({
      ...systemState,
      queue: followUpQueueManager.getStats(),
      rateLimits: {
        hourly: `${RATE_GLOBAL.hourCount}/${RATE_GLOBAL.perHourMax}`,
        daily: `${RATE_GLOBAL.dayCount}/${RATE_GLOBAL.perDayMax}`
      }
    })
  };
};

// ==========================================
// === FLUJOS DEL BOT ===
// ==========================================

const voiceNoteFlow = addKeyword<Provider, Database>(EVENTS.VOICE_NOTE)
  .addAction(async (ctx: any, { flowDynamic, endFlow }) => {
    try {
      if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();

      console.log(`🎤 Audio recibido de ${ctx.from}`);
      const session = await getUserSession(ctx.from);

      await updateUserSession(
        ctx.from,
        '[AUDIO_MESSAGE]',
        'audio_received',
        null,
        false,
        { metadata: { ...session, name: ctx.name || ctx.pushName } }
      );

      await businessDB.logInteraction({
        phone: ctx.from,
        type: 'audio_received',
        content: '[VOICE_NOTE]',
        timestamp: new Date()
      });

      const userAnalytics = await businessDB.getUserAnalytics(ctx.from);
      const isReturningCustomer = userAnalytics?.totalOrders > 0;
      let response: string;

      if (isReturningCustomer) {
        response = `🎤 ¡${session?.name || 'Amigo'}! Escuché tu audio. Como ya conoces nuestros productos, ¿qué necesitas esta vez?`;
      } else {
        const responses = [
          "🎤 ¡Escuché tu audio! ¿Te interesa música, películas o videos para tu USB?",
          "🔊 ¡Perfecto! Recibí tu voz. ¿Qué tipo de contenido buscas para tu USB personalizada?",
          "🎵 ¡Genial tu audio! ¿Prefieres música, videos o películas?"
        ];
        response = responses[Math.floor(Math.random() * responses.length)];
      }

      await flowDynamic([response]);

      const cross = await buildCrossSellSnippet(ctx.from, session as any);
      const options = [
        "💰 Precios desde $59.900",
        cross,
        "",
        "Puedes decir:",
        "🎵 'música' - USB musicales",
        "🎬 'películas' - USB de películas",
        "🎥 'videos' - USB de videos",
        "💰 'precios' - Ver opciones",
        "👨‍💼 'asesor' - Hablar con humano"
      ];

      await flowDynamic([options.join('\n')]);
    } catch (error) {
      console.error('❌ Error procesando audio:', error);
      await flowDynamic([
        "🎤 Recibí tu audio, pero hubo un problema.",
        "¿Podrías escribirme qué necesitas? Te ayudo con USBs personalizadas 😊"
      ]);
    }
  });

const mediaFlow = addKeyword<Provider, Database>(EVENTS.DOCUMENT)
  .addAction(async (ctx: any, { flowDynamic, endFlow }) => {
    try {
      if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();

      console.log(`📎 Documento/Media recibido de ${ctx.from}`);

      const session = await getUserSession(ctx.from);
      await updateUserSession(ctx.from, '[DOCUMENT/MEDIA]', 'media_received', null, false, { metadata: session });

      await businessDB.logInteraction({
        phone: ctx.from,
        type: 'document_received',
        content: '[DOCUMENT/MEDIA]',
        timestamp: new Date()
      });

      const cross = await buildCrossSellSnippet(ctx.from, session as any);
      await flowDynamic([
        "📎 Vi que me enviaste un archivo.",
        "🎵 ¿Personalizamos una USB con contenido similar?",
        cross,
        "",
        "💰 Precios desde $59.900",
        "Dime: ¿música, videos o películas?"
      ].join('\n'));
    } catch (error) {
      console.error('❌ Error procesando documento:', error);
      await flowDynamic([
        "📎 Recibí tu archivo, pero hubo un problema.",
        "¿Podrías decirme qué tipo de USB necesitas? 😊"
      ]);
    }
  });

const intelligentMainFlow = addKeyword<Provider, Database>([EVENTS.WELCOME])
  .addAction(async (ctx: any, { gotoFlow, flowDynamic, endFlow }) => {
    try {
      if (!shouldProcessMessage(ctx.from, ctx.body || '')) return endFlow();
      if (!ctx.body || ctx.body.trim().length === 0) return endFlow();
      if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();

      const lowerBody = ctx.body.toLowerCase();
      if (lowerBody.includes('telegram') || lowerBody.includes('notificación de')) return endFlow();

      // ✅ MESSAGE DEDUPLICATION: Check if this message was already processed
      // Extract message ID from Baileys context (ctx.key.id) or generate deterministic hash
      // Using crypto hash ensures the same message content always generates the same ID
      let messageId: string;
      if (ctx.key?.id) {
        messageId = ctx.key.id;
      } else if (ctx.messageId) {
        messageId = ctx.messageId;
      } else {
        // Fallback: Generate deterministic hash of (phone + body) for consistent deduplication
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256')
          .update(`${ctx.from}:${ctx.body}`)
          .digest('hex')
          .substring(0, 40);
        messageId = `fallback_${hash}`;
      }
      const remoteJid = ctx.from;
      
      try {
        const deduper = getMessageDeduper();
        const isDuplicate = await deduper.isProcessed(messageId, remoteJid);
        
        if (isDuplicate) {
          unifiedLogger.info('dedup_skipped', 'Duplicate message skipped', {
            messageId: messageId.substring(0, 20),
            remoteJid: remoteJid.substring(0, 15),
            bodyPreview: ctx.body.substring(0, 30)
          });
          return endFlow(); // Skip processing - already handled
        }
        
        // Mark as processed immediately to prevent race conditions
        await deduper.markAsProcessed(messageId, remoteJid);
      } catch (dedupError) {
        // If deduplication fails, log but continue processing to avoid blocking messages
        unifiedLogger.error('deduplication', 'Deduplication check failed, continuing anyway', { 
          error: dedupError,
          messageId: messageId.substring(0, 20)
        });
      }

      console.log(`🎯 Mensaje recibido de ${ctx.from}: ${ctx.body}`);

      // ✅ IMPROVED: Log user message to conversation memory for context tracking
      try {
        await conversationMemory.addTurn(ctx.from, 'user', ctx.body);
        console.log(`📝 User message logged to conversation memory`);
      } catch (memError) {
        console.error('⚠️ Error logging to conversation memory:', memError);
        // Continue anyway - don't block on memory logging
      }

      let session: ExtendedUserSession;
      try {
        const userSession = await getUserSession(ctx.from);
        if (!userSession) return gotoFlow(mainFlow);

        session = {
          phone: userSession.phone,
          phoneNumber: userSession.phoneNumber,
          name: userSession.name,
          stage: userSession.stage,
          currentFlow: userSession.currentFlow,
          buyingIntent: userSession.buyingIntent,
          lastInteraction: userSession.lastInteraction,
          lastFollowUp: userSession.lastFollowUp,
          followUpCount: userSession.followUpSpamCount,
          isProcessing: userSession.isProcessing,
          interests: userSession.interests,
          interactions: userSession.interactions,
          conversationData: userSession.conversationData ?? {},
          followUpSpamCount: userSession.followUpSpamCount ?? 0,
          tags: userSession.tags,
          // New follow-up fields
          contactStatus: userSession.contactStatus,
          lastUserReplyAt: userSession.lastUserReplyAt,
          lastUserReplyCategory: userSession.lastUserReplyCategory,
          followUpCount24h: userSession.followUpCount24h,
          lastFollowUpResetAt: userSession.lastFollowUpResetAt
        };
        
        // ✅ NEW: Process incoming message and classify response
        const { processIncomingMessage } = await import('./services/incomingMessageHandler');
        const classificationResult = await processIncomingMessage(ctx.from, ctx.body, userSession);
        
        // ✅ NEW: Update user interests based on message
        const { updateUserInterests } = await import('./services/userIntentionAnalyzer');
        const { markLastFollowUpAsResponded } = await import('./services/messageHistoryAnalyzer');
        
        updateUserInterests(userSession, ctx.body, 'user_message');
        
        // Mark last follow-up as responded if user is replying to one
        if (userSession.lastFollowUp) {
          const hoursSinceLastFollowUp = (Date.now() - new Date(userSession.lastFollowUp).getTime()) / (60 * 60 * 1000);
          if (hoursSinceLastFollowUp < 48) { // Within 48 hours of last follow-up
            markLastFollowUpAsResponded(userSession);
            console.log(`✅ User ${ctx.from} responded to follow-up (${hoursSinceLastFollowUp.toFixed(1)}h after)`);
          }
        }
        
        if (classificationResult.statusChanged) {
          console.log(`📝 User status changed to: ${classificationResult.newStatus}`);
          
          // If user opted out, send confirmation and end
          if (classificationResult.newStatus === 'OPT_OUT') {
            const optOutResponse = '✅ Entendido. No te enviaremos más mensajes.\nSi cambias de opinión, escríbenos cuando quieras. ¡Estaremos aquí!';
            await flowDynamic([optOutResponse]);
            
            // Log bot response to conversation memory
            await conversationMemory.addTurn(ctx.from, 'assistant', optOutResponse, {
              flowState: 'opt_out'
            });
            
            return endFlow();
          }
          
          // If user indicated completion, send acknowledgment
          if (classificationResult.newStatus === 'CLOSED') {
            const closedResponse = '🎉 ¡Perfecto! Nos alegra saber que ya lo tienes resuelto.\nSi necesitas algo más en el futuro, no dudes en contactarnos. ¡Gracias!';
            await flowDynamic([closedResponse]);
            
            // Log bot response to conversation memory
            await conversationMemory.addTurn(ctx.from, 'assistant', closedResponse, {
              flowState: 'closed'
            });
            
            return endFlow();
          }
        }
        
      } catch (sessionError) {
        console.error('❌ Error obteniendo sesión:', sessionError);
        return gotoFlow(mainFlow);
      }

      // IMPROVED: Check if already processing, but allow if stuck
      if (session.isProcessing && !isStuckInProcessing(ctx.from)) {
        unifiedLogger.debug('already_processing', `Skipping - already processing: ${ctx.from}`);
        return endFlow();
      }

      // Set processing state with timeout protection
      session.isProcessing = true;
      setProcessingState(ctx.from);
      await updateUserSession(ctx.from, ctx.body, 'processing', null, true, { metadata: session });

      try {
        // Sync flow coordinator with user session
        await flowCoordinator.syncWithUserSession(ctx.from);
        
        // ✅ EXPANDED: More stages where we should NOT interrupt with promotional messages
        const lockedStages = new Set([
          'customizing', 'pricing', 'closing', 'order_confirmed', 'orderFlow',
          'awaiting_capacity', 'collecting_data', 'collecting_name', 
          'collecting_address', 'collecting_payment', 'payment_confirmed',
          'data_auto_detected', 'checkout_started'
        ]);
        if (session.stage && lockedStages.has(session.stage)) {
          // Check if in critical flow
          if (flowCoordinator.isInCriticalFlow(ctx.from)) {
            console.log(`🔒 User in critical flow (${session.stage}), maintaining context`);
          }
          
          session.isProcessing = false;
          clearProcessingState(ctx.from); // Clear processing state tracker
          await updateUserSession(ctx.from, ctx.body, session.currentFlow || 'orderFlow', null, false, { metadata: session });
          
          logMessageTelemetry({
            phone: ctx.from,
            message: ctx.body.substring(0, 100),
            timestamp: Date.now(),
            action: 'processed',
            reason: 'Critical stage - maintaining flow',
            stage: session.stage
          });
          
          return endFlow();
        }

        const lower = (ctx.body || '').toLowerCase();

        const isStatusIntent = /\b(estado|como va|cómo va|microsd|micro ?sd|tarjeta|memoria|pedido|orden|entrega|env[ií]o|retraso|demora|list[ao]|hecho|avance)\b/.test(lower);
        if (isStatusIntent) {
          await updateUserSession(ctx.from, ctx.body, 'orderFlow', 'status_query', false, {
            metadata: { source: 'status_priority', raw: ctx.body }
          });

          const statusResponse = '📦 Revisando tu pedido ahora mismo...\n¿Te gustaría agregar algo más?';
          await flowDynamic([statusResponse]);
          
          // Log bot response to conversation memory
          await conversationMemory.addTurn(ctx.from, 'assistant', statusResponse, {
            flowState: 'status_query'
          });
          
          return endFlow();
        }

        if (/\b(gracias).*(adios|adiós|bye|vay|chao)\b/.test(lower)) {
          const s = await getUserSession(ctx.from);
          s.stage = 'abandoned';

          if (canSendOnce(s, 'farewell', 720)) {
            // ANTI-BAN: Apply pacing checks and delays before sending farewell
            const pacingCheck = await checkAllPacingRules();
            if (pacingCheck.ok) {
              await randomDelay();
              await waitForFollowUpDelayFromTracking();
              const jid = ensureJID(ctx.from);
              await botInstance.sendMessage(jid, "Gracias por escribirnos. Si deseas retomar la USB, di 'RETOMAR'. ¡Aquí estaré!.", {});
            } else {
              console.log(`⏸️ Farewell message blocked: ${pacingCheck.reason}`);
            }
          }

          await updateUserSession(ctx.from, ctx.body, s.currentFlow || 'mainFlow', null, false, { metadata: s });
          return endFlow();
        }

        const isSimpleGreeting = /^(hola|buenos dias|buenas|buenas tardes|buenas noches|hello|hi)\b/i.test(lower);
        const lastMins = session?.lastInteraction ? (Date.now() - new Date(session.lastInteraction).getTime()) / 60000 : 999;

        if (isSimpleGreeting && lastMins < 60) {
          const greetingResponse = '👋 ¡Hola! Te leo. ¿Deseas continuar con tu pedido o resolver una duda puntual?';
          await flowDynamic([greetingResponse]);
          
          // Log bot response to conversation memory
          await conversationMemory.addTurn(ctx.from, 'assistant', greetingResponse, {
            flowState: 'greeting'
          });
          
          return endFlow();
        }

        // ✅ IMPROVED: Analyze conversation context before routing
        // This ensures responses are coherent with conversation history
        let conversationContext;
        try {
          conversationContext = await conversationAnalyzer.analyzeConversationContext(ctx.from, ctx.body);
          console.log(`🧠 Conversation Analysis:`, {
            intent: conversationContext.intent,
            action: conversationContext.suggestedAction,
            salesOpportunity: conversationContext.salesOpportunity,
            coherenceScore: conversationContext.coherenceScore,
            concerns: conversationContext.detectedConcerns
          });
          
          // If coherence score is high and we have a suggested response, use it
          if (conversationContext.coherenceScore >= 85 && 
              conversationContext.detectedConcerns.length === 0 &&
              conversationContext.suggestedResponse) {
            console.log(`✅ Using conversation analyzer suggested response (coherence: ${conversationContext.coherenceScore}%)`);
            
            // Apply recommended delay for natural feel
            if (conversationContext.recommendedDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, conversationContext.recommendedDelay));
            }
            
            await flowDynamic([conversationContext.suggestedResponse]);
            
            // Log bot response to conversation memory
            await conversationMemory.addTurn(ctx.from, 'assistant', conversationContext.suggestedResponse, {
              intent: conversationContext.intent,
              confidence: conversationContext.confidence
            });
            
            await updateUserSession(ctx.from, ctx.body, 'conversation_handled', null, false, { 
              metadata: { ...session, conversationContext } 
            });
            return endFlow();
          }
        } catch (contextError) {
          console.error('⚠️ Error analyzing conversation context:', contextError);
          // Continue with normal flow if context analysis fails
        }

        const router = IntelligentRouter.getInstance();
        const decision = await router.analyzeAndRoute(ctx.body, session as any);

        if (session.stage === 'customizing') {
          const capacityResponse = [
            `🎼 Listo. USB, sin relleno ni repetidas.`,
            `Elige capacidad:`,
            `1) 8GB • 1.400 canciones • $59.900`,
            `2) 32GB • 5.000 canciones • $89.900`,
            `3) 64GB • 10.000 canciones • $129.900`,
            `4) 128GB • 25.000 canciones • $169.900`,
            `Responde 1-4 para continuar.`
          ].join('\n');
          
          await flowDynamic([capacityResponse]);
          
          // Log bot response to conversation memory
          await conversationMemory.addTurn(ctx.from, 'assistant', capacityResponse, {
            flowState: 'capacity_selection'
          });

          await updateUserSession(ctx.from, ctx.body, 'orderFlow', 'capacity_selection', false, { metadata: session });
          return endFlow();
        }

        console.log(`🧠 Decisión del router: ${decision.action} (${decision.confidence}%) - ${decision.reason}`);

        // ✅ ALWAYS preserve router context, even if not intercepting
        // This ensures follow-up messages can use the analyzed intent
        if (!decision.shouldIntercept) {
          session.isProcessing = false;
          clearProcessingState(ctx.from); // Clear processing state tracker
          
          // Store router decision for future follow-ups
          await updateUserSession(ctx.from, ctx.body, 'continue', 'continue_step', false, { 
            metadata: { 
              ...session, 
              lastRouterDecision: decision,  // Preserve routing analysis
              lastAnalyzedIntent: decision.action,
              lastAnalysisConfidence: decision.confidence,
              lastAnalysisTimestamp: new Date().toISOString()
            } 
          });
          
          logMessageTelemetry({
            phone: ctx.from,
            message: ctx.body.substring(0, 100),
            timestamp: Date.now(),
            action: 'processed',
            reason: 'Router - no intercept',
            stage: session.stage
          });
          
          return endFlow();
        }

        session.isProcessing = false;
        clearProcessingState(ctx.from); // Clear processing state tracker
        session.currentFlow = decision.action;
        await updateUserSession(ctx.from, ctx.body, decision.action, null, false, { metadata: { ...session, decision } });
        
        logMessageTelemetry({
          phone: ctx.from,
          message: ctx.body.substring(0, 100),
          timestamp: Date.now(),
          action: 'processed',
          reason: `Router - ${decision.action}`,
          stage: session.stage
        });

        switch (decision.action) {
          // case 'welcome': return gotoFlow(mainFlow);
          // // case 'catalog': return gotoFlow(catalogFlow);
          // case 'customize': return gotoFlow(customizationFlow);
          // case 'order': return gotoFlow(orderFlow);
          // case 'music': return gotoFlow(musicUsb);
          // case 'videos': return gotoFlow(videosUsb);
          // case 'movies': return gotoFlow(moviesUsb);
          case 'advisor': return gotoFlow(flowAsesor);
          case 'pricing':
            await flowDynamic([getPriceBlock()]);
            return endFlow();
          case 'ai_response':
            if (aiService?.isAvailable()) return gotoFlow(aiCatchAllFlow);
            return gotoFlow(mainFlow);
          default:
            return gotoFlow(mainFlow);
        }
      } catch (routerError) {
        console.error('❌ Error en router:', routerError);
        session.isProcessing = false;
        clearProcessingState(ctx.from); // Clear processing state tracker
        session.currentFlow = 'error';

        await updateUserSession(ctx.from, 'ERROR', 'error', 'error_step', false, {
          metadata: { ...session, errorTimestamp: new Date().toISOString() }
        });
        
        logMessageTelemetry({
          phone: ctx.from,
          message: ctx.body.substring(0, 100),
          timestamp: Date.now(),
          action: 'error',
          reason: 'Router error',
          stage: session.stage
        });

        return gotoFlow(mainFlow);
      }
    } catch (error) {
      console.error('❌ Error crítico en flujo principal:', error);

      try {
        const s = await getUserSession(ctx.from);
        if (s) {
          s.isProcessing = false;
          clearProcessingState(ctx.from); // Clear processing state tracker
          s.currentFlow = 'critical_error';

          await updateUserSession(ctx.from, 'CRITICAL_ERROR', 'critical_error', 'critical_step', false, {
            metadata: { ...s, isCritical: true, lastError: new Date().toISOString() }
          });
          
          logMessageTelemetry({
            phone: ctx.from,
            message: ctx.body ? ctx.body.substring(0, 100) : '',
            timestamp: Date.now(),
            action: 'error',
            reason: 'Critical error in main flow',
            stage: s.stage
          });
        }
        
        // CRITICAL FIX: Send emergency response to user even on critical error
        // This ensures the chatbot NEVER leaves a user without a response
        try {
          const emergencyMessage = '😊 Estoy aquí para ayudarte.\n\n¿En qué puedo asistirte?\n\n🎵 USBs de Música\n🎬 USBs de Películas\n🎥 USBs de Videos\n\nEscribe tu interés o consulta 💙';
          await flowDynamic([emergencyMessage]);
          
          console.log(`🆘 Mensaje de emergencia enviado a ${ctx.from} después de error crítico`);
          
          // Try to log to conversation memory
          try {
            await conversationMemory.addTurn(ctx.from, 'assistant', emergencyMessage, {
              flowState: 'critical_error_recovery'
            });
          } catch (memErr) {
            console.warn('⚠️ No se pudo registrar mensaje de emergencia en memoria');
          }
        } catch (emergencyError) {
          console.error('❌ Fallo enviando mensaje de emergencia:', emergencyError);
          // Last resort: try going to main flow which has its own error handling
        }
      } catch (cleanupError) {
        console.error('❌ Error en limpieza de emergencia:', cleanupError);
      }

      return gotoFlow(mainFlow);
    }
  });

// ==========================================
// === FUNCIÓN PRINCIPAL ===
// ==========================================

const main = async () => {
  try {
    console.log('🚀 Iniciando TechAura Intelligent Bot...');
    await initializeApp();

    const adapterFlow = createFlow([
      intelligentMainFlow,
      mainFlow, customizationFlow, orderFlow,
      musicUsb, videosUsb, moviesUsb, gamesUsb, menuTech, customUsb, capacityMusic, capacityVideo,
      aiAdminFlow, aiCatchAllFlow,
      mediaFlow, voiceNoteFlow,
      testCapture, trackingDashboard,
      contentSelectionFlow, promosUsbFlow, datosCliente,
      flowAsesor, flowHeadPhones, flowTechnology, flowUsb, menuFlow, pageOrCatalog, 
      iluminacionFlow, herramientasFlow, energiaFlow, audioFlow,
      comboUsb, promoUSBSoporte, prices
    ]);

    // Log registered flows
    unifiedLogger.info('system', 'Flows registered successfully', {
      flows: [
        'intelligentMainFlow', 'mainFlow', 'customizationFlow', 'orderFlow',
        'musicUsb', 'videosUsb', 'moviesUsb', 'gamesUsb', 'menuTech', 'customUsb', 'capacityMusic', 'capacityVideo',
        'aiAdminFlow', 'aiCatchAllFlow', 'mediaFlow', 'voiceNoteFlow',
        'testCapture', 'trackingDashboard', 'contentSelectionFlow', 'promosUsbFlow', 'datosCliente',
        'flowAsesor', 'flowHeadPhones', 'flowTechnology', 'flowUsb', 'menuFlow', 'pageOrCatalog',
        'iluminacionFlow', 'herramientasFlow', 'energiaFlow', 'audioFlow',
        'comboUsb', 'promoUSBSoporte', 'prices'
      ],
      totalFlows: 34
    });

    const adapterProvider = createProvider(Provider, {
      browser: ["TechAura-Intelligent-Bot", "Chrome", "114.0.5735.198"],
      version: [2, 3800, 1023223821],
      writeIntervalSeconds: 2, // Espera entre escrituras (nativo de BuilderBot/Baileys)
      minTrigger: 200, // Retraso mínimo de reacción
    });

    const { handleCtx, httpServer } = await createBot({
      flow: adapterFlow,
      provider: adapterProvider as any,
      database: adapterDB,
    });

    botInstance = {
      sendMessage: async (phone: string, message: string, options: Record<string, unknown>) => {
        try {
          // FIXED: Ensure phone number has proper JID format for Baileys to prevent "Cannot read properties of undefined (reading 'id')" errors
          const jid = ensureJID(phone);
          
          const result = await adapterProvider.sendMessage(
            jid,
            typeof message === 'string' ? message : JSON.stringify(message),
            options || {}
          );

          // CRITICAL FIX: Validate Baileys response to catch USync parsing errors
          // Baileys may return undefined when parseUSyncQueryResult fails due to attrs being undefined
          if (result === undefined || result === null) {
            const errorMsg = `Baileys returned undefined/null response for ${phone} - possible USync/attrs error`;
            console.error(`❌ ${errorMsg}`, {
              phone,
              jid,
              resultType: typeof result,
              suggestion: 'Phone may not be a valid WhatsApp account or Baileys USync failed'
            });
            // Don't throw - return gracefully to prevent crashes
            return null;
          }

          await businessDB.logMessage({
            phone,
            message: typeof message === 'string' ? message : JSON.stringify(message),
            type: 'outgoing',
            automated: true,
            timestamp: new Date()
          });
          markGlobalSent();
          return result;
        } catch (error) {
          // Enhanced error handling for Baileys-specific errors
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Check for specific Baileys/USync errors
          if (errorMessage.includes('attrs') || errorMessage.includes('parseUSyncQueryResult') || errorMessage.includes('getUSyncDevices')) {
            console.error(`❌ Baileys USync error for ${phone}:`, {
              error: errorMessage,
              errorType: 'USync parsing failure',
              suggestion: 'Phone may not exist or Baileys encountered incomplete response'
            });
            // Return null instead of throwing to allow graceful degradation
            return null;
          }
          
          console.error(`❌ Error enviando mensaje a ${phone}:`, error);
          // Return null instead of throwing to prevent follow-up system crashes
          return null;
        }
      },
      sendMessageWithMedia: async (phone: string, payload: { body: string; mediaUrl: string; caption?: string }, options: Record<string, unknown>) => {
        try {
          // FIXED: Ensure phone number has proper JID format for Baileys
          const jid = ensureJID(phone);
          
          if (typeof (adapterProvider as any).sendMessageWithMedia === 'function') {
            const result = await (adapterProvider as any).sendMessageWithMedia(jid, payload, options || {});

            // CRITICAL FIX: Validate Baileys response to catch USync parsing errors
            if (result === undefined || result === null) {
              console.error(`❌ Baileys returned undefined/null response for media to ${phone}`, {
                phone,
                jid,
                resultType: typeof result
              });
              return null;
            }

            await businessDB.logMessage({
              phone,
              message: `${payload.body}\n[media: ${payload.mediaUrl}]`,
              type: 'outgoing',
              automated: true,
              timestamp: new Date()
            });
            markGlobalSent();
            return result;
          } else {
            return await botInstance.sendMessage(phone, payload.body, options);
          }
        } catch (error) {
          // Enhanced error handling for Baileys-specific errors
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          if (errorMessage.includes('attrs') || errorMessage.includes('parseUSyncQueryResult') || errorMessage.includes('getUSyncDevices')) {
            console.error(`❌ Baileys USync error sending media to ${phone}:`, {
              error: errorMessage,
              errorType: 'USync parsing failure'
            });
            return null;
          }
          
          console.error(`❌ Error enviando media a ${phone}:`, error);
          return null;
        }
      }
    };

    setBotInstance(botInstance);

    // ==========================================
    // === ORDER EVENT LISTENERS ===
    // ==========================================
    
    // Listen for ORDER_CONFIRMED event to create processing jobs
    // Use EventEmitter pattern instead of monkey-patching
    const { notificadorService } = await import('./services/NotificadorService');
    
    const handleOrderConfirmed = async (context: any) => {
      try {
        unifiedLogger.info('processing-jobs', 'ORDER_CONFIRMED event received', { 
          orderId: context.orderId 
        });
        
        const orderData = context.orderData;
        if (!orderData) {
          unifiedLogger.error('processing-jobs', 'No order data in ORDER_CONFIRMED event', { context });
          return;
        }
        
        // Extract preferences from orderData - could be in customization or preferences field
        const preferences = orderData.customization || orderData.preferences || {};
        
        // Create processing job with status PENDING
        const jobId = await processingJobService.createJob({
          order_id: context.orderId,
          usb_capacity: orderData.capacity || '32GB',
          preferences: Array.isArray(preferences) ? preferences : [preferences],
          status: 'pending',
          progress: 0
        });
        
        unifiedLogger.info('processing-jobs', 'Processing job created', { 
          jobId, 
          orderId: context.orderId 
        });
        
        console.log(`✅ Processing job ${jobId} created for order ${context.orderId}`);
      } catch (error) {
        unifiedLogger.error('processing-jobs', 'Error creating processing job', error);
        console.error('❌ Error creating processing job:', error);
        // Don't throw - job creation failures shouldn't break the order confirmation
      }
    };
    
    // Listen to the notificadorService events if it's an EventEmitter
    // Otherwise, we wrap the handler (safer than monkey-patching)
    if (typeof notificadorService.on === 'function') {
      notificadorService.on('order_event', async (context: any) => {
        if (context.event === OrderNotificationEvent.ORDER_CONFIRMED) {
          await handleOrderConfirmed(context);
        }
      });
    } else {
      // Fallback: Extend the handleOrderEvent method safely
      const originalHandler = notificadorService.handleOrderEvent.bind(notificadorService);
      notificadorService.handleOrderEvent = async function(context: any) {
        // Call original handler first
        const result = await originalHandler(context);
        
        // Then handle ORDER_CONFIRMED for processing jobs
        if (context.event === OrderNotificationEvent.ORDER_CONFIRMED) {
          await handleOrderConfirmed(context);
        }
        
        return result;
      };
    }
    
    console.log('✅ Order event listeners registered');

    // ==========================================
    // === SCHEDULED TASKS (CRON JOBS) ===
    // ==========================================
    
    // Weekly sweep for "no leido" WhatsApp labels - runs every Sunday at 10:00 AM
    cron.schedule('0 10 * * 0', async () => {
      console.log('⏰ Cron: Starting weekly sweep for unread WhatsApp chats...');
      try {
        const processed = await processUnreadWhatsAppChats();
        console.log(`✅ Cron: Weekly sweep completed - processed ${processed} unread chat(s)`);
      } catch (error) {
        console.error('❌ Cron: Error in weekly unread sweep:', error);
      }
    }, {
      scheduled: true,
      timezone: "America/Bogota"
    });
    
    console.log('✅ Cron job scheduled: Weekly unread WhatsApp sweep (Sundays at 10:00 AM)');
    
    // Run initial sweep on startup (if it's been more than 6 days since last run)
    setTimeout(async () => {
      console.log('🔍 Running initial check for unread WhatsApp chats...');
      try {
        const processed = await processUnreadWhatsAppChats();
        if (processed > 0) {
          console.log(`✅ Initial sweep: Processed ${processed} unread chat(s)`);
        }
      } catch (error) {
        console.error('❌ Error in initial unread sweep:', error);
      }
    }, 30000); // Run after 30 seconds to allow bot to fully initialize

    // ==========================================
    // === STATIC FILE SERVING ===
    // ==========================================
    
    // Configure static files and middleware
    // Note: Although Builderbot uses Polka internally, it's compatible with Express middleware
    const publicPath = path.join(__dirname, '../public');
    adapterProvider.server.use(express.static(publicPath));
    
    // Configure body parsers (Express middleware, compatible with Polka)
    adapterProvider.server.use(express.json());
    adapterProvider.server.use(express.urlencoded({ extended: true }));
    
    // Register validation and persistence routes
    const { registerValidationRoutes } = await import('./routes/validationRoutes');
    registerValidationRoutes(adapterProvider.server);
    console.log('✅ Validation and persistence routes registered');
    
    // Register notification routes
    const { registerNotificationRoutes } = await import('./routes/notificationRoutes');
    registerNotificationRoutes(adapterProvider.server);
    console.log('✅ Notification routes registered');
    
    // Register admin routes
    const { registerAdminRoutes } = await import('./routes/adminRoutes');
    registerAdminRoutes(adapterProvider.server);
    console.log('✅ Admin routes registered');
    
    unifiedLogger.info('system', 'Static files configured', { path: publicPath });
    console.log(`✅ Static files configured: ${publicPath}`);

    // ==========================================
    // === SOCKET.IO INITIALIZATION ===
    // ==========================================
    
    let io: SocketIOServer | null = null;
    let isWhatsAppConnected = false;
    let latestQR: string | null = null; // Store latest QR code
    
    try {
      // Note: adapterProvider.server is a Polka instance (Builderbot's internal server)
      // Polka is lightweight and Express-compatible for middleware, but uses native Node.js response objects for routes
      const providerServer = (adapterProvider as any).server;
      if (providerServer && providerServer.listen) {
        // Socket.io will be initialized on the underlying http.Server after httpServer() is called
        console.log('✅ Socket.io will be initialized with HTTP server');
      }
    } catch (error) {
      console.error('⚠️ Error preparando Socket.io:', error);
    }

    // Listen to provider events for WhatsApp authentication
    (adapterProvider as any).on('qr', (qr: string) => {
      console.log('📱 QR Code generado para autenticación');
      isWhatsAppConnected = false;
      latestQR = qr; // Store the latest QR code
      if (io) {
        io.emit('qr', qr);
        console.log('📡 QR Code enviado a clientes conectados');
      }
    });

    (adapterProvider as any).on('ready', () => {
      console.log('✅ WhatsApp conectado y listo');
      isWhatsAppConnected = true;
      latestQR = null; // Clear QR code when connected
      if (io) {
        io.emit('ready', { message: 'WhatsApp conectado exitosamente', status: 'connected' });
        io.emit('auth_success', { connected: true });
        io.emit('connection_update', { status: 'ready', connected: true });
      }
    });

    (adapterProvider as any).on('auth_failure', (error: any) => {
      console.error('❌ Error de autenticación WhatsApp:', error);
      isWhatsAppConnected = false;
      if (io) {
        io.emit('auth_failure', { error: error?.message || 'Authentication failed' });
      }
    });

    (adapterProvider as any).on('close', () => {
      console.log('⚠️ Conexión WhatsApp cerrada');
      isWhatsAppConnected = false;
      if (io) {
        io.emit('connection_update', { status: 'disconnected', connected: false });
      }
    });

    setTimeout(() => {
      try {
        followUpSystemHandle = activeFollowUpSystem();
        console.log('✅ Sistema de seguimiento automático iniciado');
      } catch (error) {
        console.error('❌ Error iniciando sistema de seguimiento:', error);
      }
    }, 6000);

    // ==========================================
    // === AUTHENTICATION ROUTES ===
    // ==========================================
    
    // Serve WhatsApp authentication page
    adapterProvider.server.get('/auth', (req: any, res: any) => {
      res.sendFile(path.join(__dirname, '../public/auth/index.html'));
    });
    
    // API endpoint to check WhatsApp connection status
    adapterProvider.server.get('/api/auth/status', (req: any, res: any) => {
      // Check if provider has a method to verify connection
      let connected = isWhatsAppConnected;
      
      // Try to get status from provider if available
      try {
        const providerStatus = (adapterProvider as any).store?.state?.connection;
        if (providerStatus === 'open') {
          connected = true;
          isWhatsAppConnected = true;
        }
      } catch (error) {
        // Ignore error, use cached status
      }
      
      sendJson(res, 200, {
        success: true,
        connected: connected,
        message: connected ? 'Conectado a WhatsApp' : 'Escanea el código QR para conectar'
      });
    });

    // ==========================================
    // === ENDPOINTS API ===
    // ==========================================

    adapterProvider.server.get('/v1/followup/queue', handleCtx(async (bot, req, res) => {
      try {
        const stats = followUpQueueManager.getStats();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            ...stats,
            globalLimits: {
              hourly: {
                current: RATE_GLOBAL.hourCount,
                max: RATE_GLOBAL.perHourMax,
                percent: Math.round((RATE_GLOBAL.hourCount / RATE_GLOBAL.perHourMax) * 100)
              },
              daily: {
                current: RATE_GLOBAL.dayCount,
                max: RATE_GLOBAL.perDayMax,
                percent: Math.round((RATE_GLOBAL.dayCount / RATE_GLOBAL.perDayMax) * 100)
              }
            },
            health: stats.utilizationPercent < 80 ? 'healthy' : stats.utilizationPercent < 95 ? 'warning' : 'critical'
          },
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats' }));
      }
    }));

    adapterProvider.server.get('/v1/followup/stats', handleCtx(async (bot, req, res) => {
      try {
        const stats = followUpQueueManager.getStats();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo stats de seguimiento:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats' }));
      }
    }));
    
    // NEW: Message telemetry endpoint for diagnostics
    adapterProvider.server.get('/v1/messages/telemetry', handleCtx(async (bot, req, res) => {
      try {
        const stats = getMessageTelemetryStats();
        const processingStats = {
          active: processingStates.size,
          stuck: Array.from(processingStates.values()).filter(s => 
            Date.now() - s.startedAt > PROCESSING_TIMEOUT_MS
          ).length,
          details: Array.from(processingStates.entries()).map(([phone, state]) => ({
            phone: phone.slice(-4), // Last 4 digits for privacy
            elapsedMs: Date.now() - state.startedAt,
            isStuck: Date.now() - state.startedAt > PROCESSING_TIMEOUT_MS
          }))
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            messageStats: stats,
            processingStates: processingStats,
            recentMessages: messageTelemetry.slice(-20).map(t => ({
              phone: t.phone.slice(-4), // Last 4 digits for privacy
              action: t.action,
              reason: t.reason,
              stage: t.stage,
              timestamp: new Date(t.timestamp).toISOString(),
              processingTimeMs: t.processingTimeMs
            }))
          },
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo telemetría de mensajes:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo telemetría' }));
      }
    }));

    // NEW: Deduplication metrics endpoint
    adapterProvider.server.get('/v1/messages/dedup/metrics', handleCtx(async (bot, req, res) => {
      try {
        const deduper = getMessageDeduper();
        const metrics = deduper.getMetrics();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            ...metrics,
            duplicateRate: metrics.totalChecked > 0 
              ? ((metrics.duplicatesFound / metrics.totalChecked) * 100).toFixed(2) + '%'
              : '0%',
            description: 'Message deduplication prevents duplicate orders under reconnection'
          },
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo métricas de deduplicación:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo métricas' }));
      }
    }));

    adapterProvider.server.get('/v1/usb/devices', handleCtx(async (bot, req, res) => {
      try {
        const WriterMod = await import('./core/USBWriter');
        const writer = new (WriterMod.default as any)();
        await writer.detectAvailableDevices();
        const devices = (writer as any).availableDevices || [];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, devices }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }));

    adapterProvider.server.get('/v1/production-jobs', handleCtx(async (bot, req, res) => {
      try {
        const status = (req.query?.status as string) || undefined;
        const listFn = (businessDB as any).listProcessingJobs || (businessDB as any).getPendingProcessingJobs;
        const jobs = listFn ? await listFn({ statuses: status ? [status] : undefined, limit: 200 }) : [];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, jobs }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }));

    adapterProvider.server.post('/v1/usb/start', handleCtx(async (bot, req, res) => {
      try {
        let body = '';
        req.on('data', c => body += c);
        await new Promise(r => req.on('end', r));

        const { jobId } = JSON.parse(body || '{}');

        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'jobId requerido' }));
        }

        const getById = (businessDB as any).getProcessingJobById || (businessDB as any).findProcessingJob;
        const job = getById ? await getById(Number(jobId)) : null;

        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Job no encontrado' }));
        }

        const { ProcessingSystem } = await import('./core/ProcessingSystem');
        const ps = new ProcessingSystem();
        ps.run({ job }).catch(() => { });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, started: true }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }));

    adapterProvider.server.post('/v1/usb/retry', handleCtx(async (bot, req, res) => {
      try {
        let body = '';
        req.on('data', c => body += c);
        await new Promise(r => req.on('end', r));

        const { jobId } = JSON.parse(body || '{}');

        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'jobId requerido' }));
        }

        const updater = (businessDB as any).updateProcessingJobV2 || (businessDB as any).updateProcessingJob;
        await updater({ id: Number(jobId), status: 'retry', fail_reason: null });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }));

    adapterProvider.server.post('/v1/usb/cancel', handleCtx(async (bot, req, res) => {
      try {
        let body = '';
        req.on('data', c => body += c);
        await new Promise(r => req.on('end', r));

        const { jobId } = JSON.parse(body || '{}');

        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'jobId requerido' }));
        }

        const updater = (businessDB as any).updateProcessingJobV2 || (businessDB as any).updateProcessingJob;
        await updater({ id: Number(jobId), status: 'canceled' });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }));

    adapterProvider.server.get('/v1/analytics', handleCtx(async (bot, req, res) => {
      try {
        const stats = await businessDB.getGeneralAnalytics();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo analytics:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo analytics' }));
      }
    }));

    adapterProvider.server.get('/v1/user/:phone', handleCtx(async (bot, req, res) => {
      try {
        const phone = req.params?.phone;

        if (!phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Número de teléfono requerido' }));
          return;
        }

        const user = await businessDB.getUserSession(phone);
        const analytics = await businessDB.getUserAnalytics(phone);
        const orders = await businessDB.getUserOrders(phone);

        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: { user, analytics, orders, timestamp: new Date().toISOString() }
          }, null, 2));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Usuario no encontrado' }));
        }
      } catch (error) {
        console.error('❌ Error obteniendo usuario:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error interno del servidor' }));
      }
    }));

    adapterProvider.server.get('/v1/ai/stats', handleCtx(async (bot, req, res) => {
      try {
        const aiStats = {
          isAvailable: aiService.isAvailable(),
          provider: 'gemini',
          status: aiService.isAvailable() ? 'active' : 'inactive',
          monitoring: AIMonitoring.getStats(),
          intelligentRouter: {
            active: true,
            version: '2.0',
            features: ['Context Analysis', 'Intent Detection', 'Automatic Routing', 'Persuasion Elements', 'Smart Recommendations']
          },
          timestamp: new Date().toISOString()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: aiStats }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo stats de IA:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats de IA' }));
      }
    }));

    adapterProvider.server.get('/v1/sales/stats', handleCtx(async (bot, req, res) => {
      try {
        const salesStats = await businessDB.getSalesAnalytics();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: salesStats,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo estadísticas de ventas:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo estadísticas de ventas' }));
      }
    }));

    adapterProvider.server.get('/v1/dashboard', handleCtx(async (bot, req, res) => {
      try {
        const dashboard = await businessDB.getDashboardData();
        const intelligentData = {
          ...dashboard,
          intelligentSystem: {
            routerDecisions: await businessDB.getRouterStats(),
            conversionRates: await businessDB.getConversionStats(),
            userJourney: await businessDB.getUserJourneyStats(),
            aiInteractions: AIMonitoring.getStats()
          },
          followUpSystem: followUpQueueManager.getStats()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: intelligentData,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo dashboard:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo dashboard' }));
      }
    }));

    adapterProvider.server.get('/v1/conversations/analysis', handleCtx(async (bot, req, res) => {
      try {
        const analysis = await businessDB.getConversationAnalysis();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: analysis,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo análisis de conversaciones:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo análisis' }));
      }
    }));

    adapterProvider.server.get('/v1/recommendations/:phone', handleCtx(async (bot, req, res) => {
      try {
        const phone = req.params?.phone;

        if (!phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Número de teléfono requerido' }));
          return;
        }

        const recommendations = getSmartRecommendations(phone, userSessions);
        const userAnalytics = await getUserAnalytics(phone);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: { recommendations, analytics: userAnalytics, timestamp: new Date().toISOString() }
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo recomendaciones:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo recomendaciones' }));
      }
    }));

    adapterProvider.server.get('/v1/router/stats', handleCtx(async (bot, req, res) => {
      try {
        const routerStats = await businessDB.getRouterStats();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            ...routerStats,
            systemInfo: {
              version: '2.0',
              features: ['Intent Detection', 'Context Analysis', 'Automatic Routing', 'Confidence Scoring', 'Persuasion Integration'],
              accuracy: routerStats.totalDecisions > 0 ?
                (routerStats.successfulRoutes / routerStats.totalDecisions * 100).toFixed(2) + '%' : 'N/A'
            }
          },
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo stats del router:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats del router' }));
      }
    }));

    adapterProvider.server.post('/v1/send-message', handleCtx(async (bot, req, res) => {
      try {
        // ANTI-BAN: Check all pacing rules
        const pacingCheck = await checkAllPacingRules();
        if (!pacingCheck.ok) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ 
            success: false, 
            error: 'pacing_blocked', 
            reason: pacingCheck.reason 
          }));
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { phone, message, urgent = false, channel } = JSON.parse(body || '{}');

            if (!phone || !message) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Phone y message son requeridos' }));
              return;
            }

            const messages = Array.isArray(message) ? message : [message];
            const urgency: 'high' | 'medium' | 'low' = urgent ? 'high' : 'medium';

            if (channel) {
              const ok = await triggerChannelReminder(phone, channel, urgency);
              res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: ok,
                message: ok ? 'Mensaje enviado correctamente' : 'No se pudo enviar (posible protección anti-spam)',
                timestamp: new Date().toISOString()
              }));
              return;
            }

            // ANTI-BAN: Apply human-like delays before sending
            await randomDelay();
            await waitForFollowUpDelayFromTracking();
            
            const grouped = messages.join('\n\n');
            // ANTI-BAN: Ensure JID formatting
            const jid = ensureJID(phone);
            await botInstance.sendMessage(jid, grouped, {});

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'Mensaje enviado correctamente',
              timestamp: new Date().toISOString()
            }));
          } catch (parseError) {
            console.error('❌ Error parseando request:', parseError);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'JSON inválido' }));
          }
        });
      } catch (error) {
        console.error('❌ Error enviando mensaje manual:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error interno del servidor' }));
      }
    }));

    adapterProvider.server.post('/v1/admin/migrate', async (req, res) => {
      try {
        console.log('🔧 Ejecutando migración manual de base de datos...');
        const { runManualMigration } = await import('./scripts/migrateDatabase');
        const result = await runManualMigration();

        if (result.success) {
          console.log('✅ Migración manual completada exitosamente');
          return sendJson(res, 200, {
            success: true,
            message: result.message,
            timestamp: new Date().toISOString()
          });
        } else {
          console.error('❌ Error en migración manual:', result.message);
          return sendJson(res, 500, {
            success: false,
            error: result.message,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error: any) {
        console.error('❌ Error ejecutando migración manual:', error);
        return sendJson(res, 500, {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    adapterProvider.server.get('/v1/admin/schema/status', async (req, res) => {
      try {
        console.log('🔍 Verificando estado del esquema de base de datos...');
        const { validateOrdersSchema } = await import('./utils/schemaValidator');
        const validation = await validateOrdersSchema();

        return sendJson(res, validation.valid ? 200 : 500, {
          success: validation.valid,
          validation,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('❌ Error verificando esquema:', error);
        return sendJson(res, 500, {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    adapterProvider.server.post('/v1/admin/schema/fix', async (req, res) => {
      try {
        console.log('🔧 Intentando corregir esquema de base de datos...');
        const { runPendingMigrations } = await import('./utils/schemaValidator');
        const result = await runPendingMigrations();

        return sendJson(res, result.success ? 200 : 500, {
          success: result.success,
          message: result.message,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('❌ Error corrigiendo esquema:', error);
        return sendJson(res, 500, {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    adapterProvider.server.post('/api/new-order', handleCtx(async (bot, req, res) => {
      try {
        const orderData = req.body;

        if (!orderData || !orderData.orderId) {
          return sendJson(res, 400, {
            success: false,
            message: 'Datos del pedido inválidos',
            errors: ['orderId es requerido']
          });
        }

        const fetch = await import('node-fetch').then(m => m.default);
        const response = await fetch('http://localhost:3009/api/new-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...orderData,
            metadata: { validated: true, timestamp: new Date().toISOString() }
          })
        });

        let responseData: any = null;
        try {
          responseData = await response.json();
        } catch { }

        if (response.status === 200 || response.status === 201) {
          return sendJson(res, 200, {
            success: true,
            message: 'Pedido recibido y encolado',
            orderId: orderData.orderId,
            processorResponse: responseData || null
          });
        } else {
          const errMsg = responseData?.message || `Autoprocesador respondió con estado ${response.status}`;
          return sendJson(res, 502, {
            success: false,
            message: 'Error del autoprocesador',
            details: responseData || { status: response.status, message: errMsg }
          });
        }
      } catch (error) {
        console.error('❌ Error procesando pedido:', error);
        sendJson(res, 500, { success: false, error: 'Error interno del servidor' });
      }
    }));

    adapterProvider.server.get('/v1/health', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.getSystemHealth(req, res);
    }));

    // ==========================================
    // === ENHANCED API ENDPOINTS ===
    // ==========================================

    // Enhanced Dashboard - No auth required, works independently of WhatsApp session
    adapterProvider.server.get('/v1/enhanced/dashboard', async (req: any, res: any) => {
      try {
        return await ControlPanelAPI.getDashboard(req, res);
      } catch (error: any) {
        console.error('Error in enhanced dashboard:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message || 'Error loading dashboard',
          message: 'Dashboard is available independently of WhatsApp connection status'
        }));
      }
    });

    // Persuasion Engine Stats
    adapterProvider.server.get('/v1/persuasion/stats', handleCtx(async (bot, req, res) => {
      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            engine: 'active',
            features: [
              'Journey-based messaging',
              'Objection handling',
              'Message coherence validation',
              'Contextual CTAs',
              'Social proof integration'
            ]
          }
        }, null, 2));
      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    }));

    // Flow Coordinator Stats
    adapterProvider.server.get('/v1/flow/stats', handleCtx(async (bot, req, res) => {
      try {
        const stats = flowCoordinator.getStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    }));

    // Test Persuasive Message
    adapterProvider.server.post('/v1/test/persuasion', handleCtx(async (bot, req, res) => {
      try {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { message, phone } = JSON.parse(body || '{}');

            if (!message) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Message required' }));
              return;
            }

            const userSession = {
              phone: phone || 'test_user',
              name: 'Test User',
              stage: 'interest',
              currentFlow: 'test',
              buyingIntent: 65,
              lastInteraction: new Date(),
              interactions: []
            };

            const persuasiveMessage = await persuasionEngine.buildPersuasiveMessage(
              message,
              userSession as any
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              data: {
                originalMessage: message,
                persuasiveMessage,
                timestamp: new Date().toISOString()
              }
            }, null, 2));
          } catch (parseError: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: parseError.message }));
          }
        });
      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    }));

    // Conversation Memory Management
    adapterProvider.server.get('/v1/memory/:phone', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.getUserMemory(req, res);
    }));

    adapterProvider.server.delete('/v1/memory/:phone', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.clearUserMemory(req, res);
    }));

    // Intent Classification Testing
    adapterProvider.server.post('/v1/test/intent', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.testIntent(req, res);
    }));

    // AI Response Testing
    adapterProvider.server.post('/v1/test/ai-response', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.testAIResponse(req, res);
    }));

    // AI Performance Metrics
    adapterProvider.server.get('/v1/metrics/ai', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.getAIMetrics(req, res);
    }));

    // Processing Queue Management
    adapterProvider.server.get('/v1/processing/queue', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.getProcessingQueue(req, res);
    }));

    adapterProvider.server.get('/v1/processing/job/:jobId', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.getProcessingJob(req, res);
    }));

    adapterProvider.server.post('/v1/processing/job/:jobId/retry', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.retryProcessingJob(req, res);
    }));

    adapterProvider.server.post('/v1/processing/job/:jobId/cancel', handleCtx(async (bot, req, res) => {
      return ControlPanelAPI.cancelProcessingJob(req, res);
    }));

    // ==========================================
    // === LEGACY ENDPOINTS ===
    // ==========================================

    adapterProvider.server.get('/v1/health_legacy', handleCtx(async (bot, req, res) => {
      try {
        const queueStats = followUpQueueManager.getStats();

        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: await businessDB.checkConnection(),
            ai: aiService.isAvailable(),
            bot: !!botInstance,
            followUpSystem: true
          },
          followUpQueue: {
            size: queueStats.total,
            maxSize: queueStats.maxSize,
            utilization: queueStats.utilizationPercent,
            health: queueStats.utilizationPercent < 80 ? 'healthy' :
              queueStats.utilizationPercent < 95 ? 'warning' : 'critical'
          },
          rateLimits: {
            hourly: {
              current: RATE_GLOBAL.hourCount,
              max: RATE_GLOBAL.perHourMax,
              remaining: RATE_GLOBAL.perHourMax - RATE_GLOBAL.hourCount
            },
            daily: {
              current: RATE_GLOBAL.dayCount,
              max: RATE_GLOBAL.perDayMax,
              remaining: RATE_GLOBAL.perDayMax - RATE_GLOBAL.dayCount
            }
          },
          uptime: process.uptime(),
          version: '2.0.0'
        };

        const allHealthy = Object.values(health.services).every(service => service === true);
        health.status = allHealthy ? 'healthy' : 'degraded';

        if (queueStats.utilizationPercent >= 95) {
          health.status = 'warning';
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } catch (error: any) {
        console.error('❌ Error verificando salud del sistema:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        }));
      }
    }));

    adapterProvider.server.get('/v1/followup/health', handleCtx(async (bot, req, res) => {
      try {
        const queueArray = Array.from(followUpQueue.entries());
        const invalidInQueue = queueArray.filter(([phone]) => !isValidPhoneNumber(phone));

        const health = {
          status: followUpQueue.size < 400 ? 'healthy' : followUpQueue.size < 480 ? 'warning' : 'critical',
          queue: {
            size: followUpQueue.size,
            maxSize: 500,
            utilizationPercent: Math.round((followUpQueue.size / 500) * 100),
            invalidCount: invalidInQueue.length,
            invalidPhones: invalidInQueue.map(([phone]) => phone).slice(0, 10)
          },
          sessions: {
            total: userSessions.size,
            active: Array.from(userSessions.values()).filter((s: any) => s.isActive).length
          },
          recommendations: [] as string[]
        };

        if (invalidInQueue.length > 0) {
          health.recommendations.push(`Limpiar ${invalidInQueue.length} números inválidos de la cola`);
        }
        if (health.queue.utilizationPercent > 80) {
          health.recommendations.push('Ejecutar limpieza manual urgente');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: health,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(error) }));
      }
    }));

    adapterProvider.server.post('/v1/followup/cleanup', handleCtx(async (bot, req, res) => {
      try {
        const obsolete = cleanupFollowUpQueue();
        const invalid = cleanInvalidPhones();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          cleaned: {
            obsolete,
            invalid,
            total: obsolete + invalid
          },
          newQueueSize: followUpQueue.size,
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(error) }));
      }
    }));

    // ==========================================
    // === ADMIN PANEL ROUTES ===
    // ==========================================
    
    const { AdminPanel } = await import('./admin/AdminPanel');
    
    // Admin Panel UI
    adapterProvider.server.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/admin/index.html'));
    });

    // Status Page UI
    adapterProvider.server.get('/status', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/status/index.html'));
    });
    
    // Dashboard - No auth required, works independently of WhatsApp session
    adapterProvider.server.get('/api/admin/dashboard', async (req: any, res: any) => {
      return AdminPanel.getDashboard(req, res);
    });
    
    // Cache invalidation
    adapterProvider.server.post('/api/admin/cache/invalidate', async (req: any, res: any) => {
      return AdminPanel.invalidateCache(req, res);
    });
    
    // Orders - No auth required
    adapterProvider.server.get('/api/admin/orders', async (req: any, res: any) => {
      return AdminPanel.getOrders(req, res);
    });
    
    adapterProvider.server.get('/api/admin/orders/:orderId', async (req: any, res: any) => {
      return AdminPanel.getOrder(req, res);
    });
    
    adapterProvider.server.put('/api/admin/orders/:orderId', async (req: any, res: any) => {
      return AdminPanel.updateOrder(req, res);
    });
    
    adapterProvider.server.post('/api/admin/orders/:orderId/confirm', async (req: any, res: any) => {
      return AdminPanel.confirmOrder(req, res);
    });
    
    adapterProvider.server.post('/api/admin/orders/:orderId/cancel', async (req: any, res: any) => {
      return AdminPanel.cancelOrder(req, res);
    });
    
    adapterProvider.server.post('/api/admin/orders/:orderId/note', async (req: any, res: any) => {
      return AdminPanel.addOrderNote(req, res);
    });
    
    // Content Catalog - No auth required
    adapterProvider.server.get('/api/admin/content/structure/:category', async (req: any, res: any) => {
      return AdminPanel.getContentStructure(req, res);
    });
    
    adapterProvider.server.get('/api/admin/content/search', async (req: any, res: any) => {
      return AdminPanel.searchContent(req, res);
    });
    
    adapterProvider.server.get('/api/admin/content/genres/:category', async (req: any, res: any) => {
      return AdminPanel.getGenres(req, res);
    });
    
    adapterProvider.server.get('/api/admin/content/stats/:category', async (req: any, res: any) => {
      return AdminPanel.getContentStats(req, res);
    });
    
    // Analytics - No auth required
    adapterProvider.server.get('/api/admin/analytics/chatbot', async (req: any, res: any) => {
      return AdminPanel.getChatbotAnalytics(req, res);
    });
    
    // Processing - No auth required
    adapterProvider.server.get('/api/admin/processing/queue', async (req: any, res: any) => {
      return AdminPanel.getProcessingQueue(req, res);
    });
    
    adapterProvider.server.get('/api/admin/processing/progress/:jobId', async (req: any, res: any) => {
      return AdminPanel.getCopyProgress(req, res);
    });
    
    adapterProvider.server.post('/api/admin/processing/cancel/:jobId', async (req: any, res: any) => {
      return AdminPanel.cancelCopyJob(req, res);
    });
    
    // Settings - No auth required
    adapterProvider.server.get('/api/admin/settings', async (req: any, res: any) => {
      return AdminPanel.getConfig(req, res);
    });
    
    adapterProvider.server.put('/api/admin/settings', async (req: any, res: any) => {
      return AdminPanel.updateConfig(req, res);
    });

    const PORT = process.env.PORT ?? 3006;
    httpServer(Number(PORT));
    
    // Initialize Socket.io after HTTP server is created
    // The Polka server instance is available at adapterProvider.server.server after httpServer() is called
    try {
      // Wait a moment for the server to finish initializing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const underlyingServer = (adapterProvider.server as any).server;
      if (!underlyingServer) {
        throw new Error('Underlying HTTP server not available on adapterProvider.server.server');
      }
      
      io = new SocketIOServer(underlyingServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });
      
      io.on('connection', (socket) => {
        console.log('🔌 Cliente Socket.io conectado:', socket.id);
        
        // Send current connection status when client connects
        socket.emit('connection_update', { 
          status: isWhatsAppConnected ? 'connected' : 'disconnected',
          connected: isWhatsAppConnected 
        });
        
        // Re-emit latest QR code if available and not connected
        if (latestQR && !isWhatsAppConnected) {
          socket.emit('qr', latestQR);
          console.log('📡 Latest QR code sent to newly connected client:', socket.id);
        }
        
        socket.on('disconnect', () => {
          console.log('🔌 Cliente Socket.io desconectado:', socket.id);
        });
      });
      
      unifiedLogger.info('whatsapp', 'Socket.io initialized successfully');
      console.log('✅ Socket.io inicializado correctamente');
      
      // Export io instance globally for use in other modules
      (global as any).socketIO = io;
    } catch (error) {
      unifiedLogger.error('whatsapp', 'Error initializing Socket.io', { error });
      console.error('❌ Error inicializando Socket.io:', error);
    }

    unifiedLogger.info('system', 'TechAura Intelligent Bot started', {
      port: PORT,
      version: '2.1'
    });
    console.log(`\n🎉 ===== TECHAURA INTELLIGENT BOT INICIADO ===== 🎉`);
    console.log(`🚀 Puerto: ${PORT}`);
    console.log(`🧠 Sistema Inteligente v2.1: ACTIVO con persuasión mejorada`);
    console.log(`\n📊 ENDPOINTS DISPONIBLES:`);
    console.log(`\n   === WhatsApp Authentication ===`);
    console.log(`   Auth Page: http://localhost:${PORT}/auth`);
    console.log(`   Auth Status: http://localhost:${PORT}/api/auth/status`);
    console.log(`\n   === Admin Panel ===`);
    console.log(`   Admin Interface: http://localhost:${PORT}/admin`);
    console.log(`\n   === Core Endpoints ===`);
    console.log(`   Health Check: http://localhost:${PORT}/v1/health`);
    console.log(`   Analytics: http://localhost:${PORT}/v1/analytics`);
    console.log(`   Dashboard: http://localhost:${PORT}/v1/dashboard`);
    console.log(`\n   === Enhanced Endpoints (v2.1) ===`);
    console.log(`   Enhanced Dashboard: http://localhost:${PORT}/v1/enhanced/dashboard`);
    console.log(`   AI Metrics: http://localhost:${PORT}/v1/metrics/ai`);
    console.log(`   User Memory: http://localhost:${PORT}/v1/memory/{phone}`);
    console.log(`   Processing Queue: http://localhost:${PORT}/v1/processing/queue`);
    console.log(`   Persuasion Stats: http://localhost:${PORT}/v1/persuasion/stats`);
    console.log(`   Flow Coordinator: http://localhost:${PORT}/v1/flow/stats`);
    console.log(`   Test Intent: POST http://localhost:${PORT}/v1/test/intent`);
    console.log(`   Test AI Response: POST http://localhost:${PORT}/v1/test/ai-response`);
    console.log(`   Test Persuasion: POST http://localhost:${PORT}/v1/test/persuasion`);
    console.log(`\n   === AI & Intelligence ===`);
    console.log(`   AI Stats: http://localhost:${PORT}/v1/ai/stats`);
    console.log(`   Router Stats: http://localhost:${PORT}/v1/router/stats`);
    console.log(`   Recommendations: http://localhost:${PORT}/v1/recommendations/{phone}`);
    console.log(`\n   === User & Sales ===`);
    console.log(`   User Info: http://localhost:${PORT}/v1/user/{phone}`);
    console.log(`   Sales Stats: http://localhost:${PORT}/v1/sales/stats`);
    console.log(`\n   === Follow-up System ===`);
    console.log(`   Follow-up Queue: http://localhost:${PORT}/v1/followup/queue`);
    console.log(`   Follow-up Stats: http://localhost:${PORT}/v1/followup/stats`);
    console.log(`\n   === Actions ===`);
    console.log(`   Send Message: POST http://localhost:${PORT}/v1/send-message`);
    console.log(`   Manual Migration: POST http://localhost:${PORT}/v1/admin/migrate`);
    console.log(`\n🗄️ Base de datos: MySQL (${process.env.MYSQL_DB_NAME})`);
    console.log(aiService.isAvailable() ?
      `✅ IA: Gemini integrada y funcionando con sistema mejorado` :
      `⚠️ IA: No disponible - Revisa GEMINI_API_KEY`
    );
    console.log(`\n🆕 NUEVAS FUNCIONALIDADES v2.1:`);
    console.log(`   ✅ Motor de persuasión contextual`);
    console.log(`   ✅ Mensajes coherentes por etapa del journey`);
    console.log(`   ✅ Manejo inteligente de objeciones`);
    console.log(`   ✅ Coordinador de flujos sincronizado`);
    console.log(`   ✅ Validación de coherencia de mensajes`);
    console.log(`   ✅ CTAs contextuales automáticos`);
    console.log(`   ✅ Prueba social y urgencia estratégica`);
    console.log(`   ✅ Memoria de conversación estructurada`);
    console.log(`   ✅ Clasificación de intenciones avanzada`);
    console.log(`   ✅ Sistema de IA con retry y fallbacks`);
    console.log(`   ✅ Validación de calidad de respuestas`);
    console.log(`   ✅ Procesamiento mejorado con recuperación de errores`);
    console.log(`   ✅ API endpoints para monitoreo y testing`);
    console.log(`\n🎯 SISTEMAS ACTIVOS:`);
    console.log(`   🎯 Router Inteligente con clasificación NLP`);
    console.log(`   🎨 Flujos de Personalización`);
    console.log(`   🛒 Sistema de Pedidos Optimizado`);
    console.log(`   📱 Seguimiento Automático con priorización`);
    console.log(`   🧠 Memoria contextual persistente`);
    console.log(`   🔄 Auto-procesador con retry inteligente`);
    console.log(`\n🔧 CONFIGURACIÓN DEL SISTEMA:`);
    console.log(`   - Cola manager: 5000 usuarios`);
    console.log(`   - Memoria caché: 1000 conversaciones`);
    console.log(`   - AI retry: 3 intentos con backoff exponencial`);
    console.log(`   - Procesamiento concurrente: 3 jobs`);
    console.log(`   - Delay entre mensajes: 3 segundos`);
    console.log(`   - Límite horario: 60 mensajes/hora`);
    console.log(`   - Límite diario: 5000 mensajes/día`);
    console.log(`===============================================\n`);

    console.log('🎵 TechAura Intelligent Bot v2.1 está listo para:');
    console.log('   ✨ Persuadir efectivamente en cada etapa del journey');
    console.log('   🎯 Manejar objeciones con respuestas contextuales');
    console.log('   🔄 Coordinar flujos sin conflictos');
    console.log('   💬 Enviar mensajes coherentes y ordenados');
    console.log('   🎭 Adaptar tono según contexto del cliente');
    console.log('   ✅ Validar coherencia antes de enviar');
    console.log('   📊 Guiar al cliente hacia la compra');
    console.log('   🧠 Mantener contexto de conversaciones');
    console.log('   🤖 Generar respuestas inteligentes con fallbacks');
    console.log('   📈 Proveer métricas y análisis en tiempo real');
    console.log('   🛡️ Validar calidad de respuestas de IA');
    console.log('   💾 Cachear respuestas comunes');
    console.log('');
    console.log('🚀 ¡Sistema inteligente v2.1 con persuasión mejorada operativo!');
    
    // ==========================================
    // === INITIALIZE SHUTDOWN MANAGER ===
    // ==========================================
    
    // Initialize ShutdownManager for graceful shutdown
    console.log('\n🛡️ Inicializando ShutdownManager...');
    const shutdownManager = initShutdownManager(businessDB, pool, 25);
    
    // Register services with ShutdownManager
    if (followUpSystemHandle) {
      shutdownManager.registerService('followUpSystem', {
        stop: () => {
          if (followUpSystemHandle && followUpSystemHandle.stop) {
            followUpSystemHandle.stop();
          }
          stopFollowUpSystem();
        }
      });
    }
    
    shutdownManager.registerService('messageDeduper', {
      stop: () => getMessageDeduper().shutdown()
    });
    
    shutdownManager.registerService('followUpQueueManager', {
      stop: () => followUpQueueManager.clear()
    });
    
    console.log('✅ ShutdownManager inicializado con todos los servicios registrados');


  } catch (error: any) {
    unifiedLogger.error('system', 'Critical startup error', {
      error: error.message,
      stack: error.stack
    });
    console.error('❌ Error crítico iniciando aplicación:', error);
    console.error('Stack trace completo:', error.stack);

    try {
      if (businessDB) {
        await businessDB.logError({
          type: 'startup_error',
          error: error.message,
          stack: error.stack,
          timestamp: new Date()
        });
      }
    } catch (dbError) {
      unifiedLogger.error('database', 'Failed to log startup error to database', { error: dbError });
      console.error('❌ No se pudo registrar el error en la base de datos:', dbError);
    }

    process.exit(1);
  }
};

// ==========================================
// === MANEJO DE ERRORES GLOBALES ===
// ==========================================

process.on('uncaughtException', async (error: any) => {
  unifiedLogger.error('system', 'Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  console.error('❌ Error no capturado:', error);
  console.error('Stack trace:', error.stack);

  try {
    if (businessDB) {
      await businessDB.logError({
        type: 'uncaught_exception',
        error: error.message,
        stack: error.stack,
        timestamp: new Date()
      });
    }
  } catch (dbError) {
    console.error('❌ Error logging to database:', dbError);
  }

  // NEW: Use ShutdownManager for graceful shutdown
  try {
    const shutdownManager = getShutdownManager();
    await shutdownManager.initiateShutdown('UNCAUGHT_EXCEPTION');
  } catch (shutdownError) {
    console.error('❌ Error durante shutdown:', shutdownError);
    process.exit(1);
  }
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  console.error('Promise:', promise);

  try {
    if (businessDB) {
      await businessDB.logError({
        type: 'unhandled_rejection',
        error: String(reason),
        timestamp: new Date()
      });
    }
  } catch (dbError) {
    console.error('❌ Error logging to database:', dbError);
  }

  // NEW: Use ShutdownManager for graceful shutdown
  try {
    const shutdownManager = getShutdownManager();
    await shutdownManager.initiateShutdown('UNHANDLED_REJECTION');
  } catch (shutdownError) {
    console.error('❌ Error durante shutdown:', shutdownError);
    process.exit(1);
  }
});

// ==========================================
// === SHUTDOWN GRACEFUL ===
// ==========================================

// NEW: Use ShutdownManager for graceful shutdown
process.on('SIGTERM', async () => {
  try {
    const shutdownManager = getShutdownManager();
    await shutdownManager.initiateShutdown('SIGTERM');
  } catch (error) {
    console.error('❌ ShutdownManager not initialized, using basic shutdown');
    process.exit(0);
  }
});

process.on('SIGINT', async () => {
  try {
    const shutdownManager = getShutdownManager();
    await shutdownManager.initiateShutdown('SIGINT');
  } catch (error) {
    console.error('❌ ShutdownManager not initialized, using basic shutdown');
    process.exit(0);
  }
});

// ==========================================
// === UTILIDADES AUXILIARES ===
// ==========================================

// ==========================================
// === TELEMETRÍA DE MENSAJES ===
// ==========================================

interface MessageTelemetry {
  phone: string;
  message: string;
  timestamp: number;
  action: 'received' | 'processed' | 'skipped' | 'error';
  reason?: string;
  stage?: string;
  processingTimeMs?: number;
}

const messageTelemetry: MessageTelemetry[] = [];
const MAX_TELEMETRY_SIZE = 1000;

function logMessageTelemetry(telemetry: MessageTelemetry): void {
  messageTelemetry.push(telemetry);
  if (messageTelemetry.length > MAX_TELEMETRY_SIZE) {
    messageTelemetry.shift(); // Remove oldest entry
  }
  
  unifiedLogger.info('message_telemetry', 
    `[${telemetry.action.toUpperCase()}] ${telemetry.phone} - ${telemetry.reason || 'N/A'}`,
    telemetry
  );
}

function getMessageTelemetryStats() {
  const now = Date.now();
  const last5Min = messageTelemetry.filter(t => now - t.timestamp < 5 * 60 * 1000);
  const last1Hour = messageTelemetry.filter(t => now - t.timestamp < 60 * 60 * 1000);
  
  return {
    last5Minutes: {
      total: last5Min.length,
      processed: last5Min.filter(t => t.action === 'processed').length,
      skipped: last5Min.filter(t => t.action === 'skipped').length,
      errors: last5Min.filter(t => t.action === 'error').length,
    },
    lastHour: {
      total: last1Hour.length,
      processed: last1Hour.filter(t => t.action === 'processed').length,
      skipped: last1Hour.filter(t => t.action === 'skipped').length,
      errors: last1Hour.filter(t => t.action === 'error').length,
    }
  };
}

// ==========================================
// === PROTECCIÓN CONTRA BLOQUEO EN PROCESSING ===
// ==========================================

interface ProcessingState {
  phone: string;
  startedAt: number;
  timeoutId?: NodeJS.Timeout;
}

const processingStates = new Map<string, ProcessingState>();
const PROCESSING_TIMEOUT_MS = 60 * 1000; // 60 seconds timeout

function setProcessingState(phone: string): void {
  // Clear any existing state
  clearProcessingState(phone);
  
  const timeoutId = setTimeout(() => {
    unifiedLogger.warn('processing_timeout', `Processing timeout for ${phone}`, { phone });
    clearProcessingState(phone);
    
    // Mark user as no longer processing
    getUserSession(phone).then(session => {
      if (session && session.isProcessing) {
        updateUserSession(phone, 'TIMEOUT_RECOVERY', session.currentFlow || 'main', session.stage || 'timeout', false, {
          metadata: { ...session, isProcessing: false, processingTimeout: true, recoveredAt: new Date().toISOString() }
        }).catch(err => {
          unifiedLogger.error('processing_timeout_recovery', `Failed to recover from timeout: ${phone}`, err);
        });
      }
    }).catch(err => {
      unifiedLogger.error('processing_timeout', `Failed to get session during timeout recovery: ${phone}`, err);
    });
  }, PROCESSING_TIMEOUT_MS);
  
  processingStates.set(phone, { phone, startedAt: Date.now(), timeoutId });
  unifiedLogger.debug('processing_state', `Set processing state for ${phone}`);
}

function clearProcessingState(phone: string): void {
  const state = processingStates.get(phone);
  if (state) {
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }
    processingStates.delete(phone);
    unifiedLogger.debug('processing_state', `Cleared processing state for ${phone}`);
  }
}

function isStuckInProcessing(phone: string): boolean {
  const state = processingStates.get(phone);
  if (!state) return false;
  
  const elapsedMs = Date.now() - state.startedAt;
  return elapsedMs > PROCESSING_TIMEOUT_MS;
}

// Cleanup stuck processing states periodically
const processingCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  processingStates.forEach((state, phone) => {
    if (now - state.startedAt > PROCESSING_TIMEOUT_MS) {
      unifiedLogger.warn('processing_cleanup', `Auto-cleaning stuck processing state: ${phone}`);
      clearProcessingState(phone);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    unifiedLogger.info('processing_cleanup', `Cleaned ${cleaned} stuck processing states`);
  }
}, 30 * 1000); // Check every 30 seconds

// ==========================================
// === VALIDACIÓN MEJORADA DE MENSAJES ===
// ==========================================

function shouldProcessMessage(from: any, message: string): boolean {
  const startTime = Date.now();
  
  // Basic validation
  if (!message || message.trim().length === 0) {
    logMessageTelemetry({ phone: from, message: '', timestamp: startTime, action: 'skipped', reason: 'Empty message' });
    return false;
  }

  // Check blocked users
  const blockedUsers = ['blockedUser1@s.whatsapp.net', 'blockedUser2@s.whatsapp.net'];
  if (blockedUsers.includes(from)) {
    logMessageTelemetry({ phone: from, message, timestamp: startTime, action: 'skipped', reason: 'Blocked user' });
    return false;
  }

  // IMPROVED: Allow processing outside hours for user-initiated messages
  // Only apply strict hour restriction to automated follow-ups, not incoming messages
  // This ensures we never ignore a customer who reaches out to us
  const currentHour = new Date().getHours();
  const isOutsideHours = currentHour < 8 || currentHour > 22;
  
  if (isOutsideHours) {
    // Log but don't skip - we should respond to users at any time they message us
    unifiedLogger.info('message_outside_hours', 
      `Received message outside business hours (${currentHour}:00) - still processing`,
      { phone: from, hour: currentHour }
    );
  }
  
  // Check if user is stuck in processing
  if (isStuckInProcessing(from)) {
    unifiedLogger.warn('stuck_processing_detected', 
      `User stuck in processing, allowing new message to proceed: ${from}`
    );
    clearProcessingState(from); // Force clear the stuck state
  }

  logMessageTelemetry({ 
    phone: from, 
    message: message.substring(0, 100), 
    timestamp: startTime, 
    action: 'received',
    processingTimeMs: Date.now() - startTime
  });
  
  return true;
}

// ==========================================
// === MONITOREO DE MEMORIA ===
// ==========================================

const systemMonitorInterval = setInterval(() => {
  const used = process.memoryUsage();
  const mb = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;

  const queueStats = followUpQueueManager.getStats();
  const telemetryStats = getMessageTelemetryStats();

  console.log(`\n💾 ===== ESTADO DEL SISTEMA =====`);
  console.log(`   Memoria RSS: ${mb(used.rss)}MB`);
  console.log(`   Heap: ${mb(used.heapUsed)}/${mb(used.heapTotal)}MB`);
  console.log(`   Sesiones: ${userSessions.size}`);
  console.log(`   Cola manager: ${queueStats.total}/${queueStats.maxSize} (${queueStats.utilizationPercent}%)`);
  console.log(`   Cola legacy followUpQueue: ${followUpQueue.size}/500`);
  console.log(`   Rate Limits: ${RATE_GLOBAL.hourCount}/${RATE_GLOBAL.perHourMax}h | ${RATE_GLOBAL.dayCount}/${RATE_GLOBAL.perDayMax}d`);
  console.log(`   Processing States: ${processingStates.size} active`);
  console.log(`   Messages (5m): ${telemetryStats.last5Minutes.processed} processed, ${telemetryStats.last5Minutes.skipped} skipped, ${telemetryStats.last5Minutes.errors} errors`);
  console.log(`================================\n`);

  if (used.heapUsed > 500 * 1024 * 1024) {
    console.log('⚠️ Memoria alta, ejecutando limpieza...');
    if ((global as any).processingCache) (global as any).processingCache.clear();
    if (global.gc) global.gc();
  }
}, 5 * 60 * 1000);

// ==========================================
// === EXPORTACIONES ===
// ==========================================

export {
  sendAutomaticMessage,
  generatePersonalizedFollowUp,
  initializeApp,
  followUpQueueManager
};

// ==========================================
// === INICIAR APLICACIÓN ===
// ==========================================

const startApplication = async () => {
  try {
    console.log('🔧 Iniciando panel de control...');
    startControlPanel();

    console.log('🚀 Iniciando aplicación principal...');
    await main();
    
    // Register global intervals with ShutdownManager after app starts
    setTimeout(() => {
      try {
        const shutdownManager = getShutdownManager();
        shutdownManager.registerInterval(cleanupQueueInterval);
        shutdownManager.registerInterval(processingCleanupInterval);
        shutdownManager.registerInterval(systemMonitorInterval);
        console.log('✅ Intervalos globales registrados con ShutdownManager');
      } catch (error) {
        console.warn('⚠️ No se pudieron registrar intervalos globales:', error);
      }
    }, 7000); // After followUpSystem is initialized
  } catch (error) {
    console.error('❌ Error crítico al iniciar la aplicación:', error);
    process.exit(1);
  }
};

startApplication();
