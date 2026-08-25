# Proposal: Add SLA Engine

## Intent
Un SLA no es un temporizador: es un reloj que cuenta solo en horario laboral, que hay que poder pausar cuando la pelota está en el tejado del cliente, y que tiene que sobrevivir a reinicios del proceso que lo vigila. Esta es la lógica de negocio más compleja y con más casos borde de todo PulseDesk. Se construye antes que cualquier otra cosa, como función pura sin base de datos ni colas, porque es la pieza más difícil de depurar si aparece enterrada bajo capas de HTTP y BullMQ.

## Scope

**In scope**
- `libs/sla-engine`: cálculo de minutos laborables entre dos instantes, dado un calendario de horario laboral.
- Suma de N minutos laborables a un instante, respetando festivos y franjas horarias.
- Soporte de múltiples zonas horarias y cambios de horario de verano.
- Cálculo del tiempo consumido y restante para pausar/reanudar un reloj.

**Out of scope**
- Persistencia de relojes (Fase 4, `add-sla-jobs`).
- Programación de trabajos de vencimiento con BullMQ (Fase 4).
- Cualquier llamada HTTP o de base de datos — esta librería es pura por diseño.

## Approach
Función pura en TypeScript sin dependencias externas, con un enfoque de "saltos de ventana": en lugar de iterar minuto a minuto (lento e impreciso con zonas horarias), se salta directamente entre el fin de una ventana laboral y el inicio de la siguiente. El calendario de entrada es un objeto serializable (franjas por día de la semana + lista de festivos + zona horaria IANA), lo que permite testear con calendarios sintéticos sin ninguna infraestructura.
