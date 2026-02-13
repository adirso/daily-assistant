import pool from '../config/database.js';
import type { Todo, TodoWithParsedIds, CreateTodoData, UpdateTodoData, QueryOptions } from '../types/index.js';

export const TodoModel = {
    async create(todoData: CreateTodoData): Promise<TodoWithParsedIds | null> {
        const { userId, groupId, assignedUserIds, task, priority, deadline, createdBy } = todoData;
        const [result] = await pool.execute(
            `INSERT INTO todos (user_id, group_id, assigned_user_ids, task, priority, deadline, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userId || null,
                groupId || null,
                assignedUserIds ? JSON.stringify(assignedUserIds) : null,
                task,
                priority || 'medium',
                deadline || null,
                createdBy
            ]
        );
        const insertResult = result as any;
        return this.findById(insertResult.insertId);
    },

    async findById(id: number): Promise<TodoWithParsedIds | null> {
        const [rows] = await pool.execute<Todo[]>('SELECT * FROM todos WHERE id = ?', [id]);
        if (rows[0] && rows[0].assigned_user_ids) {
            return {
                ...rows[0],
                assigned_user_ids: JSON.parse(rows[0].assigned_user_ids as string)
            };
        }
        return rows[0] ? { ...rows[0], assigned_user_ids: null } : null;
    },

    async findByUser(userId: number, options: QueryOptions = {}): Promise<TodoWithParsedIds[]> {
        const { includeCompleted = true, deadline = null } = options;
        let query = `
            SELECT * FROM todos 
            WHERE user_id = ?
        `;
        const params: any[] = [userId];

        if (!includeCompleted) {
            query += ' AND completed = FALSE';
        }

        if (deadline === 'today') {
            query += ' AND DATE(deadline) = CURDATE()';
        } else if (deadline) {
            query += ' AND DATE(deadline) = ?';
            params.push(deadline);
        }

        query += ' ORDER BY deadline ASC, priority DESC, created_at DESC';

        const [rows] = await pool.execute<Todo[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async findByGroup(groupId: number, options: QueryOptions = {}): Promise<TodoWithParsedIds[]> {
        const { includeCompleted = true, deadline = null } = options;
        let query = `
            SELECT * FROM todos 
            WHERE group_id = ?
        `;
        const params: any[] = [groupId];

        if (!includeCompleted) {
            query += ' AND completed = FALSE';
        }

        if (deadline === 'today') {
            query += ' AND DATE(deadline) = CURDATE()';
        } else if (deadline) {
            query += ' AND DATE(deadline) = ?';
            params.push(deadline);
        }

        query += ' ORDER BY deadline ASC, priority DESC, created_at DESC';

        const [rows] = await pool.execute<Todo[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async findByAssignedUser(userId: number, options: QueryOptions = {}): Promise<TodoWithParsedIds[]> {
        const { includeCompleted = true, deadline = null } = options;
        let query = `
            SELECT * FROM todos 
            WHERE JSON_CONTAINS(assigned_user_ids, CAST(? AS JSON))
        `;
        const params: any[] = [JSON.stringify(userId)];

        if (!includeCompleted) {
            query += ' AND completed = FALSE';
        }

        if (deadline === 'today') {
            query += ' AND DATE(deadline) = CURDATE()';
        } else if (deadline) {
            query += ' AND DATE(deadline) = ?';
            params.push(deadline);
        }

        query += ' ORDER BY deadline ASC, priority DESC, created_at DESC';

        const [rows] = await pool.execute<Todo[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async update(id: number, updates: UpdateTodoData): Promise<TodoWithParsedIds | null> {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.task !== undefined) {
            fields.push('task = ?');
            values.push(updates.task);
        }
        if (updates.priority !== undefined) {
            fields.push('priority = ?');
            values.push(updates.priority);
        }
        if (updates.deadline !== undefined) {
            fields.push('deadline = ?');
            values.push(updates.deadline);
        }
        if (updates.completed !== undefined) {
            fields.push('completed = ?');
            values.push(updates.completed);
        }
        if (updates.assignedUserIds !== undefined) {
            fields.push('assigned_user_ids = ?');
            values.push(updates.assignedUserIds ? JSON.stringify(updates.assignedUserIds) : null);
        }

        if (fields.length === 0) return this.findById(id);

        values.push(id);
        await pool.execute(
            `UPDATE todos SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.findById(id);
    },

    async delete(id: number): Promise<boolean> {
        const [result] = await pool.execute('DELETE FROM todos WHERE id = ?', [id]);
        const deleteResult = result as any;
        return deleteResult.affectedRows > 0;
    }
};
