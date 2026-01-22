# MySQL SSOT (Single Source of Truth) Enforcement

## Overview

This system enforces **MySQL as the Single Source of Truth (SSOT)** for all database operations. SQLite usage is **BLOCKED at runtime** to ensure consistency and prevent data fragmentation.

## Key Features

### 🔒 Runtime Enforcement
- SQLite imports and usage are detected and blocked at startup
- Clear error messages guide developers to use MySQL adapter instead
- No SQLite `.db` files are created or accessed in production

### ✅ Required Configuration

```bash
# In your .env file:
DB_PROVIDER=mysql  # Only 'mysql' is allowed (optional - defaults to mysql)

# MySQL connection (REQUIRED):
MYSQL_DB_HOST=localhost
MYSQL_DB_PORT=3306
MYSQL_DB_USER=techaura_bot
MYSQL_DB_PASSWORD=your_secure_password
MYSQL_DB_NAME=techaura_bot
```

### 📋 Startup Logs

When the application starts correctly, you'll see:

```
🔒 MySQL SSOT: Validando configuración de base de datos...
🔒 DB provider selected: mysql
   MySQL SSOT enforcement: ACTIVE
   SQLite usage: BLOCKED
🔍 MySQL SSOT: Verificando que no se use SQLite...
✅ MySQL SSOT: No se detectó uso de SQLite
```

## Blocked Components

### ❌ DatabaseService (SQLite)
- **File:** `src/services/DatabaseService.ts`
- **Status:** BLOCKED - constructor throws error
- **Replacement:** Use `businessDB` from `src/mysql-database.ts`

### ❌ ProcessingOrchestrator (uses DatabaseService)
- **File:** `src/services/ProcessingOrchestrator.ts`
- **Status:** BLOCKED - constructor throws error
- **Note:** Not currently used in production
- **To use:** Refactor to use MySQL adapter

## How to Use MySQL Adapter

### ✅ Correct Usage

```typescript
// Import the MySQL adapter
import { businessDB } from './mysql-database';

// Use MySQL methods
const customer = await businessDB.getCustomerById(customerId);
await businessDB.saveOrder(order);
const sessions = await businessDB.getUserSessions();
```

### ❌ Incorrect Usage (BLOCKED)

```typescript
// DON'T DO THIS - Will throw error at runtime
import DatabaseService from './services/DatabaseService';
const db = new DatabaseService();  // ❌ BLOCKED

// DON'T DO THIS - Will throw error at runtime
import ProcessingOrchestrator from './services/ProcessingOrchestrator';
const orchestrator = new ProcessingOrchestrator();  // ❌ BLOCKED
```

## Error Messages

### If DB_PROVIDER is set incorrectly:
```
❌ ERROR CRÍTICO: MySQL SSOT enforcement
   DB_PROVIDER está configurado como 'sqlite', pero solo se permite 'mysql'
   Este sistema solo soporta MySQL como base de datos.
   Por favor, configura DB_PROVIDER=mysql en tu archivo .env o elimina esta variable.
```

### If SQLite is detected at runtime:
```
❌ ERROR CRÍTICO: MySQL SSOT enforcement - SQLite detectado
   Se detectaron imports/uso de SQLite: better-sqlite3
   Este sistema solo permite MySQL como base de datos.
   Por favor, elimina todos los imports y usos de SQLite en el código de producción.
```

### If DatabaseService is instantiated:
```
❌ ERROR CRÍTICO: MySQL SSOT enforcement
   DatabaseService (SQLite) está BLOQUEADO.
   Este sistema solo permite MySQL como base de datos.
   
   ❌ NO USAR: DatabaseService (SQLite)
   ✅ USAR: mysql-database.ts (MySQL adapter)
```

## Migration Guide

If you have code using SQLite, follow these steps:

### Step 1: Replace DatabaseService import
```typescript
// Before (BLOCKED):
import DatabaseService from './services/DatabaseService';

// After (CORRECT):
import { businessDB } from './mysql-database';
```

### Step 2: Replace instantiation
```typescript
// Before (BLOCKED):
const db = new DatabaseService();

// After (CORRECT):
// Just use businessDB directly - it's already instantiated
```

### Step 3: Update method calls
The MySQL adapter (`businessDB`) provides similar methods to DatabaseService:

| DatabaseService (SQLite) | businessDB (MySQL) |
|--------------------------|-------------------|
| `db.getCustomerById(id)` | `businessDB.getCustomerById(id)` |
| `db.saveCustomer(customer)` | `businessDB.saveCustomer(customer)` |
| `db.getOrderById(id)` | `businessDB.getOrderById(id)` |
| `db.saveOrder(order)` | `businessDB.saveOrder(order)` |

## Verification

To verify MySQL SSOT enforcement is working:

### 1. Check startup logs
Look for the required log message:
```
🔒 DB provider selected: mysql
```

### 2. Search for SQLite usage
```bash
# Should return no results (except in blocked files):
grep -r "import.*sqlite" src/ --include="*.ts"
grep -r "new Database(" src/ --include="*.ts"
grep -r "\.db['\"]" src/ --include="*.ts"
```

### 3. Try to use blocked components
They should fail immediately with clear error messages.

## Benefits

1. **Data Consistency**: Single source of truth prevents data fragmentation
2. **Scalability**: MySQL supports production workloads better than SQLite
3. **Clear Errors**: Runtime detection provides clear guidance
4. **No Silent Failures**: System fails fast if SQLite is used
5. **Developer Guidance**: Error messages guide to correct MySQL usage

## Technical Details

### Implementation Files
- `src/utils/dbConfig.ts` - Configuration validation and SQLite detection
- `src/app.ts` - Startup enforcement and logging
- `src/services/DatabaseService.ts` - Blocked SQLite service
- `src/services/ProcessingOrchestrator.ts` - Blocked orchestrator
- `src/mysql-database.ts` - MySQL adapter (CORRECT way to access DB)

### Detection Method
The system detects SQLite usage by:
1. Checking `DB_PROVIDER` environment variable
2. Checking `require.cache` for SQLite module imports at runtime
3. Blocking `DatabaseService` constructor
4. Blocking `ProcessingOrchestrator` constructor

## Support

If you encounter issues with MySQL SSOT enforcement:

1. Check that all required `MYSQL_*` environment variables are set
2. Verify MySQL is running and accessible
3. Review error messages - they provide specific guidance
4. Ensure you're using `businessDB` from `mysql-database.ts`
5. Don't try to import or use `DatabaseService` or `ProcessingOrchestrator`

## Related Files

- `.env.example` - Environment configuration template
- `src/mysql-database.ts` - MySQL adapter implementation
- `src/utils/dbConfig.ts` - Configuration and validation
- `src/utils/dbLogger.ts` - Database logging utilities
- `src/utils/dbRetry.ts` - Retry logic for DB operations
