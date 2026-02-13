-- Add timezone column to groups table if it doesn't exist (idempotent)
-- Check if column exists before adding
SET @dbname = DATABASE();
SET @tablename = 'groups';
SET @columnname = 'timezone';
SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE
            (TABLE_SCHEMA = @dbname)
            AND (TABLE_NAME = @tablename)
            AND (COLUMN_NAME = @columnname)
    ) > 0,
    'SELECT 1', -- Column exists, do nothing
    CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN ', @columnname, ' VARCHAR(50) DEFAULT ''UTC'' AFTER group_name')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
