-- Grant clientes_particulares module to system admin and manager roles (if missing).
INSERT INTO "role_permissions" ("id", "roleId", "moduleKey")
SELECT gen_random_uuid(), r."id", 'clientes_particulares'
FROM "roles" r
WHERE r."name" IN ('admin', 'manager')
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permissions" rp
    WHERE rp."roleId" = r."id"
      AND rp."moduleKey" = 'clientes_particulares'
  );
