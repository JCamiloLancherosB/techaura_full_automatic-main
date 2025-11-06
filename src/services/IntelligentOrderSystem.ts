// ✅ SISTEMA COMPLETO INTEGRADO - CAPTURA Y PROCESAMIENTO INTELIGENTE
// src/services/IntelligentOrderSystem.ts

import { aiService } from './aiService';
import { intelligentOrderCapture, ParsedPreferences } from './IntelligentOrderCapture';
import { businessDB } from '../mysql-database';
import { UserSession } from '../../types/global';
import axios from 'axios';

export interface ProcessedOrder {
    orderId: string;
    customerData: {
        nombre: string;
        telefono: string;
        direccion: string;
        metodoPago: string;
    };
    preferences: ParsedPreferences;
    distribution: ContentDistribution;
    crossSellSuggestions: CrossSellProduct[];
    validationStatus: ValidationResult;
    readyToProcess: boolean;
}

export interface ContentDistribution {
    totalCapacityBytes: number;
    usedCapacityBytes: number;
    remainingCapacityBytes: number;
    contentBreakdown: {
        genre: string;
        allocatedBytes: number;
        estimatedFiles: number;
        percentage: number;
    }[];
    organizationStructure: {
        folderName: string;
        path: string;
        estimatedSize: number;
    }[];
}

export interface CrossSellProduct {
    id: string;
    name: string;
    price: number;
    relevanceScore: number;
    reason: string;
    urgency: 'high' | 'medium' | 'low';
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
    confidence: number;
}

export class IntelligentOrderSystem {
    
    // ✅ CAPACIDADES DISPONIBLES CON BYTES EXACTOS
    private readonly CAPACITIES = {
        '8GB': 8_589_934_592,     // 8 * 1024^3
        '32GB': 34_359_738_368,   // 32 * 1024^3
        '64GB': 68_719_476_736,   // 64 * 1024^3
        '128GB': 137_438_953_472, // 128 * 1024^3
        '256GB': 274_877_906_944, // 256 * 1024^3
        '512GB': 549_755_813_888  // 512 * 1024^3
    };
    
    // ✅ TAMAÑOS PROMEDIO POR TIPO DE ARCHIVO
    private readonly AVERAGE_FILE_SIZES = {
        music_mp3_320kbps: 10_485_760,     // 10 MB
        music_mp3_192kbps: 6_291_456,      // 6 MB
        video_hd_1080p: 3_221_225_472,     // 3 GB
        video_hd_720p: 1_073_741_824,      // 1 GB
        movie_hd_1080p: 4_294_967_296,     // 4 GB
        movie_hd_720p: 2_147_483_648,      // 2 GB
        movie_4k: 8_589_934_592            // 8 GB
    };
    
    // ✅ PRODUCTOS DE CROSS-SELLING
    private readonly CROSS_SELL_PRODUCTS = [
        {
            id: 'headphones_bluetooth',
            name: 'Audífonos Bluetooth Premium',
            price: 39900,
            compatibleWith: ['music', 'videos', 'movies'],
            relevanceBoost: {
                music: 1.5,
                videos: 1.2,
                movies: 1.3
            }
        },
        {
            id: 'fast_charger',
            name: 'Cargador Rápido USB-C',
            price: 29900,
            compatibleWith: ['music', 'videos', 'movies'],
            relevanceBoost: {
                all: 1.1
            }
        },
        {
            id: 'usb_hub',
            name: 'Hub USB 4 Puertos',
            price: 19900,
            compatibleWith: ['music', 'videos', 'movies'],
            relevanceBoost: {
                high_capacity: 1.4
            }
        },
        {
            id: 'portable_speaker',
            name: 'Parlante Portátil Bluetooth',
            price: 49900,
            compatibleWith: ['music'],
            relevanceBoost: {
                music: 1.8
            }
        },
        {
            id: 'phone_stand',
            name: 'Soporte Ajustable para Teléfono',
            price: 15900,
            compatibleWith: ['videos', 'movies'],
            relevanceBoost: {
                videos: 1.3,
                movies: 1.4
            }
        }
    ];
    
    /**
     * ✅ MÉTODO PRINCIPAL: Procesar pedido completo
     */
    public async processCompleteOrder(
        userMessage: string,
        userSession: UserSession,
        attachments?: Array<{ type: string; path: string }>
    ): Promise<ProcessedOrder> {
        
        console.log('🎯 Iniciando procesamiento completo de pedido...');
        
        // ✅ PASO 1: CAPTURAR PREFERENCIAS CON IA
        const preferences = await intelligentOrderCapture.analyzeUserMessage(
            userMessage,
            userSession,
            attachments
        );
        
        console.log('✅ Preferencias capturadas:', preferences);
        
        // ✅ PASO 2: VALIDAR PEDIDO
        const validation = await this.validateOrder(preferences, userSession);
        
        if (!validation.isValid) {
            console.warn('⚠️ Pedido inválido:', validation.errors);
            throw new Error(`Pedido inválido: ${validation.errors.join(', ')}`);
        }
        
        // ✅ PASO 3: CALCULAR DISTRIBUCIÓN DE CONTENIDO
        const distribution = await this.calculateContentDistribution(
            preferences,
            userSession.capacity || '32GB'
        );
        
        console.log('📊 Distribución calculada:', distribution);
        
        // ✅ PASO 4: GENERAR CROSS-SELL INTELIGENTE
        const crossSell = await this.generateCrossSell(preferences, userSession);
        
        console.log('💎 Cross-sell generado:', crossSell);
        
        // ✅ PASO 5: PREPARAR DATOS DEL CLIENTE
        const customerData = await this.getCustomerData(userSession);
        
        // ✅ PASO 6: GENERAR ID DE ORDEN
        const orderId = this.generateOrderId();
        
        // ✅ PASO 7: ENSAMBLAR ORDEN COMPLETA
        const processedOrder: ProcessedOrder = {
            orderId,
            customerData,
            preferences,
            distribution,
            crossSellSuggestions: crossSell,
            validationStatus: validation,
            readyToProcess: true
        };
        
        // ✅ PASO 8: GUARDAR EN BASE DE DATOS
        await this.saveProcessedOrder(processedOrder, userSession);
        
        console.log('✅ Orden procesada completamente:', orderId);
        
        return processedOrder;
    }
    
    /**
     * ✅ VALIDAR PEDIDO
     */
    private async validateOrder(
        preferences: ParsedPreferences,
        userSession: UserSession
    ): Promise<ValidationResult> {
        
        const errors: string[] = [];
        const warnings: string[] = [];
        const recommendations: string[] = [];
        
        // ✅ VALIDAR TIPO DE CONTENIDO
        if (!preferences.contentType) {
            errors.push('Tipo de contenido no especificado');
        }
        
        // ✅ VALIDAR CAPACIDAD
        if (!userSession.capacity) {
            errors.push('Capacidad no seleccionada');
        }
        
        // ✅ VALIDAR GÉNEROS O LISTA EXPLÍCITA
        if (preferences.includedGenres.length === 0 && preferences.explicitList.length === 0) {
            warnings.push('No se especificaron géneros ni lista explícita. Se usará contenido variado (crossover).');
            preferences.specialPreferences.crossover = true;
        }
        
        // ✅ VALIDAR EXCLUSIONES
        if (preferences.excludedGenres.length > 0) {
            recommendations.push(`Se excluirán estos géneros: ${preferences.excludedGenres.join(', ')}`);
        }
        
        // ✅ VALIDAR ESTIMACIÓN VS CAPACIDAD
        if (userSession.capacity && preferences.estimatedFiles) {
            const capacity = this.CAPACITIES[userSession.capacity];
            const estimatedSize = this.estimateTotalSize(preferences);
            
            if (estimatedSize > capacity) {
                warnings.push(`El contenido estimado (${this.formatBytes(estimatedSize)}) excede la capacidad seleccionada (${userSession.capacity}). Se ajustará automáticamente.`);
            }
        }
        
        // ✅ CALCULAR CONFIANZA GENERAL
        let confidence = preferences.confidence;
        if (warnings.length > 0) confidence -= 10;
        if (errors.length > 0) confidence -= 30;
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            recommendations,
            confidence: Math.max(0, confidence)
        };
    }
    
    /**
     * ✅ CALCULAR DISTRIBUCIÓN EQUITATIVA DE CONTENIDO
     */
    private async calculateContentDistribution(
        preferences: ParsedPreferences,
        capacity: string
    ): Promise<ContentDistribution> {
        
        const totalCapacity = this.CAPACITIES[capacity];
        
        // ✅ DEJAR 5% DE ESPACIO LIBRE (MARGEN DE SEGURIDAD)
        const usableCapacity = Math.floor(totalCapacity * 0.95);
        
        let contentBreakdown: ContentDistribution['contentBreakdown'] = [];
        
        // ✅ SI HAY LISTA EXPLÍCITA, USAR ESA
        if (preferences.explicitList.length > 0) {
            // Distribuir según lista explícita
            const avgFileSize = this.getAverageFileSize(preferences.contentType);
            const totalFiles = Math.floor(usableCapacity / avgFileSize);
            
            contentBreakdown = [{
                genre: 'Lista Personalizada',
                allocatedBytes: usableCapacity,
                estimatedFiles: Math.min(preferences.explicitList.length, totalFiles),
                percentage: 100
            }];
            
        } else {
            // ✅ DISTRIBUIR EQUITATIVAMENTE ENTRE GÉNEROS
            const genres = preferences.includedGenres.length > 0 
                ? preferences.includedGenres 
                : this.getDefaultGenres(preferences.contentType);
            
            const bytesPerGenre = Math.floor(usableCapacity / genres.length);
            const avgFileSize = this.getAverageFileSize(preferences.contentType);
            const filesPerGenre = Math.floor(bytesPerGenre / avgFileSize);
            
            contentBreakdown = genres.map(genre => ({
                genre: genre,
                allocatedBytes: bytesPerGenre,
                estimatedFiles: filesPerGenre,
                percentage: Math.round((bytesPerGenre / usableCapacity) * 100)
            }));
        }
        
        // ✅ GENERAR ESTRUCTURA DE CARPETAS
        const organizationStructure = this.generateFolderStructure(
            preferences,
            contentBreakdown
        );
        
        const totalUsed = contentBreakdown.reduce((sum, item) => sum + item.allocatedBytes, 0);
        
        return {
            totalCapacityBytes: totalCapacity,
            usedCapacityBytes: totalUsed,
            remainingCapacityBytes: totalCapacity - totalUsed,
            contentBreakdown,
            organizationStructure
        };
    }
    
    /**
     * ✅ GENERAR ESTRUCTURA DE CARPETAS
     */
    private generateFolderStructure(
        preferences: ParsedPreferences,
        breakdown: ContentDistribution['contentBreakdown']
    ): ContentDistribution['organizationStructure'] {
        
        const structure: ContentDistribution['organizationStructure'] = [];
        
        switch (preferences.organization) {
            case 'by_genre':
                breakdown.forEach(item => {
                    structure.push({
                        folderName: item.genre,
                        path: `/${item.genre}`,
                        estimatedSize: item.allocatedBytes
                    });
                });
                break;
            
            case 'by_artist':
                // Organizar por artista (si hay artistas específicos)
                if (preferences.specificArtists.length > 0) {
                    preferences.specificArtists.forEach(artist => {
                        structure.push({
                            folderName: artist,
                            path: `/${artist}`,
                            estimatedSize: Math.floor(breakdown[0].allocatedBytes / preferences.specificArtists.length)
                        });
                    });
                } else {
                    // Fallback a por género
                    breakdown.forEach(item => {
                        structure.push({
                            folderName: item.genre,
                            path: `/${item.genre}`,
                            estimatedSize: item.allocatedBytes
                        });
                    });
                }
                break;
            
            case 'single_folder':
                structure.push({
                    folderName: 'Contenido',
                    path: '/Contenido',
                    estimatedSize: breakdown.reduce((sum, item) => sum + item.allocatedBytes, 0)
                });
                break;
            
            default:
                breakdown.forEach(item => {
                    structure.push({
                        folderName: item.genre,
                        path: `/${item.genre}`,
                        estimatedSize: item.allocatedBytes
                    });
                });
        }
        
        return structure;
    }
    
    /**
     * ✅ GENERAR CROSS-SELL INTELIGENTE
     */
    private async generateCrossSell(
        preferences: ParsedPreferences,
        userSession: UserSession
    ): Promise<CrossSellProduct[]> {
        
        const suggestions: CrossSellProduct[] = [];
        
        for (const product of this.CROSS_SELL_PRODUCTS) {
            // ✅ VERIFICAR COMPATIBILIDAD
            if (!product.compatibleWith.includes(preferences.contentType) && 
                !product.compatibleWith.includes('all')) {
                continue;
            }
            
            // ✅ CALCULAR RELEVANCIA
            let relevanceScore = 50; // Base
            
            // Boost por tipo de contenido
            if (product.relevanceBoost[preferences.contentType]) {
                relevanceScore *= product.relevanceBoost[preferences.contentType];
            }
            
            // Boost por capacidad alta
            if (userSession.capacity && ['128GB', '256GB', '512GB'].includes(userSession.capacity)) {
                if (product.relevanceBoost['high_capacity']) {
                    relevanceScore *= product.relevanceBoost['high_capacity'];
                }
            }
            
            // Boost por historial de compras
            if (userSession.totalOrders && userSession.totalOrders > 0) {
                relevanceScore *= 1.2; // Cliente recurrente
            }
            
            // ✅ DETERMINAR URGENCIA
            let urgency: 'high' | 'medium' | 'low' = 'low';
            if (relevanceScore > 80) urgency = 'high';
            else if (relevanceScore > 60) urgency = 'medium';
            
            // ✅ GENERAR RAZÓN
            const reason = this.generateCrossSellReason(product, preferences, userSession);
            
            suggestions.push({
                id: product.id,
                name: product.name,
                price: product.price,
                relevanceScore: Math.round(relevanceScore),
                reason,
                urgency
            });
        }
        
        // ✅ ORDENAR POR RELEVANCIA Y LIMITAR A TOP 3
        return suggestions
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 3);
    }
    
    /**
     * ✅ GENERAR RAZÓN DE CROSS-SELL
     */
    private generateCrossSellReason(
        product: any,
        preferences: ParsedPreferences,
        userSession: UserSession
    ): string {
        
        if (product.id === 'headphones_bluetooth' && preferences.contentType === 'music') {
            return 'Perfecto para disfrutar tu música con calidad premium';
        }
        
        if (product.id === 'portable_speaker' && preferences.contentType === 'music') {
            return 'Ideal para compartir tu música en cualquier lugar';
        }
        
        if (product.id === 'phone_stand' && ['videos', 'movies'].includes(preferences.contentType)) {
            return 'Ver tus videos cómodamente sin sostener el teléfono';
        }
        
        if (product.id === 'fast_charger') {
            return 'Mantén tu dispositivo cargado para disfrutar sin interrupciones';
        }
        
        if (product.id === 'usb_hub' && userSession.capacity && parseInt(userSession.capacity) >= 128) {
            return 'Conecta múltiples dispositivos con tu USB de alta capacidad';
        }
        
        return 'Complemento perfecto para tu compra';
    }
    
    /**
     * ✅ ENVIAR PEDIDO AL AUTOPROCESADOR
     */
    public async sendToAutoProcessor(processedOrder: ProcessedOrder): Promise<boolean> {
        try {
            const autoProcessorUrl = process.env.AUTOPROCESSOR_URL || 'http://localhost:3009/api/new-order';
            
            const orderData = {
                orderId: processedOrder.orderId,
                customer: processedOrder.customerData,
                content: {
                    type: processedOrder.preferences.contentType,
                    preferences: processedOrder.preferences.includedGenres,
                    exclusions: processedOrder.preferences.excludedGenres,
                    artists: processedOrder.preferences.specificArtists,
                    organization: processedOrder.preferences.organization,
                    explicitList: processedOrder.preferences.explicitList
                },
                distribution: processedOrder.distribution,
                capacity: processedOrder.distribution.totalCapacityBytes,
                validation: processedOrder.validationStatus
            };
            
            console.log('📤 Enviando pedido al autoprocesador:', autoProcessorUrl);
            
            const response = await axios.post(autoProcessorUrl, orderData, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            if (response.data.success) {
                console.log('✅ Pedido enviado exitosamente al autoprocesador');
                return true;
            } else {
                console.error('❌ Error en respuesta del autoprocesador:', response.data);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error enviando pedido al autoprocesador:', error);
            return false;
        }
    }
    
    // ✅ MÉTODOS AUXILIARES
    
    private getAverageFileSize(contentType: string): number {
        switch (contentType) {
            case 'music':
                return this.AVERAGE_FILE_SIZES.music_mp3_320kbps;
            case 'videos':
                return this.AVERAGE_FILE_SIZES.video_hd_1080p;
            case 'movies':
                return this.AVERAGE_FILE_SIZES.movie_hd_1080p;
            default:
                return this.AVERAGE_FILE_SIZES.music_mp3_320kbps;
        }
    }
    
    private estimateTotalSize(preferences: ParsedPreferences): number {
        const avgSize = this.getAverageFileSize(preferences.contentType);
        return preferences.estimatedFiles * avgSize;
    }
    
    private formatBytes(bytes: number): string {
        const gb = bytes / (1024 ** 3);
        return `${gb.toFixed(2)} GB`;
    }
    
    private getDefaultGenres(contentType: string): string[] {
        switch (contentType) {
            case 'music':
                return ['pop', 'rock', 'reggaeton', 'salsa', 'bachata'];
            case 'videos':
                return ['conciertos', 'documentales', 'videoclips'];
            case 'movies':
                return ['accion', 'comedia', 'drama', 'terror'];
            default:
                return ['variado'];
        }
    }
    
    private async getCustomerData(userSession: UserSession): Promise<ProcessedOrder['customerData']> {
        const conversationData = userSession.conversationData?.customerData || {};
        
        return {
            nombre: conversationData.nombre || userSession.name || 'Cliente',
            telefono: conversationData.telefono || userSession.phone || '',
            direccion: conversationData.direccion || userSession.location || '',
            metodoPago: conversationData.metodoPago || 'efectivo'
        };
    }
    
    private generateOrderId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `ORD-${timestamp}-${random}`.toUpperCase();
    }
    
    private async saveProcessedOrder(order: ProcessedOrder, userSession: UserSession): Promise<void> {
        try {
            // Guardar en base de datos
            await businessDB.saveOrder({
                orderNumber: order.orderId,
                phoneNumber: userSession.phone,
                customerName: order.customerData.nombre,
                productType: order.preferences.contentType,
                capacity: userSession.capacity || '32GB',
                price: userSession.price || 0,
                customization: order.preferences,
                preferences: order.distribution,
                processingStatus: 'pending'
            });
            
            console.log('✅ Orden guardada en base de datos');
            
        } catch (error) {
            console.error('❌ Error guardando orden:', error);
        }
    }
}

export const intelligentOrderSystem = new IntelligentOrderSystem();