/**
 * Migration: Add intent routing columns to conversation_turns table
 * Adds intent_confidence and intent_source for Intent Router v2
 */

exports.up = async function(knex) {
    // Add intent_confidence and intent_source columns to conversation_turns
    const hasIntentConfidence = await knex.schema.hasColumn('conversation_turns', 'intent_confidence');
    const hasIntentSource = await knex.schema.hasColumn('conversation_turns', 'intent_source');

    if (!hasIntentConfidence || !hasIntentSource) {
        await knex.schema.alterTable('conversation_turns', (table) => {
            if (!hasIntentConfidence) {
                table.decimal('intent_confidence', 5, 2).nullable().comment('Confidence score 0-100 for intent classification');
            }
            if (!hasIntentSource) {
                table.enum('intent_source', ['rule', 'ai', 'menu', 'context']).nullable().comment('Source of intent classification: rule-based, AI, menu fallback, or context');
            }
        });
        console.log('✅ Added intent_confidence and intent_source columns to conversation_turns');
    } else {
        console.log('ℹ️ Columns already exist in conversation_turns');
    }
};

exports.down = async function(knex) {
    // Remove intent routing columns
    await knex.schema.alterTable('conversation_turns', (table) => {
        table.dropColumn('intent_confidence');
        table.dropColumn('intent_source');
    });
    console.log('✅ Removed intent routing columns from conversation_turns');
};
