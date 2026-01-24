# RAG (Retrieval-Augmented Generation) Implementation - PR-G2

## Objetivo

Implementar un sistema RAG ligero que recupere contexto estructurado ANTES de llamar a la IA, asegurando que las respuestas se basen en datos reales del catálogo y reglas de negocio, evitando alucinaciones.

## Arquitectura

### Componentes Implementados

1. **RAGContextRetriever** (`src/services/ragContextRetriever.ts`)
   - Servicio principal que recupera contexto estructurado
   - Implementa caché con TTL de 60 segundos
   - Singleton para eficiencia de memoria

2. **Integración con enhancedAIService** (`src/services/enhancedAIService.ts`)
   - Llama a RAG ANTES de construir el prompt
   - Inyecta contexto estructurado en el prompt
   - Instruye explícitamente a la IA a NO inventar datos

3. **Integración con aiService** (`src/services/aiService.ts`)
   - Mismo patrón que enhancedAIService
   - Mantiene coherencia en todo el sistema

## Contexto Recuperado

El sistema RAG recupera 4 tipos de contexto:

### 1. Catálogo (`CatalogContext`)
```typescript
{
  categories: [...],
  products: [...],
  priceRanges: {
    music: { min: 59900, max: 59900 },
    videos: { min: 69900, max: 69900 },
    movies: { min: 79900, max: 79900 }
  }
}
```

### 2. Órdenes (`OrderContext`)
```typescript
{
  hasActiveOrder: boolean,
  currentOrder?: {
    orderId: string,
    status: OrderStatus,
    category: string,
    capacity: string,
    preferences: any,
    shippingInfo: any
  },
  orderHistory: [...]
}
```

### 3. Customer Journey (`CustomerJourneyContext`)
```typescript
{
  stage: 'awareness' | 'interest' | 'consideration' | 'decision' | 'purchase',
  indicators: {
    hasDiscussedPrice: boolean,
    hasSpecifiedPreferences: boolean,
    hasProvidedShipping: boolean,
    interactionCount: number,
    daysSinceFirstContact: number
  }
}
```

### 4. Reglas de Negocio (`BusinessRulesContext`)
```typescript
{
  shipping: {
    isFree: true,
    estimatedDays: '2-3 días hábiles',
    restrictions: [...]
  },
  warranties: {
    durationMonths: 6,
    coverage: [...]
  },
  customization: {
    available: true,
    options: [...],
    additionalCost: 0
  },
  promotions: {
    active: boolean,
    description?: string,
    discountPercent?: number
  }
}
```

## Flujo de Ejecución

### Antes (Sin RAG)
```
Usuario → Mensaje → AI Service → buildPrompt (hardcoded prices) → AI → Respuesta
```

### Después (Con RAG)
```
Usuario → Mensaje → AI Service → RAG Context Retriever → Structured Context
                                          ↓
                        buildPrompt (with RAG context) → AI → Respuesta
```

## Instrucciones Críticas en el Prompt

El sistema inyecta las siguientes instrucciones en TODOS los prompts:

```
⚠️ INSTRUCCIÓN CRÍTICA: USA ÚNICAMENTE los precios, estados de orden y reglas 
listados arriba. NO inventes ni asumas información que no esté en este contexto.

**CRÍTICO: NO inventes precios, capacidades o información que no esté en el 
CONTEXTO ESTRUCTURADO**

**NUNCA inventes información: usa solo los datos estructurados proporcionados**
```

## Optimizaciones

### 1. Caché
- Contexto se cachea por 60 segundos por usuario
- Reduce llamadas a BD en conversaciones activas
- Auto-limpieza cuando cache > 500 usuarios

### 2. Recuperación Paralela
```typescript
const [catalog, order, journey, rules] = await Promise.all([
  retrieveCatalogContext(),
  retrieveOrderContext(phone),
  retrieveCustomerJourneyContext(session),
  retrieveBusinessRulesContext()
]);
```

### 3. Fallback Seguro
Si la recuperación de contexto falla, retorna un contexto mínimo con precios conocidos:
```typescript
{
  music: { min: 59900, max: 59900 },
  videos: { min: 69900, max: 69900 },
  movies: { min: 79900, max: 79900 }
}
```

## Ejemplos de Uso

### Ejemplo 1: Usuario Pregunta Precio
```
Usuario: "Cuánto cuesta?"

RAG recupera:
- Catálogo: Precios reales desde BD
- Orden: No tiene orden activa
- Journey: Stage = "interest"
- Reglas: Envío gratis, garantía 6 meses

Prompt incluye:
📦 CATÁLOGO DISPONIBLE:
Precios reales del catálogo:
- 🎵 Música: desde $59,900
- 🎬 Videos: desde $69,900
- 🎥 Películas: desde $79,900

⚠️ USA ÚNICAMENTE los precios listados arriba. NO inventes precios.

AI responde con precios correctos del contexto ✅
```

### Ejemplo 2: Usuario con Orden Activa
```
Usuario: "Qué pasa con mi pedido?"

RAG recupera:
- Catálogo: (normal)
- Orden: ACTIVA - Status = "PROCESSING", Category = "music"
- Journey: Stage = "purchase"
- Reglas: (normal)

Prompt incluye:
📋 ORDEN ACTUAL DEL CLIENTE:
- ID de orden: ORD123
- Estado: PROCESSING
- Categoría: music

AI responde con info específica de la orden ✅
```

## Beneficios

### ✅ Evita Alucinaciones
- IA solo puede usar datos del contexto estructurado
- Imposible inventar precios o capacidades no existentes
- Respuestas siempre basadas en datos reales

### ✅ Coherencia
- Mismo contexto en aiService y enhancedAIService
- Respuestas consistentes en todo el sistema

### ✅ Flexibilidad
- Fácil agregar nuevos tipos de contexto
- Reglas de negocio centralizadas
- Precios dinámicos desde BD

### ✅ Performance
- Caché reduce llamadas a BD
- Recuperación paralela minimiza latencia
- Auto-limpieza evita memory leaks

## Testing

Se creó `test-rag-context.ts` con pruebas que verifican:
1. ✅ Recuperación de contexto estructurado
2. ✅ Formato correcto del prompt
3. ✅ Presencia de instrucciones críticas
4. ✅ Funcionamiento del caché
5. ✅ Escenarios reales (nuevo usuario, usuario con preferencias)

## Logging

El sistema usa la categoría `'rag'` para logging:
```typescript
unifiedLogger.info('rag', 'Retrieving fresh RAG context', { phone });
unifiedLogger.debug('rag', 'Using cached RAG context', { phone });
unifiedLogger.error('rag', 'Error retrieving RAG context', { error });
```

## Próximos Pasos (Futuro)

1. **Métricas**: Medir % de respuestas con RAG vs fallback
2. **Vectores**: Agregar búsqueda semántica para FAQs
3. **Personalización**: Incluir historial de compras en contexto
4. **A/B Testing**: Comparar respuestas con/sin RAG
5. **Cache Inteligente**: TTL dinámico basado en actividad

## Conclusión

El sistema RAG ligero asegura que:
- ✅ La IA solo usa datos reales del catálogo y reglas
- ✅ No se inventan precios, capacidades o estados de orden
- ✅ Las respuestas son coherentes con el estado actual del negocio
- ✅ El rendimiento se mantiene óptimo con caché

**Resultado**: Respuestas precisas, basadas en datos, sin alucinaciones.
