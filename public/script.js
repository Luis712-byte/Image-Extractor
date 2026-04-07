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
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchMainView(e.target.dataset.view));
        });

        // Form
        const form = document.getElementById('extractForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleExtractSubmit(e));
        }

        // Buttons
        const newExtractionBtn = document.getElementById('newExtractionBtn');
        const toggleViewBtn = document.getElementById('toggleViewBtn');
        const downloadAllBtn = document.getElementById('downloadAllBtn');
        const optionsToggle = document.querySelector('.options-toggle');
        const clearChatBtn = document.querySelector('.clear-chat-btn');

        if (newExtractionBtn) {
            newExtractionBtn.addEventListener('click', () => this.resetForm());
        }
        if (toggleViewBtn) {
            toggleViewBtn.addEventListener('click', () => this.toggleView());
        }
        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', () => this.downloadAll());
        }
        if (optionsToggle) {
            optionsToggle.addEventListener('click', () => this.toggleOptions());
        }
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => this.clearChat());
        }

        // Settings
        document.querySelectorAll('.setting-item input, .setting-item select').forEach(input => {
            input.addEventListener('change', (e) => this.saveSetting(e.target.id, e.target.value));
        });

        // Initialize
        this.updateHistoryDisplay();
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
        this.hideResults();

        try {
            console.log('🔍 Iniciando extracción para URL:', url);
            
            // Get advanced options
            const maxImages = document.getElementById('maxImages')?.value || 50;
            const outputDirectory = document.getElementById('outputDirectory')?.value || './downloads';
            const aiMethod = document.getElementById('aiMethod')?.value || 'heuristics';
            const visualAnalysis = document.getElementById('visualAnalysis').value === 'true';
            const followLinks = document.getElementById('followLinks').value === 'true';

            const requestData = {
                url: url,
                outputDirectory: outputDirectory,
                maxImages: maxImages,
                aiProvider: aiMethod,
                visualAnalysis: visualAnalysis,
                followLinks: followLinks
            };

            console.log('📤 Enviando al backend:', requestData);
            
            // Update progress
            this.updateProgress(20);
            
            const payload = { 
                url, 
                maxImages: parseInt(maxImages), 
                outputDirectory,
                aiProvider: aiMethod,
                visualAnalysis,
                followLinks
            };
            
            console.log('📦 Payload JSON:', JSON.stringify(payload, null, 2));
            
            const response = await fetch('http://localhost:3000/image-extractor/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            console.log('📡 Respuesta recibida:', response.status);
            this.updateProgress(60);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('📊 Resultado del servidor:', result);
            this.updateProgress(80);
            
            if (result.success) {
                console.log('✅ Extracción exitosa, mostrando resultados...');
                
                // Calculate processing time
                const processTime = ((Date.now() - startTime) / 1000).toFixed(1);
                result.data.processTime = processTime;
                
                // Add to history
                this.addToHistory(url, result.data);
                
                this.displayResults(result.data);
                this.showToast('¡Imágenes extraídas con éxito!', 'success');
                this.updateProgress(100);
            } else {
                console.error('❌ Error en la extracción:', result);
                throw new Error(result.message || 'Error en la extracción');
            }

        } catch (error) {
            console.error('💥 Error completo:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            setTimeout(() => {
                this.showLoadingOverlay(false);
                this.updateProgress(0);
            }, 1000);
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
            <div class="category">
                <h3>
                    <span class="category-icon">${this.getCategoryIcon(category.category)}</span>
                    ${this.getCategoryName(category.category)}
                    <span class="category-count">${category.images.length}</span>
                    <button class="view-all-btn" onclick="app.showCategoryModal('${category.category}')">
                        <i class="fas fa-expand"></i>
                        Ver todas
                    </button>
                </h3>
                <div class="images-grid">
                    ${category.images.slice(0, 12).map(image => `
                        <img 
                            src="${image.originalUrl}" 
                            alt="${image.filename}"
                            class="image-thumb"
                            onclick="window.open('${image.originalUrl}', '_blank')"
                            title="${image.filename}"
                            loading="lazy"
                        >
                    `).join('')}
                    ${category.images.length > 12 ? `
                        <div class="more-images" onclick="app.showCategoryModal('${category.category}')">
                            <span>+${category.images.length - 12}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        console.log('🎨 Categorías renderizadas:', data.categories.length, 'categorías');

        // Generar mensajes del chat
        this.generateChatMessages(data);
        this.generateFolderStructure(data);

        results.style.display = 'block';
        console.log('✅ Resultados mostrados exitosamente');
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
        chatMessages.innerHTML = '';
        this.showToast('Chat limpiado', 'info');
    }

    // Download all
    downloadAll() {
        if (!this.currentExtraction) {
            this.showToast('No hay resultados para descargar', 'error');
            return;
        }
        
        this.showToast('Preparando descarga...', 'info');
        // Implement download functionality
        console.log('📥 Descargando todas las imágenes...');
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
        
        this.showToast(`Preparando descarga de ${this.currentModalCategory.images.length} imágenes...`, 'info');
        
        // Create a zip file or trigger individual downloads
        this.currentModalCategory.images.forEach((image, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = image.originalUrl;
                link.download = image.filename;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 200); // Stagger downloads
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
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        
        if (type === 'system') {
            messageDiv.innerHTML = message;
        } else {
            messageDiv.textContent = message;
        }
        
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
