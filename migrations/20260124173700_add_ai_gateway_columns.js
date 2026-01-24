/**
 * Migration: Add AI Gateway tracking columns to conversation_turns table
 * Adds columns for tracking AI provider, model, latency, tokens, and policy decisions
 * Part of PR-G1: AI Gateway + Policy implementation
 */

exports.up = async function(knex) {
    // Check existing columns
    const hasAiUsed = await knex.schema.hasColumn('conversation_turns', 'ai_used');
    const hasModel = await knex.schema.hasColumn('conversation_turns', 'model');
    const hasLatencyMs = await knex.schema.hasColumn('conversation_turns', 'latency_ms');
    const hasTokensEst = await knex.schema.hasColumn('conversation_turns', 'tokens_est');
    const hasPolicyDecision = await knex.schema.hasColumn('conversation_turns', 'policy_decision');

    // Only add columns that don't exist
    if (!hasAiUsed || !hasModel || !hasLatencyMs || !hasTokensEst || !hasPolicyDecision) {
        await knex.schema.alterTable('conversation_turns', (table) => {
            if (!hasAiUsed) {
                table.string('ai_used', 50).nullable().comment('AI provider used (e.g., Gemini, OpenAI, Cohere)');
            }
            if (!hasModel) {
                table.string('model', 100).nullable().comment('Specific model name (e.g., gemini-1.5-flash, gpt-4)');
            }
            if (!hasLatencyMs) {
                table.integer('latency_ms').nullable().comment('Request latency in milliseconds');
            }
            if (!hasTokensEst) {
                table.integer('tokens_est').nullable().comment('Estimated tokens used (if available)');
            }
            if (!hasPolicyDecision) {
                table.string('policy_decision', 100).nullable().comment('Policy enforcement result (e.g., approved, needs_clarification)');
            }
        });
        console.log('✅ Added AI Gateway tracking columns to conversation_turns');
    } else {
        console.log('ℹ️ AI Gateway columns already exist in conversation_turns');
    }
};

exports.down = async function(knex) {
    // Check if columns exist before dropping
    const hasAiUsed = await knex.schema.hasColumn('conversation_turns', 'ai_used');
    const hasModel = await knex.schema.hasColumn('conversation_turns', 'model');
    const hasLatencyMs = await knex.schema.hasColumn('conversation_turns', 'latency_ms');
    const hasTokensEst = await knex.schema.hasColumn('conversation_turns', 'tokens_est');
    const hasPolicyDecision = await knex.schema.hasColumn('conversation_turns', 'policy_decision');

    if (hasAiUsed || hasModel || hasLatencyMs || hasTokensEst || hasPolicyDecision) {
        await knex.schema.alterTable('conversation_turns', (table) => {
            if (hasAiUsed) {
                table.dropColumn('ai_used');
            }
            if (hasModel) {
                table.dropColumn('model');
            }
            if (hasLatencyMs) {
                table.dropColumn('latency_ms');
            }
            if (hasTokensEst) {
                table.dropColumn('tokens_est');
            }
            if (hasPolicyDecision) {
                table.dropColumn('policy_decision');
            }
        });
        console.log('✅ Removed AI Gateway tracking columns from conversation_turns');
    } else {
        console.log('ℹ️ AI Gateway columns do not exist, nothing to rollback');
    }
};
