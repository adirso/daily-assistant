import { UserModel } from '../models/user.js';
import { GroupModel } from '../models/group.js';
import type { User, ScopeData } from '../types/index.js';

export const scopeParser = {
    /**
     * Resolve user names to user IDs
     */
    async resolveUserNames(userNames: string[], groupId: number | null = null): Promise<number[]> {
        const userIds: number[] = [];
        
        for (const name of userNames) {
            // Remove @ if present
            const cleanName = name.replace('@', '').trim();
            
            // Try to find user by name
            let user = await UserModel.findByName(cleanName);
            
            // If in a group and user not found, search within group members
            if (!user && groupId) {
                const groupMembers = await GroupModel.getMembers(groupId);
                user = groupMembers.find(m => 
                    m.custom_name?.toLowerCase() === cleanName.toLowerCase() ||
                    m.display_name?.toLowerCase() === cleanName.toLowerCase() ||
                    m.telegram_username?.toLowerCase() === cleanName.toLowerCase()
                ) || null;
            }
            
            if (user) {
                userIds.push(user.id);
            }
        }
        
        return userIds;
    },

    /**
     * Parse scope and resolve to database structure
     */
    async parseScope(
        scope: 'me' | 'all_of_us' | 'me_and_x',
        scopeUsers: string[],
        currentUserId: number,
        groupId: number | null = null
    ): Promise<ScopeData> {
        const result: ScopeData = {
            userId: null,
            groupId: null,
            assignedUserIds: null
        };

        switch (scope) {
            case 'me':
                result.userId = currentUserId;
                result.groupId = null;
                result.assignedUserIds = null;
                break;

            case 'all_of_us':
                if (!groupId) {
                    throw new Error('"all_of_us" scope requires a group context');
                }
                result.userId = null;
                result.groupId = groupId;
                result.assignedUserIds = null;
                break;

            case 'me_and_x':
                if (!scopeUsers || scopeUsers.length === 0) {
                    throw new Error('"me_and_x" scope requires at least one other user');
                }
                
                // Resolve user names to IDs
                const otherUserIds = await this.resolveUserNames(scopeUsers, groupId);
                
                if (otherUserIds.length === 0) {
                    throw new Error(`Could not find users: ${scopeUsers.join(', ')}`);
                }
                
                // Include current user and resolved users
                result.userId = null;
                result.groupId = groupId; // Keep group context if available
                result.assignedUserIds = [currentUserId, ...otherUserIds];
                break;

            default:
                throw new Error(`Unknown scope: ${scope}`);
        }

        return result;
    },

    /**
     * Get available users for name resolution in a context
     */
    async getAvailableUsers(currentUserId: number, groupId: number | null = null): Promise<User[]> {
        if (groupId) {
            // Return group members
            return await GroupModel.getMembers(groupId);
        } else {
            // Return just the current user
            const user = await UserModel.findById(currentUserId);
            return user ? [user] : [];
        }
    }
};
