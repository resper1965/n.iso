CREATE TABLE IF NOT EXISTS policy_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  iso_ref TEXT NOT NULL,
  category TEXT DEFAULT 'Organizational',
  difficulty TEXT DEFAULT 'Standard',
  estimated_time TEXT DEFAULT '45 min',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO policy_templates (id, title, iso_ref, category, difficulty, estimated_time, description) VALUES
('isp', 'Information Security Policy (ISP)', '5.1', 'Organizational', 'Standard', '45 min', ''),
('aup', 'Acceptable Use Policy (AUP)', '5.10', 'Organizational', 'Standard', '45 min', ''),
('acp', 'Access Control Policy (ACP)', '5.15', 'Organizational', 'Standard', '45 min', ''),
('irp', 'Incident Response Policy (IRP)', '5.24', 'Organizational', 'Standard', '45 min', ''),
('bcp', 'Business Continuity Plan (BCP)', '5.29', 'Organizational', 'Standard', '45 min', ''),
('dpp', 'Data Protection Policy (DPP)', '5.34', 'Organizational', 'Standard', '45 min', ''),
('cmp', 'Change Management Policy (CMP)', '8.32', 'Organizational', 'Standard', '45 min', ''),
('sdp', 'Secure Development Policy (SDP)', '8.25', 'Organizational', 'Standard', '45 min', ''),
('vmp', 'Vulnerability Management Policy (VMP)', '8.8', 'Organizational', 'Standard', '45 min', ''),
('sap', 'Security Awareness Program (SAP)', '6.3', 'Organizational', 'Standard', '45 min', '');
