# Documentación de usuario — Steam Genie

Manuales operativos orientados a quienes usan el sistema.

| Manual | Archivo | Público en web |
|--------|---------|----------------|
| Administrador (panel web) | [manual-admin.md](./manual-admin.md) | `/documentacion` → PDF |
| Técnico / Limpiador (app) | [manual-tecnico.md](./manual-tecnico.md) | `/documentacion` → PDF |

## Comercial / ventas

Kit para presentar y cotizar el producto: [comercial/README.md](./comercial/README.md)

## Regenerar PDFs

Desde la raíz del monorepo:

```bash
pnpm --filter @steam-genie/web docs:pdf
```

Los PDF se escriben en `apps/web/public/documentacion/` (también se copian los `.md`).

La página **`/documentacion`** es pública: no requiere login.
