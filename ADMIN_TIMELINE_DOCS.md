# Admin Order Timeline & Replay Feature - Documentation

## Overview

This feature adds an event timeline viewer and flow replay functionality to the admin panel, allowing administrators to:
1. View a chronological timeline of all events related to an order
2. Filter events by type, source, and flow
3. Replay the router/flow decision in dry-run mode without sending messages

## Backend API Endpoints

### 1. Get Order Timeline Events

**Endpoint:** `GET /api/admin/orders/:orderId/events`

**Description:** Retrieves all events related to a specific order with optional filtering.

**Path Parameters:**
- `orderId` (string, required): The ID of the order

**Query Parameters:**
- `eventType` (string, optional): Filter by event type (e.g., 'order_created', 'user_message')
- `eventSource` (string, optional): Filter by event source ('bot', 'admin', 'system', 'api')
- `flowName` (string, optional): Filter by flow name
- `dateFrom` (string, optional): Start date for filtering (ISO 8601 format)
- `dateTo` (string, optional): End date for filtering (ISO 8601 format)
- `limit` (number, optional): Maximum number of events to return (default: 100, max: 1000)

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "123",
    "orderNumber": "ORD-001",
    "customerPhone": "+573001234567",
    "customerName": "Juan Pérez",
    "orderStatus": "confirmed",
    "timeline": [
      {
        "id": 1,
        "timestamp": "2026-01-23T10:30:00.000Z",
        "eventType": "order_created",
        "eventSource": "bot",
        "description": "Order created via WhatsApp bot",
        "data": {
          "capacity": "32GB",
          "contentType": "music"
        },
        "flowName": "usbFlow",
        "flowStage": "payment",
        "userInput": "Quiero un USB de 32GB",
        "botResponse": "Perfecto! Un USB de 32GB cuesta $25,000"
      }
    ],
    "summary": [
      {
        "event_type": "order_created",
        "count": 1
      },
      {
        "event_type": "user_message",
        "count": 15
      }
    ],
    "filter": {
      "eventType": null,
      "eventSource": null,
      "flowName": null,
      "dateFrom": null,
      "dateTo": null
    },
    "count": 16
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Order not found"
}
```

### 2. Replay Order Flow (Dry-Run)

**Endpoint:** `POST /api/admin/orders/:orderId/replay`

**Description:** Simulates the router/flow decision for an order without sending real messages or modifying system state.

**Path Parameters:**
- `orderId` (string, required): The ID of the order

**Request Body:**
```json
{
  "userInput": "Optional custom input to replay",
  "context": {
    "customField": "Optional additional context"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "123",
    "orderNumber": "ORD-001",
    "dryRun": true,
    "timestamp": "2026-01-23T14:30:00.000Z",
    "routerDecision": {
      "intent": "usb_inquiry",
      "confidence": 95,
      "source": "rule",
      "targetFlow": "usbFlow",
      "reason": "Strong keyword match: usb_inquiry"
    },
    "simulatedResponse": {
      "message": "¡Hola! Veo que te interesa nuestro servicio de USBs personalizadas...",
      "nextFlow": "usbFlow",
      "contextUsed": {
        "phone": "+573001234567",
        "customerName": "Juan Pérez",
        "orderNumber": "ORD-001",
        "currentStatus": "confirmed"
      }
    },
    "originalEvents": [
      // Array of historical events
    ],
    "warning": "SIMULACIÓN - No se enviaron mensajes reales ni se modificó el estado del sistema"
  }
}
```

## Frontend UI Components

### Timeline Modal

The timeline modal displays all events for an order in chronological order with the following features:

**Features:**
- Event filtering by type, source, and flow
- Real-time event summary statistics
- Color-coded event sources (bot, admin, system, api)
- Expandable event details including user input and bot responses
- Event data visualization in JSON format

**Access:**
1. Navigate to the admin panel
2. Open an order from the Orders tab
3. Click the "📅 Ver Timeline" button in the order details modal

**Filters:**
- **Event Type:** Filter by specific event types (order_created, user_message, etc.)
- **Event Source:** Filter by event source (bot, admin, system, api)
- **Flow Name:** Search/filter by flow name

### Replay Modal

The replay modal executes a dry-run simulation of the router/flow decision:

**Features:**
- Displays router decision (intent, confidence, source)
- Shows simulated bot response
- Highlights the reasoning behind the decision
- Displays confidence level with color coding:
  - Green (high): ≥80%
  - Yellow (medium): 60-79%
  - Red (low): <60%

**Access:**
1. Open the timeline modal for an order
2. Click the "▶️ Replay (Dry-Run)" button
3. Review the simulated router decision and response

## Technical Implementation

### Data Source

Events are stored in the `order_events` table with the following schema:
- `id`: Event ID
- `order_number`: Associated order number
- `phone`: Customer phone number
- `event_type`: Type of event
- `event_source`: Source of the event (bot/admin/system/api)
- `event_description`: Human-readable description
- `event_data`: JSON data associated with the event
- `flow_name`: Flow that was active during the event
- `flow_stage`: Stage within the flow
- `user_input`: User's input (if applicable)
- `bot_response`: Bot's response (if applicable)
- `created_at`: Event timestamp

### Router Simulation

The replay feature uses the `hybridIntentRouter` to simulate routing decisions:
1. Retrieves historical events for context
2. Calls the router with the input and context
3. Uses AI service to generate a simulated response
4. Returns the results without any side effects

**Important:** The replay is a read-only operation that does not:
- Send any WhatsApp messages
- Modify order state
- Trigger any workflows
- Create new events

## Security Considerations

- Timeline and replay endpoints require admin access
- Order events may contain sensitive customer information
- Replay simulation uses the same AI service but in read-only mode
- All operations are logged for audit purposes

## Example Use Cases

### 1. Debugging Order Issues
View the complete event timeline to understand what happened during order processing.

### 2. Customer Support
Review the conversation history and bot responses to answer customer inquiries.

### 3. Testing Router Logic
Replay orders to verify that the router would make correct decisions with the current configuration.

### 4. Training and QA
Analyze how the bot handles different scenarios without affecting production data.

## Known Limitations

1. Timeline displays up to 1000 events per query (can be paginated if needed)
2. Replay uses current router/AI configuration, not historical configuration
3. Some events may not have complete data if they were created before this feature
4. The AI-generated simulated response may differ from the original response

## Future Enhancements

- [ ] Add pagination for large event timelines
- [ ] Export timeline to PDF/CSV for reporting
- [ ] Replay with custom context and inputs
- [ ] Compare multiple replays side-by-side
- [ ] Batch replay for multiple orders
- [ ] Historical router configuration snapshots
