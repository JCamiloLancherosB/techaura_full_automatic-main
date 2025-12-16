/**
 * System Integrity Verification Script
 * Verifies database connection, AI service, environment variables, and intent classifier
 */

import dotenv from 'dotenv';
dotenv.config();

import { unifiedLogger } from '../utils/unifiedLogger';

interface VerificationResult {
    name: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
    details?: any;
}

class IntegrityVerifier {
    private results: VerificationResult[] = [];
    private criticalFailures = 0;

    /**
     * Verify environment variables
     */
    async verifyEnvironmentVariables(): Promise<VerificationResult> {
        unifiedLogger.info('system', 'Verifying environment variables...');

        const required = [
            'MYSQL_DB_HOST',
            'MYSQL_DB_USER',
            'MYSQL_DB_NAME',
            'PORT'
        ];

        const optional = [
            'GEMINI_API_KEY',
            'COHERE_API_KEY',
            'MYSQL_DB_PASSWORD'
        ];

        const missing: string[] = [];
        const present: string[] = [];
        const optionalMissing: string[] = [];

        required.forEach(key => {
            if (process.env[key]) {
                present.push(key);
            } else {
                missing.push(key);
            }
        });

        optional.forEach(key => {
            if (!process.env[key]) {
                optionalMissing.push(key);
            }
        });

        if (missing.length > 0) {
            this.criticalFailures++;
            return {
                name: 'Environment Variables',
                status: 'fail',
                message: `Missing required environment variables: ${missing.join(', ')}`,
                details: { missing, present, optionalMissing }
            };
        }

        const status = optionalMissing.length > 0 ? 'warning' : 'pass';
        return {
            name: 'Environment Variables',
            status,
            message: optionalMissing.length > 0
                ? `All required variables present. Optional missing: ${optionalMissing.join(', ')}`
                : 'All environment variables configured',
            details: { present, optionalMissing }
        };
    }

    /**
     * Verify database connection
     */
    async verifyDatabaseConnection(): Promise<VerificationResult> {
        unifiedLogger.info('system', 'Verifying database connection...');

        try {
            const { businessDB } = await import('../mysql-database');

            // Check if businessDB has checkConnection method
            if (typeof businessDB.checkConnection === 'function') {
                const isConnected = await businessDB.checkConnection();
                
                if (isConnected) {
                    return {
                        name: 'Database Connection',
                        status: 'pass',
                        message: 'Database connection successful',
                        details: { type: 'MySQL' }
                    };
                } else {
                    this.criticalFailures++;
                    return {
                        name: 'Database Connection',
                        status: 'fail',
                        message: 'Database connection failed',
                        details: { type: 'MySQL' }
                    };
                }
            } else {
                return {
                    name: 'Database Connection',
                    status: 'warning',
                    message: 'Database object exists but checkConnection method not available',
                    details: { 
                        type: 'MySQL',
                        availableMethods: Object.keys(businessDB).filter(k => typeof businessDB[k] === 'function')
                    }
                };
            }
        } catch (error) {
            this.criticalFailures++;
            return {
                name: 'Database Connection',
                status: 'fail',
                message: `Database connection error: ${error instanceof Error ? error.message : String(error)}`,
                details: { error: String(error) }
            };
        }
    }

    /**
     * Verify AI service availability
     */
    async verifyAIService(): Promise<VerificationResult> {
        unifiedLogger.info('system', 'Verifying AI service...');

        try {
            const { aiService } = await import('../services/aiService');

            if (typeof aiService.isAvailable === 'function') {
                const isAvailable = aiService.isAvailable();
                
                if (isAvailable) {
                    return {
                        name: 'AI Service',
                        status: 'pass',
                        message: 'AI service is available',
                        details: { provider: 'Gemini' }
                    };
                } else {
                    return {
                        name: 'AI Service',
                        status: 'warning',
                        message: 'AI service not available - check GEMINI_API_KEY',
                        details: { provider: 'Gemini', hasKey: !!process.env.GEMINI_API_KEY }
                    };
                }
            } else {
                return {
                    name: 'AI Service',
                    status: 'warning',
                    message: 'AI service object exists but isAvailable method not found',
                    details: { provider: 'Unknown' }
                };
            }
        } catch (error) {
            return {
                name: 'AI Service',
                status: 'warning',
                message: `AI service check error: ${error instanceof Error ? error.message : String(error)}`,
                details: { error: String(error) }
            };
        }
    }

    /**
     * Verify intent classifier
     */
    async verifyIntentClassifier(): Promise<VerificationResult> {
        unifiedLogger.info('system', 'Verifying intent classifier...');

        try {
            const { IntelligentRouter } = await import('../services/intelligentRouter');

            // Try to create an instance
            const router = new IntelligentRouter();

            // Test with a simple message
            const testMessage = "Hola, quiero información sobre USBs";
            const result = await router.classifyIntent(testMessage);

            if (result && result.intent) {
                return {
                    name: 'Intent Classifier',
                    status: 'pass',
                    message: 'Intent classifier is working',
                    details: { 
                        testMessage,
                        detectedIntent: result.intent,
                        confidence: result.confidence 
                    }
                };
            } else {
                return {
                    name: 'Intent Classifier',
                    status: 'warning',
                    message: 'Intent classifier responded but result unclear',
                    details: { testMessage, result }
                };
            }
        } catch (error) {
            return {
                name: 'Intent Classifier',
                status: 'warning',
                message: `Intent classifier check error: ${error instanceof Error ? error.message : String(error)}`,
                details: { error: String(error) }
            };
        }
    }

    /**
     * Run all verifications
     */
    async runAll(): Promise<void> {
        console.log('\n🔍 ===== TECHAURA SYSTEM INTEGRITY VERIFICATION =====\n');

        this.results = [];
        this.criticalFailures = 0;

        // Run all checks
        this.results.push(await this.verifyEnvironmentVariables());
        this.results.push(await this.verifyDatabaseConnection());
        this.results.push(await this.verifyAIService());
        this.results.push(await this.verifyIntentClassifier());

        // Display results
        this.displayResults();

        // Exit with appropriate code
        if (this.criticalFailures > 0) {
            console.log(`\n❌ VERIFICATION FAILED: ${this.criticalFailures} critical failure(s)\n`);
            process.exit(1);
        } else {
            const warnings = this.results.filter(r => r.status === 'warning').length;
            if (warnings > 0) {
                console.log(`\n⚠️  VERIFICATION PASSED WITH WARNINGS: ${warnings} warning(s)\n`);
            } else {
                console.log('\n✅ ALL VERIFICATIONS PASSED\n');
            }
            process.exit(0);
        }
    }

    /**
     * Display verification results
     */
    private displayResults(): void {
        this.results.forEach(result => {
            const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
            const statusColor = result.status === 'pass' ? '\x1b[32m' : result.status === 'fail' ? '\x1b[31m' : '\x1b[33m';
            const reset = '\x1b[0m';

            console.log(`${icon} ${statusColor}[${result.status.toUpperCase()}]${reset} ${result.name}`);
            console.log(`   ${result.message}`);
            
            if (result.details && Object.keys(result.details).length > 0) {
                console.log('   Details:', JSON.stringify(result.details, null, 2).split('\n').join('\n   '));
            }
            console.log('');
        });
    }
}

// Run verification if executed directly
if (require.main === module) {
    const verifier = new IntegrityVerifier();
    verifier.runAll().catch(error => {
        console.error('❌ Verification error:', error);
        process.exit(1);
    });
}

export default IntegrityVerifier;
