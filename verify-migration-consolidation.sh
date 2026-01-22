#!/bin/bash
# Script to verify database migration consolidation

echo "🔍 Verifying Database Migration Consolidation"
echo "=============================================="
echo ""

echo "✅ Phase 1: Checking Migration Files"
echo "-------------------------------------"

# Check new migrations exist
if [ -f "migrations/20260122000000_consolidate_schema_and_indices.js" ]; then
    echo "✅ Found: 20260122000000_consolidate_schema_and_indices.js"
else
    echo "❌ Missing: 20260122000000_consolidate_schema_and_indices.js"
fi

if [ -f "migrations/20260122000001_add_user_sessions_followup_columns.js" ]; then
    echo "✅ Found: 20260122000001_add_user_sessions_followup_columns.js"
else
    echo "❌ Missing: 20260122000001_add_user_sessions_followup_columns.js"
fi

if [ -f "migrations/20260122000002_add_orders_processing_columns.js" ]; then
    echo "✅ Found: 20260122000002_add_orders_processing_columns.js"
else
    echo "❌ Missing: 20260122000002_add_orders_processing_columns.js"
fi

echo ""
echo "✅ Phase 2: Checking Documentation"
echo "-------------------------------------"

if [ -f "MIGRATIONS.md" ]; then
    echo "✅ Found: MIGRATIONS.md"
else
    echo "❌ Missing: MIGRATIONS.md"
fi

if [ -f "src/database/migrations/README.md" ]; then
    echo "✅ Found: src/database/migrations/README.md (deprecation notice)"
else
    echo "❌ Missing: src/database/migrations/README.md"
fi

echo ""
echo "✅ Phase 3: Checking Code Changes"
echo "-------------------------------------"

# Check runtime migrations removed from mysql-database.ts
if grep -q "import.*addFollowUpColumns" src/mysql-database.ts; then
    echo "❌ Runtime migration import still exists: addFollowUpColumns"
else
    echo "✅ Removed: addFollowUpColumns import"
fi

if grep -q "import.*ensureAllColumns" src/mysql-database.ts; then
    echo "❌ Runtime migration import still exists: ensureAllColumns"
else
    echo "✅ Removed: ensureAllColumns import"
fi

if grep -q "await addFollowUpColumns" src/mysql-database.ts; then
    echo "❌ Runtime migration call still exists: addFollowUpColumns"
else
    echo "✅ Removed: addFollowUpColumns call"
fi

if grep -q "await ensureAllColumns" src/mysql-database.ts; then
    echo "❌ Runtime migration call still exists: ensureAllColumns"
else
    echo "✅ Removed: ensureAllColumns call"
fi

echo ""
echo "✅ Phase 4: Migration Syntax Check"
echo "-------------------------------------"

# Function to check migration syntax
check_migration_syntax() {
    local migration_file=$1
    node -c "$migration_file" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ Valid syntax: $(basename $migration_file)"
    else
        echo "❌ Syntax error: $(basename $migration_file)"
    fi
}

# Check all new migrations
check_migration_syntax "migrations/20260122000000_consolidate_schema_and_indices.js"
check_migration_syntax "migrations/20260122000001_add_user_sessions_followup_columns.js"
check_migration_syntax "migrations/20260122000002_add_orders_processing_columns.js"

echo ""
echo "=============================================="
echo "✅ Verification Complete"
echo ""
echo "Next steps:"
echo "1. Configure MySQL in .env (see .env.example)"
echo "2. Run: pnpm run migrate"
echo "3. Run: pnpm run dev"
echo "4. Verify no 'Optional columns missing' warnings"
echo ""
