# Automated Shipping Guide Delivery System

## Overview
This system automatically processes shipping guides (PDF/PNG/images), extracts customer data, matches it with the database, and sends the guide to the correct customer via WhatsApp.

## Features
- **Multi-format Support**: Processes PDF, PNG, JPG, JPEG, and WebP files
- **OCR Integration**: Uses Tesseract.js for text extraction from images
- **PDF Parsing**: Uses pdfjs-dist for PDF text extraction
- **Smart Matching**: Matches customers by phone, name, or address
- **Colombian Carriers**: Supports major carriers (Servientrega, Coordinadora, InterRapidisimo, etc.)
- **Batch Processing**: Can process multiple guides at once
- **Automated Delivery**: Sends guides via WhatsApp with tracking info

## Architecture

### Services

#### 1. ShippingGuideParser (`src/services/ShippingGuideParser.ts`)
Parses shipping guides from various formats and extracts key information:
- Tracking number
- Customer name
- Phone number (Colombian format)
- Shipping address
- City
- Carrier
- Estimated delivery date

**Supported Carriers:**
- Servientrega
- Coordinadora
- InterRapidisimo
- Envia
- TCC
- Deprisa

#### 2. CustomerMatcher (`src/services/CustomerMatcher.ts`)
Matches extracted data with customers in the database using multiple strategies:
- **Phone matching** (100% confidence): Exact or partial phone number match
- **Name + City matching** (≥80% confidence): Name similarity + city verification
- **Address matching** (≥70% confidence): Address similarity comparison

Uses fuzzy matching algorithms for names and addresses.

#### 3. ShippingGuideSender (`src/services/ShippingGuideSender.ts`)
Coordinates the entire process:
1. Parse the shipping guide
2. Find matching customer
3. Send guide via WhatsApp
4. Update order tracking info
5. Log unmatched guides for manual review

### API Endpoints

#### POST `/api/shipping/guide`
Upload and process a single shipping guide.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Field: `guide` (file)

**Response:**
```json
{
  "success": true,
  "message": "Guía enviada exitosamente",
  "trackingNumber": "SER123456789",
  "sentTo": "573001234567"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/shipping/guide \
  -F "guide=@/path/to/shipping-guide.pdf"
```

#### POST `/api/shipping/guides/batch`
Upload and process multiple shipping guides at once (max 50 files).

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Field: `guides[]` (multiple files)

**Response:**
```json
{
  "success": true,
  "processed": 5,
  "successful": 4,
  "failed": 1,
  "results": [
    {
      "file": "guide1.pdf",
      "success": true,
      "trackingNumber": "SER123456789",
      "sentTo": "573001234567"
    },
    {
      "file": "guide2.pdf",
      "success": false,
      "message": "No se encontró cliente coincidente"
    }
  ]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/shipping/guides/batch \
  -F "guides=@guide1.pdf" \
  -F "guides=@guide2.pdf" \
  -F "guides=@guide3.png"
```

#### GET `/api/shipping/health`
Check if the shipping guide service is healthy.

**Response:**
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

## Database Schema Updates

The `orders` table has been extended with shipping tracking columns:

```sql
ALTER TABLE orders 
ADD COLUMN tracking_number VARCHAR(255),
ADD COLUMN carrier VARCHAR(100),
ADD COLUMN shipping_status ENUM('pending', 'shipped', 'in_transit', 'delivered', 'failed') DEFAULT 'pending',
ADD COLUMN shipped_at DATETIME NULL,
ADD INDEX idx_tracking (tracking_number),
ADD INDEX idx_shipping_status (shipping_status);
```

These columns are automatically added on application startup if they don't exist.

## Configuration

### Environment Variables
No additional environment variables are required. The system uses the existing MySQL database configuration.

### File Upload Limits
- Maximum file size: 10 MB per file
- Maximum batch size: 50 files
- Supported formats: PDF, PNG, JPG, JPEG, WebP

### Upload Directory
Files are temporarily stored in `uploads/guides/` and automatically cleaned up after processing.

## Usage Examples

### Single Guide Upload (JavaScript/Node.js)
```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

const form = new FormData();
form.append('guide', fs.createReadStream('shipping-guide.pdf'));

const response = await axios.post('http://localhost:3000/api/shipping/guide', form, {
  headers: form.getHeaders()
});

console.log(response.data);
```

### Batch Upload (Python)
```python
import requests

files = [
    ('guides', open('guide1.pdf', 'rb')),
    ('guides', open('guide2.png', 'rb')),
    ('guides', open('guide3.jpg', 'rb'))
]

response = requests.post('http://localhost:3000/api/shipping/guides/batch', files=files)
print(response.json())
```

## Error Handling

### Unmatched Guides
If a guide cannot be matched to a customer, it's logged in the `error_logs` table:
- Type: `unmatched_shipping_guide`
- Message: Contains tracking number
- Stack trace: Contains full extracted data for manual review

### Processing Errors
All errors are caught and returned with appropriate HTTP status codes:
- 400: Bad request (no file, invalid format)
- 500: Server error (parsing failed, database error)

## Testing

### Unit Tests
Run the simple unit tests (no database required):
```bash
node test-shipping-simple.js
```

Tests include:
- Carrier detection patterns
- Tracking number extraction
- City detection
- Name similarity algorithm
- MIME type detection

### Integration Testing
1. Start the server: `npm start`
2. Upload a test shipping guide:
```bash
curl -X POST http://localhost:3000/api/shipping/guide \
  -F "guide=@test-guide.pdf"
```

## Monitoring

### Logs
All operations are logged with the `shipping` category:
```
[timestamp] INFO  [shipping] Processing guide: guide.pdf
[timestamp] INFO  [shipping] Guide sent successfully: SER123456789
```

View logs by filtering for the `shipping` category in your log aggregation tool.

### Health Check
Monitor service health via `/api/shipping/health` endpoint.

## Future Enhancements

Potential improvements for future versions:
1. **AI-powered OCR**: Use AI models for better accuracy on poor quality images
2. **Webhook notifications**: Send webhook notifications when guides are processed
3. **Admin dashboard**: Web interface for viewing unmatched guides
4. **Carrier APIs**: Direct integration with carrier tracking APIs
5. **Email support**: Send guides via email as backup
6. **Machine learning**: Learn from manual corrections to improve matching

## Troubleshooting

### Issue: Guide not being matched
**Solution:** Check the error_logs table for unmatched guides. Verify:
- Customer phone numbers are in the database
- Customer names match reasonably well
- Addresses contain city names

### Issue: OCR not extracting text properly
**Solution:** 
- Ensure image quality is good (min 300 DPI recommended)
- Try converting to grayscale PDF before uploading
- Check if text is selectable in PDF (not scanned image)

### Issue: WhatsApp message not sent
**Solution:**
- Verify WhatsApp provider is initialized (`global.adapterProvider`)
- Check phone number format (must include country code)
- Ensure WhatsApp connection is active

## Dependencies

New dependencies added:
- `pdfjs-dist@^4.0.379` - PDF text extraction
- `tesseract.js@^6.0.1` - OCR for images (already installed)
- `sharp@^0.34.4` - Image processing (already installed)
- `multer@^2.0.2` - File upload handling (already installed)

## Support

For issues or questions:
1. Check the error_logs table for detailed error information
2. Review application logs with category `shipping`
3. Verify database schema has tracking columns
4. Test with the health endpoint first
