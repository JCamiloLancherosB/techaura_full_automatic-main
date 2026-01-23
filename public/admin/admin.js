/**
 * Admin Panel Frontend JavaScript
 * Handles UI interactions and real-time updates
 */

// ========================================
// Global State
// ========================================

let currentTab = 'dashboard';
let currentPage = 1;
let selectedOrderId = null;
let socket = null;
let loadingStates = {}; // Track loading states for different sections
let abortControllers = {}; // Track abort controllers for cancellable requests
let retryAttempts = {}; // Track retry attempts

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSocket();
    initFilters();
    initModal();
    updateTime();
    checkWhatsAppStatus();
    loadDashboard();
    
    // Auto-refresh dashboard every 30 seconds
    setInterval(loadDashboard, 30000);
    setInterval(updateTime, 1000);
    // Check WhatsApp status every 15 seconds
    setInterval(checkWhatsAppStatus, 15000);
});

// ========================================
// Tab Management
// ========================================

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    
    currentTab = tabName;
    
    // Load data for the tab
    switch(tabName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'catalog':
            loadCatalog();
            break;
        case 'processing':
            loadProcessingQueue();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// ========================================
// Socket.IO Real-time Updates
// ========================================

function initSocket() {
    // Check if Socket.io is available
    if (typeof io === 'undefined') {
        console.warn('Socket.io not available. Real-time updates disabled.');
        showWarning('Actualizaciones en tiempo real no disponibles. La página se actualizará manualmente.');
        return;
    }
    
    try {
        socket = io({
            timeout: 5000,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            console.log('Connected to server');
            document.getElementById('status-badge').textContent = 'Sistema Activo';
            document.getElementById('status-badge').className = 'badge success';
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            document.getElementById('status-badge').textContent = 'Desconectado';
            document.getElementById('status-badge').className = 'badge danger';
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            document.getElementById('status-badge').textContent = 'Error de Conexión';
            document.getElementById('status-badge').className = 'badge warning';
        });
        
        socket.on('orderUpdate', (data) => {
            if (currentTab === 'orders') {
                loadOrders();
            }
            if (currentTab === 'dashboard') {
                loadDashboard();
            }
        });
        
        socket.on('processingUpdate', (data) => {
            if (currentTab === 'processing') {
                loadProcessingQueue();
            }
        });
        
        // Listen for WhatsApp authentication events
        socket.on('qr', (qrData) => {
            console.log('📱 QR Code recibido - WhatsApp necesita autenticación');
            updateWhatsAppStatus(false, 'Escanea el código QR');
            showWhatsAppAuthNotification();
        });
        
        socket.on('ready', () => {
            console.log('✅ WhatsApp conectado');
            updateWhatsAppStatus(true, 'WhatsApp Conectado');
            showSuccess('WhatsApp conectado correctamente');
        });
        
        socket.on('auth_success', () => {
            console.log('✅ Autenticación exitosa');
            updateWhatsAppStatus(true, 'WhatsApp Conectado');
        });
        
        socket.on('connection_update', (data) => {
            console.log('🔄 Actualización de conexión:', data);
            updateWhatsAppStatus(data.connected, data.connected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado');
        });
    } catch (error) {
        console.error('Error initializing Socket.io:', error);
        showWarning('No se pudo conectar para actualizaciones en tiempo real.');
    }
}

// ========================================
// WhatsApp Status Management
// ========================================

async function checkWhatsAppStatus() {
    try {
        // Use AbortController with setTimeout for better browser compatibility
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('/api/auth/status', {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await response.json();
        updateWhatsAppStatus(data.connected, data.message || (data.connected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'));
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('Timeout verificando estado de WhatsApp');
        } else {
            console.error('Error verificando estado de WhatsApp:', error);
        }
        updateWhatsAppStatus(false, 'Estado desconocido');
    }
}

function updateWhatsAppStatus(connected, message) {
    const statusEl = document.getElementById('whatsapp-status');
    if (!statusEl) return;
    
    const className = connected ? 'connected' : 'disconnected';
    const icon = connected ? '●' : '●';
    
    statusEl.className = `connection-status ${className}`;
    statusEl.querySelector('.status-icon').textContent = icon;
    statusEl.querySelector('.status-text').textContent = message || (connected ? 'Conectado' : 'Desconectado');
}

// ========================================
// Global Loading Functions
// ========================================

function showLoader(message = 'Cargando...') {
    const loader = document.getElementById('global-loader');
    if (loader) {
        const loaderText = loader.querySelector('.loader-text');
        if (loaderText) {
            loaderText.textContent = message;
        }
        loader.style.display = 'flex';
    }
}

function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// ========================================
// Empty State Functions
// ========================================

function showEmptyState(containerId, message, icon = '📭') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">${icon}</div>
            <h3>Sin datos disponibles</h3>
            <p>${message}</p>
        </div>
    `;
}

function showErrorState(containerId, message, canRetry = true) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Clear container
    container.innerHTML = `
        <div class="error-state">
            <div class="error-icon">⚠️</div>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    
    // Add retry button using DOM manipulation for security
    if (canRetry) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-primary';
        retryBtn.textContent = 'Reintentar';
        
        // Attach event listener instead of inline onclick
        retryBtn.addEventListener('click', () => {
            const funcName = 'retry' + containerId.charAt(0).toUpperCase() + containerId.slice(1);
            if (typeof window[funcName] === 'function') {
                window[funcName]();
            }
        });
        
        container.querySelector('.error-state').appendChild(retryBtn);
    }
}

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Retry functions
function retryDashboard() {
    loadDashboard();
}

function retryOrders() {
    loadOrders();
}

function retryProcessing() {
    loadProcessingQueue();
}

function retryAnalytics() {
    loadAnalytics();
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
    const sectionId = 'dashboard';
    
    try {
        setLoading(sectionId, true);
        
        const response = await fetchWithRetry('/api/admin/dashboard', {
            signal: getAbortSignal(sectionId)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateDashboardStats(result.data);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Dashboard request cancelled');
            return;
        }
        
        console.error('Error loading dashboard:', error);
        showError('Error al cargar el dashboard. Se mostrarán datos de demostración.');
        
        // Show demo data on error
        updateDashboardStats(getDemoDashboardData());
    } finally {
        setLoading(sectionId, false);
    }
}

function updateDashboardStats(data) {
    // Update stat cards
    document.getElementById('total-orders').textContent = data.totalOrders || 0;
    document.getElementById('pending-orders').textContent = data.pendingOrders || 0;
    document.getElementById('processing-orders').textContent = data.processingOrders || 0;
    document.getElementById('completed-orders').textContent = data.completedOrders || 0;
    
    // Update top genres
    const genresList = document.getElementById('top-genres');
    const genres = data.topGenres || [];
    
    if (genres.length === 0) {
        genresList.innerHTML = '<div class="empty-state">No hay datos de géneros disponibles</div>';
    } else {
        genresList.innerHTML = genres.map(genre => `
            <div class="list-item">
                <span>${genre.name}</span>
                <span class="badge info">${genre.count}</span>
            </div>
        `).join('');
    }
}

// ========================================
// Orders Management
// ========================================

async function loadOrders() {
    const sectionId = 'orders';
    
    try {
        setLoading(sectionId, true);
        
        const status = document.getElementById('filter-status')?.value || '';
        const contentType = document.getElementById('filter-content-type')?.value || '';
        const search = document.getElementById('search-orders')?.value || '';
        
        const params = new URLSearchParams({
            page: currentPage.toString(),
            limit: '50'
        });
        
        if (status) params.append('status', status);
        if (contentType) params.append('contentType', contentType);
        if (search) params.append('searchTerm', search);
        
        const response = await fetchWithRetry(`/api/admin/orders?${params}`, {
            signal: getAbortSignal(sectionId)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            displayOrders(result.data);
            updatePagination(result.pagination);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Orders request cancelled');
            return;
        }
        
        console.error('Error loading orders:', error);
        showError('Error al cargar pedidos. Se mostrarán datos de demostración.');
        
        // Show demo data on error
        const demoData = getDemoOrdersData();
        displayOrders(demoData.orders);
        updatePagination(demoData.pagination);
    } finally {
        setLoading(sectionId, false);
    }
}

function displayOrders(orders) {
    const tbody = document.getElementById('orders-table-body');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center"><div class="empty-state">No hay pedidos que mostrar</div></td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>${order.orderNumber}</td>
            <td>${order.customerName}</td>
            <td>${order.customerPhone}</td>
            <td><span class="badge ${getStatusBadgeClass(order.status)}">${getStatusLabel(order.status)}</span></td>
            <td>${getContentTypeLabel(order.contentType)}</td>
            <td>${order.capacity}</td>
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="viewOrder('${order.id}')">Ver</button>
            </td>
        </tr>
    `).join('');
}

function updatePagination(pagination) {
    document.getElementById('page-info').textContent = 
        `Página ${pagination.page} de ${pagination.totalPages}`;
    
    document.getElementById('prev-page').disabled = pagination.page === 1;
    document.getElementById('next-page').disabled = pagination.page === pagination.totalPages;
}

async function viewOrder(orderId) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}`);
        const result = await response.json();
        
        if (result.success) {
            showOrderModal(result.data);
        }
    } catch (error) {
        console.error('Error loading order:', error);
    }
}

function showOrderModal(order) {
    selectedOrderId = order.id;
    const modal = document.getElementById('order-modal');
    const detailsDiv = document.getElementById('order-details');
    
    detailsDiv.innerHTML = `
        <div class="order-info">
            <p><strong>ID:</strong> ${order.orderNumber}</p>
            <p><strong>Cliente:</strong> ${order.customerName}</p>
            <p><strong>Teléfono:</strong> ${order.customerPhone}</p>
            <p><strong>Estado:</strong> <span class="badge ${getStatusBadgeClass(order.status)}">${getStatusLabel(order.status)}</span></p>
            <p><strong>Capacidad:</strong> ${order.capacity}</p>
            <p><strong>Precio:</strong> $${order.price?.toLocaleString()}</p>
            <p><strong>Fecha:</strong> ${formatDate(order.createdAt)}</p>
        </div>
        <div class="customization-info">
            <h4>Contenido Solicitado:</h4>
            ${formatCustomization(order.customization)}
        </div>
    `;
    
    // Load notes
    const notesList = document.getElementById('order-notes-list');
    notesList.innerHTML = (order.adminNotes || []).map(note => `
        <div class="note-item">${note}</div>
    `).join('');
    
    modal.classList.add('active');
}

function formatCustomization(customization) {
    let html = '';
    
    if (customization.genres?.length) {
        html += `<p><strong>Géneros:</strong> ${customization.genres.join(', ')}</p>`;
    }
    if (customization.artists?.length) {
        html += `<p><strong>Artistas:</strong> ${customization.artists.join(', ')}</p>`;
    }
    if (customization.videos?.length) {
        html += `<p><strong>Videos:</strong> ${customization.videos.join(', ')}</p>`;
    }
    if (customization.movies?.length) {
        html += `<p><strong>Películas:</strong> ${customization.movies.join(', ')}</p>`;
    }
    if (customization.series?.length) {
        html += `<p><strong>Series:</strong> ${customization.series.join(', ')}</p>`;
    }
    
    return html || '<p>Sin contenido específico</p>';
}

// ========================================
// Catalog Management
// ========================================

async function loadCatalog() {
    const category = document.getElementById('catalog-category')?.value || 'music';
    const sectionId = 'catalog';
    
    try {
        setLoading(sectionId, true);
        
        const response = await fetchWithRetry(`/api/admin/content/structure/${category}`, {
            signal: getAbortSignal(sectionId)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            displayFolderTree(result.data);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Catalog request cancelled');
            return;
        }
        
        console.error('Error loading catalog:', error);
        showError('Error al cargar catálogo');
        
        // Show empty state
        const folderList = document.getElementById('folder-list');
        folderList.innerHTML = '<div class="empty-state">No se pudo cargar el catálogo</div>';
    } finally {
        setLoading(sectionId, false);
    }
}

function displayFolderTree(folder) {
    const folderList = document.getElementById('folder-list');
    folderList.innerHTML = renderFolder(folder);
}

function renderFolder(folder, level = 0) {
    let html = `<div class="folder" style="padding-left: ${level * 20}px">
        <div class="folder-name">📁 ${folder.name} (${folder.fileCount} archivos)</div>
    `;
    
    if (folder.subfolders?.length) {
        folder.subfolders.forEach(subfolder => {
            html += renderFolder(subfolder, level + 1);
        });
    }
    
    html += '</div>';
    return html;
}

// ========================================
// Processing Queue
// ========================================

async function loadProcessingQueue() {
    const sectionId = 'processing';
    
    try {
        setLoading(sectionId, true);
        
        const response = await fetchWithRetry('/api/admin/processing/queue', {
            signal: getAbortSignal(sectionId)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            displayProcessingQueue(result.data);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Processing queue request cancelled');
            return;
        }
        
        console.error('Error loading processing queue:', error);
        showError('Error al cargar cola de procesamiento');
        
        // Show empty state
        displayProcessingQueue({ queue: [], active: [] });
    } finally {
        setLoading(sectionId, false);
    }
}

function displayProcessingQueue(data) {
    const queueDiv = document.getElementById('processing-queue');
    const activeJobsDiv = document.getElementById('active-jobs');
    
    // Display queue
    if (data.queue && data.queue.length > 0) {
        queueDiv.innerHTML = data.queue.map(job => `
            <div class="job-item">
                <div class="job-header">
                    <span>Pedido: ${job.orderNumber}</span>
                    <span class="badge info">${job.status}</span>
                </div>
            </div>
        `).join('');
    } else {
        queueDiv.innerHTML = '<p>No hay trabajos en la cola</p>';
    }
    
    // Display active jobs
    if (data.active && data.active.length > 0) {
        activeJobsDiv.innerHTML = data.active.map(job => `
            <div class="job-item">
                <div class="job-header">
                    <span>Pedido: ${job.orderNumber}</span>
                    <span class="badge warning">${job.progress}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${job.progress}%"></div>
                </div>
            </div>
        `).join('');
    } else {
        activeJobsDiv.innerHTML = '<p>No hay trabajos activos</p>';
    }
}

// ========================================
// Analytics
// ========================================

async function loadAnalytics() {
    const sectionId = 'analytics';
    
    try {
        setLoading(sectionId, true);
        
        const response = await fetchWithRetry('/api/admin/analytics/chatbot', {
            signal: getAbortSignal(sectionId)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateAnalytics(result.data);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Analytics request cancelled');
            return;
        }
        
        console.error('Error loading analytics:', error);
        showError('Error al cargar análisis. Se mostrarán datos de demostración.');
        
        // Show demo data on error
        updateAnalytics(getDemoAnalyticsData());
    } finally {
        setLoading(sectionId, false);
    }
}

function updateAnalytics(data) {
    document.getElementById('active-conversations').textContent = data.activeConversations || 0;
    document.getElementById('total-conversations').textContent = data.totalConversations || 0;
    
    // Calculate conversion rate
    const conversionRate = data.totalConversations > 0 
        ? ((data.activeConversations / data.totalConversations) * 100).toFixed(1)
        : 0;
    document.getElementById('conversion-rate').textContent = `${conversionRate}%`;
    document.getElementById('avg-response-time').textContent = `${data.averageResponseTime || 0}s`;
    
    // Update popular artists
    const artistsList = document.getElementById('popular-artists');
    const artists = data.popularArtists || [];
    
    if (artists.length === 0) {
        artistsList.innerHTML = '<div class="empty-state">No hay datos de artistas disponibles</div>';
    } else {
        artistsList.innerHTML = artists.map(artist => `
            <div class="list-item">
                <span>${artist.artist || artist.name}</span>
                <span class="badge info">${artist.count}</span>
            </div>
        `).join('');
    }
    
    // Update popular movies
    const moviesList = document.getElementById('popular-movies');
    const movies = data.popularMovies || [];
    
    if (movies.length === 0) {
        moviesList.innerHTML = '<div class="empty-state">No hay datos de películas disponibles</div>';
    } else {
        moviesList.innerHTML = movies.map(movie => `
            <div class="list-item">
                <span>${movie.title || movie.name}</span>
                <span class="badge info">${movie.count}</span>
            </div>
        `).join('');
    }
}

// ========================================
// Settings
// ========================================

async function loadSettings() {
    const sectionId = 'settings';
    
    try {
        setLoading(sectionId, true);
        
        const response = await fetchWithRetry('/api/admin/settings', {
            signal: getAbortSignal(sectionId)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            populateSettings(result.data);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Settings request cancelled');
            return;
        }
        
        console.error('Error loading settings:', error);
        showWarning('Error al cargar configuración. Se mostrarán valores por defecto.');
        
        // Use default settings
        populateSettings({
            chatbot: {
                autoResponseEnabled: true,
                responseDelay: 1000
            },
            pricing: {
                '8GB': 15000,
                '32GB': 25000,
                '64GB': 35000,
                '128GB': 50000,
                '256GB': 80000
            }
        });
    } finally {
        setLoading(sectionId, false);
    }
}

function populateSettings(config) {
    // Populate form fields with config values
    if (config.chatbot) {
        document.getElementById('auto-response-enabled').checked = config.chatbot.autoResponseEnabled;
        document.getElementById('response-delay').value = config.chatbot.responseDelay;
    }
    
    if (config.pricing) {
        document.getElementById('price-8gb').value = config.pricing['8GB'];
        document.getElementById('price-32gb').value = config.pricing['32GB'];
        document.getElementById('price-64gb').value = config.pricing['64GB'];
        document.getElementById('price-128gb').value = config.pricing['128GB'];
        document.getElementById('price-256gb').value = config.pricing['256GB'];
    }
}

// ========================================
// Filters
// ========================================

function initFilters() {
    // Orders filters
    document.getElementById('filter-status')?.addEventListener('change', loadOrders);
    document.getElementById('filter-content-type')?.addEventListener('change', loadOrders);
    document.getElementById('search-orders')?.addEventListener('input', debounce(loadOrders, 500));
    document.getElementById('refresh-orders')?.addEventListener('click', loadOrders);
    
    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadOrders();
        }
    });
    
    document.getElementById('next-page')?.addEventListener('click', () => {
        currentPage++;
        loadOrders();
    });
    
    // Catalog
    document.getElementById('catalog-category')?.addEventListener('change', loadCatalog);
    document.getElementById('search-content')?.addEventListener('input', debounce(searchContent, 500));
    
    // Settings
    document.getElementById('save-settings')?.addEventListener('click', saveSettings);
    document.getElementById('export-report')?.addEventListener('click', exportReport);
    document.getElementById('backup-data')?.addEventListener('click', backupData);
}

// ========================================
// Modal
// ========================================

function initModal() {
    const modal = document.getElementById('order-modal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.onclick = () => {
        modal.classList.remove('active');
    };
    
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.classList.remove('active');
        }
    };
    
    // Modal action buttons
    document.getElementById('confirm-order-btn')?.addEventListener('click', () => confirmOrder(selectedOrderId));
    document.getElementById('cancel-order-btn')?.addEventListener('click', () => cancelOrder(selectedOrderId));
    document.getElementById('add-note-btn')?.addEventListener('click', () => addNote(selectedOrderId));
}

async function confirmOrder(orderId) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/confirm`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            alert('Pedido confirmado');
            document.getElementById('order-modal').classList.remove('active');
            loadOrders();
        }
    } catch (error) {
        console.error('Error confirming order:', error);
        alert('Error al confirmar pedido');
    }
}

async function cancelOrder(orderId) {
    const reason = prompt('Razón de cancelación:');
    if (!reason) return;
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        const result = await response.json();
        
        if (result.success) {
            alert('Pedido cancelado');
            document.getElementById('order-modal').classList.remove('active');
            loadOrders();
        }
    } catch (error) {
        console.error('Error cancelling order:', error);
        alert('Error al cancelar pedido');
    }
}

async function addNote(orderId) {
    const note = document.getElementById('order-note').value;
    if (!note) return;
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        });
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('order-note').value = '';
            viewOrder(orderId); // Refresh order details
        }
    } catch (error) {
        console.error('Error adding note:', error);
        alert('Error al agregar nota');
    }
}

// ========================================
// Utility Functions
// ========================================

function getStatusBadgeClass(status) {
    const classes = {
        'pending': 'warning',
        'confirmed': 'info',
        'processing': 'info',
        'completed': 'success',
        'cancelled': 'danger'
    };
    return classes[status] || 'secondary';
}

function getStatusLabel(status) {
    const labels = {
        'pending': 'Pendiente',
        'confirmed': 'Confirmado',
        'processing': 'En Proceso',
        'completed': 'Completado',
        'cancelled': 'Cancelado'
    };
    return labels[status] || status;
}

function getContentTypeLabel(type) {
    const labels = {
        'music': 'Música',
        'videos': 'Videos',
        'movies': 'Películas',
        'series': 'Series',
        'mixed': 'Mixto'
    };
    return labels[type] || type;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO') + ' ' + date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function updateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleString('es-CO');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function searchContent() {
    // Implement content search
}

async function saveSettings() {
    // Implement settings save
    alert('Configuración guardada');
}

async function exportReport() {
    // Implement report export
    alert('Exportando reporte...');
}

async function backupData() {
    // Implement data backup
    alert('Creando backup...');
}

// ========================================
// Loading States Management
// ========================================

function setLoading(sectionId, isLoading) {
    loadingStates[sectionId] = isLoading;
    
    // Show/hide spinner based on section
    const spinnerIds = {
        'dashboard': 'dashboard-spinner',
        'orders': 'orders-spinner',
        'catalog': 'catalog-spinner',
        'processing': 'processing-spinner',
        'analytics': 'analytics-spinner'
    };
    
    const spinnerId = spinnerIds[sectionId];
    if (spinnerId) {
        const spinner = document.getElementById(spinnerId);
        if (spinner) {
            spinner.style.display = isLoading ? 'flex' : 'none';
        } else if (isLoading) {
            // Create spinner if it doesn't exist
            showLoadingSpinner(sectionId);
        }
    }
}

function showLoadingSpinner(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    let spinner = section.querySelector('.loading-spinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.id = `${sectionId}-spinner`;
        spinner.innerHTML = `
            <div class="spinner-icon"></div>
            <div class="spinner-text">Cargando...</div>
        `;
        section.insertBefore(spinner, section.firstChild);
    }
    spinner.style.display = 'flex';
}

function hideLoadingSpinner(sectionId) {
    const spinner = document.getElementById(`${sectionId}-spinner`);
    if (spinner) {
        spinner.style.display = 'none';
    }
}

// ========================================
// Error Handling
// ========================================

function showError(message) {
    showNotification(message, 'error');
}

function showWarning(message) {
    showNotification(message, 'warning');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const content = document.createElement('div');
    content.className = 'notification-content';
    
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.textContent = getNotificationIcon(type);
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = message;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.textContent = '×';
    
    content.appendChild(icon);
    content.appendChild(messageSpan);
    content.appendChild(closeBtn);
    notification.appendChild(content);
    
    // Add to page
    let container = document.querySelector('.notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notifications-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    const timeoutId = setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
    
    // Manual close button
    closeBtn.addEventListener('click', () => {
        clearTimeout(timeoutId);
        notification.remove();
    });
}

function getNotificationIcon(type) {
    const icons = {
        'error': '❌',
        'warning': '⚠️',
        'success': '✅',
        'info': 'ℹ️'
    };
    return icons[type] || icons.info;
}

// Special notification for WhatsApp authentication with link
function showWhatsAppAuthNotification() {
    const notification = document.createElement('div');
    notification.className = 'notification notification-warning';
    
    const content = document.createElement('div');
    content.className = 'notification-content';
    
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.textContent = '⚠️';
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = 'WhatsApp necesita autenticación. ';
    
    const link = document.createElement('a');
    link.href = '/auth';
    link.textContent = 'Ir a autenticación';
    link.style.color = 'white';
    link.style.textDecoration = 'underline';
    link.style.fontWeight = 'bold';
    
    messageSpan.appendChild(link);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.textContent = '×';
    
    content.appendChild(icon);
    content.appendChild(messageSpan);
    content.appendChild(closeBtn);
    notification.appendChild(content);
    
    // Add to page
    let container = document.querySelector('.notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notifications-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Auto-remove after 10 seconds (longer for auth notification)
    const timeoutId = setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 10000);
    
    // Manual close button
    closeBtn.addEventListener('click', () => {
        clearTimeout(timeoutId);
        notification.remove();
    });
}

// ========================================
// Fetch with Retry and Timeout
// ========================================

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    const timeout = options.timeout || 10000; // 10 second timeout
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let timeoutId;
        try {
            // Create timeout controller
            const timeoutController = new AbortController();
            timeoutId = setTimeout(() => timeoutController.abort(), timeout);
            
            // Combine signals if user provided one
            let signal = timeoutController.signal;
            if (options.signal) {
                // If user signal is already aborted, use it directly
                if (options.signal.aborted) {
                    clearTimeout(timeoutId);
                    throw new DOMException('AbortError', 'AbortError');
                }
                
                // Listen for user abort
                options.signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    timeoutController.abort();
                });
            }
            
            const response = await fetch(url, {
                ...options,
                signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok && attempt < maxRetries) {
                console.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}):`, response.status);
                await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
                continue;
            }
            
            return response;
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                // Check if it was user-initiated abort or timeout
                if (options.signal?.aborted) {
                    // User-initiated abort, don't retry
                    throw error;
                }
                // Timeout, retry if attempts remain
                if (attempt < maxRetries) {
                    console.warn(`Request timeout (attempt ${attempt + 1}/${maxRetries + 1})`);
                    await sleep(1000 * Math.pow(2, attempt));
                    continue;
                }
            }
            
            if (attempt >= maxRetries) {
                throw error;
            }
            
            console.warn(`Request error (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
            await sleep(1000 * Math.pow(2, attempt));
        }
    }
}

function getAbortSignal(key) {
    // Cancel previous request if exists
    if (abortControllers[key]) {
        abortControllers[key].abort();
    }
    
    // Create new abort controller
    abortControllers[key] = new AbortController();
    return abortControllers[key].signal;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// Demo/Mock Data
// ========================================

function getDemoDashboardData() {
    return {
        totalOrders: 15,
        pendingOrders: 3,
        processingOrders: 5,
        completedOrders: 7,
        cancelledOrders: 0,
        ordersToday: 2,
        ordersThisWeek: 8,
        ordersThisMonth: 15,
        totalRevenue: 525000,
        averageOrderValue: 35000,
        contentDistribution: {
            music: 8,
            videos: 3,
            movies: 2,
            series: 1,
            mixed: 1
        },
        capacityDistribution: {
            '8GB': 2,
            '32GB': 7,
            '64GB': 4,
            '128GB': 2,
            '256GB': 0
        },
        topGenres: [
            { name: 'Reggaeton', count: 25 },
            { name: 'Salsa', count: 18 },
            { name: 'Rock', count: 15 },
            { name: 'Pop', count: 12 },
            { name: 'Vallenato', count: 10 }
        ],
        topArtists: [
            { name: 'Feid', count: 8 },
            { name: 'Karol G', count: 7 },
            { name: 'Bad Bunny', count: 6 }
        ],
        topMovies: [
            { name: 'Avatar 2', count: 5 },
            { name: 'Top Gun Maverick', count: 4 }
        ]
    };
}

function getDemoOrdersData() {
    const demoOrders = [
        {
            id: 'demo-1',
            orderNumber: 'ORD-2024-001',
            customerName: 'Juan Pérez',
            customerPhone: '+57 300 123 4567',
            status: 'pending',
            contentType: 'music',
            capacity: '32GB',
            createdAt: new Date().toISOString(),
            price: 25000,
            customization: {
                genres: ['Reggaeton', 'Salsa'],
                artists: ['Feid', 'Karol G']
            }
        },
        {
            id: 'demo-2',
            orderNumber: 'ORD-2024-002',
            customerName: 'María García',
            customerPhone: '+57 301 234 5678',
            status: 'processing',
            contentType: 'mixed',
            capacity: '64GB',
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            price: 35000,
            customization: {
                genres: ['Rock', 'Pop'],
                movies: ['Avatar 2']
            }
        },
        {
            id: 'demo-3',
            orderNumber: 'ORD-2024-003',
            customerName: 'Carlos Rodríguez',
            customerPhone: '+57 302 345 6789',
            status: 'completed',
            contentType: 'music',
            capacity: '32GB',
            createdAt: new Date(Date.now() - 172800000).toISOString(),
            price: 25000,
            customization: {
                genres: ['Vallenato'],
                artists: ['Diomedes Díaz']
            }
        }
    ];
    
    return {
        orders: demoOrders,
        pagination: {
            page: 1,
            limit: 50,
            total: 3,
            totalPages: 1
        }
    };
}

function getDemoAnalyticsData() {
    return {
        activeConversations: 12,
        totalConversations: 45,
        averageResponseTime: 2.5,
        popularGenres: [
            { name: 'Reggaeton', count: 25 },
            { name: 'Salsa', count: 18 },
            { name: 'Rock', count: 15 }
        ],
        popularArtists: [
            { artist: 'Feid', count: 8 },
            { artist: 'Karol G', count: 7 },
            { artist: 'Bad Bunny', count: 6 }
        ],
        popularMovies: [
            { title: 'Avatar 2', count: 5 },
            { title: 'Top Gun Maverick', count: 4 }
        ],
        intents: [
            { intent: 'consulta_precio', count: 20 },
            { intent: 'solicitar_pedido', count: 15 },
            { intent: 'consulta_catalogo', count: 12 }
        ],
        peakHours: Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: i >= 8 && i <= 22 ? Math.floor(Math.random() * 10) + 5 : Math.floor(Math.random() * 3)
        })),
        newUsers: 28,
        returningUsers: 17
    };
}

// ========================================
// Timeline and Replay Functions
// ========================================

let currentTimelineOrderId = null;

// Initialize timeline modal handlers
function initTimelineModal() {
    const viewTimelineBtn = document.getElementById('view-timeline-btn');
    const timelineModal = document.getElementById('timeline-modal');
    const timelineCloseBtn = document.querySelector('.timeline-close');
    const refreshTimelineBtn = document.getElementById('refresh-timeline-btn');
    const replayFlowBtn = document.getElementById('replay-flow-btn');
    
    if (viewTimelineBtn) {
        viewTimelineBtn.addEventListener('click', () => {
            if (selectedOrderId) {
                showTimelineModal(selectedOrderId);
            }
        });
    }
    
    if (timelineCloseBtn) {
        timelineCloseBtn.addEventListener('click', () => {
            timelineModal.classList.remove('active');
        });
    }
    
    if (refreshTimelineBtn) {
        refreshTimelineBtn.addEventListener('click', () => {
            if (currentTimelineOrderId) {
                loadOrderTimeline(currentTimelineOrderId);
            }
        });
    }
    
    if (replayFlowBtn) {
        replayFlowBtn.addEventListener('click', () => {
            if (currentTimelineOrderId) {
                showReplayModal(currentTimelineOrderId);
            }
        });
    }
    
    // Timeline filters
    const eventTypeFilter = document.getElementById('timeline-event-type-filter');
    const eventSourceFilter = document.getElementById('timeline-event-source-filter');
    const flowFilter = document.getElementById('timeline-flow-filter');
    
    if (eventTypeFilter) {
        eventTypeFilter.addEventListener('change', () => {
            if (currentTimelineOrderId) {
                loadOrderTimeline(currentTimelineOrderId);
            }
        });
    }
    
    if (eventSourceFilter) {
        eventSourceFilter.addEventListener('change', () => {
            if (currentTimelineOrderId) {
                loadOrderTimeline(currentTimelineOrderId);
            }
        });
    }
    
    if (flowFilter) {
        flowFilter.addEventListener('input', debounce(() => {
            if (currentTimelineOrderId) {
                loadOrderTimeline(currentTimelineOrderId);
            }
        }, 500));
    }
    
    // Replay modal
    const replayModal = document.getElementById('replay-modal');
    const replayCloseBtn = document.querySelector('.replay-close');
    
    if (replayCloseBtn) {
        replayCloseBtn.addEventListener('click', () => {
            replayModal.classList.remove('active');
        });
    }
}

async function showTimelineModal(orderId) {
    currentTimelineOrderId = orderId;
    const modal = document.getElementById('timeline-modal');
    modal.classList.add('active');
    await loadOrderTimeline(orderId);
}

async function loadOrderTimeline(orderId) {
    try {
        // Get filter values
        const eventType = document.getElementById('timeline-event-type-filter')?.value || '';
        const eventSource = document.getElementById('timeline-event-source-filter')?.value || '';
        const flowName = document.getElementById('timeline-flow-filter')?.value || '';
        
        // Build query params
        const params = new URLSearchParams();
        if (eventType) params.append('eventType', eventType);
        if (eventSource) params.append('eventSource', eventSource);
        if (flowName) params.append('flowName', flowName);
        params.append('limit', '100');
        
        const response = await fetch(`/api/admin/orders/${orderId}/events?${params.toString()}`);
        const result = await response.json();
        
        if (result.success) {
            displayTimeline(result.data);
        } else {
            showError('Error al cargar el timeline: ' + (result.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error loading timeline:', error);
        showError('Error al cargar el timeline');
    }
}

function displayTimeline(data) {
    // Update header
    document.getElementById('timeline-order-number').textContent = data.orderNumber || data.orderId;
    
    // Display summary
    const summaryDiv = document.getElementById('timeline-summary');
    summaryDiv.innerHTML = `
        <div class="timeline-summary-item">
            <span class="label">Total Eventos</span>
            <span class="value">${data.count || 0}</span>
        </div>
        <div class="timeline-summary-item">
            <span class="label">Cliente</span>
            <span class="value">${data.customerName || 'N/A'}</span>
        </div>
        <div class="timeline-summary-item">
            <span class="label">Teléfono</span>
            <span class="value">${data.customerPhone || 'N/A'}</span>
        </div>
        <div class="timeline-summary-item">
            <span class="label">Estado</span>
            <span class="value">
                <span class="badge ${getStatusBadgeClass(data.orderStatus)}">${getStatusLabel(data.orderStatus)}</span>
            </span>
        </div>
    `;
    
    // Display events
    const eventsDiv = document.getElementById('timeline-events');
    
    if (!data.timeline || data.timeline.length === 0) {
        eventsDiv.innerHTML = '<p class="empty-state">No hay eventos para mostrar con los filtros seleccionados.</p>';
        return;
    }
    
    eventsDiv.innerHTML = data.timeline.map(event => renderTimelineEvent(event)).join('');
}

function renderTimelineEvent(event) {
    const sourceClass = `event-${event.eventSource}`;
    const timestamp = new Date(event.timestamp).toLocaleString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    let html = `
        <div class="timeline-event ${sourceClass}">
            <div class="timeline-event-header">
                <span class="timeline-event-type">${formatEventType(event.eventType)}</span>
                <span class="timeline-event-timestamp">${timestamp}</span>
            </div>
            <div class="timeline-event-meta">
                <span class="timeline-event-badge source-${event.eventSource}">
                    ${event.eventSource.toUpperCase()}
                </span>
    `;
    
    if (event.flowName) {
        html += `
                <span class="timeline-event-badge" style="background-color: rgba(99, 102, 241, 0.2); color: #818cf8;">
                    📊 ${event.flowName}
                </span>
        `;
    }
    
    if (event.flowStage) {
        html += `
                <span class="timeline-event-badge" style="background-color: rgba(168, 85, 247, 0.2); color: #c084fc;">
                    🔄 ${event.flowStage}
                </span>
        `;
    }
    
    html += `
            </div>
    `;
    
    if (event.description) {
        html += `<div class="timeline-event-description">${escapeHtml(event.description)}</div>`;
    }
    
    // Display user input and bot response
    if (event.userInput || event.botResponse) {
        html += '<div class="timeline-event-messages">';
        
        if (event.userInput) {
            html += `
                <div class="timeline-message">
                    <div class="timeline-message-label">👤 Usuario:</div>
                    <div class="timeline-message-text">${escapeHtml(event.userInput)}</div>
                </div>
            `;
        }
        
        if (event.botResponse) {
            html += `
                <div class="timeline-message">
                    <div class="timeline-message-label">🤖 Bot:</div>
                    <div class="timeline-message-text">${escapeHtml(event.botResponse)}</div>
                </div>
            `;
        }
        
        html += '</div>';
    }
    
    // Display event data if present
    if (event.data) {
        html += `
            <div class="timeline-event-data">
                <pre>${JSON.stringify(event.data, null, 2)}</pre>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

function formatEventType(eventType) {
    const typeMap = {
        'order_created': '📦 Pedido Creado',
        'order_confirmed': '✅ Pedido Confirmado',
        'order_completed': '🎉 Pedido Completado',
        'order_cancelled': '❌ Pedido Cancelado',
        'payment_confirmed': '💰 Pago Confirmado',
        'payment_received': '💳 Pago Recibido',
        'user_message': '💬 Mensaje del Usuario',
        'bot_message': '�� Mensaje del Bot',
        'system_event': '⚙️ Evento del Sistema',
        'capacity_selected': '📏 Capacidad Seleccionada',
        'genre_added': '🎵 Género Agregado',
        'address_provided': '📍 Dirección Proporcionada'
    };
    
    return typeMap[eventType] || eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

async function showReplayModal(orderId) {
    const modal = document.getElementById('replay-modal');
    const resultDiv = document.getElementById('replay-result');
    
    modal.classList.add('active');
    resultDiv.innerHTML = '<p>Ejecutando replay en modo dry-run...</p>';
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/replay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // Can optionally provide custom user input or context
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayReplayResult(result.data);
        } else {
            resultDiv.innerHTML = `<p class="error">Error: ${result.error || 'Error desconocido'}</p>`;
        }
    } catch (error) {
        console.error('Error executing replay:', error);
        resultDiv.innerHTML = `<p class="error">Error al ejecutar el replay: ${error.message}</p>`;
    }
}

function displayReplayResult(data) {
    const resultDiv = document.getElementById('replay-result');
    
    const confidenceClass = data.routerDecision.confidence >= 80 ? 'high' : 
                           data.routerDecision.confidence >= 60 ? 'medium' : 'low';
    
    resultDiv.innerHTML = `
        <div class="replay-section">
            <h3>🔀 Decisión del Router</h3>
            <div class="replay-field">
                <span class="replay-field-label">Intent Detectado:</span>
                <span class="replay-field-value"><strong>${data.routerDecision.intent}</strong></span>
            </div>
            <div class="replay-field">
                <span class="replay-field-label">Confianza:</span>
                <span class="replay-field-value">
                    <span class="replay-confidence ${confidenceClass}">
                        ${data.routerDecision.confidence}%
                    </span>
                </span>
            </div>
            <div class="replay-field">
                <span class="replay-field-label">Fuente:</span>
                <span class="replay-field-value">${data.routerDecision.source.toUpperCase()}</span>
            </div>
            ${data.routerDecision.targetFlow ? `
            <div class="replay-field">
                <span class="replay-field-label">Flujo Objetivo:</span>
                <span class="replay-field-value">${data.routerDecision.targetFlow}</span>
            </div>
            ` : ''}
            ${data.routerDecision.reason ? `
            <div class="replay-field">
                <span class="replay-field-label">Razonamiento:</span>
                <span class="replay-field-value">${escapeHtml(data.routerDecision.reason)}</span>
            </div>
            ` : ''}
        </div>
        
        <div class="replay-section">
            <h3>💬 Respuesta Simulada</h3>
            <div class="replay-message-box">
                <p>${escapeHtml(data.simulatedResponse.message)}</p>
            </div>
            ${data.simulatedResponse.nextFlow ? `
            <div class="replay-field" style="margin-top: 1rem;">
                <span class="replay-field-label">Siguiente Flujo:</span>
                <span class="replay-field-value">${data.simulatedResponse.nextFlow}</span>
            </div>
            ` : ''}
        </div>
        
        <div class="replay-section">
            <h3>📊 Información Adicional</h3>
            <div class="replay-field">
                <span class="replay-field-label">Timestamp:</span>
                <span class="replay-field-value">${new Date(data.timestamp).toLocaleString('es-CO')}</span>
            </div>
            <div class="replay-field">
                <span class="replay-field-label">Eventos Históricos:</span>
                <span class="replay-field-value">${data.originalEvents.length} eventos</span>
            </div>
            <div class="replay-field">
                <span class="replay-field-label">Pedido:</span>
                <span class="replay-field-value">${data.orderNumber}</span>
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add timeline modal initialization to the main init
const originalInitModal = initModal;
initModal = function() {
    if (originalInitModal) originalInitModal();
    initTimelineModal();
};

