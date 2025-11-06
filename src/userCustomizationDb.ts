// import { adapterDB } from './mysql-database';
// import { businessDB } from './mysql-database';

// /**
//  * Función para parsear de manera segura un JSON.
//  * @param json - Cadena JSON a parsear.
//  * @returns Un array o un objeto vacío si el parseo falla.
//  */
// function safeParse(json: any): any[] {
//     if (!json || json === '' || json === 'null') return [];
//     try {
//         const parsed = JSON.parse(json);
//         return Array.isArray(parsed) ? parsed : [];
//     } catch {
//         return [];
//     }
// }

// /**
//  * Interfaz que define el estado de personalización del usuario.
//  */
// export interface UserCustomizationState {
//     phoneNumber: string;
//     selectedGenres: string[];
//     mentionedArtists: string[];
//     customizationStage: 'initial' | 'personalizing' | 'satisfied' | 'ready_to_continue' | 'naming' | 'completed' | 'quick_selection' | 'advanced_personalizing';
//     lastPersonalizationTime: Date;
//     personalizationCount: number;
//     entryTime?: string;
//     conversionStage?: string;
//     interactionCount?: number;
//     touchpoints?: string[];
//     usbName?: string;
//     moodPreferences?: string[];
// }

// /**
//  * Interfaz que define la sesión del usuario relacionada con la música.
//  */
// interface MusicUserSession {
//     phoneNumber: string;
//     currentFlow?: string;
//     stage: string;
//     isProcessing?: boolean;
//     lastProcessedMessage?: string;
//     lastProcessedTime?: Date;
//     selectedProduct?: any;
//     customization?: string;
//     shippingData?: string;
//     entryTime?: string;
//     touchpoints?: string[];
//     demosShown?: number;
//     selectionType?: string;
// }

// /**
//  * Interfaz que define el estado del usuario relacionado con videos.
//  */
export interface UserVideoState {
    phoneNumber: string;
    selectedGenres: string[];
    mentionedArtists: string[];
    preferredEras: string[];
    videoQuality: string;
    customizationStage: 'initial' | 'personalizing' | 'satisfied' | 'ready_to_continue' | 'naming' | 'completed' | 'quick_selection' | 'advanced_personalizing';
    lastPersonalizationTime: Date;
    personalizationCount: number;
    showedPreview: boolean;
    usbName?: string;
}

// /**
//  * Guarda el estado de personalización del usuario en la base de datos.
//  * @param state - Estado de personalización del usuario.
//  */
// export async function saveUserCustomizationState(state: UserCustomizationState) {
//     const sql = `
//         INSERT INTO user_customization_states
//         (phone_number, selected_genres, mentioned_artists, customization_stage, last_personalization_time, personalization_count, entry_time, conversion_stage, interaction_count, touchpoints, usb_name, mood_preferences)
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//         ON DUPLICATE KEY UPDATE
//             selected_genres = VALUES(selected_genres),
//             mentioned_artists = VALUES(mentioned_artists),
//             customization_stage = VALUES(customization_stage),
//             last_personalization_time = VALUES(last_personalization_time),
//             personalization_count = VALUES(personalization_count),
//             entry_time = VALUES(entry_time),
//             conversion_stage = VALUES(conversion_stage),
//             interaction_count = VALUES(interaction_count),
//             touchpoints = VALUES(touchpoints),
//             usb_name = VALUES(usb_name),
//             mood_preferences = VALUES(mood_preferences)
//     `;
//     await businessDB.execute(sql, [
//         state.phoneNumber,
//         JSON.stringify(state.selectedGenres),
//         JSON.stringify(state.mentionedArtists),
//         state.customizationStage,
//         state.lastPersonalizationTime,
//         state.personalizationCount,
//         state.entryTime,
//         state.conversionStage,
//         state.interactionCount,
//         JSON.stringify(state.touchpoints),
//         state.usbName,
//         JSON.stringify(state.moodPreferences)
//     ]);
// }

// /**
//  * Carga el estado de personalización del usuario desde la base de datos.
//  * @param phoneNumber - Número de teléfono del usuario.
//  * @returns El estado de personalización del usuario o null si no se encuentra.
//  */
// export async function loadUserCustomizationState(phoneNumber: string): Promise<UserCustomizationState | null> {
//     const [rows] = await businessDB.execute(
//         'SELECT * FROM user_customization_states WHERE phone_number = ?',
//         [phoneNumber]
//     );
//     const arr = rows as any[];
//     if (arr.length === 0) return null;
//     const row = arr[0];
//     return {
//         phoneNumber: row.phone_number,
//         selectedGenres: safeParse(row.selected_genres),
//         mentionedArtists: safeParse(row.mentioned_artists),
//         customizationStage: row.customization_stage,
//         lastPersonalizationTime: new Date(row.last_personalization_time),
//         personalizationCount: row.personalization_count,
//         entryTime: row.entry_time,
//         conversionStage: row.conversion_stage,
//         interactionCount: row.interaction_count,
//         touchpoints: safeParse(row.touchpoints),
//         usbName: row.usb_name,
//         moodPreferences: safeParse(row.mood_preferences)
//     };
// }


import { adapterDB } from './mysql-database';
import { businessDB } from './mysql-database';

/**
 * Función para parsear de manera segura un JSON.
 * @param json - Cadena JSON a parsear.
 * @returns Un array o un objeto vacío si el parseo falla.
 */
function safeParse(json: any): any[] {
    if (!json || json === '' || json === 'null') return [];
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Interfaz que define el estado de personalización del usuario.
 */
export interface UserCustomizationState {
    phoneNumber: string;
    selectedGenres: string[];
    mentionedArtists: string[];
    customizationStage: 'initial' | 'personalizing' | 'satisfied' | 'ready_to_continue' | 'naming' | 'completed' | 'quick_selection' | 'advanced_personalizing';
    lastPersonalizationTime: Date;
    personalizationCount: number;
    entryTime?: string;
    conversionStage?: string;
    interactionCount?: number;
    touchpoints?: string[];
    usbName?: string;
    moodPreferences?: string[];
}

/**
 * Guarda el estado de personalización del usuario en la base de datos.
 * @param state - Estado de personalización del usuario.
 */
export async function saveUserCustomizationState(state: UserCustomizationState) {
    const sql = `
        INSERT INTO user_customization_states
        (phone_number, selected_genres, mentioned_artists, customization_stage, last_personalization_time, personalization_count, entry_time, conversion_stage, interaction_count, touchpoints, usb_name, mood_preferences)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            selected_genres = VALUES(selected_genres),
            mentioned_artists = VALUES(mentioned_artists),
            customization_stage = VALUES(customization_stage),
            last_personalization_time = VALUES(last_personalization_time),
            personalization_count = VALUES(personalization_count),
            entry_time = VALUES(entry_time),
            conversion_stage = VALUES(conversion_stage),
            interaction_count = VALUES(interaction_count),
            touchpoints = VALUES(touchpoints),
            usb_name = VALUES(usb_name),
            mood_preferences = VALUES(mood_preferences)
    `;

    // Validar y asegurar que los parámetros no sean undefined
    const params = [
        state.phoneNumber || null,
        JSON.stringify(state.selectedGenres || []),
        JSON.stringify(state.mentionedArtists || []),
        state.customizationStage || 'initial',
        state.lastPersonalizationTime || new Date(),
        state.personalizationCount || 0,
        state.entryTime || null,
        state.conversionStage || null,
        state.interactionCount || null,
        JSON.stringify(state.touchpoints || []),
        state.usbName || null,
        JSON.stringify(state.moodPreferences || [])
    ];

    try {
        await businessDB.execute(sql, params);
    } catch (error) {
        console.error('❌ Error guardando estado de personalización:', error);
        throw error;
    }
}

/**
 * Carga el estado de personalización del usuario desde la base de datos.
 * @param phoneNumber - Número de teléfono del usuario.
 * @returns El estado de personalización del usuario o null si no se encuentra.
 */
export async function loadUserCustomizationState(phoneNumber: string): Promise<UserCustomizationState | null> {
    try {
        const [rows] = await businessDB.execute(
            'SELECT * FROM user_customization_states WHERE phone_number = ?',
            [phoneNumber]
        );

        const arr = rows as any[];
        if (arr.length === 0) return null;

        const row = arr[0];
        return {
            phoneNumber: row.phone_number,
            selectedGenres: safeParse(row.selected_genres),
            mentionedArtists: safeParse(row.mentioned_artists),
            customizationStage: row.customization_stage,
            lastPersonalizationTime: new Date(row.last_personalization_time),
            personalizationCount: row.personalization_count,
            entryTime: row.entry_time,
            conversionStage: row.conversion_stage,
            interactionCount: row.interaction_count,
            touchpoints: safeParse(row.touchpoints),
            usbName: row.usb_name,
            moodPreferences: safeParse(row.mood_preferences)
        };
    } catch (error) {
        console.error('❌ Error cargando estado de personalización:', error);
        throw error;
    }
}
