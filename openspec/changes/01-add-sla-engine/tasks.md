# Tasks: Add SLA Engine

## 1. Modelo de calendario
- [ ] 1.1 Definir `BusinessCalendar` (franjas por día, festivos, timezone IANA)
- [ ] 1.2 Validación de forma del calendario (franjas no solapadas, `from < to`)

## 2. Funciones puras
- [ ] 2.1 `addBusinessMinutes(from, minutes, calendar)` con enfoque de saltos de ventana
- [ ] 2.2 `businessMinutesBetween(a, b, calendar)`
- [ ] 2.3 Manejo de zonas horarias vía librería de fechas con soporte IANA (no aritmética manual)
- [ ] 2.4 Manejo de cambio de horario de verano

## 3. Tests (cobertura de ramas 100% — no negociable, ver `project.md`)
- [ ] 3.1 Vencimiento dentro de la misma jornada laboral
- [ ] 3.2 Vencimiento que cruza la noche (fuera de horario)
- [ ] 3.3 Vencimiento que cruza el fin de semana
- [ ] 3.4 Ticket abierto en festivo
- [ ] 3.5 Ticket abierto fuera de horario (antes de apertura / después de cierre)
- [ ] 3.6 Cambio de horario de verano dentro de la ventana de cálculo
- [ ] 3.7 SLA de 0 minutos
- [ ] 3.8 SLA mayor que una semana laboral completa
- [ ] 3.9 Caso manual de verificación: viernes 17:50 + SLA 4h laborables + jornada 9-18 → debe vencer el lunes a las 12:50 (documentar el cálculo a mano en el test como comentario)

## Definición de terminado
- [ ] `libs/sla-engine` no importa nada fuera de una librería de fechas — cero dependencias de Prisma, HTTP o BullMQ
- [ ] Cobertura de ramas 100% en `nx test sla-engine --coverage`
- [ ] Los 9 casos de la sección 3 están como tests con nombres descriptivos, no como un único test paramétrico opaco
