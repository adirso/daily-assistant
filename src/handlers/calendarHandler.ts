import { CalendarEventModel } from '../models/calendar.js';
import { timezoneUtils } from '../utils/timezone.js';
import type { ParsedAction, HandlerContext, HandlerResult, User, Group, ScopeData, CalendarEventWithParsedIds } from '../types/index.js';

export const calendarHandler = {
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
            
            case 'delete':
                return await this.delete(parameters);
            
            default:
                throw new Error(`Unknown calendar operation: ${operation}`);
        }
    },
    
    async create(parameters: ParsedAction['parameters'], user: User, scopeData: ScopeData | null): Promise<HandlerResult & { event: CalendarEventWithParsedIds | null }> {
        if (!parameters.title) {
            throw new Error('Title is required');
        }
        
        if (!parameters.start_time) {
            throw new Error('Start time is required');
        }
        
        const userTimezone = user.timezone || 'UTC';
        const startTimeStr = timezoneUtils.toUTC(parameters.start_time, userTimezone);
        const endTimeStr = parameters.end_time 
            ? timezoneUtils.toUTC(parameters.end_time, userTimezone)
            : null;
        
        const startTime = startTimeStr ? new Date(startTimeStr) : new Date();
        const endTime = endTimeStr ? new Date(endTimeStr) : null;
        
        const event = await CalendarEventModel.create({
            userId: scopeData?.userId || null,
            groupId: scopeData?.groupId || null,
            assignedUserIds: scopeData?.assignedUserIds || null,
            title: parameters.title,
            description: parameters.description || null,
            startTime,
            endTime,
            createdBy: user.id
        });
        
        const scopeText = this.getScopeText(scopeData);
        const timeText = endTime 
            ? ` מ-${timezoneUtils.toUserTimezone(startTime, userTimezone)} עד ${timezoneUtils.toUserTimezone(endTime, userTimezone)}`
            : ` ב-${timezoneUtils.toUserTimezone(startTime, userTimezone)}`;
        
        return {
            success: true,
            message: `📅 אירוע נוצר${scopeText}${timeText}: "${event?.title || ''}"`,
            event
        };
    },
    
    async list(user: User, group: Group | null, scopeData: ScopeData | null, parameters: ParsedAction['parameters']): Promise<HandlerResult & { events: CalendarEventWithParsedIds[] }> {
        const userTimezone = user.timezone || 'UTC';
        const date = parameters.date ? timezoneUtils.parseDate(parameters.date, userTimezone) : null;
        
        const events: CalendarEventWithParsedIds[] = [];
        
        // Get personal events
        if (!scopeData || scopeData.userId === user.id) {
            const personalEvents = await CalendarEventModel.findByUser(user.id, {
                date: date || null
            });
            events.push(...personalEvents);
        }
        
        // Get group events if in group
        if (group && scopeData && (scopeData.groupId === group.id || scopeData.assignedUserIds)) {
            if (scopeData.groupId === group.id) {
                // All group events
                const groupEvents = await CalendarEventModel.findByGroup(group.id, {
                    date: date || null
                });
                events.push(...groupEvents);
            }
            
            // Get assigned events
            if (scopeData.assignedUserIds && scopeData.assignedUserIds.includes(user.id)) {
                const assignedEvents = await CalendarEventModel.findByAssignedUser(user.id, {
                    date: date || null
                });
                events.push(...assignedEvents);
            }
        }
        
        // Remove duplicates
        const uniqueEvents = events.filter((event, index, self) =>
            index === self.findIndex(e => e.id === event.id)
        );
        
        // Sort by start time
        uniqueEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        
        if (uniqueEvents.length === 0) {
            const dateText = date === 'today' ? 'היום' : date || 'הבאים';
            return {
                success: true,
                message: `📅 לא נמצאו אירועים ל${dateText}.`,
                events: []
            };
        }
        
        const dateText = date === 'today' ? 'היום' : date || '';
        let message = `📅 האירועים שלך${dateText ? ' ל' + dateText : ''}:\n\n`;
        uniqueEvents.forEach((event, index) => {
            const startTime = timezoneUtils.toUserTimezone(event.start_time, userTimezone);
            const endTime = event.end_time 
                ? timezoneUtils.toUserTimezone(event.end_time, userTimezone)
                : null;
            const timeText = endTime ? `${startTime} - ${endTime}` : startTime;
            message += `${index + 1}. ${event.title} - ${timeText}\n`;
            if (event.description) {
                message += `   ${event.description}\n`;
            }
        });
        
        return {
            success: true,
            message,
            events: uniqueEvents
        };
    },
    
    async update(parameters: ParsedAction['parameters'], user: User): Promise<HandlerResult & { event: CalendarEventWithParsedIds | null }> {
        if (!parameters.id) {
            throw new Error('Event ID is required for update');
        }
        
        const userTimezone = user.timezone || 'UTC';
        const updates: any = {};
        if (parameters.title) updates.title = parameters.title;
        if (parameters.description !== undefined) updates.description = parameters.description;
        if (parameters.start_time) {
            const startTimeStr = timezoneUtils.toUTC(parameters.start_time, userTimezone);
            updates.startTime = startTimeStr ? new Date(startTimeStr) : null;
        }
        if (parameters.end_time !== undefined) {
            const endTimeStr = parameters.end_time 
                ? timezoneUtils.toUTC(parameters.end_time, userTimezone)
                : null;
            updates.endTime = endTimeStr ? new Date(endTimeStr) : null;
        }
        
        const event = await CalendarEventModel.update(parameters.id, updates);
        if (!event) {
            throw new Error('Event not found');
        }
        
        return {
            success: true,
            message: `✅ אירוע עודכן: "${event.title}"`,
            event
        };
    },
    
    async delete(parameters: ParsedAction['parameters']): Promise<HandlerResult> {
        if (!parameters.id) {
            throw new Error('Event ID is required');
        }
        
        const deleted = await CalendarEventModel.delete(parameters.id);
        if (!deleted) {
            throw new Error('Event not found');
        }
        
        return {
            success: true,
            message: '✅ אירוע נמחק'
        };
    },
    
    /**
     * Handle query requests for calendar events
     */
    async query(parameters: ParsedAction['parameters'], user: User, group: Group | null): Promise<HandlerResult & { events: CalendarEventWithParsedIds[] }> {
        const userTimezone = user.timezone || 'UTC';
        const date = parameters?.date || null;
        const startDate = parameters?.startDate || null;
        const endDate = parameters?.endDate || null;
        
        // Parse date or date range
        let parsedDate: string | null = null;
        let parsedStartDate: string | null = null;
        let parsedEndDate: string | null = null;
        
        if (date) {
            parsedDate = timezoneUtils.parseDate(date, userTimezone);
        } else if (startDate || endDate) {
            // If LLM provided startDate/endDate directly, use them
            if (startDate && endDate) {
                // Check if they're date range keywords (like "this week")
                const startRange = timezoneUtils.parseDateRange(startDate, userTimezone);
                const endRange = timezoneUtils.parseDateRange(endDate, userTimezone);
                
                if (startRange && endRange) {
                    parsedStartDate = startRange.startDate;
                    parsedEndDate = endRange.endDate;
                } else {
                    // Parse as individual dates
                    parsedStartDate = timezoneUtils.parseDate(startDate, userTimezone);
                    parsedEndDate = timezoneUtils.parseDate(endDate, userTimezone);
                }
            } else {
                // Single date range keyword (like "this week")
                const dateRangeStr = startDate || endDate || '';
                const dateRange = timezoneUtils.parseDateRange(dateRangeStr, userTimezone);
                if (dateRange) {
                    parsedStartDate = dateRange.startDate;
                    parsedEndDate = dateRange.endDate;
                } else {
                    // Fallback to individual date
                    parsedStartDate = startDate ? timezoneUtils.parseDate(startDate, userTimezone) : null;
                    parsedEndDate = endDate ? timezoneUtils.parseDate(endDate, userTimezone) : null;
                }
            }
        }
        
        const queryOptions: any = {};
        
        if (parsedDate) {
            queryOptions.date = parsedDate;
        } else if (parsedStartDate && parsedEndDate) {
            // Convert to UTC for database queries
            const startDateTime = parsedStartDate + ' 00:00:00';
            const endDateTime = parsedEndDate + ' 23:59:59';
            queryOptions.startDate = timezoneUtils.toUTC(startDateTime, userTimezone);
            queryOptions.endDate = timezoneUtils.toUTC(endDateTime, userTimezone);
        } else if (parsedStartDate) {
            const startDateTime = parsedStartDate + ' 00:00:00';
            queryOptions.startDate = timezoneUtils.toUTC(startDateTime, userTimezone);
        }
        
        const events: CalendarEventWithParsedIds[] = [];
        
        // Get personal events
        const personalEvents = await CalendarEventModel.findByUser(user.id, queryOptions);
        events.push(...personalEvents);
        
        // Get group events if in group
        if (group) {
            const groupEvents = await CalendarEventModel.findByGroup(group.id, queryOptions);
            events.push(...groupEvents);
            
            // Assigned events
            const assignedEvents = await CalendarEventModel.findByAssignedUser(user.id, queryOptions);
            events.push(...assignedEvents);
        }
        
        // Remove duplicates
        const uniqueEvents = events.filter((event, index, self) =>
            index === self.findIndex(e => e.id === event.id)
        );
        
        // Sort by start time
        uniqueEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        
        // Format date text for display
        let dateText = date || '';
        if (dateText === 'today') {
            dateText = 'היום';
        } else if (dateText === 'tomorrow') {
            dateText = 'מחר';
        } else if (dateText.includes('this week') || dateText.includes('השבוע')) {
            dateText = 'השבוע';
        } else if (dateText.includes('next week') || dateText.includes('השבוע הבא')) {
            dateText = 'השבוע הבא';
        } else if (dateText.includes('this month') || dateText.includes('החודש')) {
            dateText = 'החודש';
        } else if (dateText.includes('next month') || dateText.includes('החודש הבא')) {
            dateText = 'החודש הבא';
        } else if (startDate && endDate && startDate === endDate) {
            // Same date range keyword used for both
            const dateRange = timezoneUtils.parseDateRange(startDate, userTimezone);
            if (dateRange) {
                dateText = startDate.includes('week') ? 'השבוע' : startDate.includes('month') ? 'החודש' : '';
            }
        }
        
        if (uniqueEvents.length === 0) {
            return {
                success: true,
                message: `📅 לא נמצאו אירועים${dateText ? ' ל' + dateText : ''}.`,
                events: []
            };
        }
        
        let message = `📅 לוח שנה${dateText ? ' ל' + dateText : ''}:\n`;
        uniqueEvents.forEach((event, index) => {
            const startTime = timezoneUtils.toUserTimezone(event.start_time, userTimezone);
            const endTime = event.end_time 
                ? timezoneUtils.toUserTimezone(event.end_time, userTimezone)
                : null;
            const timeText = endTime ? `${startTime} - ${endTime}` : startTime;
            message += `${index + 1}. ${event.title} - ${timeText}\n`;
        });
        
        return {
            success: true,
            message: message.trim(),
            events: uniqueEvents
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
