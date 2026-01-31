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

// Chart instances for proper cleanup
let contentTypeChart = null;
let capacityChart = null;

// Dashboard date range state
let dashboardDateFrom = null;
let dashboardDateTo = null;

// ========================================
// Chart Configuration Constants
// ========================================

const CHART_COLORS = {
    // Content type colors
    contentType: [
        '#4CAF50', // Music - Green
        '#2196F3', // Videos - Blue
        '#FF9800', // Movies - Orange
        '#9C27B0', // Series - Purple
        '#607D8B'  // Mixed - Gray
    ],
    // Capacity colors (gradient of blue)
    capacity: [
        '#E3F2FD', // 8GB - Light Blue
        '#BBDEFB', // 32GB
        '#90CAF9', // 64GB
        '#64B5F6', // 128GB
        '#42A5F5', // 256GB
        '#2196F3'  // 512GB
    ],
    capacityBorder: '#1976D2'
};

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSocket();
    initFilters();
    initModal();
    initDashboardDateFilter();
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
// Dashboard Date Filter
// ========================================

function initDashboardDateFilter() {
    const applyBtn = document.getElementById('apply-date-filter');
    const clearBtn = document.getElementById('clear-date-filter');
    const dateFromInput = document.getElementById('dashboard-date-from');
    const dateToInput = document.getElementById('dashboard-date-to');
    
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            dashboardDateFrom = dateFromInput?.value || null;
            dashboardDateTo = dateToInput?.value || null;
            loadDashboard();
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            dashboardDateFrom = null;
            dashboardDateTo = null;
            if (dateFromInput) dateFromInput.value = '';
            if (dateToInput) dateToInput.value = '';
            loadDashboard();
        });
    }
}

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
    switch (tabName) {
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
        case 'logs':
            loadLogs();
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
        
        // Build URL with date range parameters
        const params = new URLSearchParams();
        if (dashboardDateFrom) params.append('from', dashboardDateFrom);
        if (dashboardDateTo) params.append('to', dashboardDateTo);
        
        const summaryUrl = `/api/admin/dashboard/summary${params.toString() ? '?' + params.toString() : ''}`;
        
        // Fetch both the dashboard stats (for top genres, revenue, etc.) and summary (for charts)
        const [dashboardResponse, summaryResponse] = await Promise.all([
            fetchWithRetry('/api/admin/dashboard', { signal: getAbortSignal(sectionId) }),
            fetchWithRetry(summaryUrl, { signal: getAbortSignal(sectionId + '-summary') })
        ]);
        
        if (!dashboardResponse.ok) {
            throw new Error(`HTTP error! status: ${dashboardResponse.status}`);
        }
        
        const dashboardResult = await dashboardResponse.json();
        let summaryResult = { success: false };
        
        if (summaryResponse.ok) {
            summaryResult = await summaryResponse.json();
        }
        
        if (dashboardResult.success) {
            // Merge summary data with dashboard data for charts
            const mergedData = {
                ...dashboardResult.data,
                // Use summary KPIs if available (they respect date range)
                ...(summaryResult.success && summaryResult.data?.kpis ? {
                    totalOrders: summaryResult.data.kpis.total,
                    pendingOrders: summaryResult.data.kpis.pending,
                    processingOrders: summaryResult.data.kpis.processing,
                    completedOrders: summaryResult.data.kpis.completed
                } : {}),
                // Add chart data from summary
                distributionByType: summaryResult.success ? summaryResult.data?.distributionByType || [] : [],
                distributionByCapacity: summaryResult.success ? summaryResult.data?.distributionByCapacity || [] : [],
                dailyTimeSeries: summaryResult.success ? summaryResult.data?.dailyTimeSeries || [] : []
            };
            
            updateDashboardStats(mergedData);
            updateDashboardCharts(mergedData);
        } else {
            throw new Error(dashboardResult.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Dashboard request cancelled');
            return;
        }

        console.error('Error loading dashboard:', error);
        showError('Error al cargar el dashboard. Por favor, verifica la conexión con el servidor y la base de datos.');
        
        // Show empty state instead of demo data - this ensures real issues are visible
        const emptyData = {
            totalOrders: 0,
            pendingOrders: 0,
            processingOrders: 0,
            completedOrders: 0,
            totalRevenue: 0,
            conversionRate: 0,
            topGenres: [],
            contentDistribution: [],
            capacityDistribution: []
        };
        updateDashboardStats(emptyData);
        updateDashboardCharts(emptyData);
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
                <span>${escapeHtml(genre.name)}</span>
                <span class="badge info">${genre.count}</span>
            </div>
        `).join('');
    }

    // Update content distribution chart
    const contentDistContainer = document.getElementById('content-distribution');
    if (contentDistContainer) {
        const contentDist = data.contentDistribution || {};
        const hasData = Object.values(contentDist).some(v => v > 0);

        if (!hasData) {
            contentDistContainer.innerHTML = '<div class="empty-state">Sin datos de distribución de contenido</div>';
        } else {
            contentDistContainer.innerHTML = `
                <div class="distribution-chart">
                    ${Object.entries(contentDist).map(([type, count]) => `
                        <div class="distribution-item">
                            <span class="distribution-label">${escapeHtml(type)}</span>
                            <div class="distribution-bar">
                                <div class="distribution-fill" style="width: ${getPercentage(count, contentDist)}%"></div>
                            </div>
                            <span class="distribution-value">${count}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    // Update capacity distribution chart
    const capacityDistContainer = document.getElementById('capacity-distribution');
    if (capacityDistContainer) {
        const capacityDist = data.capacityDistribution || {};
        const hasData = Object.values(capacityDist).some(v => v > 0);

        if (!hasData) {
            capacityDistContainer.innerHTML = '<div class="empty-state">Sin datos de distribución de capacidad</div>';
        } else {
            capacityDistContainer.innerHTML = `
                <div class="distribution-chart">
                    ${Object.entries(capacityDist).map(([capacity, count]) => `
                        <div class="distribution-item">
                            <span class="distribution-label">${escapeHtml(capacity)}</span>
                            <div class="distribution-bar">
                                <div class="distribution-fill" style="width: ${getPercentage(count, capacityDist)}%"></div>
                            </div>
                            <span class="distribution-value">${count}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
}

// Helper function to calculate percentage for distribution bars
function getPercentage(value, distribution) {
    const total = Object.values(distribution).reduce((sum, v) => sum + (v || 0), 0);
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
}

/**
 * Update dashboard charts with real data
 * Uses Chart.js for rendering
 */
function updateDashboardCharts(data) {
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not available. Charts will not be rendered.');
        return;
    }

    // Content Type Distribution Chart
    updateContentTypeChart(data);
    
    // Capacity Distribution Chart
    updateCapacityChart(data);
}

/**
 * Update content type distribution chart
 */
function updateContentTypeChart(data) {
    const canvas = document.getElementById('content-type-chart');
    const noDataDiv = document.getElementById('content-type-no-data');
    
    if (!canvas) return;
    
    // Prepare data - use distributionByType from summary or contentDistribution from dashboard
    let chartData = [];
    
    if (data.distributionByType && data.distributionByType.length > 0) {
        chartData = data.distributionByType.map(item => ({
            label: getContentTypeLabel(item.type),
            value: item.count
        }));
    } else if (data.contentDistribution) {
        chartData = Object.entries(data.contentDistribution)
            .filter(([_, value]) => value > 0)
            .map(([key, value]) => ({
                label: getContentTypeLabel(key),
                value: value
            }));
    }
    
    // Show "no data" message if empty
    if (chartData.length === 0 || chartData.every(d => d.value === 0)) {
        canvas.style.display = 'none';
        if (noDataDiv) noDataDiv.style.display = 'flex';
        return;
    }
    
    canvas.style.display = 'block';
    if (noDataDiv) noDataDiv.style.display = 'none';
    
    // Destroy existing chart
    if (contentTypeChart) {
        contentTypeChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    contentTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                data: chartData.map(d => d.value),
                backgroundColor: CHART_COLORS.contentType,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: 12 },
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.label}: ${context.raw} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Update capacity distribution chart
 */
function updateCapacityChart(data) {
    const canvas = document.getElementById('capacity-chart');
    const noDataDiv = document.getElementById('capacity-no-data');
    
    if (!canvas) return;
    
    // Prepare data - use distributionByCapacity from summary or capacityDistribution from dashboard
    let chartData = [];
    
    if (data.distributionByCapacity && data.distributionByCapacity.length > 0) {
        chartData = data.distributionByCapacity.map(item => ({
            label: item.capacity,
            value: item.count
        }));
    } else if (data.capacityDistribution) {
        chartData = Object.entries(data.capacityDistribution)
            .filter(([_, value]) => value > 0)
            .map(([key, value]) => ({
                label: key,
                value: value
            }));
    }
    
    // Show "no data" message if empty
    if (chartData.length === 0 || chartData.every(d => d.value === 0)) {
        canvas.style.display = 'none';
        if (noDataDiv) noDataDiv.style.display = 'flex';
        return;
    }
    
    canvas.style.display = 'block';
    if (noDataDiv) noDataDiv.style.display = 'none';
    
    // Destroy existing chart
    if (capacityChart) {
        capacityChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    capacityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                label: 'Pedidos',
                data: chartData.map(d => d.value),
                backgroundColor: CHART_COLORS.capacity,
                borderColor: CHART_COLORS.capacityBorder,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw} pedidos`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0
                    }
                }
            }
        }
    });
}

/**
 * Get human-readable label for content type
 */
function getContentTypeLabel(type) {
    const labels = {
        'music': 'Música',
        'videos': 'Videos',
        'movies': 'Películas',
        'series': 'Series',
        'mixed': 'Mixto',
        'unknown': 'Sin clasificar'
    };
    return labels[type?.toLowerCase()] || type || 'Sin clasificar';
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
        showError('Error al cargar pedidos. Por favor, verifica la conexión con el servidor y la base de datos.');

        // Show empty state instead of demo data - this ensures real issues are visible
        displayOrders([]);
        updatePagination({
            page: 1,
            limit: 50,
            total: 0,
            totalPages: 0
        });
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
    const totalPages = Math.max(1, pagination.totalPages || 1);
    document.getElementById('page-info').textContent =
        `Página ${pagination.page} de ${totalPages}`;

    document.getElementById('prev-page').disabled = pagination.page === 1;
    document.getElementById('next-page').disabled = pagination.page >= totalPages;
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

        // Build URL with date range parameters
        const fromDate = document.getElementById('analytics-from')?.value;
        const toDate = document.getElementById('analytics-to')?.value;

        let url = '/api/admin/analytics/chatbot';
        const params = new URLSearchParams();
        if (fromDate) params.append('from', fromDate);
        if (toDate) params.append('to', toDate);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetchWithRetry(url, {
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
        showError('Error al cargar análisis. Por favor, verifica la conexión con el servidor y la base de datos.');

        // Show empty state instead of demo data - this ensures real issues are visible
        const emptyData = {
            activeConversations: 0,
            totalConversations: 0,
            conversionRate: 0,
            avgResponseTime: 0,
            topIntents: []
        };
        updateAnalytics(emptyData);
    } finally {
        setLoading(sectionId, false);
    }
}

function updateAnalytics(data) {
    document.getElementById('active-conversations').textContent = data.activeConversations || 0;
    document.getElementById('total-conversations').textContent = data.totalConversations || 0;

    // Use conversion rate from API (calculated from DB)
    const conversionRate = typeof data.conversionRate === 'number' ? data.conversionRate.toFixed(1) : '0.0';
    document.getElementById('conversion-rate').textContent = `${conversionRate}%`;

    // Response time metrics
    document.getElementById('avg-response-time').textContent = formatResponseTime(data.averageResponseTime);
    const medianEl = document.getElementById('median-response-time');
    if (medianEl) medianEl.textContent = formatResponseTime(data.medianResponseTime);
    const p95El = document.getElementById('p95-response-time');
    if (p95El) p95El.textContent = formatResponseTime(data.p95ResponseTime);

    // Update intents list
    const intentsList = document.getElementById('intents-list');
    if (intentsList) {
        const intents = data.intents || [];
        if (intents.length === 0) {
            intentsList.innerHTML = '<div class="empty-state">No hay datos de intenciones disponibles</div>';
        } else {
            intentsList.innerHTML = intents.map(intent => `
                <div class="list-item">
                    <span>${escapeHtml(intent.name)}</span>
                    <span class="badge info">${intent.count}</span>
                    <span class="badge success">${intent.successRate?.toFixed(1) || 0}%</span>
                </div>
            `).join('');
        }
    }

    // Update popular artists
    const artistsList = document.getElementById('popular-artists');
    const artists = data.popularArtists || [];

    if (artists.length === 0) {
        artistsList.innerHTML = '<div class="empty-state">No hay datos de artistas disponibles</div>';
    } else {
        artistsList.innerHTML = artists.map(artist => `
            <div class="list-item">
                <span>${escapeHtml(artist.artist || artist.name)}</span>
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
                <span>${escapeHtml(movie.title || movie.name)}</span>
                <span class="badge info">${movie.count}</span>
            </div>
        `).join('');
    }
}

function formatResponseTime(seconds) {
    if (!seconds || seconds === 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
}

// ========================================
// Settings
// ========================================

async function loadSettings() {
    const sectionId = 'settings';

    try {
        setLoading(sectionId, true);

        // Load settings and pricing in parallel
        const [settingsResponse, pricingData] = await Promise.all([
            fetchWithRetry('/api/admin/settings', {
                signal: getAbortSignal(sectionId)
            }),
            useUsbPricing.getPricing(true).catch(e => {
                console.warn('USB pricing API failed, will use panel_settings:', e);
                return null;
            })
        ]);

        if (!settingsResponse.ok) {
            throw new Error(`HTTP error! status: ${settingsResponse.status}`);
        }

        const result = await settingsResponse.json();

        if (result.success) {
            // Determine pricing source: USB pricing API first, then panel_settings.usbPricing as fallback
            let pricing;
            if (pricingData) {
                // Use USB pricing API data (catalog)
                pricing = extractPricingForSettings(pricingData);
            } else if (result.data.usbPricing && typeof result.data.usbPricing === 'object') {
                // Fallback to panel_settings.usbPricing - validate it has the expected structure
                pricing = result.data.usbPricing;
                console.log('Using usbPricing from panel_settings:', pricing);
            } else {
                // No pricing data available
                console.warn('No pricing data available from API or panel_settings');
                pricing = null;
            }

            const configWithPricing = {
                ...result.data,
                pricing: pricing
            };
            populateSettings(configWithPricing);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Settings request cancelled');
            return;
        }

        console.error('Error loading settings:', error);
        showWarning('Error al cargar configuración. Intentando cargar precios desde el API.');

        // Try to load pricing from API even if settings failed
        try {
            const pricingData = await useUsbPricing.getPricing();
            populateSettings({
                chatbot: {
                    autoResponseEnabled: true,
                    responseDelay: 1000
                },
                pricing: extractPricingForSettings(pricingData)
            });
        } catch (pricingError) {
            console.error('Error loading pricing from API:', pricingError);
            // Show error - no hardcoded fallback. Prices must come from API.
            showError('Error al cargar precios desde el API. Por favor recargue la página.');
        }
    } finally {
        setLoading(sectionId, false);
    }
}

/**
 * Extract pricing data from the USB pricing API format to the settings format
 * Uses music prices as the default/representative prices for the settings display
 * @param {Object} pricingData - Data from useUsbPricing.getPricing()
 * @returns {Object} Pricing in settings format { '8GB': price, '32GB': price, ... }
 */
function extractPricingForSettings(pricingData) {
    const pricing = {};
    const capacities = ['8GB', '32GB', '64GB', '128GB', '256GB'];
    
    // Use music prices as the primary reference (most common product)
    for (const capacity of capacities) {
        // Try music first, then videos, then movies
        const musicItem = pricingData.music?.find(p => p.capacity === capacity);
        const videosItem = pricingData.videos?.find(p => p.capacity === capacity);
        const moviesItem = pricingData.movies?.find(p => p.capacity === capacity);
        
        const item = musicItem || videosItem || moviesItem;
        pricing[capacity] = item ? item.price : 0;
    }
    
    return pricing;
}

function populateSettings(config) {
    // Chatbot settings
    if (config.chatbot) {
        document.getElementById('auto-response-enabled').checked = config.chatbot.autoResponseEnabled;
        document.getElementById('response-delay').value = config.chatbot.responseDelay;
    }

    // Pricing - from either USB pricing API or panel_settings.usbPricing
    if (config.pricing) {
        document.getElementById('price-8gb').value = config.pricing['8GB'] || '';
        document.getElementById('price-32gb').value = config.pricing['32GB'] || '';
        document.getElementById('price-64gb').value = config.pricing['64GB'] || '';
        document.getElementById('price-128gb').value = config.pricing['128GB'] || '';
        document.getElementById('price-256gb').value = config.pricing['256GB'] || '';
    } else {
        // Clear placeholders if no pricing data available
        document.getElementById('price-8gb').value = '';
        document.getElementById('price-32gb').value = '';
        document.getElementById('price-64gb').value = '';
        document.getElementById('price-128gb').value = '';
        document.getElementById('price-256gb').value = '';
    }

    // Paths (new)
    if (config.processing?.sourcePaths) {
        document.getElementById('path-music').value = config.processing.sourcePaths.music || '';
        document.getElementById('path-videos').value = config.processing.sourcePaths.videos || '';
        document.getElementById('path-movies').value = config.processing.sourcePaths.movies || '';
        document.getElementById('path-series').value = config.processing.sourcePaths.series || '';
    }
}

// ========================================
// Filters
// ========================================

function initFilters() {
    // Orders filters - reset to page 1 when filters change
    document.getElementById('filter-status')?.addEventListener('change', () => { currentPage = 1; loadOrders(); });
    document.getElementById('filter-content-type')?.addEventListener('change', () => { currentPage = 1; loadOrders(); });
    document.getElementById('search-orders')?.addEventListener('input', debounce(() => { currentPage = 1; loadOrders(); }, 500));
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

    // Analytics date filters
    document.getElementById('analytics-from')?.addEventListener('change', loadAnalytics);
    document.getElementById('analytics-to')?.addEventListener('change', loadAnalytics);
    document.getElementById('refresh-analytics')?.addEventListener('click', loadAnalytics);

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
    document.getElementById('edit-order-btn')?.addEventListener('click', () => openEditModal(selectedOrderId));
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
// Edit Order Functions
// ========================================

let editingOrderId = null;

function openEditModal(orderId) {
    editingOrderId = orderId;
    // Fetch order details and populate form
    fetch(`/api/admin/orders/${orderId}`)
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                populateEditForm(result.data);
                document.getElementById('edit-order-modal').classList.add('active');
            }
        })
        .catch(err => {
            console.error('Error loading order:', err);
            showError('Error cargando datos del pedido');
        });
}

function populateEditForm(order) {
    document.getElementById('edit-order-number').textContent = order.orderNumber || order.order_number || order.id;
    document.getElementById('edit-customer-name').value = order.customerName || order.customer_name || '';
    document.getElementById('edit-customer-phone').value = order.customerPhone || order.phone_number || '';
    document.getElementById('edit-capacity').value = order.capacity || '32GB';
    document.getElementById('edit-content-type').value = order.contentType || order.product_type || 'music';
    document.getElementById('edit-price').value = order.price || 0;
    document.getElementById('edit-status').value = order.status || order.processing_status || 'pending';
    document.getElementById('edit-usb-label').value = order.usbLabel || order.usb_label || '';
    
    const customization = order.customization || order.customization_details;
    document.getElementById('edit-customization').value = 
        typeof customization === 'object' 
            ? JSON.stringify(customization, null, 2) 
            : customization || '';
    
    document.getElementById('edit-shipping-address').value = order.shippingAddress || order.shipping_address || '';
    
    // Load available USBs
    loadAvailableUSBs();
}

async function loadAvailableUSBs() {
    try {
        const response = await fetch('/api/admin/usbs/available');
        const result = await response.json();
        if (result.success) {
            const select = document.getElementById('edit-usb-label');
            const options = ['<option value="">Sin asignar</option>'];
            result.data.forEach(usb => {
                const labelEscaped = escapeHtml(usb.label);
                const capacityEscaped = escapeHtml(usb.capacity);
                options.push(`<option value="${labelEscaped}">${labelEscaped} (${capacityEscaped})</option>`);
            });
            select.innerHTML = options.join('');
        }
    } catch (error) {
        console.error('Error loading USBs:', error);
    }
}

function closeEditModal() {
    editingOrderId = null;
    document.getElementById('edit-order-modal').classList.remove('active');
}

async function saveOrderChanges(event) {
    event.preventDefault();
    
    if (!editingOrderId) return;
    
    let customization;
    try {
        const customizationText = document.getElementById('edit-customization').value;
        customization = customizationText ? JSON.parse(customizationText) : {};
    } catch (e) {
        showError('El JSON de personalización no es válido: ' + e.message);
        return;
    }
    
    const orderData = {
        customerName: document.getElementById('edit-customer-name').value,
        customerPhone: document.getElementById('edit-customer-phone').value,
        capacity: document.getElementById('edit-capacity').value,
        contentType: document.getElementById('edit-content-type').value,
        price: parseFloat(document.getElementById('edit-price').value),
        status: document.getElementById('edit-status').value,
        usbLabel: document.getElementById('edit-usb-label').value || null,
        customization: customization,
        shippingAddress: document.getElementById('edit-shipping-address').value
    };
    
    try {
        const response = await fetch(`/api/admin/orders/${editingOrderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('Pedido actualizado correctamente');
            closeEditModal();
            loadOrders();
        } else {
            showError(result.error || 'Error actualizando pedido');
        }
    } catch (error) {
        console.error('Error updating order:', error);
        showError('Error de conexión al actualizar pedido');
    }
}

// Initialize edit form
document.getElementById('edit-order-form')?.addEventListener('submit', saveOrderChanges);

// ========================================
// Utility Functions
// ========================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
    const sectionId = 'settings';

    try {
        setLoading(sectionId, true);

        // Collect form values
        const pricing = {
            '8GB': parseInt(document.getElementById('price-8gb').value) || 0,
            '32GB': parseInt(document.getElementById('price-32gb').value) || 0,
            '64GB': parseInt(document.getElementById('price-64gb').value) || 0,
            '128GB': parseInt(document.getElementById('price-128gb').value) || 0,
            '256GB': parseInt(document.getElementById('price-256gb').value) || 0
        };

        const settings = {
            chatbot: {
                autoResponseEnabled: document.getElementById('auto-response-enabled').checked,
                responseDelay: parseInt(document.getElementById('response-delay').value) || 1000
            },
            processing: {
                sourcePaths: {
                    music: document.getElementById('path-music').value,
                    videos: document.getElementById('path-videos').value,
                    movies: document.getElementById('path-movies').value,
                    series: document.getElementById('path-series').value
                }
            },
            // Save USB pricing to panel_settings as single source of truth
            usbPricing: pricing
        };

        // Client-side validation
        if (settings.chatbot.responseDelay < 0 || settings.chatbot.responseDelay > 10000) {
            showError('El retraso de respuesta debe estar entre 0 y 10000 ms');
            return;
        }

        for (const [capacity, price] of Object.entries(pricing)) {
            if (price < 0) {
                showError(`El precio de ${capacity} no puede ser negativo`);
                return;
            }
        }

        // Save general settings AND usbPricing to panel_settings
        const settingsResponse = await fetchWithRetry('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const settingsResult = await settingsResponse.json();

        if (!settingsResult.success) {
            throw new Error(settingsResult.error || 'Error al guardar configuración');
        }

        // Save pricing through the USB pricing API to update catalog
        // Update pricing for all categories (music, videos, movies)
        const categories = ['music', 'videos', 'movies'];
        const pricingUpdateErrors = [];

        for (const [capacity, price] of Object.entries(pricing)) {
            if (price > 0) { // Only update non-zero prices
                for (const categoryId of categories) {
                    try {
                        await useUsbPricing.updatePrice(categoryId, capacity, price, {
                            changedBy: 'admin_panel',
                            changeReason: 'Settings update from admin panel'
                        });
                    } catch (error) {
                        // Some capacities might not exist for all categories, which is expected (404)
                        if (!error.isNotFound && error.status !== 404) {
                            pricingUpdateErrors.push(`${categoryId} ${capacity}: ${error.message}`);
                        }
                    }
                }
            }
        }

        // Invalidate pricing cache after all updates
        useUsbPricing.invalidateCache();

        if (pricingUpdateErrors.length > 0) {
            console.warn('Some pricing updates failed:', pricingUpdateErrors);
            showSuccess('Configuración guardada. Algunos precios no pudieron actualizarse en el catálogo.');
        } else {
            showSuccess('Configuración y precios guardados exitosamente');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('Error al guardar configuración: ' + error.message);
    } finally {
        setLoading(sectionId, false);
    }
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

/**
 * Get demo orders data with dynamic pricing
 * Prices are fetched from the USB pricing API
 */
async function getDemoOrdersDataAsync() {
    // Try to get prices from API
    let prices = {
        '32GB': 84900,
        '64GB': 119900
    };

    try {
        const pricing = await useUsbPricing.getPricing();
        // Use music prices as reference for demo orders
        const music32 = pricing.music?.find(p => p.capacity === '32GB');
        const music64 = pricing.music?.find(p => p.capacity === '64GB');
        if (music32) prices['32GB'] = music32.price;
        if (music64) prices['64GB'] = music64.price;
    } catch (error) {
        console.warn('Could not load prices for demo data:', error);
    }

    return getDemoOrdersDataWithPrices(prices);
}

function getDemoOrdersDataWithPrices(prices) {
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
            price: prices['32GB'] || 84900,
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
            price: prices['64GB'] || 119900,
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
            price: prices['32GB'] || 84900,
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

function getDemoOrdersData() {
    // Synchronous fallback with default prices
    return getDemoOrdersDataWithPrices({
        '32GB': 84900,
        '64GB': 119900
    });
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
// Timeline Functions
// ========================================

let currentTimelineOrderId = null;

// Initialize timeline modal handlers
function initTimelineModal() {
    const viewTimelineBtn = document.getElementById('view-timeline-btn');
    const timelineModal = document.getElementById('timeline-modal');
    const timelineCloseBtn = document.querySelector('.timeline-close');
    const refreshTimelineBtn = document.getElementById('refresh-timeline-btn');

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
        'bot_message': '🤖 Mensaje del Bot',
        'system_event': '⚙️ Evento del Sistema',
        'capacity_selected': '📏 Capacidad Seleccionada',
        'genre_added': '🎵 Género Agregado',
        'address_provided': '📍 Dirección Proporcionada'
    };

    return typeMap[eventType] || eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Logs Tab Functions
// ========================================

let logsCurrentPage = 1;
let logsPerPage = 50;
let logsFilters = {
    from: null,
    to: null,
    type: null,
    phone: null
};

function initLogsFilters() {
    const refreshBtn = document.getElementById('refresh-logs');
    const clearBtn = document.getElementById('clear-logs-filters');
    const prevBtn = document.getElementById('logs-prev-page');
    const nextBtn = document.getElementById('logs-next-page');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            applyLogsFilters();
            loadLogs();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearLogsFilters);
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (logsCurrentPage > 1) {
                logsCurrentPage--;
                loadLogs();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            logsCurrentPage++;
            loadLogs();
        });
    }
}

function applyLogsFilters() {
    logsFilters.from = document.getElementById('logs-from')?.value || null;
    logsFilters.to = document.getElementById('logs-to')?.value || null;
    logsFilters.type = document.getElementById('logs-event-type')?.value || null;
    logsFilters.phone = document.getElementById('logs-phone')?.value || null;
    logsCurrentPage = 1; // Reset to first page when filters change
}

function clearLogsFilters() {
    document.getElementById('logs-from').value = '';
    document.getElementById('logs-to').value = '';
    document.getElementById('logs-event-type').value = '';
    document.getElementById('logs-phone').value = '';
    logsFilters = { from: null, to: null, type: null, phone: null };
    logsCurrentPage = 1;
    loadLogs();
}

async function loadLogs() {
    const timelineContainer = document.getElementById('logs-timeline');
    if (!timelineContainer) return;

    timelineContainer.innerHTML = '<p class="loading-text">Cargando eventos...</p>';

    try {
        // Build query parameters
        const params = new URLSearchParams();
        params.append('page', logsCurrentPage.toString());
        params.append('perPage', logsPerPage.toString());
        
        if (logsFilters.from) params.append('from', logsFilters.from);
        if (logsFilters.to) params.append('to', logsFilters.to);
        if (logsFilters.type) params.append('type', logsFilters.type);
        if (logsFilters.phone) params.append('phone', logsFilters.phone);

        const response = await fetch(`/api/admin/events?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Error al cargar eventos');
        }

        const { events, summary, availableTypes, pagination } = result.data;

        // Update event type dropdown
        updateLogsEventTypeDropdown(availableTypes);

        // Update summary cards
        updateLogsSummary(summary, pagination.total);

        // Update pagination
        updateLogsPagination(pagination);

        // Render events timeline
        renderLogsTimeline(events);

    } catch (error) {
        console.error('Error loading logs:', error);
        timelineContainer.innerHTML = `
            <div class="error-message">
                <p>❌ Error al cargar los eventos</p>
                <p class="error-details">${escapeHtml(error.message)}</p>
                <button class="btn btn-primary" onclick="loadLogs()">Reintentar</button>
            </div>
        `;
    }
}

function updateLogsEventTypeDropdown(availableTypes) {
    const dropdown = document.getElementById('logs-event-type');
    if (!dropdown) return;

    const currentValue = dropdown.value;
    dropdown.innerHTML = '<option value="">Todos los tipos</option>';

    availableTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = getLogEventLabel(type);
        if (type === currentValue) {
            option.selected = true;
        }
        dropdown.appendChild(option);
    });
}

function updateLogsSummary(summary, total) {
    // Update total events
    const totalEl = document.getElementById('logs-total-events');
    if (totalEl) totalEl.textContent = total.toLocaleString();

    // Count specific event types from summary
    let orderConfirmed = 0;
    let statusChanged = 0;
    let messages = 0;

    summary.forEach(item => {
        const type = item.event_type.toUpperCase();
        if (type === 'ORDER_CONFIRMED') {
            orderConfirmed = item.count;
        } else if (type === 'STATUS_CHANGED') {
            statusChanged = item.count;
        } else if (type === 'MESSAGE_RECEIVED' || type === 'MESSAGE_SENT') {
            messages += item.count;
        }
    });

    const orderEl = document.getElementById('logs-order-confirmed');
    const statusEl = document.getElementById('logs-status-changed');
    const messagesEl = document.getElementById('logs-messages');

    if (orderEl) orderEl.textContent = orderConfirmed.toLocaleString();
    if (statusEl) statusEl.textContent = statusChanged.toLocaleString();
    if (messagesEl) messagesEl.textContent = messages.toLocaleString();
}

function updateLogsPagination(pagination) {
    const pageInfo = document.getElementById('logs-page-info');
    const prevBtn = document.getElementById('logs-prev-page');
    const nextBtn = document.getElementById('logs-next-page');

    if (pageInfo) {
        pageInfo.textContent = `Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} eventos)`;
    }

    if (prevBtn) {
        prevBtn.disabled = pagination.page <= 1;
    }

    if (nextBtn) {
        nextBtn.disabled = pagination.page >= pagination.totalPages;
    }
}

function renderLogsTimeline(events) {
    const container = document.getElementById('logs-timeline');
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📭</span>
                <p>No se encontraron eventos para los filtros seleccionados</p>
            </div>
        `;
        return;
    }

    const timelineHtml = events.map(event => {
        const timestamp = new Date(event.created_at);
        const timeStr = timestamp.toLocaleString('es-CO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const typeLabel = getLogEventLabel(event.event_type);
        const typeClass = getLogEventClass(event.event_type);
        const payloadStr = event.payload_json ? formatLogPayload(event.payload_json) : '';

        return `
            <div class="log-event-item ${typeClass}">
                <div class="log-event-header">
                    <span class="log-event-type">${typeLabel}</span>
                    <span class="log-event-time">${timeStr}</span>
                </div>
                <div class="log-event-details">
                    <span class="log-event-phone">📱 ${escapeHtml(event.phone)}</span>
                    ${event.order_id ? `<span class="log-event-order">📦 ${escapeHtml(event.order_id)}</span>` : ''}
                    <span class="log-event-conversation" title="Conversation ID: ${escapeHtml(event.conversation_id)}">
                        💬 ${escapeHtml(event.conversation_id.substring(0, 12))}...
                    </span>
                </div>
                ${payloadStr ? `<div class="log-event-payload">${payloadStr}</div>` : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="logs-timeline">${timelineHtml}</div>`;
}

function getLogEventLabel(eventType) {
    const labels = {
        'MESSAGE_RECEIVED': '📥 Mensaje Recibido',
        'MESSAGE_SENT': '📤 Mensaje Enviado',
        'INTENT_DETECTED': '🎯 Intent Detectado',
        'INTENT_ROUTING': '🔀 Enrutamiento de Intent',
        'STATE_CHANGED': '🔄 Cambio de Estado',
        'FLOW_STARTED': '▶️ Flujo Iniciado',
        'FLOW_COMPLETED': '✅ Flujo Completado',
        'ORDER_INITIATED': '🛒 Pedido Iniciado',
        'ORDER_CONFIRMED': '✅ Pedido Confirmado',
        'ORDER_CANCELLED': '❌ Pedido Cancelado',
        'ORDER_COMPLETED': '🎉 Pedido Completado',
        'STATUS_CHANGED': '🔄 Estado Cambiado',
        'PAYMENT_CONFIRMED': '💰 Pago Confirmado',
        'SHIPPING_CAPTURED': '📦 Datos de Envío',
        'FOLLOWUP_SENT': '📨 Seguimiento Enviado',
        'FOLLOWUP_RESPONDED': '↩️ Respuesta a Seguimiento',
        'SESSION_STARTED': '🚀 Sesión Iniciada',
        'SESSION_ENDED': '🏁 Sesión Finalizada',
        'ERROR_OCCURRED': '⚠️ Error Ocurrido',
        'VALIDATION_FAILED': '❌ Validación Fallida'
    };
    return labels[eventType] || eventType.replace(/_/g, ' ');
}

function getLogEventClass(eventType) {
    const classes = {
        'ORDER_CONFIRMED': 'log-event-success',
        'ORDER_COMPLETED': 'log-event-success',
        'PAYMENT_CONFIRMED': 'log-event-success',
        'ORDER_CANCELLED': 'log-event-danger',
        'ERROR_OCCURRED': 'log-event-danger',
        'VALIDATION_FAILED': 'log-event-warning',
        'STATUS_CHANGED': 'log-event-info',
        'STATE_CHANGED': 'log-event-info',
        'MESSAGE_RECEIVED': 'log-event-neutral',
        'MESSAGE_SENT': 'log-event-neutral'
    };
    return classes[eventType] || 'log-event-default';
}

function formatLogPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';

    const relevantKeys = ['message', 'intent', 'confidence', 'previousState', 'newState', 
                          'previousStatus', 'newStatus', 'orderId', 'flowName', 'errorMessage'];
    
    const items = [];
    for (const key of relevantKeys) {
        if (payload[key] !== undefined && payload[key] !== null) {
            let value = payload[key];
            if (typeof value === 'string' && value.length > 100) {
                value = value.substring(0, 100) + '...';
            }
            items.push(`<span class="payload-item"><strong>${key}:</strong> ${escapeHtml(String(value))}</span>`);
        }
    }

    return items.length > 0 ? items.join(' | ') : '';
}

// Initialize logs filters when document loads
document.addEventListener('DOMContentLoaded', () => {
    initLogsFilters();
});

// Add timeline modal initialization to the main init
const originalInitModal = initModal;
initModal = function () {
    if (originalInitModal) originalInitModal();
    initTimelineModal();
};

