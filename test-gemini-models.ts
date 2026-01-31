/**
 * Test script to verify Gemini AI model initialization with new model names
 * This script tests the model fallback chain and ensures no 404 errors occur
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
    GEMINI_MODEL_FALLBACK_CHAIN, 
    GEMINI_GENERATION_CONFIG,
    isModelNotFoundError 
} from './src/utils/aiConfig';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGeminiModels() {
    console.log('🧪 Testing Gemini AI Model Initialization\n');
    console.log('📋 Model Fallback Chain:', GEMINI_MODEL_FALLBACK_CHAIN);
    console.log('');

    const geminiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiKey) {
        console.error('❌ GEMINI_API_KEY not found in environment variables');
        console.error('   Please set GEMINI_API_KEY in your .env file');
        process.exit(1);
    }

    console.log('✅ GEMINI_API_KEY found');
    console.log('');

    const genAI = new GoogleGenerativeAI(geminiKey);
    const testPrompt = 'Hello, this is a test message. Please respond with "Test successful".';
    
    let successfulModel: string | null = null;
    const results: Array<{ model: string; status: 'success' | 'failed'; error?: string }> = [];

    // Test each model in the fallback chain
    for (const modelName of GEMINI_MODEL_FALLBACK_CHAIN) {
        console.log(`🔍 Testing model: ${modelName}`);
        
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: GEMINI_GENERATION_CONFIG
            });

            const result = await model.generateContent(testPrompt);
            const response = result.response.text();

            console.log(`   ✅ Success!`);
            console.log(`   📝 Response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
            console.log('');

            results.push({ model: modelName, status: 'success' });
            
            if (!successfulModel) {
                successfulModel = modelName;
            }

        } catch (error: any) {
            const is404 = isModelNotFoundError(error);
            const errorMsg = error?.message || String(error);
            
            console.log(`   ❌ Failed: ${errorMsg.substring(0, 100)}${errorMsg.length > 100 ? '...' : ''}`);
            console.log(`   🔍 Is 404/NOT_FOUND: ${is404}`);
            console.log('');

            results.push({ 
                model: modelName, 
                status: 'failed',
                error: errorMsg.substring(0, 200)
            });
        }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Results Summary');
    console.log('='.repeat(60) + '\n');

    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status === 'failed').length;

    console.log(`Total models tested: ${results.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('');

    if (successfulModel) {
        console.log(`🎉 Primary working model: ${successfulModel}`);
        console.log('');
        console.log('✅ AI Service will work correctly with the fallback chain!');
        console.log('   The service will automatically use the first working model.');
    } else {
        console.log('❌ No models are working!');
        console.log('   Please check:');
        console.log('   1. Your GEMINI_API_KEY is valid');
        console.log('   2. Your API key has access to Gemini models');
        console.log('   3. Your internet connection is working');
        console.log('   4. Google AI services are not experiencing an outage');
    }

    console.log('\n' + '='.repeat(60));

    // Detailed results
    if (results.some(r => r.status === 'failed')) {
        console.log('\n📋 Detailed Results:\n');
        results.forEach(r => {
            console.log(`  ${r.status === 'success' ? '✅' : '❌'} ${r.model}`);
            if (r.error) {
                console.log(`     Error: ${r.error}`);
            }
        });
        console.log('');
    }

    process.exit(successCount > 0 ? 0 : 1);
}

// Run the test
testGeminiModels().catch(error => {
    console.error('💥 Unexpected error during testing:', error);
    process.exit(1);
});
