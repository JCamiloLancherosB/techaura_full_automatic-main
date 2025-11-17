import { updateUserSession } from '../flows/userTrackingSystem';

export async function safeCrossSell(flowDynamic: any, session: any, phone: string, context: 'post_price' | 'pre_payment') {
  try {
    const last = session?.conversationData?.lastCrossSellAt ? new Date(session.conversationData.lastCrossSellAt).getTime() : 0;
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;

    const msg = context === 'post_price'
      ? 'Tip: si luego quieres añadir VIDEOS musicales en HD, podemos armarlo en combo. Lo vemos al final.'
      : 'Opcional: podemos añadir VIDEOS musicales en combo. Si te interesa, escribe "VIDEOS" al finalizar.';

    await flowDynamic([msg]);
    session.conversationData = session.conversationData || {};
    session.conversationData.lastCrossSellAt = new Date().toISOString();
    await updateUserSession(phone, 'cross-sell-guard', session.currentFlow || 'flow', null, false, { metadata: { cx_context: context } });
  } catch {}
}
