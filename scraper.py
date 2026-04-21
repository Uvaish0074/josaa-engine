import requests
from bs4 import BeautifulSoup
import time
import logging
import json
import os
from requests.exceptions import RequestException

# Configure strict logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class ViewStateError(Exception):
    """Custom exception for ASP.NET MAC Validation or State corruption."""
    pass

class AspStateManager:
    def __init__(self, url: str):
        self.url = url
        self.session = requests.Session()
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': url
        }
        self.asp_tokens = {}

    def _extract_tokens(self, html: str) -> None:
        """Parses the DOM and strictly updates ASP.NET hidden fields."""
        soup = BeautifulSoup(html, 'html.parser')
        tokens_to_find = ['__VIEWSTATE', '__EVENTVALIDATION', '__VIEWSTATEGENERATOR']
        
        for token in tokens_to_find:
            element = soup.find('input', {'id': token})
            if element and element.get('value'):
                self.asp_tokens[token] = element['value']
            else:
                logging.warning(f"Token {token} not found in DOM. Server might have rejected the state.")

    def initialize_session(self) -> BeautifulSoup:
        """Fires the initial GET request to establish SessionId and tokens."""
        logging.info("Initializing new ASP.NET Session...")
        self.session.cookies.clear() # Wipe old session
        response = self.session.get(self.url, headers=self.headers, timeout=15)
        response.raise_for_status()
        self._extract_tokens(response.text)
        return BeautifulSoup(response.text, 'html.parser')

    def safe_post(self, payload: dict, event_target: str = '', retries: int = 3) -> BeautifulSoup:
        """Posts payload with state tokens. Includes exponential backoff and ViewState auto-healing."""
        attempt = 0
        while attempt < retries:
            try:
                # Merge current state tokens with the desired payload
                full_payload = {
                    '__EVENTTARGET': event_target,
                    '__EVENTARGUMENT': '',
                    **self.asp_tokens,
                    **payload
                }

                response = self.session.post(self.url, headers=self.headers, data=full_payload, timeout=20)
                
                # Detect ASP.NET specific silent failures (HTTP 200 but error in text)
                if "Validation of viewstate MAC failed" in response.text or response.status_code == 500:
                    raise ViewStateError("Corrupted ViewState or Session Timeout.")

                response.raise_for_status()
                
                # Success: Update tokens for the next request
                self._extract_tokens(response.text)
                return BeautifulSoup(response.text, 'html.parser')

            except (ViewStateError, RequestException) as e:
                attempt += 1
                wait_time = 2 ** attempt # Exponential backoff: 2s, 4s, 8s
                logging.error(f"Request failed ({str(e)}). Retrying in {wait_time}s... (Attempt {attempt}/{retries})")
                time.sleep(wait_time)
                
                if isinstance(e, ViewStateError) or attempt == retries:
                    # Hard reset required
                    logging.info("Triggering hard session reset...")
                    self.initialize_session()

        raise Exception("Max retries exceeded. System aborting to prevent IP ban.")
    
class JoSaaScraper:
    def __init__(self, url: str, validator, target_year: int):
        self.engine = AspStateManager(url)
        self.progress_file = "josaa_progress.json"
        self.state_cache = self._load_progress()
        self.validator = validator
        self.target_year = target_year

    def _load_progress(self) -> set:
        if os.path.exists(self.progress_file):
            with open(self.progress_file, 'r') as f:
                return set(json.load(f))
        return set()

    def _save_progress(self, identifier: str):
        self.state_cache.add(identifier)
        with open(self.progress_file, 'w') as f:
            json.dump(list(self.state_cache), f)

    def extract_dropdown_options(self, soup: BeautifulSoup, dropdown_id: str) -> list:
        """Dynamically fetches available values from a dropdown."""
        select = soup.find('select', {'id': dropdown_id})
        if not select:
            return []
        # Return values, ignoring the placeholder "0"
        return [option['value'] for option in select.find_all('option') if option['value'] and option['value'] != "0"]

    def run(self):
        initial_soup = self.engine.initialize_session()
        
        # 1. Fetch Rounds
        rounds = self.extract_dropdown_options(initial_soup, 'ctl00_ContentPlaceHolder1_ddlroundno')
        
        for round_no in rounds:
            logging.info(f"--- Initiating Postback for Round {round_no} ---")
            soup_type = self.engine.safe_post(
                payload={'ctl00$ContentPlaceHolder1$ddlroundno': round_no},
                event_target='ctl00$ContentPlaceHolder1$ddlroundno'
            )
            
            # 2. Fetch Institute Types
            inst_types = self.extract_dropdown_options(soup_type, 'ctl00_ContentPlaceHolder1_ddlInstype')
            
            for inst_type in inst_types:
                identifier = f"Round_{round_no}_Type_{inst_type}"
                if identifier in self.state_cache:
                    logging.info(f"Skipping {identifier} - Already scraped.")
                    continue
                    
                logging.info(f"Processing cascading state for {identifier}...")
                
                # 3. Postback for Institute Type
                soup_inst = self.engine.safe_post(
                    payload={
                        'ctl00$ContentPlaceHolder1$ddlroundno': round_no,
                        'ctl00$ContentPlaceHolder1$ddlInstype': inst_type
                    },
                    event_target='ctl00$ContentPlaceHolder1$ddlInstype'
                )
                
                # Extract Institute Name options (Prefer 'ALL' if server allows it)
                insts = self.extract_dropdown_options(soup_inst, 'ctl00_ContentPlaceHolder1_ddlInstitute')
                inst_choice = 'ALL' if 'ALL' in insts else (insts[0] if insts else '')

                # 4. Postback for Institute Name
                soup_branch = self.engine.safe_post(
                    payload={
                        'ctl00$ContentPlaceHolder1$ddlroundno': round_no,
                        'ctl00$ContentPlaceHolder1$ddlInstype': inst_type,
                        'ctl00$ContentPlaceHolder1$ddlInstitute': inst_choice
                    },
                    event_target='ctl00$ContentPlaceHolder1$ddlInstitute'
                )

                # Extract Branch options
                branches = self.extract_dropdown_options(soup_branch, 'ctl00_ContentPlaceHolder1_ddlBranch')
                branch_choice = 'ALL' if 'ALL' in branches else (branches[0] if branches else '')

                # 5. Postback for Academic Program
                soup_seat = self.engine.safe_post(
                    payload={
                        'ctl00$ContentPlaceHolder1$ddlroundno': round_no,
                        'ctl00$ContentPlaceHolder1$ddlInstype': inst_type,
                        'ctl00$ContentPlaceHolder1$ddlInstitute': inst_choice,
                        'ctl00$ContentPlaceHolder1$ddlBranch': branch_choice
                    },
                    event_target='ctl00$ContentPlaceHolder1$ddlBranch'
                )

                # Extract Seat options
                seats = self.extract_dropdown_options(soup_seat, 'ctl00_ContentPlaceHolder1_ddlSeattype')
                seat_choice = 'ALL' if 'ALL' in seats else (seats[0] if seats else '')

                # 6. FINAL SUBMIT ACTION
                logging.info(f"Requesting final dataset for {identifier}...")
                final_payload = {
                    'ctl00$ContentPlaceHolder1$ddlroundno': round_no,
                    'ctl00$ContentPlaceHolder1$ddlInstype': inst_type,
                    'ctl00$ContentPlaceHolder1$ddlInstitute': inst_choice,
                    'ctl00$ContentPlaceHolder1$ddlBranch': branch_choice,
                    'ctl00$ContentPlaceHolder1$ddlSeattype': seat_choice,
                    'ctl00$ContentPlaceHolder1$btnSubmit': 'Submit'
                }

                result_soup = self.engine.safe_post(payload=final_payload, event_target='')
                
                # Pass to Phase 3 Validation
                self._parse_table(result_soup, round_no)
                
                self._save_progress(identifier)
                time.sleep(2) # Prevent IP banning

    def _parse_table(self, soup: BeautifulSoup, round_no: str):
        """Extracts HTML table and passes it to the data validator."""
        table = soup.find('table', {'id': 'ctl00_ContentPlaceHolder1_GridView1'})
        if not table:
            logging.warning("No table found in response. Possible empty dataset.")
            return
        
        try:
            round_int = int(round_no)
        except ValueError:
            round_int = 0
            
        self.validator.process_html_table(soup, round_no=round_int, year=self.target_year)
    def _parse_table(self, soup: BeautifulSoup, round_no: str):
        """Extracts HTML table and passes it to the data validator."""
        table = soup.find('table', {'id': 'ctl00_ContentPlaceHolder1_GridView1'})
        if not table:
            logging.warning("No table found in response. Possible empty dataset.")
            return
        
        # Send the raw HTML directly to Phase 3 for cleaning
        try:
            round_int = int(round_no)
        except ValueError:
            round_int = 0
            
        self.validator.process_html_table(soup, round_no=round_int, year=self.target_year)
        # Logic to iterate <tr> and <td> goes here (Transitions into Phase 3)
        pass