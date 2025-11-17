// src/services/IntelligentOrder.ts

import type { UserSession } from '../../types/global';

export type OrganizationMode = 'by_genre' | 'by_artist' | 'single_folder';

export interface ParsedPreferences {
  contentType: 'music' | 'videos' | 'movies';
  includedGenres: string[];
  excludedGenres: string[];
  specificArtists: string[];
  explicitList: string[];           // títulos/canciones listadas explícitamente
  organization: OrganizationMode;   // organización de carpetas
  estimatedFiles: number;           // conteo estimado de archivos
  specialPreferences: {
    crossover?: boolean;
    moods?: string[];
    eras?: string[];
  };
  usbLabel?: string;
  contentTypes?: string[];          // soporte mixto si aplica
  confidence: number;               // 0–100
}

function quickDetectContentType(text: string, session?: UserSession): ParsedPreferences['contentType'] {
  const t = (text || '').toLowerCase();
  if (t.includes('pelicula') || t.includes('películas') || t.includes('pelis') || t.includes('series')) return 'movies';
  if (t.includes('video') || t.includes('videoclips')) return 'videos';
  if (t.includes('musica') || t.includes('música') || t.includes('cancion')) return 'music';
  // fallback a sesión
  if (session?.contentType && ['music','videos','movies'].includes(session.contentType)) {
    return session.contentType as any;
  }
  return 'music';
}

function extractList(text: string): string[] {
  const lines = (text || '').split(/\n|,|;|•|-/).map(s => s.trim()).filter(Boolean);
  // heurística básica: títulos entre comillas o con números
  return lines.filter(s => /["“”]|^\d+\.?\s+/.test(s) || s.length > 18).slice(0, 200);
}

function extractGenres(text: string): { included: string[]; excluded: string[] } {
  const t = (text || '').toLowerCase();
  const known = ['pop','rock','reggaeton','salsa','bachata','vallenato','electronica','electrónica','rap','trap','conciertos','documentales','videoclips','accion','acción','comedia','drama','terror','anime','clasicos','clásicos'];
  const included = Array.from(new Set(known.filter(k => t.includes(k))));
  // exclusiones por “sin X”, “no X”
  const excluded = Array.from(new Set(
    known.filter(k => new RegExp(`\\b(sin|no)\\s+${k}\\b`).test(t))
  ));
  return { included, excluded };
}

function extractArtists(text: string): string[] {
  // Heurística simple: palabras Capitalizadas encadenadas
  const candidates = (text || '').match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3}/g) || [];
  return Array.from(new Set(candidates)).slice(0, 50);
}

export const intelligentOrderCapture = {
  async analyzeUserMessage(
    userMessage: string,
    userSession: UserSession,
    attachments?: Array<{ type: string; path: string }>
  ): Promise<ParsedPreferences> {
    const contentType = quickDetectContentType(userMessage, userSession);
    const { included, excluded } = extractGenres(userMessage);
    const artists = extractArtists(userMessage);
    const list = extractList(userMessage);

    // estimación básica de cantidad de archivos
    let estimatedFiles = 0;
    if (list.length) estimatedFiles = list.length;
    else if (included.length) estimatedFiles = included.length * 300; // heurística general

    // modo de organización por defecto
    const organization: OrganizationMode =
      artists.length >= 3 ? 'by_artist' :
      included.length >= 2 ? 'by_genre' : 'single_folder';

    // confianza
    let confidence = 70;
    if (list.length > 0) confidence += 15;
    if (included.length > 0) confidence += 5;
    if (artists.length > 0) confidence += 5;
    confidence = Math.min(95, confidence);

    return {
      contentType,
      includedGenres: included,
      excludedGenres: excluded,
      specificArtists: artists,
      explicitList: list,
      organization,
      estimatedFiles: Math.max(estimatedFiles, 100), // mínimo razonable
      specialPreferences: {
        crossover: false,
        moods: userSession.moodPreferences || [],
        eras: userSession.preferredEras || []
      },
      usbLabel: userSession.finalizedUsbName || undefined,
      contentTypes: userSession.preferences?.contentTypes || undefined,
      confidence
    };
  }
};