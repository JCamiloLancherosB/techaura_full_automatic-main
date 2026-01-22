# Implementación de Máquina de Estados Conversacional y FlowGuard

## 📋 Resumen Ejecutivo

Este PR implementa una máquina de estados conversacional por orden/sesión y mejora el FlowGuard para prevenir inconsistencias y spam cuando hay una orden activa.

**Estado:** ✅ COMPLETADO
**Branch:** `copilot/implement-state-machine-flowguard`
**Fecha:** 2026-01-22

## 🎯 Objetivos Cumplidos

### ✅ Requisito 1: Máquina de Estados Conversacional
- Estados implementados:
  - `NEEDS_INTENT` - Estado inicial
  - `NEEDS_CAPACITY` - Requiere selección de capacidad
  - `NEEDS_PREFERENCES` - Requiere preferencias de contenido
  - `NEEDS_SHIPPING` - Requiere datos de envío
  - `CONFIRMED` - Orden confirmada
  - `PROCESSING` - En procesamiento
  - `READY` - Lista para envío
  - `SHIPPED` - Enviada
  - `DELIVERED` - Entregada
  - `COMPLETED` - Completada
  - `CANCELLED` - Cancelada

### ✅ Requisito 2: FlowGuard (Guardrails)
- Bloquea promos "última llamada" cuando `status >= CONFIRMED`
- Bloquea follow-ups cuando `cooldown_until` está activo
- Previene mensajes de capacidad cuando ya hay orden confirmada
- Aplicado en todos los puntos de disparo

### ✅ Requisito 3: Registro de Transiciones
- Tabla `flow_transitions` creada
- Todas las transiciones se registran con:
  - Estado previo y nuevo
  - Timestamp
  - Referencia a orden/sesión
  - Metadata contextual

## 📁 Archivos Modificados

### Nuevos Archivos
1. **`migrations/20260122000003_create_flow_transitions.js`**
   - Migración para tabla de transiciones
   - Índices optimizados para consultas frecuentes

### Archivos Modificados
1. **`src/services/OrderStateManager.ts`**
   - Estados conversacionales agregados
   - Persistencia a base de datos
   - Métodos helper: `isConfirmedOrBeyond()`, `isAtOrBeyondState()`
   - Transiciones validadas y registradas

2. **`src/services/flowGuard.ts`**
   - `hasConfirmedOrActiveOrder()` - Verifica orden activa
   - `isInCooldown()` - Valida cooldown_until
   - `shouldBlockPromo()` - Bloquea promos según estado
   - `shouldBlockFollowUp()` - Bloquea follow-ups
   - Soporte para estados en mayúsculas y minúsculas (compatibilidad)

3. **`src/services/followUpService.ts`**
   - Integración con FlowGuard como autoridad principal
   - Bloqueo consistente de follow-ups
   - Eliminación de duplicación de lógica

4. **`src/flows/middlewareFlowGuard.ts`**
   - Mapeo `STAGE_TO_ORDER_STATE`
   - Sincronización automática de estados
   - Protección contra reinicio de journey
   - Persistencia de transiciones

5. **`src/flows/capacityVideo.ts`**
   - Guard al inicio del flujo
   - Bloquea promos de capacidad si orden confirmada

6. **`src/flows/capacityMusic.ts`**
   - Guard al inicio del flujo
   - Bloquea promos de capacidad si orden confirmada

## 🔄 Flujo de Estados

```
NEEDS_INTENT
    ↓
NEEDS_CAPACITY / NEEDS_PREFERENCES
    ↓
NEEDS_SHIPPING
    ↓
CONFIRMED ← [BLOQUEO DE PROMOS INICIA AQUÍ]
    ↓
PROCESSING
    ↓
READY
    ↓
SHIPPED
    ↓
DELIVERED
    ↓
COMPLETED
```

## 🛡️ Criterios de Aceptación

| Criterio | Estado | Implementación |
|----------|--------|----------------|
| No enviar campañas de capacidad si ya confirmó | ✅ | `FlowGuard.shouldBlockPromo()` en capacityVideo/Music |
| Si está en NEEDS_SHIPPING, solo pedir lo faltante | ✅ | `preHandler()` previene reinicio de journey |
| No enviar promos "última llamada" cuando status >= CONFIRMED | ✅ | `FlowGuard.shouldBlockPromo('last_call')` |
| Bloquear follow-ups cuando cooldown_until activo | ✅ | `FlowGuard.shouldBlockFollowUp()` en followUpService |
| Registrar transiciones en BD | ✅ | `OrderStateManager.persistTransition()` |

## 🔧 Detalles Técnicos

### Base de Datos

**Tabla: flow_transitions**
```sql
CREATE TABLE flow_transitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(255),
  phone VARCHAR(50) NOT NULL,
  session_id VARCHAR(255),
  previous_state VARCHAR(100),
  new_state VARCHAR(100) NOT NULL,
  flow_name VARCHAR(100),
  reason TEXT,
  metadata JSON,
  triggered_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone_created (phone, created_at),
  INDEX idx_order_created (order_number, created_at),
  INDEX idx_state_created (new_state, created_at)
);
```

### Mapeo de Etapas a Estados

```typescript
const STAGE_TO_ORDER_STATE = {
  'entry': 'NEEDS_INTENT',
  'personalization': 'NEEDS_PREFERENCES',
  'prices_shown': 'NEEDS_PREFERENCES',
  'awaiting_capacity': 'NEEDS_CAPACITY',
  'awaiting_payment': 'NEEDS_SHIPPING',
  'checkout_started': 'CONFIRMED',
  'converted': 'CONFIRMED',
  'completed': 'COMPLETED'
};
```

### Diseño Fail-Safe

Todas las verificaciones de FlowGuard están diseñadas con fail-safe:
- Si hay error en verificación → Permite continuar
- Si hay error en persistencia → Continúa con transición
- Previene bloquear usuarios por errores técnicos

## 📊 Testing

### Validaciones Realizadas

1. ✅ **Build exitoso**: Sin errores de compilación
2. ✅ **Type safety**: Verificaciones TypeScript pasan
3. ✅ **Code review**: Todos los comentarios críticos atendidos
4. ✅ **Compatibilidad**: Soporte para estados legacy (minúsculas)

### Para Ejecutar Migración

```bash
npm run migrate
```

## 🔍 Logging y Debugging

Todos los eventos importantes se registran:

```typescript
// FlowGuard
🔒 FlowGuard: User {phone} has confirmed/active order {orderId}
⏱️ FlowGuard: User {phone} in cooldown until {date}
🚫 FlowGuard: Blocking {type} promo for {phone} - {reason}

// OrderStateManager  
✅ Persisted transition: {orderId} {from} -> {to}
✅ Order state synced: {orderId} -> {state}

// MiddlewareFlowGuard
🔒 PreHandler: Preventing journey restart for {phone} in stage {stage}
```

## 🎯 Casos de Uso

### Caso 1: Usuario confirma orden y recibe promo
**Antes:** Usuario recibe promos de capacidad incluso con orden confirmada
**Después:** FlowGuard bloquea promo, muestra mensaje amigable

```typescript
// En capacityVideo/Music
const blockCheck = await flowGuard.shouldBlockPromo(phone, 'capacity');
if (blockCheck.blocked) {
  await flowDynamic(['✅ Ya tienes una orden en proceso.']);
  return endFlow();
}
```

### Caso 2: Follow-up durante cooldown
**Antes:** Follow-ups se envían ignorando cooldown en algunos flujos
**Después:** FlowGuard bloquea consistentemente

```typescript
// En followUpService
const blockCheck = await flowGuard.shouldBlockFollowUp(phone);
if (blockCheck.blocked) {
  continue; // Skip this candidate
}
```

### Caso 3: Usuario en NEEDS_SHIPPING recibe mensaje de capacidad
**Antes:** Journey se reiniciaba, preguntando capacidad nuevamente
**Después:** PreHandler protege el estado, solo pide lo faltante

```typescript
// En middlewareFlowGuard
const protectedStages = ['awaiting_payment', 'checkout_started', ...];
if (protectedStages.includes(state.stage)) {
  return { proceed: true, preserveState: true };
}
```

## 📝 Notas de Migración

1. **Ejecutar migración antes de deploy**:
   ```bash
   npm run migrate
   ```

2. **Compatibilidad**: El código soporta tanto estados nuevos (CONFIRMED) como legacy (confirmed)

3. **No requiere migración de datos**: Estados existentes se mantienen funcionales

## 🚀 Próximos Pasos

1. Monitorear logs de FlowGuard para validar bloqueos
2. Revisar métricas de follow-ups bloqueados
3. Validar que conversiones no disminuyan
4. Considerar agregar más estados según necesidades del negocio

## 👥 Contribuidores

- Implementado por: GitHub Copilot
- Revisado por: Code Review Bot
- Solicitado por: @JCamiloLancherosB

---

**Última actualización:** 2026-01-22
**Versión:** 1.0.0
