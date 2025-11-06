// src/services/contextAnalyzer.ts
import { getUserSession, updateUserSession } from '../flows/userTrackingSystem';

export interface ContextAnalysis {
    shouldRespond: boolean;
    currentContext: string;
    suggestedAction: 'continue' | 'redirect' | 'ignore' | 'respond';
    reason: string;
    confidence: number;
    metadata?: any;
}

export class ContextAnalyzer {
    private static instance: ContextAnalyzer;
    
    // ✅ CONTEXTOS CRÍTICOS QUE NO DEBEN SER INTERRUMPIDOS
    private static readonly CRITICAL_CONTEXTS = [
        'order_processing',
        'collecting_customer_data',
        'payment_processing',
        'shipping_details',
        'order_confirmation',
        'active_purchase',
        'completing_order',
        'data_collection',
        'datosCliente',
        'orderFlow',
        'capacityMusic',
        'capacityVideo',
        'customUsb'
    ];

    // ✅ FLUJOS QUE REQUIEREN CONTINUIDAD
    private static readonly CONTINUOUS_FLOWS = [
        'datosCliente',
        'orderFlow',
        'capacityMusic',
        'capacityVideo',
        'customUsb',
        'payment_flow',
        'shipping_flow',
        'musicUsb',
        'videoUsb',
        'moviesUsb'
    ];

    // ✅ PALABRAS CLAVE QUE INDICAN CONTEXTO ACTIVO
    private static readonly CONTEXT_KEYWORDS = {
        order_active: [
            'pedido', 'orden', 'compra', 'datos', 'nombre', 'dirección', 'direccion',
            'teléfono', 'telefono', 'email', 'pago', 'transferencia', 'efectivo',
            'nequi', 'daviplata', 'tarjeta', 'confirmar', 'completar', 'procesar'
        ],
        music_selection: [
            'género', 'genero', 'artista', 'canción', 'cancion', 'playlist',
            'personalizar', 'agregar', 'quitar', 'cambiar', 'música', 'musica'
        ],
        capacity_selection: [
            'gb', 'gigas', 'capacidad', 'tamaño', 'espacio', '32gb', '64gb', '128gb',
            '32', '64', '128', 'grande', 'pequeña', 'mediana'
        ],
        shipping_active: [
            'envío', 'envio', 'entrega', 'domicilio', 'dirección', 'direccion',
            'ciudad', 'barrio', 'referencia', 'casa', 'apartamento'
        ],
        personal_data: [
            'mi nombre es', 'me llamo', 'soy', 'mi número', 'mi teléfono',
            'mi email', 'mi correo', 'vivo en', 'mi dirección'
        ]
    };

    // ✅ PATRONES DE RESPUESTAS ESPECÍFICAS
    private static readonly RESPONSE_PATTERNS = [
        /^[A-Za-zÀ-ÿ\s]{2,50}$/,  // Nombre completo
        /^\+?[\d\s\-\(\)]{7,15}$/, // Teléfono
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Email
        /^[A-Za-z0-9À-ÿ\s\#\-\,\.]{10,200}$/, // Dirección
        /^\d{1,3}\s?(gb|gigas?)$/i, // Capacidad
        /^(si|sí|no|ok|vale|perfecto|correcto)$/i // Confirmaciones
    ];

    static getInstance(): ContextAnalyzer {
        if (!ContextAnalyzer.instance) {
            ContextAnalyzer.instance = new ContextAnalyzer();
        }
        return ContextAnalyzer.instance;
    }

    async analyzeContext(phoneNumber: string, message: string, currentFlow?: string): Promise<ContextAnalysis> {
        try {
            console.log(`🔍 [CONTEXT ANALYZER] Analizando contexto para ${phoneNumber}`);
            console.log(`📝 Mensaje: "${message}"`);
            console.log(`🌊 Flujo actual: ${currentFlow}`);

            // ✅ OBTENER SESIÓN ACTUAL
            const session = await getUserSession(phoneNumber);
            if (!session) {
                console.log(`👤 Usuario nuevo sin sesión previa`);
                return this.createAnalysisResponse(true, 'new_user', 'respond', 'Usuario nuevo sin contexto', 90);
            }

            console.log(`📊 Sesión encontrada:`, {
                currentFlow: session.currentFlow,
                stage: session.stage,
                lastInteraction: session.lastInteraction,
                conversationData: session.conversationData
            });

            // ✅ VERIFICAR CONTEXTO CRÍTICO
            const criticalCheck = this.isCriticalContext(session, message);
            if (criticalCheck.critical) {
                console.log(`🚨 CONTEXTO CRÍTICO DETECTADO: ${criticalCheck.context}`);
                
                // Si el mensaje es relevante al contexto crítico, permitir continuar
                if (this.isMessageRelevantToCriticalContext(message, criticalCheck.context)) {
                    console.log(`✅ Mensaje relevante al contexto crítico, permitiendo continuar`);
                    return this.createAnalysisResponse(false, criticalCheck.context, 'continue', 
                        `Continuando en contexto crítico: ${criticalCheck.context}`, 95);
                } else {
                    console.log(`🚫 Mensaje NO relevante al contexto crítico, bloqueando`);
                    return this.createAnalysisResponse(false, criticalCheck.context, 'ignore', 
                        `Mensaje irrelevante en contexto crítico: ${criticalCheck.context}`, 90);
                }
            }

            // ✅ VERIFICAR FLUJO CONTINUO
            const continuousCheck = this.isContinuousFlow(session, currentFlow);
            if (continuousCheck.continuous) {
                console.log(`🔄 FLUJO CONTINUO DETECTADO: ${continuousCheck.flow}`);
                
                const relevance = this.isMessageRelevantToFlow(message, continuousCheck.flow);
                if (!relevance.relevant) {
                    console.log(`🚫 Mensaje no relevante al flujo continuo`);
                    return this.createAnalysisResponse(false, continuousCheck.flow, 'ignore', 
                        `Mensaje no relevante al flujo: ${continuousCheck.flow}`, 85);
                }
            }

            // ✅ VERIFICAR TIEMPO DE ÚLTIMA INTERACCIÓN
            const timeSinceLastInteraction = this.getTimeSinceLastInteraction(session);
            console.log(`⏰ Tiempo desde última interacción: ${timeSinceLastInteraction} segundos`);
            
            if (timeSinceLastInteraction < 60) { // Menos de 1 minuto
                const lastContext = this.getLastContextFromSession(session);
                if (lastContext && ContextAnalyzer.CRITICAL_CONTEXTS.includes(lastContext)) {
                    console.log(`⚡ Interacción reciente en contexto crítico: ${lastContext}`);
                    
                    // Verificar si es una respuesta esperada
                    if (this.isExpectedResponse(message, session)) {
                        return this.createAnalysisResponse(false, lastContext, 'continue', 
                            `Respuesta esperada en contexto: ${lastContext}`, 95);
                    }
                }
            }

            // ✅ ANÁLISIS DE INTENCIÓN DEL MENSAJE
            const messageIntent = this.analyzeMessageIntent(message, session);
            console.log(`🎯 Intención del mensaje:`, messageIntent);

            // ✅ VERIFICAR SI ES RESPUESTA A PREGUNTA ESPECÍFICA
            const questionCheck = this.isAnsweringSpecificQuestion(message, session);
            if (questionCheck.answering) {
                console.log(`❓ Usuario respondiendo pregunta específica: ${questionCheck.question}`);
                return this.createAnalysisResponse(false, questionCheck.context, 'continue', 
                    `Respondiendo pregunta específica: ${questionCheck.question}`, 95);
            }

            // ✅ VERIFICAR COMANDOS DE NAVEGACIÓN
            const navigationCommand = this.isNavigationCommand(message);
            if (navigationCommand.isCommand) {
                console.log(`🧭 Comando de navegación detectado: ${navigationCommand.command}`);
                return this.createAnalysisResponse(true, 'navigation', 'redirect', 
                    `Comando de navegación: ${navigationCommand.command}`, 90);
            }

            // ✅ DECISIÓN FINAL
            console.log(`✅ Permitiendo respuesta normal`);
            return this.createAnalysisResponse(true, session.currentFlow || 'general', 
                messageIntent.shouldRedirect ? 'redirect' : 'respond', messageIntent.reason, messageIntent.confidence);

        } catch (error) {
            console.error('❌ Error analizando contexto:', error);
            return this.createAnalysisResponse(true, 'error', 'respond', 
                'Error en análisis, permitir respuesta por seguridad', 30);
        }
    }

    private createAnalysisResponse(shouldRespond: boolean, context: string, action: string, reason: string, confidence: number): ContextAnalysis {
        return {
            shouldRespond,
            currentContext: context,
            suggestedAction: action as any,
            reason,
            confidence,
            metadata: {
                timestamp: new Date().toISOString(),
                analyzer_version: '1.0'
            }
        };
    }

    private isCriticalContext(session: any, message: string): { critical: boolean; context: string } {
        // ✅ VERIFICAR STAGE CRÍTICO
        if (session.stage && ContextAnalyzer.CRITICAL_CONTEXTS.includes(session.stage)) {
            return { critical: true, context: session.stage };
        }

        // ✅ VERIFICAR FLUJO CRÍTICO
        if (session.currentFlow && ContextAnalyzer.CONTINUOUS_FLOWS.includes(session.currentFlow)) {
            return { critical: true, context: session.currentFlow };
        }

        // ✅ VERIFICAR METADATA DE SESIÓN
        if (session.conversationData?.metadata) {
            const metadata = session.conversationData.metadata;
            if (metadata.isProcessing || metadata.collectingData || metadata.activeOrder) {
                return { critical: true, context: 'data_processing' };
            }
        }

        // ✅ VERIFICAR ÚLTIMA PREGUNTA HECHA
        if (session.lastMessage) {
            const lastMsg = session.lastMessage.toLowerCase();
            const criticalQuestions = [
                'nombre completo', 'dirección', 'direccion', 'teléfono', 'telefono',
                'método de pago', 'metodo de pago', 'qué género', 'que genero',
                'qué capacidad', 'que capacidad', 'confirmar pedido'
            ];
            
            if (criticalQuestions.some(q => lastMsg.includes(q))) {
                return { critical: true, context: 'collecting_customer_data' };
            }
        }

        // ✅ VERIFICAR PATRONES EN CONVERSACIÓN RECIENTE
        if (session.conversationData?.recentMessages) {
            const recentMessages = session.conversationData.recentMessages.slice(-3);
            const hasOrderKeywords = recentMessages.some((msg: any) => 
                ContextAnalyzer.CONTEXT_KEYWORDS.order_active.some(keyword => 
                    msg.content?.toLowerCase().includes(keyword)
                )
            );
            
            if (hasOrderKeywords) {
                return { critical: true, context: 'active_order_context' };
            }
        }

        return { critical: false, context: 'none' };
    }

    private isMessageRelevantToCriticalContext(message: string, context: string): boolean {
        const lowerMessage = message.toLowerCase().trim();
        
        switch (context) {
            case 'collecting_customer_data':
            case 'datosCliente':
                return this.isPersonalDataResponse(message) || 
                       ContextAnalyzer.CONTEXT_KEYWORDS.order_active.some(keyword => lowerMessage.includes(keyword));
                       
            case 'capacityMusic':
            case 'capacityVideo':
                return ContextAnalyzer.CONTEXT_KEYWORDS.capacity_selection.some(keyword => lowerMessage.includes(keyword)) ||
                       /^\d{1,3}\s?(gb|gigas?)?$/i.test(lowerMessage);
                       
            case 'musicUsb':
                return ContextAnalyzer.CONTEXT_KEYWORDS.music_selection.some(keyword => lowerMessage.includes(keyword)) ||
                       ContextAnalyzer.CONTEXT_KEYWORDS.capacity_selection.some(keyword => lowerMessage.includes(keyword));
                       
            case 'data_processing':
            case 'active_order_context':
                return ContextAnalyzer.CONTEXT_KEYWORDS.order_active.some(keyword => lowerMessage.includes(keyword)) ||
                       this.isPersonalDataResponse(message);
                       
            default:
                return true; // Por defecto, permitir en contextos desconocidos
        }
    }

    private isContinuousFlow(session: any, currentFlow?: string): { continuous: boolean; flow: string } {
        const flow = currentFlow || session.currentFlow;
        
        if (flow && ContextAnalyzer.CONTINUOUS_FLOWS.includes(flow)) {
            return { continuous: true, flow };
        }

        return { continuous: false, flow: 'none' };
    }

    private isMessageRelevantToFlow(message: string, flow: string): { relevant: boolean; reason: string } {
        const lowerMessage = message.toLowerCase().trim();
        
        switch (flow) {
            case 'datosCliente':
            case 'orderFlow':
                const isOrderRelevant = ContextAnalyzer.CONTEXT_KEYWORDS.order_active.some(keyword => 
                    lowerMessage.includes(keyword)
                ) || this.isPersonalDataResponse(message);
                
                return {
                    relevant: isOrderRelevant,
                    reason: isOrderRelevant ? 'Mensaje relevante para datos de cliente' : 'No es información de cliente'
                };
                
            case 'capacityMusic':
            case 'musicUsb':
                const isMusicRelevant = ContextAnalyzer.CONTEXT_KEYWORDS.music_selection.some(keyword => 
                    lowerMessage.includes(keyword)
                ) || ContextAnalyzer.CONTEXT_KEYWORDS.capacity_selection.some(keyword => 
                    lowerMessage.includes(keyword)
                );
                
                return {
                    relevant: isMusicRelevant,
                    reason: isMusicRelevant ? 'Mensaje relevante para música/capacidad' : 'No relacionado con música'
                };
                
            case 'capacityVideo':
            case 'videoUsb':
                const isVideoRelevant = lowerMessage.includes('video') || 
                                       lowerMessage.includes('película') ||
                                       ContextAnalyzer.CONTEXT_KEYWORDS.capacity_selection.some(keyword => 
                                           lowerMessage.includes(keyword)
                                       );
                
                return {
                    relevant: isVideoRelevant,
                    reason: isVideoRelevant ? 'Mensaje relevante para videos' : 'No relacionado con videos'
                };
                
            default:
                return { relevant: true, reason: 'Flujo no específico, permitir' };
        }
    }

    private isPersonalDataResponse(message: string): boolean {
        const trimmedMessage = message.trim();
        
        // ✅ VERIFICAR PATRONES DE DATOS PERSONALES
        return ContextAnalyzer.RESPONSE_PATTERNS.some(pattern => pattern.test(trimmedMessage)) ||
               ContextAnalyzer.CONTEXT_KEYWORDS.personal_data.some(keyword => 
                   message.toLowerCase().includes(keyword)
               );
    }

    private getTimeSinceLastInteraction(session: any): number {
        if (!session.lastInteraction) return 999;
        
        try {
            const lastTime = new Date(session.lastInteraction).getTime();
            const now = new Date().getTime();
            return Math.floor((now - lastTime) / 1000); // En segundos
        } catch (error) {
            console.error('Error calculando tiempo de última interacción:', error);
            return 999;
        }
    }

    private getLastContextFromSession(session: any): string | null {
        return session.conversationData?.lastContext || 
               session.stage || 
               session.currentFlow || 
               null;
    }

    private analyzeMessageIntent(message: string, session: any): {
        shouldRedirect: boolean;
        reason: string;
        confidence: number;
    } {
        const lowerMessage = message.toLowerCase().trim();
        
        // ✅ INTENCIONES CLARAS DE REDIRECCIÓN
        if (lowerMessage.includes('música') || lowerMessage.includes('musica')) {
            return {
                shouldRedirect: true,
                reason: 'Usuario solicita información sobre música',
                confidence: 90
            };
        }
        
        if (lowerMessage.includes('video') || lowerMessage.includes('película') || lowerMessage.includes('pelicula')) {
            return {
                shouldRedirect: true,
                reason: 'Usuario solicita información sobre videos',
                confidence: 90
            };
        }
        
        if (lowerMessage.includes('precio') || lowerMessage.includes('costo') || lowerMessage.includes('valor')) {
            return {
                shouldRedirect: true,
                reason: 'Usuario solicita información de precios',
                confidence: 85
            };
        }

        if (lowerMessage.includes('catálogo') || lowerMessage.includes('catalogo') || lowerMessage.includes('opciones')) {
            return {
                shouldRedirect: true,
                reason: 'Usuario solicita ver catálogo',
                confidence: 85
            };
        }
        
        return {
            shouldRedirect: false,
            reason: 'Mensaje general sin intención específica de redirección',
            confidence: 60
        };
    }

    private isAnsweringSpecificQuestion(message: string, session: any): {
        answering: boolean;
        context: string;
        question: string;
    } {
        if (!session.lastMessage) {
            return { answering: false, context: 'none', question: 'none' };
        }
        
        const lastMsg = session.lastMessage.toLowerCase();
        
        // ✅ DETECTAR PREGUNTAS ESPECÍFICAS Y SUS RESPUESTAS
        const questionPatterns = [
            { 
                pattern: /nombre completo/i, 
                context: 'collecting_name',
                responsePattern: /^[A-Za-zÀ-ÿ\s]{2,50}$/
            },
            { 
                pattern: /número de teléfono|telefono/i, 
                context: 'collecting_phone',
                responsePattern: /^\+?[\d\s\-\(\)]{7,15}$/
            },
            { 
                pattern: /dirección|direccion/i, 
                context: 'collecting_address',
                responsePattern: /^[A-Za-z0-9À-ÿ\s\#\-\,\.]{5,200}$/
            },
            { 
                pattern: /método de pago|metodo de pago/i, 
                context: 'collecting_payment',
                responsePattern: /transferencia|nequi|daviplata|efectivo|tarjeta/i
            },
            { 
                pattern: /qué género|que genero|género musical|genero musical/i, 
                context: 'collecting_music_preference',
                responsePattern: /.+/
            },
            { 
                pattern: /qué capacidad|que capacidad|cuántos gb|cuantos gb/i, 
                context: 'collecting_capacity',
                responsePattern: /\d{1,3}\s?(gb|gigas?)?/i
            }
        ];
        
        for (const question of questionPatterns) {
            if (question.pattern.test(lastMsg)) {
                const isValidResponse = question.responsePattern.test(message.trim());
                if (isValidResponse) {
                    return {
                        answering: true,
                        context: question.context,
                        question: lastMsg
                    };
                }
            }
        }
        
        return { answering: false, context: 'none', question: 'none' };
    }

    private isExpectedResponse(message: string, session: any): boolean {
        if (!session.lastMessage) return false;
        
        const lastMsg = session.lastMessage.toLowerCase();
        const currentMsg = message.toLowerCase().trim();
        
        // ✅ RESPUESTAS ESPERADAS SEGÚN EL ÚLTIMO MENSAJE
        const expectedResponses = [
            { trigger: /nombre completo/i, response: /^[A-Za-zÀ-ÿ\s]{2,50}$/ },
            { trigger: /teléfono|telefono/i, response: /^\+?[\d\s\-\(\)]{7,15}$/ },
            { trigger: /dirección|direccion/i, response: /^[A-Za-z0-9À-ÿ\s\#\-\,\.]{5,200}$/ },
            { trigger: /capacidad|gb/i, response: /\d{1,3}\s?(gb|gigas?)?/i },
            { trigger: /confirmar|correcto/i, response: /^(si|sí|no|ok|correcto|incorrecto)$/i }
        ];
        
        return expectedResponses.some(expected => 
            expected.trigger.test(lastMsg) && expected.response.test(message)
        );
    }

    private isNavigationCommand(message: string): { isCommand: boolean; command: string } {
        const lowerMessage = message.toLowerCase().trim();
        
        const navigationCommands = [
            { patterns: ['menu', 'inicio', 'volver', 'regresar'], command: 'menu' },
            { patterns: ['catálogo', 'catalogo', 'ver opciones', 'opciones'], command: 'catalog' },
            { patterns: ['ayuda', 'help', 'soporte'], command: 'help' },
            { patterns: ['cancelar', 'salir', 'terminar'], command: 'cancel' }
        ];
        
        for (const navCommand of navigationCommands) {
            if (navCommand.patterns.some(pattern => lowerMessage.includes(pattern))) {
                return { isCommand: true, command: navCommand.command };
            }
        }
        
        return { isCommand: false, command: 'none' };
    }

    // ✅ MÉTODO PÚBLICO PARA MARCAR CONTEXTO CRÍTICO
    async markCriticalContext(phoneNumber: string, context: string, metadata?: any): Promise<void> {
    try {
        await updateUserSession(phoneNumber, `[CONTEXT_MARKED]`, context, JSON.stringify({
            isCriticalContext: true,
            contextMarkedAt: new Date().toISOString(),
            metadata: metadata || {}
        }));
        console.log(`🔒 Contexto crítico marcado para ${phoneNumber}: ${context}`);
    } catch (error) {
        console.error('❌ Error marcando contexto crítico:', error);
    }
}

// ✅ MÉTODO PÚBLICO PARA LIMPIAR CONTEXTO CRÍTICO
    async clearCriticalContext(phoneNumber: string): Promise<void> {
        try {
            await updateUserSession(phoneNumber, `[CONTEXT_CLEARED]`, 'general', JSON.stringify({
                isCriticalContext: false,
                contextClearedAt: new Date().toISOString()
            }));
            console.log(`🔓 Contexto crítico limpiado para ${phoneNumber}`);
        } catch (error) {
            console.error('❌ Error limpiando contexto crítico:', error);
        }
    }
}

export const contextAnalyzer = ContextAnalyzer.getInstance();
