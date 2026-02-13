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
        
        // Handle /start command - send welcome message
        if (msg.text === '/start') {
            try {
                await handleMessage(msg); // Just ensure user exists
                const welcomeMessage = `👋 שלום! אני העוזר שלך לניהול משימות, קניות ולוח שנה.

📝 **מה אני יכול לעשות:**
• ניהול רשימת משימות (Todos) עם עדיפויות ותאריכי יעד
• ניהול רשימת קניות עם קטגוריות וכמויות
• ניהול לוח שנה עם אירועים ותזכורות

💬 **איך להשתמש:**
פשוט כתוב לי מה אתה רוצה לעשות בעברית או באנגלית, ואני אבין!

**דוגמאות:**
• "מה אני צריך לעשות היום?"
• "הוסף חלב לרשימת הקניות"
• "יש לי פגישה מחר בשעה 14:00"
• "סיימתי משימה מספר 1"
• "קניתי הכל"

⚙️ **פקודות:**
• /timezone - הגדר אזור זמן (IL או UTC)
• /setname השם שלך - הגדר שם מותאם אישית

🎯 **בקבוצות:**
אפשר לנהל פריטים עבור "רק אני", "כולנו" או "אני ו-X"

בואו נתחיל! כתוב לי מה תרצה לעשות.`;
                
                await sendResponse(msg.chat.id, welcomeMessage);
                return;
            } catch (error: any) {
                console.error('Error handling /start:', error);
                return;
            }
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
            
            // Send welcome message for new users
            if (context.isNewUser) {
                const welcomeMessage = `👋 שלום! אני העוזר שלך לניהול משימות, קניות ולוח שנה.

📝 **מה אני יכול לעשות:**
• ניהול רשימת משימות (Todos) עם עדיפויות ותאריכי יעד
• ניהול רשימת קניות עם קטגוריות וכמויות
• ניהול לוח שנה עם אירועים ותזכורות

💬 **איך להשתמש:**
פשוט כתוב לי מה אתה רוצה לעשות בעברית או באנגלית, ואני אבין!

**דוגמאות:**
• "מה אני צריך לעשות היום?"
• "הוסף חלב לרשימת הקניות"
• "יש לי פגישה מחר בשעה 14:00"
• "סיימתי משימה מספר 1"
• "קניתי הכל"

⚙️ **פקודות:**
• /timezone - הגדר אזור זמן (IL או UTC)
• /setname השם שלך - הגדר שם מותאם אישית
• /start - הצג הודעת פתיחה זו

🎯 **בקבוצות:**
אפשר לנהל פריטים עבור "רק אני", "כולנו" או "אני ו-X"

בואו נתחיל! כתוב לי מה תרצה לעשות.`;
                
                await sendResponse(msg.chat.id, welcomeMessage);
            }
            
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
                const errorMessage = `🤔 לא הבנתי את הבקשה שלך.

💡 **מה אני יכול לעשות:**
• ניהול משימות: "הוסף משימה", "מה אני צריך לעשות היום?"
• ניהול קניות: "הוסף חלב", "מה אני צריך לקנות?"
• ניהול לוח שנה: "יש לי פגישה מחר", "מה יש לי בלוח השנה השבוע?"

📝 **דוגמאות:**
• "הוסף משימת בדיקת קוד עם עדיפות גבוהה"
• "הוסף 2 ליטר חלב לרשימת הקניות"
• "יש לי פגישת צוות מחר בשעה 14:00"
• "מה אני צריך לעשות היום?"

נסה לנסח מחדש או כתוב /start לראות את כל האפשרויות.`;
                
                await sendResponse(msg.chat.id, errorMessage);
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
