// src/middleware/contextMiddleware.ts
import { contextAnalyzer, ContextAnalysis } from '../services/contextAnalyzer';

export const contextMiddleware = async (ctx: any, { endFlow, flowDynamic }: any, next: any) => {
    try {
        console.log(`🛡️ [MIDDLEWARE] Verificando contexto para ${ctx.from}`);
        
        const analysis: ContextAnalysis = await contextAnalyzer.analyzeContext(
            ctx.from, 
            ctx.body, 
            ctx.currentFlow
        );
        
        console.log(`🛡️ [MIDDLEWARE] Resultado del análisis:`, {
            shouldRespond: analysis.shouldRespond,
            action: analysis.suggestedAction,
            reason: analysis.reason,
            confidence: analysis.confidence
        });
        
        // ✅ DECISIONES BASADAS EN EL ANÁLISIS
        switch (analysis.suggestedAction) {
            case 'ignore':
                console.log(`🚫 [MIDDLEWARE] Ignorando mensaje: ${analysis.reason}`);
                return endFlow();
                
            case 'continue':
                console.log(`🔄 [MIDDLEWARE] Continuando en contexto actual: ${analysis.currentContext}`);
                return endFlow();
                
            case 'redirect':
                console.log(`🔀 [MIDDLEWARE] Redirección sugerida, permitiendo continuar`);
                break;
                
            case 'respond':
                console.log(`✅ [MIDDLEWARE] Respuesta normal permitida`);
                break;
                
            default:
                console.log(`❓ [MIDDLEWARE] Acción desconocida, permitiendo continuar`);
        }
        
        // ✅ SI NO DEBE RESPONDER, TERMINAR SILENCIOSAMENTE
        if (!analysis.shouldRespond) {
            console.log(`🔇 [MIDDLEWARE] No debe responder: ${analysis.reason}`);
            return endFlow();
        }
        
        // ✅ CONTINUAR AL SIGUIENTE HANDLER
        console.log(`➡️ [MIDDLEWARE] Pasando al siguiente handler`);
        return next();
        
    } catch (error) {
        console.error('❌ [MIDDLEWARE] Error en middleware contextual:', error);
        // En caso de error, permitir continuar por seguridad
        return next();
    }
};

// ✅ MIDDLEWARE ESPECÍFICO PARA FLUJOS DE DATOS
export const dataCollectionMiddleware = async (ctx: any, { endFlow, flowDynamic }: any, next: any) => {
    try {
        console.log(`📋 [DATA MIDDLEWARE] Verificando contexto de recolección de datos`);
        
        const analysis = await contextAnalyzer.analyzeContext(ctx.from, ctx.body, 'datosCliente');
        
        // ✅ VERIFICAR SI EL MENSAJE ES RELEVANTE PARA RECOLECCIÓN DE DATOS
        if (analysis.currentContext === 'collecting_customer_data' || 
            analysis.currentContext === 'datosCliente') {
            
            if (analysis.suggestedAction === 'continue') {
                console.log(`✅ [DATA MIDDLEWARE] Mensaje relevante para recolección de datos`);
                return next();
            }
        }
        
        // ✅ SI NO ES RELEVANTE, NO PROCESAR
        if (analysis.suggestedAction === 'ignore') {
            console.log(`🚫 [DATA MIDDLEWARE] Mensaje no relevante para recolección de datos`);
            return endFlow();
        }
        
        return next();
        
    } catch (error) {
        console.error('❌ [DATA MIDDLEWARE] Error:', error);
        return next();
    }
};

// ✅ MIDDLEWARE PARA FLUJOS DE CAPACIDAD
export const capacityMiddleware = async (ctx: any, { endFlow }: any, next: any) => {
    try {
        console.log(`💾 [CAPACITY MIDDLEWARE] Verificando contexto de capacidad`);
        
        const message = ctx.body.toLowerCase().trim();
        const isCapacityRelated = /\d{1,3}\s?(gb|gigas?)?|capacidad|tamaño|espacio|grande|pequeña|mediana/i.test(message);
        
        if (!isCapacityRelated) {
            const analysis = await contextAnalyzer.analyzeContext(ctx.from, ctx.body);
            if (analysis.suggestedAction === 'ignore') {
                console.log(`🚫 [CAPACITY MIDDLEWARE] Mensaje no relacionado con capacidad`);
                return endFlow();
            }
        }
        
        return next();
        
    } catch (error) {
        console.error('❌ [CAPACITY MIDDLEWARE] Error:', error);
        return next();
    }
};
