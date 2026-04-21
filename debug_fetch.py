import requests
from bs4 import BeautifulSoup

url = "https://josaa.admissions.nic.in/applicant/SeatAllotmentResult/CurrentORCR.aspx"

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

print("Fetching page...")
response = requests.get(url, headers=headers)

# Save the exact response to an HTML file so we can look at it
with open("debug_page.html", "w", encoding="utf-8") as f:
    f.write(response.text)

soup = BeautifulSoup(response.text, 'html.parser')
viewstate = soup.find('input', {'id': '__VIEWSTATE'})

if viewstate:
    print("✅ SUCCESS: Found ViewState. The form is active.")
else:
    print("❌ ERROR: No ViewState found. The page is blocking us or closed.")
    print("Open debug_page.html in your browser to see what the server is actually showing.")