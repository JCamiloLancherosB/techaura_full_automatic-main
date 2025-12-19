# Notificador Integration - Example Commands and Demo Scripts

This document provides practical examples for testing and using the Notificador service integration.

## Prerequisites

Before running these examples, make sure:

1. The Notificador service is running and accessible
2. You have configured the following environment variables in `.env`:
   ```bash
   NOTIFIER_BASE_URL=https://notificador.example.com/api/v1
   NOTIFIER_API_KEY=your_notificador_api_key_here
   DEFAULT_WHATSAPP_NUMBER=3008602789
   DEFAULT_EMAIL_FROM=noreply@techaura.com
   ```
3. TechauraBot is running: `npm run dev` or `npm start`

## API Endpoints

Base URL: `http://localhost:3006` (adjust port if needed)

### 1. Check Configuration Status

```bash
curl -X GET http://localhost:3006/api/notifications/config
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "baseUrl": "***configured***",
    "apiKey": "***configured***",
    "defaultWhatsAppNumber": "3008602789",
    "defaultEmailFrom": "noreply@techaura.com"
  }
}
```

### 2. Check Service Health

```bash
curl -X GET http://localhost:3006/api/notifications/health
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "timestamp": "2025-12-19T16:45:00.000Z"
  }
}
```

### 3. Send Test WhatsApp Notification

```bash
curl -X POST http://localhost:3006/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "phone": "573008602789",
    "name": "Test User"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "messageId": "msg_12345",
    "status": "sent",
    "timestamp": "2025-12-19T16:45:00.000Z"
  }
}
```

### 4. Send Test Email Notification

```bash
curl -X POST http://localhost:3006/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "email": "test@example.com",
    "name": "Test User"
  }'
```

### 5. Send Test SMS Notification

```bash
curl -X POST http://localhost:3006/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "sms",
    "phone": "573008602789",
    "name": "Test User"
  }'
```

### 6. Get Notification History

```bash
# Get last 20 notifications
curl -X GET "http://localhost:3006/api/notifications/history?limit=20&offset=0"

# Get notifications for specific channel
curl -X GET "http://localhost:3006/api/notifications/history?limit=20&channel=whatsapp"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "notif_123",
        "channel": "whatsapp",
        "recipient": {
          "phone": "573008602789",
          "name": "Test User"
        },
        "message": "Test notification from TechauraBot",
        "status": "sent",
        "sentAt": "2025-12-19T16:45:00.000Z"
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

### 7. Get Available Templates

```bash
# Get all templates
curl -X GET http://localhost:3006/api/notifications/templates

# Get templates for specific channel
curl -X GET "http://localhost:3006/api/notifications/templates?channel=whatsapp"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "order_confirmation",
        "name": "Order Confirmation",
        "channel": "whatsapp",
        "body": "Hola {{customerName}}, tu pedido {{orderId}} ha sido confirmado..."
      }
    ]
  }
}
```

## Integration Workflows

### Order Created Notification Flow

This notification is automatically triggered when an order is confirmed in the order flow.

**Trigger:** User confirms order in WhatsApp conversation

**What happens:**
1. Order is created with order number (e.g., `USB-123456`)
2. `orderEventEmitter.onOrderCreated()` is called
3. NotificadorService checks opt-in status
4. If allowed, sends order confirmation via WhatsApp
5. Customer receives confirmation with order details

### Payment Confirmed Notification Flow

**Trigger:** Payment is verified and confirmed

```javascript
// Example in code
await orderEventEmitter.onPaymentConfirmed(
  orderNumber,
  customerPhone,
  customerName,
  customerEmail,
  {
    total: 50000,
    paymentMethod: 'Transferencia Bancaria',
    transactionId: 'TXN_123'
  }
);
```

### Status Changed Notification Flow

**Trigger:** Order status changes (preparación, en camino, entregado)

```javascript
// Example in code
await orderEventEmitter.onStatusChanged(
  orderNumber,
  customerPhone,
  'en_camino', // new status
  customerName,
  customerEmail,
  {
    previousStatus: 'preparacion',
    trackingUrl: 'https://tracking.example.com/USB-123456'
  }
);
```

### Abandoned Cart Reminder Flow

**Trigger:** Cart inactive for 24 hours

```javascript
// Example in code
await orderEventEmitter.onAbandonedCart(
  cartId,
  customerPhone,
  customerName,
  customerEmail,
  {
    items: [
      { name: 'USB Music 32GB', price: 45000 }
    ],
    total: 45000
  }
);
```

### Promotional Campaign Flow

**Trigger:** New promotion or campaign launch

```javascript
// Example in code
await orderEventEmitter.onPromoCampaign(
  customerPhone,
  'PROMO_CYBER2025',
  customerName,
  customerEmail,
  {
    title: 'Cyber Monday 2025',
    details: '30% de descuento en todos los productos',
    discountCode: 'CYBER30'
  }
);
```

## Testing Scenarios

### Scenario 1: Complete Order Flow

```bash
# Step 1: Check configuration
curl -X GET http://localhost:3006/api/notifications/config

# Step 2: Verify service health
curl -X GET http://localhost:3006/api/notifications/health

# Step 3: Send test order confirmation
curl -X POST http://localhost:3006/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "phone": "573008602789",
    "name": "Juan Pérez"
  }'

# Step 4: Check notification history
curl -X GET http://localhost:3006/api/notifications/history?limit=5
```

### Scenario 2: Multi-Channel Test

```bash
# Send WhatsApp notification
curl -X POST http://localhost:3006/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"channel": "whatsapp", "phone": "573008602789", "name": "Test User"}'

# Send Email notification
curl -X POST http://localhost:3006/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"channel": "email", "email": "test@example.com", "name": "Test User"}'

# Send SMS notification
curl -X POST http://localhost:3006/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"channel": "sms", "phone": "573008602789", "name": "Test User"}'

# Verify all were sent
curl -X GET http://localhost:3006/api/notifications/history?limit=10
```

## Web UI Access

Access the notification admin panel at:

```
http://localhost:3006/notifications/
```

Features:
- View configuration status
- Send test notifications
- View notification history (last 20)
- Monitor service health

## Troubleshooting

### Issue: Service shows as disabled

**Check:**
```bash
# Verify environment variables are set
curl -X GET http://localhost:3006/api/notifications/config
```

**Solution:** Ensure `NOTIFIER_BASE_URL` and `NOTIFIER_API_KEY` are configured in `.env`

### Issue: Health check fails

**Check:**
```bash
curl -X GET http://localhost:3006/api/notifications/health
```

**Solution:** 
- Verify Notificador service is running
- Check network connectivity
- Verify API key is valid

### Issue: Notifications not sending

**Check:**
1. Configuration status
2. Service health
3. Opt-in status for recipient
4. Contact information validity

**Debug:**
```bash
# Check logs in terminal running the bot
# Look for lines like:
# [NotificadorClient] Sending whatsapp notification to: 573008602789
# ✅ [NotificadorClient] Notification sent successfully: msg_12345
```

## Environment Variables Reference

```bash
# Required
NOTIFIER_BASE_URL=https://notificador.example.com/api/v1
NOTIFIER_API_KEY=your_api_key_here

# Optional (with defaults)
DEFAULT_WHATSAPP_NUMBER=3008602789
DEFAULT_EMAIL_FROM=noreply@techaura.com
NOTIFIER_TIMEOUT=30000
NOTIFIER_MAX_RETRIES=3
NOTIFIER_RETRY_DELAY=1000
```

## Next Steps

1. Configure your Notificador service credentials
2. Test the integration using the curl commands above
3. Access the web UI to monitor notifications
4. Integrate notification hooks in your custom workflows
5. Monitor logs and notification history

## Support

For issues or questions:
- Check the logs in the terminal
- Review the notification history in the admin panel
- Verify Notificador service is operational
- Check environment variable configuration
