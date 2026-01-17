# Mejoras Futuras Sugeridas

Este documento lista mejoras recomendadas para futuras iteraciones del chatbot.

## Prioridad Alta

### 1. Externalizar Configuración de Precios
**Archivo:** `src/services/aiService.ts`

**Problema Actual:**
Los precios están hardcodeados en el código:
```typescript
private readonly EMERGENCY_PRICING = {
    music: { '32GB': '$89,900', '64GB': '$119,900' }
}
```

**Mejora Sugerida:**
- Crear archivo de configuración `config/pricing.json`
- Cargar precios desde base de datos
- API para actualizar precios sin deploy

**Beneficio:** Cambios de precio sin necesidad de modificar código.

---

### 2. Servicio de Logging Dedicado
**Archivos:** `src/services/persuasionEngine.ts`, `src/services/followUpService.ts`

**Problema Actual:**
Se usa `global.persuasionLogs` y `global.userSessions` para almacenamiento temporal.

**Mejora Sugerida:**
- Crear `LoggingService` con persistencia a DB
- Implementar sistema de métricas (Prometheus/Grafana)
- Dashboard para visualizar efectividad de mensajes

**Beneficio:** 
- Datos no se pierden al reiniciar
- Análisis histórico completo
- Mejor observabilidad

---

### 3. Internacionalización (i18n)
**Archivo:** `src/services/flowCoordinator.ts`

**Problema Actual:**
Palabras clave de continuidad están hardcodeadas en español:
```typescript
private static readonly CONTINUITY_KEYWORDS = [
    'eso', 'esa', 'ese', 'lo', 'la', 'si', ...
]
```

**Mejora Sugerida:**
- Implementar sistema i18n (react-i18next o similar)
- Soporte para múltiples idiomas
- Detección automática de idioma del usuario

**Beneficio:** Expansión a mercados internacionales.

---

## Prioridad Media

### 4. Dependency Injection
**Archivos:** `src/services/followUpService.ts`, `src/services/aiService.ts`

**Problema Actual:**
Acceso directo a `global.botInstance` y servicios:
```typescript
if (!global.botInstance || typeof global.botInstance.sendMessage !== 'function')
```

**Mejora Sugerida:**
- Implementar contenedor de DI (InversifyJS o TSyringe)
- Inyectar dependencias en constructores
- Facilitar testing con mocks

**Beneficio:** 
- Mejor testabilidad
- Desacoplamiento de componentes
- Código más mantenible

---

### 5. Type Safety Mejorado
**Archivo:** `test-chatbot-reliability.ts`

**Problema Actual:**
Uso excesivo de `as any` en tests:
```typescript
const result = await (persuasionEngine as any).analyzeContext(session);
```

**Mejora Sugerida:**
- Crear interfaces públicas para métodos privados usados en tests
- Usar `@internal` JSDoc para métodos internos expuestos
- Implementar proper mocking

**Beneficio:** Mayor seguridad de tipos en tests.

---

### 6. Servicio de Configuración Centralizado
**Archivos:** Múltiples servicios

**Problema Actual:**
Configuraciones dispersas en diferentes archivos.

**Mejora Sugerida:**
```typescript
// config/ConfigService.ts
export class ConfigService {
    getPricing() { ... }
    getFollowUpTimings() { ... }
    getContinuityKeywords() { ... }
}
```

**Beneficio:** Configuración centralizada y fácil de mantener.

---

## Prioridad Baja

### 7. Cache Distribuido
**Archivo:** `src/services/followUpService.ts`

**Mejora Sugerida:**
- Implementar Redis para caché de sesiones
- Compartir estado entre múltiples instancias del bot
- Mejorar escalabilidad horizontal

---

### 8. Queue System para Mensajes
**Archivo:** `src/services/flowCoordinator.ts`

**Mejora Sugerida:**
- Implementar cola de mensajes (RabbitMQ/AWS SQS)
- Retry automático con backoff exponencial
- Dead letter queue para mensajes fallidos

---

### 9. A/B Testing Framework
**Nuevo servicio**

**Mejora Sugerida:**
- Framework para testear diferentes mensajes persuasivos
- Métricas de efectividad por variante
- Selección automática de mejor variante

---

### 10. Machine Learning para Priorización
**Archivo:** `src/services/followUpService.ts`

**Mejora Sugerida:**
- Modelo ML para predecir probabilidad de conversión
- Priorización dinámica basada en predicciones
- Continuous learning con feedback de conversiones

---

## Implementación Recomendada

### Fase 1 (1-2 semanas)
1. Externalizar configuración de precios
2. Implementar logging service básico
3. Mejorar type safety en tests

### Fase 2 (2-4 semanas)
4. Implementar dependency injection
5. Servicio de configuración centralizado
6. Soporte básico i18n

### Fase 3 (1-2 meses)
7. Cache distribuido con Redis
8. Queue system para mensajes
9. Dashboard de métricas

### Fase 4 (Futuro)
10. A/B testing framework
11. ML para priorización

---

## Notas

- **Estas mejoras son opcionales** - El sistema actual es completamente funcional
- Priorizar basándose en necesidades del negocio
- Implementar incrementalmente para minimizar riesgo
- Mantener backward compatibility

---

**Última actualización:** 2026-01-17
