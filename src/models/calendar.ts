import pool from '../config/database.js';
import type { CalendarEvent, CalendarEventWithParsedIds, CreateCalendarEventData, UpdateCalendarEventData, QueryOptions } from '../types/index.js';

export const CalendarEventModel = {
    async create(eventData: CreateCalendarEventData): Promise<CalendarEventWithParsedIds | null> {
        const { userId, groupId, assignedUserIds, title, description, startTime, endTime, createdBy } = eventData;
        const [result] = await pool.execute(
            `INSERT INTO calendar_events (user_id, group_id, assigned_user_ids, title, description, start_time, end_time, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId || null,
                groupId || null,
                assignedUserIds ? JSON.stringify(assignedUserIds) : null,
                title,
                description || null,
                startTime,
                endTime || null,
                createdBy
            ]
        );
        const insertResult = result as any;
        return this.findById(insertResult.insertId);
    },

    async findById(id: number): Promise<CalendarEventWithParsedIds | null> {
        const [rows] = await pool.execute<CalendarEvent[]>('SELECT * FROM calendar_events WHERE id = ?', [id]);
        if (rows[0] && rows[0].assigned_user_ids) {
            return {
                ...rows[0],
                assigned_user_ids: JSON.parse(rows[0].assigned_user_ids as string)
            };
        }
        return rows[0] ? { ...rows[0], assigned_user_ids: null } : null;
    },

    async findByUser(userId: number, options: QueryOptions = {}): Promise<CalendarEventWithParsedIds[]> {
        const { date = null, startDate = null, endDate = null } = options;
        let query = `
            SELECT * FROM calendar_events 
            WHERE user_id = ?
        `;
        const params: any[] = [userId];

        if (date === 'today') {
            query += ' AND DATE(start_time) = CURDATE()';
        } else if (date) {
            query += ' AND DATE(start_time) = ?';
            params.push(date);
        } else if (startDate && endDate) {
            query += ' AND start_time >= ? AND start_time <= ?';
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ' AND start_time >= ?';
            params.push(startDate);
        }

        query += ' ORDER BY start_time ASC';

        const [rows] = await pool.execute<CalendarEvent[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async findByGroup(groupId: number, options: QueryOptions = {}): Promise<CalendarEventWithParsedIds[]> {
        const { date = null, startDate = null, endDate = null } = options;
        let query = `
            SELECT * FROM calendar_events 
            WHERE group_id = ?
        `;
        const params: any[] = [groupId];

        if (date === 'today') {
            query += ' AND DATE(start_time) = CURDATE()';
        } else if (date) {
            query += ' AND DATE(start_time) = ?';
            params.push(date);
        } else if (startDate && endDate) {
            query += ' AND start_time >= ? AND start_time <= ?';
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ' AND start_time >= ?';
            params.push(startDate);
        }

        query += ' ORDER BY start_time ASC';

        const [rows] = await pool.execute<CalendarEvent[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async findByAssignedUser(userId: number, options: QueryOptions = {}): Promise<CalendarEventWithParsedIds[]> {
        const { date = null, startDate = null, endDate = null } = options;
        let query = `
            SELECT * FROM calendar_events 
            WHERE JSON_CONTAINS(assigned_user_ids, CAST(? AS JSON))
        `;
        const params: any[] = [JSON.stringify(userId)];

        if (date === 'today') {
            query += ' AND DATE(start_time) = CURDATE()';
        } else if (date) {
            query += ' AND DATE(start_time) = ?';
            params.push(date);
        } else if (startDate && endDate) {
            query += ' AND start_time >= ? AND start_time <= ?';
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ' AND start_time >= ?';
            params.push(startDate);
        }

        query += ' ORDER BY start_time ASC';

        const [rows] = await pool.execute<CalendarEvent[]>(query, params);
        return rows.map(row => ({
            ...row,
            assigned_user_ids: row.assigned_user_ids ? JSON.parse(row.assigned_user_ids as string) : null
        }));
    },

    async update(id: number, updates: UpdateCalendarEventData): Promise<CalendarEventWithParsedIds | null> {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.title !== undefined) {
            fields.push('title = ?');
            values.push(updates.title);
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
        }
        if (updates.startTime !== undefined) {
            fields.push('start_time = ?');
            values.push(updates.startTime);
        }
        if (updates.endTime !== undefined) {
            fields.push('end_time = ?');
            values.push(updates.endTime);
        }
        if (updates.assignedUserIds !== undefined) {
            fields.push('assigned_user_ids = ?');
            values.push(updates.assignedUserIds ? JSON.stringify(updates.assignedUserIds) : null);
        }

        if (fields.length === 0) return this.findById(id);

        values.push(id);
        await pool.execute(
            `UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.findById(id);
    },

    async delete(id: number): Promise<boolean> {
        const [result] = await pool.execute('DELETE FROM calendar_events WHERE id = ?', [id]);
        const deleteResult = result as any;
        return deleteResult.affectedRows > 0;
    }
};
