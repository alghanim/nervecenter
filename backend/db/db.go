package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/alghanim/agentboard/backend/config"
	"github.com/lib/pq"
)

var DB *sql.DB

// Config holds database connection parameters.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
}

// Connect opens a PostgreSQL connection and runs auto-migration.
func Connect(cfg Config, schema string) error {
	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName,
	)

	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)

	// Retry connection (postgres may still be starting)
	for i := 0; i < 10; i++ {
		if err = DB.Ping(); err == nil {
			break
		}
		log.Printf("⏳ Waiting for database... (%d/10) %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("✅ Connected to PostgreSQL")

	if schema != "" {
		if _, err := DB.Exec(schema); err != nil {
			return fmt.Errorf("schema migration failed: %w", err)
		}
		log.Println("✅ Database schema applied")
	}

	return nil
}

// Close closes the database connection.
func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}

// UpsertAgentsFromConfig seeds the agents table from the config flat list.
// On conflict (same id) it updates metadata but preserves the existing status.
func UpsertAgentsFromConfig(agents []config.Agent) error {
	const query = `
		INSERT INTO agents (id, display_name, emoji, role, team, team_color, is_lead, model, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), 'offline')
		ON CONFLICT (id) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			emoji        = EXCLUDED.emoji,
			role         = EXCLUDED.role,
			team         = EXCLUDED.team,
			team_color   = EXCLUDED.team_color,
			is_lead      = EXCLUDED.is_lead,
			model        = COALESCE(NULLIF(EXCLUDED.model, ''), agents.model)`

	configIDs := make([]string, 0, len(agents))
	for _, a := range agents {
		if _, err := DB.Exec(query, a.ID, a.Name, a.Emoji, a.Role, a.Team, a.TeamColor, a.IsLead, a.Model); err != nil {
			return fmt.Errorf("upsert agent %q: %w", a.ID, err)
		}
		configIDs = append(configIDs, a.ID)
	}
	log.Printf("✅ Seeded %d agents from config into DB", len(agents))

	// Soft-delete agents no longer in config — preserves task history.
	res, err := DB.Exec(`UPDATE agents SET status = 'inactive' WHERE id != ALL($1) AND status != 'inactive'`, pq.Array(configIDs))
	if err != nil {
		return fmt.Errorf("soft-delete stale agents: %w", err)
	}
	if marked, _ := res.RowsAffected(); marked > 0 {
		log.Printf("🧹 Marked %d stale agent(s) as inactive (not in config)", marked)
	}

	return nil
}
