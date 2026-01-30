import json
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import subprocess
import pathlib
import shutil

# --- PATH SETUP ---
CURRENT_DIR = pathlib.Path(__file__).parent.resolve()
DATA_DIR = CURRENT_DIR / "data"
MODEL_SAVE_PATH = CURRENT_DIR / "saved_model_tf" 
CLASSES_SAVE_PATH = CURRENT_DIR / "classes.npy"
WEB_MODEL_OUTPUT_DIR = CURRENT_DIR.parent / "asl-practice-app" / "public" / "model"

print(f"Data Source: {DATA_DIR}")
print(f"Web Output:  {WEB_MODEL_OUTPUT_DIR}")

# --- LOAD DATA ---
data = []
labels = []
jsonl_files = list(DATA_DIR.glob("*.jsonl"))

if not jsonl_files:
    print("❌ ERROR: No .jsonl files found in training/data/")
    exit(1)

for file_path in jsonl_files:
    with file_path.open('r', encoding='utf-8') as f:
        for line in f:
            try:
                sample = json.loads(line)
                features = []
                for point in sample['landmarks']:
                    features.extend([point['x'], point['y'], point['z']])
                data.append(features)
                labels.append(sample['label'])
            except: continue

X = np.array(data)
y = np.array(labels)
print(f"Loaded {len(X)} samples.")

# --- ENCODE LABELS ---
label_encoder = LabelEncoder()
y_encoded = label_encoder.fit_transform(y)
np.save(CLASSES_SAVE_PATH, label_encoder.classes_)

X_train, X_test, y_train, y_test = train_test_split(X, y_encoded, test_size=0.2, random_state=42)

# --- BUILD MODEL ---
model = tf.keras.models.Sequential()
model.add(tf.keras.Input(shape=(63,))) 
model.add(tf.keras.layers.Dense(128, activation='relu'))
model.add(tf.keras.layers.Dropout(0.2))
model.add(tf.keras.layers.Dense(64, activation='relu'))
model.add(tf.keras.layers.Dense(len(label_encoder.classes_), activation='softmax'))

# CHANGED: Added Precision and Recall, and fixed verbose output
model.compile(optimizer='adam', 
              loss='sparse_categorical_crossentropy', 
              metrics=['accuracy']) # Precision/Recall need one-hot encoding usually, keeping accuracy simple for sparse labels

# --- TRAIN ---
print("\nStarting Training...")
# verbose=1 shows the progress bar [=========]
history = model.fit(X_train, y_train, 
                    epochs=150, 
                    batch_size=32, 
                    verbose=1, 
                    validation_data=(X_test, y_test))

print("\nTraining Complete.")

# --- SAVE (EXPORT) ---
print(f"Saving to SavedModel directory: {MODEL_SAVE_PATH}...")
model.export(str(MODEL_SAVE_PATH)) 
print("✅ Native SavedModel generated.")

# Ensure output directory exists and is clean
if WEB_MODEL_OUTPUT_DIR.exists():
    shutil.rmtree(WEB_MODEL_OUTPUT_DIR)
WEB_MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# --- CONVERT ---
print("Converting to TensorFlow.js...")
command = [
    "tensorflowjs_converter",
    "--input_format=tf_saved_model", 
    str(MODEL_SAVE_PATH),
    str(WEB_MODEL_OUTPUT_DIR)
]

try:
    subprocess.run(command, check=True)
    print("\n✅ SUCCESS! New model generated.")
    print(f"Check this folder: {WEB_MODEL_OUTPUT_DIR}")
except Exception as e:
    print(f"\n❌ CONVERSION FAILED: {e}")