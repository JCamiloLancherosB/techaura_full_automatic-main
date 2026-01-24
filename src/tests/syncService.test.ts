/**
 * Test script for External Source Sync system
 * 
 * This script demonstrates how to use the sync service programmatically.
 * Run with: tsx src/tests/syncService.test.ts
 */

import { syncService } from '../services/sync/SyncService';
import { contentIndexRepository } from '../repositories/ContentIndexRepository';
import { syncRunRepository } from '../repositories/SyncRunRepository';
import fs from 'fs/promises';
import path from 'path';

// Sample CSV data for testing
const SAMPLE_MUSIC_CSV = `title,artist,genre
Despacito,Luis Fonsi,Reggaeton
Shape of You,Ed Sheeran,Pop
Bohemian Rhapsody,Queen,Rock
Imagine,John Lennon,Pop
Stairway to Heaven,Led Zeppelin,Rock`;

const SAMPLE_CATALOG_CSV = `category_id,capacity,capacity_gb,price,content_count,content_unit,is_active,is_popular
music,16GB,16,69900,2500,canciones,true,false
videos,16GB,16,69900,750,videos,true,false
movies,256GB,256,219900,250,películas,true,false`;

async function setupTestData() {
    console.log('📦 Setting up test data...');
    
    // Create test data directory
    const testDataDir = '/tmp/sync_test_data';
    await fs.mkdir(testDataDir, { recursive: true });
    
    // Write sample CSV files
    const musicCsvPath = path.join(testDataDir, 'music_catalog.csv');
    const catalogCsvPath = path.join(testDataDir, 'catalog_pricing.csv');
    
    await fs.writeFile(musicCsvPath, SAMPLE_MUSIC_CSV);
    await fs.writeFile(catalogCsvPath, SAMPLE_CATALOG_CSV);
    
    console.log(`✅ Test data created at ${testDataDir}`);
    
    return {
        musicCsvPath,
        catalogCsvPath,
        testDataDir
    };
}

async function testCSVContentSync(csvPath: string) {
    console.log('\n🧪 Test 1: CSV Content Sync to content_index');
    console.log('='.repeat(60));
    
    try {
        const result = await syncService.sync({
            sourceType: 'csv',
            sourceIdentifier: csvPath,
            options: {
                targetTable: 'content_index',
                contentType: 'music',
                hasHeader: true,
                delimiter: ',',
                columnMapping: {
                    title: 'title',
                    artist: 'artist',
                    genre: 'genre'
                }
            }
        });
        
        console.log(`Status: ${result.status}`);
        console.log(`Processed: ${result.itemsProcessed}`);
        console.log(`Failed: ${result.itemsFailed}`);
        console.log(`Skipped: ${result.itemsSkipped}`);
        
        if (result.errors.length > 0) {
            console.log(`Errors:`);
            result.errors.forEach(err => {
                console.log(`  - ${err.type}: ${err.message}`);
            });
        }
        
        // Query content index to verify
        const contents = await contentIndexRepository.list({
            source_type: 'csv',
            source_identifier: csvPath
        });
        
        console.log(`\n✅ Test 1 Passed: ${contents.length} items in content_index`);
        contents.forEach(c => {
            console.log(`  - ${c.title} by ${c.artist} (${c.genre})`);
        });
        
        return true;
    } catch (error: any) {
        console.error(`❌ Test 1 Failed:`, error.message);
        return false;
    }
}

async function testCSVCatalogSync(csvPath: string) {
    console.log('\n🧪 Test 2: CSV Catalog Sync to catalog_items');
    console.log('=' .repeat(60));
    
    try {
        const result = await syncService.sync({
            sourceType: 'csv',
            sourceIdentifier: csvPath,
            options: {
                targetTable: 'catalog_items',
                hasHeader: true,
                delimiter: ','
            }
        });
        
        console.log(`Status: ${result.status}`);
        console.log(`Processed: ${result.itemsProcessed}`);
        console.log(`Failed: ${result.itemsFailed}`);
        console.log(`Skipped: ${result.itemsSkipped}`);
        
        if (result.errors.length > 0) {
            console.log(`Errors:`);
            result.errors.forEach(err => {
                console.log(`  - ${err.type}: ${err.message}`);
            });
        }
        
        console.log(`\n✅ Test 2 Passed: Catalog items synced`);
        
        return true;
    } catch (error: any) {
        console.error(`❌ Test 2 Failed:`, error.message);
        return false;
    }
}

async function testSyncStats() {
    console.log('\n🧪 Test 3: Sync Statistics');
    console.log('=' .repeat(60));
    
    try {
        const stats = await syncService.getSyncStats();
        
        console.log(`Total syncs: ${stats.total}`);
        console.log(`Pending: ${stats.pending}`);
        console.log(`In Progress: ${stats.in_progress}`);
        console.log(`Completed: ${stats.completed}`);
        console.log(`Failed: ${stats.failed}`);
        console.log(`Cancelled: ${stats.cancelled}`);
        
        console.log(`\n✅ Test 3 Passed`);
        
        return true;
    } catch (error: any) {
        console.error(`❌ Test 3 Failed:`, error.message);
        return false;
    }
}

async function testContentIndexQueries() {
    console.log('\n🧪 Test 4: Content Index Queries');
    console.log('=' .repeat(60));
    
    try {
        // Test search
        const popSongs = await contentIndexRepository.list({
            genre: 'Pop',
            is_available: true
        });
        console.log(`Pop songs: ${popSongs.length}`);
        
        // Test count
        const totalMusic = await contentIndexRepository.count({
            content_type: 'music'
        });
        console.log(`Total music items: ${totalMusic}`);
        
        // Test stats
        const stats = await contentIndexRepository.getStats();
        console.log(`Total content: ${stats.total}`);
        console.log(`Available: ${stats.available}`);
        console.log(`By type:`, stats.by_type);
        console.log(`By source:`, stats.by_source);
        
        console.log(`\n✅ Test 4 Passed`);
        
        return true;
    } catch (error: any) {
        console.error(`❌ Test 4 Failed:`, error.message);
        return false;
    }
}

async function testResumeSync() {
    console.log('\n🧪 Test 5: Resume Pending Syncs');
    console.log('=' .repeat(60));
    
    try {
        // Check for pending syncs
        const pending = await syncRunRepository.getPending();
        console.log(`Pending syncs: ${pending.length}`);
        
        if (pending.length > 0) {
            await syncService.resumePendingSyncs();
            console.log(`Resumed ${pending.length} pending sync(s)`);
        } else {
            console.log(`No pending syncs to resume`);
        }
        
        console.log(`\n✅ Test 5 Passed`);
        
        return true;
    } catch (error: any) {
        console.error(`❌ Test 5 Failed:`, error.message);
        return false;
    }
}

async function cleanup(testDataDir: string) {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
        await fs.rm(testDataDir, { recursive: true, force: true });
        console.log('✅ Cleanup completed');
    } catch (error) {
        console.log('⚠️  Cleanup warning:', error);
    }
}

async function runTests() {
    console.log('\n' + '='.repeat(60));
    console.log('External Source Sync - Test Suite');
    console.log('='.repeat(60));
    
    let testsPassed = 0;
    let testsFailed = 0;
    
    try {
        // Setup
        const { musicCsvPath, catalogCsvPath, testDataDir } = await setupTestData();
        
        // Run tests
        const tests = [
            () => testCSVContentSync(musicCsvPath),
            () => testCSVCatalogSync(catalogCsvPath),
            () => testSyncStats(),
            () => testContentIndexQueries(),
            () => testResumeSync()
        ];
        
        for (const test of tests) {
            const passed = await test();
            if (passed) {
                testsPassed++;
            } else {
                testsFailed++;
            }
            
            // Wait between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Cleanup
        await cleanup(testDataDir);
        
    } catch (error: any) {
        console.error('\n❌ Test suite failed:', error);
        testsFailed++;
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`Total: ${testsPassed + testsFailed}`);
    console.log('='.repeat(60));
    
    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests if executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

export { runTests };
