import TelegramBot, { Message } from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { UserModel } from '../models/user.js';
import { GroupModel } from '../models/group.js';
import { auditService } from '../services/auditService.js';
import type { User, Group } from '../types/index.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
}

export const bot = new TelegramBot(token, { polling: true });

interface MessageContext {
    user: User;
    group: Group | null;
    isGroup: boolean;
    messageAuditId: number | null;
    message: Message;
    isNewUser: boolean;
}

/**
 * Ensure user exists in database, create if not
 */
export async function ensureUser(telegramUser: any): Promise<{ user: User; isNew: boolean }> {
    let user = await UserModel.findByTelegramId(telegramUser.id);
    let isNew = false;
    
    if (!user) {
        isNew = true;
        user = await UserModel.create({
            telegramUserId: telegramUser.id,
            telegramUsername: telegramUser.username || null,
            displayName: telegramUser.first_name || telegramUser.last_name 
                ? `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim()
                : null,
            timezone: 'UTC'
        });
    } else {
        // Update user info if changed
        const updates: any = {};
        if (telegramUser.username !== user.telegram_username) {
            updates.telegramUsername = telegramUser.username || null;
        }
        const displayName = telegramUser.first_name || telegramUser.last_name 
            ? `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim()
            : null;
        if (displayName !== user.display_name) {
            updates.displayName = displayName;
        }
        
        if (Object.keys(updates).length > 0) {
            user = await UserModel.update(user.id, updates);
        }
    }
    
    if (!user) {
        throw new Error('Failed to create or update user');
    }
    return { user, isNew };
}

/**
 * Ensure group exists in database, create if not
 */
export async function ensureGroup(chat: any): Promise<Group | null> {
    if (chat.type === 'private') {
        return null; // Not a group
    }
    
    let group = await GroupModel.findByTelegramChatId(chat.id);
    
    if (!group) {
        group = await GroupModel.create({
            telegramChatId: chat.id,
            groupName: chat.title || null
        });
    } else {
        // Update group name if changed
        if (chat.title && chat.title !== group.group_name) {
            group = await GroupModel.update(group.id, { groupName: chat.title });
        }
    }
    
    return group;
}

/**
 * Ensure user is member of group
 */
export async function ensureGroupMember(groupId: number, userId: number): Promise<void> {
    if (!groupId) return;
    
    const isMember = await GroupModel.isMember(groupId, userId);
    if (!isMember) {
        await GroupModel.addMember(groupId, userId);
    }
}

/**
 * Handle incoming message
 */
export async function handleMessage(msg: Message): Promise<MessageContext> {
    try {
        if (!msg.from) {
            throw new Error('Message has no from field');
        }
        
        // Ensure user exists
        const { user, isNew } = await ensureUser(msg.from);
        
        // Determine if group or private chat
        const isGroup = msg.chat.type !== 'private';
        let group: Group | null = null;
        
        if (isGroup) {
            group = await ensureGroup(msg.chat);
            if (group) {
                await ensureGroupMember(group.id, user.id);
            }
        }
        
        // Log message to audit
        const messageAuditId = await auditService.logMessage({
            telegramMessageId: msg.message_id,
            userId: user.id,
            groupId: group?.id || null,
            chatId: msg.chat.id,
            messageText: msg.text || '',
            messageType: msg.text ? 'text' : 'other'
        });
        
        return {
            user,
            group,
            isGroup,
            messageAuditId: messageAuditId || 0,
            message: msg,
            isNewUser: isNew
        };
    } catch (error) {
        console.error('Error handling message:', error);
        throw error;
    }
}

/**
 * Send response message
 */
export async function sendResponse(chatId: number, text: string, options: any = {}): Promise<Message> {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

// Handle bot errors
bot.on('error', (error) => {
    console.error('Telegram bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Telegram bot polling error:', error);
});
