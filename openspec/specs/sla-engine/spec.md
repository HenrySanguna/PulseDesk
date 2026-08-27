## ADDED Requirements

### Requirement: Cálculo de minutos laborables entre dos instantes
El sistema SHALL calcular el número de minutos laborables transcurridos entre dos instantes dados, considerando únicamente las franjas horarias y días definidos en el calendario laboral proporcionado, excluyendo festivos.

#### Scenario: Dos instantes dentro de la misma jornada
- **GIVEN** un calendario con jornada de 09:00 a 18:00, de lunes a viernes
- **WHEN** se calculan los minutos laborables entre las 10:00 y las 12:00 de un martes
- **THEN** el resultado es 120 minutos

#### Scenario: Instantes que abarcan una noche
- **GIVEN** el mismo calendario
- **WHEN** se calculan los minutos laborables entre las 17:00 del lunes y las 08:00 del martes (antes de apertura)
- **THEN** el resultado es 60 minutos (17:00–18:00), sin contar las horas nocturnas fuera de jornada

#### Scenario: Instantes que abarcan un fin de semana
- **GIVEN** el mismo calendario
- **WHEN** se calculan los minutos laborables entre las 17:00 del viernes y las 08:00 del lunes (antes de apertura)
- **THEN** el resultado es 60 minutos, sin contar sábado ni domingo

#### Scenario: Instantes que abarcan un festivo
- **GIVEN** un calendario con el 25 de diciembre marcado como festivo
- **WHEN** se calculan los minutos laborables entre el 24 de diciembre a las 17:00 y el 26 de diciembre a las 10:00
- **THEN** el 25 de diciembre no aporta minutos al resultado, aunque caiga en día laborable de la semana

### Requirement: Suma de minutos laborables a un instante
El sistema SHALL calcular el instante resultante de sumar N minutos laborables a un instante de inicio, saltando automáticamente fuera de las franjas no laborables.

#### Scenario: Suma que no cruza el fin de la jornada
- **GIVEN** un calendario con jornada de 09:00 a 18:00
- **WHEN** se suman 30 minutos laborables a las 10:00 de un martes
- **THEN** el resultado es las 10:30 del mismo martes

#### Scenario: Suma que cruza el fin de semana
- **GIVEN** el mismo calendario
- **WHEN** se suman 4 horas laborables (240 minutos) a las 17:00 de un viernes
- **THEN** el resultado es las 12:00 del lunes siguiente (60 minutos el viernes + 180 minutos el lunes)

#### Scenario: Inicio fuera de horario laboral
- **GIVEN** el mismo calendario
- **WHEN** se suman 60 minutos laborables a las 22:00 de un martes (fuera de jornada)
- **THEN** el cálculo comienza desde el inicio de la siguiente ventana laboral (09:00 del miércoles), y el resultado es las 10:00 del miércoles

#### Scenario: SLA de cero minutos dentro de horario laboral
- **GIVEN** el mismo calendario
- **WHEN** se suman 0 minutos laborables a las 10:00 de un martes (dentro de jornada)
- **THEN** el resultado es exactamente las 10:00 del martes, sin buscar ninguna ventana adicional

#### Scenario: SLA de cero minutos fuera de horario laboral
- **GIVEN** el mismo calendario
- **WHEN** se suman 0 minutos laborables a las 22:00 de un martes (fuera de jornada)
- **THEN** el resultado es el inicio de la siguiente ventana laboral (09:00 del miércoles)

### Requirement: Soporte de zonas horarias y cambios de horario de verano
El sistema SHALL realizar todos los cálculos de ventana en la zona horaria IANA especificada en el calendario, produciendo resultados correctos incluso cuando el rango de cálculo cruza una transición de horario de verano.

#### Scenario: Cálculo que cruza el cambio a horario de verano
- **GIVEN** un calendario en zona horaria "Europe/Madrid" con jornada de 09:00 a 18:00, y una transición a horario de verano dentro del rango de cálculo
- **WHEN** se suman minutos laborables a un instante justo antes de la transición
- **THEN** el resultado refleja horas de pared correctas (09:00 sigue siendo las 09:00 locales), no un desplazamiento de una hora causado por aritmética en UTC

### Requirement: Cálculo determinista para SLAs de larga duración
El sistema SHALL producir resultados correctos para SLAs cuya duración supera una semana laboral completa, sin degradación de rendimiento proporcional al número de minutos.

#### Scenario: SLA de dos semanas laborables
- **GIVEN** un calendario estándar de lunes a viernes, 09:00–18:00
- **WHEN** se suman 4.500 minutos laborables (aproximadamente dos semanas) a un instante de inicio
- **THEN** el cálculo se completa en un número de pasos proporcional a las ventanas cruzadas, no al número de minutos, y el instante resultante es verificable a mano
