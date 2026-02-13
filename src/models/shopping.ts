import pool from '../config/database.js';
import type { ShoppingItem, ShoppingItemWithParsedIds, CreateShoppingItemData, UpdateShoppingItemData, QueryOptions } from '../types/index.js';

export const ShoppingItemModel = {
    async create(itemData: CreateShoppingItemData): Promise<ShoppingItemWithParsedIds | null> {
        const { userId, groupId, assignedUserIds, item, category, amount, createdBy } = itemData;
        const [result] = await pool.execute(
            `INSERT INTO shopping_items (user_id, group_id, assigned_user_ids, item, category, amount, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userId || null,
                groupId || null,
                assignedUserIds ? JSON.stringify(assignedUserIds) : null,
                item,
                category || null,
                amount || null,
                createdBy
            ]
        );
        const insertResult = result as any;
        return this.findById(insertResult.insertId);
    },

    async findById(id: number): Promise<ShoppingItemWithParsedIds | null> {
        const [rows] = await pool.execute<ShoppingItem[]>('SELECT * FROM shopping_items WHERE id = ?', [id]);
        if (rows[0] && rows[0].assigned_user_ids) {
            return {
                ...rows[0],
                assigned_user_ids: JSON.parse(rows[0].assigned_user_ids as string)
            };
        }
        return rows[0] ? { ...rows[0], assigned_user_ids: null } : null;
    },

    async findByUser(userId: number, options: QueryOptions = {}): Promise<ShoppingItemWithParsedIds[]> {
        const { includePurchased = false, category = null } = options;
        let query = `
            SELECT * FROM shopping_items 
            WHERE user_id = ?
        `;
        const params: any[] = [userId];

        if (!includePurchased) {
            query += ' AND purchased = FALSE';
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        query += ' ORDER BY category, created_at DESC';

        const [rows] = await pool.execute<ShoppingItem[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async findByGroup(groupId: number, options: QueryOptions = {}): Promise<ShoppingItemWithParsedIds[]> {
        const { includePurchased = false, category = null } = options;
        let query = `
            SELECT * FROM shopping_items 
            WHERE group_id = ?
        `;
        const params: any[] = [groupId];

        if (!includePurchased) {
            query += ' AND purchased = FALSE';
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        query += ' ORDER BY category, created_at DESC';

        const [rows] = await pool.execute<ShoppingItem[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async findByAssignedUser(userId: number, options: QueryOptions = {}): Promise<ShoppingItemWithParsedIds[]> {
        const { includePurchased = false, category = null } = options;
        let query = `
            SELECT * FROM shopping_items 
            WHERE JSON_CONTAINS(assigned_user_ids, CAST(? AS JSON))
        `;
        const params: any[] = [JSON.stringify(userId)];

        if (!includePurchased) {
            query += ' AND purchased = FALSE';
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        query += ' ORDER BY category, created_at DESC';

        const [rows] = await pool.execute<ShoppingItem[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async markPurchased(id: number, purchasedBy: number): Promise<boolean> {
        const [result] = await pool.execute(
            'UPDATE shopping_items SET purchased = TRUE, purchased_by = ? WHERE id = ?',
            [purchasedBy, id]
        );
        const updateResult = result as any;
        return updateResult.affectedRows > 0;
    },

    async markMultiplePurchased(itemIds: number[], purchasedBy: number): Promise<number> {
        if (!itemIds || itemIds.length === 0) return 0;
        const placeholders = itemIds.map(() => '?').join(',');
        const [result] = await pool.execute(
            `UPDATE shopping_items 
             SET purchased = TRUE, purchased_by = ? 
             WHERE id IN (${placeholders})`,
            [purchasedBy, ...itemIds]
        );
        const updateResult = result as any;
        return updateResult.affectedRows;
    },

    async update(id: number, updates: UpdateShoppingItemData): Promise<ShoppingItemWithParsedIds | null> {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.item !== undefined) {
            fields.push('item = ?');
            values.push(updates.item);
        }
        if (updates.category !== undefined) {
            fields.push('category = ?');
            values.push(updates.category);
        }
        if (updates.amount !== undefined) {
            fields.push('amount = ?');
            values.push(updates.amount);
        }
        if (updates.purchased !== undefined) {
            fields.push('purchased = ?');
            values.push(updates.purchased);
        }
        if (updates.purchasedBy !== undefined) {
            fields.push('purchased_by = ?');
            values.push(updates.purchasedBy);
        }
        if (updates.assignedUserIds !== undefined) {
            fields.push('assigned_user_ids = ?');
            values.push(updates.assignedUserIds ? JSON.stringify(updates.assignedUserIds) : null);
        }

        if (fields.length === 0) return this.findById(id);

        values.push(id);
        await pool.execute(
            `UPDATE shopping_items SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.findById(id);
    },

    async delete(id: number): Promise<boolean> {
        const [result] = await pool.execute('DELETE FROM shopping_items WHERE id = ?', [id]);
        const deleteResult = result as any;
        return deleteResult.affectedRows > 0;
    },

    async searchByItemName(itemName: string, userId: number | null = null, groupId: number | null = null): Promise<ShoppingItemWithParsedIds[]> {
        let query = `
            SELECT * FROM shopping_items 
            WHERE item LIKE ? AND purchased = FALSE
        `;
        const params: any[] = [`%${itemName}%`];

        if (userId) {
            query += ' AND user_id = ?';
            params.push(userId);
        } else if (groupId) {
            query += ' AND group_id = ?';
            params.push(groupId);
        }

        const [rows] = await pool.execute<ShoppingItem[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    }
};
