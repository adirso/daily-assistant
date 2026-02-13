import pool from '../config/database.js';
import type { Group, CreateGroupData, UpdateGroupData, User } from '../types/index.js';

export const GroupModel = {
    async findByTelegramChatId(telegramChatId: number): Promise<Group | null> {
        const [rows] = await pool.execute<Group[]>(
            'SELECT * FROM `groups` WHERE telegram_chat_id = ?',
            [telegramChatId]
        );
        return rows[0] || null;
    },

    async create(groupData: CreateGroupData): Promise<Group | null> {
        const { telegramChatId, groupName } = groupData;
        const [result] = await pool.execute(
            `INSERT INTO \`groups\` (telegram_chat_id, group_name)
             VALUES (?, ?)`,
            [telegramChatId, groupName || null]
        );
        const insertResult = result as any;
        return this.findById(insertResult.insertId);
    },

    async findById(id: number): Promise<Group | null> {
        const [rows] = await pool.execute<Group[]>('SELECT * FROM `groups` WHERE id = ?', [id]);
        return rows[0] || null;
    },

    async update(id: number, updates: UpdateGroupData): Promise<Group | null> {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.groupName !== undefined) {
            fields.push('group_name = ?');
            values.push(updates.groupName);
        }

        if (fields.length === 0) return this.findById(id);

        values.push(id);
        await pool.execute(
            `UPDATE \`groups\` SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.findById(id);
    },

    async addMember(groupId: number, userId: number): Promise<boolean> {
        try {
            await pool.execute(
                `INSERT INTO group_members (group_id, user_id)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE joined_at = joined_at`,
                [groupId, userId]
            );
            return true;
        } catch (error: any) {
            if (error.code === 'ER_DUP_ENTRY') {
                return true; // Already a member
            }
            throw error;
        }
    },

    async removeMember(groupId: number, userId: number): Promise<boolean> {
        const [result] = await pool.execute(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );
        const deleteResult = result as any;
        return deleteResult.affectedRows > 0;
    },

    async getMembers(groupId: number): Promise<User[]> {
        const [rows] = await pool.execute<User[]>(
            `SELECT u.* FROM users u
             INNER JOIN group_members gm ON u.id = gm.user_id
             WHERE gm.group_id = ?`,
            [groupId]
        );
        return rows;
    },

    async isMember(groupId: number, userId: number): Promise<boolean> {
        const [rows] = await pool.execute<any[]>(
            'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
            [groupId, userId]
        );
        return rows.length > 0;
    }
};
