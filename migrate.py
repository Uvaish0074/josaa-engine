import psycopg2
from psycopg2.extras import execute_values
import os
from dotenv import load_dotenv

load_dotenv()

# Paste your Neon Connection string right here!
NEON_URL = "postgresql://neondb_owner:npg_d0nZOJM1Pkge@ep-odd-frog-anbtlcz5.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"

print("Fetching data from Local Database...")
# Connect to your local database
local_conn = psycopg2.connect(
    host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT"), dbname=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD")
)
local_cur = local_conn.cursor()

# Strictly selecting ONLY the columns we know exist
local_cur.execute("""
    SELECT round_no, institute_name, academic_program, 
           quota, category, gender, opening_rank, closing_rank 
    FROM josaa_cutoffs
""")
data = local_cur.fetchall()
local_conn.close()
print(f"Fetched {len(data)} rows successfully.")

print("Connecting to Neon Cloud Database...")
cloud_conn = psycopg2.connect(NEON_URL)
cloud_cur = cloud_conn.cursor()

print("Setting up Cloud Tables and Indexes...")
cloud_cur.execute("""
    CREATE TABLE IF NOT EXISTS josaa_cutoffs (
        id SERIAL PRIMARY KEY,
        round_no INTEGER,
        institute_name TEXT,
        academic_program TEXT,
        quota VARCHAR(50),
        category VARCHAR(100),
        gender VARCHAR(100),
        opening_rank INTEGER,
        closing_rank INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_josaa_search ON josaa_cutoffs (category, gender, round_no, closing_rank);
""")

print("Uploading 144,000+ rows to the Cloud... (This will take about 1-2 minutes)")
execute_values(cloud_cur, """
    INSERT INTO josaa_cutoffs (round_no, institute_name, academic_program, quota, category, gender, opening_rank, closing_rank) 
    VALUES %s
""", data, page_size=10000)

cloud_conn.commit()
cloud_cur.close()
cloud_conn.close()
print("Migration Complete! Your JoSAA Database is officially LIVE on the internet. 🚀")