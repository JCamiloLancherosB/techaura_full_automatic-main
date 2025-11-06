export interface UserSession {
    phone: string;
    name?: string;
    stage?: string;
    buyingIntent?: number;
    lastInteraction?: Date;
    lastFollowUp?: Date;
    followUpCount?: number;
    priorityScore?: number;
    urgencyLevel?: 'high' | 'medium' | 'low';
}

export interface FollowUpConfig {
    intervals: {
        mainCycle: number;
        maintenance: number;
        userDelay: number;
    };
    limits: {
        maxDailyFollowUps: number;
        spamProtectionHours: number;
        maxConcurrentProcessing: number;
    };
    urgencyRules: {
        [key: string]: {
            minDelayHours: number;
            maxDaily: number;
            buyingIntentThreshold: number;
        };
    };
}