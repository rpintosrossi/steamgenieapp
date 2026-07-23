# Kit comercial — Steam Genie

Material para vender el **servicio de limpieza** de Steam Genie a hoteles, edificios y empresas.
La app interna es un diferencial de control y calidad; **no** se vende el software.

## Qué usar en cada momento

| Momento | Documento | Objetivo |
|---------|-----------|----------|
| Primer contacto | **[Steam-Genie-Presentacion.pdf](./Steam-Genie-Presentacion.pdf)** | PDF 1 hoja para mandar al cliente |
| Texto editable | [01-one-pager.md](./01-one-pager.md) | Fuente del contenido |
| Cotización formal | [02-propuesta-comercial.md](./02-propuesta-comercial.md) | Propuesta del servicio (completar precios) |

## Regenerar el PDF

```bash
pnpm --filter @steam-genie/web docs:pdf:comercial
```

Salida:

- `docs/comercial/Steam-Genie-Presentacion.pdf`
- `apps/web/public/documentacion/Steam-Genie-Presentacion.pdf`
