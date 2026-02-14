#!/bin/bash

# Setup script for Telegram Bot Assistant systemd service
# Run this script from the project directory

set -e

echo "🚀 Setting up Telegram Bot Assistant as a systemd service..."

# Get current directory
PROJECT_DIR=$(pwd)
USER=$(whoami)
NODE_PATH=$(which node)

if [ -z "$NODE_PATH" ]; then
    echo "❌ Error: Node.js not found in PATH"
    echo "   Please install Node.js or update the service file manually"
    exit 1
fi

echo "📋 Configuration:"
echo "   Project Directory: $PROJECT_DIR"
echo "   User: $USER"
echo "   Node.js Path: $NODE_PATH"
echo ""

# Check if .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "⚠️  Warning: .env file not found in $PROJECT_DIR"
    echo "   Please create .env file before starting the service"
fi

# Check if dist directory exists
if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "⚠️  Warning: dist directory not found"
    echo "   Building project..."
    npm run build
fi

# Create service file with correct paths
SERVICE_FILE="/tmp/telegram-bot-assistant.service"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Telegram Bot Assistant - Daily Assistant Bot
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment="NODE_ENV=production"
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=$NODE_PATH $PROJECT_DIR/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=telegram-bot-assistant

# Security settings
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service file created at $SERVICE_FILE"
echo ""
echo "📝 Next steps:"
echo "   1. Review the service file:"
echo "      cat $SERVICE_FILE"
echo ""
echo "   2. Copy to systemd directory:"
echo "      sudo cp $SERVICE_FILE /etc/systemd/system/telegram-bot-assistant.service"
echo ""
echo "   3. Reload systemd:"
echo "      sudo systemctl daemon-reload"
echo ""
echo "   4. Enable and start the service:"
echo "      sudo systemctl enable telegram-bot-assistant.service"
echo "      sudo systemctl start telegram-bot-assistant.service"
echo ""
echo "   5. Check status:"
echo "      sudo systemctl status telegram-bot-assistant.service"
echo ""
echo "   6. View logs:"
echo "      sudo journalctl -u telegram-bot-assistant -f"
echo ""

read -p "Do you want to install the service now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Installing service..."
    sudo cp "$SERVICE_FILE" /etc/systemd/system/telegram-bot-assistant.service
    sudo systemctl daemon-reload
    echo "✅ Service installed!"
    echo ""
    read -p "Do you want to enable and start the service now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo systemctl enable telegram-bot-assistant.service
        sudo systemctl start telegram-bot-assistant.service
        echo "✅ Service enabled and started!"
        echo ""
        echo "📊 Service status:"
        sudo systemctl status telegram-bot-assistant.service --no-pager
    fi
fi

echo ""
echo "✨ Setup complete!"
