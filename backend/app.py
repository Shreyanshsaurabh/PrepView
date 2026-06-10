from flask import Flask, request, jsonify
from flask_cors import CORS
import assemblyai
from mistralai.client import Mistral
import json
import os
import urllib.request  # Added to fetch data from your external API
import tempfile
from dotenv import load_dotenv
import os

load_dotenv()

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")

# API Keys - Keep these safe!
assemblyai.settings.api_key = ASSEMBLYAI_API_KEY

mistral = Mistral(
    api_key=MISTRAL_API_KEY
)

transcriber = assemblyai.Transcriber()

app = Flask(__name__)
CORS(app)

# Global array to hold the fetched questions dynamically
questions = []

def fetch_live_questions(target_topic="Frontend Development"):
    global questions
    
    # We pass the target_topic variable directly into Mistral's prompt context
    prompt = f"""
    You are a technical interview panel architect. Generate a list of 1 interview topic 
    focused strictly on: '{target_topic}'. 
    Under this topic, provide 3 highly relevant technical interview questions ranging from conceptual to practical.
    
    You MUST return ONLY a raw, valid JSON array matching this exact format structure:
    [
      {{
        "topic": "{target_topic}",
        "questions": [
          {{ "id": "m1", "text": "First question text here?" }},
          {{ "id": "m2", "text": "Second question text here?" }},
          {{ "id": "m3", "text": "Third question text here?" }}
        ]
      }}
    ]
    """
    
    try:
        print(f"🔄 Generating live questions for topic '{target_topic}' using Mistral AI...")
        
        response = mistral.chat.complete(
            model="mistral-large-latest",
            messages=[{"role": "user", "content": prompt}]
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        if ai_response.startswith("```"):
            if ai_response.startswith("```json"):
                ai_response = ai_response[7:]
            else:
                ai_response = ai_response[3:]
            if ai_response.endswith("```"):
                ai_response = ai_response[:-3]
            ai_response = ai_response.strip()
            
        questions = json.loads(ai_response)
        print("✅ Successfully generated custom questions!")
        return questions # Return the questions list
        
    except Exception as e:
        print(f"❌ Failed to get questions from Mistral: {e}")
        questions = [{
            "topic": f"{target_topic} (Fallback)",
            "questions": [{"id": "fb-1", "text": f"Explain the core fundamentals of {target_topic}."}]
        }]
        return questions

@app.route('/evaluate', methods=['POST'])
def evaluate():
    if 'answer' not in request.files:
        return jsonify({'error': 'No audio file'}), 400

    audio_file = request.files['answer']
    question_id = request.form.get('questionId')

    # 1. Locate the selected question safely
    selected_question = None
    for topic in questions:
        for question in topic['questions']:
            if question['id'] == question_id:
                selected_question = question
                break
        if selected_question:
            break

    if not selected_question:
        return jsonify({'error': 'Question not found'}), 404

    # Absolute workspace path alignment
    audio_path = os.path.join(tempfile.gettempdir(), "temp_answer.webm")

    # ENTIRE PIPELINE IN ONE SAFE SCOPE
    try:
        # 2. File Stream Input / Output Management
        audio_file.seek(0)
        audio_file.save(audio_path)
        print(f"📁 Audio saved locally at: {audio_path}")
        
        if os.path.getsize(audio_path) == 0:
            raise ValueError("The received audio file is empty (0 bytes).")

        # 3. AssemblyAI Audio Transcription Phase
        print("🎙️ Sending audio to AssemblyAI for transcription...")
        transcript = transcriber.transcribe(audio_path)
        
        if transcript.status == assemblyai.TranscriptStatus.error:
            raise Exception(f"AssemblyAI Error: {transcript.error}")
            
        transcribed_text = transcript.text
        print(f"📝 Transcribed Text: '{transcribed_text}'")

        # Handle empty/silent audio recordings before bugging Mistral
        if not transcribed_text or not transcribed_text.strip():
            return jsonify({
                "correctness": 0,
                "completeness": 0,
                "feedback_suggestions": "We couldn't detect any spoken words in your answer. Please ensure your microphone is working and speak clearly.",
                "user_answer": "[No speech detected]"
            })

        # 4. Mistral LLM Evaluation Prompt Engineering
        prompt = f"""
You are a technical interviewer.

Question:
{selected_question['text']}

Candidate Answer:
{transcribed_text}

Evaluate the answer and return ONLY valid JSON.

Format:
{{
  "correctness": 0-5,
  "completeness": 0-5,
  "feedback_suggestions": "Detailed feedback",
  "user_answer": "{transcribed_text}"
}}
"""

        print("🤖 Prompting Mistral AI for scores...")
        response = mistral.chat.complete(
            model="mistral-large-latest",
            messages=[{"role": "user", "content": prompt}]
        )

        ai_response = response.choices[0].message.content.strip()

        # 5. Clean markdown code wraps block securely 
        if ai_response.startswith("```"):
            if ai_response.startswith("```json"):
                ai_response = ai_response[7:]
            else:
                ai_response = ai_response[3:]
            if ai_response.endswith("```"):
                ai_response = ai_response[:-3]
            ai_response = ai_response.strip()

        try:
            result = json.loads(ai_response)
            return jsonify(result)
        except json.JSONDecodeError:
            print(f"⚠️ Mistral didn't return strict JSON. Raw payload: {ai_response}")
            return jsonify({"raw_response": ai_response})

    except Exception as e:
        print(f"❌ Critical Processing Failure: {str(e)}")
        return jsonify({"error": f"Server evaluation processing failed: {str(e)}"}), 500
        
    finally:
        # File destruction happens safely at the absolute end of the request
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print("🧹 Temporary audio cache file cleaned up successfully.")
            except Exception as cleanup_error:
                print(f"⚠️ Minor: Temp file cleanup deferred: {cleanup_error}")


@app.route('/questions', methods=['GET', 'POST'])
def get_questions():
    if request.method == 'POST':
        # Capture the custom topic entered by the user
        data = request.get_json()
        user_topic = data.get('topic', 'Frontend Development')
        
        # Tell Mistral to generate questions for that topic on the fly
        custom_questions = fetch_live_questions(user_topic)
        return jsonify(custom_questions)
        
    # Standard GET request behavior (initial page load)
    return jsonify(questions)


if __name__ == '__main__':
    # Execute the API fetch before the Flask server opens its doors
    fetch_live_questions()
    app.run(debug=True, port=5001)