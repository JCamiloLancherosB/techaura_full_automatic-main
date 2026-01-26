import type { UserContext } from '../../types/UserContext';
import { commonTemplates } from './templates/common.templates';
import { musicUsbTemplates } from './templates/musicUsb.templates';
import { moviesUsbTemplates } from './templates/moviesUsb.templates';
import { videosUsbTemplates } from './templates/videosUsb.templates';

export type FlowId = 'musicUsb' | 'moviesUsb' | 'videosUsb';
export type FlowStep =
  | 'onboarding'
  | 'preference_collection'
  | 'capacity_choice'
  | 'confirmation'
  | 'objection'
  | 'follow_up';
export type MessageIntent =
  | 'ask_question'
  | 'present_options'
  | 'confirm'
  | 'objection_reply'
  | 'follow_up';

export interface ComposeInput {
  flowId: FlowId;
  flowState: { step: FlowStep };
  userContext: UserContext;
  messageIntent: MessageIntent;
}

export interface ComposedMessage {
  text: string;
  quickReplies?: string[];
  meta?: { strategy: string };
}

const strategySelector = (context: UserContext, flowState: FlowStep, intent: MessageIntent) => {
  if (intent === 'objection_reply') return 'objectionHandling';
  if (flowState === 'capacity_choice' || intent === 'present_options') return 'choiceArchitecture';
  if (flowState === 'confirmation' || intent === 'confirm') return 'clarity';
  if (flowState === 'follow_up' || intent === 'follow_up') return 'followUp';
  if (context.signals?.urgency === 'high') return 'urgency';
  return 'socialProof';
};

type PersuasionTemplateSet = {
  onboarding: (ctx: UserContext) => ComposedMessage;
  preferences: (ctx: UserContext) => ComposedMessage;
  capacityChoice: (ctx: UserContext) => ComposedMessage;
  confirmation: (ctx: UserContext) => ComposedMessage;
  objection: (ctx: UserContext) => ComposedMessage;
  followUp: (ctx: UserContext) => ComposedMessage;
};

const resolveTemplate = (flowId: FlowId): PersuasionTemplateSet => {
  if (flowId === 'musicUsb') {
    return musicUsbTemplates;
  }
  if (flowId === 'moviesUsb') {
    return moviesUsbTemplates;
  }
  return videosUsbTemplates;
};

export class ContextualPersuasionComposer {
  compose(input: ComposeInput): ComposedMessage {
    const templates = resolveTemplate(input.flowId);
    const strategy = strategySelector(input.userContext, input.flowState.step, input.messageIntent);

    const templateMap: Record<FlowStep, (ctx: UserContext) => ComposedMessage> = {
      onboarding: templates.onboarding,
      preference_collection: templates.preferences,
      capacity_choice: templates.capacityChoice,
      confirmation: templates.confirmation,
      objection: templates.objection,
      follow_up: templates.followUp
    };

    const result = templateMap[input.flowState.step](input.userContext);
    const urgency = commonTemplates.urgency(input.userContext);
    const text = urgency ? `${result.text}\n${urgency}` : result.text;

    return {
      text,
      quickReplies: result.quickReplies,
      meta: { strategy }
    };
  }
}
