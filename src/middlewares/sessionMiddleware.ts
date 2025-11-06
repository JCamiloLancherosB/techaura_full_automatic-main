import { getOrCreateSession } from '../services/sessionManager';
import type { BotContext } from '../../types/global';

export const sessionMiddleware = () => {
    return async (ctx: BotContext, next: () => Promise<void>) => {
        try {
            // Obtener o crear sesión
            ctx.session = await getOrCreateSession(ctx.from);
            
            // Registrar interacción
            ctx.session.lastInteraction = new Date();
            ctx.session.messageCount = (ctx.session.messageCount || 0) + 1;
            
            await next();
        } catch (error) {
            console.error('Error en sessionMiddleware:', error);
            throw error;
        }
    };
};
