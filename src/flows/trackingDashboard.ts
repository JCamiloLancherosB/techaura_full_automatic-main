import { addKeyword } from '@builderbot/bot';
import { getUserAnalytics } from './userTrackingSystem';

const trackingDashboard = addKeyword(['dashboard', 'estadisticas', 'analytics'])
    .addAction(async (ctx: any, { flowDynamic }: any) => {
        const analytics = getUserAnalytics();
        await flowDynamic([
            `📊 *Dashboard de Seguimiento de Usuarios*\n`,
            `👥 Total de usuarios: ${analytics.totalUsers}`,
            `📈 Intención de compra promedio: ${analytics.avgBuyingIntent.toFixed(1)}%`,
            `⚠️ Usuarios de alto riesgo: ${analytics.highRiskUsers}`,
            `\n📋 *Por etapa:*`,
            ...Object.entries(analytics.byStage).map(([stage, count]) => `• ${stage}: ${count}`),
            `\n🎵 *Géneros más populares:*`,
            ...analytics.topInterests.map(item => `• ${item.interest}: ${item.count} usuarios`),
            `\n🌍 *Demográficos principales:*`,
            ...analytics.demographicsSummary.topCountries.map(item => `• ${item.country}: ${item.count}`),
            ...analytics.demographicsSummary.genderDistribution.map(item => `• ${item.gender}: ${item.count}`),
            `\n⭐ *Capacidades más solicitadas:*`,
            ...analytics.preferencesSummary.topCapacities.map(item => `• ${item.capacity}: ${item.count}`),
            `\n📡 *Canales más activos:*`,
            ...analytics.mostActiveChannels.map(item => `• ${item.channel}: ${item.count}`),
        ]);
    });

export default trackingDashboard;