import { RowDataPacket } from 'mysql2';

export interface User extends RowDataPacket {
    id: number;
    telegram_user_id: number;
    telegram_username: string | null;
    display_name: string | null;
    custom_name: string | null;
    timezone: string;
    created_at: Date;
    updated_at: Date;
}

export interface Group extends RowDataPacket {
    id: number;
    telegram_chat_id: number;
    group_name: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface GroupMember extends RowDataPacket {
    id: number;
    group_id: number;
    user_id: number;
    joined_at: Date;
}

export interface Todo extends RowDataPacket {
    id: number;
    user_id: number | null;
    group_id: number | null;
    assigned_user_ids: string | null; // JSON string in DB
    task: string;
    priority: 'low' | 'medium' | 'high';
    deadline: Date | null;
    completed: boolean;
    created_by: number;
    created_at: Date;
    updated_at: Date;
}

export interface TodoWithParsedIds extends Omit<Todo, 'assigned_user_ids'> {
    assigned_user_ids: number[] | null; // Parsed from JSON
}

export interface ShoppingItem extends RowDataPacket {
    id: number;
    user_id: number | null;
    group_id: number | null;
    assigned_user_ids: string | null; // JSON string in DB
    item: string;
    category: string | null;
    amount: string | null;
    purchased: boolean;
    purchased_by: number | null;
    created_by: number;
    created_at: Date;
    updated_at: Date;
}

export interface ShoppingItemWithParsedIds extends Omit<ShoppingItem, 'assigned_user_ids'> {
    assigned_user_ids: number[] | null; // Parsed from JSON
}

export interface CalendarEvent extends RowDataPacket {
    id: number;
    user_id: number | null;
    group_id: number | null;
    assigned_user_ids: string | null; // JSON string in DB
    title: string;
    description: string | null;
    start_time: Date;
    end_time: Date | null;
    created_by: number;
    created_at: Date;
    updated_at: Date;
}

export interface CalendarEventWithParsedIds extends Omit<CalendarEvent, 'assigned_user_ids'> {
    assigned_user_ids: number[] | null; // Parsed from JSON
}

export interface MessageAudit extends RowDataPacket {
    id: number;
    telegram_message_id: number;
    user_id: number;
    group_id: number | null;
    chat_id: number;
    message_text: string;
    message_type: string;
    received_at: Date;
}

export interface LLMAudit extends RowDataPacket {
    id: number;
    message_audit_id: number;
    user_id: number;
    group_id: number | null;
    prompt: string;
    llm_response: string;
    parsed_action: string | null; // JSON string
    tokens_used: number | null;
    model: string | null;
    response_time_ms: number | null;
    error: string | null;
    created_at: Date;
}

export interface CreateUserData {
    telegramUserId: number;
    telegramUsername?: string | null;
    displayName?: string | null;
    customName?: string | null;
    timezone?: string;
}

export interface UpdateUserData {
    telegramUsername?: string;
    displayName?: string;
    customName?: string;
    timezone?: string;
}

export interface CreateGroupData {
    telegramChatId: number;
    groupName?: string | null;
}

export interface UpdateGroupData {
    groupName?: string;
}

export interface CreateTodoData {
    userId?: number | null;
    groupId?: number | null;
    assignedUserIds?: number[] | null;
    task: string;
    priority?: 'low' | 'medium' | 'high';
    deadline?: Date | null;
    createdBy: number;
}

export interface UpdateTodoData {
    task?: string;
    priority?: 'low' | 'medium' | 'high';
    deadline?: Date | null;
    completed?: boolean;
    assignedUserIds?: number[] | null;
}

export interface CreateShoppingItemData {
    userId?: number | null;
    groupId?: number | null;
    assignedUserIds?: number[] | null;
    item: string;
    category?: string | null;
    amount?: string | null;
    createdBy: number;
}

export interface UpdateShoppingItemData {
    item?: string;
    category?: string | null;
    amount?: string | null;
    purchased?: boolean;
    purchasedBy?: number | null;
    assignedUserIds?: number[] | null;
}

export interface CreateCalendarEventData {
    userId?: number | null;
    groupId?: number | null;
    assignedUserIds?: number[] | null;
    title: string;
    description?: string | null;
    startTime: Date;
    endTime?: Date | null;
    createdBy: number;
}

export interface UpdateCalendarEventData {
    title?: string;
    description?: string | null;
    startTime?: Date;
    endTime?: Date | null;
    assignedUserIds?: number[] | null;
}

export interface ParsedAction {
    action: 'todo' | 'shopping' | 'calendar' | 'query' | 'user';
    operation: 'create' | 'update' | 'delete' | 'list' | 'mark_complete' | 'mark_purchased' | 'set_name';
    scope?: 'me' | 'all_of_us' | 'me_and_x';
    scope_users?: string[];
    parameters: {
        id?: number;
        task?: string;
        priority?: 'low' | 'medium' | 'high';
        deadline?: string;
        item?: string;
        items?: string[];
        category?: string;
        amount?: string;
        title?: string;
        description?: string;
        start_time?: string;
        end_time?: string;
        date?: string;
        startDate?: string; // For date ranges (e.g., "this week")
        endDate?: string; // For date ranges
        queryType?: 'all' | 'todos' | 'shopping' | 'calendar'; // What to query (default: 'all')
        name?: string;
    };
}

export interface ScopeData {
    userId: number | null;
    groupId: number | null;
    assignedUserIds: number[] | null;
    userNames?: Array<{ id: number; name: string }>;
}

export interface HandlerContext {
    user: User;
    group: Group | null;
    isGroup: boolean;
    scopeData?: ScopeData | null;
}

export interface LLMContext {
    userId: number;
    groupId: number | null;
    isGroup: boolean;
    currentUserName: string;
    availableUsers: Array<{ id: number; name: string }>;
    currentDate: string; // Current date in user's timezone (YYYY-MM-DD)
    currentDateTime: string; // Current date and time in user's timezone (YYYY-MM-DD HH:MM:SS)
    userTimezone: string; // User's timezone
}

export interface HandlerResult {
    success: boolean;
    message: string;
    [key: string]: any;
}

export interface QueryOptions {
    includeCompleted?: boolean;
    includePurchased?: boolean;
    deadline?: string | null;
    date?: string | null;
    category?: string | null;
    startDate?: string | null;
    endDate?: string | null;
}
