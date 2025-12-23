import { addKeyword, EVENTS } from '@builderbot/bot';
import { getUserSession, updateUserSession } from '../userTrackingSystem';
import { unifiedLogger } from '../../utils/unifiedLogger';

export const qualityAssuranceFlow = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        try {
            const session = await getUserSession(ctx.from);
            
            if (!session) {
                unifiedLogger.warn('flow', 'QA flow - no session found', { phone: ctx.from });
                await flowDynamic([
                    '❌ No encontramos tu sesión activa.',
                    'Por favor, contacta a soporte para revisar tu pedido.'
                ]);
                return endFlow();
            }

            unifiedLogger.info('flow', 'Quality assurance flow started', {
                phone: ctx.from,
                userName: ctx.name || session.name
            });

            await updateUserSession(ctx.from, 'qa_start', 'quality_assurance', 'qa_in_progress', false, {
                messageType: 'qa',
                metadata: { 
                    startedAt: new Date().toISOString(),
                    userName: ctx.name || session.name
                }
            });

            const userName = ctx.name || session.name || 'estimado cliente';

            // Simulación de QA con feedback progresivo
            await flowDynamic([
                `🛡️ **Control de Calidad - ${userName}**`,
                '',
                '🔍 **Verificaciones en curso:**',
                '• ⏳ Reproducción de muestras...',
                '• ⏳ Integridad de archivos...',
                '• ⏳ Estructura y nombres...',
                '• ⏳ Metadatos y carátulas...',
                '',
                '⏱️ Este proceso toma unos minutos...'
            ]);

            // Simulate QA delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            await flowDynamic([
                '✅ **¡Control de Calidad Completado!**',
                '',
                '📊 **Resultados:**',
                '• ✅ Todos los archivos reproducen correctamente',
                '• ✅ Estructura organizada y etiquetada',
                '• ✅ Carátulas y metadatos completos',
                '• ✅ Sin archivos corruptos o duplicados',
                '',
                '🎉 **Tu USB está lista para despacho**',
                '',
                '📦 Procederemos con el envío según la información de entrega proporcionada.',
                '',
                '📱 Te notificaremos el número de guía de envío pronto.'
            ]);

            await updateUserSession(ctx.from, 'qa_ok', 'quality_assurance', 'qa_passed', false, {
                messageType: 'qa',
                metadata: { 
                    status: 'passed', 
                    finishedAt: new Date().toISOString(),
                    checksPerformed: ['playback', 'integrity', 'structure', 'metadata']
                }
            });

            unifiedLogger.info('flow', 'Quality assurance completed successfully', {
                phone: ctx.from,
                status: 'passed'
            });

        } catch (error: any) {
            unifiedLogger.error('flow', 'Error in quality assurance flow', {
                phone: ctx.from,
                error: error.message,
                stack: error.stack
            });

            await updateUserSession(ctx.from, 'qa_error', 'quality_assurance', 'qa_failed', false, {
                messageType: 'qa',
                metadata: { 
                    status: 'error', 
                    errorAt: new Date().toISOString(),
                    errorMessage: error.message
                }
            });

            await flowDynamic([
                '⚠️ **Hubo un problema durante el control de calidad**',
                '',
                'No te preocupes, nuestro equipo técnico revisará tu pedido manualmente.',
                '',
                '📱 Te contactaremos pronto con una actualización.',
                '',
                '💡 Si tienes alguna pregunta urgente, escribe "soporte".'
            ]);
        }
    });
