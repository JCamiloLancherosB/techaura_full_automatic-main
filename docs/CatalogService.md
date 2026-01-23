# Unified Catalog Service Documentation

## Overview

The `CatalogService` is a unified product catalog service that serves as the **Single Source of Truth (SSOT)** for all product categories, capacities, prices, promotions, inclusions, and restrictions across the entire application.

## Purpose

Before this implementation, pricing and product information was scattered across multiple files with inconsistencies:
- `src/constants/pricing.ts` - Main pricing source
- `src/flows/prices.ts` - Outdated hardcoded prices
- `src/flows/helpers/finalizeOrder.ts` - Custom pricing logic
- Multiple flows with embedded pricing

Now, all flows use `CatalogService` for consistent, centralized product data.

## Benefits

✅ **Single Source of Truth** - All pricing comes from one place  
✅ **Consistency** - Price changes automatically reflect across all flows  
✅ **Maintainability** - Easy to manage product catalog  
✅ **Testability** - Comprehensive test coverage  
✅ **Flexibility** - Supports multiple capacity formats  
✅ **Type Safety** - Full TypeScript support

## Architecture

```
constants/pricing.ts (Data Layer)
         ↓
CatalogService.ts (Service Layer)
         ↓
    ┌────────┬────────┬────────┬────────┐
    ↓        ↓        ↓        ↓        ↓
prices.ts  music   videos   movies   games
         capacity capacity  USB     USB
```

## Installation & Usage

### Importing the Service

```typescript
import { catalogService } from '../services/CatalogService';
```

### Basic Usage

#### Get All Categories
```typescript
const categories = catalogService.getCategories();
// Returns: [
//   { id: 'music', name: 'music', displayName: 'USB Musical', ... },
//   { id: 'videos', name: 'videos', displayName: 'USB Videos', ... },
//   { id: 'movies', name: 'movies', displayName: 'USB Películas', ... }
// ]
```

#### Get Products by Category
```typescript
const musicProducts = catalogService.getProductsByCategory('music');
// Returns array of products with:
// - id, categoryId, capacity, capacityGb
// - price, content (count + unit)
// - inclusions, restrictions, promos
// - popular, recommended flags
```

#### Get Price (Multiple Formats)
```typescript
// All three return the same price!
catalogService.getPrice('music', '32GB');  // String with GB
catalogService.getPrice('music', 32);      // Number
catalogService.getPrice('music', '32');    // String without GB

// Get formatted price
catalogService.getFormattedPrice('music', 32);  // Returns "$84.900"
```

#### Validate Selection
```typescript
const result = catalogService.validateSelection('music', 32);
// Returns: { isValid: true, errors: [], warnings: [] }

const invalidResult = catalogService.validateSelection('music', 16);
// Returns: { 
//   isValid: false, 
//   errors: ['Capacidad no disponible: 16GB para categoría music'],
//   warnings: ['Capacidades disponibles: 8GB, 32GB, 64GB, 128GB']
// }
```

#### Search Products
```typescript
// Find affordable products
const affordable = catalogService.searchProducts({ maxPrice: 100000 });

// Find high-capacity products
const highCap = catalogService.searchProducts({ minCapacity: 128 });

// Combine filters
const filtered = catalogService.searchProducts({ 
    categoryId: 'music',
    minCapacity: 32,
    maxPrice: 100000
});
```

## API Reference

### Core Methods

#### `getCategories(): Category[]`
Returns all available product categories.

**Returns:**
```typescript
Array<{
  id: CategoryId;
  name: string;
  displayName: string;
  description: string;
  icon: string;
}>
```

#### `getCategory(categoryId: CategoryId): Category | null`
Get a specific category by ID.

**Parameters:**
- `categoryId`: 'music' | 'videos' | 'movies'

**Returns:** Category object or null if not found

#### `getProductsByCategory(categoryId: CategoryId): Product[]`
Get all products for a specific category.

**Parameters:**
- `categoryId`: 'music' | 'videos' | 'movies'

**Returns:**
```typescript
Array<{
  id: string;
  categoryId: CategoryId;
  capacity: string;
  capacityGb: number;
  price: number;
  content: { count: number; unit: string; };
  inclusions: string[];
  restrictions?: string[];
  promos?: string[];
  popular?: boolean;
  recommended?: boolean;
}>
```

#### `getPrice(categoryId: CategoryId, capacityGb: string | number, variant?: string): number`
Get price for a product. Supports multiple capacity formats.

**Parameters:**
- `categoryId`: 'music' | 'videos' | 'movies'
- `capacityGb`: Capacity as number (32), string ("32"), or string with unit ("32GB")
- `variant`: (Optional) Future extension for variants

**Returns:** Price in Colombian Pesos (number)

#### `getFormattedPrice(categoryId: CategoryId, capacityGb: string | number, variant?: string): string`
Get formatted price string.

**Parameters:** Same as `getPrice()`

**Returns:** Formatted price string (e.g., "$84.900")

#### `validateSelection(categoryId: CategoryId, capacityGb: string | number): ValidationResult`
Validate a product selection.

**Parameters:**
- `categoryId`: 'music' | 'videos' | 'movies'
- `capacityGb`: Capacity to validate

**Returns:**
```typescript
{
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}
```

#### `getAvailableCapacities(categoryId: CategoryId): string[]`
Get all available capacities for a category.

**Parameters:**
- `categoryId`: 'music' | 'videos' | 'movies'

**Returns:** Array of capacity strings (e.g., ['8GB', '32GB', '64GB', '128GB'])

#### `getProduct(categoryId: CategoryId, capacityGb: string | number): Product | null`
Get detailed product information.

**Parameters:**
- `categoryId`: 'music' | 'videos' | 'movies'
- `capacityGb`: Product capacity

**Returns:** Product object or null if not found

#### `getAllProducts(): Product[]`
Get all products across all categories.

**Returns:** Array of all products

#### `searchProducts(criteria): Product[]`
Search products with filters.

**Parameters:**
```typescript
{
  categoryId?: CategoryId;
  minPrice?: number;
  maxPrice?: number;
  minCapacity?: number;
  maxCapacity?: number;
}
```

**Returns:** Filtered array of products

## Integration Examples

### Flow Integration (prices.ts)

**Before:**
```typescript
const PRICING_INFO = {
    '8gb': { capacity: '8GB', price: '$59.900', ... },
    '16gb': { capacity: '16GB', price: '$69.900', ... },
    // Hardcoded, outdated prices
};
```

**After:**
```typescript
import { catalogService } from '../services/CatalogService';

const musicProducts = catalogService.getProductsByCategory('music');
musicProducts.forEach(product => {
    console.log(`${product.capacity} - ${catalogService.getFormattedPrice('music', product.capacityGb)}`);
});
```

### Product Selection (capacityMusic.ts)

**Before:**
```typescript
const usbProducts = {
    '1': { capacity: '8GB', price: 54900, songs: '1,400' },
    // Hardcoded product data
};
```

**After:**
```typescript
import { catalogService } from '../services/CatalogService';

const buildUsbProducts = () => {
    const musicProducts = catalogService.getProductsByCategory('music');
    return musicProducts.map(product => ({
        capacity: product.capacity,
        price: product.price,
        songs: product.content.count.toLocaleString('es-CO')
    }));
};
```

### Order Finalization (helpers/finalizeOrder.ts)

**Before:**
```typescript
const CAPACITY_PRICING = {
  '64GB': { basePrice: 119900, ... },
  '128GB': { basePrice: 159900, ... },
  // Hardcoded pricing logic
};
```

**After:**
```typescript
import { catalogService } from '../../services/CatalogService';

const buildCapacityPricing = () => {
    const movieProducts = catalogService.getProductsByCategory('movies');
    return movieProducts.reduce((pricing, product) => {
        pricing[product.capacity] = {
            basePrice: product.price,
            // ... other fields
        };
        return pricing;
    }, {});
};
```

## Testing

### Unit Tests
Run all unit tests:
```bash
npx tsx src/tests/catalogService.test.ts
```

**Coverage:**
- ✅ Singleton pattern
- ✅ Category retrieval
- ✅ Product retrieval by category
- ✅ Price retrieval (multiple formats)
- ✅ Price formatting
- ✅ Selection validation
- ✅ Available capacities
- ✅ Product search
- ✅ Price consistency with pricing.ts

### Integration Tests
Run integration tests:
```bash
npx tsx src/tests/catalogIntegration.test.ts
```

**Verifies:**
- ✅ Price consistency across CatalogService and pricing.ts
- ✅ All price format variations
- ✅ Validation logic
- ✅ Product availability

### Demonstration
Run the demonstration:
```bash
npx tsx src/tests/catalogDemo.ts
```

## Updating Prices

To update a price, simply modify `src/constants/pricing.ts`:

```typescript
export const PRICING: PricingConfig = {
    music: {
        '32GB': {
            songs: 5000,
            price: 84900  // Change this value
        },
        // ...
    }
};
```

The change automatically reflects in:
- prices.ts (price listing)
- capacityMusic.ts (music selection)
- capacityVideo.ts (video selection)
- moviesUsb.ts (movie selection)
- gamesUsb.ts (game selection)
- helpers/finalizeOrder.ts (order processing)
- All other flows using CatalogService

## Future Enhancements

Potential extensions to the service:
- Database-backed catalog (MySQL tables)
- Dynamic promotions and discounts
- User-specific pricing
- A/B testing different price points
- Seasonal pricing adjustments
- Inventory management integration
- Admin UI for catalog management

## Support

For issues or questions about the CatalogService, please refer to:
- Unit tests in `src/tests/catalogService.test.ts`
- Integration tests in `src/tests/catalogIntegration.test.ts`
- Demo script in `src/tests/catalogDemo.ts`
- Source code in `src/services/CatalogService.ts`
