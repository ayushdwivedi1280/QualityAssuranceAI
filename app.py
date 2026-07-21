import os
import time
import json
import uuid
import cv2
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from werkzeug.utils import secure_filename

# Attempt to load YOLO model
try:
    from ultralytics import YOLO
    model_path = os.path.join(os.path.dirname(__file__), 'best.pt')
    if os.path.exists(model_path):
        print("Loading YOLO weights from best.pt...")
        model = YOLO(model_path)
        print("Model loaded successfully.")
    else:
        print("YOLO model not found. Please place best.pt in the project root.")
        model = None
except ImportError:
    print("Ultralytics package not found. Please install it.")
    model = None

app = Flask(__name__)

# Configure upload and result folders
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
RESULT_FOLDER = os.path.join(os.path.dirname(__file__), 'results')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULT_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['RESULT_FOLDER'] = RESULT_FOLDER
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/camera')
def camera():
    return render_template('camera.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if model is None:
        return jsonify({'error': 'YOLO model not found. Please place best.pt in the project root.'}), 500

    if 'image' not in request.files:
        return jsonify({'error': 'No image part'}), 400
    file = request.files['image']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Unique ID to prevent overwriting
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        
        # Inference
        start_time = time.time()
        results = model.predict(source=filepath, save=False)
        inference_time = (time.time() - start_time) * 1000 # in ms
        
        # Process results
        result = results[0]
        detected_objects = []
        
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            class_name = model.names[class_id]
            confidence = float(box.conf[0].item())
            detected_objects.append({
                'class_id': class_id,
                'class_name': class_name,
                'confidence': round(confidence * 100, 2)
            })
            
        # Save prediction image
        result_image_array = result.plot()
        result_filename = f"result_{unique_filename}"
        result_filepath = os.path.join(app.config['RESULT_FOLDER'], result_filename)
        cv2.imwrite(result_filepath, result_image_array)
        
        device = result.speed if hasattr(result, 'speed') else 'CPU'
        if isinstance(device, dict):
            # device is a dict containing preprocess, inference, postprocess timings, not the device name.
            # to get device, we can check model.device
            pass
        
        device_name = str(model.device).upper()
        if device_name == 'CPU':
            pass
        elif device_name == '0':
            device_name = 'GPU'
            
        return jsonify({
            'success': True,
            'image_url': f'/results/{result_filename}',
            'detected_objects': detected_objects,
            'num_objects': len(detected_objects),
            'inference_time': round(inference_time, 2),
            'model_name': 'YOLOv8',
            'device': device_name,
            'classes': model.names
        })
        
    return jsonify({'error': 'Invalid file format'}), 400

@app.route('/results/<filename>')
def serve_result_image(filename):
    return send_from_directory(app.config['RESULT_FOLDER'], filename)

# Generator for camera feed
def generate_frames():
    cap = cv2.VideoCapture(0)
    while True:
        success, frame = cap.read()
        if not success:
            break
        else:
            if model is not None:
                # Run YOLO inference on the frame
                results = model.predict(source=frame, save=False, verbose=False)
                frame = results[0].plot()
                
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                   
    cap.release()

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
