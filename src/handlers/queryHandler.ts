import { todoHandler } from './todoHandler.js';
import { shoppingHandler } from './shoppingHandler.js';
import { calendarHandler } from './calendarHandler.js';
import type { ParsedAction, HandlerContext, HandlerResult } from '../types/index.js';

/**
 * Query handler routes queries to the appropriate module handler
 * Each module (todo, shopping, calendar) handles its own queries and generates responses
 */
export const queryHandler = {
    async handle(action: ParsedAction, context: HandlerContext): Promise<HandlerResult> {
        const { user, group } = context;
        const { operation, parameters } = action;
        
        if (operation !== 'list') {
            throw new Error(`Unknown query operation: ${operation}`);
        }
        
        const queryType = parameters?.queryType || 'all'; // Default to 'all' if not specified
        
        // Route to appropriate handler based on queryType
        if (queryType === 'todos') {
            return await todoHandler.query(parameters, user, group);
        } else if (queryType === 'shopping') {
            return await shoppingHandler.query(parameters, user, group);
        } else if (queryType === 'calendar') {
            return await calendarHandler.query(parameters, user, group);
        } else if (queryType === 'all') {
            // Combine results from all modules
            const [todoResult, shoppingResult, calendarResult] = await Promise.all([
                todoHandler.query(parameters, user, group).catch(() => ({ success: true, message: '', todos: [] })),
                shoppingHandler.query(parameters, user, group).catch(() => ({ success: true, message: '', items: [] })),
                calendarHandler.query(parameters, user, group).catch(() => ({ success: true, message: '', events: [] }))
            ]);
            
            // Combine messages
            const messages: string[] = [];
            if (todoResult.message && !todoResult.message.includes('לא נמצאו')) {
                messages.push(todoResult.message);
            }
            if (shoppingResult.message && !shoppingResult.message.includes('ריקה')) {
                messages.push(shoppingResult.message);
            }
            if (calendarResult.message && !calendarResult.message.includes('לא נמצאו')) {
                messages.push(calendarResult.message);
            }
            
            if (messages.length === 0) {
                return {
                    success: true,
                    message: 'לא נמצאו פריטים.'
                };
            }
            
            return {
                success: true,
                message: messages.join('\n\n')
            };
        } else {
            throw new Error(`Unknown query type: ${queryType}`);
        }
    }
};
