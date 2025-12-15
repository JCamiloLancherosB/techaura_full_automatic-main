/**
 * Flow Logger Service
 * Dedicated service for logging flow transitions and phase changes
 */

import { businessDB } from '../mysql-database';

export interface FlowAnalytics {
    phone: string;
    totalPhases: number;
    completedPhases: number;
    currentPhase: string;
    currentFlow: string;
    phaseHistory: PhaseRecord[];
    averagePhaseDuration: number;
    totalDuration: number;
    dataCaptures: DataCaptureRecord[];
}

export interface PhaseRecord {
    phaseId: string;
    flow: string;
    phase: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    data?: any;
}

export interface DataCaptureRecord {
    timestamp: Date;
    dataType: string;
    value: any;
    phase: string;
}

export class FlowLogger {
    private static instance: FlowLogger;
    private activePhases = new Map<string, PhaseRecord>();
    private phaseHistory = new Map<string, PhaseRecord[]>();
    private dataCaptures = new Map<string, DataCaptureRecord[]>();
    
    static getInstance(): FlowLogger {
        if (!FlowLogger.instance) {
            FlowLogger.instance = new FlowLogger();
        }
        return FlowLogger.instance;
    }
    
    /**
     * Log the start of a phase
     */
    async logPhaseStart(phone: string, flow: string, phase: string): Promise<string> {
        const phaseId = `${phone}_${flow}_${phase}_${Date.now()}`;
        
        const record: PhaseRecord = {
            phaseId,
            flow,
            phase,
            startTime: new Date()
        };
        
        this.activePhases.set(phaseId, record);
        
        // Add to history
        if (!this.phaseHistory.has(phone)) {
            this.phaseHistory.set(phone, []);
        }
        this.phaseHistory.get(phone)!.push(record);
        
        console.log(`📊 Phase started: ${flow} -> ${phase} for ${phone}`);
        
        return phaseId;
    }
    
    /**
     * Log the end of a phase with captured data
     */
    async logPhaseEnd(phaseId: string, data?: any): Promise<void> {
        const record = this.activePhases.get(phaseId);
        if (!record) {
            console.warn(`⚠️ Phase ${phaseId} not found in active phases`);
            return;
        }
        
        record.endTime = new Date();
        record.duration = record.endTime.getTime() - record.startTime.getTime();
        record.data = data;
        
        this.activePhases.delete(phaseId);
        
        console.log(`✅ Phase ended: ${record.flow} -> ${record.phase} (${record.duration}ms)`);
    }
    
    /**
     * Log data capture during a phase
     */
    async logDataCapture(phone: string, dataType: string, value: any, phase?: string): Promise<void> {
        if (!this.dataCaptures.has(phone)) {
            this.dataCaptures.set(phone, []);
        }
        
        const capture: DataCaptureRecord = {
            timestamp: new Date(),
            dataType,
            value,
            phase: phase || 'unknown'
        };
        
        this.dataCaptures.get(phone)!.push(capture);
        
        // Persist to database if available
        try {
            await businessDB.logConversationTurn({
                phone,
                role: 'system',
                content: `Data captured: ${dataType}`,
                metadata: { dataType, value, phase },
                timestamp: new Date()
            });
        } catch (error) {
            console.error('❌ Error persisting data capture:', error);
        }
        
        console.log(`📝 Data captured for ${phone}: ${dataType} = ${JSON.stringify(value)}`);
    }
    
    /**
     * Get analytics for a user's flow progress
     */
    async getFlowAnalytics(phone: string): Promise<FlowAnalytics> {
        const history = this.phaseHistory.get(phone) || [];
        const captures = this.dataCaptures.get(phone) || [];
        
        const completedPhases = history.filter(p => p.endTime);
        const totalDuration = completedPhases.reduce((sum, p) => sum + (p.duration || 0), 0);
        const averagePhaseDuration = completedPhases.length > 0 
            ? totalDuration / completedPhases.length 
            : 0;
        
        const currentPhaseRecord = Array.from(this.activePhases.values())
            .find(p => p.phaseId.startsWith(phone));
        
        return {
            phone,
            totalPhases: history.length,
            completedPhases: completedPhases.length,
            currentPhase: currentPhaseRecord?.phase || 'none',
            currentFlow: currentPhaseRecord?.flow || 'none',
            phaseHistory: history,
            averagePhaseDuration,
            totalDuration,
            dataCaptures: captures
        };
    }
    
    /**
     * Clean up old data (keep last 7 days)
     */
    cleanup(): void {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        for (const [phone, history] of this.phaseHistory.entries()) {
            const recentHistory = history.filter(p => p.startTime > sevenDaysAgo);
            if (recentHistory.length === 0) {
                this.phaseHistory.delete(phone);
            } else {
                this.phaseHistory.set(phone, recentHistory);
            }
        }
        
        for (const [phone, captures] of this.dataCaptures.entries()) {
            const recentCaptures = captures.filter(c => c.timestamp > sevenDaysAgo);
            if (recentCaptures.length === 0) {
                this.dataCaptures.delete(phone);
            } else {
                this.dataCaptures.set(phone, recentCaptures);
            }
        }
    }
    
    /**
     * Get current statistics
     */
    getStats() {
        return {
            activePhases: this.activePhases.size,
            totalUsers: this.phaseHistory.size,
            totalCaptures: Array.from(this.dataCaptures.values()).reduce((sum, arr) => sum + arr.length, 0)
        };
    }
}

// Export singleton instance
export const flowLogger = FlowLogger.getInstance();

// Start cleanup interval (once per hour)
setInterval(() => flowLogger.cleanup(), 60 * 60 * 1000);
