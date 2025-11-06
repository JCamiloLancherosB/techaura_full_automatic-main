// export interface DemographicsData {
//     age?: number;
//     gender?: string;
//     country?: string;
//     city?: string;
//     occupation?: string;
//     maritalStatus?: string;
//     educationLevel?: string;
//     incomeLevel?: string;
//     [key: string]: any;
// }

// export interface PreferencesData {
//     genres?: string[];
//     artists?: string[];
//     movieTypes?: string[];
//     priceRange?: { min?: number; max?: number };
//     capacity?: any[];
//     language?: string;
//     notifications?: boolean;
//     favoriteBrands?: string[];
//     favoriteDevices?: string[];
//     preferredChannels?: string[];
//     [key: string]: any;
// }

// export interface DemographicsSummary {
//     ageGroups: Array<{ range: string; count: number }>;
//     genderDistribution: Array<{ gender: string; count: number }>;
//     topCountries: Array<{ country: string; count: number }>;
//     topCities: Array<{ city: string; count: number }>;
//     occupations: Array<{ occupation: string; count: number }>;
//     educationLevels: Array<{ level: string; count: number }>;
//     incomeLevels: Array<{ level: string; count: number }>;
// }

// export interface PreferencesSummary {
//     topGenres: Array<{ genre: string; count: number }>;
//     topArtists: Array<{ artist: string; count: number }>;
//     topMovieTypes: Array<{ type: string; count: number }>;
//     topCapacities: Array<{ capacity: string; count: number }>;
//     languages: Array<{ language: string; count: number }>;
//     notificationPreference: { enabled: number; disabled: number };
//     favoriteBrands: Array<{ brand: string; count: number }>;
//     favoriteDevices: Array<{ device: string; count: number }>;
//     preferredChannels: Array<{ channel: string; count: number }>;
// }

// export interface AnalyticsData {
//     totalUsers: number;
//     byStage: {
//         initial: number;
//         interested: number;
//         customizing: number;
//         pricing: number;
//         abandoned: number;
//         converted: number;
//         inactive: number;
//         paused: number;
//     };
//     avgBuyingIntent: number;
//     highRiskUsers: number;
//     topInterests: Array<{ interest: string; count: number }>;
//     recentInteractions: Array<{
//         phone: string;
//         name?: string;
//         stage: string;
//         buyingIntent: number;
//         lastInteraction: Date;
//         interests: string[];
//         demographics?: DemographicsData;
//         preferences?: PreferencesData;
//         location?: string;
//     }>;
//     demographicsSummary: DemographicsSummary;
//     preferencesSummary: PreferencesSummary;
//     mostActiveChannels: Array<{ channel: string; count: number }>;
//     lastUpdate: Date;
// }