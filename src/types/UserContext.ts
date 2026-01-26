export type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'postpurchase';

export interface UserContext {
  phone: string;
  firstName?: string;
  locale?: string;
  timezone?: string;
  stage?: JourneyStage;
  intent?: string;
  source?: string;
  preferences?: {
    contentTypes?: string[];
    genres?: string[];
    languages?: string[];
    quality?: string;
    capacityPreference?: string;
  };
  signals?: {
    budgetRange?: string;
    urgency?: 'low' | 'medium' | 'high';
    trustLevel?: 'low' | 'medium' | 'high';
  };
  history?: {
    lastInteractionAt?: Date | string;
    messagesCount?: number;
    previousOrdersCount?: number;
    lastOrderStatus?: string;
  };
  objections?: string[];
  cart?: {
    selectedProduct?: string;
    capacity?: string;
    priceQuoted?: number;
    deliveryETA?: string;
  };
  flow?: {
    currentFlow?: string;
    currentStep?: string;
    progressPercent?: number;
  };
}
