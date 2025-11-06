// src/services/aiMonitoring.ts
interface AIStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    lastError: string | null;
    lastErrorTime: Date | null;
}

class AIMonitoringService {
    private stats: AIStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        lastError: null,
        lastErrorTime: null
    };

    private responseTimes: number[] = [];

    public logRequest(operation: string): void {
        this.stats.totalRequests++;
        console.log(`🤖 AI Request: ${operation}`);
    }

    public logSuccess(operation: string, responseTime?: number): void {
        this.stats.successfulRequests++;
        
        if (responseTime) {
            this.responseTimes.push(responseTime);
            if (this.responseTimes.length > 100) {
                this.responseTimes.shift();
            }
            this.stats.averageResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
        }
        
        console.log(`✅ AI Success: ${operation}`);
    }

    public logError(operation: string, error: any): void {
        this.stats.failedRequests++;
        this.stats.lastError = error?.message || 'Unknown error';
        this.stats.lastErrorTime = new Date();
        
        console.error(`❌ AI Error in ${operation}:`, error);
    }

    public logWarning(message: string): void {
        console.warn(`⚠️ AI Warning: ${message}`);
    }

    public getStats(): AIStats {
        return { ...this.stats };
    }

    public getSuccessRate(): number {
        if (this.stats.totalRequests === 0) return 0;
        return (this.stats.successfulRequests / this.stats.totalRequests) * 100;
    }

    public reset(): void {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            lastError: null,
            lastErrorTime: null
        };
        this.responseTimes = [];
    }
}

const AIMonitoring = new AIMonitoringService();
export default AIMonitoring;
