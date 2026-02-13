import dotenv from 'dotenv';
import { bot, handleMessage, sendResponse } from './bot/telegram.js';
import { parseMessage } from './llm/openai.js';
import { actionRouter } from './router/actionRouter.js';
import { UserModel } from './models/user.js';
import { scopeParser } from './utils/scopeParser.js';
import { timezoneUtils } from './utils/timezone.js';
import { runMigrations } from './database/migrate.js';
import { schedulerService } from './services/scheduler.js';
import type { Message } from 'node-telegram-bot-api';

dotenv.config();

// Run migrations on startup before starting the bot
(async function startBot() {
    try {
        console.log('🔄 Running database migrations...');
        await runMigrations();
        console.log('✅ Migrations completed, starting bot...\n');
        
        // Start bot after migrations complete
        initializeBot();
        
        // Start scheduler service
        schedulerService.start();
    } catch (error) {
        console.error('❌ Failed to run migrations:', error);
        process.exit(1);
    }
})();

function initializeBot() {
    // Handle text messages
    bot.on('message', async (msg: Message) => {
        // Ignore non-text messages for now
        if (!msg.text) {
            return;
        }
        
        // Handle /setname command
        if (msg.text.startsWith('/setname ')) {
            try {
                const context = await handleMessage(msg);
                const name = msg.text.replace('/setname ', '').trim();
                
                if (!name) {
                    await sendResponse(msg.chat.id, 'אנא ספק שם. שימוש: /setname השם שלך');
                    return;
                }
                
                const { userHandler } = await import('./handlers/userHandler.js');
                const result = await userHandler.setCustomName(context.user.id, name);
                await sendResponse(msg.chat.id, result.message);
                return;
            } catch (error: any) {
                console.error('Error handling /setname:', error);
                await sendResponse(msg.chat.id, 'שגיאה בהגדרת השם: ' + (error.message || String(error)));
                return;
            }
        }
        
        // Handle /timezone command
        if (msg.text === '/timezone') {
            try {
                const context = await handleMessage(msg);
                
                // Create keyboard with timezone options
                const keyboard = {
                    reply_markup: {
                        keyboard: [
                            [{ text: '🇮🇱 IL (Asia/Jerusalem)' }],
                            [{ text: '🌍 UTC' }]
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                };
                
                const currentTimezone = context.isGroup && context.group
                    ? (context.group.timezone || 'UTC')
                    : (context.user.timezone || 'UTC');
                
                const timezoneDisplay = currentTimezone === 'Asia/Jerusalem' ? 'IL (Asia/Jerusalem)' : 'UTC';
                await sendResponse(
                    msg.chat.id,
                    `⏰ אזור זמן נוכחי: ${timezoneDisplay}\n\nבחר אזור זמן חדש:`,
                    keyboard
                );
                return;
            } catch (error: any) {
                console.error('Error handling /timezone:', error);
                await sendResponse(msg.chat.id, 'שגיאה בהצגת אפשרויות אזור זמן: ' + (error.message || String(error)));
                return;
            }
        }
        
        // Handle timezone selection from keyboard
        if (msg.text === '🇮🇱 IL (Asia/Jerusalem)' || msg.text === '🌍 UTC') {
            try {
                const context = await handleMessage(msg);
                const { GroupModel } = await import('./models/group.js');
                
                let newTimezone: string;
                if (msg.text === '🇮🇱 IL (Asia/Jerusalem)') {
                    newTimezone = 'Asia/Jerusalem';
                } else {
                    newTimezone = 'UTC';
                }
                
                if (context.isGroup && context.group) {
                    // Update group timezone
                    await GroupModel.update(context.group.id, { timezone: newTimezone });
                    await sendResponse(
                        msg.chat.id,
                        `✅ אזור הזמן של הקבוצה עודכן ל: ${newTimezone === 'Asia/Jerusalem' ? 'IL (Asia/Jerusalem)' : 'UTC'}`,
                        { reply_markup: { remove_keyboard: true } }
                    );
                } else {
                    // Update user timezone
                    await UserModel.update(context.user.id, { timezone: newTimezone });
                    await sendResponse(
                        msg.chat.id,
                        `✅ אזור הזמן שלך עודכן ל: ${newTimezone === 'Asia/Jerusalem' ? 'IL (Asia/Jerusalem)' : 'UTC'}`,
                        { reply_markup: { remove_keyboard: true } }
                    );
                }
                return;
            } catch (error: any) {
                console.error('Error handling timezone selection:', error);
                await sendResponse(msg.chat.id, 'שגיאה בעדכון אזור זמן: ' + (error.message || String(error)));
                return;
            }
        }
        
        // Handle all other messages with LLM
        try {
            // Process message and get context
            const context = await handleMessage(msg);
            
            // Get available users for context
            const availableUsers = await scopeParser.getAvailableUsers(
                context.user.id,
                context.group?.id || null
            );
            const userNames = availableUsers.map(u => ({
                id: u.id,
                name: UserModel.getDisplayName(u)
            }));
            
            // Get user's timezone and current date/time
            const userTimezone = context.user.timezone || 'UTC';
            const currentDate = timezoneUtils.getToday(userTimezone);
            const currentDateTime = timezoneUtils.toUserTimezone(new Date(), userTimezone) || '';
            
            // Prepare LLM context
            const llmContext = {
                userId: context.user.id,
                groupId: context.group?.id || null,
                isGroup: context.isGroup,
                currentUserName: UserModel.getDisplayName(context.user),
                availableUsers: userNames,
                currentDate,
                currentDateTime,
                userTimezone
            };
            
            // Parse message with LLM
            const parseResult = await parseMessage(msg.text, llmContext, context.messageAuditId || 0);
            
            if (!parseResult.success || !parseResult.action) {
                await sendResponse(
                    msg.chat.id,
                    parseResult.error || 'לא הבנתי. תוכל לנסח מחדש?'
                );
                return;
            }
            
            // Route action to appropriate handler
            const result = await actionRouter.route(parseResult.action, {
                user: context.user,
                group: context.group,
                isGroup: context.isGroup
            });
            
            // Send response
            if (result && result.message) {
                await sendResponse(msg.chat.id, result.message);
            } else {
                await sendResponse(msg.chat.id, 'בוצע!');
            }
        } catch (error: any) {
            console.error('Error processing message:', error);
            await sendResponse(
                msg.chat.id,
                'מצטער, נתקלתי בשגיאה בעיבוד הבקשה שלך. אנא נסה שוב.'
            );
        }
    });

    // Handle errors
    bot.on('polling_error', (error) => {
        console.error('Polling error:', error);
    });

    console.log('Telegram Bot Assistant is running...');
}
