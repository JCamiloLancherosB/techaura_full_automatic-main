/**
 * Test script for Conversation Analysis System
 * 
 * Tests the AI-powered conversation analysis job that extracts:
 * - Intent (intención)
 * - Objections (objeciones)  
 * - Purchase probability (probabilidad de compra)
 */

import { conversationAnalysisService } from './src/services/ConversationAnalysisService';
import { conversationAnalysisRepository } from './src/repositories/ConversationAnalysisRepository';
import { conversationAnalysisWorker } from './src/services/ConversationAnalysisWorker';
import { db } from './src/database/knex';

// Sample test data
const TEST_PHONE = '573001234567';

async function insertTestMessages() {
    console.log('📝 Inserting test conversation messages...');
    
    // Check if messages table exists
    const tableExists = await db.schema.hasTable('messages');
    if (!tableExists) {
        console.log('⚠️  messages table does not exist. Creating it...');
        await db.schema.createTable('messages', (table) => {
            table.increments('id').primary();
            table.string('phone', 20).notNullable();
            table.text('message');
            table.enum('type', ['incoming', 'outgoing']).notNullable();
            table.boolean('automated').defaultTo(false);
            table.text('body');
            table.timestamp('created_at').defaultTo(db.fn.now());
        });
    }
    
    // Clear existing test messages
    await db('messages').where({ phone: TEST_PHONE }).delete();
    
    // Insert test conversation
    const messages = [
        {
            phone: TEST_PHONE,
            message: 'Hola, estoy interesado en las memorias USB con música',
            type: 'incoming',
            automated: false,
            created_at: new Date(Date.now() - 10 * 60000) // 10 minutes ago
        },
        {
            phone: TEST_PHONE,
            message: '¡Hola! 🎵 Claro que sí, tenemos memorias USB personalizadas con música. ¿Qué géneros musicales te gustan?',
            type: 'outgoing',
            automated: true,
            created_at: new Date(Date.now() - 9 * 60000)
        },
        {
            phone: TEST_PHONE,
            message: 'Me gusta el reggaeton y la salsa, especialmente Bad Bunny',
            type: 'incoming',
            automated: false,
            created_at: new Date(Date.now() - 8 * 60000)
        },
        {
            phone: TEST_PHONE,
            message: 'Perfecto! Tenemos una gran colección de reggaeton y salsa. Incluimos artistas como Bad Bunny, Daddy Yankee, Marc Anthony y más. ¿Qué capacidad prefieres? Tenemos 32GB ($69,900) y 64GB ($79,900)',
            type: 'outgoing',
            automated: true,
            created_at: new Date(Date.now() - 7 * 60000)
        },
        {
            phone: TEST_PHONE,
            message: 'Me parece un poco caro. ¿No tienen algo más económico?',
            type: 'incoming',
            automated: false,
            created_at: new Date(Date.now() - 6 * 60000)
        },
        {
            phone: TEST_PHONE,
            message: 'Te entiendo. La USB de 32GB tiene más de 1000 canciones y es una excelente relación calidad-precio. También incluye envío gratis en la ciudad.',
            type: 'outgoing',
            automated: true,
            created_at: new Date(Date.now() - 5 * 60000)
        },
        {
            phone: TEST_PHONE,
            message: 'Ok, suena bien. ¿Cómo hago el pedido?',
            type: 'incoming',
            automated: false,
            created_at: new Date(Date.now() - 4 * 60000)
        }
    ];
    
    await db('messages').insert(messages);
    console.log(`✅ Inserted ${messages.length} test messages for phone ${TEST_PHONE}`);
}

async function testAnalysisService() {
    console.log('\n🧪 Testing Conversation Analysis Service...');
    
    try {
        const result = await conversationAnalysisService.analyzeConversation(TEST_PHONE);
        
        console.log('\n📊 Analysis Result:');
        console.log('  Summary:', result.summary);
        console.log('  Intent:', result.intent);
        console.log('  Objections:', JSON.stringify(result.objections));
        console.log('  Purchase Probability:', `${result.purchase_probability}%`);
        console.log('  Sentiment:', result.sentiment);
        console.log('  Engagement Score:', `${result.engagement_score}%`);
        console.log('  Extracted Preferences:', JSON.stringify(result.extracted_preferences, null, 2));
        console.log('  AI Model:', result.ai_model);
        console.log('  Tokens Used:', result.tokens_used);
        console.log('  Analysis Duration:', `${result.analysis_duration_ms}ms`);
        
        console.log('✅ Analysis service test passed');
        return true;
    } catch (error) {
        console.error('❌ Analysis service test failed:', error);
        return false;
    }
}

async function testRepository() {
    console.log('\n🧪 Testing Conversation Analysis Repository...');
    
    try {
        // Create a test analysis
        const analysisId = await conversationAnalysisRepository.create({
            phone: TEST_PHONE,
            status: 'pending'
        });
        
        console.log(`✅ Created analysis record with ID: ${analysisId}`);
        
        // Retrieve it
        const analysis = await conversationAnalysisRepository.getById(analysisId);
        console.log('✅ Retrieved analysis:', analysis?.id);
        
        // Update it
        await conversationAnalysisRepository.update(analysisId, {
            status: 'completed',
            summary: 'Test summary',
            intent: 'purchase',
            purchase_probability: 85
        });
        
        console.log('✅ Updated analysis');
        
        // Get by phone
        const latestAnalysis = await conversationAnalysisRepository.getLatestByPhone(TEST_PHONE);
        console.log('✅ Retrieved latest analysis for phone:', latestAnalysis?.intent);
        
        // Get summary
        const summary = await conversationAnalysisRepository.getAnalyticsSummary();
        console.log('✅ Analytics summary:');
        console.log('  Total:', summary.total);
        console.log('  By Intent:', JSON.stringify(summary.byIntent));
        console.log('  By Status:', JSON.stringify(summary.byStatus));
        
        console.log('✅ Repository test passed');
        return true;
    } catch (error) {
        console.error('❌ Repository test failed:', error);
        return false;
    }
}

async function testWorker() {
    console.log('\n🧪 Testing Conversation Analysis Worker...');
    
    try {
        // Queue an analysis
        const analysisId = await conversationAnalysisWorker.queueAnalysis(TEST_PHONE);
        console.log(`✅ Queued analysis with ID: ${analysisId}`);
        
        // Check worker status
        const status = conversationAnalysisWorker.getStatus();
        console.log('✅ Worker status:');
        console.log('  Running:', status.isRunning);
        console.log('  Processing:', status.processingCount);
        console.log('  Batch Size:', status.batchSize);
        
        // Trigger immediate processing (for testing)
        console.log('⏳ Processing queued analysis...');
        await conversationAnalysisWorker.processNow();
        
        // Wait a bit for processing to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check the result
        const result = await conversationAnalysisRepository.getLatestByPhone(TEST_PHONE);
        if (result && result.status === 'completed') {
            console.log('✅ Worker processed analysis successfully');
            console.log('  Intent:', result.intent);
            console.log('  Purchase Probability:', `${result.purchase_probability}%`);
            console.log('  Summary:', result.summary);
        } else {
            console.log('⚠️  Analysis not yet completed or failed');
            console.log('  Status:', result?.status);
            console.log('  Error:', result?.error_message);
        }
        
        console.log('✅ Worker test completed');
        return true;
    } catch (error) {
        console.error('❌ Worker test failed:', error);
        return false;
    }
}

async function cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
        await db('messages').where({ phone: TEST_PHONE }).delete();
        await db('conversation_analysis').where({ phone: TEST_PHONE }).delete();
        console.log('✅ Test data cleaned up');
    } catch (error) {
        console.error('⚠️  Error cleaning up:', error);
    }
}

async function runTests() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Conversation Analysis System Test Suite              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    let allPassed = true;
    
    try {
        // Setup
        await insertTestMessages();
        
        // Run tests
        const serviceTest = await testAnalysisService();
        allPassed = allPassed && serviceTest;
        
        const repoTest = await testRepository();
        allPassed = allPassed && repoTest;
        
        const workerTest = await testWorker();
        allPassed = allPassed && workerTest;
        
        // Cleanup
        await cleanup();
        
        // Summary
        console.log('\n╔════════════════════════════════════════════════════════╗');
        if (allPassed) {
            console.log('║  ✅ ALL TESTS PASSED                                   ║');
        } else {
            console.log('║  ❌ SOME TESTS FAILED                                  ║');
        }
        console.log('╚════════════════════════════════════════════════════════╝\n');
        
        process.exit(allPassed ? 0 : 1);
        
    } catch (error) {
        console.error('❌ Test suite failed with error:', error);
        await cleanup();
        process.exit(1);
    }
}

// Run tests
runTests();
