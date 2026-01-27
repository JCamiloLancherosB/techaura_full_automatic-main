/**
 * Migration: Create conversation_state table for FlowState Contract
 * 
 * This table persists the active flow state for each user to ensure
 * conversational continuity even after server restarts.
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating conversation_state table...');
    
    const tableExists = await knex.schema.hasTable('conversation_state');
    if (tableExists) {
        console.log('ℹ️  conversation_state table already exists, checking for missing columns...');
        
        // Check for expected columns and add if missing
        const hasExpectedInput = await knex.schema.hasColumn('conversation_state', 'expected_input');
        const hasLastQuestionId = await knex.schema.hasColumn('conversation_state', 'last_question_id');
        const hasLastQuestionText = await knex.schema.hasColumn('conversation_state', 'last_question_text');
        const hasStepTimeout = await knex.schema.hasColumn('conversation_state', 'step_timeout_hours');
        
        await knex.schema.alterTable('conversation_state', (table) => {
            if (!hasExpectedInput) {
                table.enum('expected_input', ['TEXT', 'NUMBER', 'CHOICE', 'MEDIA', 'ANY'])
                    .defaultTo('ANY')
                    .comment('Type of input expected from user');
                console.log('✅ Added expected_input column');
            }
            if (!hasLastQuestionId) {
                table.string('last_question_id', 100).nullable()
                    .comment('Identifier of the last question asked');
                console.log('✅ Added last_question_id column');
            }
            if (!hasLastQuestionText) {
                table.text('last_question_text').nullable()
                    .comment('Text of the last question asked for re-prompting');
                console.log('✅ Added last_question_text column');
            }
            if (!hasStepTimeout) {
                table.integer('step_timeout_hours').defaultTo(2)
                    .comment('Hours after which to consider the step stale');
                console.log('✅ Added step_timeout_hours column');
            }
        });
        return;
    }

    await knex.schema.createTable('conversation_state', (table) => {
        table.string('phone', 20).primary()
            .comment('User phone number (primary key)');
        
        table.string('active_flow_id', 100).nullable()
            .comment('Currently active flow ID (e.g., musicUsb, videosUsb, orderFlow)');
        
        table.string('active_step', 100).nullable()
            .comment('Current step within the active flow');
        
        table.enum('expected_input', ['TEXT', 'NUMBER', 'CHOICE', 'MEDIA', 'ANY'])
            .defaultTo('ANY')
            .comment('Type of input expected from user');
        
        table.string('last_question_id', 100).nullable()
            .comment('Identifier of the last question asked');
        
        table.text('last_question_text').nullable()
            .comment('Text of the last question asked for re-prompting');
        
        table.integer('step_timeout_hours').defaultTo(2)
            .comment('Hours after which to consider the step stale');
        
        table.json('flow_context').nullable()
            .comment('Additional context data for the current flow step');
        
        table.datetime('updated_at').notNullable().defaultTo(knex.fn.now())
            .comment('Last update timestamp');
        
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now())
            .comment('Creation timestamp');
        
        // Indices for efficient querying
        table.index(['active_flow_id'], 'idx_active_flow');
        table.index(['updated_at'], 'idx_updated_at');
    });

    console.log('✅ conversation_state table created successfully');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Dropping conversation_state table...');
    await knex.schema.dropTableIfExists('conversation_state');
    console.log('✅ conversation_state table dropped');
}

module.exports = { up, down };
