import { addKeyword, EVENTS } from '@builderbot/bot';
import { getUserSession, updateUserSession } from '../userTrackingSystem';

export const qualityAssuranceFlow = addKeyword([EVENTS.ACTION])
.addAction(async (ctx, { flowDynamic }) => {
  const session = await getUserSession(ctx.from);

  await updateUserSession(ctx.from, 'qa_start', 'quality_assurance', null, false, {
    messageType: 'qa',
    metadata: { startedAt: new Date().toISOString() }
  });

  // Simulación de QA
  await flowDynamic([[
    '🛡️ Control de calidad en progreso...',
    '• Reproducción de muestras',
    '• Integridad de archivos',
    '• Estructura y nombres',
    '',
    '✅ Todo OK. Listo para despacho.'
  ].join('\n')]);

  await updateUserSession(ctx.from, 'qa_ok', 'quality_assurance', null, false, {
    messageType: 'qa',
    metadata: { status: 'ok', finishedAt: new Date().toISOString() }
  });
});
