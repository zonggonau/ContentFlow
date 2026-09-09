-- Remove legacy single_type_fields and component_fields tables.
--
-- These were superseded by the unified, polymorphic schema_fields table
-- (SingleType and Component both already have a `schemaFields` relation
-- into it). No application code reads or writes these two tables anymore
-- — the one-time data migration that moved rows into schema_fields already
-- ran (see scripts/migrate-fields.ts) — so they have sat unused, duplicating
-- the real field data model and risking future code accidentally writing
-- to the wrong table.
--
-- DropForeignKey
ALTER TABLE "single_type_fields" DROP CONSTRAINT IF EXISTS "single_type_fields_singleTypeId_fkey";

-- DropForeignKey
ALTER TABLE "component_fields" DROP CONSTRAINT IF EXISTS "component_fields_componentId_fkey";

-- DropTable
DROP TABLE IF EXISTS "single_type_fields";

-- DropTable
DROP TABLE IF EXISTS "component_fields";
