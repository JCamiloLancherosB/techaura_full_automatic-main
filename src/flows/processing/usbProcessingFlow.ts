import { addKeyword, EVENTS } from '@builderbot/bot';
import { getUserSession, updateUserSession } from '../userTrackingSystem';

export const usbProcessingFlow = addKeyword([EVENTS.ACTION])
.addAction(async (ctx, { flowDynamic, gotoFlow }) => {
  const session = await getUserSession(ctx.from);

  // Marcar inicio de procesamiento
  await updateUserSession(ctx.from, 'usbProcessing_start', 'usb_processing', null, false, {
    messageType: 'processing',
    metadata: { step: 'start', startedAt: new Date().toISOString() }
  });

  await flowDynamic([[
    '⚙️ Preparando tu USB personalizada...',
    '• Organizando contenido',
    '• Verificando calidad',
    '• Preparando estructura de carpetas',
    '',
    '⏱️ Tiempo estimado: 3–12 horas según capacidad',
    'Te avisaré cuando esté lista para despacho.'
  ].join('\n')]);

  // Aquí puedes disparar jobs/colas reales
});
