from faster_whisper import WhisperModel
import os

MODEL_DIR = os.path.join(os.getcwd(), "models")
os.makedirs(MODEL_DIR, exist_ok=True)
print("Starting download...")
try:
    model = WhisperModel("tiny", device="cpu", compute_type="int8", download_root=MODEL_DIR)
    print("Download successful!")
except Exception as e:
    import traceback
    print("Error:", e)
    traceback.print_exc()
