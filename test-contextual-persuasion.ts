import { ContextualPersuasionComposer } from './src/services/persuasion/ContextualPersuasionComposer';
import type { UserContext } from './src/types/UserContext';

const composer = new ContextualPersuasionComposer();

const contexts: UserContext[] = [
  {
    phone: '3000000001',
    firstName: 'Ana',
    stage: 'awareness',
    preferences: { genres: ['rock'], contentTypes: ['music'] },
    history: { previousOrdersCount: 0 }
  },
  {
    phone: '3000000002',
    firstName: 'Luis',
    stage: 'consideration',
    preferences: { genres: ['acción'], contentTypes: ['movies'] },
    history: { previousOrdersCount: 1 }
  },
  {
    phone: '3000000003',
    firstName: 'Cami',
    stage: 'decision',
    preferences: { genres: ['reggaeton'], contentTypes: ['videos'] },
    history: { previousOrdersCount: 2 },
    signals: { urgency: 'high' }
  },
  {
    phone: '3000000004',
    firstName: 'Sofía',
    stage: 'awareness',
    preferences: { genres: ['salsa'], contentTypes: ['music'] },
    history: { previousOrdersCount: 0 },
    objections: ['price']
  },
  {
    phone: '3000000005',
    firstName: 'Mateo',
    stage: 'consideration',
    preferences: { genres: ['comedia'], contentTypes: ['movies'] },
    history: { previousOrdersCount: 1 },
    cart: { capacity: '128GB', priceQuoted: 159900 }
  },
  {
    phone: '3000000006',
    firstName: 'Valen',
    stage: 'decision',
    preferences: { genres: ['bachata'], contentTypes: ['videos'] },
    history: { previousOrdersCount: 1 },
    signals: { urgency: 'high' }
  }
];

const cases = [
  { flowId: 'musicUsb', step: 'onboarding', intent: 'ask_question' },
  { flowId: 'moviesUsb', step: 'capacity_choice', intent: 'present_options' },
  { flowId: 'videosUsb', step: 'objection', intent: 'objection_reply' },
  { flowId: 'musicUsb', step: 'objection', intent: 'objection_reply' },
  { flowId: 'moviesUsb', step: 'confirmation', intent: 'confirm' },
  { flowId: 'videosUsb', step: 'follow_up', intent: 'follow_up' }
] as const;

let failures = 0;

// Basic validation: ensure outputs are non-empty and no unresolved template placeholders remain.
cases.forEach((scenario, index) => {
  const context = contexts[index];
  const msg = composer.compose({
    flowId: scenario.flowId,
    flowState: { step: scenario.step },
    userContext: context,
    messageIntent: scenario.intent
  });
  if (!msg.text || msg.text.includes('{{')) {
    failures += 1;
  }
});

if (failures > 0) {
  throw new Error(`Composer produced ${failures} invalid messages.`);
}

console.log('ContextualPersuasionComposer dry-run OK');
