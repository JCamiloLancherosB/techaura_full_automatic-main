# PII Minimization Implementation

This document describes the PII (Personally Identifiable Information) minimization implementation for the TechAura application.

## Overview

The implementation ensures that sensitive customer data (phone numbers and addresses) is protected through:
1. **Automatic redaction in logs** - PII is never written to logs in plaintext
2. **Encryption at rest** - Sensitive data is encrypted in the database using AES-256-GCM
3. **Searchability preservation** - Hash-based search allows finding records without exposing plaintext

## Components

### 1. PII Redactor (`src/utils/piiRedactor.ts`)

Automatic redaction of PII in logs and text:

```typescript
import { redactPII } from './utils/piiRedactor';

const message = 'Customer phone: 3001234567, address: Calle 123 #45-67';
console.log(redactPII(message));
// Output: Customer phone: [PHONE-***4567], address: [ADDRESS-REDACTED]
```

**Features:**
- Redacts Colombian phone numbers (keeps last 4 digits for reference)
- Redacts Colombian addresses
- Works recursively on objects for structured logging
- Preserves non-PII fields (hashes, IDs, etc.)

### 2. Encryption Utilities (`src/utils/encryptionUtils.ts`)

AES-256-GCM encryption for sensitive data:

```typescript
import { encrypt, decrypt, generateHash, getLast4 } from './utils/encryptionUtils';

// Encrypt data
const encrypted = encrypt('3001234567');

// Decrypt data
const decrypted = decrypt(encrypted);

// Generate searchable hash
const hash = generateHash('3001234567');

// Extract last 4 digits for partial matching
const last4 = getLast4('3001234567'); // Returns: '4567'
```

**Features:**
- AES-256-GCM encryption with random IVs
- Environment-based encryption key (PII_ENCRYPTION_KEY)
- SHA-256 hashing for searchability
- Last 4 digits extraction for partial matching

### 3. Structured Logger Integration

The structured logger automatically redacts PII:

```typescript
import { structuredLogger } from './utils/structuredLogger';

// PII is automatically redacted in all logs
structuredLogger.info('chatbot', 'Customer data received', {
    message: 'Phone: 3001234567, Address: Calle 123 #45-67'
});
// Logs: "Phone: [PHONE-***4567], Address: [ADDRESS-REDACTED]"
```

### 4. Database Schema

New columns added to `orders` table:

| Column | Type | Purpose |
|--------|------|---------|
| `shipping_encrypted` | TEXT | AES-GCM encrypted shipping data |
| `phone_hash` | VARCHAR(64) | SHA-256 hash for phone search |
| `phone_last4` | VARCHAR(4) | Last 4 digits for partial match |
| `address_hash` | VARCHAR(64) | SHA-256 hash for address search |

**Migration:** `migrations/20260123150000_add_pii_encryption_fields.js`

### 5. OrderRepository Encryption

Orders automatically encrypt shipping data on save:

```typescript
import { orderRepository } from './repositories/OrderRepository';

// Create order - shipping data is encrypted automatically
await orderRepository.create({
    shipping_json: JSON.stringify({
        name: 'Juan Pérez',
        phone: '3001234567',
        address: 'Calle 123 #45-67',
        city: 'Bogotá'
    }),
    // ... other fields
});

// Search by phone hash
const orders = await orderRepository.findByPhoneNumber('3001234567');

// Search by last 4 digits
const orders = await orderRepository.findByPhoneLast4('4567');

// Retrieve with decryption (admin only)
const order = await orderRepository.findById(orderId, true);
```

### 6. Admin Panel Decryption

Admin views automatically decrypt shipping data:

```typescript
import { orderService } from './admin/services/OrderService';

// Get order with decrypted shipping data
const order = await orderService.getOrderById(orderId);

// order.shippingData contains decrypted data
console.log(order.shippingData?.phone); // Plaintext phone for admin
```

## Setup

### 1. Generate Encryption Key

Generate a secure 32-byte encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configure Environment

Add to `.env`:

```env
# PII Encryption Key (REQUIRED in production)
PII_ENCRYPTION_KEY=your_generated_64_character_hex_key_here
```

### 3. Run Migration

Apply the database schema changes:

```bash
npm run migrate
```

### 4. Test Implementation

Run the PII minimization tests:

```bash
export PII_ENCRYPTION_KEY=your_key_here
npx tsx src/tests/piiMinimization.test.ts
```

## Security Considerations

### Encryption Key Management

- **NEVER** commit the encryption key to version control
- Use a secrets management service in production (AWS Secrets Manager, Azure Key Vault, etc.)
- Rotate the key periodically (requires re-encrypting existing data)
- Back up the key securely (lost keys = lost data)

### Access Control

- Only admin users should see decrypted data
- Log access to sensitive data for audit trails
- Implement rate limiting on search APIs

### Compliance

This implementation helps meet:
- **GDPR** Article 32 (Security of processing)
- **PCI DSS** Requirement 3 (Protect stored cardholder data)
- **SOC 2** CC6.1 (Logical and physical access controls)

## API Reference

### PII Redactor

```typescript
// Redact phone numbers
redactPhone(text: string): string

// Redact addresses
redactAddress(text: string): string

// Redact all PII
redactPII(text: string): string

// Redact PII in objects
redactPIIFromObject(obj: any): any

// Check if text contains PII
containsPII(text: string): boolean
```

### Encryption Utils

```typescript
// Encrypt data
encrypt(plaintext: string): string

// Decrypt data
decrypt(encryptedData: string): string

// Generate SHA-256 hash
generateHash(text: string): string

// Get last N characters
getLast4(text: string): string

// Encrypt specific fields in object
encryptFields<T>(obj: T, fields: (keyof T)[]): T

// Decrypt specific fields in object
decryptFields<T>(obj: T, fields: (keyof T)[]): T
```

### OrderRepository

```typescript
// Create order (auto-encrypts shipping_json)
create(order: OrderRecord): Promise<OrderRecord>

// Find by ID (with optional decryption)
findById(id: string, decryptForAdmin?: boolean): Promise<OrderRecord | null>

// Search by phone hash
findByPhoneHash(phoneHash: string, decryptForAdmin?: boolean): Promise<OrderRecord[]>

// Search by phone number (generates hash automatically)
findByPhoneNumber(phone: string, decryptForAdmin?: boolean): Promise<OrderRecord[]>

// Search by last 4 digits
findByPhoneLast4(last4: string, decryptForAdmin?: boolean): Promise<OrderRecord[]>
```

## Testing

Run all tests:

```bash
# Set encryption key
export PII_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Run tests
npx tsx src/tests/piiMinimization.test.ts
```

Expected output:
```
✅ Phone number redaction: PASS
✅ Address redaction: PASS
✅ Combined PII redaction: PASS
✅ Encryption/Decryption: PASS
✅ Hash generation: PASS
✅ Last 4 extraction: PASS
✅ Address hash searchability: PASS
```

## Monitoring

### Metrics to Track

1. **Encryption failures** - Alert if encryption fails during order creation
2. **Decryption failures** - May indicate key rotation issues
3. **PII in logs** - Automated scanning for unredacted PII
4. **Search performance** - Hash-based searches should be fast with proper indexing

### Log Analysis

Search logs for potential PII leaks:

```bash
# Check for unredacted phone numbers
grep -E '\+?57[0-9]{10}' logs/*.log

# Check for unredacted addresses
grep -iE 'calle|carrera [0-9]' logs/*.log
```

## Troubleshooting

### Decryption Errors

If you see "Failed to decrypt data":
1. Verify `PII_ENCRYPTION_KEY` is set correctly
2. Check if the key has changed (may need to re-encrypt)
3. Verify the encrypted data is not corrupted

### Search Not Finding Records

If hash-based search isn't working:
1. Verify indexes exist on `phone_hash` and `address_hash`
2. Check that data was encrypted with the same normalization
3. Verify the search input is being hashed correctly

### Performance Issues

If encryption/decryption is slow:
1. Ensure database has proper indexes
2. Consider caching decrypted data for admin sessions
3. Use batch operations for bulk encryption/decryption

## Future Enhancements

1. **Key Rotation** - Implement automated key rotation with re-encryption
2. **Field-level Encryption** - Extend to other sensitive fields (cedula, email)
3. **Audit Logging** - Track all access to decrypted data
4. **Data Masking** - Partial masking for non-admin users
5. **Tokenization** - Replace sensitive data with tokens for additional security

## References

- [NIST SP 800-38D - GCM Mode](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [GDPR Article 32](https://gdpr-info.eu/art-32-gdpr/)
