import re
from datetime import datetime
import pandas as pd

class DataValidator:
    def __init__(self):
        self.error_log = []
        self.clean_data = []

    def parse_rank(self, rank_str: str) -> tuple:
        """
        Parses ranks, handling 'NA' and Preparatory ('P') ranks.
        Returns: (integer_rank, is_preparatory)
        """
        rank_str = str(rank_str).strip().upper()
        if not rank_str or rank_str == 'NA':
            return None, False
        
        is_prep = 'P' in rank_str
        try:
            # Strip non-numeric characters (like 'P' or stray commas)
            clean_num = re.sub(r'[^0-9]', '', rank_str)
            return int(clean_num), is_prep
        except ValueError:
            return None, False

    def validate_and_clean_row(self, row_data: dict) -> dict:
        """Applies strict validation rules to a single scraped row."""
        # 1. Check for missing critical fields
        critical_fields = ['Institute', 'Academic Program Name', 'Seat Type', 'Gender']
        if any(not row_data.get(field) for field in critical_fields):
            self.error_log.append({"error": "Missing critical field", "row": row_data})
            return None

        # 2. Parse Ranks
        or_val, or_prep = self.parse_rank(row_data.get('Opening Rank', ''))
        cr_val, cr_prep = self.parse_rank(row_data.get('Closing Rank', ''))

        # 3. Handle 'NA' or empty rows (We skip rows where BOTH ranks are NA)
        if or_val is None and cr_val is None:
            self.error_log.append({"error": "Both OR and CR are NA", "row": row_data})
            return None

        # 4. Mathematical Validation (Opening Rank must be <= Closing Rank)
        if or_val and cr_val and (or_val > cr_val):
            self.error_log.append({"error": "OR > CR logic failure", "row": row_data})
            return None

        # Return sanitized dictionary
        return {
            "institute_name": row_data['Institute'],
            "academic_program": row_data['Academic Program Name'],
            "quota": row_data['Quota'],
            "category": row_data['Seat Type'],
            "gender": row_data['Gender'],
            "opening_rank": or_val,
            "closing_rank": cr_val,
            "is_preparatory": or_prep or cr_prep,
            "source_url": "https://josaa.admissions.nic.in/applicant/SeatAllotmentResult/CurrentORCR.aspx",
            "timestamp": datetime.utcnow().isoformat()
        }

    def process_html_table(self, soup, round_no: int, year: int):
        table = soup.find('table', {'id': 'ctl00_ContentPlaceHolder1_GridView1'})
        if not table:
            return

        headers = [th.text.strip() for th in table.find_all('th')]
        rows = table.find_all('tr')[1:] # Skip header row

        for tr in rows:
            cells = [td.text.strip() for td in tr.find_all('td')]
            if len(cells) != len(headers):
                continue # Skip malformed rows
            
            raw_row = dict(zip(headers, cells))
            
            clean_row = self.validate_and_clean_row(raw_row)
            if clean_row:
                clean_row['round'] = round_no
                clean_row['year'] = year
                self.clean_data.append(clean_row)