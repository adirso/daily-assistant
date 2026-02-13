import pool from '../config/database.js';
import type { User, CreateUserData, UpdateUserData } from '../types/index.js';

export const UserModel = {
    async findByTelegramId(telegramUserId: number): Promise<User | null> {
        const [rows] = await pool.execute<User[]>(
            'SELECT * FROM users WHERE telegram_user_id = ?',
            [telegramUserId]
        );
        return rows[0] || null;
    },

    async create(userData: CreateUserData): Promise<User | null> {
        const { telegramUserId, telegramUsername, displayName, customName, timezone } = userData;
        const [result] = await pool.execute(
            `INSERT INTO users (telegram_user_id, telegram_username, display_name, custom_name, timezone)
             VALUES (?, ?, ?, ?, ?)`,
            [telegramUserId, telegramUsername || null, displayName || null, customName || null, timezone || 'UTC']
        );
        const insertResult = result as any;
        return this.findById(insertResult.insertId);
    },

    async findById(id: number): Promise<User | null> {
        const [rows] = await pool.execute<User[]>('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0] || null;
    },

    async update(id: number, updates: UpdateUserData): Promise<User | null> {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.telegramUsername !== undefined) {
            fields.push('telegram_username = ?');
            values.push(updates.telegramUsername);
        }
        if (updates.displayName !== undefined) {
            fields.push('display_name = ?');
            values.push(updates.displayName);
        }
        if (updates.customName !== undefined) {
            fields.push('custom_name = ?');
            values.push(updates.customName);
        }
        if (updates.timezone !== undefined) {
            fields.push('timezone = ?');
            values.push(updates.timezone);
        }

        if (fields.length === 0) return this.findById(id);

        values.push(id);
        await pool.execute(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.findById(id);
    },

    async findByName(name: string): Promise<User | null> {
        const [rows] = await pool.execute<User[]>(
            `SELECT * FROM users 
             WHERE custom_name = ? OR display_name = ? OR telegram_username = ?
             LIMIT 1`,
            [name, name, name]
        );
        return rows[0] || null;
    },

    async findByIds(userIds: number[]): Promise<User[]> {
        if (!userIds || userIds.length === 0) return [];
        const placeholders = userIds.map(() => '?').join(',');
        const [rows] = await pool.execute<User[]>(
            `SELECT * FROM users WHERE id IN (${placeholders})`,
            userIds
        );
        return rows;
    },

    getDisplayName(user: User): string {
        return user.custom_name || user.display_name || user.telegram_username || `User ${user.id}`;
    }
};
