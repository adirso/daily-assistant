import { UserModel } from '../models/user.js';
import type { HandlerResult, User } from '../types/index.js';

export const userHandler = {
    async setCustomName(userId: number, name: string): Promise<HandlerResult & { user: User }> {
        if (!name || name.trim().length === 0) {
            throw new Error('Name cannot be empty');
        }

        const user = await UserModel.update(userId, { customName: name.trim() });
        if (!user) {
            throw new Error('User not found');
        }
        return {
            success: true,
            message: `השם שלך הוגדר ל"${user.custom_name}"`,
            user
        };
    },

    async getUserInfo(userId: number): Promise<{
        id: number;
        telegramUserId: number;
        displayName: string;
        customName: string | null;
        timezone: string;
    }> {
        const user = await UserModel.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const displayName = UserModel.getDisplayName(user);
        return {
            id: user.id,
            telegramUserId: user.telegram_user_id,
            displayName,
            customName: user.custom_name,
            timezone: user.timezone
        };
    }
};
