import os
import sys
import tempfile
import uvicorn
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import threading

# Fallback for faster_whisper import
try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None

app = FastAPI(title="Whisper Sidecar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------
# Use a PERSISTENT user-data directory so the model
# survives app restarts and doesn't depend on temp paths.
# Windows: C:\Users\<user>\AppData\Local\POSVoiceModel
# -------------------------------------------------------
def get_app_data_dir() -> str:
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        return os.path.join(base, "POSVoiceModel")
    else:
        base = os.path.expanduser("~")
        return os.path.join(base, ".pos_voice_model")

MODEL_DIR = get_app_data_dir()
MODEL_SIZE = "tiny"
DEVICE = "cpu"
COMPUTE_TYPE = "int8"

model_instance = None
downloading = False
download_progress = 0
download_error = ""

def get_model_cache_path():
    # faster-whisper stores models in a huggingface-style cache directory
    return os.path.join(MODEL_DIR, f"models--Systran--faster-whisper-{MODEL_SIZE}")

def is_model_downloaded():
    path = get_model_cache_path()
    if not os.path.exists(path):
        return False
    # Make sure there are actual files (not just an empty dir)
    for root, dirs, files in os.walk(path):
        if files:
            return True
    return False

def _log_error(msg: str):
    """Write error to a persistent log file so we can debug."""
    try:
        log_path = os.path.join(MODEL_DIR, "sidecar_error.log")
        os.makedirs(MODEL_DIR, exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as f:
            import datetime
            f.write(f"[{datetime.datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass

def download_model_task():
    global model_instance, downloading, download_progress, download_error
    downloading = True
    download_progress = 5
    download_error = ""
    try:
        os.makedirs(MODEL_DIR, exist_ok=True)
        download_progress = 10

        if not WhisperModel:
            download_error = "faster-whisper library not bundled in sidecar"
            return

        # This call downloads the model files (~75 MB for tiny) 
        # and then loads the model into memory.
        # We wrap it in a thread so it doesn't block the event loop.
        download_progress = 20
        m = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=MODEL_DIR
        )
        download_progress = 90
        model_instance = m
        download_progress = 100

    except Exception as e:
        import traceback
        download_error = str(e)
        msg = f"Error downloading/loading model: {e}\n{traceback.format_exc()}"
        print(msg)
        _log_error(msg)
    finally:
        downloading = False

@app.on_event("startup")
async def startup_event():
    """Auto-load the model on startup if it was previously downloaded."""
    global model_instance
    if is_model_downloaded() and WhisperModel:
        def _load():
            global model_instance
            try:
                model_instance = WhisperModel(
                    MODEL_SIZE,
                    device=DEVICE,
                    compute_type=COMPUTE_TYPE,
                    download_root=MODEL_DIR
                )
                print("Whisper model loaded successfully.")
            except Exception as e:
                import traceback
                msg = f"Failed to load existing model: {e}\n{traceback.format_exc()}"
                print(msg)
                _log_error(msg)
        # Load in a background thread so startup is not blocked
        t = threading.Thread(target=_load, daemon=True)
        t.start()

@app.get("/status")
def status():
    return {
        "status": "ok",
        "ready": model_instance is not None,
        "downloading": downloading,
        "progress": download_progress,
        "has_library": WhisperModel is not None,
        "model_dir": MODEL_DIR,
        "model_on_disk": is_model_downloaded(),
        "error": download_error
    }

@app.post("/download")
def download():
    """Start a background thread to download the Whisper model."""
    global downloading, download_error
    if not WhisperModel:
        return {"success": False, "error": "faster-whisper library not installed in sidecar"}
    if model_instance is not None:
        return {"success": True, "message": "Already downloaded and loaded"}
    if downloading:
        return {"success": True, "message": "Download already in progress"}

    download_error = ""
    t = threading.Thread(target=download_model_task, daemon=True)
    t.start()
    return {"success": True, "message": "Download started"}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not model_instance:
        return {"success": False, "error": "Model not loaded. Please download the model first."}

    tmp_path = None
    try:
        # Determine the correct file extension from the uploaded filename
        original_name = file.filename or "audio.webm"
        ext = os.path.splitext(original_name)[1] or ".webm"
        
        # Save uploaded audio to a temporary file with the correct extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Transcribe with Urdu language hint
        segments, info = model_instance.transcribe(
            tmp_path,
            language="ur",
            beam_size=5
        )
        
        text_parts = []
        total_logprob = 0
        total_no_speech = 0
        count = 0
        
        for seg in segments:
            text_parts.append(seg.text)
            total_logprob += getattr(seg, 'avg_logprob', 0)
            total_no_speech += getattr(seg, 'no_speech_prob', 0)
            count += 1
            
        text = " ".join(text_parts).strip()
        avg_logprob = total_logprob / count if count > 0 else 0
        avg_no_speech = total_no_speech / count if count > 0 else 0
        
        return {
            "success": True, 
            "text": text, 
            "language": info.language,
            "avg_logprob": avg_logprob,
            "no_speech_prob": avg_no_speech
        }

    except Exception as e:
        import traceback
        msg = traceback.format_exc()
        _log_error(msg)
        return {"success": False, "error": str(e)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
