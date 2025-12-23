import { EVENTS, addKeyword } from '@builderbot/bot'
import { unifiedLogger } from '../utils/unifiedLogger';
import { updateUserSession, getUserSession } from './userTrackingSystem';

const flowAsesor = addKeyword([EVENTS.ACTION])
    .addAction({ capture: true }, async (ctx, { flowDynamic, endFlow }) => {
        try {
            unifiedLogger.info('flow', 'Advisor flow initiated', { 
                phone: ctx.from, 
                name: ctx.name 
            });

            // Update user session to track advisor request
            await updateUserSession(
                ctx.from,
                ctx.body || 'Solicitó asesor',
                'flowAsesor',
                'advisor_requested',
                false,
                {
                    metadata: {
                        timestamp: new Date().toISOString(),
                        userName: ctx.name || ctx.pushName
                    }
                }
            );

            const userName = ctx.name || ctx.pushName || 'estimado cliente';

            await flowDynamic([
                `👨‍💼 ¡Hola ${userName}!`,
                '',
                '🔔 He notificado a nuestro equipo de asesores.',
                '',
                '📝 Mientras tanto, describe brevemente cómo podemos ayudarte:',
                '• ¿Qué producto te interesa?',
                '• ¿Tienes alguna duda específica?',
                '• ¿Necesitas asesoría personalizada?',
                '',
                '⏱️ Un asesor se conectará contigo en breve.'
            ]);

            unifiedLogger.info('flow', 'Advisor flow completed', { phone: ctx.from });

            return endFlow();
        } catch (error: any) {
            unifiedLogger.error('flow', 'Error in advisor flow', { 
                phone: ctx.from, 
                error: error.message,
                stack: error.stack
            });

            await flowDynamic([
                '❌ Hubo un problema al procesar tu solicitud.',
                '',
                'Por favor, intenta nuevamente o escribe "ayuda" para más opciones.'
            ]);

            return endFlow();
        }
    })

export default flowAsesor