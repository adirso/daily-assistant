import cron from 'node-cron';
import { sendResponse } from '../bot/telegram.js';
import { UserModel } from '../models/user.js';
import { TodoModel } from '../models/todo.js';
import { CalendarEventModel } from '../models/calendar.js';
import { MessageAuditModel } from '../models/audit.js';
import { timezoneUtils } from '../utils/timezone.js';

/**
 * Scheduler service for sending notifications
 */
export const schedulerService = {
    /**
     * Initialize and start all scheduled tasks
     */
    start(): void {
        console.log('📅 Starting scheduler service...');

        // Daily at 8:00 AM - Today's events and todos
        // Run every hour and check each user's timezone to send at their 8 AM
        cron.schedule('0 * * * *', () => {
            this.sendDailyNotifications();
        });

        // Weekly on Sunday - This week's events
        // Run every hour on Sunday and check each user's timezone to send at their 8 AM
        cron.schedule('0 * * * 0', () => {
            this.sendWeeklyNotifications();
        });

        // Every minute - Check for upcoming deadlines and events (15 min before)
        cron.schedule('* * * * *', () => {
            this.checkUpcomingDeadlines();
            this.checkUpcomingEvents();
        });

        console.log('✅ Scheduler service started');
    },

    /**
     * Send daily notifications for today's events and todos
     */
    async sendDailyNotifications(): Promise<void> {
        try {
            const usersWithChatIds = await MessageAuditModel.getAllUsersWithChatIds();
            
            for (const { userId, chatId } of usersWithChatIds) {
                const user = await UserModel.findById(userId);
                if (!user) continue;

                const userTimezone = user.timezone || 'UTC';
                const now = new Date();
                const currentHour = parseInt(timezoneUtils.toUserTimezone(now, userTimezone)?.split(' ')[1]?.split(':')[0] || '0');
                
                // Only send at 8:00 AM in user's timezone
                if (currentHour !== 8) continue;

                // Get today's date in user's timezone
                const today = timezoneUtils.getToday(userTimezone);

                // Get today's events
                const events = await CalendarEventModel.findByUser(userId, {
                    date: today
                });

                // Get today's todos (with deadline today or no deadline)
                const allTodos = await TodoModel.findByUser(userId, {
                    includeCompleted: false
                });
                
                // Filter todos for today (deadline today or no deadline)
                const todos = allTodos.filter(todo => {
                    if (!todo.deadline) return true; // Include todos without deadlines
                    const todoDate = timezoneUtils.toUserTimezone(todo.deadline, userTimezone)?.split(' ')[0];
                    return todoDate === today;
                });

                let message = '📅 התראות יומיות:\n\n';

                // Format events
                if (events.length > 0) {
                    message += `📅 אירועים היום:\n`;
                    events.forEach((event, index) => {
                        const startTime = timezoneUtils.toUserTimezone(event.start_time, userTimezone);
                        const endTime = event.end_time 
                            ? timezoneUtils.toUserTimezone(event.end_time, userTimezone)
                            : null;
                        const timeText = endTime ? `${startTime} - ${endTime}` : startTime;
                        message += `${index + 1}. ${event.title} - ${timeText}\n`;
                    });
                    message += '\n';
                }

                // Format todos
                if (todos.length > 0) {
                    message += `📝 משימות היום:\n`;
                    todos.forEach((todo, index) => {
                        const priorityEmoji: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
                        const deadlineText = todo.deadline 
                            ? ` (תאריך יעד: ${timezoneUtils.toUserTimezone(todo.deadline, userTimezone)})`
                            : '';
                        message += `${index + 1}. ${priorityEmoji[todo.priority]} ${todo.task}${deadlineText}\n`;
                    });
                    message += '\n';
                }

                if (events.length === 0 && todos.length === 0) {
                    message = '📅 אין אירועים או משימות היום. יום נעים!';
                }

                try {
                    await sendResponse(chatId, message);
                } catch (error) {
                    console.error(`Error sending daily notification to user ${userId}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in sendDailyNotifications:', error);
        }
    },

    /**
     * Send weekly notifications for this week's events (every Sunday)
     */
    async sendWeeklyNotifications(): Promise<void> {
        try {
            const usersWithChatIds = await MessageAuditModel.getAllUsersWithChatIds();
            
            for (const { userId, chatId } of usersWithChatIds) {
                const user = await UserModel.findById(userId);
                if (!user) continue;

                const userTimezone = user.timezone || 'UTC';
                const now = new Date();
                const currentHour = parseInt(timezoneUtils.toUserTimezone(now, userTimezone)?.split(' ')[1]?.split(':')[0] || '0');
                const currentDay = new Date(timezoneUtils.toUserTimezone(now, userTimezone) || now.toISOString()).getDay();
                
                // Only send on Sunday at 8:00 AM in user's timezone
                if (currentDay !== 0 || currentHour !== 8) continue;

                const dateRange = timezoneUtils.parseDateRange('this week', userTimezone);
                if (!dateRange) continue;

                // Get this week's events
                const startDateTime = dateRange.startDate + ' 00:00:00';
                const endDateTime = dateRange.endDate + ' 23:59:59';
                const startDateUTC = timezoneUtils.toUTC(startDateTime, userTimezone);
                const endDateUTC = timezoneUtils.toUTC(endDateTime, userTimezone);

                const events = await CalendarEventModel.findByUser(userId, {
                    startDate: startDateUTC || undefined,
                    endDate: endDateUTC || undefined
                });

                if (events.length === 0) {
                    continue; // Don't send if no events
                }

                let message = '📅 אירועים השבוע:\n\n';
                events.forEach((event, index) => {
                    const startTime = timezoneUtils.toUserTimezone(event.start_time, userTimezone);
                    const endTime = event.end_time 
                        ? timezoneUtils.toUserTimezone(event.end_time, userTimezone)
                        : null;
                    const timeText = endTime ? `${startTime} - ${endTime}` : startTime;
                    message += `${index + 1}. ${event.title} - ${timeText}\n`;
                });

                try {
                    await sendResponse(chatId, message);
                } catch (error) {
                    console.error(`Error sending weekly notification to user ${userId}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in sendWeeklyNotifications:', error);
        }
    },

    /**
     * Check for todos with deadlines approaching (15 minutes before)
     */
    async checkUpcomingDeadlines(): Promise<void> {
        try {
            const usersWithChatIds = await MessageAuditModel.getAllUsersWithChatIds();
            const now = new Date();
            const targetTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now

            for (const { userId, chatId } of usersWithChatIds) {
                const user = await UserModel.findById(userId);
                if (!user) continue;

                const userTimezone = user.timezone || 'UTC';
                
                // Get all incomplete todos with deadlines
                const todos = await TodoModel.findByUser(userId, {
                    includeCompleted: false
                });

                const upcomingTodos = todos.filter(todo => {
                    if (!todo.deadline) return false;
                    
                    const deadline = new Date(todo.deadline);
                    
                    // Check if deadline is within 14-16 minutes from now (to account for minute precision)
                    const diffMinutes = Math.abs((deadline.getTime() - targetTime.getTime()) / (1000 * 60));
                    return diffMinutes >= 14 && diffMinutes <= 16;
                });

                if (upcomingTodos.length > 0) {
                    let message = '⏰ תזכורת - משימות עם תאריך יעד בעוד 15 דקות:\n\n';
                    upcomingTodos.forEach((todo, index) => {
                        const priorityEmoji: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
                        const deadlineText = timezoneUtils.toUserTimezone(todo.deadline, userTimezone);
                        message += `${index + 1}. ${priorityEmoji[todo.priority]} ${todo.task}\n`;
                        message += `   תאריך יעד: ${deadlineText}\n\n`;
                    });

                    try {
                        await sendResponse(chatId, message);
                    } catch (error) {
                        console.error(`Error sending deadline notification to user ${userId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error in checkUpcomingDeadlines:', error);
        }
    },

    /**
     * Check for events starting soon (15 minutes before)
     */
    async checkUpcomingEvents(): Promise<void> {
        try {
            const usersWithChatIds = await MessageAuditModel.getAllUsersWithChatIds();
            const now = new Date();
            const targetTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now

            for (const { userId, chatId } of usersWithChatIds) {
                const user = await UserModel.findById(userId);
                if (!user) continue;

                const userTimezone = user.timezone || 'UTC';
                
                // Get upcoming events (next 24 hours to catch events starting soon)
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                const startDateUTC = timezoneUtils.toUTC(
                    timezoneUtils.toUserTimezone(now, userTimezone) || '',
                    userTimezone
                );
                const endDateUTC = timezoneUtils.toUTC(
                    timezoneUtils.toUserTimezone(tomorrow, userTimezone) || '',
                    userTimezone
                );

                const events = await CalendarEventModel.findByUser(userId, {
                    startDate: startDateUTC || undefined,
                    endDate: endDateUTC || undefined
                });

                const upcomingEvents = events.filter(event => {
                    const startTime = new Date(event.start_time);
                    // Check if event starts within 14-16 minutes from now (to account for minute precision)
                    const diffMinutes = Math.abs((startTime.getTime() - targetTime.getTime()) / (1000 * 60));
                    return diffMinutes >= 14 && diffMinutes <= 16;
                });

                if (upcomingEvents.length > 0) {
                    let message = '⏰ תזכורת - אירועים בעוד 15 דקות:\n\n';
                    upcomingEvents.forEach((event, index) => {
                        const startTime = timezoneUtils.toUserTimezone(event.start_time, userTimezone);
                        const endTime = event.end_time 
                            ? timezoneUtils.toUserTimezone(event.end_time, userTimezone)
                            : null;
                        const timeText = endTime ? `${startTime} - ${endTime}` : startTime;
                        message += `${index + 1}. ${event.title} - ${timeText}\n`;
                        if (event.description) {
                            message += `   ${event.description}\n`;
                        }
                        message += '\n';
                    });

                    try {
                        await sendResponse(chatId, message);
                    } catch (error) {
                        console.error(`Error sending event notification to user ${userId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error in checkUpcomingEvents:', error);
        }
    }
};
