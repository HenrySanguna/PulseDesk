# Tasks: Add Polish

## 1. Productividad de agente
- [ ] 1.1 Modelo `CannedResponse` (shortcut, título, cuerpo)
- [ ] 1.2 Autocompletado de atajos en el editor de mensajes

## 2. Dashboard
- [ ] 2.1 Gráficos de PrimeNG sobre `getDashboardSnapshot` y `getAgentLoad`
- [ ] 2.2 Indicador visual de tickets en riesgo de incumplir SLA (`at_risk`)

## 3. Colaboración
- [ ] 3.1 Presencia de agentes por ticket sobre el canal `ws` ya existente (reutiliza `add-realtime-hybrid`)
- [ ] 3.2 Aviso "también viendo esto" cuando dos agentes abren el mismo ticket

## 4. Observabilidad
- [ ] 4.1 Instrumentación OpenTelemetry en `apps/api` y `apps/worker` (HTTP, Prisma, BullMQ)
- [ ] 4.2 Propagación explícita del `traceId` en el payload de los trabajos de BullMQ
- [ ] 4.3 Verificar una traza completa: petición HTTP → creación de ticket → trabajo encolado → procesamiento en worker → publicación en el bus → evento SSE

## 5. Accesibilidad y estados
- [ ] 5.1 Navegación completa por teclado en la tabla de tickets y el hilo de conversación
- [ ] 5.2 Atributos ARIA en componentes interactivos de `libs/ui`
- [ ] 5.3 Contraste AA verificado en la paleta de PrimeNG usada
- [ ] 5.4 Estados vacíos, de carga y de error consistentes en `agent-console` y `widget`

## 6. Documentación
- [ ] 6.1 Guía de integración del widget para terceros (script de embebido, configuración mínima)

## Definición de terminado
- [ ] Una traza única y completa es visible de principio a fin para el flujo "crear ticket → vencimiento de SLA → notificación en dashboard"
- [ ] La consola de agentes es navegable de principio a fin sin ratón
