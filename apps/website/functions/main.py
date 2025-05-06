import flask
import boto3
import os
import json
from firebase_admin import initialize_app
from firebase_functions import https_fn, options
from dotenv import load_dotenv
from flask import jsonify, make_response
from flask_cors import CORS, cross_origin

load_dotenv()

initialize_app()
app = flask.Flask(__name__)
cors = CORS(app)
polly_client = boto3.Session(aws_access_key_id=os.getenv("AWS_ACCESS_KEY"), aws_secret_access_key=os.getenv("AWS_SECRET_KEY"), region_name="us-east-1").client("polly")


@app.get("/")
def get_home():
    return jsonify({"message": "Welcome to the Vizij API"})

@app.post("/tts/get-audio")
@cross_origin()
def get_audio():
    try:
        data = flask.request.get_json()
        voice = data["voice"] if "voice" in data else "Ruth"

        audio_response = polly_client.synthesize_speech(VoiceId=voice,
                OutputFormat='mp3',
                Text = data["text"],
                Engine = 'neural')

        audio = audio_response["AudioStream"].read()

        audio_res = make_response(audio)
        audio_res.headers['Content-Type'] = 'audio/mpeg'
        return audio_res

    except Exception as e:
        print(e)
        print("Failed to get response from Polly")
        return jsonify({
            "status": "An error occurred while getting the AWS Polly Audio and Visemes"
        })

@app.post("/tts/get-visemes")
@cross_origin()
def get_visemes():
    try:
        data = flask.request.get_json()
        voice = data["voice"] if "voice" in data else "Ruth"

        viseme_response = polly_client.synthesize_speech(VoiceId=voice, OutputFormat= "json",Text = data["text"],SpeechMarkTypes= ["sentence", "word", "viseme"],Engine = 'neural')

        visemes = viseme_response["AudioStream"].read().decode().split("\n")
        list_of_visemes = [json.loads(v) for v in visemes[:-1] ]

        return jsonify({
            "all": list_of_visemes,
            "visemes": [v for v in list_of_visemes if v["type"] == "viseme"],
            "sentences": [v for v in list_of_visemes if v["type"] == "sentence"],
            "words": [v for v in list_of_visemes if v["type"] == "word"],
        })
    except Exception as e:
        print(e)
        print("Failed to get response from Polly")
        return jsonify({
            "status": "An error occurred while getting the AWS Polly Audio and Visemes"
        })

@https_fn.on_request(cors=options.CorsOptions(cors_origins=["*"], cors_methods=["get", "post"]))
def api(req: https_fn.Request) -> https_fn.Response:
    with app.request_context(req.environ):
        return app.full_dispatch_request()
