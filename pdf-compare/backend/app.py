from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import tempfile
import uuid
import socket
from pdf_comparator import compare_pdfs

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), 'pdf-compare-uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def get_free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "ok"})

@app.route('/api/compare', methods=['POST'])
def compare():
    if 'file1' not in request.files or 'file2' not in request.files:
        return jsonify({"error": "Missing files"}), 400

    file1 = request.files['file1']
    file2 = request.files['file2']

    req_id = str(uuid.uuid4())
    file1_path = os.path.join(UPLOAD_FOLDER, f"temp1_{req_id}.pdf")
    file2_path = os.path.join(UPLOAD_FOLDER, f"temp2_{req_id}.pdf")
    output_path = os.path.join(UPLOAD_FOLDER, f"result_{req_id}.pdf")

    file1.save(file1_path)
    file2.save(file2_path)

    try:
        metadata = compare_pdfs(file1_path, file2_path, output_path)
        return jsonify({
            "metadata": metadata,
            "result_url": f"/api/download/result_{req_id}.pdf"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/download/<filename>', methods=['GET'])
def download(filename):
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True, download_name="result.pdf")
    return jsonify({"error": "File not found"}), 404

if __name__ == '__main__':
    port = int(os.environ.get("FLASK_PORT", 5000))
    # Explicitly bind to 127.0.0.1 to avoid IPv6/IPv4 confusion on Windows
    app.run(host='127.0.0.1', port=port)
