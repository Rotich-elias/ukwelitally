-- Volunteer Registrations Migration
-- Adds support for volunteer agent registrations from landing page

-- Create volunteer_registrations table
CREATE TABLE volunteer_registrations (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  id_number VARCHAR(50) NOT NULL,
  
  -- Location preferences
  county_id INTEGER REFERENCES counties(id),
  constituency_id INTEGER REFERENCES constituencies(id),
  ward_id INTEGER REFERENCES wards(id),
  polling_station_id INTEGER REFERENCES polling_stations(id),
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'assigned')),
  notes TEXT,
  
  -- Assignment info (when assigned to candidate)
  assigned_candidate_id INTEGER REFERENCES candidates(id),
  assigned_agent_id INTEGER REFERENCES agents(id),
  assigned_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_volunteer_registrations_status ON volunteer_registrations(status);
CREATE INDEX idx_volunteer_registrations_email ON volunteer_registrations(email);
CREATE INDEX idx_volunteer_registrations_phone ON volunteer_registrations(phone);
CREATE INDEX idx_volunteer_registrations_id_number ON volunteer_registrations(id_number);
CREATE INDEX idx_volunteer_registrations_county ON volunteer_registrations(county_id);
CREATE INDEX idx_volunteer_registrations_constituency ON volunteer_registrations(constituency_id);
CREATE INDEX idx_volunteer_registrations_ward ON volunteer_registrations(ward_id);
CREATE INDEX idx_volunteer_registrations_polling_station ON volunteer_registrations(polling_station_id);
CREATE INDEX idx_volunteer_registrations_candidate ON volunteer_registrations(assigned_candidate_id);
CREATE INDEX idx_volunteer_registrations_created ON volunteer_registrations(created_at);

-- Add trigger for updated_at
CREATE TRIGGER update_volunteer_registrations_updated_at BEFORE UPDATE ON volunteer_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add volunteer_registration_created audit log type
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 7, '{"migration": "volunteer_registrations"}');