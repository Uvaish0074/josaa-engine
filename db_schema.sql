-- Create the main cutoffs table
CREATE TABLE josaa_cutoffs (
    id SERIAL PRIMARY KEY,
    academic_year INT NOT NULL,
    round_no INT NOT NULL,
    institute_name TEXT NOT NULL,
    academic_program TEXT NOT NULL,
    quota VARCHAR(10) NOT NULL,       -- e.g., 'OS', 'HS', 'AI'
    category VARCHAR(50) NOT NULL,    -- e.g., 'OPEN', 'OBC-NCL', 'SC'
    gender VARCHAR(100) NOT NULL,     -- e.g., 'Gender-Neutral', 'Female-only'
    opening_rank INT,                 -- Nullable because of 'NA'
    closing_rank INT,                 -- Nullable because of 'NA'
    is_preparatory BOOLEAN DEFAULT FALSE,
    source_url TEXT NOT NULL,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Enforce uniqueness so we don't duplicate data on re-runs
    UNIQUE (academic_year, round_no, institute_name, academic_program, quota, category, gender)
);

-- 🔥 CRITICAL INDEXES FOR PREDICTION ENGINE PERFORMANCE
-- When a user queries: "What colleges can I get with rank 5000 in OBC-NCL, Gender-Neutral?"
CREATE INDEX idx_rank_search ON josaa_cutoffs (category, gender, closing_rank);

-- When a user filters by a specific college or branch
CREATE INDEX idx_institute_program ON josaa_cutoffs (institute_name, academic_program);