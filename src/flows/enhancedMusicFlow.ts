/**
 * Enhanced Music USB Flow
 * Integrates persuasion engine, flow coordinator, and conversation memory
 * into the musicUsb flow for better coherence and conversion
 */

import { flowHelper } from '../services/flowIntegrationHelper';
import type { UserSession } from '../../types/global';

export class EnhancedMusicFlow {
    /**
     * Send welcome message with persuasion
     */
    static async sendWelcome(
        phone: string,
        userSession: UserSession,
        flowDynamic: any
    ): Promise<void> {
        // Build persuasive welcome message
        const welcomeMessage = await flowHelper.buildCompleteMessage(
            userSession,
            'product_intro'
        );

        // Send with persuasion
        await flowHelper.sendPersuasiveMessage(
            phone,
            welcomeMessage || '🎵 ¡Perfecto! Vamos a crear tu USB musical personalizada.\n\n✨ Miles de canciones organizadas como TÚ quieres.\n\n¿Qué géneros o artistas te gustan más?',
            userSession,
            flowDynamic,
            {
                flow: 'musicUsb',
                priority: 7,
                enhanceWithSocialProof: false
            }
        );
    }

    /**
     * Handle genre/artist selection with context
     */
    static async handleGenreSelection(
        phone: string,
        userInput: string,
        userSession: UserSession,
        flowDynamic: any,
        selectedGenres: string[],
        selectedArtists: string[]
    ): Promise<void> {
        // Build contextual response
        const genreInfo = selectedGenres.length > 0 
            ? `Géneros: ${selectedGenres.join(', ')}` 
            : '';
        const artistInfo = selectedArtists.length > 0 
            ? `Artistas: ${selectedArtists.join(', ')}` 
            : '';

        const confirmationMessage = `¡Me encanta! 🎶 Ya tengo:\n${genreInfo}\n${artistInfo}\n\n📂 Organizaré todo por carpetas para fácil acceso.\n\n¿Quieres agregar más géneros/artistas o vemos las capacidades?`;

        // Send with persuasion
        await flowHelper.sendPersuasiveMessage(
            phone,
            confirmationMessage,
            userSession,
            flowDynamic,
            {
                flow: 'musicUsb',
                priority: 7
            }
        );
    }

    /**
     * Send capacity options with persuasion
     */
    static async sendCapacityOptions(
        phone: string,
        userSession: UserSession,
        flowDynamic: any
    ): Promise<void> {
        // Build persuasive pricing message
        const message = await flowHelper.buildCompleteMessage(
            userSession,
            'pricing',
            {
                hasCustomization: true,
                productType: 'music'
            }
        );

        // Send with social proof and urgency
        await flowHelper.sendPersuasiveMessage(
            phone,
            message || '💰 Capacidades disponibles:\n\n32GB - 5,000 canciones - $84,900\n64GB - 10,000 canciones - $119,900\n128GB - 25,000 canciones - $159,900\n\n🎁 Incluye: Envío GRATIS + Funda protectora\n⭐ +1,500 clientes satisfechos\n\n¿Qué capacidad prefieres?',
            userSession,
            flowDynamic,
            {
                flow: 'musicUsb',
                priority: 8,
                enhanceWithSocialProof: true,
                enhanceWithUrgency: true
            }
        );
    }

    /**
     * Handle objections (e.g., "está caro", "no estoy seguro")
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
            'musicUsb'
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
            'musicUsb',
            'capacityMusic'
        );

        if (!result.canTransition) {
            console.log(`⚠️ Cannot transition to capacityMusic: ${result.reason}`);
        }

        return result.canTransition;
    }

    /**
     * Build contextual CTA based on user progress
     */
    static async getNextStepCTA(userSession: UserSession): Promise<string> {
        return await flowHelper.getContextualCTA(userSession);
    }

    /**
     * Check if in critical stage (don't interrupt)
     */
    static isInCriticalStage(phone: string): boolean {
        return flowHelper.isInCriticalFlow(phone);
    }
}
