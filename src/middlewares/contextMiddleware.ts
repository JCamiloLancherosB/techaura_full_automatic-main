// src/middleware/contextMiddleware.ts
import { contextAnalyzer, ContextAnalysis } from '../services/contextAnalyzer';

// Helper seguro para terminar flujo
const safeEndFlow = (endFlow: any) => {
    if (typeof endFlow === 'function') {
        return endFlow();
    }
    console.warn('⚠️ [MIDDLEWARE] endFlow no es una función, ignorando acción.');
};

export const contextMiddleware = async (ctx: any, { endFlow, flowDynamic }: any, next: any) => {
    try {
        console.log(`🛡️ [MIDDLEWARE] Verificando contexto para ${ctx.from}`);

        const analysis: ContextAnalysis = await contextAnalyzer.analyzeContext(
            ctx.from,
            ctx.body,
            ctx.currentFlow
        );

        console.log(`🛡️ [MIDDLEWARE] Acción sugerida: ${analysis.suggestedAction} (${analysis.reason})`);

        // ✅ DECISIONES BASADAS EN EL ANÁLISIS
        switch (analysis.suggestedAction) {
            case 'ignore':
                console.log(`🚫 [MIDDLEWARE] Ignorando mensaje.`);
                return safeEndFlow(endFlow);

            case 'continue':
            case 'redirect':
            case 'respond':
                // Permitir continuar
                break;

            default:
                console.log(`❓ [MIDDLEWARE] Acción desconocida, permitiendo continuar`);
        }

        // ✅ SI NO DEBE RESPONDER, TERMINAR SILENCIOSAMENTE
        if (!analysis.shouldRespond) {
            console.log(`🔇 [MIDDLEWARE] No debe responder.`);
            return safeEndFlow(endFlow);
        }

        // ✅ CONTINUAR AL SIGUIENTE HANDLER
        return next();

    } catch (error) {
        console.error('❌ [MIDDLEWARE] Error en middleware contextual:', error);
        return next(); // Por seguridad, dejar pasar si falla el análisis
    }
};

// ✅ MIDDLEWARE ESPECÍFICO PARA FLUJOS DE DATOS
export const dataCollectionMiddleware = async (ctx: any, { endFlow, flowDynamic }: any, next: any) => {
    try {
        // Optimización: Solo verificar si el contexto parece ser de datos
        const analysis = await contextAnalyzer.analyzeContext(ctx.from, ctx.body, 'datosCliente');

        if (analysis.currentContext === 'collecting_customer_data' ||
            analysis.currentContext === 'datosCliente') {

            if (analysis.suggestedAction === 'continue') {
                return next();
            }
        }

        if (analysis.suggestedAction === 'ignore') {
            return safeEndFlow(endFlow);
        }

        return next();

    } catch (error) {
        console.error('❌ [DATA MIDDLEWARE] Error:', error);
        return next();
    }
};

// ✅ MIDDLEWARE PARA FLUJOS DE CAPACIDAD (CORREGIDO Y MEJORADO)
export const capacityMiddleware = async (ctx: any, { endFlow }: any, next: any) => {
    try {
        console.log(`💾 [CAPACITY MIDDLEWARE] Verificando mensaje: "${ctx.body}"`);

        const message = ctx.body.toLowerCase().trim();

        // MEJORA: Regex expandido para incluir preguntas de precio y evitar bloqueos falsos
        const isCapacityRelated = /\d{1,3}\s?(gb|gigas?)?|capacidad|tamaño|espacio|grande|pequeña|mediana|precio|cuanto|costo|valor|diferencia|cual/i.test(message);

        if (!isCapacityRelated) {
            const analysis = await contextAnalyzer.analyzeContext(ctx.from, ctx.body, ctx.currentFlow || 'capacity');
            if (analysis.suggestedAction === 'ignore') {
                console.log(`🚫 [CAPACITY MIDDLEWARE] Bloqueando: No relacionado con capacidad`);
                return safeEndFlow(endFlow);
            }
        }

        return next();

    } catch (error) {
        console.error('❌ [CAPACITY MIDDLEWARE] Error:', error);
        return next();
    }
};