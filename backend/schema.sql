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
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
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


-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used TIMESTAMP,
    expires_at TIMESTAMP,
    CONSTRAINT valid_api_key_role CHECK (role IN ('admin', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Agent Costs table (DB-based cost tracking)
CREATE TABLE IF NOT EXISTS agent_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100) NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    tokens_in BIGINT DEFAULT 0,
    tokens_out BIGINT DEFAULT 0,
    cost_usd DECIMAL(12, 6) DEFAULT 0.0,
    model VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_costs_agent ON agent_costs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_costs_created ON agent_costs(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_costs_task ON agent_costs(task_id);

-- Task Templates table
CREATE TABLE IF NOT EXISTS task_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    default_assignee VARCHAR(100),
    default_priority VARCHAR(20) DEFAULT 'medium',
    checklist JSONB DEFAULT '[]',
    workflow_rules JSONB DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_task_templates_updated_at ON task_templates;

-- Notifications table (in-app)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100),
    type VARCHAR(100) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Agent Traces table
CREATE TABLE IF NOT EXISTS agent_traces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id VARCHAR(100),
    trace_type VARCHAR(50) NOT NULL,
    content JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    duration_ms INT DEFAULT 0,
    CONSTRAINT valid_trace_type CHECK (trace_type IN ('tool_call', 'llm_invoke', 'sub_agent_spawn', 'file_change', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_task ON agent_traces(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_agent ON agent_traces(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_created ON agent_traces(created_at);

-- Expand alert_rules condition_type to include new conditions
DO $$ BEGIN
  ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS valid_condition_type;
  ALTER TABLE alert_rules ADD CONSTRAINT valid_condition_type
    CHECK (condition_type IN ('no_heartbeat', 'error_rate', 'task_stuck', 'cost_threshold_exceeded', 'sla_breach', 'agent_idle'));
END $$;
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

-- Git Integrations table (Phase 2)
CREATE TABLE IF NOT EXISTS git_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL DEFAULT 'github',
    repo_url TEXT NOT NULL,
    token_hash VARCHAR(255) DEFAULT '',
    webhook_secret VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- PR Links table (Phase 2)
CREATE TABLE IF NOT EXISTS pr_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES git_integrations(id) ON DELETE SET NULL,
    pr_number INT NOT NULL,
    pr_title TEXT DEFAULT '',
    pr_url TEXT DEFAULT '',
    pr_state VARCHAR(50) DEFAULT 'open',
    branch_name VARCHAR(500) DEFAULT '',
    author_login VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_pr_links_task ON pr_links(task_id);

-- Task dependencies (Phase 2)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}';

-- Evaluations table (Phase 2)
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id VARCHAR(100),
    score DECIMAL(5,2) NOT NULL,
    criteria JSONB DEFAULT '{}',
    evaluator VARCHAR(255) NOT NULL DEFAULT 'manual',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_task ON evaluations(task_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_agent ON evaluations(agent_id);

-- Incidents table (Phase 2)
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    task_ids JSONB DEFAULT '[]',
    agent_ids JSONB DEFAULT '[]',
    root_cause TEXT DEFAULT '',
    timeline JSONB DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP,
    CONSTRAINT valid_incident_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT valid_incident_status CHECK (status IN ('open', 'investigating', 'mitigating', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
