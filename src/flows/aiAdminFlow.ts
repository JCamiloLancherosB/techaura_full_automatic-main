import { addKeyword } from '@builderbot/bot';
import { aiService } from '../services/aiService';
import { getUserSession } from './userTrackingSystem';
import { createTestSession, createTestSessionByProfile } from '../utils/testHelpers';
import type { UserSession } from '../../types/global'; 

/**
 * Representa una oportunidad de venta detectada en la conversación.
 * @property urgency - Nivel de urgencia del cliente ('high', 'medium', 'low').
 * @property buyingSignals - Señales que indican interés en comprar.
 * @property objections - Objeciones o preocupaciones del cliente.
 * @property recommendedAction - Acción recomendada para el vendedor.
 * @property pricePoint - Rango de precio que el cliente está considerando.
 */

interface SalesOpportunity {
    urgency: 'high' | 'medium' | 'low';
    buyingSignals: string[];
    objections: string[];
    recommendedAction: string;
    pricePoint: string;
}

export const aiAdminFlow = addKeyword(['!ai', '!ia'])
    .addAction(async (ctx, { flowDynamic }) => {
        const command = ctx.body.toLowerCase().trim();
        
        if (command === '!ai status' || command === '!ia status') {
            const stats = aiService.getStats();
            const status = stats.isAvailable ? '✅ Activa' : '❌ Inactiva';
            
            await flowDynamic([
                `🤖 *Estado de la IA TechAura*`,
                ``,
                `🔋 Estado: ${status}`,
                `🔧 Proveedor: Gemini 1.5 Flash`,
                `📊 Solicitudes: ${stats.requestCount}`,
                `❌ Errores: ${stats.errorCount}`,
                `🎯 Éxito: ${stats.successRate.toFixed(1)}%`,
                `⏰ Último error: ${stats.lastError ? stats.lastError.toLocaleString() : 'Ninguno'}`
            ]);
            
        } else if (command === '!ai help' || command === '!ia help') {
            await flowDynamic([
                `🤖 *Comandos de IA disponibles:*`,
                ``,
                `• \`!ai status\` - Ver estado detallado`,
                `• \`!ai help\` - Mostrar esta ayuda`,
                `• \`!ai test\` - Probar respuesta básica`,
                `• \`!ai test basic\` - Probar con perfil básico`,
                `• \`!ai test premium\` - Probar con perfil premium`,
                `• \`!ai test vip\` - Probar con perfil VIP`,
                `• \`!ai reset\` - Reiniciar servicio`,
                `• \`!ai stats\` - Estadísticas completas`
            ]);
            
        } else if (command.startsWith('!ai test') || command.startsWith('!ia test')) {
    try {
        await flowDynamic(['🧪 Probando respuesta de IA...']);
        
        // ✅ MEJORADO: Detectar tipo de prueba
        let testSession: UserSession;
        let testMessage = "Hola, me interesan las USBs de música";
        
        if (command.includes('basic')) {
            testSession = createTestSessionByProfile(ctx.from, 'basic');
            testMessage = "Hola, busco algo económico para mi música";
            await flowDynamic(['🎯 Probando con perfil: *Cliente Básico*']);
            
        } else if (command.includes('premium')) {
            testSession = createTestSessionByProfile(ctx.from, 'premium');
            testMessage = "Me interesa algo personalizado y de buena calidad";
            await flowDynamic(['🎯 Probando con perfil: *Cliente Premium*']);
            
        } else if (command.includes('vip')) {
            testSession = createTestSessionByProfile(ctx.from, 'vip');
            testMessage = "Quiero lo mejor que tengan, sin importar el precio";
            await flowDynamic(['🎯 Probando con perfil: *Cliente VIP*']);
            
        } else {
            // ✅ USAR HELPER: Sesión de prueba estándar
            testSession = createTestSession(ctx.from, {
                name: 'Usuario Test IA',
                currentFlow: 'aiTest'
            });
            await flowDynamic(['🎯 Probando con perfil: *Estándar*']);
        }
        
        // ✅ CORREGIDO: Crear un objeto SalesOpportunity válido
        const salesOpportunity: SalesOpportunity = {
            urgency: 'medium',
            buyingSignals: ['interés en USBs'],
            objections: [],
            recommendedAction: 'ofrecer catálogo',
            pricePoint: '$$'
        };
        
        const testResponse = await aiService.generateResponse(
            testMessage,
            testSession,
            salesOpportunity 
        );
        
        await flowDynamic([
            `🧪 *Resultado de Prueba de IA:*`,
            ``,
            `📝 *Mensaje test:* "${testMessage}"`,
            `👤 *Perfil:* ${testSession.stage} (Buying Intent: ${testSession.buyingIntent}%)`,
            `💰 *Rango precio:* $${testSession.preferences?.priceRange?.min?.toLocaleString()} - $${testSession.preferences?.priceRange?.max?.toLocaleString()}`,
            ``,
            `💬 *Respuesta generada:*`,
            `${testResponse}`,
            ``,
            `✅ *Estado:* ${aiService.isAvailable() ? 'IA Activa' : 'Usando Respuestas Fallback'}`,
            `🔧 *Servicio:* ${aiService.isAvailable() ? 'Gemini API' : 'Respuestas Predefinidas'}`
        ]);
        
    } catch (error) {
        console.error('❌ Error en prueba de IA:', error);
        await flowDynamic([
            `❌ *Error en prueba de IA:*`,
            ``,
            `🚨 ${error.message || 'Error desconocido'}`,
            `🔧 Verifica la configuración de la API`,
            ``,
            `💡 *Posibles causas:*`,
            `• API key de Gemini no configurada`,
            `• Límite de requests excedido`,
            `• Problema de conectividad`,
            `• Error en el formato de la sesión`
        ]);
    }            
    } else if (command === '!ai reset' || command === '!ia reset') {
            try {
                await flowDynamic(['🔄 Reiniciando servicio de IA...']);
                
                if (typeof aiService.reinitialize === 'function') {
                    await aiService.reinitialize();
                    await flowDynamic(['✅ Servicio de IA reiniciado correctamente']);
                } else {
                    await flowDynamic(['⚠️ Función de reinicio no disponible']);
                }
                
            } catch (error) {
                console.error('❌ Error reiniciando IA:', error);
                await flowDynamic([
                    '❌ Error al reiniciar el servicio',
                    `🚨 ${error.message || 'Error desconocido'}`
                ]);
            }
            
        } else if (command === '!ai stats' || command === '!ia stats') {
            const stats = aiService.getStats();
            const healthStatus = stats.isAvailable && stats.successRate > 80 ? '🟢 Excelente' : 
                               stats.isAvailable && stats.successRate > 60 ? '🟡 Bueno' : '🔴 Crítico';
            
            await flowDynamic([
                `📊 *Estadísticas Completas de IA*`,
                ``,
                `${healthStatus}`,
                ``,
                `🔋 *Estado del Servicio:*`,
                `• Disponible: ${stats.isAvailable ? 'Sí' : 'No'}`,
                `• Inicializado: ${stats.isAvailable ? 'Correctamente' : 'Con errores'}`,
                ``,
                `📈 *Métricas de Uso:*`,
                `• Total solicitudes: ${stats.requestCount}`,
                `• Errores totales: ${stats.errorCount}`,
                `• Tasa de éxito: ${stats.successRate.toFixed(1)}%`,
                ``,
                `⏰ *Información Temporal:*`,
                `• Último error: ${stats.lastError ? stats.lastError.toLocaleString() : 'Ninguno'}`,
                `• Uptime: ${stats.isAvailable ? 'Activo' : 'Inactivo'}`,
                ``,
                `🎯 *Prueba diferentes perfiles:*`,
                `• \`!ai test basic\` - Cliente económico`,
                `• \`!ai test premium\` - Cliente estándar`,
                `• \`!ai test vip\` - Cliente premium`
            ]);
            
        } else {
            await flowDynamic([
                `🤖 *IA de TechAura - Sistema de Ventas*`,
                ``,
                `🔥 IA especializada en ventas de USBs personalizadas`,
                `⚡ Técnicas de persuasión avanzadas`,
                `🎯 Detección inteligente de intenciones`,
                ``,
                `📱 Usa: \`!ai help\` para ver todos los comandos`
            ]);
        }
    });

export default aiAdminFlow;
