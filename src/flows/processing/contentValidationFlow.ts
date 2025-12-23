import { addKeyword, EVENTS } from '@builderbot/bot';
import { getUserSession, updateUserSession } from '../userTrackingSystem';
import { unifiedLogger } from '../../utils/unifiedLogger';

const MAX_GENRES_DISPLAY = 5;
const MAX_ARTISTS_DISPLAY = 5;

export const contentValidationFlow = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        try {
            const session = await getUserSession(ctx.from);
            
            if (!session) {
                unifiedLogger.warn('flow', 'Content validation flow - no session found', { phone: ctx.from });
                await flowDynamic([
                    '❌ No encontramos tu sesión activa.',
                    'Por favor, inicia tu pedido nuevamente.'
                ]);
                return endFlow();
            }

            unifiedLogger.info('flow', 'Content validation flow started', {
                phone: ctx.from,
                userName: ctx.name || session.name
            });

            const prefs = session?.preferences || {};
            const genres = (prefs.genres || prefs.musicGenres || []).slice(0, MAX_GENRES_DISPLAY);
            const artists = (prefs.artists || []).slice(0, MAX_ARTISTS_DISPLAY);

            await updateUserSession(ctx.from, 'validation_start', 'content_validation', 'validation_in_progress', false, {
                messageType: 'validation',
                metadata: { 
                    startedAt: new Date().toISOString(),
                    genres,
                    artists
                }
            });

            const userName = ctx.name || session.name || 'amigo';
            const genresDisplay = genres.length ? genres.join(', ') : 'Variedad musical';
            const artistsDisplay = artists.length ? artists.join(', ') : 'Incluiremos top hits';

            await flowDynamic([
                `✅ **Validación de contenido - ${userName}**`,
                '',
                '📋 **Tu selección:**',
                `🎵 Géneros: ${genresDisplay}`,
                `🎤 Artistas: ${artistsDisplay}`,
                `📁 Estructura: Organizado por géneros/artistas`,
                '',
                '💡 **¿Deseas hacer cambios?**',
                '',
                'Responde:',
                '✅ **"Confirmar"** - Continuar con esta selección',
                '➕ **"Agregar"** - Añadir más géneros o artistas',
                '➖ **"Quitar"** - Remover algo de la lista',
                '🔄 **"Cambiar"** - Modificar completamente',
                '',
                '⏱️ Si no respondes en 2 minutos, confirmaremos automáticamente.'
            ]);

            unifiedLogger.info('flow', 'Content validation presented to user', {
                phone: ctx.from,
                genres: genresDisplay,
                artists: artistsDisplay
            });

        } catch (error: any) {
            unifiedLogger.error('flow', 'Error in content validation flow', {
                phone: ctx.from,
                error: error.message,
                stack: error.stack
            });

            await flowDynamic([
                '❌ Hubo un error en la validación de contenido.',
                '',
                'No te preocupes, usaremos la selección que hiciste anteriormente.',
                '',
                'Si quieres hacer cambios, escríbelos ahora.'
            ]);
        }
    });
