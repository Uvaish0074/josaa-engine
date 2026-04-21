from scraper import JoSaaScraper
from validator import DataValidator
from database import DatabaseManager
import logging

logging.basicConfig(level=logging.INFO)

def main():
    TARGET_URL = "https://josaa.admissions.nic.in/applicant/SeatAllotmentResult/CurrentORCR.aspx"
    TARGET_YEAR = 2025 
    
    # Initialize the database and validator
    db = DatabaseManager()
    validator = DataValidator()
    
    # Initialize the scraper AND pass the validator into it
    scraper = JoSaaScraper(TARGET_URL, validator, TARGET_YEAR)

    logging.info("Starting JoSAA Extraction Pipeline...")
    
    # 1. RUN THE SCRAPER
    scraper.run() 
    
    # 2. INSERT INTO DATABASE
    if validator.clean_data:
        logging.info(f"Inserting {len(validator.clean_data)} rows into database...")
        db.batch_upsert(validator.clean_data)
        logging.info("Insertion complete!")
    else:
        logging.warning("No data was extracted. Check scraper logs.")

if __name__ == "__main__":
    main()