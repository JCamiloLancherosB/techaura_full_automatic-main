// src/flows/analyticsSummaryHelpers.ts
import type { 
    UserSession, 
    DemographicsSummary, 
    PreferencesSummary,
    DemographicsData,
    PreferencesData 
} from '../../types/global';

export function calculateDemographicsSummary(sessions: UserSession[]): DemographicsSummary {
    // ✅ CORREGIDO: Validación de entrada
    if (!Array.isArray(sessions)) {
        console.warn('calculateDemographicsSummary: sessions no es un array válido');
        return createEmptyDemographicsSummary();
    }

    const ageGroups: Record<string, number> = {};
    const genderDistribution: Record<string, number> = {};
    const countryCount: Record<string, number> = {};
    const cityCount: Record<string, number> = {};
    const occupations: Record<string, number> = {};
    const educationLevels: Record<string, number> = {};
    const incomeLevels: Record<string, number> = {};

    for (const session of sessions) {
        // ✅ CORREGIDO: Validación de sesión individual
        if (!session || typeof session !== 'object') continue;
        
        const d = session.demographics || {};
        
        // ✅ CORREGIDO: Procesamiento seguro de edad con validación
        const age = validateNumber(d.age, 0, 120);
        if (age !== null) {
            let range = '';
            if (age < 18) range = '<18';
            else if (age < 25) range = '18-24';
            else if (age < 35) range = '25-34';
            else if (age < 45) range = '35-44';
            else if (age < 60) range = '45-59';
            else range = '60+';
            ageGroups[range] = (ageGroups[range] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de género
        const gender = validateString(d.gender, 20);
        if (gender) {
            genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de país
        const country = validateString(d.country, 50);
        if (country) {
            countryCount[country] = (countryCount[country] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de ciudad
        const city = validateString(d.city, 50);
        if (city) {
            cityCount[city] = (cityCount[city] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de ocupación
        const occupation = validateString(d.occupation, 50);
        if (occupation) {
            occupations[occupation] = (occupations[occupation] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de nivel educativo
        const educationLevel = validateString(d.educationLevel, 50);
        if (educationLevel) {
            educationLevels[educationLevel] = (educationLevels[educationLevel] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de nivel de ingresos
        const incomeLevel = validateString(d.incomeLevel, 30);
        if (incomeLevel) {
            incomeLevels[incomeLevel] = (incomeLevels[incomeLevel] || 0) + 1;
        }
    }

    return {
        ageGroups: Object.entries(ageGroups)
            .map(([range, count]) => ({ range, count }))
            .sort((a, b) => b.count - a.count),
            
        genderDistribution: Object.entries(genderDistribution)
            .map(([gender, count]) => ({ gender, count }))
            .sort((a, b) => b.count - a.count),
            
        topCountries: Object.entries(countryCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([country, count]) => ({ country, count })),
            
        topCities: Object.entries(cityCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([city, count]) => ({ city, count })),
            
        occupations: Object.entries(occupations)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([occupation, count]) => ({ occupation, count })),
            
        educationLevels: Object.entries(educationLevels)
            .map(([level, count]) => ({ level, count }))
            .sort((a, b) => b.count - a.count),
            
        incomeLevels: Object.entries(incomeLevels)
            .map(([level, count]) => ({ level, count }))
            .sort((a, b) => b.count - a.count),
        
        locations: countryCount,
        genders: genderDistribution,
        incomeRanges: incomeLevels,
    };
}

function normalizeToArray(value: any): string[] {
    if (!value) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter(item => typeof item === 'string' && item.trim().length > 0);
    return [];
}

function validateNumber(value: any, min: number = 0, max: number = 150): number | null {
    if (typeof value === 'number' && !isNaN(value) && value >= min && value <= max) {
        return value;
    }
    return null;
}

function validateString(value: any, maxLength: number = 100): string | null {
    if (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength) {
        return value.trim();
    }
    return null;
}

export function calculatePreferencesSummary(sessions: UserSession[]): PreferencesSummary {
    // ✅ CORREGIDO: Validación de entrada
    if (!Array.isArray(sessions)) {
        console.warn('calculatePreferencesSummary: sessions no es un array válido');
        return createEmptyPreferencesSummary();
    }

    const genreCount: Record<string, number> = {};
    const artistCount: Record<string, number> = {};
    const movieTypeCount: Record<string, number> = {};
    const capacityCount: Record<string, number> = {};
    const colorCount: Record<string, number> = {};
    const languageCount: Record<string, number> = {};
    const notificationPref = { enabled: 0, disabled: 0 };
    const brandCount: Record<string, number> = {};
    const deviceCount: Record<string, number> = {};
    const channelCount: Record<string, number> = {};
    const priceRanges: Record<string, number> = {};
    const usagePatterns: Record<string, number> = {};
    const featuresCount: Record<string, number> = {};

    for (const session of sessions) {
        // ✅ CORREGIDO: Validación de sesión individual
        if (!session || typeof session !== 'object') continue;
        
        const p = session.preferences || {};
        
        // ✅ CORREGIDO: Procesamiento seguro de arrays y strings
        normalizeToArray(p.genres).forEach(g => {
            if (g && g.length > 0) genreCount[g] = (genreCount[g] || 0) + 1;
        });
        
        normalizeToArray(p.artists).forEach(a => {
            if (a && a.length > 0) artistCount[a] = (artistCount[a] || 0) + 1;
        });
        
        normalizeToArray(p.movieTypes).forEach(t => {
            if (t && t.length > 0) movieTypeCount[t] = (movieTypeCount[t] || 0) + 1;
        });
        
        // ✅ CORREGIDO: Procesamiento seguro de capacidad
        normalizeToArray(p.capacity).forEach(c => {
            const capacity = String(c).trim();
            if (capacity.length > 0) capacityCount[capacity] = (capacityCount[capacity] || 0) + 1;
        });
        
        normalizeToArray(p.favoriteBrands).forEach(b => {
            if (b && b.length > 0) brandCount[b] = (brandCount[b] || 0) + 1;
        });
        
        normalizeToArray(p.favoriteDevices).forEach(d => {
            if (d && d.length > 0) deviceCount[d] = (deviceCount[d] || 0) + 1;
        });
        
        normalizeToArray(p.preferredChannels).forEach(ch => {
            if (ch && ch.length > 0) channelCount[ch] = (channelCount[ch] || 0) + 1;
        });
        
        // ✅ CORREGIDO: Procesamiento seguro de color
        const color = validateString(p.color, 30);
        if (color) {
            colorCount[color] = (colorCount[color] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de géneros musicales
        normalizeToArray(p.musicGenres).forEach(mg => {
            if (mg && mg.length > 0) genreCount[mg] = (genreCount[mg] || 0) + 1;
        });
        
        // ✅ CORREGIDO: Procesamiento seguro de género musical individual
        const musicGenre = validateString(p.musicGenre, 50);
        if (musicGenre) {
            genreCount[musicGenre] = (genreCount[musicGenre] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de idioma
        const language = validateString(p.language, 30);
        if (language) {
            languageCount[language] = (languageCount[language] || 0) + 1;
        }
        
        // ✅ CORREGIDO: Procesamiento seguro de notificaciones
        if (typeof p.notifications === 'boolean') {
            if (p.notifications) notificationPref.enabled++;
            else notificationPref.disabled++;
        }
        // ✅ CORREGIDO: Procesamiento seguro de rango de precios
        if (p.priceRange && typeof p.priceRange === 'object') {
            const min = validateNumber(p.priceRange.min, 0, 999999);
            const max = validateNumber(p.priceRange.max, 0, 999999);
            
            if (min !== null || max !== null) {
                const minValue = min || 0;
                const maxValue = max || 999999;
                const range = `${minValue}-${maxValue}`;
                priceRanges[range] = (priceRanges[range] || 0) + 1;
            }
        }
        
        // ✅ CORREGIDO: Análisis seguro de patrones de uso
        const patterns: string[] = [];
        
        if (typeof p.notifications === 'boolean' && p.notifications) {
            patterns.push('notifications_enabled');
        }
        
        if (p.priceRange && typeof p.priceRange === 'object') {
            const maxPrice = validateNumber(p.priceRange.max, 0, 999999);
            if (maxPrice !== null) {
                if (maxPrice > 100000) patterns.push('premium_user');
                else if (maxPrice < 50000) patterns.push('budget_conscious');
                else patterns.push('mid_range_user');
            }
        }
        
        const genresArray = normalizeToArray(p.genres);
        if (genresArray.length > 3) patterns.push('diverse_tastes');
        
        const artistsArray = normalizeToArray(p.artists);
        if (artistsArray.length > 5) patterns.push('music_enthusiast');
        
        const brandsArray = normalizeToArray(p.favoriteBrands);
        if (brandsArray.length > 2) patterns.push('brand_conscious');
        
        patterns.forEach(pattern => {
            if (pattern && pattern.length > 0) {
                usagePatterns[pattern] = (usagePatterns[pattern] || 0) + 1;
            }
        });
        
        // ✅ CORREGIDO: Análisis seguro de características
        const features: string[] = [];
        
        if (normalizeToArray(p.capacity).length > 0) features.push('storage_conscious');
        if (brandsArray.length > 0) features.push('brand_loyal');
        
        const devicesArray = normalizeToArray(p.favoriteDevices);
        if (devicesArray.length > 2) features.push('tech_savvy');
        
        const channelsArray = normalizeToArray(p.preferredChannels);
        if (channelsArray.length > 1) features.push('multi_channel');
        
        if (genresArray.length > 0) features.push('music_lover');
        if (p.color && validateString(p.color, 30)) features.push('design_conscious');
        
        features.forEach(feature => {
            if (feature && feature.length > 0) {
                featuresCount[feature] = (featuresCount[feature] || 0) + 1;
            }
        });
    }

    return {
        topGenres: Object.entries(genreCount)
            .filter(([genre, count]) => genre && genre.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([genre, count]) => ({ genre, count })),
            
        topArtists: Object.entries(artistCount)
            .filter(([artist, count]) => artist && artist.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([artist, count]) => ({ artist, count })),
            
        topMovieTypes: Object.entries(movieTypeCount)
            .filter(([type, count]) => type && type.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => ({ type, count })),
            
        topCapacities: Object.entries(capacityCount)
            .filter(([capacity, count]) => capacity && capacity.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([capacity, count]) => ({ capacity, count })),
        
        topColors: Object.entries(colorCount)
            .filter(([color, count]) => color && color.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([color]) => color),
            
        topBrands: Object.entries(brandCount)
            .filter(([brand, count]) => brand && brand.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([brand]) => brand),
            
        topFeatures: Object.entries(featuresCount)
            .filter(([feature, count]) => feature && feature.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([feature]) => feature),
        
        musicGenres: genreCount,
        capacities: capacityCount,
        colors: colorCount,
        priceRanges,
        usagePatterns,
        
        languages: Object.entries(languageCount)
            .filter(([language, count]) => language && language.length > 0 && count > 0)
            .map(([language, count]) => ({ language, count }))
            .sort((a, b) => b.count - a.count),
            
        notificationPreference: notificationPref,
        
        favoriteBrands: Object.entries(brandCount)
            .filter(([brand, count]) => brand && brand.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([brand, count]) => ({ brand, count })),
            
        favoriteDevices: Object.entries(deviceCount)
            .filter(([device, count]) => device && device.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([device, count]) => ({ device, count })),
            
        preferredChannels: Object.entries(channelCount)
            .filter(([channel, count]) => channel && channel.length > 0 && count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([channel, count]) => ({ channel, count })),
    };
}

// ✅ CORREGIDO: Funciones auxiliares para crear objetos vacíos en caso de error
function createEmptyDemographicsSummary(): DemographicsSummary {
    return {
        ageGroups: [],
        genderDistribution: [],
        topCountries: [],
        topCities: [],
        occupations: [],
        educationLevels: [],
        incomeLevels: [],
        locations: {},
        genders: {},
        incomeRanges: {},
    };
}

function createEmptyPreferencesSummary(): PreferencesSummary {
    return {
        topGenres: [],
        topArtists: [],
        topMovieTypes: [],
        topCapacities: [],
        topColors: [],
        topBrands: [],
        topFeatures: [],
        musicGenres: {},
        capacities: {},
        colors: {},
        priceRanges: {},
        usagePatterns: {},
        languages: [],
        notificationPreference: { enabled: 0, disabled: 0 },
        favoriteBrands: [],
        favoriteDevices: [],
        preferredChannels: [],
    };
}

export function calculateTrends(sessions: UserSession[]): {
    growthRate: number;
    popularityTrends: Record<string, number>;
    seasonalPatterns: Record<string, number>;
} {
    const monthlyCount: Record<string, number> = {};
    const genreTrends: Record<string, number> = {};
    
    for (const session of sessions) {
        // Analizar crecimiento mensual
        if (session.createdAt) {
            const month = new Date(session.createdAt).toISOString().slice(0, 7); // YYYY-MM
            monthlyCount[month] = (monthlyCount[month] || 0) + 1;
        }
        
        // Analizar tendencias de géneros usando propiedades existentes
        const preferences = session.preferences || {};
        normalizeToArray(preferences.genres).forEach(genre => {
            genreTrends[genre] = (genreTrends[genre] || 0) + 1;
        });
        
        // También incluir musicGenres y musicGenre
        normalizeToArray(preferences.musicGenres).forEach(genre => {
            genreTrends[genre] = (genreTrends[genre] || 0) + 1;
        });
        
        if (preferences.musicGenre) {
            genreTrends[preferences.musicGenre] = (genreTrends[preferences.musicGenre] || 0) + 1;
        }
    }
    
    // Calcular tasa de crecimiento
    const months = Object.keys(monthlyCount).sort();
    const growthRate = months.length >= 2 
        ? ((monthlyCount[months[months.length - 1]] || 0) - (monthlyCount[months[0]] || 0)) / (monthlyCount[months[0]] || 1) * 100
        : 0;
    
    return {
        growthRate,
        popularityTrends: genreTrends,
        seasonalPatterns: monthlyCount
    };
}
