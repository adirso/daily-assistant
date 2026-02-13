import pool from '../config/database.js';
import type { MessageAudit, LLMAudit, ParsedAction } from '../types/index.js';

export const MessageAuditModel = {
    async create(auditData: {
        telegramMessageId: number;
        userId: number;
        groupId: number | null;
        chatId: number;
        messageText: string;
        messageType?: string;
    }): Promise<number> {
        const { telegramMessageId, userId, groupId, chatId, messageText, messageType } = auditData;
        const [result] = await pool.execute(
            `INSERT INTO message_audit (telegram_message_id, user_id, group_id, chat_id, message_text, message_type)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [telegramMessageId, userId, groupId || null, chatId, messageText, messageType || 'text']
        );
        const insertResult = result as any;
        return insertResult.insertId;
    },

    async findById(id: number): Promise<MessageAudit | null> {
        const [rows] = await pool.execute<MessageAudit[]>('SELECT * FROM message_audit WHERE id = ?', [id]);
        return rows[0] || null;
    },

    async findByUser(userId: number, limit: number = 100): Promise<MessageAudit[]> {
        const [rows] = await pool.execute<MessageAudit[]>(
            'SELECT * FROM message_audit WHERE user_id = ? ORDER BY received_at DESC LIMIT ?',
            [userId, limit]
        );
        return rows;
    },

    async findByGroup(groupId: number, limit: number = 100): Promise<MessageAudit[]> {
        const [rows] = await pool.execute<MessageAudit[]>(
            'SELECT * FROM message_audit WHERE group_id = ? ORDER BY received_at DESC LIMIT ?',
            [groupId, limit]
        );
        return rows;
    },

    /**
     * Get the most recent chat ID for a user (from private chats only)
     */
    async getUserChatId(userId: number): Promise<number | null> {
        const [rows] = await pool.execute<MessageAudit[]>(
            'SELECT chat_id FROM message_audit WHERE user_id = ? AND group_id IS NULL ORDER BY received_at DESC LIMIT 1',
            [userId]
        );
        return rows[0]?.chat_id || null;
    },

    /**
     * Get all users with their chat IDs (for notifications)
     */
    async getAllUsersWithChatIds(): Promise<Array<{ userId: number; chatId: number }>> {
        // Use subquery to get the most recent chat_id for each user
        const [rows] = await pool.execute<any[]>(
            `SELECT user_id, chat_id 
             FROM (
                 SELECT user_id, chat_id, 
                        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY received_at DESC) as rn
                 FROM message_audit 
                 WHERE group_id IS NULL
             ) AS ranked
             WHERE rn = 1`
        );
        
        return rows.map(row => ({
            userId: row.user_id,
            chatId: row.chat_id
        }));
    }
};

interface LLMAuditWithParsedAction extends Omit<LLMAudit, 'parsed_action'> {
    parsed_action: ParsedAction | null;
}

export const LLMAuditModel = {
    async create(auditData: {
        messageAuditId: number;
        userId: number;
        groupId: number | null;
        prompt: string;
        llmResponse: string;
        parsedAction: ParsedAction | null;
        tokensUsed: number | null;
        model: string | null;
        responseTimeMs: number | null;
        error: string | null;
    }): Promise<number> {
        const { messageAuditId, userId, groupId, prompt, llmResponse, parsedAction, tokensUsed, model, responseTimeMs, error } = auditData;
        const [result] = await pool.execute(
            `INSERT INTO llm_audit (message_audit_id, user_id, group_id, prompt, llm_response, parsed_action, tokens_used, model, response_time_ms, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                messageAuditId,
                userId,
                groupId || null,
                prompt,
                llmResponse,
                parsedAction ? JSON.stringify(parsedAction) : null,
                tokensUsed || null,
                model || null,
                responseTimeMs || null,
                error || null
            ]
        );
        const insertResult = result as any;
        return insertResult.insertId;
    },

    async findById(id: number): Promise<LLMAuditWithParsedAction | null> {
        const [rows] = await pool.execute<LLMAudit[]>('SELECT * FROM llm_audit WHERE id = ?', [id]);
        if (rows[0]) {
            return {
                ...rows[0],
                parsed_action: rows[0].parsed_action ? JSON.parse(rows[0].parsed_action as string) : null
            };
        }
        return null;
    },

    async findByMessageAuditId(messageAuditId: number): Promise<LLMAuditWithParsedAction[]> {
        const [rows] = await pool.execute<LLMAudit[]>(
            'SELECT * FROM llm_audit WHERE message_audit_id = ?',
            [messageAuditId]
        );
        return rows.map(row => ({
            ...row,
            parsed_action: row.parsed_action ? JSON.parse(row.parsed_action as string) : null
        }));
    },

    async findByUser(userId: number, limit: number = 100): Promise<LLMAuditWithParsedAction[]> {
        const [rows] = await pool.execute<LLMAudit[]>(
            'SELECT * FROM llm_audit WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
            [userId, limit]
        );
        return rows.map(row => ({
            ...row,
            parsed_action: row.parsed_action ? JSON.parse(row.parsed_action as string) : null
        }));
    },

    async findErrors(limit: number = 100): Promise<LLMAuditWithParsedAction[]> {
        const [rows] = await pool.execute<LLMAudit[]>(
            'SELECT * FROM llm_audit WHERE error IS NOT NULL ORDER BY created_at DESC LIMIT ?',
            [limit]
        );
        return rows.map(row => ({
            ...row,
            parsed_action: row.parsed_action ? JSON.parse(row.parsed_action as string) : null
        }));
    },

    async getTokenUsage(startDate: string | null = null, endDate: string | null = null): Promise<number> {
        let query = 'SELECT SUM(tokens_used) as total_tokens FROM llm_audit WHERE tokens_used IS NOT NULL';
        const params: any[] = [];

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        const [rows] = await pool.execute(query, params) as any;
        return rows[0]?.total_tokens || 0;
    }
};
