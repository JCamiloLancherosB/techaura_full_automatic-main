/**
 * Backfill Conversation Turns Script
 * 
 * This script populates the conversation_turns table from the messages table.
 * It groups messages by phone and conversation windows, then inserts normalized
 * turns into conversation_turns for better analytics.
 * 
 * Usage:
 *   npx tsx src/scripts/backfillConversationTurns.ts
 * 
 * Options:
 *   --dry-run    Preview changes without inserting
 *   --phone=X    Process only a specific phone number
 *   --limit=N    Limit the number of phones to process
 */

import { db } from '../database/knex';
import { conversationTurnsRepository } from '../repositories/ConversationTurnsRepository';

// Configuration
const CONVERSATION_WINDOW_HOURS = 24; // Messages within 24 hours are considered same conversation
const BATCH_SIZE = 50; // Process phones in batches

interface MessageRow {
    id: number;
    phone: string;
    message?: string;
    body?: string;
    type: 'incoming' | 'outgoing';
    automated?: boolean;
    created_at: Date;
    timestamp?: Date;
}

interface BackfillStats {
    phonesProcessed: number;
    turnsCreated: number;
    phonesSkipped: number;
    errors: string[];
    startTime: Date;
    endTime?: Date;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { dryRun: boolean; phone?: string; limit?: number } {
    const args = process.argv.slice(2);
    const options = {
        dryRun: false,
        phone: undefined as string | undefined,
        limit: undefined as number | undefined
    };

    for (const arg of args) {
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg.startsWith('--phone=')) {
            options.phone = arg.split('=')[1];
        } else if (arg.startsWith('--limit=')) {
            options.limit = parseInt(arg.split('=')[1], 10);
        }
    }

    return options;
}

/**
 * Get all unique phones from the messages table
 */
async function getDistinctPhonesFromMessages(limit?: number): Promise<string[]> {
    try {
        let query = db('messages')
            .distinct('phone')
            .whereNotNull('phone')
            .orderBy('phone');

        if (limit) {
            query = query.limit(limit);
        }

        const results = await query;
        return results.map((r: { phone: string }) => r.phone);
    } catch (error) {
        console.error('Error getting distinct phones from messages:', error);
        return [];
    }
}

/**
 * Get messages for a specific phone
 */
async function getMessagesForPhone(phone: string): Promise<MessageRow[]> {
    try {
        const messages = await db('messages')
            .where({ phone })
            .orderBy('created_at', 'asc');

        return messages;
    } catch (error) {
        console.error(`Error getting messages for phone ${phone}:`, error);
        return [];
    }
}

/**
 * Convert a message to a conversation turn format
 */
function messageToTurn(msg: MessageRow): {
    phone: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
} {
    const content = msg.message || msg.body || '';
    const timestamp = msg.created_at || msg.timestamp || new Date();

    return {
        phone: msg.phone,
        role: msg.type === 'incoming' ? 'user' : 'assistant',
        content,
        timestamp: new Date(timestamp),
        metadata: {
            source: 'backfill',
            original_message_id: msg.id,
            automated: msg.automated || false
        }
    };
}

/**
 * Process messages for a single phone and create turns
 */
async function processPhoneMessages(
    phone: string,
    dryRun: boolean
): Promise<{ turnsCreated: number; skipped: boolean }> {
    // Check if phone already has turns
    const hasExisting = await conversationTurnsRepository.hasExistingTurns(phone);
    if (hasExisting) {
        console.log(`  ⏭️  Skipping ${phone} - already has conversation turns`);
        return { turnsCreated: 0, skipped: true };
    }

    // Get messages for this phone
    const messages = await getMessagesForPhone(phone);
    if (messages.length === 0) {
        console.log(`  ⏭️  Skipping ${phone} - no messages found`);
        return { turnsCreated: 0, skipped: true };
    }

    // Convert messages to turns
    const turns = messages
        .filter(msg => (msg.message || msg.body)) // Filter out empty messages
        .map(msg => messageToTurn(msg));

    if (turns.length === 0) {
        console.log(`  ⏭️  Skipping ${phone} - no valid messages to convert`);
        return { turnsCreated: 0, skipped: true };
    }

    if (dryRun) {
        console.log(`  📝 [DRY RUN] Would create ${turns.length} turns for ${phone}`);
        return { turnsCreated: turns.length, skipped: false };
    }

    // Insert turns
    const insertedCount = await conversationTurnsRepository.bulkCreate(turns);
    console.log(`  ✅ Created ${insertedCount} turns for ${phone}`);

    return { turnsCreated: insertedCount, skipped: false };
}

/**
 * Main backfill function
 */
async function runBackfill(): Promise<BackfillStats> {
    const options = parseArgs();
    const stats: BackfillStats = {
        phonesProcessed: 0,
        turnsCreated: 0,
        phonesSkipped: 0,
        errors: [],
        startTime: new Date()
    };

    console.log('🚀 Starting Conversation Turns Backfill...');
    console.log(`   Mode: ${options.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    if (options.phone) {
        console.log(`   Target phone: ${options.phone}`);
    }
    if (options.limit) {
        console.log(`   Limit: ${options.limit} phones`);
    }
    console.log('');

    // Check if conversation_turns table exists
    const tableExists = await conversationTurnsRepository.tableExists();
    if (!tableExists) {
        console.error('❌ conversation_turns table does not exist. Please run migrations first.');
        console.error('   Run: npm run migrate');
        stats.errors.push('conversation_turns table does not exist');
        return stats;
    }

    // Get phones to process
    let phones: string[];
    if (options.phone) {
        phones = [options.phone];
    } else {
        phones = await getDistinctPhonesFromMessages(options.limit);
    }

    console.log(`📊 Found ${phones.length} phones to process\n`);

    if (phones.length === 0) {
        console.log('ℹ️  No phones found in messages table.');
        return stats;
    }

    // Process phones in batches
    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
        const batch = phones.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(phones.length / BATCH_SIZE);

        console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} phones)...`);

        for (const phone of batch) {
            try {
                const result = await processPhoneMessages(phone, options.dryRun);
                stats.phonesProcessed++;
                stats.turnsCreated += result.turnsCreated;
                if (result.skipped) {
                    stats.phonesSkipped++;
                }
            } catch (error) {
                const errorMsg = `Error processing ${phone}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                console.error(`  ❌ ${errorMsg}`);
                stats.errors.push(errorMsg);
            }
        }

        console.log('');
    }

    stats.endTime = new Date();

    return stats;
}

/**
 * Print summary statistics
 */
function printSummary(stats: BackfillStats): void {
    const duration = stats.endTime
        ? (stats.endTime.getTime() - stats.startTime.getTime()) / 1000
        : 0;

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 BACKFILL SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Phones processed: ${stats.phonesProcessed}`);
    console.log(`   Phones skipped:   ${stats.phonesSkipped}`);
    console.log(`   Turns created:    ${stats.turnsCreated}`);
    console.log(`   Errors:           ${stats.errors.length}`);
    console.log(`   Duration:         ${duration.toFixed(2)} seconds`);
    console.log('═══════════════════════════════════════════════════════');

    if (stats.errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        stats.errors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err}`);
        });
    }
}

/**
 * Entry point
 */
async function main(): Promise<void> {
    try {
        const stats = await runBackfill();
        printSummary(stats);

        if (stats.errors.length > 0) {
            process.exit(1);
        }

        console.log('\n✅ Backfill completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fatal error during backfill:', error);
        process.exit(1);
    }
}

// Run if executed directly
main();
