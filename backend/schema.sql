-- AgentBoard Database Schema
-- Idempotent: safe to run multiple times

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'todo',
    priority VARCHAR(20) DEFAULT 'medium',
    assignee VARCHAR(100),
    team VARCHAR(100),
    due_date TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    labels TEXT[],
    CONSTRAINT valid_status CHECK (status IN ('backlog', 'todo', 'next', 'progress', 'review', 'done', 'blocked')),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'critical', 'moonshot', ''))
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Agent Registry table (synced from config, used for relational lookups)
CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255),
    emoji VARCHAR(10),
    role VARCHAR(255),
    team VARCHAR(100),
    team_color VARCHAR(50),
    model VARCHAR(255),
    status VARCHAR(50) DEFAULT 'offline',
    current_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    last_active TIMESTAMP,
    workspace_path VARCHAR(500),
    is_lead BOOLEAN DEFAULT FALSE,
    CONSTRAINT valid_agent_status CHECK (status IN ('online', 'offline', 'busy', 'idle', 'paused', 'killed'))
);

-- Add team_color if upgrading from older schema
ALTER TABLE agents ADD COLUMN IF NOT EXISTS team_color VARCHAR(50);

-- Update agent status constraint to include paused/killed/degraded (idempotent)
DO $$ BEGIN
  ALTER TABLE agents DROP CONSTRAINT IF EXISTS valid_agent_status;
  ALTER TABLE agents ADD CONSTRAINT valid_agent_status
    CHECK (status IN ('online', 'offline', 'busy', 'idle', 'paused', 'killed', 'degraded'));
END $$;

-- Add auto_restart flag for health-check-triggered restarts
ALTER TABLE agents ADD COLUMN IF NOT EXISTS auto_restart BOOLEAN DEFAULT false;

-- Activity Log table
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Agent Sessions table
CREATE TABLE IF NOT EXISTS agent_sessions (
    session_key VARCHAR(255) PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP,
    tokens_in BIGINT DEFAULT 0,
    tokens_out BIGINT DEFAULT 0,
    cost_estimate DECIMAL(10, 4) DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'running',
    CONSTRAINT valid_session_status CHECK (status IN ('running', 'completed', 'failed', 'timeout'))
);

-- Agent Metrics table (daily aggregates)
CREATE TABLE IF NOT EXISTS agent_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    tasks_completed INT DEFAULT 0,
    tasks_failed INT DEFAULT 0,
    avg_completion_time_seconds INT DEFAULT 0,
    tokens_used BIGINT DEFAULT 0,
    total_cost DECIMAL(10, 4) DEFAULT 0.0,
    UNIQUE(agent_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);

CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);

CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_task ON activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON agent_sessions(started_at);

CREATE INDEX IF NOT EXISTS idx_metrics_agent_date ON agent_metrics(agent_id, date);

-- Annotations table (shared notes on agents)
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100) NOT NULL,
    author VARCHAR(100) NOT NULL DEFAULT 'ali',
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_annotations_agent ON annotations(agent_id);
CREATE INDEX IF NOT EXISTS idx_annotations_created ON annotations(created_at);

-- Task History table (status transition audit trail)
CREATE TABLE IF NOT EXISTS task_history (
    id SERIAL PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);

-- Alert Rules table
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    agent_id VARCHAR(100),  -- NULL = all agents
    condition_type VARCHAR(50) NOT NULL,
    threshold INT NOT NULL DEFAULT 30,
    enabled BOOLEAN DEFAULT true,
    notify_webhook_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_condition_type CHECK (condition_type IN ('no_heartbeat', 'error_rate', 'task_stuck'))
);

-- Alert History table
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    agent_id VARCHAR(100),
    triggered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    message TEXT,
    acknowledged BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule_id ON alert_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_triggered_at ON alert_history(triggered_at);
CREATE INDEX IF NOT EXISTS idx_alert_history_acknowledged ON alert_history(acknowledged);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);

-- Audit Log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    "user" VARCHAR(100) DEFAULT 'user',
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(255),
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);

-- Trigger to auto-update updated_at on tasks
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules;
CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
