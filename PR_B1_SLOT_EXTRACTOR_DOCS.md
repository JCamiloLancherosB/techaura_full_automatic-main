# PR-B1: Slots Engine - Data Extraction with Validation

## Overview
Implements an intelligent slot extraction system that captures structured customer data (shipping information) from unstructured text messages, significantly reducing friction in the order process.

## Problem Solved
Previously, the bot required multiple back-and-forth messages to collect customer information:
- Bot asks for name → user responds
- Bot asks for phone → user responds  
- Bot asks for address → user responds
- Bot asks for city → user responds

Now, users can provide all information in a single message:
```
"Soy Juan, vivo en Soacha, barrio X, cra 10 # 20-30 casa 4"
```

## Architecture

### Core Components

#### 1. SlotExtractor (`src/core/SlotExtractor.ts`)
The main extraction engine that uses regex patterns to identify and extract structured data from free text.

**Supported Slots:**
- `name` - Customer name
- `phone` - Phone number (Colombian format)
- `city` - City name
- `neighborhood` - Neighborhood/barrio
- `address` - Street address
- `reference` - Landmarks/references
- `paymentMethod` - Payment method
- `deliveryTime` - Delivery time preference

**Key Features:**
- Confidence scoring (0-1) for each extracted slot
- Multi-pattern matching with fallback strategies
- Completeness tracking (percentage of required fields filled)
- Smart name capitalization and text normalization
- Colombian-specific patterns (cities, address formats, phone formats)

**API:**
```typescript
const result = slotExtractor.extractFromMessage(message);

// Result structure:
{
  slots: {
    name: { value: "Juan", confidence: 0.9, source: "explicit" },
    city: { value: "Soacha", confidence: 0.95, source: "explicit" },
    address: { value: "Cra 10 # 20-30 Casa 4", confidence: 0.95, source: "explicit" }
  },
  completeness: 0.75, // 75% of required fields filled
  confidence: 0.88,   // Average confidence across all slots
  missingRequired: ["phone"]
}
```

#### 2. ShippingValidators (`src/core/validators/shipping.ts`)
Validates and normalizes extracted data to ensure quality before storage.

**Validation Rules:**
- **Phone**: Must be 10-12 digits, Colombian mobile format (starts with 3)
- **Address**: Must contain street type (Calle/Carrera) and numbers, minimum 5 characters
- **Name**: 2-100 characters, alphabetic with spaces
- **City**: Minimum 2 characters

**Normalization:**
- Phone formatting: `+57 XXX XXX XXXX`
- Name/city capitalization with special cases (e.g., Bogotá with accent)
- Address abbreviations: CRA → uppercase, Calle → capitalized

**API:**
```typescript
const validation = shippingValidators.validateShippingData(data);
// Returns: { valid: boolean, errors: string[], warnings: string[] }

const normalized = shippingValidators.normalizeShippingData(data);
// Returns normalized data with proper formatting
```

#### 3. Order Events
New events added to `OrderEventEmitter`:

- **SHIPPING_CAPTURED**: Emitted when complete shipping data is successfully extracted
  - Includes completeness and confidence metrics
  - Used for analytics and monitoring

- **SHIPPING_VALIDATION_FAILED**: Emitted when extracted data fails validation
  - Includes list of validation errors
  - Helps identify common data quality issues

### Database Schema

**New Column:**
```sql
ALTER TABLE orders ADD COLUMN shipping_json JSON NULL COMMENT 'Structured shipping data extracted by SlotExtractor';
```

Stores the complete extraction result including:
- All extracted slots with confidence scores
- Completeness metrics
- Timestamp of extraction

### Integration

#### Flow Integration (`src/flows/datosCliente.ts`)
The SlotExtractor is integrated into the customer data collection flow:

1. **User sends message** → Extract slots
2. **Check completeness**:
   - If complete & high confidence (≥0.7) → Validate → Auto-confirm
   - If partial → Merge with previous session data → Prompt for missing fields
   - If mostly empty → Fall back to traditional step-by-step collection

3. **Validation**:
   - Valid → Store data, emit SHIPPING_CAPTURED event, proceed to payment
   - Invalid → Emit SHIPPING_VALIDATION_FAILED event, prompt for corrections

4. **Smart merging**: Uses `mergeWithExisting()` to combine data across multiple messages without losing context

## Usage Examples

### Example 1: Complete data in one message
```
User: "Soy Juan Pérez, vivo en Soacha, barrio Centro, cra 10 # 20-30 casa 4, mi teléfono es 3123456789"

Bot extracts:
- name: "Juan Pérez" (confidence: 0.9)
- city: "Soacha" (confidence: 0.95)
- neighborhood: "Centro" (confidence: 0.85)
- address: "Cra 10 # 20-30 Casa 4" (confidence: 0.95)
- phone: "+573123456789" (confidence: 0.95)

→ Completeness: 100%
→ Bot confirms and proceeds to payment
```

### Example 2: Partial data across messages
```
Message 1: "Soy María García"
→ Extracted: name
→ Bot: "Necesito tu teléfono y dirección"

Message 2: "3109876543, vivo en Bogotá"
→ Extracted: phone, city (merged with previous name)
→ Bot: "Por favor indica tu dirección"

Message 3: "Calle 45 # 67-89"
→ Extracted: address (merged with name, phone, city)
→ Completeness: 100%
→ Bot confirms and proceeds
```

## Testing

Run the comprehensive test suite:
```bash
npx tsx test-slot-extractor.ts
```

**Test Coverage:**
- Complete data extraction
- Partial data detection
- Phone number formats
- City recognition
- Address patterns (with/without house numbers)
- Payment methods
- Delivery times
- Multi-message merging
- Validation scenarios
- Normalization

## Performance Considerations

- **Regex Efficiency**: All patterns are pre-compiled and cached
- **Fallback Strategy**: Multiple patterns per slot type for better coverage
- **Confidence Thresholds**: Only auto-confirms when confidence ≥ 0.7 to avoid false positives
- **Session Storage**: Previous extractions stored in session to enable smart merging

## Future Enhancements

1. **AI-Powered Extraction**: Add optional AI (GPT/Gemini) for ambiguous cases
2. **Address Verification**: Integrate with Google Maps API for address validation
3. **Learning System**: Track extraction accuracy and adjust confidence thresholds
4. **More Slots**: Add support for department, cedula, alternate phone, special instructions
5. **Multilingual**: Support English and other languages

## Acceptance Criteria ✅

- ✅ If user sends complete address in one message, bot doesn't ask again
- ✅ If missing neighborhood/city, only asks for that specific data
- ✅ Test case: "Soy Juan, vivo en Soacha, barrio X, cra 10 # 20-30 casa 4" → captures completely
- ✅ Validates phone number with proper Colombian format
- ✅ Validates address has street type and numbers
- ✅ Emits events for monitoring (SHIPPING_CAPTURED, SHIPPING_VALIDATION_FAILED)
- ✅ Stores structured data in orders.shipping_json

## Security Summary

✅ **CodeQL Analysis**: No security vulnerabilities detected
- No SQL injection risks (uses parameterized queries)
- No XSS risks (data sanitized before storage)
- No regex DoS (all patterns tested with long inputs)
- Proper input validation on all user data

## Migration

To apply the database schema change:
```bash
npm run migrate
```

This will add the `shipping_json` column to the orders table.

## Rollback

If needed, rollback the migration:
```bash
npm run migrate:rollback
```

## Monitoring

Track the effectiveness of slot extraction:
- Monitor SHIPPING_CAPTURED events for success rate
- Monitor SHIPPING_VALIDATION_FAILED for common errors
- Check average confidence scores
- Track completeness percentages

Access metrics through the admin panel or database queries:
```sql
SELECT 
  JSON_EXTRACT(shipping_json, '$.completeness') as completeness,
  JSON_EXTRACT(shipping_json, '$.confidence') as confidence
FROM orders 
WHERE shipping_json IS NOT NULL;
```

## Author
JCamiloLancherosB
Date: January 23, 2026
