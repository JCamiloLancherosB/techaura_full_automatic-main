import { getUserSession, updateUserSession } from './userTrackingSystem';

export type FlowName = 'musicUsb' | 'videosUsb' | 'moviesUsb';

export type Stage =
  | 'entry'
  | 'personalization'
  | 'prices_shown'
  | 'awaiting_capacity'
  | 'awaiting_payment'
  | 'checkout_started'
  | 'converted'
  | 'completed'
  | 'capacity_confirmation'

export interface FlowState {
  phoneNumber: string;
  currentFlow?: FlowName;
  stage?: Stage;
  lockedFlow?: FlowName | null;
  lastPurchaseStep?: string;
  unrecognizedResponses?: number;
  lastMessageAt?: string;
  // snapshots mínimos
  finalizedGenres?: string[];
  finalizedArtists?: string[];
  finalizedMoods?: string[];
  finalizedCapacity?: string;
  finalizedOrderAt?: string;
}

export interface HandlerDeps {
  flowDynamic: (msgs: any[]) => Promise<void>;
  gotoFlow: (flow: any) => Promise<any>;
}

const baseTransitions = {
  entry: ['personalization', 'prices_shown'],
  personalization: ['prices_shown', 'awaiting_capacity'],
  prices_shown: ['awaiting_capacity', 'personalization'],
  awaiting_capacity: ['awaiting_payment', 'prices_shown'],
  awaiting_payment: ['checkout_started', 'awaiting_capacity'],
  checkout_started: ['converted', 'completed', 'awaiting_payment'],
  converted: ['completed'],
  completed: []
} as const;

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type MutableArray<T> = T extends ReadonlyArray<infer U> ? U[] : T;

function toMutable<T extends Record<string, ReadonlyArray<Stage>>>(obj: T): Record<keyof T, MutableArray<T[keyof T]>> {
  const out: any = {};
  for (const k in obj) out[k] = [...obj[k]];
  return out;
}

const VALID_TRANSITIONS: Record<FlowName, Partial<Record<Stage, Stage[]>>> = {
  musicUsb: toMutable(baseTransitions),
  videosUsb: toMutable(baseTransitions),
  moviesUsb: toMutable(baseTransitions)
};

// Utils adicionales
function isRecent(iso?: string, ms = 15 * 60 * 1000) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < ms;
}

function isResumableFlow(flow?: FlowName | string | null): boolean {
  return flow === 'musicUsb' || flow === 'videosUsb' || flow === 'moviesUsb';
}

// Normalización mejorada con anclas
export function normalize(text: string) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const YES_RE = /^(si|sí|ok|va|dale|continuar|cambiar|sip|claro|afirmativo)$/;
const NO_RE = /^(no|nop|nel|cancelar|seguir aqui|aqui|quedarme)$/;

// Protección de concurrencia ligera (ajuste: TTL 7s y override)
class ProcessingController {
  private static map = new Map<string, { ts: number; step: string }>();
  static isProcessing(phone: string, ttlMs = 7000) {
    const r = this.map.get(phone);
    if (!r) return false;
    if (Date.now() - r.ts > ttlMs) {
      this.map.delete(phone);
      return false;
    }
    return true;
  }
  static set(phone: string, step: string) {
    this.map.set(phone, { ts: Date.now(), step });
  }
  static clear(phone: string) {
    this.map.delete(phone);
  }
}

export function isValidTransition(flow: FlowName, from: Stage, to: Stage) {
  const allowed = VALID_TRANSITIONS[flow][from] || [];
  return allowed.includes(to);
}

// Pre-handler: orquesta y evita interrupciones
export async function preHandler(
  ctx: any,
  deps: HandlerDeps,
  flow: FlowName,
  expectedStages: Stage[],
  opts?: {
    lockOnStages?: Stage[];
    resumeMessages?: Partial<Record<Stage, string>>;
    allowEntryResume?: boolean; // default false: no retomar si está en 'entry'
  }
) {
  const phone = ctx.from;
  const msg = (ctx.body ?? '').toString().trim();
  if (!phone || !msg) return { proceed: false };

  // Evitar reentradas concurrentes
  if (ProcessingController.isProcessing(phone)) return { proceed: false };
  ProcessingController.set(phone, `${flow}:pre`);

  const session: any = await getUserSession(phone);
  const handoffFrom = session?.metadata?.handoffFrom || session?.handoffFrom;

  // Al construir state:
  const normalizedCurrentFlow = isResumableFlow(session?.currentFlow) ? session?.currentFlow : undefined;

  const state: FlowState = {
    phoneNumber: phone,
    currentFlow: normalizedCurrentFlow as FlowName | undefined,
    stage: session?.stage,
    lockedFlow: session?.lockedFlow ?? null,
    lastPurchaseStep: session?.lastPurchaseStep,
    unrecognizedResponses: session?.unrecognizedResponses || 0,
    lastMessageAt: session?.lastMessageAt,
    finalizedGenres: session?.finalizedGenres,
    finalizedArtists: session?.finalizedArtists,
    finalizedMoods: session?.finalizedMoods,
    finalizedCapacity: session?.finalizedCapacity,
    finalizedOrderAt: session?.finalizedOrderAt
  };

  const n = normalize(msg);

  // Cambio de flujo cuando existe un lockedFlow distinto
  if (state.lockedFlow && state.lockedFlow !== flow) {
    if (YES_RE.test(n)) {
      session.lockedFlow = flow;
      session.currentFlow = flow;
      await updateUserSession(phone, msg, flow, null, false, { metadata: { flowSwitch: 'confirmed' } });
      await deps.flowDynamic([`Cambio confirmado. Retomamos en ${flow === 'musicUsb' ? 'Música' : flow === 'videosUsb' ? 'Videos' : 'Películas'}.`]);
    } else if (NO_RE.test(n)) {
      await deps.flowDynamic([`Perfecto, seguimos en ${state.lockedFlow === 'musicUsb' ? 'Música' : state.lockedFlow === 'videosUsb' ? 'Videos' : 'Películas'}.`]);
      ProcessingController.clear(phone);
      return { proceed: false, redirectFlow: state.lockedFlow };
    } else {
      await deps.flowDynamic([
        `Estás en proceso de ${state.lockedFlow === 'musicUsb' ? 'Música' : state.lockedFlow === 'videosUsb' ? 'Videos' : 'Películas'}. ¿Deseas cambiar a ${flow === 'musicUsb' ? 'Música' : flow === 'videosUsb' ? 'Videos' : 'Películas'}? Responde: sí / no.`
      ]);
      ProcessingController.clear(phone);
      return { proceed: false };
    }
  }

  // Nuevo usuario o handoff: inicializa limpio
  const isNewUser = (!state.currentFlow && !state.stage) || !!handoffFrom;

  // Limpiar el flag de handoff para un solo uso
  if (handoffFrom) {
    await updateUserSession(phone, msg, flow, null, false, { metadata: { handoffFrom: null } });
  }

  if (isNewUser) {
    const initialStage: Stage = expectedStages[0] || 'entry';
    session.currentFlow = flow;
    session.stage = initialStage;
    session.lastMessageAt = new Date().toISOString();
    session.lockedFlow = null;
    await updateUserSession(phone, msg, flow, null, false, { metadata: { initialized: true, initialStage } });
    ProcessingController.clear(phone);
    return { proceed: true, session };
  }

  // Si cambia explícitamente de flujo sin lock previo, actualiza y continúa
  if (state.currentFlow !== flow) {
    session.currentFlow = flow;
    session.stage = session.stage || expectedStages[0] || 'entry';
    session.lastMessageAt = new Date().toISOString();
    await updateUserSession(phone, msg, flow, null, false, { metadata: { flowSwitch: 'implicit' } });
    ProcessingController.clear(phone);
    return { proceed: true, session };
  }

  // helper para validar flujos reanudables
  function isResumableFlow(flow?: FlowName | string | null): boolean {
    return flow === 'musicUsb' || flow === 'videosUsb' || flow === 'moviesUsb';
  }

  // Reanudación controlada
  const firstTurnAfterHandoff = Boolean(handoffFrom);
  const shouldAllowEntryResume = opts?.allowEntryResume === true;
  const hasStage = Boolean(state.stage);

  // Solo reanudar si es un flujo reanudable
  const inResumableFlow = isResumableFlow(state.currentFlow);

  // Nunca reanudar si stage es 'entry' (a menos que explícitamente se permita)
  const stageIsEntry = state.stage === 'entry';
  const eligibleStage = shouldAllowEntryResume ? (hasStage && inResumableFlow) : (hasStage && inResumableFlow && !stageIsEntry);

  // Validar coherencia esperada
  const stageNotExpected = hasStage && !expectedStages.includes(state.stage as Stage);
  const recentEnough = isRecent(state.lastMessageAt, 60 * 60 * 1000); // 60 min

  if (!firstTurnAfterHandoff && state.currentFlow === flow && stageNotExpected && eligibleStage && recentEnough) {
    const resumeMap = opts?.resumeMessages || {};

    // Evitar mostrar "(initial)" o cualquier stage no definido
    let safeStageLabel = '';
    if (state.stage && state.stage !== 'entry') {
      safeStageLabel = state.stage;
    }

    const label = state.stage && state.stage !== 'entry' ? (STAGE_LABELS[state.stage] || state.stage) : '';
    // const defaultHint = label ? `Retomemos donde íbamos (${label}).` : `Retomemos donde íbamos.`;

    // const hint = resumeMap[state.stage as Stage] || defaultHint;

    // await deps.flowDynamic([hint]);
    ProcessingController.clear(phone);
    return { proceed: true, session, resume: true };
  }
}

const STAGE_LABELS: Partial<Record<Stage, string>> = {
  personalization: 'personalización',
  prices_shown: 'precios',
  awaiting_capacity: 'capacidad',
  awaiting_payment: 'pago',
  checkout_started: 'checkout',
  converted: 'confirmación',
  completed: 'finalizado'
};

// Post-handler: asegura coherencia y persistencia
export async function postHandler(
  phone: string,
  flow: FlowName,
  nextStage: Stage,
  opts?: { lockOnStages?: Stage[]; snapshot?: Partial<FlowState> }
) {
  const lockStages = opts?.lockOnStages || ['awaiting_capacity', 'awaiting_payment', 'checkout_started', 'capacity_confirmation'];
  const session: any = await getUserSession(phone);

  const fromStage: Stage = (session?.stage as Stage) || 'entry';

  // Si nextStage no es una transición válida, no avances
  const finalNext: Stage = isValidTransition(flow, fromStage, nextStage) ? nextStage : fromStage;

  session.currentFlow = flow;
  session.stage = finalNext;
  session.lastMessageAt = new Date().toISOString();
  session.lockedFlow = lockStages.includes(finalNext) ? flow : null;

  // Snapshot ligero opcional
  if (opts?.snapshot) {
    Object.assign(session, {
      finalizedGenres: opts.snapshot.finalizedGenres ?? session.finalizedGenres,
      finalizedArtists: opts.snapshot.finalizedArtists ?? session.finalizedArtists,
      finalizedMoods: opts.snapshot.finalizedMoods ?? session.finalizedMoods,
      finalizedCapacity: opts.snapshot.finalizedCapacity ?? session.finalizedCapacity,
      finalizedOrderAt: opts.snapshot.finalizedOrderAt ?? session.finalizedOrderAt
    });
  }

  await updateUserSession(phone, `[stage->${finalNext}]`, flow, null, false, { metadata: { postHandler: true } });
}

// Helper: manejar no entendidos con avance seguro opcional
export async function handleUnrecognized(
  phone: string,
  deps: HandlerDeps,
  flow: FlowName,
  hint: string,
  forceTo?: Stage
) {
  const session: any = await getUserSession(phone);
  const count = (session.unrecognizedResponses || 0) + 1;
  session.unrecognizedResponses = count;

  if (count >= 2 && forceTo) {
    await deps.flowDynamic([`Avancemos para no perder el hilo.`]);
    await postHandler(phone, flow, forceTo);
    return { forced: true };
  }

  await deps.flowDynamic([hint]);
  await updateUserSession(phone, '[unrecognized]', flow, null, false, { metadata: { unrecognized: count } });
  return { forced: false };
}
