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

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSocket();
    initFilters();
    initModal();
    updateTime();
    loadDashboard();
    
    // Auto-refresh dashboard every 30 seconds
    setInterval(loadDashboard, 30000);
    setInterval(updateTime, 1000);
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
    socket = io();
    
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
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
    try {
        const response = await fetch('/api/admin/dashboard');
        const result = await response.json();
        
        if (result.success) {
            updateDashboardStats(result.data);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
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
    genresList.innerHTML = '';
    (data.topGenres || []).forEach(genre => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <span>${genre.name}</span>
            <span class="badge info">${genre.count}</span>
        `;
        genresList.appendChild(item);
    });
}

// ========================================
// Orders Management
// ========================================

async function loadOrders() {
    try {
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
        
        const response = await fetch(`/api/admin/orders?${params}`);
        const result = await response.json();
        
        if (result.success) {
            displayOrders(result.data);
            updatePagination(result.pagination);
        }
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

function displayOrders(orders) {
    const tbody = document.getElementById('orders-table-body');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay pedidos</td></tr>';
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
    
    try {
        const response = await fetch(`/api/admin/content/structure/${category}`);
        const result = await response.json();
        
        if (result.success) {
            displayFolderTree(result.data);
        }
    } catch (error) {
        console.error('Error loading catalog:', error);
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
    try {
        const response = await fetch('/api/admin/processing/queue');
        const result = await response.json();
        
        if (result.success) {
            displayProcessingQueue(result.data);
        }
    } catch (error) {
        console.error('Error loading processing queue:', error);
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
    try {
        const response = await fetch('/api/admin/analytics/chatbot');
        const result = await response.json();
        
        if (result.success) {
            updateAnalytics(result.data);
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function updateAnalytics(data) {
    document.getElementById('active-conversations').textContent = data.activeConversations || 0;
    document.getElementById('total-conversations').textContent = data.totalConversations || 0;
    document.getElementById('conversion-rate').textContent = '0%'; // Calculate from data
    document.getElementById('avg-response-time').textContent = `${data.averageResponseTime || 0}s`;
    
    // Update popular artists
    const artistsList = document.getElementById('popular-artists');
    artistsList.innerHTML = (data.popularArtists || []).map(artist => `
        <div class="list-item">
            <span>${artist.artist}</span>
            <span class="badge info">${artist.count}</span>
        </div>
    `).join('');
    
    // Update popular movies
    const moviesList = document.getElementById('popular-movies');
    moviesList.innerHTML = (data.popularMovies || []).map(movie => `
        <div class="list-item">
            <span>${movie.title}</span>
            <span class="badge info">${movie.count}</span>
        </div>
    `).join('');
}

// ========================================
// Settings
// ========================================

async function loadSettings() {
    try {
        const response = await fetch('/api/admin/settings');
        const result = await response.json();
        
        if (result.success) {
            populateSettings(result.data);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
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
