from flask import Flask, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

PORT = int(os.getenv("PORT", 8000))

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "AI Service"})

# Import routes here
# from app.routes import example_bp
# app.register_blueprint(example_bp)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=True)
