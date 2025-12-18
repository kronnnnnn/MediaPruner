-- Normalize legacy lowercase media_type values to uppercase enum names
UPDATE library_paths SET media_type = UPPER(media_type) WHERE media_type IS NOT NULL AND media_type != UPPER(media_type);
