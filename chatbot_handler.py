from flask import Blueprint, jsonify, request
import google.generativeai as genai
import markdown
import bleach
import os
from dotenv import load_dotenv
import google.api_core.exceptions as google_exceptions
from tenacity import retry, stop_after_attempt, wait_fixed
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

chatbot_bp = Blueprint('chatbot', __name__, url_prefix='/chatbot')

load_dotenv()

# Get the API key
GEMINI_API_KEY = os.getenv("API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("API_KEY not found in environment variables")

genai.configure(api_key=GEMINI_API_KEY)

# Configure allowed HTML tags and attributes for safe rendering
ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre']
ALLOWED_ATTRIBUTES = {'*': ['class']}

@retry(stop=stop_after_attempt(3), wait=wait_fixed(60))
def generate_content_with_retry(model, prompt):
    return model.generate_content(prompt)

@chatbot_bp.route('/chat', methods=['POST'])
def chat():
    try:
        # Check for valid JSON
        if not request.is_json:
            logger.error(f"Invalid request: Content-Type is {request.content_type}")
            return jsonify({'error': 'Request must be JSON'}), 400
            
        # Get message from JSON
        data = request.get_json()
        message = data.get('message') if data else None
        if not message:
            logger.error("No message provided in request")
            return jsonify({'error': 'No message provided'}), 400

        # Initialize Gemini model
        model = genai.GenerativeModel('gemini-2.5-flash')  # Use lighter model
        
        # Generate response with simplified prompt
        prompt = f"""You are a fitness assistant. Respond helpfully in markdown with bullet points for lists, **bold** for key terms, and code blocks for routines. Message: {message}"""
        
        response = generate_content_with_retry(model, prompt)
        
        if not response.text:
            logger.error("No response text generated")
            return jsonify({'error': 'No response generated'}), 500

        # Convert markdown to HTML and sanitize
        html_response = markdown.markdown(response.text)
        sanitized_html = bleach.clean(
            html_response,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRIBUTES,
            strip=True
        )
        
        logger.info(f"Successfully generated response for message: {message}")
        return jsonify({
            'response': response.text,
            'html_response': sanitized_html
        })

    except google_exceptions.TooManyRequests as e:
        logger.error(f"Quota exceeded: {str(e)}")
        return jsonify({
            'error': 'Quota limit reached. Please try again later or upgrade your plan.',
            'details': 'See https://ai.google.dev/gemini-api/docs/rate-limits for more info.'
        }), 429
    except google_exceptions.NotFound as e:
        logger.error(f"Model not found: {str(e)}")
        return jsonify({'error': 'Model not found. Please check available models.'}), 404
    except ValueError as e:
        logger.error(f"Invalid input: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500