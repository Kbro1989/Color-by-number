-- Create Artworks Table
CREATE TABLE IF NOT EXISTS artworks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    data TEXT NOT NULL, -- JSON string of coloring state
    thumbnail TEXT, -- Base64 or URL
    created_at INTEGER DEFAULT (unixepoch())
);

-- Improve query performance
CREATE INDEX IF NOT EXISTS idx_artworks_user_id ON artworks(user_id);
