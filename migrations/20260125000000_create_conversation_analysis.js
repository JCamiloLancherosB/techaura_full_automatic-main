/**
 * Migration: Create conversation_analysis table
 * 
 * This migration creates a table to store AI-generated conversation analysis
 * including intent, objections, and purchase probability.
 * 
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating conversation_analysis table...');
    
    await knex.schema.createTable('conversation_analysis', (table) => {
        table.increments('id').primary();
        
        // Link to user session
        table.string('phone', 50).notNullable().index();
        
        // Analysis results
        table.text('summary').nullable();
        table.string('intent', 100).nullable().index(); // e.g., 'purchase', 'inquiry', 'complaint', 'browsing'
        table.json('objections').nullable(); // Array of objections: ['price_concern', 'feature_question', 'trust_issue']
        table.decimal('purchase_probability', 5, 2).nullable(); // 0-100 percentage
        
        // Additional insights
        table.json('extracted_preferences').nullable(); // User preferences found in conversation
        table.string('sentiment', 50).nullable(); // 'positive', 'neutral', 'negative'
        table.decimal('engagement_score', 5, 2).nullable(); // 0-100 percentage
        
        // AI metadata
        table.string('ai_model', 100).nullable(); // Which AI model was used
        table.integer('tokens_used').nullable();
        table.integer('analysis_duration_ms').nullable();
        
        // Processing status
        table.string('status', 50).defaultTo('pending').index(); // 'pending', 'processing', 'completed', 'failed'
        table.text('error_message').nullable();
        
        // Conversation snapshot
        table.integer('message_count').defaultTo(0);
        table.timestamp('conversation_start').nullable();
        table.timestamp('conversation_end').nullable();
        
        // Timestamps
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.timestamp('analyzed_at').nullable();
        
        // Indices for efficient querying
        table.index(['status', 'created_at']);
        table.index(['intent', 'purchase_probability']);
        table.index(['analyzed_at']);
    });
    
    console.log('✅ Created conversation_analysis table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('conversation_analysis');
    console.log('✅ Dropped conversation_analysis table');
}

module.exports = { up, down };
