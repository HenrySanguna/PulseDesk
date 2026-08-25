# specs/ — vacío a propósito

Este directorio es la **verdad actual** del sistema en OpenSpec: lo que ya está construido y verificado. Como PulseDesk todavía no existe (es un proyecto greenfield, no una modificación de algo existente), aquí no hay nada todavía — y eso es correcto, no un error.

Los seis `changes/NN-*` de este workspace son la especificación completa del MVP, ordenados según `10-roadmap.md` del spec original. A medida que cada uno se implemente y se archive (`/opsx:archive` o el comando equivalente de tu agente), su spec delta se fusiona aquí y este directorio empieza a llenarse — construyendo orgánicamente, cambio a cambio, la documentación viva del sistema real.

No adelantes contenido aquí a mano. Si necesitas consultar el diseño completo antes de que un cambio se archive, la fuente es el `spec.md` dentro de `changes/<nombre>/specs/`, o los documentos markdown originales (`00-overview.md` a `10-roadmap.md`) referenciados en `project.md`.
