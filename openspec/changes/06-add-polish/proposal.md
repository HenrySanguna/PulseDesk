# Proposal: Add Polish

## Intent
Con el dominio, el motor de SLA y el transporte híbrido funcionando (fases 1-5), este cambio cierra el MVP con las piezas que lo hacen presentable y operable: macros de respuesta, gráficos del dashboard, colaboración visible entre agentes, accesibilidad y trazabilidad end-to-end. Ninguna de estas piezas introduce una decisión de arquitectura nueva — por eso este cambio no lleva `design.md`.

## Scope

**In scope**
- Respuestas predefinidas (`CannedResponse`) con atajos de texto.
- Gráficos del dashboard sobre las consultas de agregación ya construidas en `add-ticket-queue`.
- Presencia visible de dos agentes en el mismo ticket (aviso de "también viendo esto").
- Instrumentación OpenTelemetry con propagación de traza a través de HTTP → BullMQ → worker → evento SSE.
- Accesibilidad: navegación por teclado, ARIA, contraste en la consola de agentes.
- Estados vacíos, de carga y de error en toda la aplicación.
- Documentación del widget para integradores externos.

**Out of scope**
- Canales adicionales (email, WhatsApp) — la tabla `channels` queda preparada pero no se construye ningún canal nuevo.
- Reportes exportables o analítica histórica más allá del dashboard en vivo.

## Approach
Trabajo de superficie sobre la base ya sólida. La única pieza con algo de sustancia técnica es la propagación de traza a través de la cola de BullMQ, porque un trabajo encolado no hereda automáticamente el contexto de traza de la petición HTTP que lo originó — hay que propagarlo explícitamente en el payload del trabajo.
