// src/flows/customizationFlow.ts
import { addKeyword } from '@builderbot/bot';
import { getUserSession, updateUserSession, ExtendedContext } from './userTrackingSystem';
import { OrderValidator } from '../core/OrderValidator';

// ✅ CORREGIR: Crear clase helper en lugar de métodos en el flow
class CustomizationHelper {
    static async analyzeAndConfirmOrder(ctx: ExtendedContext, userPreferences: any, flowDynamic: any) {
        const validation = OrderValidator.validateOrder({
            customer: { phone: ctx.from, name: ctx.name },
            preferences: userPreferences
        });

        if (!validation.isValid) {
            await flowDynamic([
                '⚠️ *Necesito aclarar algunas cosas:*',
                ...validation.errors.map(error => `• ${error}`),
                '',
                '¿Podrías proporcionarme esta información?'
            ]);
            return false;
        }

        if (validation.warnings.length > 0) {
            await flowDynamic([
                '📋 *Resumen de tu pedido:*',
                `• Géneros: ${userPreferences.genres.join(', ')}`,
                `• Artistas: ${userPreferences.artists.join(', ')}`,
                `• Organización: ${userPreferences.organization}`,
                '',
                '⚠️ *Aviso importante:*',
                ...validation.warnings.map(warning => `• ${warning}`),
                '',
                '¿Confirmamos el pedido con esta configuración?'
            ]);
        }

        return true;
    }

    static async startCustomizationProcess(ctx: ExtendedContext, flowDynamic: any) {
        const name = ctx.name || ctx.pushName || 'amigo';
        
        const message = `🎵 **PASO 1: Personalización Musical**

¡Perfecto ${name}! Vamos a empezar con tu música.

🎶 **Cuéntame tus gustos:**
• Tus 3 géneros favoritos
• Artistas que escuchas
• Canciones favoritas
• Ocasión especial o mood

💡 **Ejemplos:**
"Reggaeton, pop y baladas. Bad Bunny, Karol G, Mau y Ricky"
"Rock clásico. Pink Floyd, Radiohead, Arctic Monkeys"
"Música para relajarme: jazz, bossa nova, instrumental"

🎵 **¡Cuéntame sobre tu música ideal!**`;

        await flowDynamic([message]);

        // ✅ CORREGIR: Usar updateUserSession con parámetros correctos
        await updateUserSession(
            ctx.from,
            ctx.body,
            'customization_started',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'customization_start',
                confidence: 0.9,
                metadata: {
                    detectionType: 'customization_flow',
                    originalMessage: ctx.body,
                    userName: ctx.name || ctx.pushName
                }
            }
        );
    }

    static async showInspirationExamples(ctx: ExtendedContext, flowDynamic: any) {
        await flowDynamic([
            `💡 **Galería de Inspiración - USBs Personalizadas Reales**`,
            ``,
            `🎵 **Ejemplo 1: "USB Romántica"**`,
            `• Música: Baladas, pop romántico, canciones de amor`,
            `• Diseño: Colores rosados y dorados con corazones`,
            `• Capacidad: 32GB`,
            `• Uso: Regalo de aniversario`,
            `• Precio: $89.900`,
            ``,
            `🔥 **Ejemplo 2: "USB Fiesta Urbana"**`,
            `• Música: Reggaeton, trap, música urbana`,
            `• Diseño: Neón, colores vibrantes, estilo street`,
            `• Capacidad: 64GB`,
            `• Uso: Fiestas y reuniones`,
            `• Precio: $129.900`,
            ``,
            `🎸 **Ejemplo 3: "USB Rock Clásico"**`,
            `• Música: Rock de los 70s, 80s, 90s`,
            `• Diseño: Negro mate con grabado láser de guitarra`,
            `• Capacidad: 64GB`,
            `• Uso: Colección personal`,
            `• Precio: $129.900`,
            ``,
            `🏋️ **Ejemplo 4: "USB Workout"**`,
            `• Música: EDM, música electrónica, beats motivacionales`,
            `• Diseño: Colores energéticos, formas deportivas`,
            `• Capacidad: 32GB`,
            `• Uso: Gimnasio y ejercicio`,
            `• Precio: $89.900`,
            ``,
            `🎭 **Ejemplo 5: "USB Nostálgica"**`,
            `• Música: Clásicos de los 80s y 90s`,
            `• Diseño: Estilo retro, colores pastel`,
            `• Capacidad: 64GB`,
            `• Uso: Recuerdos y nostalgia`,
            `• Precio: $129.900`,
            ``,
            `🌟 **Ejemplo 6: "USB Ejecutiva"**`,
            `• Música: Jazz, música instrumental, clásicos`,
            `• Diseño: Elegante, minimalista, acabado premium`,
            `• Capacidad: 128GB`,
            `• Uso: Profesional y personal`,
            `• Precio: $169.900`,
            ``,
            `💬 **¿Te inspiró algún ejemplo?**`,
            `Puedes decirme "me gusta el ejemplo X" o contarme tu propia idea única.`,
            ``,
            `🎯 **O escribe "empezar" para crear la tuya desde cero**`
        ]);
    }

    static async showCustomizationPricing(ctx: ExtendedContext, flowDynamic: any) {
        const message = `💰 **Precios de Personalización TechAura**

🎵 **Base Musical:** GRATIS ✅
🎨 **Visual:** Básico GRATIS | 3D +$10.000 | Láser +$15.000
💾 **Capacidad:** 16GB base | 32GB +$19k | 64GB +$36k | 128GB +$59k
📦 **Accesorios:** Estuche GRATIS | Personalizado +$8k
🚀 **Especiales:** Playlist experto +$10k | Express 24h +$12k

🎁 **Paquetes:**
💚 Básico: $69.900 (8GB + diseño + música)
🧡 Premium: $99.900 (32GB + 3D + playlist + estuche)
❤️ VIP: $139.900 (64GB + premium + kit completo)
💜 Ultra: $179.900 (128GB + holográfico + VIP)

⚡ **PROMO ACTUAL:** Diseño + Envío + Consulta GRATIS (valor $33k)

💬 **¿Paquete o personalizar desde cero?**`;

        await flowDynamic([message]);
    }

    static async startExpressCustomization(ctx: ExtendedContext, flowDynamic: any) {
        const message = `⚡ **PERSONALIZACIÓN EXPRESS - ¡Lista en 24h!**

🚀 **3 pasos rápidos:**

**PASO 1:** Elige
• A) USB 32GB + Diseño 3D = $89.900
• B) USB 64GB + Premium = $129.000

**PASO 2:** Dime en 1 frase: estilo musical, colores, regalo/personal

**PASO 3:** ¡Listo! Nosotros hacemos el resto. Fotos en 2h, entrega en 24h.

🎯 Ejemplo: "B, reggaeton y pop, azul y negro, para mí"

🔥 BONUS: Envío GRATIS + Playlist experto + Garantía

💬 **¿Opción A o B y tu estilo?**`;

        await flowDynamic([message]);

        await updateUserSession(
            ctx.from,
            ctx.body,
            'express_customization', 
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'express_flow',
                confidence: 0.85,
                metadata: {
                    detectionType: 'express_selection',
                    originalMessage: ctx.body
                }
            }
        );
    }

    static async processCustomizationStep(currentStep: number | string, ctx: ExtendedContext, flowDynamic: any, gotoFlow: any) {
        switch (currentStep) {
            case 1:
                return await this.processMusicStep(ctx, flowDynamic);
            case 2:
                return await this.processDesignStep(ctx, flowDynamic);
            case 3:
                return await this.processTechnicalStep(ctx, flowDynamic);
            case 4:
                return await this.processAccessoriesStep(ctx, flowDynamic);
            case 5:
                return await this.processFinalStep(ctx, flowDynamic, gotoFlow);
            case 'express':
                return await this.processExpressStep(ctx, flowDynamic, gotoFlow);
            default:
                return await this.startCustomizationProcess(ctx, flowDynamic);
        }
    }

    static async processMusicStep(ctx: ExtendedContext, flowDynamic: any) {
        const userInput = ctx.body;
        const musicAnalysis = this.analyzeMusicPreferences(userInput);
        
        await flowDynamic([
            `🎵 **¡Excelente selección musical!**`,
            ``,
            `📝 **He detectado que te gusta:**`,
            ...musicAnalysis.detectedGenres.map(genre => `• ${genre}`),
            ``,
            `🎯 **Basándome en tus gustos, te propongo:**`,
            ``,
            `**Opción A: Playlist Curada Básica** (GRATIS)`,
            `• 50-80 canciones seleccionadas`,
            `• Organizadas por género y mood`,
            `• Calidad estándar MP3`,
            ``,
            `**Opción B: Playlist Profesional** (+$10.000)`,
            `• 100-150 canciones expertamente curadas`,
            `• Organización avanzada con transiciones`,
            `• Calidad premium + canciones exclusivas`,
            `• Actualizaciones trimestrales gratis`,
            ``,
            `**Opción C: Biblioteca Musical Completa** (+$25.000)`,
            `• 300-500 canciones de tus géneros`,
            `• Múltiples playlists temáticas`,
            `• Calidad audiófilo + contenido exclusivo`,
            `• Actualizaciones mensuales de por vida`,
            ``,
            `🎶 **Recomendación para ti:** ${musicAnalysis.recommendation}`,
            ``,
            `💬 **¿Cuál opción musical prefieres? (A, B o C)**`
        ]);

        await updateUserSession(
            ctx.from,
            ctx.body,
            'music_preferences',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'music_selection',
                confidence: 0.8,
                metadata: {
                    detectionType: 'music_analysis',
                    originalMessage: ctx.body,
                    analysis: CustomizationHelper.analyzeMusicPreferences(ctx.body)
                }
            }
        );
    }

    static async processDesignStep(ctx: ExtendedContext, flowDynamic: any) {
        const userInput = ctx.body.toLowerCase().trim();
        const musicChoice = userInput.includes('a') ? 'basic' : 
                           userInput.includes('b') ? 'professional' : 
                           userInput.includes('c') ? 'complete' : 'basic';

        await flowDynamic([
            `🎨 **PASO 2: Diseño Visual Personalizado**`,
            ``,
            `¡Perfecto! Ahora vamos a crear el diseño visual de tu USB.`,
            ``,
            `🎯 **Cuéntame sobre el diseño que imaginas:**`,
            ``,
            `🌈 **Colores:**`,
            `• ¿Tienes colores favoritos?`,
            `• ¿Prefieres colores vibrantes o sutiles?`,
            `• ¿Alguna combinación específica?`,
            ``,
            `🎨 **Estilo:**`,
            `• Minimalista y elegante`,
            `• Colorido y llamativo`,
            `• Temático (deportes, música, arte, etc.)`,
            `• Profesional y sobrio`,
            ``,
            `✨ **Elementos especiales:**`,
            `• ¿Quieres incluir tu nombre?`,
            `• ¿Algún logo o símbolo?`,
            `• ¿Frases o texto especial?`,
            `• ¿Imágenes específicas?`,
            ``,
            `💡 **Ejemplos de respuestas:**`,
            `"Colores azul y negro, estilo minimalista, con mi nombre 'Ana' y una nota musical"`,
            ``,
            `"Colores vibrantes como rosa y dorado, estilo llamativo, que diga 'Music Lover'"`,
            ``,
            `"Estilo profesional en gris y plateado, solo con mis iniciales 'JR'"`,
            ``,
            `🎨 **¡Describe tu diseño ideal!**`
        ]);

        await updateUserSession(
            ctx.from,
            ctx.body,
            'design_preferences',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'design_selection',
                confidence: 0.85,
                metadata: {
                    detectionType: 'design_analysis',
                    originalMessage: ctx.body,
                    analysis: CustomizationHelper.analyzeDesignPreferences(ctx.body)
                }
            }
        );
    }

    static async processTechnicalStep(ctx: ExtendedContext, flowDynamic: any) {
        const userInput = ctx.body;
        const designAnalysis = this.analyzeDesignPreferences(userInput);
        
        await flowDynamic([
            `💾 **PASO 3: Especificaciones Técnicas**`,
            ``,
            `🎨 **Tu diseño suena increíble!** He tomado nota de:`,
            `• Colores: ${designAnalysis.colors.join(', ')}`,
            `• Estilo: ${designAnalysis.style}`,
            `• Elementos: ${designAnalysis.elements.join(', ')}`,
            ``,
            `⚙️ **Ahora elige las especificaciones técnicas:**`,
            ``,
            `💾 **Capacidad de Almacenamiento:**`,
            ``,
            `**A) 16GB** - Precio base`,
            `• Aproximadamente 4,000 canciones`,
            `• Ideal para uso básico`,
            `• Perfecto para playlists específicas`,
            ``,
            `**B) 32GB** - +$19.000`,
            `• Aproximadamente 8,000 canciones`,
            `• Opción más popular`,
            `• Espacio para múltiples géneros`,
            ``,
            `**C) 64GB** - +$36.000`,
            `• Aproximadamente 16,000 canciones`,
            `• Biblioteca musical completa`,
            `• Espacio para otros archivos`,
            ``,
            `**D) 128GB** - +$59.000`,
            `• Aproximadamente 32,000 canciones`,
            `• Máxima capacidad disponible`,
            `• Ideal para coleccionistas`,
            ``,
            `🔌 **Conectividad:**`,
            `• USB 3.0 estándar (incluido)`,
            `• USB-C adicional (+$5.000)`,
            `• Dual connector USB-A/USB-C (+$8.000)`,
            ``,
            `⚡ **Velocidad de Transferencia:**`,
            `• Estándar: 30-50 MB/s (incluido)`,
            `• Alta velocidad: 80-100 MB/s (+$10.000)`,
            `• Ultra rápida: 150+ MB/s (+$20.000)`,
            ``,
            `🎯 **Recomendación basada en tu perfil:**`,
            `Para tu estilo ${designAnalysis.style}, recomiendo la opción **${this.getTechnicalRecommendation(designAnalysis)}**`,
            ``,
            `💬 **¿Qué capacidad eliges? (A, B, C o D)**`,
            `**¿Y qué conectividad prefieres?**`
        ]);

        await updateUserSession(
            ctx.from,
            ctx.body,
            'technical_specs',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'tech_specs',
                confidence: 0.75,
                metadata: {
                    detectionType: 'tech_selection',
                    originalMessage: ctx.body,
                    specs: CustomizationHelper.parseTechnicalSpecs(ctx.body)
                }
            }
        );
    }

    static async processAccessoriesStep(ctx: ExtendedContext, flowDynamic: any) {
        const userInput = ctx.body;
        const techSpecs = this.parseTechnicalSpecs(userInput);
        
        await flowDynamic([
            `📦 **PASO 4: Accesorios y Extras**`,
            ``,
            `⚙️ **Especificaciones confirmadas:**`,
            `• Capacidad: ${techSpecs.capacity}`,
            `• Conectividad: ${techSpecs.connectivity}`,
            `• Velocidad: ${techSpecs.speed}`,
            ``,
            `🎁 **Ahora elige tus accesorios:**`,
            ``,
            `📱 **Estuche Protector:**`,
            ``,
            `**A) Estuche Básico** (GRATIS)`,
            `• Material resistente estándar`,
            `• Color negro básico`,
            `• Protección básica`,
            ``,
            `**B) Estuche Personalizado** (+$8.000)`,
            `• Mismo diseño que tu USB`,
            `• Colores y elementos personalizados`,
            `• Material premium`,
            ``,
            `**C) Estuche de Lujo** (+$15.000)`,
            `• Cuero sintético premium`,
            `• Diseño elegante personalizado`,
            `• Compartimentos adicionales`,
            ``,
            `🔌 **Cables y Conectores:**`,
            ``,
            `**D) Solo USB estándar** (INCLUIDO)`,
            `• Cable USB básico`,
            ``,
            `**E) Kit de Conectividad** (+$12.000)`,
            `• Cable USB-A a USB-C`,
            `• Adaptador OTG para móviles`,
            `• Cable de extensión`,
            ``,
            `🎵 **Servicios Adicionales:**`,
            ``,
            `**F) Consulta Musical Personalizada** (+$15.000)`,
            `• Sesión 1-a-1 con experto musical`,
            `• Playlist ultra-personalizada`,
            `• Recomendaciones exclusivas`,
            ``,
            `**G) Servicio Express** (+$12.000)`,
            `• Producción en 24 horas`,
            `• Entrega prioritaria`,
            `• Seguimiento en tiempo real`,
            ``,
            `**H) Garantía Extendida** (+$10.000)`,
            `• 3 años de garantía total`,
            `• Soporte técnico premium`,
            `• Reemplazo inmediato`,
            ``,
            `💡 **Paquetes Recomendados:**`,
            `• **Básico**: A + D = GRATIS`,
            `• **Completo**: B + E = +$20.000`,
            `• **Premium**: C + E + F + H = +$52.000`,
            ``,
            `💬 **¿Qué accesorios te interesan?**`,
            `Puedes elegir por letras (ej: "B, E, G") o decir "paquete completo"`
        ]);

        await updateUserSession(
            ctx.from,
            ctx.body,
            'accessories_selected',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'accessories_selection',
                confidence: 0.7,
                metadata: {
                    detectionType: 'accessories_choice',
                    originalMessage: ctx.body,
                    accessories: CustomizationHelper.parseAccessories(ctx.body)
                }
            }
        );
    }

    static async processFinalStep(ctx: ExtendedContext, flowDynamic: any, gotoFlow: any) {
        const session = await getUserSession(ctx.from);
        const userInput = ctx.body;
        const accessories = this.parseAccessories(userInput);
        
        // ✅ CORREGIR: Usar campo 'customization' en lugar de 'customizationData'
        const totalPrice = this.calculateTotalPrice(session.customization?.preferences, accessories);
        const savings = this.calculateSavings(totalPrice);
        
        await flowDynamic([
            `🎉 **¡FELICIDADES! Tu USB Personalizada está Lista**`,
            ``,
            `📋 **RESUMEN DE TU PERSONALIZACIÓN:**`,
            ``,
            `🎵 **Contenido Musical:**`,
            `• ${this.getMusicSummary(session.customization?.preferences)}`,
            ``,
            `🎨 **Diseño Visual:**`,
            `• ${this.getDesignSummary(session.customization?.preferences)}`,
            ``,
            `💾 **Especificaciones:**`,
            `• ${this.getTechnicalSummary(session.customization?.preferences)}`,
            ``,
            `📦 **Accesorios:**`,
            `• ${accessories.summary}`,
            ``,
            `💰 **PRECIO TOTAL:**`,
            `• Precio regular: $${(totalPrice + savings).toLocaleString()}`,
            `• Descuentos aplicados: -$${savings.toLocaleString()}`,
            `• **TU PRECIO FINAL: $${totalPrice.toLocaleString()}** 🔥`,
            ``,
            `🎁 **INCLUIDO GRATIS:**`,
            `• Diseño personalizado (valor $15.000)`,
            `• Envío express a domicilio (valor $8.000)`,
            `• Garantía de satisfacción (valor $5.000)`,
            `• Soporte técnico (valor $10.000)`,
            ``,
            `⏰ **TIEMPO DE PRODUCCIÓN:**`,
            `• ${accessories.hasExpress ? '24-48 horas' : '3-5 días hábiles'}`,
            `• Te enviamos fotos del progreso`,
            `• Seguimiento en tiempo real`,
            ``,
            `🚀 **¿LISTO PARA HACER TU PEDIDO?**`,
            ``,
            `💬 **Escribe:**`,
            `• "**CONFIRMAR**" para proceder con el pedido`,
            `• "**MODIFICAR**" si quieres cambiar algo`,
            `• "**COTIZAR**" para recibir cotización formal`,
            `• O pregúntame cualquier duda`
        ]);

        await updateUserSession(
            ctx.from,
            ctx.body,
            'customization_complete',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'customization_final',
                confidence: 0.95,
                metadata: {
                    detectionType: 'flow_completion',
                    originalMessage: ctx.body,
                    timestamp: new Date().toISOString()
                }
            }
        );
    }

    static async processExpressStep(ctx: ExtendedContext, flowDynamic: any, gotoFlow: any) {
        const userInput = ctx.body;
        const expressAnalysis = this.parseExpressInput(userInput);
        
        if (!expressAnalysis.isValid) {
            await flowDynamic([
                `💡 **Necesito un poco más de información para el modo express:**`,
                ``,
                `🎯 **Por favor incluye:**`,
                `• Opción (A o B)`,
                `• Tu estilo musical`,
                `• Colores preferidos`,
                `• Si es regalo o personal`,
                ``,
                `📝 **Ejemplo completo:**`,
                `"Opción B, reggaeton y pop, azul y negro, para mí"`,
                ``,
                `💬 **Inténtalo de nuevo:**`
            ]);
            return;
        }

        const totalPrice = expressAnalysis.option === 'A' ? 89900 : 129000;
        
        await flowDynamic([
            `⚡ **¡PERSONALIZACIÓN EXPRESS CONFIRMADA!**`,
            ``,
            `🎯 **Tu selección:**`,
            `• Opción: ${expressAnalysis.option} (${expressAnalysis.option === 'A' ? '32GB' : '64GB'})`,
            `• Música: ${expressAnalysis.musicStyle}`,
            `• Colores: ${expressAnalysis.colors}`,
            `• Uso: ${expressAnalysis.usage}`,
            ``,
            `💰 **Precio Express: $${totalPrice.toLocaleString()}**`,
            ``,
            `🎁 **INCLUIDO:**`,
            `• Diseño personalizado automático`,
            `• Playlist curada por IA + experto`,
            `• Producción en 24 horas`,
            `• Envío express gratis`,
            `• Garantía completa`,
            ``,
            `⚡ **PROCESO EXPRESS:**`,
            `• ⏰ **2 horas**: Te enviamos preview del diseño`,
            `• ⏰ **12 horas**: Producción completada`,
            `• ⏰ **24 horas**: En camino a tu domicilio`,
            ``,
            `🚀 **¿CONFIRMAMOS TU PEDIDO EXPRESS?**`,
            ``,
            `💬 **Escribe "CONFIRMAR EXPRESS" para proceder**`,
            `**O "MODIFICAR" si quieres ajustar algo**`
        ]);

        await updateUserSession(
            ctx.from,
            ctx.body,
            'express_analysis',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'express_processing',
                confidence: 0.9,
                metadata: {
                    detectionType: 'express_analysis',
                    originalMessage: ctx.body,
                    analysis: CustomizationHelper.parseExpressInput(ctx.body)
                }
            }
        );
    }

    // ✅ MÉTODOS AUXILIARES CORREGIDOS
    static analyzeMusicPreferences(input: string) {
        const genres = ['reggaeton', 'pop', 'rock', 'jazz', 'electrónica', 'baladas', 'salsa', 'vallenato', 'trap', 'hip hop'];
        const detectedGenres = genres.filter(genre => 
            input.toLowerCase().includes(genre) || 
            input.toLowerCase().includes(genre.replace('ó', 'o'))
        );
        
        let recommendation = 'Opción B (Playlist Profesional)';
        if (detectedGenres.length >= 3) {
            recommendation = 'Opción C (Biblioteca Completa)';
        } else if (detectedGenres.length === 0) {
            recommendation = 'Opción A (Playlist Básica)';
        }
        
        return {
            detectedGenres: detectedGenres.length > 0 ? detectedGenres : ['Música variada'],
            recommendation,
            complexity: detectedGenres.length
        };
    }

    static analyzeDesignPreferences(input: string) {
        const colors: string[] = [];
        const colorKeywords = ['azul', 'rojo', 'verde', 'negro', 'blanco', 'dorado', 'plateado', 'rosa', 'morado', 'naranja'];
        colorKeywords.forEach(color => {
            if (input.toLowerCase().includes(color)) colors.push(color);
        });
        
        let style = 'moderno';
        if (input.toLowerCase().includes('minimalista')) style = 'minimalista';
        else if (input.toLowerCase().includes('llamativo') || input.toLowerCase().includes('vibrante')) style = 'vibrante';
        else if (input.toLowerCase().includes('profesional')) style = 'profesional';
        else if (input.toLowerCase().includes('elegante')) style = 'elegante';
        
        const elements: string[] = [];
        if (input.toLowerCase().includes('nombre')) elements.push('nombre personalizado');
        if (input.toLowerCase().includes('logo')) elements.push('logo');
        if (input.toLowerCase().includes('música') || input.toLowerCase().includes('nota')) elements.push('símbolos musicales');
        
        return {
            colors: colors.length > 0 ? colors : ['colores personalizados'],
            style,
            elements: elements.length > 0 ? elements : ['diseño básico']
        };
    }

    static getTechnicalRecommendation(designAnalysis: any): string {
        if (designAnalysis.style === 'profesional') return 'C (64GB) con conectividad dual';
        if (designAnalysis.style === 'vibrante') return 'B (32GB) con alta velocidad';
        return 'B (32GB) estándar';
    }

    static parseTechnicalSpecs(input: string) {
        let capacity = '32GB';
        let connectivity = 'USB 3.0 estándar';
        const speed = 'Estándar';
        
        if (input.toLowerCase().includes('a')) capacity = '16GB';
        else if (input.toLowerCase().includes('c')) capacity = '64GB';
        else if (input.toLowerCase().includes('d')) capacity = '128GB';
        
        if (input.toLowerCase().includes('usb-c') || input.toLowerCase().includes('dual')) {
            connectivity = 'Dual connector';
        }
        
        return { capacity, connectivity, speed };
    }

    static parseAccessories(input: string) {
        const accessories: string[] = [];
        let hasExpress = false;
        let additionalCost = 0;
        
        if (input.toLowerCase().includes('b')) {
            accessories.push('Estuche personalizado');
            additionalCost += 8000;
        }
        if (input.toLowerCase().includes('c')) {
            accessories.push('Estuche de lujo');
            additionalCost += 15000;
        }
        if (input.toLowerCase().includes('e')) {
            accessories.push('Kit de conectividad');
            additionalCost += 12000;
        }
        if (input.toLowerCase().includes('f')) {
            accessories.push('Consulta musical personalizada');
            additionalCost += 15000;
        }
        if (input.toLowerCase().includes('g')) {
            accessories.push('Servicio express');
            additionalCost += 12000;
            hasExpress = true;
        }
        if (input.toLowerCase().includes('h')) {
            accessories.push('Garantía extendida');
            additionalCost += 10000;
        }
        
        if (input.toLowerCase().includes('completo')) {
            accessories.push('Estuche personalizado', 'Kit de conectividad');
            additionalCost = 20000;
        }
        
        return {
            items: accessories,
            summary: accessories.length > 0 ? accessories.join(', ') : 'Accesorios básicos',
            additionalCost,
            hasExpress
        };
    }

    static calculateTotalPrice(preferences: any, accessories: any): number {
        let basePrice = 69900; // Precio base actualizado
        
        // Agregar costos según selecciones
        if (preferences?.musicChoice === 'professional') basePrice += 10000;
        if (preferences?.musicChoice === 'complete') basePrice += 25000;
        
        // Costos técnicos
        if (preferences?.technical?.specs?.capacity?.includes('32GB')) basePrice += 19000;
        if (preferences?.technical?.specs?.capacity?.includes('64GB')) basePrice += 36000;
        if (preferences?.technical?.specs?.capacity?.includes('128GB')) basePrice += 59000;
        
        // Costos de accesorios
        basePrice += accessories?.additionalCost || 0;
        
        return basePrice;
    }

    static calculateSavings(totalPrice: number): number {
        let savings = 15000; // Diseño gratis
        savings += 8000; // Envío gratis
        savings += 10000; // Consulta musical incluida
        
        return savings;
    }

    static getMusicSummary(preferences: any): string {
        const choice = preferences?.musicChoice || 'basic';
        const choices = {
            basic: 'Playlist curada básica con tus géneros favoritos',
            professional: 'Playlist profesional curada por expertos',
            complete: 'Biblioteca musical completa con múltiples géneros'
        };
        return choices[choice as keyof typeof choices] || 'Playlist personalizada';
    }

    static getDesignSummary(preferences: any): string {
        const design = preferences?.design?.analysis;
        if (!design) return 'Diseño personalizado básico';
        
        return `Estilo ${design.style} con colores ${design.colors.join(' y ')}, incluyendo ${design.elements.join(' y ')}`;
    }

    static getTechnicalSummary(preferences: any): string {
        const specs = preferences?.technical?.specs;
        if (!specs) return 'Especificaciones estándar';
        
        return `${specs.capacity} con ${specs.connectivity} y velocidad ${specs.speed}`;
    }

    static parseExpressInput(input: string) {
        const option = input.toLowerCase().includes('b') ? 'B' : 
                      input.toLowerCase().includes('a') ? 'A' : null;
        
        const musicKeywords = ['reggaeton', 'pop', 'rock', 'jazz', 'electrónica', 'baladas'];
        const musicStyle = musicKeywords.find(genre => input.toLowerCase().includes(genre)) || 'música variada';
        
        const colorKeywords = ['azul', 'rojo', 'verde', 'negro', 'blanco', 'dorado', 'rosa'];
        const colors = colorKeywords.filter(color => input.toLowerCase().includes(color)).join(' y ') || 'colores personalizados';
        
        const usage = input.toLowerCase().includes('regalo') ? 'regalo' : 'uso personal';
        
        return {
            isValid: option !== null,
            option,
            musicStyle,
            colors,
            usage
        };
    }
}

// ✅ FLOW PRINCIPAL CORREGIDO
const customizationFlow = addKeyword(['personalizar', 'customizar', 'diseño', 'custom'])
.addAction(async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
    try {
        console.log(`🎨 Iniciando personalización para ${ctx.from}`);
        
        // Consolidate into a single message to prevent spam (max 2 messages)
        const welcomeMessage = `🎨 **¡Bienvenido al Estudio TechAura!**

✨ Aquí creamos tu USB 100% personalizada.

🎯 **Proceso (5 pasos):**

🎵 **Paso 1: Contenido** - Canciones, géneros, artistas y playlists
🎨 **Paso 2: Diseño** - Colores, logos y texto personalizado
💾 **Paso 3: Técnico** - Capacidad y conectores
📦 **Paso 4: Accesorios** - Estuche y cables
🚀 **Paso 5: Entrega** - Producción y envío

💡 **¿Listo?** Escribe "**empezar**" o cuéntame tu idea.

🎯 También: "**ideas**" | "**precios**" | "**rápido**"`;

        await flowDynamic([welcomeMessage]);

        // ✅ CORREGIR: Usar updateUserSession con parámetros correctos
        await updateUserSession(
            ctx.from,
            ctx.body,
            'customization_intro',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'flow_introduction',
                confidence: 0.8,
                metadata: {
                    detectionType: 'flow_initiation',
                    originalMessage: ctx.body,
                    timestamp: new Date().toISOString()
                }
            }
        );

    } catch (error) {
        console.error('❌ Error en customizationFlow:', error);
        await flowDynamic([
            '🎨 **Estudio de Personalización TechAura**',
            '',
            '¡Vamos a crear tu USB personalizada perfecta!',
            'Cuéntame qué tienes en mente...'
        ]);
    }
})
.addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
    try {
        const userInput = ctx.body.toLowerCase().trim();
        const session = await getUserSession(ctx.from);
        
        // ✅ CORREGIR: Usar campo 'customization' en lugar de 'customizationData'
        const currentStep = session.customization?.step || 0;

        // ✅ CORREGIR: Usar CustomizationHelper en lugar de this
        if (userInput.includes('empezar') || userInput.includes('comenzar')) {
            return await CustomizationHelper.startCustomizationProcess(ctx, flowDynamic);
        } else if (userInput.includes('ideas') || userInput.includes('ejemplos')) {
            return await CustomizationHelper.showInspirationExamples(ctx, flowDynamic);
        } else if (userInput.includes('precios') || userInput.includes('costos')) {
            return await CustomizationHelper.showCustomizationPricing(ctx, flowDynamic);
        } else if (userInput.includes('rápido') || userInput.includes('express')) {
            return await CustomizationHelper.startExpressCustomization(ctx, flowDynamic);
        } else {
            // Procesar según el paso actual
            return await CustomizationHelper.processCustomizationStep(currentStep, ctx, flowDynamic, gotoFlow);
        }

    } catch (error) {
        console.error('❌ Error procesando personalización:', error);
        await flowDynamic([
            '💬 **No hay problema, empecemos de nuevo.**',
            '',
            'Cuéntame: ¿qué te gustaría personalizar en tu USB?',
            '🎵 ¿La música? 🎨 ¿El diseño? 💾 ¿Las especificaciones?'
        ]);
    }
});

export default customizationFlow;
function flowDynamic(arg0: any[]) {
    throw new Error('Function not implemented.');
}

