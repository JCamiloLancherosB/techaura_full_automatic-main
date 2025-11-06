// ✅ SISTEMA DE REPORTES Y ESTADÍSTICAS CON GRÁFICOS
// src/services/reportingSystem.ts

import { UserSession } from '../../types/global';
import { businessDB } from '../mysql-database';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface BusinessMetrics {
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    conversionRate: number;
    activeUsers: number;
    newUsers: number;
    returningUsers: number;
}

export interface SalesAnalytics {
    dailySales: { date: string; amount: number; orders: number }[];
    weeklySales: { week: string; amount: number; orders: number }[];
    monthlySales: { month: string; amount: number; orders: number }[];
    topProducts: { name: string; quantity: number; revenue: number }[];
    topCategories: { category: string; quantity: number; revenue: number }[];
}

export interface CustomerAnalytics {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    vipCustomers: number;
    averageLifetimeValue: number;
    churnRate: number;
    satisfactionScore: number;
    topCustomers: { name: string; phone: string; totalSpent: number; orders: number }[];
}

export interface InventoryMetrics {
    totalProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    topSellingProducts: { name: string; sold: number; revenue: number }[];
    slowMovingProducts: { name: string; stock: number; lastSold: Date }[];
}

export interface MarketingMetrics {
    totalInteractions: number;
    averageResponseTime: number;
    botEfficiency: number;
    conversionFunnel: {
        stage: string;
        users: number;
        conversionRate: number;
    }[];
    topIntents: { intent: string; count: number; conversionRate: number }[];
    sentimentAnalysis: {
        positive: number;
        neutral: number;
        negative: number;
    };
}

export class ReportingSystem {
    private reportsDir: string;

    constructor() {
        this.reportsDir = join(process.cwd(), 'reports');
        this.ensureReportsDirectory();
    }

    private ensureReportsDirectory() {
        if (!existsSync(this.reportsDir)) {
            mkdirSync(this.reportsDir, { recursive: true });
        }
    }

    /**
     * ✅ GENERAR REPORTE COMPLETO DEL NEGOCIO
     */
    public async generateBusinessReport(sessions: UserSession[]): Promise<string> {
        const metrics = await this.calculateBusinessMetrics(sessions);
        const sales = await this.calculateSalesAnalytics(sessions);
        const customers = await this.calculateCustomerAnalytics(sessions);
        const marketing = await this.calculateMarketingMetrics(sessions);

        let report = '📊 *REPORTE DE NEGOCIO - TECHAURA*\n';
        report += `📅 Generado: ${new Date().toLocaleString('es-CO')}\n`;
        report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        // MÉTRICAS GENERALES
        report += '💼 *MÉTRICAS GENERALES*\n';
        report += `├─ 📦 Total Pedidos: ${metrics.totalOrders}\n`;
        report += `├─ ⏳ Pendientes: ${metrics.pendingOrders}\n`;
        report += `├─ ✅ Completados: ${metrics.completedOrders}\n`;
        report += `├─ ❌ Cancelados: ${metrics.cancelledOrders}\n`;
        report += `├─ 💰 Ingresos Totales: $${metrics.totalRevenue.toLocaleString()}\n`;
        report += `├─ 📊 Valor Promedio: $${metrics.averageOrderValue.toLocaleString()}\n`;
        report += `└─ 📈 Tasa Conversión: ${metrics.conversionRate.toFixed(1)}%\n\n`;

        // USUARIOS
        report += '👥 *USUARIOS*\n';
        report += `├─ 🔵 Activos: ${metrics.activeUsers}\n`;
        report += `├─ 🆕 Nuevos: ${metrics.newUsers}\n`;
        report += `└─ 🔄 Recurrentes: ${metrics.returningUsers}\n\n`;

        // VENTAS
        report += '💵 *ANÁLISIS DE VENTAS*\n';
        if (sales.dailySales.length > 0) {
            const today = sales.dailySales[sales.dailySales.length - 1];
            report += `├─ 📅 Hoy: $${today.amount.toLocaleString()} (${today.orders} pedidos)\n`;
        }
        if (sales.weeklySales.length > 0) {
            const thisWeek = sales.weeklySales[sales.weeklySales.length - 1];
            report += `├─ 📆 Esta Semana: $${thisWeek.amount.toLocaleString()} (${thisWeek.orders} pedidos)\n`;
        }
        if (sales.monthlySales.length > 0) {
            const thisMonth = sales.monthlySales[sales.monthlySales.length - 1];
            report += `└─ 📊 Este Mes: $${thisMonth.amount.toLocaleString()} (${thisMonth.orders} pedidos)\n\n`;
        }

        // TOP PRODUCTOS
        if (sales.topProducts.length > 0) {
            report += '🏆 *TOP PRODUCTOS*\n';
            sales.topProducts.slice(0, 5).forEach((product, index) => {
                const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
                report += `${emoji} ${product.name}\n`;
                report += `   └─ ${product.quantity} vendidos • $${product.revenue.toLocaleString()}\n`;
            });
            report += '\n';
        }

        // CLIENTES VIP
        if (customers.topCustomers.length > 0) {
            report += '💎 *CLIENTES VIP*\n';
            customers.topCustomers.slice(0, 3).forEach((customer, index) => {
                const emoji = ['👑', '⭐', '✨'][index];
                report += `${emoji} ${customer.name || 'Cliente'}\n`;
                report += `   └─ ${customer.orders} pedidos • $${customer.totalSpent.toLocaleString()}\n`;
            });
            report += '\n';
        }

        // MARKETING
        report += '📢 *MARKETING & ENGAGEMENT*\n';
        report += `├─ 💬 Interacciones: ${marketing.totalInteractions}\n`;
        report += `├─ ⚡ Eficiencia Bot: ${marketing.botEfficiency.toFixed(1)}%\n`;
        report += `└─ 😊 Sentimiento Positivo: ${marketing.sentimentAnalysis.positive}%\n\n`;

        // EMBUDO DE CONVERSIÓN
        if (marketing.conversionFunnel.length > 0) {
            report += '🎯 *EMBUDO DE CONVERSIÓN*\n';
            marketing.conversionFunnel.forEach(stage => {
                const bar = this.generateProgressBar(stage.conversionRate);
                report += `├─ ${stage.stage}: ${stage.users} usuarios\n`;
                report += `│  ${bar} ${stage.conversionRate.toFixed(1)}%\n`;
            });
            report += '\n';
        }

        report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        report += '📊 Reporte generado automáticamente por TechAura Bot';

        // Guardar reporte
        const filename = `reporte_${Date.now()}.txt`;
        const filepath = join(this.reportsDir, filename);
        writeFileSync(filepath, report);

        return report;
    }

    /**
     * ✅ CALCULAR MÉTRICAS DE NEGOCIO
     */
    private async calculateBusinessMetrics(sessions: UserSession[]): Promise<BusinessMetrics> {
        let totalOrders = 0;
        let pendingOrders = 0;
        let completedOrders = 0;
        let cancelledOrders = 0;
        let totalRevenue = 0;
        let activeUsers = 0;
        let newUsers = 0;
        let returningUsers = 0;

        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        sessions.forEach(session => {
            // Contar pedidos
            if (session.orderData) {
                totalOrders++;
                
                if (session.orderData.status === 'confirmed' || session.orderData.status === 'processing') {
                    completedOrders++;
                    totalRevenue += session.orderData.totalPrice || session.orderData.price || 0;
                } else if (session.orderData.status === 'draft') {
                    pendingOrders++;
                } else if (session.orderData.status === 'cancelled') {
                    cancelledOrders++;
                }
            }

            // Contar usuarios
            if (session.lastActivity && session.lastActivity > last24h) {
                activeUsers++;
            }

            if (session.isNewUser) {
                newUsers++;
            }

            if (session.isReturningUser || (session.totalOrders && session.totalOrders > 1)) {
                returningUsers++;
            }
        });

        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const conversionRate = sessions.length > 0 ? (completedOrders / sessions.length) * 100 : 0;

        return {
            totalOrders,
            pendingOrders,
            completedOrders,
            cancelledOrders,
            totalRevenue,
            averageOrderValue,
            conversionRate,
            activeUsers,
            newUsers,
            returningUsers
        };
    }

    /**
     * ✅ CALCULAR ANÁLISIS DE VENTAS
     */
    private async calculateSalesAnalytics(sessions: UserSession[]): Promise<SalesAnalytics> {
        const dailySales: Map<string, { amount: number; orders: number }> = new Map();
        const productSales: Map<string, { quantity: number; revenue: number }> = new Map();
        const categorySales: Map<string, { quantity: number; revenue: number }> = new Map();

        sessions.forEach(session => {
            if (session.orderData && session.orderData.confirmedAt) {
                const date = new Date(session.orderData.confirmedAt);
                const dateKey = date.toISOString().split('T')[0];
                
                const current = dailySales.get(dateKey) || { amount: 0, orders: 0 };
                current.amount += session.orderData.totalPrice || session.orderData.price || 0;
                current.orders += 1;
                dailySales.set(dateKey, current);

                // Productos
                const productName = session.contentType || 'USB Personalizada';
                const productCurrent = productSales.get(productName) || { quantity: 0, revenue: 0 };
                productCurrent.quantity += 1;
                productCurrent.revenue += session.orderData.totalPrice || session.orderData.price || 0;
                productSales.set(productName, productCurrent);

                // Categorías
                const category = this.getCategoryFromContentType(session.contentType);
                const categoryCurrent = categorySales.get(category) || { quantity: 0, revenue: 0 };
                categoryCurrent.quantity += 1;
                categoryCurrent.revenue += session.orderData.totalPrice || session.orderData.price || 0;
                categorySales.set(category, categoryCurrent);
            }
        });

        // Convertir a arrays
        const dailySalesArray = Array.from(dailySales.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const topProducts = Array.from(productSales.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue);

        const topCategories = Array.from(categorySales.entries())
            .map(([category, data]) => ({ category, ...data }))
            .sort((a, b) => b.revenue - a.revenue);

        return {
            dailySales: dailySalesArray,
            weeklySales: this.aggregateToWeekly(dailySalesArray),
            monthlySales: this.aggregateToMonthly(dailySalesArray),
            topProducts,
            topCategories
        };
    }

    /**
     * ✅ CALCULAR ANÁLISIS DE CLIENTES
     */
    private async calculateCustomerAnalytics(sessions: UserSession[]): Promise<CustomerAnalytics> {
        const customerMap: Map<string, { name: string; phone: string; totalSpent: number; orders: number }> = new Map();
        let totalCustomers = 0;
        let newCustomers = 0;
        let returningCustomers = 0;
        let vipCustomers = 0;
        let totalSpent = 0;

        sessions.forEach(session => {
            const phone = session.phoneNumber || session.phone;
            
            if (!customerMap.has(phone)) {
                totalCustomers++;
                customerMap.set(phone, {
                    name: session.name || 'Cliente',
                    phone,
                    totalSpent: 0,
                    orders: 0
                });
            }

            const customer = customerMap.get(phone)!;

            if (session.orderData && session.orderData.status === 'confirmed') {
                const orderValue = session.orderData.totalPrice || session.orderData.price || 0;
                customer.totalSpent += orderValue;
                customer.orders += 1;
                totalSpent += orderValue;
            }

            if (session.isNewUser) newCustomers++;
            if (session.isReturningUser) returningCustomers++;
            if (session.isVIP || session.tags?.includes('VIP')) vipCustomers++;
        });

        const topCustomers = Array.from(customerMap.values())
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 10);

        const averageLifetimeValue = totalCustomers > 0 ? totalSpent / totalCustomers : 0;
        const churnRate = 0; // Placeholder
        const satisfactionScore = this.calculateSatisfactionScore(sessions);

        return {
            totalCustomers,
            newCustomers,
            returningCustomers,
            vipCustomers,
            averageLifetimeValue,
            churnRate,
            satisfactionScore,
            topCustomers
        };
    }

    /**
     * ✅ CALCULAR MÉTRICAS DE MARKETING
     */
    private async calculateMarketingMetrics(sessions: UserSession[]): Promise<MarketingMetrics> {
        let totalInteractions = 0;
        let botResponses = 0;
        const intentCounts: Map<string, { count: number; conversions: number }> = new Map();
        const stageCounts: Map<string, number> = new Map();
        let positiveCount = 0;
        let neutralCount = 0;
        let negativeCount = 0;

        sessions.forEach(session => {
            totalInteractions += session.interactions?.length || 0;

            // Contar respuestas del bot
            session.interactions?.forEach(interaction => {
                if (interaction.respondedByBot) {
                    botResponses++;
                }

                // Sentimiento
                if (interaction.sentiment === 'positive') positiveCount++;
                else if (interaction.sentiment === 'negative') negativeCount++;
                else neutralCount++;

                // Intents
                if (interaction.intent) {
                    const current = intentCounts.get(interaction.intent) || { count: 0, conversions: 0 };
                    current.count++;
                    if (session.stage === 'converted') {
                        current.conversions++;
                    }
                    intentCounts.set(interaction.intent, current);
                }
            });

            // Stages
            if (session.stage) {
                stageCounts.set(session.stage, (stageCounts.get(session.stage) || 0) + 1);
            }
        });

        const botEfficiency = totalInteractions > 0 ? (botResponses / totalInteractions) * 100 : 0;
        const totalSentiment = positiveCount + neutralCount + negativeCount;

        const topIntents = Array.from(intentCounts.entries())
            .map(([intent, data]) => ({
                intent,
                count: data.count,
                conversionRate: data.count > 0 ? (data.conversions / data.count) * 100 : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const conversionFunnel = this.buildConversionFunnel(stageCounts, sessions.length);

        return {
            totalInteractions,
            averageResponseTime: 0, // Placeholder
            botEfficiency,
            conversionFunnel,
            topIntents,
            sentimentAnalysis: {
                positive: totalSentiment > 0 ? Math.round((positiveCount / totalSentiment) * 100) : 0,
                neutral: totalSentiment > 0 ? Math.round((neutralCount / totalSentiment) * 100) : 0,
                negative: totalSentiment > 0 ? Math.round((negativeCount / totalSentiment) * 100) : 0
            }
        };
    }

    /**
     * ✅ GENERAR GRÁFICO ASCII DE BARRAS
     */
    public generateBarChart(data: { label: string; value: number }[], maxWidth: number = 20): string {
        const maxValue = Math.max(...data.map(d => d.value));
        let chart = '';

        data.forEach(item => {
            const barLength = Math.round((item.value / maxValue) * maxWidth);
            const bar = '█'.repeat(barLength);
            chart += `${item.label.padEnd(15)} ${bar} ${item.value}\n`;
        });

        return chart;
    }

    /**
     * ✅ GENERAR BARRA DE PROGRESO
     */
    private generateProgressBar(percentage: number, width: number = 10): string {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * ✅ HELPERS
     */
    private getCategoryFromContentType(contentType?: string): string {
        if (!contentType) return 'Otros';
        if (contentType.includes('music') || contentType.includes('musica')) return 'Música';
        if (contentType.includes('video')) return 'Videos';
        if (contentType.includes('movie') || contentType.includes('pelicula')) return 'Películas';
        return 'Otros';
    }

    private aggregateToWeekly(dailySales: { date: string; amount: number; orders: number }[]): { week: string; amount: number; orders: number }[] {
        const weeklySales: Map<string, { amount: number; orders: number }> = new Map();

        dailySales.forEach(day => {
            const date = new Date(day.date);
            const weekNumber = this.getWeekNumber(date);
            const weekKey = `Semana ${weekNumber}`;

            const current = weeklySales.get(weekKey) || { amount: 0, orders: 0 };
            current.amount += day.amount;
            current.orders += day.orders;
            weeklySales.set(weekKey, current);
        });

        return Array.from(weeklySales.entries()).map(([week, data]) => ({ week, ...data }));
    }

    private aggregateToMonthly(dailySales: { date: string; amount: number; orders: number }[]): { month: string; amount: number; orders: number }[] {
        const monthlySales: Map<string, { amount: number; orders: number }> = new Map();

        dailySales.forEach(day => {
            const date = new Date(day.date);
            const monthKey = date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });

            const current = monthlySales.get(monthKey) || { amount: 0, orders: 0 };
            current.amount += day.amount;
            current.orders += day.orders;
            monthlySales.set(monthKey, current);
        });

        return Array.from(monthlySales.entries()).map(([month, data]) => ({ month, ...data }));
    }

    private getWeekNumber(date: Date): number {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

    private calculateSatisfactionScore(sessions: UserSession[]): number {
        let totalScore = 0;
        let count = 0;

        sessions.forEach(session => {
            if (session.interactions) {
                session.interactions.forEach(interaction => {
                    if (interaction.sentiment === 'positive') {
                        totalScore += 100;
                        count++;
                    } else if (interaction.sentiment === 'neutral') {
                        totalScore += 50;
                        count++;
                    } else if (interaction.sentiment === 'negative') {
                        totalScore += 0;
                        count++;
                    }
                });
            }
        });

        return count > 0 ? totalScore / count : 0;
    }

    private buildConversionFunnel(stageCounts: Map<string, number>, totalUsers: number): { stage: string; users: number; conversionRate: number }[] {
        const stages = ['initial', 'interested', 'customizing', 'closing', 'converted'];
        const funnel: { stage: string; users: number; conversionRate: number }[] = [];

        stages.forEach(stage => {
            const users = stageCounts.get(stage) || 0;
            const conversionRate = totalUsers > 0 ? (users / totalUsers) * 100 : 0;
            funnel.push({
                stage: this.translateStage(stage),
                users,
                conversionRate
            });
        });

        return funnel;
    }

    private translateStage(stage: string): string {
        const translations: Record<string, string> = {
            initial: 'Inicial',
            interested: 'Interesado',
            customizing: 'Personalizando',
            closing: 'Cerrando',
            converted: 'Convertido'
        };
        return translations[stage] || stage;
    }

    /**
     * ✅ GENERAR REPORTE DE PEDIDOS PENDIENTES
     */
    public generatePendingOrdersReport(sessions: UserSession[]): string {
        const pendingOrders = sessions.filter(s => 
            s.orderData && 
            (s.orderData.status === 'draft' || s.orderData.status === 'processing')
        );

        let report = '📋 *PEDIDOS PENDIENTES*\n';
        report += `📅 ${new Date().toLocaleString('es-CO')}\n`;
        report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        if (pendingOrders.length === 0) {
            report += '✅ No hay pedidos pendientes\n';
        } else {
            report += `Total: ${pendingOrders.length} pedidos\n\n`;

            pendingOrders.forEach((session, index) => {
                report += `${index + 1}. 📦 Pedido #${session.orderId || 'N/A'}\n`;
                report += `   👤 Cliente: ${session.name || 'Sin nombre'}\n`;
                report += `   📱 Teléfono: ${session.phoneNumber}\n`;
                report += `   💰 Valor: $${(session.orderData?.totalPrice || 0).toLocaleString()}\n`;
                report += `   📊 Estado: ${session.orderData?.status || 'draft'}\n`;
                report += `   🕐 Creado: ${session.orderData?.createdAt ? new Date(session.orderData.createdAt).toLocaleString('es-CO') : 'N/A'}\n\n`;
            });
        }

        report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        return report;
    }
}

// Exportar instancia singleton
export const reportingSystem = new ReportingSystem();
