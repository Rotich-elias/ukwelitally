-- Normalise observer placeholder candidate labels
--
-- The labels are generated from the position slug, which produces awkward
-- names like "Mca Election - Observer Submissions". Give each position a
-- properly cased label.

UPDATE candidates
SET full_name = 'President Election - Observer Submissions'
WHERE is_placeholder = TRUE AND position = 'president';

UPDATE candidates
SET full_name = 'Governor Election - Observer Submissions'
WHERE is_placeholder = TRUE AND position = 'governor';

UPDATE candidates
SET full_name = 'Senator Election - Observer Submissions'
WHERE is_placeholder = TRUE AND position = 'senator';

UPDATE candidates
SET full_name = 'Women Representative Election - Observer Submissions'
WHERE is_placeholder = TRUE AND position = 'women_rep';

UPDATE candidates
SET full_name = 'Member of Parliament Election - Observer Submissions'
WHERE is_placeholder = TRUE AND position = 'mp';

UPDATE candidates
SET full_name = 'Member of County Assembly Election - Observer Submissions'
WHERE is_placeholder = TRUE AND position = 'mca';

-- Audit log
INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
VALUES ('database_migration', 'schema', 13, '{"migration": "observer_placeholder_labels"}');
