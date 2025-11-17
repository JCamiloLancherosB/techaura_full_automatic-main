export async function safeReply(flowDynamic: any, messages: string[] | string, options?: { onceKey?: string; ttlMin?: number; session?: any }) {
  try {
    const payload = Array.isArray(messages) ? messages : [messages];
    if (options?.onceKey && options?.session) {
      const { canSendOnce } = await import('../flows/userTrackingSystem');
      if (!canSendOnce(options.session, options.onceKey, options.ttlMin ?? 5)) return;
    }
    await flowDynamic(payload);
  } catch (e) {
    // Último recurso: no romper el flujo
    console.warn('[safeReply] fallo enviando mensaje:', e);
  }
}