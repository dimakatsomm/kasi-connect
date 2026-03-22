-- Add latitude and longitude to vendors for location-based discovery
ALTER TABLE vendors ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE vendors ADD COLUMN longitude DOUBLE PRECISION;

-- Index whatsapp_number for vendor lookup by phone
CREATE INDEX IF NOT EXISTS idx_vendors_whatsapp_number ON vendors(whatsapp_number);
