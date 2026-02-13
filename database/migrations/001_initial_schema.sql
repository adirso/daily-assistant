-- Telegram Bot Assistant Database Schema
-- Version: 1.0.0

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_user_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(100) NULL,
    display_name VARCHAR(100) NULL,
    custom_name VARCHAR(100) NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_telegram_user_id (telegram_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Groups table
CREATE TABLE IF NOT EXISTS `groups` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_chat_id BIGINT UNIQUE NOT NULL,
    group_name VARCHAR(200) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_telegram_chat_id (telegram_chat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_user (group_id, user_id),
    INDEX idx_group_id (group_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Message audit table
CREATE TABLE IF NOT EXISTS message_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_message_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    group_id INT NULL,
    chat_id BIGINT NOT NULL,
    message_text TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    INDEX idx_user_received (user_id, received_at),
    INDEX idx_group_received (group_id, received_at),
    INDEX idx_chat_received (chat_id, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- LLM audit table
CREATE TABLE IF NOT EXISTS llm_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_audit_id INT NOT NULL,
    user_id INT NOT NULL,
    group_id INT NULL,
    prompt TEXT NOT NULL,
    llm_response TEXT NOT NULL,
    parsed_action JSON NULL,
    tokens_used INT NULL,
    model VARCHAR(50) NULL,
    response_time_ms INT NULL,
    error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_audit_id) REFERENCES message_audit(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    INDEX idx_message_audit_id (message_audit_id),
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_group_created (group_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Todos table
CREATE TABLE IF NOT EXISTS todos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    group_id INT NULL,
    assigned_user_ids JSON NULL,
    task VARCHAR(500) NOT NULL,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    deadline DATETIME NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_group_id (group_id),
    INDEX idx_created_by (created_by),
    INDEX idx_deadline (deadline),
    INDEX idx_completed (completed),
    CONSTRAINT chk_todo_scope CHECK ((user_id IS NOT NULL) OR (group_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shopping items table
CREATE TABLE IF NOT EXISTS shopping_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    group_id INT NULL,
    assigned_user_ids JSON NULL,
    item VARCHAR(200) NOT NULL,
    category VARCHAR(100) NULL,
    purchased BOOLEAN DEFAULT FALSE,
    purchased_by INT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (purchased_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_group_id (group_id),
    INDEX idx_created_by (created_by),
    INDEX idx_purchased (purchased),
    INDEX idx_category (category),
    CONSTRAINT chk_shopping_scope CHECK ((user_id IS NOT NULL) OR (group_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Calendar events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    group_id INT NULL,
    assigned_user_ids JSON NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_group_id (group_id),
    INDEX idx_created_by (created_by),
    INDEX idx_start_time (start_time),
    INDEX idx_end_time (end_time),
    CONSTRAINT chk_calendar_scope CHECK ((user_id IS NOT NULL) OR (group_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
