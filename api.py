from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="JoSAA Predictor API", version="1.0")

# Allow frontend to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection dependency
# Database connection dependency
def get_db_connection():
    try:
        # It will look for the cloud URL first, and fall back to your local ones if needed
        db_url = os.getenv("DATABASE_URL")
        
        if db_url:
            conn = psycopg2.connect(db_url)
        else:
            conn = psycopg2.connect(
                host=os.getenv("DB_HOST"),
                port=os.getenv("DB_PORT"),
                dbname=os.getenv("DB_NAME"),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD")
            )
        return conn
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database connection failed.")
@app.get("/")
def read_root():
    return {"status": "JoSAA Engine API is running securely."}

@app.get("/predict")
def predict_colleges(
    rank: int = Query(..., description="The user's rank"),
    category: str = Query("OPEN", description="Seat Category (e.g., OPEN, OBC-NCL, SC)"),
    gender: str = Query("Gender-Neutral", description="Gender-Neutral or Female-only"),
    round_no: int = Query(6, description="JoSAA Round Number (0 for MAX across all rounds)"),
    institute_type: str = Query(None, description="Optional: IIT, NIT, IIIT, GFTI")
):
    """
    Core prediction algorithm: Returns colleges based on round or absolute MAX rank.
    """
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # 🔥 NEW LOGIC: If round_no is 0, find the absolute MAX rank across all rounds
    if round_no == 0:
        query = """
            SELECT institute_name, academic_program, quota, category, gender, MAX(closing_rank) as closing_rank 
            FROM josaa_cutoffs 
            WHERE category = %s AND gender = %s 
        """
        params = [category, gender]
        
        if institute_type:
            query += " AND institute_name LIKE %s"
            params.append(f"%{institute_type}%")
            
        query += " GROUP BY institute_name, academic_program, quota, category, gender"
        query += " HAVING MAX(closing_rank) >= %s"
        params.append(rank)
        
        query += " ORDER BY closing_rank ASC;"
        
    # Standard Logic: Fetch a specific round (1-6)
    else:
        query = """
            SELECT institute_name, academic_program, quota, category, gender, opening_rank, closing_rank 
            FROM josaa_cutoffs 
            WHERE category = %s 
            AND gender = %s 
            AND round_no = %s 
            AND closing_rank >= %s
            AND closing_rank IS NOT NULL
        """
        params = [category, gender, round_no, rank]

        if institute_type:
            query += " AND institute_name LIKE %s"
            params.append(f"%{institute_type}%")

        query += " ORDER BY closing_rank ASC;"

    try:
        cursor.execute(query, params)
        results = cursor.fetchall()
        return {
            "user_rank": rank,
            "category": category,
            "total_options": len(results),
            "predictions": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()@app.get("/predict")
def predict_colleges(
    rank: int = Query(..., description="The user's rank"),
    category: str = Query("OPEN", description="Seat Category (e.g., OPEN, OBC-NCL, SC)"),
    gender: str = Query("Gender-Neutral", description="Gender-Neutral or Female-only"),
    round_no: int = Query(6, description="JoSAA Round Number (0 for MAX across all rounds)"),
    institute_type: str = Query(None, description="Optional: IIT, NIT, IIIT, GFTI")
):
    """
    Core prediction algorithm: Returns colleges based on round or absolute MAX rank.
    """
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # 🔥 NEW LOGIC: If round_no is 0, find the absolute MAX rank across all rounds
    if round_no == 0:
        query = """
            SELECT institute_name, academic_program, quota, category, gender, MAX(closing_rank) as closing_rank 
            FROM josaa_cutoffs 
            WHERE category = %s AND gender = %s 
        """
        params = [category, gender]
        
        if institute_type:
            query += " AND institute_name LIKE %s"
            params.append(f"%{institute_type}%")
            
        query += " GROUP BY institute_name, academic_program, quota, category, gender"
        query += " HAVING MAX(closing_rank) >= %s"
        params.append(rank)
        
        query += " ORDER BY closing_rank ASC;"
        
    # Standard Logic: Fetch a specific round (1-6)
    else:
        query = """
            SELECT institute_name, academic_program, quota, category, gender, opening_rank, closing_rank 
            FROM josaa_cutoffs 
            WHERE category = %s 
            AND gender = %s 
            AND round_no = %s 
            AND closing_rank >= %s
            AND closing_rank IS NOT NULL
        """
        params = [category, gender, round_no, rank]

        if institute_type:
            query += " AND institute_name LIKE %s"
            params.append(f"%{institute_type}%")

        query += " ORDER BY closing_rank ASC;"

    try:
        cursor.execute(query, params)
        results = cursor.fetchall()
        return {
            "user_rank": rank,
            "category": category,
            "total_options": len(results),
            "predictions": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()