/**
 * Enhanced Video USB Flow
 * Integrates persuasion engine for video/movie USBs
 */

import { flowHelper } from '../services/flowIntegrationHelper';
import type { UserSession } from '../../types/global';

export class EnhancedVideoFlow {
    /**
     * Send welcome message for videos with persuasion
     */
    static async sendWelcome(
        phone: string,
        userSession: UserSession,
        flowDynamic: any
    ): Promise<void> {
        const welcomeMessage = await flowHelper.buildCompleteMessage(
            { ...userSession, stage: 'interest' },
            'product_intro'
        );

        await flowHelper.sendPersuasiveMessage(
            phone,
            welcomeMessage || '🎬 ¡Genial! USBs con películas y series personalizadas.\n\n✨ HD/4K organizadas por género.\n\n¿Qué tipo de contenido te interesa?',
            userSession,
            flowDynamic,
            {
                flow: 'videosUsb',
                priority: 7,
                enhanceWithSocialProof: false
            }
        );
    }

    /**
     * Send genre/movie selection confirmation
     */
    static async sendGenreConfirmation(
        phone: string,
        userSession: UserSession,
        flowDynamic: any,
        selectedGenres: string[]
    ): Promise<void> {
        const message = `¡Perfecto! 🎥 Géneros seleccionados: ${selectedGenres.join(', ')}\n\n📂 Todo organizado en carpetas por género\n🎬 Películas en HD/4K\n\n¿Agregamos más géneros o vemos capacidades?`;

        await flowHelper.sendPersuasiveMessage(
            phone,
            message,
            userSession,
            flowDynamic,
            {
                flow: 'videosUsb',
                priority: 7
            }
        );
    }

    /**
     * Send capacity options for videos
     */
    static async sendCapacityOptions(
        phone: string,
        userSession: UserSession,
        flowDynamic: any
    ): Promise<void> {
        const message = await flowHelper.buildCompleteMessage(
            { ...userSession, stage: 'pricing' },
            'pricing',
            { productType: 'videos' }
        );

        await flowHelper.sendPersuasiveMessage(
            phone,
            message || '💎 Capacidades para videos:\n\n32GB - 15-20 películas HD - $84,900\n64GB - 35-40 películas HD - $119,900\n128GB - 80+ películas HD - $159,900\n\n🎁 Envío GRATIS + Calidad garantizada\n⭐ +800 USBs de video vendidas\n\n¿Cuál prefieres?',
            userSession,
            flowDynamic,
            {
                flow: 'videosUsb',
                priority: 8,
                enhanceWithSocialProof: true,
                enhanceWithUrgency: true
            }
        );
    }

    /**
     * Handle objections for video products
     */
    static async handleObjection(
        phone: string,
        objectionMessage: string,
        userSession: UserSession,
        flowDynamic: any
    ): Promise<void> {
        await flowHelper.handleObjection(
            phone,
            objectionMessage,
            userSession,
            flowDynamic,
            'videosUsb'
        );
    }

    /**
     * Validate transition to capacity flow
     */
    static async validateTransitionToCapacity(
        phone: string
    ): Promise<boolean> {
        const result = await flowHelper.validateFlowTransition(
            phone,
            'videosUsb',
            'capacityVideo'
        );

        return result.canTransition;
    }
}

export class EnhancedMovieFlow {
    /**
     * Send welcome for movies
     */
    static async sendWelcome(
        phone: string,
        userSession: UserSession,
        flowDynamic: any
    ): Promise<void> {
        const message = '🎬 ¡Excelente! Películas organizadas por saga y género.\n\n✨ Marvel, DC, Star Wars, Harry Potter y más\n🎥 Calidad HD/4K\n\n¿Qué sagas o géneros te interesan?';

        await flowHelper.sendPersuasiveMessage(
            phone,
            message,
            userSession,
            flowDynamic,
            {
                flow: 'moviesUsb',
                priority: 7
            }
        );
    }

    /**
     * Send saga/genre confirmation
     */
    static async sendSagaConfirmation(
        phone: string,
        userSession: UserSession,
        flowDynamic: any,
        selectedSagas: string[]
    ): Promise<void> {
        const message = `¡Genial! 🌟 Sagas: ${selectedSagas.join(', ')}\n\n📂 Organizadas cronológicamente\n🎬 Incluye extras y making-of\n\n¿Más sagas o vemos capacidades?`;

        await flowHelper.sendPersuasiveMessage(
            phone,
            message,
            userSession,
            flowDynamic,
            {
                flow: 'moviesUsb',
                priority: 7
            }
        );
    }

    /**
     * Send capacity options for movies
     */
    static async sendCapacityOptions(
        phone: string,
        userSession: UserSession,
        flowDynamic: any
    ): Promise<void> {
        const message = '💎 Capacidades para películas:\n\n64GB - 35-40 películas completas - $119,900\n128GB - 80+ películas + series - $159,900\n\n🎁 GRATIS: Envío + Organizadas por saga\n⭐ Calidad 4K cuando disponible\n\n¿Cuál es mejor para ti?';

        await flowHelper.sendPersuasiveMessage(
            phone,
            message,
            userSession,
            flowDynamic,
            {
                flow: 'moviesUsb',
                priority: 8,
                enhanceWithSocialProof: true,
                enhanceWithUrgency: true
            }
        );
    }
}
