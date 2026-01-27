/**
 * Migration: Create stage funnel analytics tables
 * Creates tables for tracking stage abandonment and followup blocking analytics
 * 
 * Tables:
 * - stage_funnel_daily: Aggregated daily stats per conversation stage
 * - followup_blocked_daily: Aggregated daily stats for blocked followups by reason
 * 
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating stage funnel analytics tables...');

    // Create stage_funnel_daily table for tracking stage abandonment
    const stageFunnelExists = await knex.schema.hasTable('stage_funnel_daily');
    if (!stageFunnelExists) {
        await knex.schema.createTable('stage_funnel_daily', (table) => {
            table.increments('id').primary();
            
            // Date and stage dimensions
            table.date('date').notNullable().index();
            table.string('stage', 50).notNullable().index();
            
            // Funnel metrics
            table.integer('questions_asked').defaultTo(0).comment('Count of blocking questions asked at this stage');
            table.integer('responses_received').defaultTo(0).comment('Count of user responses to questions at this stage');
            table.decimal('abandonment_rate', 5, 2).defaultTo(0).comment('Percentage of users who abandoned at this stage');
            table.integer('followups_sent').defaultTo(0).comment('Follow-ups sent for this stage');
            table.integer('conversions_to_order').defaultTo(0).comment('Users at this stage who eventually ordered');
            table.decimal('avg_time_in_stage_minutes', 10, 2).defaultTo(0).comment('Average time spent in this stage');
            
            // Timestamps
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            
            // Unique constraint on date + stage
            table.unique(['date', 'stage']);
        });
        console.log('✅ Created stage_funnel_daily table');
    } else {
        console.log('ℹ️  stage_funnel_daily table already exists, skipping');
    }

    // Create followup_blocked_daily table for tracking blocked followups
    const followupBlockedExists = await knex.schema.hasTable('followup_blocked_daily');
    if (!followupBlockedExists) {
        await knex.schema.createTable('followup_blocked_daily', (table) => {
            table.increments('id').primary();
            
            // Date and reason dimensions
            table.date('date').notNullable().index();
            table.string('block_reason', 100).notNullable().index();
            
            // Blocked followup metrics
            table.integer('blocked_count').defaultTo(0).comment('Number of followups blocked for this reason');
            table.integer('unique_phones').defaultTo(0).comment('Number of unique phones affected');
            
            // Timestamps
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            
            // Unique constraint on date + block_reason
            table.unique(['date', 'block_reason']);
        });
        console.log('✅ Created followup_blocked_daily table');
    } else {
        console.log('ℹ️  followup_blocked_daily table already exists, skipping');
    }

    // Add indices for common queries
    console.log('📦 Adding indices for analytics queries...');

    // Index for stage funnel trending queries
    try {
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_stage_funnel_stage_date 
            ON stage_funnel_daily (stage, date DESC)
        `);
    } catch (error) {
        console.log('ℹ️  Index idx_stage_funnel_stage_date may already exist');
    }

    // Index for blocked reason trending queries
    try {
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS idx_followup_blocked_reason_date 
            ON followup_blocked_daily (block_reason, date DESC)
        `);
    } catch (error) {
        console.log('ℹ️  Index idx_followup_blocked_reason_date may already exist');
    }

    console.log('✅ Stage funnel analytics tables migration completed');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Dropping stage funnel analytics tables...');
    
    await knex.schema.dropTableIfExists('followup_blocked_daily');
    console.log('✅ Dropped followup_blocked_daily table');
    
    await knex.schema.dropTableIfExists('stage_funnel_daily');
    console.log('✅ Dropped stage_funnel_daily table');
}

module.exports = { up, down };
