// userCustomizationDb.ts
import { businessDB } from './mysql-database';

// ========== Helpers de parseo ==========
function safeParse<T = any>(json: any, fallback: T): T {
  if (json === null || json === undefined || json === '' || json === 'null') return fallback;
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function toStringArray(val: any): string[] {
  try {
    if (Array.isArray(val)) return val.filter(v => typeof v === 'string');
    const arr = safeParse<any[]>(val, []);
    return Array.isArray(arr) ? arr.filter(v => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

// ========== Tipos ==========
export type CustomizationStage =
  | 'initial'
  | 'personalizing'
  | 'advanced_personalizing'
  | 'satisfied'
  | 'ready_to_continue'
  | 'naming'
  | 'completed'
  | 'quick_selection';

export interface UserVideoState {
  phoneNumber: string;
  selectedGenres: string[];
  mentionedArtists: string[];
  preferredEras: string[];
  videoQuality: string; // 'HD' | '4K' u otros
  customizationStage: CustomizationStage;
  lastPersonalizationTime: Date | null;
  personalizationCount: number;
  showedPreview: boolean;
  usbName?: string;
  // Campos persistidos extendidos
  entryTime?: Date | null;
  conversionStage?: string | null;
  interactionCount?: number;
  touchpoints?: string[];
  moodPreferences?: string[];
}

export interface UserCustomizationState {
  phoneNumber: string;
  selectedGenres: string[];
  mentionedArtists: string[];
  customizationStage: CustomizationStage;
  lastPersonalizationTime: Date | null;
  personalizationCount: number;
  entryTime?: Date | null; // Cambiar de string a Date | null
  conversionStage?: string | null;
  interactionCount?: number;
  touchpoints?: string[];
  usbName?: string;
  moodPreferences?: string[];
  preferredEras?: string[];
  videoQuality?: string | null;
  showedPreview?: boolean;
}

// ========== Persistencia ==========
export async function saveUserCustomizationState(state: UserCustomizationState): Promise<boolean> {
  const sql = `
    INSERT INTO user_customization_states
      (phone_number, selected_genres, mentioned_artists, customization_stage, last_personalization_time,
       personalization_count, entry_time, conversion_stage, interaction_count, touchpoints, usb_name, mood_preferences)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      selected_genres           = VALUES(selected_genres),
      mentioned_artists         = VALUES(mentioned_artists),
      customization_stage       = VALUES(customization_stage),
      last_personalization_time = VALUES(last_personalization_time),
      personalization_count     = VALUES(personalization_count),
      entry_time                = VALUES(entry_time),
      conversion_stage          = VALUES(conversion_stage),
      interaction_count         = VALUES(interaction_count),
      touchpoints               = VALUES(touchpoints),
      usb_name                  = VALUES(usb_name),
      mood_preferences          = VALUES(mood_preferences)
  `;

  const params = [
    state.phoneNumber ?? null,
    JSON.stringify(state.selectedGenres ?? []),
    JSON.stringify(state.mentionedArtists ?? []),
    state.customizationStage ?? 'initial',
    state.lastPersonalizationTime ?? new Date(),
    state.personalizationCount ?? 0,
    state.entryTime ?? null,
    state.conversionStage ?? null,
    state.interactionCount ?? 0,
    JSON.stringify(state.touchpoints ?? []),
    state.usbName ?? null,
    JSON.stringify(state.moodPreferences ?? [])
  ];

  try {
    await businessDB.execute(sql, params);
    return true;
  } catch (error: any) {
    console.error('❌ Error guardando estado de personalización:', error?.message || error);
    return false;
  }
}

export async function loadUserCustomizationState(phoneNumber: string): Promise<UserCustomizationState | null> {
  try {
    const [rows] = await businessDB.execute(
      'SELECT * FROM user_customization_states WHERE phone_number = ? LIMIT 1',
      [phoneNumber]
    ) as any;

    const arr = Array.isArray(rows) ? rows : [];
    if (arr.length === 0) return null;

    const row = arr[0];
    return {
      phoneNumber: row.phone_number,
      selectedGenres: toStringArray(row.selected_genres),
      mentionedArtists: toStringArray(row.mentioned_artists),
      customizationStage: (row.customization_stage as CustomizationStage) ?? 'initial',
      lastPersonalizationTime: row.last_personalization_time ? new Date(row.last_personalization_time) : null,
      personalizationCount: Number(row.personalization_count ?? 0),
      entryTime: row.entry_time ? new Date(row.entry_time) : null,
      conversionStage: row.conversion_stage ?? null,
      interactionCount: Number(row.interaction_count ?? 0),
      touchpoints: toStringArray(row.touchpoints),
      usbName: row.usb_name ?? undefined,
      moodPreferences: toStringArray(row.mood_preferences),
    };
  } catch (error: any) {
    console.error('❌ Error cargando estado de personalización:', error?.message || error);
    return null;
  }
}

// ========== Mapeos ==========
const DEFAULT_STAGE: CustomizationStage = 'initial';

export function mapVideoStateToCustomizationState(v: UserVideoState): UserCustomizationState {
  return {
    phoneNumber: v.phoneNumber,
    selectedGenres: v.selectedGenres ?? [],
    mentionedArtists: v.mentionedArtists ?? [],
    customizationStage: v.customizationStage ?? DEFAULT_STAGE,
    lastPersonalizationTime: v.lastPersonalizationTime ?? null,
    personalizationCount: v.personalizationCount ?? 0,
    entryTime: v.entryTime ?? null,
    conversionStage: v.conversionStage ?? null,
    interactionCount: v.interactionCount ?? 0,
    touchpoints: v.touchpoints ?? [],
    usbName: v.usbName,
    moodPreferences: v.moodPreferences ?? []
  };
}

export function mapCustomizationStateToVideoState(c: UserCustomizationState): UserVideoState {
  return {
    phoneNumber: c.phoneNumber,
    selectedGenres: c.selectedGenres ?? [],
    mentionedArtists: c.mentionedArtists ?? [],
    preferredEras: [],            // no persistido actualmente
    videoQuality: 'HD',           // por defecto en memoria
    customizationStage: c.customizationStage ?? DEFAULT_STAGE,
    lastPersonalizationTime: c.lastPersonalizationTime ?? null,
    personalizationCount: c.personalizationCount ?? 0,
    showedPreview: false,         // en memoria
    usbName: c.usbName,
    entryTime: c.entryTime ?? null,
    conversionStage: c.conversionStage ?? null,
    interactionCount: c.interactionCount ?? 0,
    touchpoints: c.touchpoints ?? [],
    moodPreferences: c.moodPreferences ?? []
  };
}

// ========== Merge inmutable ==========
export function mergeVideoState(current: UserVideoState, patch: Partial<UserVideoState>): UserVideoState {
  return {
    ...current,
    ...patch,
    selectedGenres: patch.selectedGenres ?? current.selectedGenres,
    mentionedArtists: patch.mentionedArtists ?? current.mentionedArtists,
    preferredEras: patch.preferredEras ?? current.preferredEras,
    moodPreferences: patch.moodPreferences ?? current.moodPreferences,
    touchpoints: patch.touchpoints ?? current.touchpoints,
    personalizationCount: patch.personalizationCount ?? current.personalizationCount,
    lastPersonalizationTime: patch.lastPersonalizationTime ?? current.lastPersonalizationTime,
    customizationStage: patch.customizationStage ?? current.customizationStage,
    showedPreview: patch.showedPreview ?? current.showedPreview,
    usbName: patch.usbName ?? current.usbName,
    entryTime: patch.entryTime ?? current.entryTime,
    conversionStage: patch.conversionStage ?? current.conversionStage,
    interactionCount: patch.interactionCount ?? current.interactionCount,
    videoQuality: patch.videoQuality ?? current.videoQuality
  };
}
