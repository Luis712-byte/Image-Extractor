class ImageExtractorApp {
    constructor() {
        this.currentExtraction = null;
        this.currentView = 'grid'; // 'grid' or 'chat'
        this.currentMainView = 'extract'; // 'extract', 'history', 'settings'
        this.extractionHistory = this.loadHistory();
        this.settings = this.loadSettings();
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Form
        const form = document.getElementById('extractForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleExtractSubmit(e));
        }

        // Quick Settings - Sync with hidden advanced inputs
        const maxImagesQuick = document.getElementById('maxImagesQuick');
        const maxImages = document.getElementById('maxImages');
        if (maxImagesQuick && maxImages) {
            maxImagesQuick.addEventListener('change', (e) => {
                maxImages.value = e.target.value;
                this.saveSetting('maxImages', e.target.value);
            });
            
            // Initialize with saved value
            const savedMaxImages = this.settings.maxImages || 50;
            maxImagesQuick.value = savedMaxImages;
            maxImages.value = savedMaxImages;
        }

        const aiMethodQuick = document.getElementById('aiMethodQuick');
        const aiMethod = document.getElementById('aiMethod');
        if (aiMethodQuick && aiMethod) {
            aiMethodQuick.addEventListener('change', (e) => {
                aiMethod.value = e.target.value;
                this.saveSetting('aiMethod', e.target.value);
            });
            
            // Initialize with saved value
            const savedAiMethod = this.settings.aiMethod || 'heuristics';
            aiMethodQuick.value = savedAiMethod;
            aiMethod.value = savedAiMethod;
        }

        const visualAnalysisQuick = document.getElementById('visualAnalysisQuick');
        const visualAnalysis = document.getElementById('visualAnalysis');
        if (visualAnalysisQuick && visualAnalysis) {
            visualAnalysisQuick.addEventListener('change', (e) => {
                visualAnalysis.value = e.target.value;
                this.saveSetting('visualAnalysis', e.target.value);
            });
            
            // Initialize with saved value
            const savedVisualAnalysis = this.settings.visualAnalysis || false;
            visualAnalysisQuick.value = savedVisualAnalysis.toString();
            visualAnalysis.value = savedVisualAnalysis.toString();
        }

        // Advanced Toggle
        const advancedToggle = document.querySelector('.advanced-toggle');
        const advancedContent = document.querySelector('.advanced-content');
        if (advancedToggle && advancedContent) {
            advancedToggle.addEventListener('click', () => {
                const isVisible = advancedContent.style.display !== 'none';
                advancedContent.style.display = isVisible ? 'none' : 'block';
                advancedToggle.classList.toggle('active', !isVisible);
            });
        }

        // Buttons
        const newExtractionBtn = document.getElementById('newExtractionBtn');
        const downloadAllBtn = document.getElementById('downloadAllBtn');

        if (newExtractionBtn) {
            newExtractionBtn.addEventListener('click', () => this.resetForm());
        }
        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', () => this.downloadAll());
        }

        // Settings
        document.querySelectorAll('.advanced-input, .advanced-select').forEach(input => {
            input.addEventListener('change', (e) => this.saveSetting(e.target.id, e.target.value));
        });

        // Initialize with saved settings
        this.initializeSettings();
    }

    initializeSettings() {
        // Apply saved settings to all form elements
        Object.keys(this.settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                element.value = this.settings[key];
            }
        });
    }

    async handleExtractSubmit(event) {
        event.preventDefault();
        
        const url = document.getElementById('url').value.trim();
        
        if (!this.isValidUrl(url)) {
            this.showToast('Por favor, ingresa una URL válida', 'error');
            return;
        }

        await this.extractImages(url);
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    async extractImages(url) {
        const startTime = Date.now();
        this.showLoadingOverlay(true);
        this.initializeRealTimePreview();
        this.hideResults();

        try {
            console.log('🔍 Iniciando extracción para URL:', url);
            
            // Get advanced options
            const maxImages = document.getElementById('maxImages')?.value || 50;
            const outputDirectory = document.getElementById('outputDirectory')?.value || './downloads';
            const aiMethod = document.getElementById('aiMethod')?.value || 'heuristics';
            const visualAnalysis = document.getElementById('visualAnalysis').value === 'true';
            const followLinks = document.getElementById('followLinks').value === 'true';

            const payload = { 
                url, 
                maxImages: parseInt(maxImages), 
                outputDirectory,
                aiProvider: aiMethod,
                visualAnalysis,
                followLinks
            };
            
            console.log('� Payload JSON:', JSON.stringify(payload, null, 2));
            
            // Show initial progress
            this.updateProgress(10);
            this.updateRealTimePreview('Conectando con el servidor...', 'loading');
            
            const response = await fetch('http://localhost:3000/image-extractor/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            console.log('📡 Respuesta recibida:', response.status);
            this.updateProgress(30);
            this.updateRealTimePreview('Analizando la página web...', 'loading');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('📊 Resultado del servidor:', result);
            this.updateProgress(70);
            this.updateRealTimePreview('Organizando imágenes con IA...', 'loading');
            
            if (result.success) {
                console.log('✅ Extracción exitosa, mostrando resultados...');
                
                // Calculate processing time
                const processTime = ((Date.now() - startTime) / 1000).toFixed(1);
                result.data.processTime = processTime;
                
                // Show preview of found images
                this.updateRealTimePreview(
                    `¡Listo! ${result.data.totalImages} imágenes encontradas en ${processTime}s`, 
                    'success',
                    result.data.categories
                );
                
                this.updateProgress(90);
                
                // Add to history
                this.addToHistory(url, result.data);
                
                // Small delay to show preview
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                this.displayResults(result.data);
                this.showToast('¡Imágenes extraídas con éxito!', 'success');
                this.updateProgress(100);
                
                // Hide preview after showing results
                setTimeout(() => {
                    this.hideRealTimePreview();
                }, 2000);
                
            } else {
                console.error('❌ Error en la extracción:', result);
                this.updateRealTimePreview(`Error: ${result.message}`, 'error');
                throw new Error(result.message || 'Error en la extracción');
            }

        } catch (error) {
            console.error('💥 Error completo:', error);
            this.updateRealTimePreview(`Error: ${error.message}`, 'error');
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            setTimeout(() => {
                this.showLoadingOverlay(false);
                this.updateProgress(0);
                this.hideRealTimePreview();
            }, 3000);
        }
    }

    initializeRealTimePreview() {
        // Create preview container if it doesn't exist
        let previewContainer = document.getElementById('realTimePreview');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'realTimePreview';
            previewContainer.className = 'real-time-preview';
            document.body.appendChild(previewContainer);
        }
        
        previewContainer.style.display = 'block';
        previewContainer.innerHTML = `
            <div class="preview-content">
                <div class="preview-header">
                    <div class="preview-icon">
                        <i class="fas fa-magic"></i>
                    </div>
                    <div class="preview-text">
                        <h3>Extracción en progreso</h3>
                        <p class="preview-status">Iniciando...</p>
                    </div>
                </div>
                <div class="preview-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="previewProgressFill"></div>
                    </div>
                </div>
                <div class="preview-images" id="previewImages"></div>
            </div>
        `;
    }

    updateRealTimePreview(message, status = 'loading', categories = null) {
        const previewStatus = document.querySelector('.preview-status');
        const previewProgressFill = document.getElementById('previewProgressFill');
        const previewImages = document.getElementById('previewImages');
        
        if (previewStatus) {
            previewStatus.textContent = message;
        }
        
        // Update status icon
        const previewIcon = document.querySelector('.preview-icon i');
        if (previewIcon) {
            previewIcon.className = status === 'success' ? 'fas fa-check-circle' : 
                                   status === 'error' ? 'fas fa-exclamation-circle' : 
                                   'fas fa-spinner fa-spin';
        }
        
        // Show preview images if available
        if (categories && previewImages) {
            previewImages.innerHTML = categories.slice(0, 3).map(category => `
                <div class="preview-category">
                    <div class="preview-category-header">
                        <span class="category-icon">${this.getCategoryIcon(category.category)}</span>
                        <span class="category-name">${this.getCategoryName(category.category)}</span>
                        <span class="category-count">${category.images.length}</span>
                    </div>
                    <div class="preview-category-images">
                        ${category.images.slice(0, 4).map(img => `
                            <img src="${img.originalUrl}" alt="${img.filename}" loading="lazy">
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }
    }

    hideRealTimePreview() {
        const previewContainer = document.getElementById('realTimePreview');
        if (previewContainer) {
            previewContainer.style.display = 'none';
        }
    }

    displayResults(data) {
        console.log('🎯 displayResults llamado con:', data);
        
        this.currentExtraction = data;
        
        const results = document.getElementById('results');
        const totalImages = document.getElementById('totalImages');
        const downloadedImages = document.getElementById('downloadedImages');
        const categories = document.getElementById('categories');
        const categoriesGrid = document.getElementById('categoriesGrid');
        const chatMessages = document.getElementById('chatMessages');
        const folderStructure = document.getElementById('folderStructure');
        const processTime = document.getElementById('processTime');

        console.log('🔍 Elementos encontrados:', {
            results: !!results,
            totalImages: !!totalImages,
            downloadedImages: !!downloadedImages,
            categories: !!categories,
            categoriesGrid: !!categoriesGrid,
            chatMessages: !!chatMessages,
            folderStructure: !!folderStructure,
            processTime: !!processTime
        });

        // Verificar si los datos existen
        if (!data || !data.categories || data.categories.length === 0) {
            console.error('❌ No hay datos válidos para mostrar');
            this.showToast('No se encontraron categorías válidas', 'error');
            return;
        }

        // Actualizar estadísticas
        totalImages.textContent = data.totalImages;
        downloadedImages.textContent = data.downloadedImages;
        categories.textContent = data.categories.length;
        if (processTime) {
            processTime.textContent = data.processTime ? `${data.processTime}s` : '0s';
        }

        console.log('📊 Estadísticas actualizadas:', {
            totalImages: data.totalImages,
            downloadedImages: data.downloadedImages,
            categoriesCount: data.categories.length,
            processTime: data.processTime
        });

        // Mostrar categorías en vista de grid
        categoriesGrid.innerHTML = data.categories.map(category => `
            <div class="category-card" onclick="app.downloadCategory('${category.category}')">
                <div class="category-header">
                    <div class="category-icon">${this.getCategoryIcon(category.category)}</div>
                    <h3>${this.getCategoryName(category.category)}</h3>
                </div>
                <div class="category-stats">
                    <span class="image-count">${category.images.length} imágenes</span>
                </div>
                <div class="category-preview">
                    ${category.images.slice(0, 3).map(img => `
                        <img src="${img.originalUrl}" alt="${img.filename}" loading="lazy" 
                             onclick="event.stopPropagation(); app.showImagePreview('${img.originalUrl}', '${img.filename}', '${category.category}')">
                    `).join('')}
                </div>
                <div class="category-actions">
                    <button class="download-btn" onclick="event.stopPropagation(); app.downloadCategory('${category.category}')">
                        <i class="fas fa-download"></i>
                        Descargar URLs
                    </button>
                </div>
            </div>
        `).join('');

        // Vista de chat
        if (chatMessages) {
            chatMessages.innerHTML = `
            <div class="chat-message system">
                <strong>🎯 Extracción completada</strong><br>
                <strong>URL:</strong> ${data.url}<br>
                <strong>Imágenes encontradas:</strong> ${data.totalImages}<br>
                <strong>Categorías:</strong> ${data.categories.length}<br>
                <strong>Tiempo de procesamiento:</strong> ${data.processTime}s
            </div>
        `;

            data.categories.forEach(category => {
            const message = `
                <div class="chat-message system">
                    <strong>${this.getCategoryIcon(category.category)} ${this.getCategoryName(category.category)}</strong><br>
                    <strong>Imágenes:</strong> ${category.images.length}<br>
                    <strong>Muestras:</strong><br>
                    ${category.images.slice(0, 3).map(img => `
                        <img src="${img.originalUrl}" alt="${img.filename}" style="max-width: 100px; margin: 2px; cursor: pointer;"
                             onclick="app.showImagePreview('${img.originalUrl}', '${img.filename}', '${category.category}')">
                    `).join('')}
                </div>
            `;
                chatMessages.innerHTML += message;
            });
        }

        results.style.display = 'block';
        console.log('✅ Resultados mostrados exitosamente');
    }

    showImagePreview(imageUrl, filename, category) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('imagePreviewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'imagePreviewModal';
            modal.className = 'image-preview-modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="max-width: 90vw; max-height: 90vh; position: relative; background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; animation: slideUp 0.3s ease-out;">
                <img src="${imageUrl}" alt="${filename}" style="max-width: 100%; max-height: 70vh; object-fit: contain; display: block;" id="previewImage">
                <button style="position: absolute; top: 16px; right: 16px; background: white; border: 1px solid #e5e7eb; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: #374151; transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); z-index: 10;" onclick="app.hideImagePreview()">
                    <i class="fas fa-times"></i>
                </button>
                <div style="padding: 24px; background: white; border-top: 1px solid #e5e7eb;">
                    <div style="font-weight: 700; font-size: 18px; color: #6366f1; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-image" style="color: #22d3ee; font-size: 16px;"></i>
                        ${filename}
                    </div>
                    <div style="font-size: 14px; color: #6b7280; line-height: 1.6;">
                        <div style="margin-bottom: 4px;">
                            <i class="fas fa-folder" style="color: #22d3ee; font-size: 12px; margin-right: 6px;"></i>
                            Categoría: ${this.getCategoryName(category)}
                        </div>
                        <div>
                            <i class="fas fa-link" style="color: #22d3ee; font-size: 12px; margin-right: 6px;"></i>
                            URL: ${imageUrl}
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
        
        // Add zoom functionality with mouse wheel
        const img = document.getElementById('previewImage');
        let scale = 1;
        
        const handleWheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            scale *= delta;
            scale = Math.min(Math.max(0.5, scale), 3);
            img.style.transform = `scale(${scale})`;
        };
        
        img.addEventListener('wheel', handleWheel);
        
        // Close on escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.hideImagePreview();
            }
        };
        
        document.addEventListener('keydown', handleEscape);
        
        // Store event listeners for cleanup
        modal._wheelHandler = handleWheel;
        modal._escapeHandler = handleEscape;
    }

    hideImagePreview() {
        const modal = document.getElementById('imagePreviewModal');
        if (modal) {
            const img = document.getElementById('previewImage');
            
            // Remove event listeners
            if (modal._wheelHandler && img) {
                img.removeEventListener('wheel', modal._wheelHandler);
            }
            if (modal._escapeHandler) {
                document.removeEventListener('keydown', modal._escapeHandler);
            }
            
            modal.style.display = 'none';
        }
    }

    // Navigation methods
    switchMainView(view) {
        this.currentMainView = view;
        
        // Update nav buttons
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update views
        const views = document.querySelectorAll('.view');
        views.forEach(v => {
            v.classList.remove('active');
        });
        
        const targetView = document.getElementById(`${view}View`);
        if (targetView) {
            targetView.classList.add('active');
        }
    }

    // Options toggle
    toggleOptions() {
        const panel = document.querySelector('.options-panel');
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
    }

    // View toggle
    toggleView() {
        const gridView = document.getElementById('gridView');
        const chatView = document.getElementById('chatView');
        const viewToggleBtn = document.getElementById('toggleViewBtn');
        
        if (!gridView || !chatView || !viewToggleBtn) {
            console.warn('View toggle elements not found');
            return;
        }
        
        const viewText = viewToggleBtn.querySelector('span');
        const viewIcon = viewToggleBtn.querySelector('i');

        if (this.currentView === 'grid') {
            this.currentView = 'chat';
            gridView.style.display = 'none';
            chatView.style.display = 'block';
            if (viewText) viewText.textContent = 'Ver Grid';
            if (viewIcon) viewIcon.className = 'fas fa-th';
        } else {
            this.currentView = 'grid';
            gridView.style.display = 'block';
            chatView.style.display = 'none';
            if (viewText) viewText.textContent = 'Ver Chat';
            if (viewIcon) viewIcon.className = 'fas fa-terminal';
        }
    }

    // Clear chat
    clearChat() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        this.showToast('Chat limpiado', 'info');
    }

    // Download all
    downloadAll() {
        if (!this.currentExtraction) {
            this.showToast('No hay resultados para descargar', 'error');
            return;
        }
        
        this.showToast('Iniciando descarga de todas las imágenes...', 'info');
        
        let totalImages = 0;
        this.currentExtraction.categories.forEach(category => {
            category.images.forEach((image, index) => {
                setTimeout(() => {
                    this.downloadImage(image.originalUrl, image.filename, category.category);
                }, totalImages * 200);
                totalImages++;
            });
        });
        
        this.showToast(`Descargando ${totalImages} imágenes...`, 'success');
    }

    // Progress update
    updateProgress(percentage) {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
    }

    // Loading overlay
    showLoadingOverlay(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    // History management
    loadHistory() {
        const saved = localStorage.getItem('extractionHistory');
        return saved ? JSON.parse(saved) : [];
    }

    saveHistory() {
        localStorage.setItem('extractionHistory', JSON.stringify(this.extractionHistory));
    }

    addToHistory(url, data) {
        const historyItem = {
            id: Date.now(),
            url,
            timestamp: new Date().toISOString(),
            totalImages: data.totalImages,
            downloadedImages: data.downloadedImages,
            categories: data.categories.length,
            processTime: data.processTime,
            fullData: data // Guardar los datos completos
        };
        
        this.extractionHistory.unshift(historyItem);
        if (this.extractionHistory.length > 10) {
            this.extractionHistory = this.extractionHistory.slice(0, 10);
        }
        
        this.saveHistory();
        this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        if (this.extractionHistory.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No hay extracciones anteriores</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = this.extractionHistory.map(item => `
            <div class="history-item ${item.fullData ? 'has-data' : 'no-data'}" data-id="${item.id}">
                <div class="history-info">
                    <h4>
                        ${this.getDomainName(item.url)}
                        ${item.fullData ? '<span class="data-indicator">✅</span>' : '<span class="data-indicator warning">⚠️</span>'}
                    </h4>
                    <p>
                        <span>${item.totalImages} imágenes</span>
                        <span>${item.categories} categorías</span>
                        <span>${item.processTime}s</span>
                    </p>
                    <small>${this.formatDate(item.timestamp)}</small>
                </div>
                <div class="history-actions">
                    <button class="btn-small view-btn" data-id="${item.id}" ${!item.fullData ? 'disabled' : ''}>
                        <i class="fas fa-eye"></i>
                        ${item.fullData ? 'Ver' : 'Recargar'}
                    </button>
                    <button class="btn-small delete-btn" data-id="${item.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners to the new buttons
        historyList.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                this.viewHistoryItem(id);
            });
        });

        historyList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                this.deleteHistoryItem(id);
            });
        });
    }

    // Settings management
    loadSettings() {
        const saved = localStorage.getItem('appSettings');
        return saved ? JSON.parse(saved) : {
            openaiKey: '',
            aiModel: 'gpt-4-vision-preview',
            defaultDir: './downloads',
            autoDownload: false
        };
    }

    saveSettings() {
        localStorage.setItem('appSettings', JSON.stringify(this.settings));
    }

    saveSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();
        this.showToast('Configuración guardada', 'success');
    }

    // Enhanced toast
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.warn('Toast container not found, using fallback alert');
            alert(message);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    getToastIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        return icons[type] || icons.info;
    }

    // Helper methods for history
    getDomainName(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return 'URL inválida';
        }
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMinutes = Math.floor(diffTime / (1000 * 60));
                return diffMinutes === 0 ? 'Ahora mismo' : `Hace ${diffMinutes} minutos`;
            }
            return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
        } else if (diffDays === 1) {
            return 'Ayer';
        } else if (diffDays < 7) {
            return `Hace ${diffDays} días`;
        } else {
            return date.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        }
    }

    viewHistoryItem(id) {
        const item = this.extractionHistory.find(h => h.id === id);
        if (item) {
            if (item.fullData) {
                // Cambiar a la vista de extracción
                this.switchMainView('extract');
                
                // Mostrar los resultados completos
                this.currentExtraction = item.fullData;
                this.displayResults(item.fullData);
                
                // Actualizar el formulario con la URL
                document.getElementById('url').value = item.url;
                
                // Hacer scroll a los resultados
                setTimeout(() => {
                    document.getElementById('results').scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }, 100);
                
                this.showToast(`Mostrando extracción de ${this.getDomainName(item.url)}`, 'success');
            } else {
                // Si no hay datos completos, mostrar mensaje y recargar
                this.showToast('Datos no disponibles. Recargando extracción...', 'warning');
                this.extractImages(item.url);
            }
        }
    }

    deleteHistoryItem(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta extracción del historial?')) {
            this.extractionHistory = this.extractionHistory.filter(h => h.id !== id);
            this.saveHistory();
            this.updateHistoryDisplay();
            this.showToast('Extracción eliminada del historial', 'success');
        }
    }

    clearAllHistory() {
        if (this.extractionHistory.length === 0) {
            this.showToast('No hay historial que eliminar', 'info');
            return;
        }
        
        if (confirm(`¿Estás seguro de que quieres eliminar todo el historial (${this.extractionHistory.length} extracciones)? Esta acción no se puede deshacer.`)) {
            this.extractionHistory = [];
            this.saveHistory();
            this.updateHistoryDisplay();
            this.showToast('Todo el historial ha sido eliminado', 'success');
        }
    }

    downloadImage(url, filename, category) {
        // Create a temporary link element to trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = `${category}/${filename}`;
        link.target = '_blank';
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Modal methods
    showCategoryModal(categoryName) {
        if (!this.currentExtraction) return;
        
        const category = this.currentExtraction.categories.find(c => c.category === categoryName);
        if (!category) return;
        
        const modal = document.getElementById('categoryModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalImageCount = document.getElementById('modalImageCount');
        const modalImagesGrid = document.getElementById('modalImagesGrid');
        
        modalTitle.innerHTML = `${this.getCategoryIcon(categoryName)} ${this.getCategoryName(categoryName)}`;
        modalImageCount.textContent = `${category.images.length} imágenes`;
        
        modalImagesGrid.innerHTML = category.images.map(image => `
            <div class="modal-image-item">
                <img 
                    src="${image.originalUrl}" 
                    alt="${image.filename}"
                    onclick="window.open('${image.originalUrl}', '_blank')"
                    loading="lazy"
                >
                <div class="image-info">
                    ${image.filename}
                    ${image.width && image.height ? `(${image.width}x${image.height})` : ''}
                </div>
            </div>
        `).join('');
        
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        this.currentModalCategory = category;
    }

    closeCategoryModal() {
        const modal = document.getElementById('categoryModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.currentModalCategory = null;
    }

    downloadCategory() {
        if (!this.currentModalCategory) return;
        
        this.showToast(`Iniciando descarga de ${this.currentModalCategory.images.length} imágenes...`, 'info');
        
        this.currentModalCategory.images.forEach((image, index) => {
            setTimeout(() => {
                this.downloadImage(image.originalUrl, image.filename, this.currentModalCategory.category);
            }, index * 200);
        });
        
        this.showToast('Descarga iniciada', 'success');
    }

    getCategoryIcon(category) {
        const icons = {
            'people': '👥',
            'nature': '🌿',
            'objects': '📦',
            'architecture': '🏢',
            'food': '🍕',
            'technology': '💻',
            'art': '🎨',
            'other': '📁'
        };
        return icons[category] || '📁';
    }

    getCategoryName(category) {
        const names = {
            'people': 'Personas',
            'nature': 'Naturaleza',
            'objects': 'Objetos',
            'architecture': 'Arquitectura',
            'food': 'Comida',
            'technology': 'Tecnología',
            'art': 'Arte',
            'other': 'Otros'
        };
        return names[category] || 'Otros';
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const extractBtn = document.getElementById('extractBtn');
        const btnText = extractBtn.querySelector('.btn-text');
        const btnLoading = extractBtn.querySelector('.btn-loading');
        
        if (show) {
            loading.style.display = 'block';
            extractBtn.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
        } else {
            loading.style.display = 'none';
            extractBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    hideResults() {
        const results = document.getElementById('results');
        results.style.display = 'none';
    }

    toggleView() {
        const categoriesView = document.getElementById('categoriesView');
        const chatView = document.getElementById('chatView');
        const viewText = document.querySelector('.view-text');
        const viewIcon = document.querySelector('.view-icon');

        if (this.currentView === 'categories') {
            this.currentView = 'chat';
            categoriesView.style.display = 'none';
            chatView.style.display = 'block';
            viewText.textContent = 'Ver categorías';
            viewIcon.textContent = '📁';
        } else {
            this.currentView = 'categories';
            categoriesView.style.display = 'block';
            chatView.style.display = 'none';
            viewText.textContent = 'Ver chat';
            viewIcon.textContent = '💬';
        }
    }

    generateChatMessages(data) {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';

        // Mensaje de inicio
        this.addChatMessage('🤖 **Sistema**: Extracción completada exitosamente', 'system');
        this.addChatMessage(`✅ **Resultado**: ${data.totalImages} imágenes encontradas, ${data.downloadedImages} descargadas`, 'system');
        this.addChatMessage('', 'system'); // Línea vacía

        // Mensajes por categoría
        data.categories.forEach(category => {
            this.addChatMessage(`📁 **Carpeta creada**: ${this.getCategoryName(category.category)}/`, 'system');
            this.addChatMessage(`📊 Contiene: ${category.images.length} imágenes`, 'system');
            
            // Listar algunas imágenes como ejemplo
            category.images.slice(0, 3).forEach((image, index) => {
                this.addChatMessage(`  🖼️ ${index + 1}. ${image.filename} (${image.width}x${image.height})`, 'user');
            });
            
            if (category.images.length > 3) {
                this.addChatMessage(`  ... y ${category.images.length - 3} imágenes más`, 'user');
            }
            this.addChatMessage('', 'system'); // Línea separadora
        });

        // Mensaje final
            this.addChatMessage('🎯 **Ubicación**: Todas las imágenes están organizadas en la carpeta ./downloads/', 'system');
            this.addChatMessage('💡 **Tip**: Puedes acceder a las imágenes directamente desde las carpetas de categoría', 'system');
        }
    }

    generateFolderStructure(data) {
        const folderStructure = document.getElementById('folderStructure');
        let structure = '📁 downloads/\n';

        data.categories.forEach(category => {
            structure += `├── 📁 ${category.category}/ (${category.images.length} imágenes)\n`;
            
            category.images.slice(0, 2).forEach(image => {
                structure += `│   ├── 🖼️ ${image.filename}\n`;
            });
            
            if (category.images.length > 2) {
                structure += `│   └── ... y ${category.images.length - 2} imágenes más\n`;
            }
        });

        structure += '└── ✅ Extracción completada';
        folderStructure.textContent = structure;
    }

    addChatMessage(message, type = 'user') {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        
        // Parse markdown-like formatting
        const formattedMessage = message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/🤖\s*\*\*Sistema\*\*:/g, '🤖 <strong>Sistema:</strong>')
            .replace(/✅\s*\*\*Resultado\*\*:/g, '✅ <strong>Resultado:</strong>')
            .replace(/📁\s*\*\*Carpeta creada\*\*:/g, '📁 <strong>Carpeta creada:</strong>')
            .replace(/📊\s*Contiene:/g, '📊 <strong>Contiene:</strong>')
            .replace(/🎯\s*\*\*Ubicación\*\*:/g, '🎯 <strong>Ubicación:</strong>')
            .replace(/💡\s*\*\*Tip\*\*:/g, '💡 <strong>Tip:</strong>');
        
        messageDiv.innerHTML = formattedMessage;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    resetForm() {
        const form = document.getElementById('extractForm');
        form.reset();
        this.hideResults();
        
        // Enfocar el input de URL
        document.getElementById('url').focus();
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.warn('Toast container not found, using fallback alert');
            alert(message);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ImageExtractorApp();
});
