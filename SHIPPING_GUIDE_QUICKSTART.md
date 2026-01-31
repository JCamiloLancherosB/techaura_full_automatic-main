# Quick Start Guide - Shipping Guide Automation

## Prerequisites
- Node.js 18+
- MySQL database configured
- Active WhatsApp connection (for delivery)

## Installation

1. **Install dependencies** (already done if you ran `npm install`):
```bash
npm install
```

The following dependencies are now included:
- pdfjs-dist@^4.0.379
- tesseract.js@^6.0.1
- sharp@^0.34.4
- multer@^2.0.2

2. **Database Migration** (automatic on startup):
The system will automatically add these columns to the `orders` table:
- tracking_number (VARCHAR 255)
- carrier (VARCHAR 100)
- shipping_status (ENUM)
- shipped_at (DATETIME)

## Testing

### 1. Run Unit Tests
```bash
# Simple tests (no database required)
node test-shipping-simple.js
```

Expected output:
```
📊 Final Results: 13/15 tests passed
✅ All core logic tests PASSED!
```

### 2. Start the Server
```bash
npm start
```

Look for this in the logs:
```
✅ Shipping guide routes registered
```

### 3. Test Health Endpoint
```bash
curl http://localhost:3000/api/shipping/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "service": "shipping-guide-automation",
    "timestamp": "2024-01-31T12:00:00.000Z"
  }
}
```

## Usage Examples

### Upload Single Guide

**Using cURL:**
```bash
curl -X POST http://localhost:3000/api/shipping/guide \
  -F "guide=@/path/to/shipping-guide.pdf"
```

**Using JavaScript (Node.js):**
```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function uploadGuide() {
  const form = new FormData();
  form.append('guide', fs.createReadStream('shipping-guide.pdf'));
  
  const response = await axios.post(
    'http://localhost:3000/api/shipping/guide',
    form,
    { headers: form.getHeaders() }
  );
  
  console.log(response.data);
}

uploadGuide();
```

**Using Python:**
```python
import requests

files = {'guide': open('shipping-guide.pdf', 'rb')}
response = requests.post('http://localhost:3000/api/shipping/guide', files=files)
print(response.json())
```

### Upload Multiple Guides (Batch)

**Using cURL:**
```bash
curl -X POST http://localhost:3000/api/shipping/guides/batch \
  -F "guides=@guide1.pdf" \
  -F "guides=@guide2.png" \
  -F "guides=@guide3.jpg"
```

**Using Python:**
```python
import requests

files = [
    ('guides', open('guide1.pdf', 'rb')),
    ('guides', open('guide2.png', 'rb')),
    ('guides', open('guide3.jpg', 'rb'))
]

response = requests.post('http://localhost:3000/api/shipping/guides/batch', files=files)
result = response.json()

print(f"Processed: {result['processed']}")
print(f"Successful: {result['successful']}")
print(f"Failed: {result['failed']}")

for item in result['results']:
    print(f"  {item['file']}: {'✓' if item['success'] else '✗'}")
```

## Sample Test Files

### Create a Test PDF with Sample Data

You can create test PDFs using tools like:
- LibreOffice/Word (export to PDF)
- Online PDF creators
- Command line: `pandoc test.md -o test.pdf`

**Sample content for testing:**
```
SERVIENTREGA

Guía de Envío
Número de Guía: SER123456789

Destinatario: Juan Perez Garcia
Teléfono: 300-123-4567
Dirección: Calle 50 #25-30
Ciudad: Bogotá
Departamento: Cundinamarca

Fecha de Envío: 2024-01-31
Entrega Estimada: 2024-02-02
```

## Troubleshooting

### Issue: "No file uploaded"
**Solution:** Ensure you're sending the file with the correct field name:
- Single: `guide`
- Batch: `guides` (array)

### Issue: "Invalid file type"
**Solution:** Only these file types are accepted:
- application/pdf
- image/png
- image/jpeg
- image/webp

### Issue: "No se encontró cliente coincidente"
**Reason:** The system couldn't match the guide to any customer in the database.
**Solution:**
1. Check the `error_logs` table for the unmatched guide data
2. Verify customer data exists in the `orders` table
3. Ensure phone numbers are in correct format (10 digits or with 57 prefix)
4. Check that customer names are reasonably similar

### Issue: Server not starting
**Solution:**
1. Check MySQL connection: `npm run test:mysql`
2. Verify all environment variables in `.env`
3. Check logs for specific errors

## Monitoring

### Check Logs
```bash
# Filter for shipping-related logs
tail -f logs/app.log | grep shipping
```

### Query Unmatched Guides
```sql
SELECT * FROM error_logs 
WHERE type = 'unmatched_shipping_guide' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Processing Stats
```sql
SELECT 
  shipping_status,
  COUNT(*) as count
FROM orders
WHERE shipped_at IS NOT NULL
GROUP BY shipping_status;
```

## What Happens When a Guide is Processed?

1. **Upload**: File uploaded via API
2. **Parse**: System extracts text (OCR for images, pdfjs for PDFs)
3. **Extract**: Identifies tracking number, customer name, phone, address, city, carrier
4. **Match**: Searches database for matching customer
   - First tries phone number (100% confidence)
   - Then tries name + city (≥80% confidence)
   - Finally tries address (≥70% confidence)
5. **Send**: If match found, sends guide via WhatsApp with formatted message
6. **Update**: Updates order with tracking info in database
7. **Log**: Logs unmatched guides for manual review if no match found
8. **Cleanup**: Deletes uploaded file

## Success Response Example
```json
{
  "success": true,
  "message": "Guía enviada exitosamente",
  "trackingNumber": "SER123456789",
  "sentTo": "573001234567"
}
```

## Error Response Example
```json
{
  "success": false,
  "message": "No se encontró cliente coincidente",
  "trackingNumber": "SER123456789"
}
```

## Production Checklist

Before deploying to production:

- [ ] Test with real shipping guides from each carrier
- [ ] Verify WhatsApp delivery works correctly
- [ ] Set up monitoring/alerting for unmatched guides
- [ ] Configure log rotation for `error_logs` table
- [ ] Add authentication to API endpoints
- [ ] Set up rate limiting
- [ ] Configure HTTPS
- [ ] Test batch processing with maximum file count
- [ ] Verify database performance with indexes
- [ ] Set up backup for unmatched guide data

## Support

For more details, see:
- **Full Documentation**: SHIPPING_GUIDE_AUTOMATION.md
- **Security Details**: SHIPPING_GUIDE_SECURITY.md
- **Code**: src/services/Shipping*.ts, src/routes/shippingRoutes.ts

## API Summary

| Endpoint | Method | Purpose | Max Files |
|----------|--------|---------|-----------|
| /api/shipping/guide | POST | Single guide | 1 |
| /api/shipping/guides/batch | POST | Multiple guides | 50 |
| /api/shipping/health | GET | Health check | N/A |
