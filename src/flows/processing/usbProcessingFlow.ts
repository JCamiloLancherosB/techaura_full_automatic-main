import { addKeyword, EVENTS } from '@builderbot/bot';
import { getUserSession, updateUserSession } from '../userTrackingSystem';
import { unifiedLogger } from '../../utils/unifiedLogger';

export const usbProcessingFlow = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx, { flowDynamic, gotoFlow, endFlow }) => {
        try {
            const session = await getUserSession(ctx.from);
            
            if (!session) {
                unifiedLogger.warn('flow', 'USB processing flow - no session found', { phone: ctx.from });
                await flowDynamic([
                    '❌ No encontramos tu sesión activa.',
                    'Por favor, inicia tu pedido nuevamente escribiendo "hola".'
                ]);
                return endFlow();
            }

            unifiedLogger.info('flow', 'USB processing flow started', {
                phone: ctx.from,
                userName: ctx.name || session.name
            });

            // Marcar inicio de procesamiento
            await updateUserSession(ctx.from, 'usbProcessing_start', 'usb_processing', 'processing_started', false, {
                messageType: 'processing',
                metadata: { 
                    step: 'start', 
                    startedAt: new Date().toISOString(),
                    userName: ctx.name || session.name
                }
            });

            const userName = ctx.name || session.name || 'estimado cliente';

            await flowDynamic([
                `⚙️ **Estamos preparando tu pedido, ${userName}**`,
                '',
                '🔄 **Pasos en curso:**',
                '• ✅ Organizando contenido por géneros/artistas',
                '• ✅ Verificando calidad de archivos',
                '• ✅ Preparando estructura de carpetas',
                '• ✅ Agregando metadatos y carátulas',
                '',
                '⏱️ **Tiempo estimado:** 3-12 horas según capacidad',
                '',
                '📱 Te notificaremos cuando esté listo para despacho.',
                '',
                '💡 Puedes seguir el progreso escribiendo "estado"'
            ]);

            unifiedLogger.info('flow', 'USB processing flow initiated successfully', {
                phone: ctx.from,
                estimatedTime: '3-12h'
            });

            // Aquí puedes disparar jobs/colas reales
            // TODO: Trigger actual processing job
            
            return endFlow();

        } catch (error: any) {
            unifiedLogger.error('flow', 'Error in USB processing flow', {
                phone: ctx.from,
                error: error.message,
                stack: error.stack
            });

            await flowDynamic([
                '❌ Hubo un error al iniciar la preparación de tu pedido.',
                '',
                'No te preocupes, nuestro equipo lo revisará manualmente.',
                '',
                '📱 Te contactaremos pronto para actualizar el estado de tu pedido.'
            ]);

            return endFlow();
        }
    });
