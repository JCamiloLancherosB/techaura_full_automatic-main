import { addKeyword, EVENTS } from '@builderbot/bot';
import { getUserSession, updateUserSession } from '../userTrackingSystem';

export const contentValidationFlow = addKeyword([EVENTS.ACTION])
.addAction(async (ctx, { flowDynamic }) => {
  const session = await getUserSession(ctx.from);
  const prefs = session?.preferences || {};
  const genres = (prefs.genres || prefs.musicGenres || []).slice(0,5);
  const artists = (prefs.artists || []).slice(0,5);

  await updateUserSession(ctx.from, 'validation_start', 'content_validation', null, false, {
    messageType: 'validation',
    metadata: { startedAt: new Date().toISOString() }
  });

  await flowDynamic([[
    '✅ Validación de contenido:',
    `• Géneros: ${genres.length ? genres.join(', ') : 'Variedad'}`,
    `• Artistas: ${artists.length ? artists.join(', ') : 'Incluiremos top hits'}`,
    '• Estructura: por géneros/sagas',
    '',
    '¿Quieres agregar/quitar algo? Si no, seguimos.'
  ].join('\n')]);
});
