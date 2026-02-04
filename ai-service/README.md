# AI Service (Python + Flask)

This service handles AI operations, RAG pipelines, and other heavy processing.

## Structure
- `app/routes`: API endpoints
- `app/services`: Core logic (e.g., RAG, LLM calls)
- `app/utils`: Helper functions (PDF parsing, text cleaning)
- `main.py`: Entry point

## Setup
1. Create a virtual environment: `python -m venv .venv`
2. Activate it:
   - Windows: `.venv\Scripts\activate`
   - Linux/Mac: `source .venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Run: `python main.py`
