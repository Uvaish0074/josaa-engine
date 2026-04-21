import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

class DatabaseManager:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT"),
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD")
        )
        self.conn.autocommit = True

    def batch_upsert(self, clean_data_list):
        query = """
            INSERT INTO josaa_cutoffs (
                academic_year, round_no, institute_name, academic_program, 
                quota, category, gender, opening_rank, closing_rank, is_preparatory, source_url
            ) VALUES (
                %(year)s, %(round)s, %(institute_name)s, %(academic_program)s, 
                %(quota)s, %(category)s, %(gender)s, %(opening_rank)s, %(closing_rank)s, %(is_preparatory)s, %(source_url)s
            )
            ON CONFLICT (academic_year, round_no, institute_name, academic_program, quota, category, gender) 
            DO UPDATE SET 
                opening_rank = EXCLUDED.opening_rank,
                closing_rank = EXCLUDED.closing_rank,
                scraped_at = CURRENT_TIMESTAMP;
        """
        with self.conn.cursor() as cur:
            cur.executemany(query, clean_data_list)