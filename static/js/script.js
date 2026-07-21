document.addEventListener('DOMContentLoaded', () => {
    // --- SPLASH SCREEN LOGIC ---
    const splashScreen = document.getElementById('splash-screen');
    const mainContent = document.getElementById('main-content');
    const bootProgress = document.getElementById('boot-progress');
    
    let bootStep = 1;
    const maxSteps = 6;
    
    // Check if we've already booted (use sessionStorage so it doesn't show on every navigation)
    if (!sessionStorage.getItem('booted')) {
        const bootInterval = setInterval(() => {
            const textEl = document.getElementById(`boot-text-${bootStep}`);
            if (textEl) {
                textEl.style.opacity = '1';
                bootProgress.style.width = `${(bootStep / maxSteps) * 100}%`;
            }
            
            bootStep++;
            if (bootStep > maxSteps + 1) {
                clearInterval(bootInterval);
                setTimeout(() => {
                    splashScreen.style.opacity = '0';
                    setTimeout(() => {
                        splashScreen.classList.add('d-none');
                        mainContent.classList.remove('d-none');
                        sessionStorage.setItem('booted', 'true');
                    }, 500);
                }, 800);
            }
        }, 600);
    } else {
        splashScreen.classList.add('d-none');
        mainContent.classList.remove('d-none');
    }

    // --- UPLOAD LOGIC ---
    const imageUpload = document.getElementById('imageUpload');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('imagePreview');
    const uploadLabel = document.querySelector('.upload-area');
    const btnDetect = document.getElementById('btn-detect');
    
    let selectedFile = null;

    if (imageUpload) {
        imageUpload.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                selectedFile = e.target.files[0];
                const reader = new FileReader();
                reader.onload = function(e) {
                    imagePreview.src = e.target.result;
                    uploadLabel.classList.add('d-none');
                    previewContainer.classList.remove('d-none');
                }
                reader.readAsDataURL(selectedFile);
            }
        });
    }

    // --- SCANNING & DETECTION LOGIC ---
    const uploadState = document.getElementById('upload-state');
    const scanningState = document.getElementById('scanning-state');
    const resultState = document.getElementById('result-state');
    const scanImage = document.getElementById('scanImage');
    const scanProgress = document.getElementById('scan-progress');
    const scanStatusText = document.getElementById('scan-status-text');
    
    const resultImage = document.getElementById('resultImage');
    const btnDownload = document.getElementById('btn-download');
    const btnReset = document.getElementById('btn-reset');
    
    const analysisPlaceholder = document.getElementById('analysis-placeholder');
    const analysisResults = document.getElementById('analysis-results');
    
    if (btnDetect) {
        btnDetect.addEventListener('click', async () => {
            if (!selectedFile) return;

            // 1. Enter Scanning State
            uploadState.classList.add('d-none');
            scanningState.classList.remove('d-none');
            scanImage.src = imagePreview.src;
            
            // Start fake progress while API call happens
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.floor(Math.random() * 5) + 1;
                if (progress > 95) progress = 95; // Hold at 95% until API returns
                scanProgress.innerText = `${progress}%`;
                
                if (progress > 30) scanStatusText.innerText = "Analyzing Texture...";
                if (progress > 60) scanStatusText.innerText = "Detecting Anomalies...";
                if (progress > 85) scanStatusText.innerText = "Finalizing Prediction...";
            }, 100);

            // 2. Make API Call
            const formData = new FormData();
            formData.append('image', selectedFile);

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                clearInterval(progressInterval);
                scanProgress.innerText = "100%";
                scanStatusText.innerText = "Prediction Complete";

                setTimeout(() => {
                    showResults(data);
                }, 800);

            } catch (error) {
                console.error("Error during detection:", error);
                clearInterval(progressInterval);
                alert("Detection failed. Make sure server is running and best.pt is placed.");
                resetUI();
            }
        });
    }

    // --- RENDER RESULTS ---
    function showResults(data) {
        if (data.error) {
            alert(data.error);
            resetUI();
            return;
        }

        // Hide scanner, show results
        scanningState.classList.add('d-none');
        resultState.classList.remove('d-none');
        
        resultImage.src = data.image_url;
        btnDownload.href = data.image_url;
        
        // Show Right Panel
        analysisPlaceholder.classList.add('d-none');
        analysisResults.classList.remove('d-none');
        
        // Update Info
        document.getElementById('res-time').innerText = `${data.inference_time} ms`;
        document.getElementById('res-count').innerText = data.num_objects;
        document.getElementById('res-device').innerText = data.device;
        
        const defectList = document.getElementById('defect-list');
        const statusBanner = document.getElementById('status-banner');
        defectList.innerHTML = ''; // clear previous
        
        let maxConf = 0;

        if (data.num_objects === 0) {
            // No defects found
            statusBanner.className = 'alert alert-success mb-3 text-center font-orbitron fw-bold shadow-neon-green';
            statusBanner.innerHTML = '<i class="fa-solid fa-circle-check"></i> NO DEFECT DETECTED';
            resultImage.classList.replace('border-danger', 'border-success');
            document.getElementById('confidence-gauge').classList.add('d-none');
        } else {
            // Defects found
            statusBanner.className = 'alert alert-danger mb-3 text-center font-orbitron fw-bold';
            statusBanner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> DEFECTS FOUND';
            resultImage.classList.replace('border-success', 'border-danger');
            
            data.detected_objects.forEach(obj => {
                if (obj.confidence > maxConf) maxConf = obj.confidence;
                const div = document.createElement('div');
                div.className = 'd-flex justify-content-between text-warning small mb-1 border-bottom border-secondary pb-1';
                div.innerHTML = `<span><i class="fa-solid fa-bug"></i> ${obj.class_name.toUpperCase()}</span> <span>${obj.confidence}%</span>`;
                defectList.appendChild(div);
            });
            
            // Update Confidence Gauge
            const gaugeContainer = document.getElementById('confidence-gauge');
            gaugeContainer.classList.remove('d-none');
            updateGauge(maxConf);
        }
        
        // Add to history
        addHistoryItem(data);
    }
    
    function updateGauge(confidence) {
        const gauge = document.querySelector('.circular-progress');
        const valContainer = document.querySelector('.value-container');
        
        // Color based on confidence (red for high confidence of defect)
        let color = '#ff2a2a'; 
        if(confidence < 50) color = '#ffcc00';
        
        let progressValue = 0;
        const progressEndValue = Math.round(confidence);
        
        // Animate gauge
        const speed = 20;
        const progress = setInterval(() => {
            progressValue++;
            valContainer.textContent = `${progressValue}%`;
            gauge.style.background = `conic-gradient(
                ${color} ${progressValue * 3.6}deg,
                #222 ${progressValue * 3.6}deg
            )`;
            if (progressValue >= progressEndValue) {
                clearInterval(progress);
            }
        }, speed);
    }

    function addHistoryItem(data) {
        const historyContainer = document.getElementById('history-container');
        // Remove empty state if exists
        const emptyState = historyContainer.querySelector('.text-muted.text-center');
        if(emptyState) emptyState.remove();
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        
        const item = document.createElement('div');
        item.className = 'history-item';
        
        let statusHtml = data.num_objects > 0 
            ? `<span class="text-danger"><i class="fa-solid fa-bug"></i> Defect</span>`
            : `<span class="text-success"><i class="fa-solid fa-check"></i> Clean</span>`;
            
        item.innerHTML = `
            <div class="d-flex justify-content-between mb-1">
                <strong>IMG_${Math.floor(Math.random()*9000)+1000}</strong>
                <span class="text-muted" style="font-size:0.7rem">${timeStr}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                ${statusHtml}
                <span class="text-muted small">${data.inference_time}ms</span>
            </div>
        `;
        
        historyContainer.prepend(item);
    }

    function resetUI() {
        resultState.classList.add('d-none');
        scanningState.classList.add('d-none');
        uploadState.classList.remove('d-none');
        
        uploadLabel.classList.remove('d-none');
        previewContainer.classList.add('d-none');
        imageUpload.value = '';
        selectedFile = null;
        
        analysisResults.classList.add('d-none');
        analysisPlaceholder.classList.remove('d-none');
    }

    if (btnReset) {
        btnReset.addEventListener('click', resetUI);
    }
});
