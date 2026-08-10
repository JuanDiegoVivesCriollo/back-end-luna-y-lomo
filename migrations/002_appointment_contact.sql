USE luna_y_lomo;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='owner_name') = 0,
  'ALTER TABLE appointments ADD COLUMN owner_name VARCHAR(120) NOT NULL DEFAULT ''Sin registrar'' AFTER pet_id',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='pet_name') = 0,
  'ALTER TABLE appointments ADD COLUMN pet_name VARCHAR(100) NOT NULL DEFAULT ''Sin registrar'' AFTER owner_name',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='pet_type') = 0,
  'ALTER TABLE appointments ADD COLUMN pet_type ENUM(''perro'',''gato'',''otro'') NOT NULL DEFAULT ''otro'' AFTER pet_name',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
