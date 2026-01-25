# PR-G3: AI Conversation Analysis System

## Objetivo

Sistema de análisis asíncrono de conversaciones que usa IA para extraer insights valiosos sin bloquear el funcionamiento del chat.

## Características Implementadas

### 1. Análisis Automático de Conversaciones

El sistema analiza automáticamente las conversaciones y extrae:

- **Intención (Intent)**: Clasifica la intención del cliente
  - `purchase` - Cliente quiere comprar
  - `inquiry` - Consultas sobre productos
  - `complaint` - Quejas o reclamos
  - `browsing` - Navegando/explorando opciones
  - `support` - Solicitudes de soporte

- **Objeciones (Objections)**: Identifica objeciones del cliente
  - `price_concern` - Preocupación por el precio
  - `feature_question` - Preguntas sobre características
  - `trust_issue` - Problemas de confianza
  - `timing_concern` - Preocupaciones de tiempo
  - `technical_question` - Preguntas técnicas

- **Probabilidad de Compra (Purchase Probability)**: Calcula del 0-100%
  - Basado en el interés mostrado
  - Nivel de compromiso en la conversación
  - Preguntas sobre el proceso de pedido

- **Resumen (Summary)**: Genera un resumen de 2-3 oraciones de la conversación

- **Insights Adicionales**:
  - Sentimiento del cliente (positive/neutral/negative)
  - Score de engagement (0-100%)
  - Preferencias extraídas (géneros, artistas, películas, capacidad USB)

### 2. Procesamiento Asíncrono

- **Worker Independiente**: `ConversationAnalysisWorker` procesa análisis en segundo plano
- **No Bloquea el Chat**: El análisis se ejecuta sin afectar la experiencia del usuario
- **Lease-Based**: Usa el mismo patrón que otros workers para recuperación automática
- **Polling Configurable**: Por defecto revisa cada 5 minutos

### 3. Programación Automática

- **Cron Job**: Se ejecuta cada 6 horas para analizar conversaciones activas
- **Detección Inteligente**: Solo analiza conversaciones con actividad reciente (últimas 24 horas)
- **Prevención de Duplicados**: No re-analiza conversaciones con análisis reciente

### 4. Dashboard y API

Nuevos endpoints en `/api/admin/analytics/conversation-analysis`:

#### GET `/api/admin/analytics/conversation-analysis`
Obtiene resumen de análisis con filtros opcionales:
```typescript
Query Parameters:
- startDate: string (ISO date)
- endDate: string (ISO date)

Response:
{
  success: true,
  data: {
    total: number,
    byIntent: { purchase: 45, inquiry: 30, ... },
    byStatus: { completed: 70, pending: 5, ... },
    avgPurchaseProbability: number,
    avgEngagementScore: number
  }
}
```

#### GET `/api/admin/analytics/conversation-analysis/recent`
Obtiene análisis recientes:
```typescript
Query Parameters:
- status: 'pending' | 'processing' | 'completed' | 'failed'
- intent: string
- limit: number (default: 50)
- offset: number (default: 0)

Response:
{
  success: true,
  data: [...analyses],
  count: number
}
```

#### GET `/api/admin/analytics/conversation-analysis/:phone`
Obtiene el análisis más reciente para un teléfono específico:
```typescript
Response:
{
  success: true,
  data: {
    id: number,
    phone: string,
    summary: string,
    intent: string,
    objections: string[],
    purchase_probability: number,
    sentiment: string,
    engagement_score: number,
    extracted_preferences: {...},
    analyzed_at: Date
  }
}
```

#### POST `/api/admin/analytics/conversation-analysis/queue`
Encola manualmente una conversación para análisis:
```typescript
Body:
{
  phone: string
}

Response:
{
  success: true,
  message: "Analysis queued successfully",
  data: { analysisId: number, phone: string }
}
```

#### GET `/api/admin/analytics/conversation-analysis/worker-status`
Obtiene estado del worker:
```typescript
Response:
{
  success: true,
  data: {
    isRunning: boolean,
    processingCount: number,
    pollIntervalMs: number,
    batchSize: number,
    enabled: boolean
  }
}
```

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Chat WhatsApp                         │
│                  (No bloqueado, sigue normal)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      message_logs Table                      │
│              (Conversaciones almacenadas)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Cron Job       │
                    │   (cada 6 horas) │
                    └──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           ConversationAnalysisWorker (async)                 │
│  - Poll cada 5 minutos                                       │
│  - Procesa batch de 10 conversaciones                        │
│  - Lease-based recovery                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          ConversationAnalysisService                         │
│  - Obtiene historial de conversación                         │
│  - Llama a AI Gateway (Gemini)                               │
│  - Parsea respuesta JSON                                     │
│  - Extrae: intent, objections, probability                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│        conversation_analysis Table                           │
│  - Almacena resultados del análisis                          │
│  - Indexed para queries rápidas                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Admin Dashboard / API                           │
│  - Visualiza insights                                        │
│  - Filtra por intent, fecha, etc.                            │
│  - Cola análisis manuales                                    │
└─────────────────────────────────────────────────────────────┘
```

## Base de Datos

### Tabla: `conversation_analysis`

```sql
CREATE TABLE conversation_analysis (
  id INT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(50) NOT NULL,
  
  -- Resultados del análisis
  summary TEXT,
  intent VARCHAR(100),
  objections JSON,
  purchase_probability DECIMAL(5,2),
  
  -- Insights adicionales
  extracted_preferences JSON,
  sentiment VARCHAR(50),
  engagement_score DECIMAL(5,2),
  
  -- Metadata de IA
  ai_model VARCHAR(100),
  tokens_used INT,
  analysis_duration_ms INT,
  
  -- Estado de procesamiento
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  
  -- Estadísticas de conversación
  message_count INT DEFAULT 0,
  conversation_start TIMESTAMP,
  conversation_end TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  analyzed_at TIMESTAMP,
  
  -- Indices
  INDEX idx_phone (phone),
  INDEX idx_status_created (status, created_at),
  INDEX idx_intent_probability (intent, purchase_probability),
  INDEX idx_analyzed (analyzed_at)
);
```

## Configuración

### Variables de Entorno

El sistema usa las mismas variables que el resto de la aplicación:

```env
# AI Gateway (ya configurado)
GEMINI_API_KEY=your-key-here

# Database (ya configurado)
MYSQL_DB_HOST=localhost
MYSQL_DB_USER=root
MYSQL_DB_PASSWORD=password
MYSQL_DB_NAME=techaura_db
```

### Configuración del Worker

En `ConversationAnalysisWorker.ts`:

```typescript
export const conversationAnalysisWorker = new ConversationAnalysisWorker({
    pollIntervalMs: 5 * 60 * 1000,  // 5 minutos
    batchSize: 10,                   // 10 conversaciones por batch
    enabled: true                     // Activado por defecto
});
```

### Configuración del Cron

En `app.ts`:

```typescript
// Se ejecuta cada 6 horas
cron.schedule('0 */6 * * *', async () => {
    // Encola análisis para usuarios activos (últimas 24 horas)
}, {
    scheduled: true,
    timezone: "America/Bogota"
});
```

## Uso

### Inicio Automático

El worker se inicia automáticamente al arrancar la aplicación:

```bash
npm start
# o
npm run dev
```

Verás en los logs:
```
🚀 Starting Conversation Analysis Worker...
   Poll interval: 300000ms
   Batch size: 10
✅ Conversation Analysis Worker started successfully
```

### Análisis Manual

Encolar una conversación específica:

```bash
curl -X POST http://localhost:3000/api/admin/analytics/conversation-analysis/queue \
  -H "Content-Type: application/json" \
  -d '{"phone": "573001234567"}'
```

### Consultar Resultados

Ver análisis de un cliente:

```bash
curl http://localhost:3000/api/admin/analytics/conversation-analysis/573001234567
```

Ver resumen de análisis:

```bash
curl http://localhost:3000/api/admin/analytics/conversation-analysis
```

Ver estado del worker:

```bash
curl http://localhost:3000/api/admin/analytics/conversation-analysis/worker-status
```

## Testing

Se incluye un script de prueba completo:

```bash
npm run build
tsx test-conversation-analysis.ts
```

El test:
1. ✅ Crea conversaciones de prueba
2. ✅ Prueba el servicio de análisis
3. ✅ Prueba el repositorio
4. ✅ Prueba el worker
5. ✅ Limpia datos de prueba

## Integración con Sistema Existente

### Compatibilidad

- ✅ **No modifica flujos existentes**: El análisis es completamente asíncrono
- ✅ **Usa AI Gateway existente**: Aprovecha Gemini configurado
- ✅ **Patrón de worker familiar**: Sigue el patrón de ProcessingWorker
- ✅ **Knex migrations**: Usa el sistema de migraciones existente
- ✅ **ShutdownManager**: Se registra para apagado graceful

### Servicios Reutilizados

- `aiGateway`: Para llamadas a IA
- `conversationMemory`: Para obtener historial
- `db` (Knex): Para operaciones de base de datos
- `shutdownManager`: Para cierre ordenado

## Monitoreo

### Logs del Worker

```
📊 Processing 5 pending conversation analyses
🔍 Analyzing conversation for phone: 573001234567
✅ Analysis completed for phone: 573001234567
   Intent: purchase, Purchase Probability: 85%
```

### Logs de Errores

```
❌ Error analyzing conversation for phone 573001234567: [error details]
```

### Métricas en Dashboard

El dashboard puede mostrar:
- Total de conversaciones analizadas
- Distribución de intenciones
- Probabilidad promedio de compra
- Score promedio de engagement
- Conversiones por intent

## Casos de Uso

### 1. Identificar Clientes de Alto Valor

```typescript
// Buscar conversaciones con alta probabilidad de compra
const highValueLeads = await conversationAnalysisRepository.getRecentAnalyses({
    status: 'completed'
});

const promising = highValueLeads.filter(a => a.purchase_probability >= 70);
```

### 2. Detectar Objeciones Comunes

```typescript
const summary = await conversationAnalysisRepository.getAnalyticsSummary();
// Analizar summary.byIntent para ver qué objeciones son más comunes
```

### 3. Priorizar Follow-ups

El sistema de follow-ups puede usar `purchase_probability` para priorizar:
- Alta probabilidad (>70%) → Follow-up urgente
- Media probabilidad (40-70%) → Follow-up normal
- Baja probabilidad (<40%) → Follow-up ocasional

### 4. Training del Equipo

Identificar patrones en conversaciones exitosas vs fallidas para mejorar scripts de venta.

## Mejoras Futuras

1. **Dashboard Visual**: Gráficos de distribución de intents
2. **Alertas**: Notificar cuando cliente de alto valor necesita atención
3. **A/B Testing**: Comparar efectividad de diferentes enfoques de venta
4. **Predicción de Churn**: Detectar clientes en riesgo de abandono
5. **Recomendaciones**: Sugerir acciones basadas en el análisis

## Troubleshooting

### El worker no procesa análisis

1. Verificar que el worker está corriendo:
   ```bash
   curl http://localhost:3000/api/admin/analytics/conversation-analysis/worker-status
   ```

2. Verificar logs del servidor para errores

3. Revisar que hay análisis pendientes:
   ```sql
   SELECT COUNT(*) FROM conversation_analysis WHERE status = 'pending';
   ```

### Análisis fallan con error

1. Verificar que `GEMINI_API_KEY` está configurada
2. Verificar que la tabla `message_logs` tiene datos
3. Revisar logs para detalles del error

### Análisis muy lentos

1. Reducir `batchSize` si hay problemas de memoria
2. Aumentar `pollIntervalMs` si AI Gateway está saturado
3. Verificar rate limits de Gemini API

## Documentos Relacionados

- `ANALYTICS_SYSTEM_DOCS.md` - Sistema de analytics general
- `AI_GATEWAY_README.md` - Documentación del AI Gateway
- `LEASE_BASED_WORKERS_GUIDE.md` - Patrón de workers

## Autor

Implementado para PR-G3 - Sistema de análisis offline/async de conversaciones

## Licencia

ISC - TechAura Team
