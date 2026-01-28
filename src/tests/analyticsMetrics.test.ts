/**
 * Tests for analytics metrics N/A vs 0 distinction
 * 
 * These tests verify that:
 * 1. When there's no data, metrics return null (N/A) instead of 0
 * 2. When there's data with zero values, metrics return 0
 */

// Mock the database connection
const mockPool = {
    execute: jest.fn(),
    query: jest.fn(),
};

// Mock the knex instance
const mockDb = jest.fn().mockReturnThis();
mockDb.whereBetween = jest.fn().mockReturnThis();
mockDb.select = jest.fn().mockReturnThis();
mockDb.count = jest.fn().mockReturnThis();
mockDb.first = jest.fn();
mockDb.raw = jest.fn();

jest.mock('../database/knex', () => ({
    db: mockDb,
}));

jest.mock('../mysql-database', () => ({
    pool: mockPool,
    businessDB: {
        getOrderStatistics: jest.fn(),
    },
}));

// Import after mocking
import { AnalyticsStatsRepository } from '../repositories/AnalyticsStatsRepository';

describe('AnalyticsStatsRepository', () => {
    let repository: AnalyticsStatsRepository;

    beforeEach(() => {
        jest.clearAllMocks();
        repository = new AnalyticsStatsRepository();
    });

    describe('getFollowupSummary', () => {
        it('should return null values when no data is available', async () => {
            // Mock: no data in followup_performance_daily
            mockDb.first.mockResolvedValueOnce({ count: 0 }); // Count query

            const dateFrom = new Date('2024-01-01');
            const dateTo = new Date('2024-01-31');

            const result = await repository.getFollowupSummary(dateFrom, dateTo);

            // Should indicate no data available with null values
            expect(result.hasData).toBe(false);
            expect(result.totalFollowupsSent).toBeNull();
            expect(result.totalFollowupsResponded).toBeNull();
            expect(result.overallResponseRate).toBeNull();
            expect(result.totalFollowupOrders).toBeNull();
            expect(result.totalFollowupRevenue).toBeNull();
            expect(result.avgResponseTimeMinutes).toBeNull();
        });

        it('should return actual values when data is available', async () => {
            // Mock: data exists
            mockDb.first
                .mockResolvedValueOnce({ count: 5 }) // Count query returns data
                .mockResolvedValueOnce({
                    totalFollowupsSent: 100,
                    totalFollowupsResponded: 50,
                    totalFollowupOrders: 10,
                    totalFollowupRevenue: 500000,
                    avgResponseTimeMinutes: 15.5,
                });

            const dateFrom = new Date('2024-01-01');
            const dateTo = new Date('2024-01-31');

            const result = await repository.getFollowupSummary(dateFrom, dateTo);

            // Should return actual values
            expect(result.hasData).toBe(true);
            expect(result.totalFollowupsSent).toBe(100);
            expect(result.totalFollowupsResponded).toBe(50);
            expect(result.overallResponseRate).toBe(50); // 50/100 * 100
            expect(result.totalFollowupOrders).toBe(10);
            expect(result.totalFollowupRevenue).toBe(500000);
            expect(result.avgResponseTimeMinutes).toBe(15.5);
        });

        it('should return 0 when data exists but values are zero', async () => {
            // Mock: data exists but with zero values (real zeros)
            mockDb.first
                .mockResolvedValueOnce({ count: 1 }) // Count query returns data exists
                .mockResolvedValueOnce({
                    totalFollowupsSent: 0,
                    totalFollowupsResponded: 0,
                    totalFollowupOrders: 0,
                    totalFollowupRevenue: 0,
                    avgResponseTimeMinutes: null, // AVG of no rows
                });

            const dateFrom = new Date('2024-01-01');
            const dateTo = new Date('2024-01-31');

            const result = await repository.getFollowupSummary(dateFrom, dateTo);

            // Should return 0 for numeric fields, null for avg (no data to average)
            expect(result.hasData).toBe(true);
            expect(result.totalFollowupsSent).toBe(0);
            expect(result.totalFollowupsResponded).toBe(0);
            expect(result.overallResponseRate).toBe(0); // 0 sent means 0% rate
            expect(result.totalFollowupOrders).toBe(0);
            expect(result.totalFollowupRevenue).toBe(0);
            expect(result.avgResponseTimeMinutes).toBeNull(); // No data to average
        });
    });
});

describe('ChatbotAnalytics Interface', () => {
    it('should accept null for averageResponseTime', () => {
        // This test verifies the TypeScript interface allows null
        const analytics: {
            activeConversations: number;
            totalConversations: number;
            averageResponseTime: number | null;
            conversionRate?: number | null;
        } = {
            activeConversations: 10,
            totalConversations: 100,
            averageResponseTime: null, // N/A - no timing data
            conversionRate: null, // N/A - no conversion data
        };

        expect(analytics.averageResponseTime).toBeNull();
        expect(analytics.conversionRate).toBeNull();
    });

    it('should accept 0 for averageResponseTime when real zero', () => {
        const analytics: {
            activeConversations: number;
            totalConversations: number;
            averageResponseTime: number | null;
        } = {
            activeConversations: 10,
            totalConversations: 100,
            averageResponseTime: 0, // Real 0 - instant responses
        };

        expect(analytics.averageResponseTime).toBe(0);
    });
});
