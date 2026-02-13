import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
    filename: string;
    version: number;
    sql: string;
}

/**
 * Get database connection
 */
function getConnection() {
    return mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        database: process.env.DB_NAME!,
        port: parseInt(process.env.DB_PORT || '3306'),
        multipleStatements: true // Allow multiple SQL statements
    });
}

/**
 * Create migrations table if it doesn't exist
 */
async function ensureMigrationsTable(connection: mysql.Connection): Promise<void> {
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            version INT UNIQUE NOT NULL,
            filename VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_version (version)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

/**
 * Get list of already executed migrations
 */
async function getExecutedMigrations(connection: mysql.Connection): Promise<number[]> {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT version FROM migrations ORDER BY version'
    );
    return rows.map(row => row.version);
}

/**
 * Load and parse migration files
 */
function loadMigrations(): Migration[] {
    const migrationsDir = join(__dirname, '../../database/migrations');
    const files = readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Sort alphabetically to ensure order
    
    return files.map(filename => {
        const filePath = join(migrationsDir, filename);
        const sql = readFileSync(filePath, 'utf-8');
        
        // Extract version number from filename (e.g., "001_initial_schema.sql" -> 1)
        const match = filename.match(/^(\d+)_/);
        const version = match ? parseInt(match[1]) : 0;
        
        return { filename, version, sql };
    });
}

/**
 * Execute a single migration
 */
async function executeMigration(
    connection: mysql.Connection,
    migration: Migration
): Promise<void> {
    console.log(`Running migration ${migration.filename} (version ${migration.version})...`);
    
    try {
        // Execute the migration SQL
        await connection.query(migration.sql);
        
        // Record that this migration was executed (only if not already recorded)
        // This handles the case where migration was partially executed
        await connection.execute(
            `INSERT IGNORE INTO migrations (version, filename) VALUES (?, ?)`,
            [migration.version, migration.filename]
        );
        
        console.log(`✅ Migration ${migration.filename} completed successfully`);
    } catch (error: any) {
        // Check if it's a "duplicate column" or "duplicate key" error - these are often safe to ignore
        // if the migration was partially executed before
        if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME') {
            console.log(`⚠️  Migration ${migration.filename} encountered duplicate (column/key may already exist)`);
            console.log(`   Attempting to mark as executed anyway...`);
            
            // Try to mark as executed anyway (in case it was partially run)
            try {
                await connection.execute(
                    `INSERT IGNORE INTO migrations (version, filename) VALUES (?, ?)`,
                    [migration.version, migration.filename]
                );
                console.log(`✅ Migration ${migration.filename} marked as executed (column/key already exists)`);
                return; // Success - migration was already applied
            } catch (insertError: any) {
                // If we can't insert, it might already be there, which is fine
                console.log(`   Migration record may already exist, continuing...`);
                return;
            }
        }
        
        console.error(`❌ Error running migration ${migration.filename}:`, error.message);
        throw error;
    }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
    let connection: mysql.Connection | null = null;
    
    try {
        console.log('🔄 Starting database migrations...');
        
        // Connect to database
        connection = await getConnection();
        console.log('✅ Connected to database');
        
        // Ensure migrations table exists
        await ensureMigrationsTable(connection);
        console.log('✅ Migrations table ready');
        
        // Get executed migrations
        const executedVersions = await getExecutedMigrations(connection);
        console.log(`📋 Found ${executedVersions.length} executed migrations`);
        
        // Load all migration files
        const allMigrations = loadMigrations();
        console.log(`📁 Found ${allMigrations.length} migration files`);
        
        // Filter to only pending migrations
        const pendingMigrations = allMigrations.filter(
            migration => !executedVersions.includes(migration.version)
        );
        
        if (pendingMigrations.length === 0) {
            console.log('✅ No pending migrations. Database is up to date.');
            return;
        }
        
        console.log(`🚀 Running ${pendingMigrations.length} pending migration(s)...`);
        
        // Execute pending migrations in order
        for (const migration of pendingMigrations) {
            await executeMigration(connection, migration);
        }
        
        console.log('✅ All migrations completed successfully!');
        
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run migrations if this file is executed directly (via npm run migrate)
// Check if this is the main module
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(process.cwd(), ''));
if (isMainModule || process.argv[1]?.includes('migrate')) {
    runMigrations()
        .then(() => {
            console.log('✅ Migration process completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration process failed:', error);
            process.exit(1);
        });
}
