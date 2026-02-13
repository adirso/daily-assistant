import { MessageAuditModel, LLMAuditModel } from '../models/audit.js';
import type { ParsedAction } from '../types/index.js';

interface LLMResponse {
    response?: string;
    content?: string;
    parsedAction?: ParsedAction;
    usage?: { total_tokens?: number };
    tokens?: number;
    model?: string;
}

export const auditService = {
    async logMessage(messageData: {
        telegramMessageId: number;
        userId: number;
        groupId: number | null;
        chatId: number;
        messageText: string;
        messageType?: string;
    }): Promise<number | null> {
        try {
            const messageAuditId = await MessageAuditModel.create(messageData);
            return messageAuditId;
        } catch (error) {
            console.error('Error logging message to audit:', error);
            // Don't throw - audit failures shouldn't break the main flow
            return null;
        }
    },

    async logLLMInteraction(llmData: {
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
    }): Promise<number | null> {
        try {
            const llmAuditId = await LLMAuditModel.create(llmData);
            return llmAuditId;
        } catch (error) {
            console.error('Error logging LLM interaction to audit:', error);
            // Don't throw - audit failures shouldn't break the main flow
            return null;
        }
    },

    async logLLMWithTiming(
        messageAuditId: number,
        userId: number,
        groupId: number | null,
        prompt: string,
        llmCall: () => Promise<LLMResponse>
    ): Promise<{ response: string; parsedAction: ParsedAction | null; tokensUsed: number | null; model: string | null }> {
        const startTime = Date.now();
        let llmResponse: string | null = null;
        let parsedAction: ParsedAction | null = null;
        let tokensUsed: number | null = null;
        let model: string | null = null;
        let error: string | null = null;

        try {
            const response = await llmCall();
            llmResponse = response.response || response.content || JSON.stringify(response);
            parsedAction = response.parsedAction || null;
            tokensUsed = response.usage?.total_tokens || response.tokens || null;
            model = response.model || null;
        } catch (err: any) {
            error = err.message || String(err);
            llmResponse = error;
            throw err; // Re-throw so caller can handle
        } finally {
            const responseTimeMs = Date.now() - startTime;
            await this.logLLMInteraction({
                messageAuditId,
                userId,
                groupId,
                prompt,
                llmResponse: llmResponse || error || 'No response',
                parsedAction,
                tokensUsed,
                model,
                responseTimeMs,
                error
            });
        }

        return { response: llmResponse || '', parsedAction, tokensUsed, model };
    }
};
