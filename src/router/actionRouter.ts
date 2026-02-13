import { todoHandler } from '../handlers/todoHandler.js';
import { shoppingHandler } from '../handlers/shoppingHandler.js';
import { calendarHandler } from '../handlers/calendarHandler.js';
import { queryHandler } from '../handlers/queryHandler.js';
import { userHandler } from '../handlers/userHandler.js';
import { scopeParser } from '../utils/scopeParser.js';
import { UserModel } from '../models/user.js';
import type { ParsedAction, HandlerResult, User, Group } from '../types/index.js';

export const actionRouter = {
    async route(action: ParsedAction, context: { user: User; group: Group | null; isGroup: boolean }): Promise<HandlerResult> {
        const { user, group, isGroup } = context;
        
        try {
            // Handle user actions
            if (action.action === 'user') {
                return await this.handleUserAction(action, user);
            }
            
            // Handle query actions
            if (action.action === 'query') {
                return await queryHandler.handle(action, { user, group, isGroup });
            }
            
            // Parse scope for other actions
            let scopeData = null;
            if (action.scope) {
                const availableUsers = await scopeParser.getAvailableUsers(user.id, group?.id || null);
                const userNames = availableUsers.map(u => ({
                    id: u.id,
                    name: UserModel.getDisplayName(u)
                }));
                
                scopeData = await scopeParser.parseScope(
                    action.scope,
                    action.scope_users || [],
                    user.id,
                    group?.id || null
                );
                
                // Add user names for response formatting
                scopeData.userNames = userNames;
            }
            
            // Route to appropriate handler
            switch (action.action) {
                case 'todo':
                    return await todoHandler.handle(action, { user, group, isGroup, scopeData });
                
                case 'shopping':
                    return await shoppingHandler.handle(action, { user, group, isGroup, scopeData });
                
                case 'calendar':
                    return await calendarHandler.handle(action, { user, group, isGroup, scopeData });
                
                default:
                    throw new Error(`Unknown action: ${action.action}`);
            }
        } catch (error: any) {
            console.error('Error routing action:', error);
            return {
                success: false,
                message: error.message || 'An error occurred processing your request'
            };
        }
    },
    
    async handleUserAction(action: ParsedAction, user: User): Promise<HandlerResult> {
        switch (action.operation) {
            case 'set_name':
                if (action.parameters?.name) {
                    return await userHandler.setCustomName(user.id, action.parameters.name);
                }
                throw new Error('Name is required for set_name operation');
            
            default:
                throw new Error(`Unknown user operation: ${action.operation}`);
        }
    }
};
