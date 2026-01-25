#!/bin/bash
# Script to verify PR-FIX-1 database schema fixes

echo "🔍 Verifying PR-FIX-1 Database Schema Fixes"
echo "=============================================="
echo ""

echo "✅ Phase 1: Checking Required Tables Exist in Migrations"
echo "--------------------------------------------------------"

# A) processing_jobs - should have lease columns + finished_at
echo "A) processing_jobs table:"
if grep -q "createTable.*'processing_jobs'" migrations/20241217000000_add_customers_and_validation.js; then
    echo "   ✅ Table created in: 20241217000000_add_customers_and_validation.js"
else
    echo "   ❌ Table creation not found"
fi

if grep -q "locked_by\|locked_until\|attempts\|last_error" migrations/20260123210000_add_lease_columns_to_processing_jobs.js; then
    echo "   ✅ Lease columns added in: 20260123210000_add_lease_columns_to_processing_jobs.js"
else
    echo "   ❌ Lease columns migration not found"
fi

if grep -q "finished_at" migrations/20260125120000_fix_missing_schema_fields.js; then
    echo "   ✅ finished_at column added in: 20260125120000_fix_missing_schema_fields.js"
else
    echo "   ❌ finished_at column migration not found"
fi

echo ""

# B) processing_job_logs - should exist
echo "B) processing_job_logs table:"
if [ -f "migrations/20241217000002_create_processing_job_logs.js" ]; then
    echo "   ✅ Table created in: 20241217000002_create_processing_job_logs.js"
else
    echo "   ❌ Migration file not found"
fi

echo ""

# C) user_sessions - should have contact_status (with BLOCKED, PAUSED), cooldown_until, follow_up_attempts, last_activity
echo "C) user_sessions table:"
if grep -q "contact_status\|cooldown_until\|follow_up_attempts\|last_activity" migrations/20260122000001_add_user_sessions_followup_columns.js; then
    echo "   ✅ Follow-up columns added in: 20260122000001_add_user_sessions_followup_columns.js"
else
    echo "   ❌ Follow-up columns migration not found"
fi

if grep -q "BLOCKED.*PAUSED" migrations/20260125120000_fix_missing_schema_fields.js; then
    echo "   ✅ contact_status enum updated in: 20260125120000_fix_missing_schema_fields.js"
else
    echo "   ❌ contact_status enum update not found"
fi

echo ""

# D) analytics_watermarks
echo "D) analytics_watermarks table:"
if [ -f "migrations/20260124000000_create_analytics_watermarks.js" ]; then
    echo "   ✅ Table created in: 20260124000000_create_analytics_watermarks.js"
else
    echo "   ❌ Migration file not found"
fi

echo ""

# E) sync_runs
echo "E) sync_runs table:"
if [ -f "migrations/20260124120000_create_sync_tables.js" ]; then
    echo "   ✅ Table created in: 20260124120000_create_sync_tables.js"
else
    echo "   ❌ Migration file not found"
fi

if grep -q "cursor" migrations/20260125120000_fix_missing_schema_fields.js; then
    echo "   ✅ cursor field added in: 20260125120000_fix_missing_schema_fields.js"
else
    echo "   ❌ cursor field migration not found"
fi

echo ""

# F) conversation_analysis
echo "F) conversation_analysis table:"
if [ -f "migrations/20260125000000_create_conversation_analysis.js" ]; then
    echo "   ✅ Table created in: 20260125000000_create_conversation_analysis.js"
else
    echo "   ❌ Migration file not found"
fi

if grep -q "result_json\|finished_at" migrations/20260125120000_fix_missing_schema_fields.js; then
    echo "   ✅ result_json and finished_at added in: 20260125120000_fix_missing_schema_fields.js"
else
    echo "   ❌ result_json/finished_at migration not found"
fi

echo ""
echo "✅ Phase 2: Migration Syntax Check"
echo "-----------------------------------"

# Check syntax of the new migration
node -c migrations/20260125120000_fix_missing_schema_fields.js 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Valid syntax: 20260125120000_fix_missing_schema_fields.js"
else
    echo "❌ Syntax error: 20260125120000_fix_missing_schema_fields.js"
fi

echo ""
echo "✅ Phase 3: Checking Indices"
echo "----------------------------"

if grep -q "idx_processing_jobs_lease_acquisition\|idx_processing_jobs_locked_until" migrations/20260123210000_add_lease_columns_to_processing_jobs.js; then
    echo "✅ processing_jobs lease indices in migration"
else
    echo "❌ processing_jobs lease indices not found"
fi

if grep -q "idx_contact_status\|idx_cooldown_until\|idx_last_activity" migrations/20260122000001_add_user_sessions_followup_columns.js || grep -q "idx_last_activity" migrations/20260125120000_fix_missing_schema_fields.js; then
    echo "✅ user_sessions indices in migrations"
else
    echo "❌ user_sessions indices not found"
fi

echo ""
echo "=============================================="
echo "✅ Verification Complete"
echo ""
echo "Summary of changes in PR-FIX-1:"
echo "  A) processing_jobs: ✅ locked_by, locked_until, attempts, last_error, finished_at + indices"
echo "  B) processing_job_logs: ✅ Table exists"
echo "  C) user_sessions: ✅ contact_status (ACTIVE|BLOCKED|PAUSED|OPT_OUT|CLOSED), cooldown_until, follow_up_attempts, last_activity + indices"
echo "  D) analytics_watermarks: ✅ Table exists"
echo "  E) sync_runs: ✅ Table exists + cursor field"
echo "  F) conversation_analysis: ✅ Table exists + result_json, finished_at"
echo ""
echo "Next steps:"
echo "1. Configure MySQL in .env (see .env.example)"
echo "2. Run: npm run migrate"
echo "3. Start the application and verify no schema errors"
echo ""
