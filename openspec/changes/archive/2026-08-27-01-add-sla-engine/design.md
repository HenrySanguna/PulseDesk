# Design: SLA Engine

## API pública

```typescript
interface BusinessCalendar {
  timezone: string;                 // IANA, ej. "Europe/Madrid"
  windows: Array<{ day: 0|1|2|3|4|5|6; from: string; to: string }>;  // "09:00"–"18:00"
  holidays: string[];               // ["2026-12-25", ...]
}

function addBusinessMinutes(from: Date, minutes: number, calendar: BusinessCalendar): Date;
function businessMinutesBetween(a: Date, b: Date, calendar: BusinessCalendar): number;
```

## Decisión: saltos de ventana, no iteración minuto a minuto

Iterar minuto a minuto es simple de escribir pero O(n) en el tamaño del SLA — un SLA de una semana laboral son ~2.500 iteraciones por cálculo, ejecutado en cada pausa/reanudación. El enfoque de saltos de ventana calcula directamente cuánto cabe en la ventana actual, salta al inicio de la siguiente ventana laboral si sobra, y repite — O(número de ventanas cruzadas), típicamente 1-3 saltos incluso para SLAs largos.

## Decisión: el calendario es un dato, no una configuración global

Pasar el calendario como parámetro explícito (en vez de leerlo de una configuración global o inyectarlo por DI) es lo que mantiene la función pura y testeable sin ningún framework. Cuando `add-sla-jobs` (Fase 4) conecte esto con Prisma, el calendario se lee una vez por evaluación y se pasa como valor — la librería nunca sabe que Prisma existe.

## Riesgos identificados
- **Cambios de horario de verano**: un salto de ventana que cruza el cambio de hora puede calcular un "día laboral" de 23 o 25 horas reales. Se resuelve operando siempre en minutos de pared dentro del `timezone` del calendario (vía una librería de zonas horarias, no con aritmética de milisegundos UTC).
- **SLA de 0 minutos**: caso borde legítimo (prioridad urgente con respuesta inmediata exigida). `addBusinessMinutes(from, 0, calendar)` debe devolver `from` sin buscar la siguiente ventana si `from` ya está dentro de horario laboral.
