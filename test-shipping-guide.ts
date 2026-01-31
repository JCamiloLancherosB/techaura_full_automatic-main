#!/usr/bin/env tsx
/**
 * Manual Test Script for Shipping Guide Automation
 * Tests the ShippingGuideParser, CustomerMatcher, and ShippingGuideSender services
 */

import { ShippingGuideParser } from './src/services/ShippingGuideParser';
import { CustomerMatcher } from './src/services/CustomerMatcher';
import { ShippingGuideSender } from './src/services/ShippingGuideSender';

async function testShippingGuideParser() {
    console.log('\n🧪 Testing ShippingGuideParser...\n');
    
    const parser = new ShippingGuideParser();
    
    // Test with sample text (simulating OCR result)
    const sampleText = `
        SERVIENTREGA
        Guía: SER123456789
        Destinatario: Juan Perez Garcia
        Teléfono: 3001234567
        Dirección: Calle 50 #25-30
        Ciudad: Bogotá
        Entrega estimada: 2024-02-01
    `;
    
    try {
        const result = parser['parseGuideText'](sampleText);
        console.log('✅ Parser Result:', JSON.stringify(result, null, 2));
        
        if (result && result.trackingNumber && result.customerName) {
            console.log('✅ Test PASSED: Parser extracted required data\n');
        } else {
            console.log('❌ Test FAILED: Parser did not extract required data\n');
        }
    } catch (error) {
        console.error('❌ Test FAILED with error:', error);
    }
}

async function testCustomerMatcher() {
    console.log('\n🧪 Testing CustomerMatcher...\n');
    
    const matcher = new CustomerMatcher();
    
    // Test name similarity calculation
    const similarity1 = matcher['calculateNameSimilarity']('Juan Perez Garcia', 'Juan Perez');
    const similarity2 = matcher['calculateNameSimilarity']('Juan Perez', 'Maria Rodriguez');
    
    console.log('Name similarity (Juan Perez Garcia vs Juan Perez):', similarity1);
    console.log('Name similarity (Juan Perez vs Maria Rodriguez):', similarity2);
    
    if (similarity1 > 0.6 && similarity2 < 0.3) {
        console.log('✅ Test PASSED: Name similarity working correctly\n');
    } else {
        console.log('❌ Test FAILED: Name similarity not working as expected\n');
    }
}

async function testShippingGuideSender() {
    console.log('\n🧪 Testing ShippingGuideSender...\n');
    
    const sender = new ShippingGuideSender();
    
    // Test MIME type detection
    const pdfMime = sender['getMimeType']('/path/to/guide.pdf');
    const jpgMime = sender['getMimeType']('/path/to/guide.jpg');
    const pngMime = sender['getMimeType']('/path/to/guide.png');
    
    console.log('PDF MIME type:', pdfMime);
    console.log('JPG MIME type:', jpgMime);
    console.log('PNG MIME type:', pngMime);
    
    if (pdfMime === 'application/pdf' && 
        jpgMime === 'image/jpeg' && 
        pngMime === 'image/png') {
        console.log('✅ Test PASSED: MIME type detection working\n');
    } else {
        console.log('❌ Test FAILED: MIME type detection not working\n');
    }
}

async function runTests() {
    console.log('🚀 Starting Shipping Guide Automation Tests\n');
    console.log('='.repeat(50));
    
    try {
        await testShippingGuideParser();
        await testCustomerMatcher();
        await testShippingGuideSender();
        
        console.log('='.repeat(50));
        console.log('\n✅ All tests completed!\n');
        console.log('Note: These are unit tests for internal methods.');
        console.log('For full integration testing:');
        console.log('  1. Start the server: npm start');
        console.log('  2. Test the endpoints:');
        console.log('     - POST /api/shipping/guide (single file)');
        console.log('     - POST /api/shipping/guides/batch (multiple files)');
        console.log('     - GET /api/shipping/health');
    } catch (error) {
        console.error('❌ Tests failed with error:', error);
    }
}

// Run tests
runTests().catch(console.error);
