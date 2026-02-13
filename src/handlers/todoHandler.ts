import { TodoModel } from '../models/todo.js';
import { timezoneUtils } from '../utils/timezone.js';
import type { ParsedAction, HandlerContext, HandlerResult, User, Group, ScopeData, TodoWithParsedIds } from '../types/index.js';

export const todoHandler = {
    async handle(action: ParsedAction, context: HandlerContext): Promise<HandlerResult> {
        const { user, group, scopeData } = context;
        const { operation, parameters } = action;
        
        switch (operation) {
            case 'create':
                return await this.create(parameters, user, scopeData || null);
            
            case 'list':
                return await this.list(user, group, scopeData || null, parameters);
            
            case 'update':
                return await this.update(parameters, user);
            
            case 'mark_complete':
                return await this.markComplete(parameters);
            
            case 'delete':
                return await this.delete(parameters);
            
            default:
                throw new Error(`Unknown todo operation: ${operation}`);
        }
    },
    
    async create(parameters: ParsedAction['parameters'], user: User, scopeData: ScopeData | null): Promise<HandlerResult & { todo: TodoWithParsedIds | null }> {
        if (!parameters.task) {
            throw new Error('Task is required');
        }
        
        const userTimezone = user.timezone || 'UTC';
        let deadline: Date | null = null;
        if (parameters.deadline) {
            const deadlineStr = timezoneUtils.toUTC(parameters.deadline, userTimezone);
            deadline = deadlineStr ? new Date(deadlineStr) : null;
        }
        
        const todo = await TodoModel.create({
            userId: scopeData?.userId || null,
            groupId: scopeData?.groupId || null,
            assignedUserIds: scopeData?.assignedUserIds || null,
            task: parameters.task,
            priority: parameters.priority || 'medium',
            deadline,
            createdBy: user.id
        });
        
        const scopeText = this.getScopeText(scopeData);
        return {
            success: true,
            message: `✅ משימה נוצרה${scopeText}: "${todo?.task || ''}"`,
            todo
        };
    },
    
    async list(user: User, group: Group | null, scopeData: ScopeData | null, parameters: ParsedAction['parameters']): Promise<HandlerResult & { todos: TodoWithParsedIds[] }> {
        const userTimezone = user.timezone || 'UTC';
        const date = parameters.date ? timezoneUtils.parseDate(parameters.date, userTimezone) : null;
        
        const todos: TodoWithParsedIds[] = [];
        
        // Get personal todos
        if (!scopeData || scopeData.userId === user.id) {
            const personalTodos = await TodoModel.findByUser(user.id, {
                includeCompleted: false,
                deadline: date || null
            });
            todos.push(...personalTodos);
        }
        
        // Get group todos if in group
        if (group && scopeData && (scopeData.groupId === group.id || scopeData.assignedUserIds)) {
            if (scopeData.groupId === group.id) {
                // All group todos
                const groupTodos = await TodoModel.findByGroup(group.id, {
                    includeCompleted: false,
                    deadline: date || null
                });
                todos.push(...groupTodos);
            }
            
            // Get assigned todos
            if (scopeData.assignedUserIds && scopeData.assignedUserIds.includes(user.id)) {
                const assignedTodos = await TodoModel.findByAssignedUser(user.id, {
                    includeCompleted: false,
                    deadline: date || null
                });
                todos.push(...assignedTodos);
            }
        }
        
        // Remove duplicates
        const uniqueTodos = todos.filter((todo, index, self) =>
            index === self.findIndex(t => t.id === todo.id)
        );
        
        // Sort by deadline, priority
        uniqueTodos.sort((a, b) => {
            if (a.deadline && !b.deadline) return -1;
            if (!a.deadline && b.deadline) return 1;
            if (a.deadline && b.deadline) {
                return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
            }
            const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        
        if (uniqueTodos.length === 0) {
            return {
                success: true,
                message: '📝 לא נמצאו משימות.',
                todos: []
            };
        }
        
        const dateText = date === 'today' ? 'היום' : date || '';
        let message = `📝 המשימות שלך${dateText ? ' ל' + dateText : ''}:\n\n`;
        uniqueTodos.forEach((todo, index) => {
            const priorityEmoji: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
            const deadlineText = todo.deadline 
                ? ` (תאריך יעד: ${timezoneUtils.toUserTimezone(todo.deadline, userTimezone)})`
                : '';
            message += `${index + 1}. ${priorityEmoji[todo.priority]} ${todo.task}${deadlineText}\n`;
        });
        
        return {
            success: true,
            message,
            todos: uniqueTodos
        };
    },
    
    async update(parameters: ParsedAction['parameters'], user: User): Promise<HandlerResult & { todo: TodoWithParsedIds | null }> {
        if (!parameters.id) {
            throw new Error('Todo ID is required for update');
        }
        
        const updates: any = {};
        if (parameters.task) updates.task = parameters.task;
        if (parameters.priority) updates.priority = parameters.priority;
        if (parameters.deadline) {
            const deadlineStr = timezoneUtils.toUTC(parameters.deadline, user.timezone || 'UTC');
            updates.deadline = deadlineStr ? new Date(deadlineStr) : null;
        }
        
        const todo = await TodoModel.update(parameters.id, updates);
        if (!todo) {
            throw new Error('Todo not found');
        }
        
        return {
            success: true,
            message: `✅ משימה עודכנה: "${todo.task}"`,
            todo
        };
    },
    
    async markComplete(parameters: ParsedAction['parameters']): Promise<HandlerResult & { todo: TodoWithParsedIds | null }> {
        if (!parameters.id) {
            throw new Error('Todo ID is required');
        }
        
        const todo = await TodoModel.update(parameters.id, { completed: true });
        if (!todo) {
            throw new Error('Todo not found');
        }
        
        return {
            success: true,
            message: `✅ משימה הושלמה: "${todo.task}"`,
            todo
        };
    },
    
    async delete(parameters: ParsedAction['parameters']): Promise<HandlerResult> {
        if (!parameters.id) {
            throw new Error('Todo ID is required');
        }
        
        const deleted = await TodoModel.delete(parameters.id);
        if (!deleted) {
            throw new Error('Todo not found');
        }
        
        return {
            success: true,
            message: '✅ משימה נמחקה'
        };
    },
    
    /**
     * Handle query requests for todos
     */
    async query(parameters: ParsedAction['parameters'], user: User, group: Group | null): Promise<HandlerResult & { todos: TodoWithParsedIds[] }> {
        const userTimezone = user.timezone || 'UTC';
        const date = parameters?.date || null;
        const startDate = parameters?.startDate || null;
        const endDate = parameters?.endDate || null;
        
        // Parse date or date range
        let parsedDate: string | null = null;
        
        if (date) {
            parsedDate = timezoneUtils.parseDate(date, userTimezone);
        } else if (startDate || endDate) {
            // For todos, we use the start date if provided
            const dateRangeStr = startDate || endDate || '';
            const dateRange = timezoneUtils.parseDateRange(dateRangeStr, userTimezone);
            if (dateRange) {
                parsedDate = dateRange.startDate; // Use start of range for todos
            } else {
                parsedDate = startDate ? timezoneUtils.parseDate(startDate, userTimezone) : null;
            }
        }
        
        const todos: TodoWithParsedIds[] = [];
        
        // Get personal todos
        const personalTodos = await TodoModel.findByUser(user.id, {
            includeCompleted: false,
            deadline: parsedDate || null
        });
        todos.push(...personalTodos);
        
        // Get group todos if in group
        if (group) {
            const groupTodos = await TodoModel.findByGroup(group.id, {
                includeCompleted: false,
                deadline: parsedDate || null
            });
            todos.push(...groupTodos);
            
            // Assigned todos
            const assignedTodos = await TodoModel.findByAssignedUser(user.id, {
                includeCompleted: false,
                deadline: parsedDate || null
            });
            todos.push(...assignedTodos);
        }
        
        // Remove duplicates
        const uniqueTodos = todos.filter((todo, index, self) =>
            index === self.findIndex(t => t.id === todo.id)
        );
        
        // Sort by deadline, priority
        uniqueTodos.sort((a, b) => {
            if (a.deadline && !b.deadline) return -1;
            if (!a.deadline && b.deadline) return 1;
            if (a.deadline && b.deadline) {
                return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
            }
            const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        
        // Format response
        let dateText = date || '';
        if (dateText === 'today') {
            dateText = 'היום';
        } else if (dateText === 'tomorrow') {
            dateText = 'מחר';
        } else if (dateText.includes('this week') || dateText.includes('השבוע')) {
            dateText = 'השבוע';
        } else if (dateText.includes('next week') || dateText.includes('השבוע הבא')) {
            dateText = 'השבוע הבא';
        }
        
        if (uniqueTodos.length === 0) {
            return {
                success: true,
                message: `📝 לא נמצאו משימות${dateText ? ' ל' + dateText : ''}.`,
                todos: []
            };
        }
        
        let message = `📝 משימות${dateText ? ' ל' + dateText : ''}:\n`;
        uniqueTodos.forEach((todo, index) => {
            const priorityEmoji: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
            const deadlineText = todo.deadline 
                ? ` (תאריך יעד: ${timezoneUtils.toUserTimezone(todo.deadline, userTimezone)})`
                : '';
            message += `${index + 1}. ${priorityEmoji[todo.priority]} ${todo.task}${deadlineText}\n`;
        });
        
        return {
            success: true,
            message: message.trim(),
            todos: uniqueTodos
        };
    },
    
    getScopeText(scopeData: ScopeData | null): string {
        if (!scopeData) return '';
        if (scopeData.assignedUserIds && scopeData.assignedUserIds.length > 1) {
            return ` עבורך ועבור ${scopeData.assignedUserIds.length - 1} נוספים`;
        }
        if (scopeData.groupId) {
            return ' עבור הקבוצה';
        }
        return '';
    }
};
