# Telegram Bot Assistant

A Node.js Telegram bot that helps users manage todos, shopping lists, and calendar events using natural language processing powered by OpenAI.

## Features

- **Todo List Management**: Create, list, update, and complete todos with priorities and deadlines
- **Shopping List Management**: Add items with categories, mark as purchased
- **Calendar Management**: Create and manage events with start/end times
- **Multi-User Support**: Works in both private chats and group chats
- **Group Scoping**: Support for "me", "all of us", and "me and x" scopes
- **Natural Language Processing**: Uses OpenAI to understand user messages
- **Audit Logging**: All messages and LLM interactions are logged for debugging and analysis

## Prerequisites

- Node.js (v18 or higher)
- MySQL database
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenAI API Key

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Assistant
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp ..env.example .env
```

4. Configure your `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=telegram_bot_assistant
DB_PORT=3306
```

5. Create the MySQL database:
```bash
mysql -u your_db_user -p -e "CREATE DATABASE telegram_bot_assistant;"
```

6. Run the database migration:
```bash
mysql -u your_db_user -p telegram_bot_assistant < database/migrations/001_initial_schema.sql
```

## Usage

1. Start the bot:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

2. Find your bot on Telegram and start a conversation
3. Send natural language messages like:
   - "Add buy milk to my shopping list"
   - "What I need to do today?"
   - "Add team meeting tomorrow at 2pm for all of us"
   - "I bought milk and bread"

## Commands

- `/setname Your Name` - Set your custom name in the bot

## Scope Behavior

### Private Chats
- Only "me" scope is available
- All items are personal to you

### Group Chats
Three scopes are available:

1. **"me"** - Personal item for you only
   - Example: "Add review code to my todo list"
   
2. **"all of us"** - Group item visible to all group members
   - Example: "Add team meeting for all of us"
   
3. **"me and x"** - Item shared between you and specified users
   - Example: "Add design review task for me and John"

## Example Queries

### Todos
- "What I need to do today?"
- "Add finish report task with high priority"
- "Add call client tomorrow at 3pm"
- "Mark todo 1 as complete"

### Shopping List
- "What I need to buy?"
- "Add milk to shopping list"
- "Add eggs in groceries category"
- "I bought milk and bread"

### Calendar
- "What I have in my calendar today?"
- "Add meeting tomorrow at 2pm"
- "Add conference from 9am to 5pm on Friday"

## Database Schema

The bot uses the following main tables:

- `users` - User information and preferences
- `groups` - Telegram group information
- `group_members` - Group membership tracking
- `todos` - Todo list items
- `shopping_items` - Shopping list items
- `calendar_events` - Calendar events
- `message_audit` - Audit log of all messages
- `llm_audit` - Audit log of all LLM interactions

## Audit Logging

All messages and LLM interactions are logged to the database for:
- Debugging parsing issues
- Tracking token usage and costs
- Reviewing user interactions
- Improving prompts based on actual usage

### Query Audit Logs

```sql
-- Find all messages from a user
SELECT * FROM message_audit WHERE user_id = ? ORDER BY received_at DESC;

-- Find LLM interactions with errors
SELECT * FROM llm_audit WHERE error IS NOT NULL;

-- Calculate token usage
SELECT SUM(tokens_used) FROM llm_audit WHERE created_at >= ?;

-- Review failed parses
SELECT * FROM llm_audit WHERE parsed_action IS NULL;
```

## Project Structure

```
Assistant/
├── src/
│   ├── index.js                 # Main entry point
│   ├── config/
│   │   └── database.js          # MySQL connection
│   ├── bot/
│   │   └── telegram.js          # Telegram bot setup
│   ├── llm/
│   │   └── openai.js            # OpenAI integration
│   ├── router/
│   │   └── actionRouter.js      # Action routing
│   ├── handlers/
│   │   ├── todoHandler.js       # Todo operations
│   │   ├── shoppingHandler.js   # Shopping operations
│   │   ├── calendarHandler.js   # Calendar operations
│   │   ├── queryHandler.js      # Query handling
│   │   └── userHandler.js       # User management
│   ├── models/
│   │   ├── user.js              # User model
│   │   ├── group.js             # Group model
│   │   ├── todo.js              # Todo model
│   │   ├── shopping.js          # Shopping model
│   │   ├── calendar.js          # Calendar model
│   │   └── audit.js             # Audit models
│   ├── services/
│   │   └── auditService.js      # Audit logging service
│   └── utils/
│       ├── timezone.js          # Timezone utilities
│       └── scopeParser.js       # Scope parsing utilities
├── database/
│   └── migrations/
│       └── 001_initial_schema.sql
└── package.json
```

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `OPENAI_API_KEY` - Your OpenAI API key
- `DB_HOST` - MySQL host (default: localhost)
- `DB_USER` - MySQL username
- `DB_PASSWORD` - MySQL password
- `DB_NAME` - Database name
- `DB_PORT` - MySQL port (default: 3306)

## Dependencies

- `node-telegram-bot-api` - Telegram Bot API client
- `openai` - OpenAI SDK
- `mysql2` - MySQL client with promises
- `dotenv` - Environment variable management
- `date-fns-tz` - Timezone handling

## Troubleshooting

### Bot not responding
- Check that `TELEGRAM_BOT_TOKEN` is set correctly
- Verify the bot is running and connected to Telegram
- Check console logs for errors

### LLM parsing errors
- Check that `OPENAI_API_KEY` is set correctly
- Review `llm_audit` table for error messages
- Ensure you have sufficient OpenAI API credits

### Database connection errors
- Verify MySQL is running
- Check database credentials in `.env`
- Ensure database and tables exist

## License

ISC
