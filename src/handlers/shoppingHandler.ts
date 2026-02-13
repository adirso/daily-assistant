import { ShoppingItemModel } from '../models/shopping.js';
import type { ParsedAction, HandlerContext, HandlerResult, User, Group, ScopeData, ShoppingItemWithParsedIds } from '../types/index.js';

export const shoppingHandler = {
    async handle(action: ParsedAction, context: HandlerContext): Promise<HandlerResult> {
        const { user, group, scopeData } = context;
        const { operation, parameters } = action;
        
        switch (operation) {
            case 'create':
                return await this.create(parameters, user, scopeData || null);
            
            case 'list':
                return await this.list(user, group, scopeData || null, parameters);
            
            case 'mark_purchased':
                return await this.markPurchased(parameters, user, group);
            
            case 'update':
                return await this.update(parameters);
            
            case 'delete':
                return await this.delete(parameters);
            
            default:
                throw new Error(`Unknown shopping operation: ${operation}`);
        }
    },
    
    async create(parameters: ParsedAction['parameters'], user: User, scopeData: ScopeData | null): Promise<HandlerResult & { item: ShoppingItemWithParsedIds | null }> {
        if (!parameters.item) {
            throw new Error('Item is required');
        }
        
        // Normalize category and amount - treat empty strings as null
        const category = parameters.category && parameters.category.trim() ? parameters.category.trim() : null;
        const amount = parameters.amount && parameters.amount.trim() ? parameters.amount.trim() : null;
        
        const item = await ShoppingItemModel.create({
            userId: scopeData?.userId || null,
            groupId: scopeData?.groupId || null,
            assignedUserIds: scopeData?.assignedUserIds || null,
            item: parameters.item,
            category: category,
            amount: amount,
            createdBy: user.id
        });
        
        const scopeText = this.getScopeText(scopeData);
        const categoryText = item?.category ? ` (${item.category})` : '';
        const amountText = item?.amount ? ` - ${item.amount}` : '';
        return {
            success: true,
            message: `🛒 פריט נוסף${scopeText}${categoryText}${amountText}: "${item?.item || ''}"`,
            item
        };
    },
    
    async list(user: User, group: Group | null, scopeData: ScopeData | null, parameters: ParsedAction['parameters']): Promise<HandlerResult & { items: ShoppingItemWithParsedIds[] }> {
        const items: ShoppingItemWithParsedIds[] = [];
        
        // Get personal items
        if (!scopeData || scopeData.userId === user.id) {
            const personalItems = await ShoppingItemModel.findByUser(user.id, {
                includePurchased: false,
                category: parameters.category || null
            });
            items.push(...personalItems);
        }
        
        // Get group items if in group
        if (group && scopeData && (scopeData.groupId === group.id || scopeData.assignedUserIds)) {
            if (scopeData.groupId === group.id) {
                // All group items
                const groupItems = await ShoppingItemModel.findByGroup(group.id, {
                    includePurchased: false,
                    category: parameters.category || null
                });
                items.push(...groupItems);
            }
            
            // Get assigned items
            if (scopeData.assignedUserIds && scopeData.assignedUserIds.includes(user.id)) {
                const assignedItems = await ShoppingItemModel.findByAssignedUser(user.id, {
                    includePurchased: false,
                    category: parameters.category || null
                });
                items.push(...assignedItems);
            }
        }
        
        // Remove duplicates
        const uniqueItems = items.filter((item, index, self) =>
            index === self.findIndex(i => i.id === item.id)
        );
        
        // Group by category
        const byCategory: Record<string, ShoppingItemWithParsedIds[]> = {};
        uniqueItems.forEach(item => {
            const category = item.category || 'ללא קטגוריה';
            if (!byCategory[category]) {
                byCategory[category] = [];
            }
            byCategory[category].push(item);
        });
        
        if (uniqueItems.length === 0) {
            return {
                success: true,
                message: '🛒 רשימת הקניות ריקה.',
                items: []
            };
        }
        
        let message = '🛒 רשימת קניות:\n\n';
        Object.keys(byCategory).sort().forEach(category => {
            message += `📦 ${category}:\n`;
            byCategory[category].forEach(item => {
                message += `  • ${item.item}\n`;
            });
            message += '\n';
        });
        
        return {
            success: true,
            message,
            items: uniqueItems
        };
    },
    
    async markPurchased(parameters: ParsedAction['parameters'], user: User, group: Group | null): Promise<HandlerResult & { items?: ShoppingItemWithParsedIds[]; item?: ShoppingItemWithParsedIds | null }> {
        // Handle "mark all" - when item is explicitly null (e.g., "קניתי הכל")
        if (parameters.item === null || (parameters.item === undefined && !parameters.items && !parameters.id)) {
            // Get all unpurchased items for the user/group
            let allItems: ShoppingItemWithParsedIds[];
            if (group) {
                allItems = await ShoppingItemModel.findByGroup(group.id, { includePurchased: false });
            } else {
                allItems = await ShoppingItemModel.findByUser(user.id, { includePurchased: false });
            }
            
            if (allItems.length === 0) {
                return {
                    success: true,
                    message: '✅ אין פריטים לסמן כנרכשו'
                };
            }
            
            // Mark all as purchased
            for (const item of allItems) {
                await ShoppingItemModel.markPurchased(item.id, user.id);
            }
            
            return {
                success: true,
                message: `✅ סומנו ${allItems.length} פריטים כנרכשו`,
                items: allItems
            };
        }
        
        // Handle single item as string (e.g., "קניתי חלב" -> parameters.item = "חלב")
        if (parameters.item && typeof parameters.item === 'string') {
            // Check if it's comma-separated items (e.g., "חלב, לחם")
            const itemNames = parameters.item.split(',').map(name => name.trim()).filter(name => name.length > 0);
            
            const purchasedItems: ShoppingItemWithParsedIds[] = [];
            for (const itemName of itemNames) {
                const items = await ShoppingItemModel.searchByItemName(
                    itemName,
                    group ? null : user.id,
                    group?.id || null
                );
                if (items.length > 0) {
                    // Mark first match as purchased
                    await ShoppingItemModel.markPurchased(items[0].id, user.id);
                    purchasedItems.push(items[0]);
                }
            }
            
            if (purchasedItems.length === 0) {
                return {
                    success: false,
                    message: '❌ לא נמצאו פריטים תואמים לסמן כנרכשו'
                };
            }
            
            return {
                success: true,
                message: `✅ סומנו ${purchasedItems.length} פריטים כנרכשו`,
                items: purchasedItems
            };
        }
        
        // Handle multiple items by name (array)
        if (parameters.items && Array.isArray(parameters.items)) {
            const purchasedItems: ShoppingItemWithParsedIds[] = [];
            for (const itemName of parameters.items) {
                const items = await ShoppingItemModel.searchByItemName(
                    itemName,
                    group ? null : user.id,
                    group?.id || null
                );
                if (items.length > 0) {
                    // Mark first match as purchased
                    await ShoppingItemModel.markPurchased(items[0].id, user.id);
                    purchasedItems.push(items[0]);
                }
            }
            
            if (purchasedItems.length === 0) {
                return {
                    success: false,
                    message: '❌ לא נמצאו פריטים תואמים לסמן כנרכשו'
                };
            }
            
            return {
                success: true,
                message: `✅ סומנו ${purchasedItems.length} פריטים כנרכשו`,
                items: purchasedItems
            };
        }
        
        // Handle single item by ID
        if (parameters.id) {
            const item = await ShoppingItemModel.update(parameters.id, {
                purchased: true,
                purchasedBy: user.id
            });
            if (!item) {
                throw new Error('Item not found');
            }
            
            return {
                success: true,
                message: `✅ פריט סומן כנרכש: "${item.item}"`,
                item
            };
        }
        
        throw new Error('Item ID, item name, items array, or null (for all) is required');
    },
    
    async update(parameters: ParsedAction['parameters']): Promise<HandlerResult & { item: ShoppingItemWithParsedIds | null }> {
        if (!parameters.id) {
            throw new Error('Item ID is required for update');
        }
        
        const updates: any = {};
        if (parameters.item) updates.item = parameters.item;
        if (parameters.category !== undefined) updates.category = parameters.category;
        if (parameters.amount !== undefined) updates.amount = parameters.amount;
        
        const item = await ShoppingItemModel.update(parameters.id, updates);
        if (!item) {
            throw new Error('Item not found');
        }
        
        return {
            success: true,
            message: `✅ פריט עודכן: "${item.item}"`,
            item
        };
    },
    
    async delete(parameters: ParsedAction['parameters']): Promise<HandlerResult> {
        if (!parameters.id) {
            throw new Error('Item ID is required');
        }
        
        const deleted = await ShoppingItemModel.delete(parameters.id);
        if (!deleted) {
            throw new Error('Item not found');
        }
        
        return {
            success: true,
            message: '✅ פריט נמחק'
        };
    },
    
    /**
     * Handle query requests for shopping items
     */
    async query(parameters: ParsedAction['parameters'], user: User, group: Group | null): Promise<HandlerResult & { items: ShoppingItemWithParsedIds[] }> {
        const items: ShoppingItemWithParsedIds[] = [];
        
        // Get personal items
        const personalItems = await ShoppingItemModel.findByUser(user.id, {
            includePurchased: false,
            category: parameters.category || null
        });
        items.push(...personalItems);
        
        // Get group items if in group
        if (group) {
            const groupItems = await ShoppingItemModel.findByGroup(group.id, {
                includePurchased: false,
                category: parameters.category || null
            });
            items.push(...groupItems);
            
            // Assigned items
            const assignedItems = await ShoppingItemModel.findByAssignedUser(user.id, {
                includePurchased: false,
                category: parameters.category || null
            });
            items.push(...assignedItems);
        }
        
        // Remove duplicates
        const uniqueItems = items.filter((item, index, self) =>
            index === self.findIndex(i => i.id === item.id)
        );
        
        // Group by category
        const byCategory: Record<string, ShoppingItemWithParsedIds[]> = {};
        uniqueItems.forEach(item => {
            const category = item.category || 'ללא קטגוריה';
            if (!byCategory[category]) {
                byCategory[category] = [];
            }
            byCategory[category].push(item);
        });
        
        if (uniqueItems.length === 0) {
            return {
                success: true,
                message: '🛒 רשימת הקניות ריקה.',
                items: []
            };
        }
        
        let message = '🛒 רשימת קניות:\n';
        Object.keys(byCategory).sort().forEach(category => {
            message += `📦 ${category}:\n`;
            byCategory[category].forEach(item => {
                const amountText = item.amount ? ` (${item.amount})` : '';
                message += `  • ${item.item}${amountText}\n`;
            });
        });
        
        return {
            success: true,
            message: message.trim(),
            items: uniqueItems
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
