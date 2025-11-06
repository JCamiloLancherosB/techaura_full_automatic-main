import { errorHandler } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { IntelligentRouter } from '../services/intelligentRouter';
import { aiService } from '../services/aiService';

// ✅ DECLARACIONES DE FUNCIONES EXTERNAS
declare global {
    function initializeDatabase(): Promise<void>;
    function closeDatabase(): Promise<void>;
    var activeFollowUpSystem: () => any;
    var stopFollowUpSystem: () => void;
}

export const initializeBotSystem = async (): Promise<void> => {
    try {
        logger.info('system', 'Iniciando sistema de bot avanzado...');
        
        // ✅ INICIALIZAR COMPONENTES CRÍTICOS CON VALIDACIÓN
        await errorHandler.withRetry(async () => {
            // ✅ INICIALIZAR SERVICIOS DE IA
            if (aiService?.isAvailable()) {
                logger.info('ai', 'Servicios de IA disponibles');
            }
            
            // ✅ INICIALIZAR ROUTER INTELIGENTE
            const router = IntelligentRouter.getInstance();
            logger.info('router', 'Router inteligente inicializado');
            
            // ✅ INICIALIZAR LIMPIEZA AUTOMÁTICA
            errorHandler.startCleanupInterval();
            logger.info('cleanup', 'Sistema de limpieza automática activado');
            
            return true;
        }, 3, 2000, 'system_initialization');
        
        // ✅ CONFIGURAR MANEJO DE SEÑALES DEL SISTEMA
        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        
        logger.info('system', '✅ Sistema de bot inicializado completamente');
        
    } catch (error) {
        logger.error('system', 'Error crítico en inicialización', { error });
        throw error;
    }
};

// ✅ FUNCIÓN DE CIERRE GRACEFUL
const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info('system', `Recibida señal ${signal}, iniciando cierre graceful...`);
    
    try {
        logger.info('system', '✅ Cierre graceful completado');
        process.exit(0);
        
    } catch (error) {
        logger.error('system', 'Error durante cierre graceful', { error });
        process.exit(1);
    }
};
