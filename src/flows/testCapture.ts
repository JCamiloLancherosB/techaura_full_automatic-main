import { addKeyword } from '@builderbot/bot';

const testCaptureFlow = addKeyword(['captura'])
  .addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('¡Bienvenido! Escribe algo para continuar:');
  })
  .addAction(
      { capture: true },
      async (ctx, { flowDynamic }) => {
        await flowDynamic(`Recibí: ${ctx.body}`);
      }
    );

export default testCaptureFlow;