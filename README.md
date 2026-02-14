# Telegram Bot Assistant

A TypeScript-based Telegram bot that helps users manage todos, shopping lists, and calendar events using natural language processing powered by OpenAI GPT-4.

## ✨ Features

- **📝 Todo List Management**: Create, list, update, complete, and delete todos with priorities and deadlines
- **🛒 Shopping List Management**: Add items with categories and amounts, mark as purchased
- **📅 Calendar Management**: Create and manage events with start/end times
- **👥 Multi-User Support**: Works in both private chats and group chats
- **🎯 Group Scoping**: Support for "me", "all of us", and "me and x" scopes
- **🤖 Natural Language Processing**: Uses OpenAI GPT-4 to understand user messages in English and Hebrew
- **⏰ Smart Notifications**: Automatic daily/weekly summaries and 15-minute reminders
- **🌍 Timezone Support**: Per-user and per-group timezone settings (IL/UTC)
- **📊 Audit Logging**: All messages and LLM interactions are logged for debugging and analysis
- **🔄 Automatic Migrations**: Database migrations run automatically on startup

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **MySQL** (v5.7 or higher) - [Download](https://dev.mysql.com/downloads/)
- **Telegram Bot Token** - Get from [@BotFather](https://t.me/botfather) on Telegram
- **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)

## 🚀 Quick Start

### Step 1: Clone the Repository

```bash
git clone git@github.com:adirso/daily-assistant.git
cd daily-assistant
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Or create it manually with the following content:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# MySQL Database Configuration
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=telegram_bot_assistant
DB_PORT=3306
```

**How to get your credentials:**

1. **Telegram Bot Token:**
   - Open Telegram and search for [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow the instructions
   - Copy the token you receive

2. **OpenAI API Key:**
   - Go to [OpenAI Platform](https://platform.openai.com/)
   - Sign in or create an account
   - Navigate to API Keys section
   - Create a new API key

### Step 4: Create MySQL Database

```bash
mysql -u your_db_user -p -e "CREATE DATABASE telegram_bot_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Or using MySQL command line:

```sql
CREATE DATABASE telegram_bot_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 5: Build the Project

```bash
npm run build
```

### Step 6: Start the Bot

```bash
npm start
```

The bot will:
- ✅ Run database migrations automatically
- ✅ Connect to Telegram
- ✅ Start the scheduler service
- ✅ Be ready to receive messages

You should see:
```
🔄 Running database migrations...
✅ Migrations completed, starting bot...
📅 Starting scheduler service...
✅ Scheduler service started
Telegram Bot Assistant is running...
```

## 🛠️ Development

For development with auto-reload:

```bash
npm run dev
```

Other available commands:

```bash
npm run build          # Compile TypeScript to JavaScript
npm run type-check     # Check TypeScript types without building
npm run migrate        # Run migrations manually (usually not needed)
```

## 💬 Usage

### Starting a Conversation

1. Find your bot on Telegram (search for the username you set with BotFather)
2. Start a conversation by sending `/start` or any message
3. The bot will understand natural language in English and Hebrew

### Commands

- `/timezone` - Set your timezone (IL or UTC) with interactive keyboard
- `/setname Your Name` - Set your custom name in the bot

### Example Messages

#### Todo List
```
Add finish report task with high priority
What I need to do today?
Add call client tomorrow at 3pm
I finished task id 1
I finished all my tasks
```

#### Shopping List
```
What I need to buy?
Add milk to shopping list
Add 2 liters of milk
Add eggs in groceries category
I bought milk and bread
I bought everything
```

#### Calendar
```
What I have in my calendar today?
What I have in my calendar this week?
Add meeting tomorrow at 2pm
Add conference from 9am to 5pm on Friday
Add wedding on Wednesday 18.02
```

## 🎯 Scope Behavior

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

## ⏰ Automatic Notifications

The bot automatically sends notifications:

### Daily Notifications (8:00 AM)
- Today's calendar events
- Today's todos (with deadline today or no deadline)

### Weekly Notifications (Sunday 8:00 AM)
- This week's calendar events

### 15-Minute Reminders
- Todos with deadlines approaching (15 minutes before)
- Events starting soon (15 minutes before)

All notifications respect your timezone setting (set via `/timezone` command).

## 🌍 Timezone Support

- Set your timezone using `/timezone` command
- Choose between:
  - 🇮🇱 **IL (Asia/Jerusalem)** - Israel Standard Time
  - 🌍 **UTC** - Coordinated Universal Time
- In group chats, the group timezone is used
- All dates and times are displayed in your timezone

## 📊 Database Schema

The bot uses the following main tables:

- `users` - User information, preferences, and timezone
- `groups` - Telegram group information and timezone
- `group_members` - Group membership tracking
- `todos` - Todo list items with priorities and deadlines
- `shopping_items` - Shopping list items with categories and amounts
- `calendar_events` - Calendar events with start/end times
- `message_audit` - Audit log of all messages
- `llm_audit` - Audit log of all LLM interactions
- `migrations` - Tracks executed database migrations

## 🔍 Audit Logging

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

## 📁 Project Structure

```
daily-assistant/
├── src/                          # TypeScript source files
│   ├── index.ts                  # Main entry point
│   ├── config/
│   │   └── database.ts           # MySQL connection pool
│   ├── bot/
│   │   └── telegram.ts            # Telegram bot setup
│   ├── llm/
│   │   └── openai.ts              # OpenAI integration
│   ├── router/
│   │   └── actionRouter.ts        # Action routing
│   ├── handlers/
│   │   ├── todoHandler.ts         # Todo operations
│   │   ├── shoppingHandler.ts    # Shopping operations
│   │   ├── calendarHandler.ts     # Calendar operations
│   │   ├── queryHandler.ts        # Query handling
│   │   └── userHandler.ts         # User management
│   ├── models/                    # Database models (DAOs)
│   │   ├── user.ts
│   │   ├── group.ts
│   │   ├── todo.ts
│   │   ├── shopping.ts
│   │   ├── calendar.ts
│   │   └── audit.ts
│   ├── services/
│   │   ├── auditService.ts        # Audit logging service
│   │   └── scheduler.ts           # Notification scheduler
│   ├── database/
│   │   └── migrate.ts              # Migration runner
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   └── utils/
│       ├── timezone.ts             # Timezone utilities
│       └── scopeParser.ts          # Scope parsing utilities
├── database/
│   └── migrations/                 # SQL migration files
│       ├── 001_initial_schema.sql
│       ├── 002_add_amount_to_shopping.sql
│       └── 003_add_timezone_to_groups.sql
├── dist/                           # Compiled JavaScript (generated)
├── .env                            # Environment variables (create this)
├── .env.example                    # Environment variables template
├── tsconfig.json                   # TypeScript configuration
├── package.json                    # Node.js dependencies
└── README.md                       # This file
```

## 🔧 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from BotFather | ✅ Yes | - |
| `OPENAI_API_KEY` | Your OpenAI API key | ✅ Yes | - |
| `DB_HOST` | MySQL host address | ✅ Yes | localhost |
| `DB_USER` | MySQL username | ✅ Yes | - |
| `DB_PASSWORD` | MySQL password | ✅ Yes | - |
| `DB_NAME` | Database name | ✅ Yes | telegram_bot_assistant |
| `DB_PORT` | MySQL port | ❌ No | 3306 |

## 📦 Dependencies

### Production
- `node-telegram-bot-api` - Telegram Bot API client
- `openai` - OpenAI SDK for GPT-4
- `mysql2` - MySQL client with promises
- `dotenv` - Environment variable management
- `date-fns-tz` - Timezone handling utilities
- `node-cron` - Cron job scheduler

### Development
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution for development
- `@types/node` - Node.js type definitions
- `@types/node-telegram-bot-api` - Telegram bot type definitions
- `@types/node-cron` - Cron type definitions

## 🐛 Troubleshooting

### Bot not responding
- ✅ Check that `TELEGRAM_BOT_TOKEN` is set correctly in `.env`
- ✅ Verify the bot is running (`npm start`)
- ✅ Check console logs for errors
- ✅ Make sure you've started a conversation with the bot on Telegram

### LLM parsing errors
- ✅ Check that `OPENAI_API_KEY` is set correctly in `.env`
- ✅ Review `llm_audit` table for error messages
- ✅ Ensure you have sufficient OpenAI API credits
- ✅ Check your OpenAI account billing status

### Database connection errors

#### Access Denied Error
If you see `Access denied for user 'username'@'localhost' to database 'telegram_bot_assistant'`:

**Solution 1: Grant permissions to existing user**
```bash
# Login as MySQL root user
mysql -u root -p

# Then run these SQL commands (replace 'your_db_user' with your actual MySQL username):
CREATE DATABASE IF NOT EXISTS telegram_bot_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON telegram_bot_assistant.* TO 'your_db_user'@'localhost';
FLUSH PRIVILEGES;
```

**Solution 2: Create database and user**
```bash
# Login as MySQL root user
mysql -u root -p

# Then run these SQL commands (replace 'your_db_user' and 'your_password_here' with your desired values):
CREATE DATABASE IF NOT EXISTS telegram_bot_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'your_db_user'@'localhost' IDENTIFIED BY 'your_password_here';
GRANT ALL PRIVILEGES ON telegram_bot_assistant.* TO 'your_db_user'@'localhost';
FLUSH PRIVILEGES;
```

**Solution 3: Use root user temporarily**
If you can't grant permissions, you can use the root user in your `.env` file:
```env
DB_USER=root
DB_PASSWORD=your_root_password
```

#### Other database issues
- ✅ Verify MySQL is running: `mysql --version` or `systemctl status mysql`
- ✅ Check database credentials in `.env` match your MySQL setup
- ✅ Ensure database exists: `mysql -u user -p -e "SHOW DATABASES;"`
- ✅ Test connection: `mysql -u user -p -h host database_name`
- ✅ Check MySQL user has CREATE/ALTER permissions for migrations

### Migration errors
- ✅ Check MySQL user has CREATE/ALTER permissions
- ✅ Verify database exists before running migrations
- ✅ Check migration files are in `database/migrations/` directory
- ✅ Review error messages in console output

### TypeScript compilation errors
- ✅ Run `npm install` to ensure all dependencies are installed
- ✅ Check `tsconfig.json` configuration
- ✅ Run `npm run type-check` to see detailed errors

### Notifications not working
- ✅ Verify scheduler service started (check console logs)
- ✅ Check user has sent at least one message (for chat ID discovery)
- ✅ Verify timezone is set correctly (`/timezone` command)
- ✅ Check that todos/events have deadlines/start times set

## 🔐 Security Notes

- ⚠️ **Never commit `.env` file** - It contains sensitive credentials
- ⚠️ **Keep your API keys secure** - Don't share them publicly
- ⚠️ **Use strong database passwords** - Especially in production
- ⚠️ **Limit database user permissions** - Use least privilege principle

## 📝 License

ISC

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🚀 Running as a System Service (Linux/Raspberry Pi)

To run the bot as a systemd service on Linux (e.g., Raspberry Pi):

### Step 1: Build the Project

```bash
npm run build
```

### Step 2: Create Systemd Service File

Copy the service file to systemd directory:

```bash
sudo cp telegram-bot-assistant.service /etc/systemd/system/
```

### Step 3: Edit the Service File

Edit the service file to match your setup:

```bash
sudo nano /etc/systemd/system/telegram-bot-assistant.service
```

Update these paths if needed:
- `User=` - Your Linux username (e.g., `rasp-adir`)
- `WorkingDirectory=` - Full path to your project directory
- `EnvironmentFile=` - Full path to your `.env` file
- `ExecStart=` - Path to node binary (usually `/usr/bin/node`)

### Step 4: Reload Systemd

```bash
sudo systemctl daemon-reload
```

### Step 5: Enable and Start the Service

```bash
# Enable service to start on boot
sudo systemctl enable telegram-bot-assistant.service

# Start the service
sudo systemctl start telegram-bot-assistant.service

# Check status
sudo systemctl status telegram-bot-assistant.service
```

### Managing the Service

```bash
# Start the service
sudo systemctl start telegram-bot-assistant

# Stop the service
sudo systemctl stop telegram-bot-assistant

# Restart the service
sudo systemctl restart telegram-bot-assistant

# Check status
sudo systemctl status telegram-bot-assistant

# View logs
sudo journalctl -u telegram-bot-assistant -f

# View recent logs
sudo journalctl -u telegram-bot-assistant -n 100

# Follow logs in real-time
sudo journalctl -u telegram-bot-assistant -f
```

### Service File Location

The service file template is included in the repository as `telegram-bot-assistant.service`. Make sure to:
- Update paths to match your system
- Ensure the `.env` file is readable by the service user
- Verify Node.js path with `which node`

### Troubleshooting Service Issues

**Service won't start:**
```bash
# Check service status
sudo systemctl status telegram-bot-assistant

# Check logs for errors
sudo journalctl -u telegram-bot-assistant -n 50

# Verify paths in service file
sudo cat /etc/systemd/system/telegram-bot-assistant.service
```

**Permission issues:**
```bash
# Ensure .env file is readable
chmod 600 /home/rasp-adir/Projects/daily-assistant/.env

# Check file ownership
ls -la /home/rasp-adir/Projects/daily-assistant/.env
```

**Node.js not found:**
```bash
# Find Node.js path
which node

# Or use full path in service file
which nodejs  # Some systems use 'nodejs' instead of 'node'
```

## 📞 Support

For issues and questions:
- Check the [Troubleshooting](#-troubleshooting) section
- Review audit logs in the database
- Check console output for error messages
- For service issues, check systemd logs: `sudo journalctl -u telegram-bot-assistant`

---

**Made with ❤️ using TypeScript, Node.js, and OpenAI GPT-4**
