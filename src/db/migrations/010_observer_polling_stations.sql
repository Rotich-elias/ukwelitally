-- Observer Polling Stations Migration
-- Adds support for assigning polling stations to observers for presidential results submission

-- Create observer_assignments table to link observers to polling stations
CREATE TABLE observer_assignments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  polling_station_id INTEGER REFERENCES polling_stations(id) ON DELETE CASCADE,
  volunteer_registration_id INTEGER REFERENCES volunteer_registrations(id) ON DELETE SET NULL,
  assignment_type VARCHAR(20) NOT NULL DEFAULT 'presidential' CHECK (assignment_type IN ('presidential', 'backup')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  assigned_by INTEGER REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure one active assignment per user per polling station
  UNIQUE(user_id, polling_station_id, status)
);

-- Indexes for performance
CREATE INDEX idx_observer_assignments_user ON observer_assignments(user_id);
CREATE INDEX idx_observer_assignments_station ON observer_assignments(polling_station_id);
CREATE INDEX idx_observer_assignments_status ON observer_assignments(status);
CREATE INDEX idx_observer_assignments_type ON observer_assignments(assignment_type);

-- Add trigger for updated_at
CREATE TRIGGER update_observer_assignments_updated_at BEFORE UPDATE ON observer_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add observer_assignment_created audit log type
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 8, '{"migration": "observer_polling_stations"}');