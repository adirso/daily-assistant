import OpenAI from 'openai';
import dotenv from 'dotenv';
import { auditService } from '../services/auditService.js';
import type { LLMContext, ParsedAction } from '../types/index.js';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
}

const openai = new OpenAI({ apiKey });

/**
 * Create prompt for action extraction
 */
function createPrompt(messageText: string, context: LLMContext): string {
    const { isGroup, availableUsers, currentUserName, currentDate, currentDateTime, userTimezone } = context;
    
    let prompt = `You are a Telegram bot assistant that helps users manage todos, shopping lists, and calendar events.

User's message: "${messageText}"

Context:
- Chat type: ${isGroup ? 'group chat' : 'private chat'}
- Current user: ${currentUserName}
- Current date (user's timezone): ${currentDate}
- Current date and time (user's timezone): ${currentDateTime}
- User's timezone: ${userTimezone}
`;

    if (isGroup && availableUsers && availableUsers.length > 0) {
        prompt += `- Available users in group: ${availableUsers.map(u => u.name).join(', ')}\n`;
    }

    prompt += `
You need to extract the action and parameters from the user's message. Return ONLY valid JSON in this exact format:

{
  "action": "todo|shopping|calendar|query|user",
  "operation": "create|update|delete|list|mark_complete|mark_purchased|set_name",
  "scope": "me|all_of_us|me_and_x",
  "scope_users": ["user_name1", "user_name2"],
  "parameters": {
    "id": 1 or null,
    "task": "...",
    "priority": "low|medium|high",
    "deadline": "YYYY-MM-DD HH:MM:SS",
    "item": "...",
    "category": "..." or null,
    "amount": "..." or null,
    "title": "...",
    "description": "...",
    "start_time": "YYYY-MM-DD HH:MM:SS",
    "end_time": "YYYY-MM-DD HH:MM:SS",
    "date": "today|YYYY-MM-DD",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "queryType": "all|todos|shopping|calendar",
    "name": "..."
  }
}

IMPORTANT: For shopping items, ALWAYS include "category" and "amount" fields in parameters, even if they are null.

Action types:
- "todo": Todo list operations
- "shopping": Shopping list operations
- "calendar": Calendar operations
- "query": Questions like "What I need to do today?", "What I have in my calendar today?", "What I need to buy?"
- "user": User management (e.g., "set my name to John")

Operations:
- "create": Add new item
- "update": Modify existing item
- "delete": Remove item
- "list": List items
- "mark_complete": Mark todo as complete
- "mark_purchased": Mark shopping item as purchased
- "set_name": Set user's custom name

For operations requiring ID (mark_complete, delete, update) - CRITICAL - ID EXTRACTION:
- The "id" parameter MUST be a number (integer), not a string
- Extract ID from various formats:
  * "task id 1" or "task 1" or "id 1" -> parameters: { "id": 1 }
  * "task #1" or "#1" -> parameters: { "id": 1 }
  * "the first task" -> parameters: { "id": 1 } (if referring to first task in list)
  * "משימה 1" or "משימה מספר 1" -> parameters: { "id": 1 }
  * "את המשימה 1" -> parameters: { "id": 1 }

For mark_complete operation:
- Recognize completion phrases:
  * English: "finished", "completed", "done", "finished task", "completed task", "done with task", "I finished", "I completed", "I'm done"
  * Hebrew: "סיימתי", "הושלמה", "סיימתי את", "הושלמה המשימה", "סיימתי משימה"
- For marking ALL tasks as complete (CRITICAL - MUST include "id": null in JSON):
  * "I finished all tasks" or "I finished all my tasks" -> action: "todo", operation: "mark_complete", parameters: { "id": null }
  * "I completed all tasks" or "I completed all my tasks" -> action: "todo", operation: "mark_complete", parameters: { "id": null }
  * "I'm done with all tasks" -> action: "todo", operation: "mark_complete", parameters: { "id": null }
  * "סיימתי את כל המשימות" or "סיימתי הכל" or "הושלמו כל המשימות" -> action: "todo", operation: "mark_complete", parameters: { "id": null }
  * "finished everything" or "completed everything" -> action: "todo", operation: "mark_complete", parameters: { "id": null }
  * "I have finished all my tasks" -> action: "todo", operation: "mark_complete", parameters: { "id": null }
- For marking a specific task:
  * "I finished task id 1" -> action: "todo", operation: "mark_complete", parameters: { "id": 1 }
  * "completed task 5" -> action: "todo", operation: "mark_complete", parameters: { "id": 5 }
  * "סיימתי משימה 2" -> action: "todo", operation: "mark_complete", parameters: { "id": 2 }
  * "done with task #3" -> action: "todo", operation: "mark_complete", parameters: { "id": 3 }
- CRITICAL RULE: When user says "all tasks", "all my tasks", "everything", "כל המשימות", "הכל", "כל המשימות שלי" -> you MUST include "id": null in the parameters object. DO NOT omit the id field. The JSON must explicitly contain "id": null.

For delete operation:
- Recognize deletion phrases:
  * English: "delete", "remove", "remove task", "delete task", "cancel task"
  * Hebrew: "מחק", "הסר", "מחק משימה", "הסר משימה", "בטל משימה"
- Examples:
  * "delete task id 1" -> action: "todo", operation: "delete", parameters: { "id": 1 }
  * "remove task 5" -> action: "todo", operation: "delete", parameters: { "id": 5 }
  * "מחק משימה 2" -> action: "todo", operation: "delete", parameters: { "id": 2 }

For update operation:
- Recognize update phrases:
  * English: "update", "change", "modify", "edit"
  * Hebrew: "עדכן", "שנה", "ערוך"
- Examples:
  * "update task id 1 priority to high" -> action: "todo", operation: "update", parameters: { "id": 1, "priority": "high" }
  * "change task 5 deadline to tomorrow" -> action: "todo", operation: "update", parameters: { "id": 5, "deadline": "tomorrow" }

For shopping items - CATEGORY EXTRACTION (CRITICAL - READ CAREFULLY):
- You MUST extract the category field. Category extraction is MANDATORY.
- TWO ways to get category:
  1. EXPLICIT: If the user mentions a category explicitly in the message, extract it
  2. INFERRED: If no category is mentioned, INFER a reasonable category based on the item type

- EXPLICIT category extraction - Look for these indicators:
  * Prepositions: "to", "in", "under", "for", "בקטגוריה", "לקטגוריה", "בתוך" followed by a category name
  * The word "category" or "קטגוריה" followed by a name
  * Common category words: groceries, produce, meat, dairy, beverages, snacks, מוצרי חלב, ירקות, פירות, בשר, etc.
  * Category patterns to recognize:
    - "Add [item] to [category]" -> Extract "[category]" as the category
    - "Add [item] in [category]" -> Extract "[category]" as the category  
    - "Add [item] under [category]" -> Extract "[category]" as the category
    - "Add [item] for [category]" -> Extract "[category]" as the category
    - "Add [item] [category]" (when [category] is a known category word) -> Extract "[category]"
    - "Add [item] in the [category] category" -> Extract "[category]"
    - "Add [item] to my [category] list" -> Extract "[category]"

- INFERRED category extraction - When NO category is mentioned, infer based on item type:
  * Common item-to-category mappings - ALWAYS use HEBREW category names:
    - Milk, חלב, מילקי, yogurt, cheese, butter -> "מוצרי חלב"
    - Bread, לחם, rolls, bagels -> "מאפייה"
    - Carrots, גזרים, tomatoes, cucumbers, lettuce, vegetables -> "ירקות"
    - Apples, תפוחים, bananas, oranges, fruits -> "פירות"
    - Chicken, עוף, beef, meat, בשר -> "בשר"
    - Eggs, ביצים -> "מוצרי חלב"
    - Rice, אורז, pasta, noodles -> "מזווה"
    - Water, מים, juice, soda, drinks -> "משקאות"
    - Chips, snacks, cookies -> "חטיפים"
  * If you cannot infer a category, use "כללי" as a fallback
  * NEVER set category to null unless absolutely impossible to infer
  * ALWAYS use Hebrew category names (מוצרי חלב, מאפייה, ירקות, פירות, בשר, מזווה, משקאות, חטיפים, כללי)

- CRITICAL EXAMPLES (study these carefully):
  * User: "Add milk to groceries" -> MUST return: { "item": "milk", "category": "groceries" } (use explicit category if provided)
  * User: "Add milk" or "לקנות חלב" -> MUST return: { "item": "milk" or "חלב", "category": "מוצרי חלב" } (INFERRED - Hebrew category)
  * User: "Add bread" or "לקנות לחם" -> MUST return: { "item": "bread" or "לחם", "category": "מאפייה" } (INFERRED - Hebrew category)
  * User: "Add carrots" or "לקנות גזרים" -> MUST return: { "item": "carrots" or "גזרים", "category": "ירקות" } (INFERRED - Hebrew category)
  * User: "Add bread in food category" -> MUST return: { "item": "bread", "category": "food" } (EXPLICIT - use as provided)
  * User: "Add eggs under produce" -> MUST return: { "item": "eggs", "category": "produce" } (EXPLICIT - use as provided)
  * User: "Add chicken meat" -> MUST return: { "item": "chicken", "category": "בשר" } (INFERRED - Hebrew category)
  * User: "Add 2 liters of milk to groceries" -> MUST return: { "item": "milk", "category": "groceries", "amount": "2 liters" } (EXPLICIT)
  * User: "לקנות 4 גזרים" -> MUST return: { "item": "גזרים", "category": "ירקות", "amount": "4" } (INFERRED - Hebrew category)

- IMPORTANT RULES:
  * When you see "to groceries", "in food", "under produce", etc., the word AFTER the preposition is the category (EXPLICIT - use as provided)
  * When NO category is mentioned, ALWAYS infer a category based on the item type (INFERRED)
  * DO NOT set category to null - always provide either an explicit or inferred category
  * For INFERRED categories, ALWAYS use Hebrew category names: מוצרי חלב, מאפייה, ירקות, פירות, בשר, מזווה, משקאות, חטיפים, כללי
  * For EXPLICIT categories, use the category name as provided by the user (can be in any language)

- ALWAYS extract amount/quantity if mentioned in the message
- Amount can be mentioned as numbers, units, or phrases like: "2 liters", "3 kg", "a dozen", "5 pieces", "500g", etc.
- Examples:
  * "Add 2 liters of milk" -> parameters: { "item": "milk", "amount": "2 liters" }
  * "Add 3 kg of apples" -> parameters: { "item": "apples", "amount": "3 kg" }
  * "Add a dozen eggs" -> parameters: { "item": "eggs", "amount": "a dozen" }
  * "Add 5 bread loaves" -> parameters: { "item": "bread", "amount": "5 loaves" }
  * "Add milk 500ml" -> parameters: { "item": "milk", "amount": "500ml" }
- If no amount is mentioned, set amount to null

Scope (only valid in group chats):
- "me": Personal item for the message sender only
- "all_of_us": Group item visible to all group members
- "me_and_x": Item shared between sender and specified users (use scope_users array)

For shopping items with categories and amounts:
- "Add 2 liters of milk to groceries" -> action: "shopping", operation: "create", parameters: { "item": "milk", "category": "groceries", "amount": "2 liters" }
- "Add bread in the food category" -> action: "shopping", operation: "create", parameters: { "item": "bread", "category": "food" }
- "Add 3 kg of apples under produce" -> action: "shopping", operation: "create", parameters: { "item": "apples", "category": "produce", "amount": "3 kg" }
- "Add a dozen eggs" -> action: "shopping", operation: "create", parameters: { "item": "eggs", "category": "מוצרי חלב", "amount": "a dozen" } (inferred Hebrew category)
- "לקנות חלב" -> action: "shopping", operation: "create", parameters: { "item": "חלב", "category": "מוצרי חלב" } (inferred Hebrew category)
- Extract category from phrases like "in [category]", "to [category]", "under [category]", or explicit mentions
- Extract amount from numbers, units, or quantity phrases
- For inferred categories, ALWAYS use Hebrew category names

For queries:
- CRITICAL: Use "queryType" parameter to specify what to query:
  * "queryType": "calendar" - ONLY calendar events
  * "queryType": "todos" - ONLY todos
  * "queryType": "shopping" - ONLY shopping items
  * "queryType": "all" or omit - ALL items (todos, shopping, calendar)

- "What I need to do today?" -> action: "query", operation: "list", parameters: { "date": "today", "queryType": "todos" }
- "What I have in my calendar today?" -> action: "query", operation: "list", parameters: { "date": "today", "queryType": "calendar" }
- "What I have in my calendar tomorrow?" -> action: "query", operation: "list", parameters: { "date": "tomorrow", "queryType": "calendar" }
- "What I have in my calendar this week?" or "מה יש לי בלוח השנה השבוע?" -> action: "query", operation: "list", parameters: { "startDate": "this week", "endDate": "this week", "queryType": "calendar" } (use "this week" as keyword, system will calculate range)
- "What I have in my calendar next week?" or "מה יש לי בלוח השנה השבוע הבא?" -> action: "query", operation: "list", parameters: { "startDate": "next week", "endDate": "next week", "queryType": "calendar" } (use "next week" as keyword)
- "What I have in my calendar this month?" or "מה יש לי בלוח השנה החודש?" -> action: "query", operation: "list", parameters: { "startDate": "this month", "endDate": "this month", "queryType": "calendar" } (use "this month" as keyword)
- "What I have in my calendar next month?" or "מה יש לי בלוח השנה החודש הבא?" -> action: "query", operation: "list", parameters: { "startDate": "next month", "endDate": "next month", "queryType": "calendar" } (use "next month" as keyword)
- "What I need to buy?" -> action: "query", operation: "list", parameters: { "queryType": "shopping" }
- "What I need to do?" -> action: "query", operation: "list", parameters: { "queryType": "todos" }
- "What do I have today?" -> action: "query", operation: "list", parameters: { "date": "today", "queryType": "all" } (or omit queryType)
- IMPORTANT: When user asks about "calendar" or "לוח שנה", ALWAYS set "queryType": "calendar"
- IMPORTANT: When user asks about "todos" or "משימות", ALWAYS set "queryType": "todos"
- IMPORTANT: When user asks about "shopping" or "קניות", ALWAYS set "queryType": "shopping"
- IMPORTANT: For date ranges like "this week", "next week", "this month", use startDate and endDate parameters instead of date
- IMPORTANT: Calculate the date ranges based on current date (${currentDate}) and user's timezone (${userTimezone})

For marking items as purchased (CRITICAL - recognize both English and Hebrew phrases):
- "I bought X" or "קניתי X" -> action: "shopping", operation: "mark_purchased", parameters: { "item": "X" }
- "I bought X Y Z" or "קניתי X Y Z" -> action: "shopping", operation: "mark_purchased", parameters: { "item": "X, Y, Z" }
- "I bought everything" or "I bought all" or "קניתי הכל" -> action: "shopping", operation: "mark_purchased", parameters: { "item": null } (marks ALL items)
- English phrases to recognize: "I bought", "I purchased", "bought", "purchased", "I got", "got"
- Hebrew phrases to recognize: "קניתי", "קנו", "קנינו", "רכשתי", "רכשנו"
- CRITICAL: When user says "I bought everything", "I bought all", "קניתי הכל", or similar phrases meaning "all items", you MUST set parameters.item to null (not undefined, not empty string, but explicitly null)
- Examples:
  * "I bought milk" -> action: "shopping", operation: "mark_purchased", parameters: { "item": "milk" }
  * "I bought bread and milk" -> action: "shopping", operation: "mark_purchased", parameters: { "item": "bread, milk" }
  * "I bought everything" -> action: "shopping", operation: "mark_purchased", parameters: { "item": null }
  * "I bought all" -> action: "shopping", operation: "mark_purchased", parameters: { "item": null }
  * "קניתי חלב" -> action: "shopping", operation: "mark_purchased", parameters: { "item": "חלב" }
  * "קניתי לחם וחלב" -> action: "shopping", operation: "mark_purchased", parameters: { "item": "לחם, חלב" }
  * "קניתי הכל" -> action: "shopping", operation: "mark_purchased", parameters: { "item": null }

Priority values: "low", "medium", "high"

Date formats (CRITICAL - use the current date provided above):
- Current date context: ${currentDate} (${currentDateTime})
- User's timezone: ${userTimezone}

- For relative dates:
  * "today" or "היום" -> Use "today" (the system will convert to ${currentDate})
  * "tomorrow" or "מחר" -> Calculate tomorrow from current date (${currentDate}) and return as "YYYY-MM-DD"
  * "next week" -> Calculate 7 days from current date and return as "YYYY-MM-DD"
  * "in 3 days" -> Calculate 3 days from current date and return as "YYYY-MM-DD"
  * "Wednesday" or "יום רביעי" -> Find the next Wednesday from current date (${currentDate}) and return as "YYYY-MM-DD"
  * "Wednesday (18.02)" or "יום רביעי (18.02)" -> Parse "18.02" as DD.MM format, determine the year based on current date (${currentDate}), return as "YYYY-MM-DD" (e.g., if current date is 2024-02-13 and user says "18.02", return "2024-02-18")

- For absolute dates:
  * European/Israeli format "DD.MM" or "DD.MM.YYYY" -> Convert to "YYYY-MM-DD" (e.g., "18.02" or "18.02.2024" -> "2024-02-18")
  * US format "MM/DD" or "MM/DD/YYYY" -> Convert to "YYYY-MM-DD"
  * ISO format "YYYY-MM-DD" -> Use as-is
  * Use "YYYY-MM-DD HH:MM:SS" format for date-time (e.g., "2024-02-18 14:30:00")
  * If only date is provided without time, default to "00:00:00" (midnight in user's timezone)

- IMPORTANT: When user says "today" or "היום", use "today" as the date value. The system will convert it to the actual date.
- IMPORTANT: When user says "tomorrow" or "מחר", calculate tomorrow's date based on current date (${currentDate}) and return as "YYYY-MM-DD"
- IMPORTANT: When user provides a date like "18.02" or "Wednesday (18.02)", parse it as DD.MM format and determine the correct year based on current date context
- IMPORTANT: All dates and times returned should be interpreted as being in the user's timezone (${userTimezone}). The system will convert them to UTC for storage.
- IMPORTANT: Always use the current date (${currentDate}) and current time (${currentDateTime}) as reference for relative dates

Return ONLY the JSON object, no additional text or explanation.

REMINDER FOR SHOPPING ITEMS:
- If user says "add [item] to [category]" -> category MUST be "[category]" (EXPLICIT - use as provided)
- If user says "add [item] in [category]" -> category MUST be "[category]" (EXPLICIT - use as provided)
- If user says "add [item] under [category]" -> category MUST be "[category]" (EXPLICIT - use as provided)
- If user says "add [item] for [category]" -> category MUST be "[category]" (EXPLICIT - use as provided)
- If user says "add [item]" with NO category mentioned -> category MUST be INFERRED using HEBREW category names:
  * milk/חלב -> "מוצרי חלב"
  * bread/לחם -> "מאפייה"
  * carrots/גזרים -> "ירקות"
  * apples/תפוחים -> "פירות"
  * chicken/עוף -> "בשר"
  * eggs/ביצים -> "מוצרי חלב"
  * etc.
- NEVER set category to null - always provide either explicit or inferred category
- Always include "category" field in parameters (MANDATORY - never null)
- Always include "amount" field in parameters (use null if not mentioned)

REMINDER FOR "I BOUGHT" / "קניתי":
- Recognize English phrases: "I bought", "I purchased", "bought", "purchased", "I got", "got"
- Recognize Hebrew phrases: "קניתי", "קנו", "קנינו", "רכשתי", "רכשנו"
- "I bought [item]" or "קניתי [item]" -> action: "shopping", operation: "mark_purchased", parameters: { "item": "[item]" }
- "I bought everything" or "I bought all" or "קניתי הכל" -> action: "shopping", operation: "mark_purchased", parameters: { "item": null } (MUST be null, not undefined or empty string)`;

    return prompt;
}

interface ParseResult {
    success: boolean;
    action: ParsedAction | null;
    tokensUsed?: number | null;
    model?: string | null;
    error?: string;
}

/**
 * Call OpenAI API to parse message
 */
export async function parseMessage(messageText: string, context: LLMContext, messageAuditId: number): Promise<ParseResult> {
    const prompt = createPrompt(messageText, context);
    
    let parsedAction: ParsedAction | null = null;
    let tokensUsed: number | null = null;
    let model: string | null = null;
    
    try {
        const response = await auditService.logLLMWithTiming(
            messageAuditId,
            context.userId,
            context.groupId,
            prompt,
            async () => {
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful assistant that extracts structured data from user messages. Always return valid JSON only. CRITICAL: For shopping items, you MUST ALWAYS extract the category field. If the user mentions a category explicitly, use that category. If NO category is mentioned, you MUST INFER a reasonable category using HEBREW category names (e.g., milk/חלב -> "מוצרי חלב", bread/לחם -> "מאפייה", carrots/גזרים -> "ירקות", chicken/עוף -> "בשר"). NEVER set category to null. For "I bought" messages (English or Hebrew like "קניתי"), recognize them as mark_purchased operations. When user says "I bought everything" or "I bought all" or "קניתי הכל", set parameters.item to null (not undefined, not empty string, but explicitly null) to mark all items. For "I finished all tasks" or "I completed all my tasks" or similar phrases, set parameters.id to null (not undefined, not 0, but explicitly null) to mark all tasks. Always include category and amount fields in the parameters object. When marking all tasks, ALWAYS include "id": null in the parameters object.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3,
                    response_format: { type: 'json_object' }
                });
                
                const content = completion.choices[0].message.content;
                if (!content) {
                    throw new Error('No content in OpenAI response');
                }
                const usage = completion.usage;
                
                return {
                    response: content,
                    parsedAction: JSON.parse(content) as ParsedAction,
                    usage,
                    model: completion.model
                };
            }
        );
        
        parsedAction = response.parsedAction;
        tokensUsed = response.tokensUsed;
        model = response.model;
        
        // Validate parsed action structure
        if (!parsedAction || !parsedAction.action) {
            throw new Error('Invalid action structure from LLM');
        }
        
        return {
            success: true,
            action: parsedAction,
            tokensUsed,
            model
        };
    } catch (error: any) {
        console.error('Error parsing message with OpenAI:', error);
        
        // Log error to audit
        await auditService.logLLMInteraction({
            messageAuditId,
            userId: context.userId,
            groupId: context.groupId,
            prompt,
            llmResponse: error.message || String(error),
            parsedAction: null,
            tokensUsed,
            model,
            responseTimeMs: null,
            error: error.message || String(error)
        });
        
        return {
            success: false,
            error: error.message || 'Failed to parse message',
            action: null
        };
    }
}
