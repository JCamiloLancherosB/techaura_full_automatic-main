# Shipment Tracking Integration - Implementation Summary

## Overview
This document describes the shipment tracking module implemented for the TechAura chatbot, enabling customers to track their orders through WhatsApp.

## Features Implemented

### 1. Core Tracking Service (`src/services/ShipmentTrackingService.ts`)

#### Multi-Carrier Support
- **Servientrega**: Tracking numbers with 11-12 digits
- **Coordinadora**: Format `XX999999999XX` (2 letters + 9 digits + 2 letters)
- **InterRapidísimo**: 10-digit tracking numbers

#### Key Methods
- `trackShipment(trackingNumber, carrier?)` - Track a shipment with automatic carrier detection
- `getTrackingForCustomer(phone)` - Get all active shipments for a customer
- `updateAllActiveShipments()` - Background update for all active shipments
- `checkForStatusChange()` - Detect status changes and send notifications

#### Caching System
- Database-backed caching with 1-hour TTL
- Reduces API calls and improves response time
- Automatic cache invalidation on updates

#### Notification System
- Automatic WhatsApp notifications on status changes:
  - 🚚 In Transit
  - 📦 Out for Delivery
  - ✅ Delivered
  - ⚠️ Exception

### 2. Scheduled Updates (`src/services/TrackingScheduler.ts`)

- Runs every 2 hours to update all active shipments
- Initial run 30 seconds after startup
- Rate limiting: 1 second delay between shipments
- Proper cleanup functions for graceful shutdown

### 3. WhatsApp Integration (`src/flows/trackingFlow.ts`)

#### Tracking Flow
Triggered by keywords:
- "rastrear"
- "tracking"
- "guia"
- "donde esta mi pedido"
- "estado envio"

Returns:
- Tracking number
- Carrier name
- Current status
- Current location
- Last 3 tracking events

#### Direct Tracking Number Flow
Automatically detects tracking numbers in messages and provides instant tracking information.

### 4. Database Schema (`src/mysql-database.ts`)

#### shipment_tracking Table
```sql
CREATE TABLE IF NOT EXISTS shipment_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number VARCHAR(50) UNIQUE NOT NULL,
    carrier VARCHAR(50) NOT NULL,
    order_number VARCHAR(255) NULL,
    status VARCHAR(50) NOT NULL,
    current_location VARCHAR(255) NULL,
    estimated_delivery DATE NULL,
    last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tracking (tracking_number),
    INDEX idx_order (order_number),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

#### tracking_events Table
```sql
CREATE TABLE IF NOT EXISTS tracking_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number VARCHAR(50) NOT NULL,
    event_date DATETIME NOT NULL,
    status VARCHAR(100) NOT NULL,
    location VARCHAR(255) NULL,
    description TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tracking (tracking_number),
    INDEX idx_date (event_date),
    FOREIGN KEY (tracking_number) REFERENCES shipment_tracking(tracking_number) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

#### orders Table Updates
Added columns:
- `tracking_number VARCHAR(50)` - Tracking number from carrier
- `carrier VARCHAR(50)` - Carrier name
- `shipping_status VARCHAR(50)` - Current shipping status

## Performance Optimizations

1. **Batch Inserts**: Events are inserted in a single query instead of individual INSERTs
2. **Efficient Phone Matching**: Uses `RIGHT(phone_number, 10)` instead of `LIKE` for better index usage
3. **Database Indexing**: All tables have proper indexes on frequently queried columns
4. **Caching**: 1-hour cache reduces database and API load

## Integration Points

### App.ts Integration
```typescript
import { trackingFlow, directTrackingFlow } from './flows/trackingFlow';
import { startTrackingScheduler } from './services/TrackingScheduler';

// In createFlow array
const adapterFlow = createFlow([
  // ... other flows
  trackingFlow, 
  directTrackingFlow
]);

// Start scheduler
startTrackingScheduler();
```

## TODO: Actual Carrier API Integration

Currently, the service uses mock data for testing. To integrate with actual carrier APIs:

### 1. Update carrierAPIs Configuration
Replace placeholder URLs with actual API endpoints:
```typescript
private carrierAPIs: Record<string, {
    trackUrl: string;
    apiKey?: string; // Add API keys as needed
    parseResponse: (data: any) => TrackingInfo | null;
}> = {
    'servientrega': {
        trackUrl: 'https://api.servientrega.com/tracking', // Replace with actual API
        apiKey: process.env.SERVIENTREGA_API_KEY,
        parseResponse: this.parseServientrega.bind(this)
    },
    // ... other carriers
};
```

### 2. Implement Parser Methods
Update the parser methods to handle actual API responses:
```typescript
private parseServientrega(data: any): TrackingInfo | null {
    // Parse actual Servientrega API response
    return {
        trackingNumber: data.trackingNumber,
        carrier: 'servientrega',
        status: this.mapStatus(data.status),
        currentLocation: data.location,
        estimatedDelivery: new Date(data.estimatedDelivery),
        events: data.events.map(e => ({
            date: new Date(e.date),
            status: e.status,
            location: e.location,
            description: e.description
        })),
        lastUpdate: new Date()
    };
}
```

### 3. Implement fetchTrackingFromCarrier
Replace mock implementation with actual API calls:
```typescript
private async fetchTrackingFromCarrier(
    trackingNumber: string,
    carrier: string
): Promise<TrackingInfo | null> {
    const carrierAPI = this.carrierAPIs[carrier];
    
    try {
        const response = await axios.get(carrierAPI.trackUrl, {
            params: { trackingNumber },
            headers: { 'Authorization': `Bearer ${carrierAPI.apiKey}` }
        });
        
        return carrierAPI.parseResponse(response.data);
    } catch (error) {
        console.error(`Error fetching from ${carrier}:`, error);
        return null;
    }
}
```

## Testing

### Manual Testing
1. Send "rastrear" to the WhatsApp bot
2. Send a tracking number directly (e.g., "12345678901")
3. Check database for created records

### Database Verification
```sql
-- Check shipment_tracking records
SELECT * FROM shipment_tracking;

-- Check tracking_events
SELECT * FROM tracking_events;

-- Check orders with tracking info
SELECT order_number, tracking_number, carrier, shipping_status 
FROM orders 
WHERE tracking_number IS NOT NULL;
```

## Troubleshooting

### Common Issues

1. **"Unknown carrier for tracking"**
   - Verify tracking number format matches carrier patterns
   - Check carrier detection regex patterns

2. **No tracking information found**
   - Verify order has tracking_number in database
   - Check that phone number matches order

3. **Notifications not sending**
   - Verify WhatsApp provider is available
   - Check global.adapterProvider is set

## Security Considerations

✅ No security vulnerabilities detected (CodeQL scan passed)
✅ SQL injection prevention through parameterized queries
✅ Input validation on tracking numbers
✅ Proper error handling to prevent information leakage

## Maintenance

### Regular Tasks
- Monitor scheduled update success rate
- Check for failed shipments in error logs
- Review tracking event accumulation
- Clean up old delivered shipments (consider archive strategy)

### Monitoring Queries
```sql
-- Active shipments
SELECT COUNT(*) FROM shipment_tracking 
WHERE status IN ('pending', 'in_transit', 'out_for_delivery');

-- Recent updates
SELECT tracking_number, status, last_checked_at 
FROM shipment_tracking 
ORDER BY last_checked_at DESC 
LIMIT 20;

-- Status distribution
SELECT status, COUNT(*) as count 
FROM shipment_tracking 
GROUP BY status;
```

## Future Enhancements

1. **Email Notifications**: Add email tracking updates
2. **Push Notifications**: Mobile app integration
3. **Tracking History**: Archive old tracking data
4. **Analytics Dashboard**: Shipping performance metrics
5. **Carrier Comparison**: Compare delivery times across carriers
6. **Predictive Delivery**: ML-based delivery time estimation

## Support

For issues or questions about the shipment tracking module:
1. Check logs in console for error messages
2. Review database records for data consistency
3. Verify API credentials for carrier integration
4. Contact TechAura development team

---

**Implementation Date**: January 31, 2026  
**Version**: 1.0.0  
**Status**: Framework Complete - Pending Carrier API Integration
