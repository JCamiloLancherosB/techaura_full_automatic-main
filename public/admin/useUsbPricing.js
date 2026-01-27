/**
 * useUsbPricing Hook
 * Provides a single source of truth for USB pricing data.
 * Fetches from backend API and caches results.
 * 
 * Usage:
 *   const { getPricing, getPrice, invalidateCache } = useUsbPricing();
 *   
 *   // Get all pricing data
 *   const pricing = await getPricing();
 *   
 *   // Get price for specific category and capacity
 *   const price = await getPrice('music', '32GB');
 */

const useUsbPricing = (function() {
    // Cache storage
    let pricingCache = null;
    let cacheTimestamp = 0;
    const CACHE_TTL = 60000; // 60 seconds cache TTL

    // Loading state
    let isLoading = false;
    let loadPromise = null;

    /**
     * Fetch pricing data from API
     * @returns {Promise<Object>} Pricing data
     */
    async function fetchPricing() {
        const response = await fetch('/api/admin/pricing/usb');
        
        if (!response.ok) {
            throw new Error(`Failed to fetch pricing: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Unknown error fetching pricing');
        }

        return result.data;
    }

    /**
     * Get pricing data (from cache or fetch)
     * @param {boolean} forceRefresh - Force cache refresh
     * @returns {Promise<Object>} Pricing data with structure: { music: [...], videos: [...], movies: [...] }
     */
    async function getPricing(forceRefresh = false) {
        const now = Date.now();
        const cacheValid = pricingCache && (now - cacheTimestamp) < CACHE_TTL;

        // Return cached data if valid and not forcing refresh
        if (cacheValid && !forceRefresh) {
            return pricingCache;
        }

        // If already loading, wait for the existing promise
        if (isLoading && loadPromise) {
            return loadPromise;
        }

        // Start loading
        isLoading = true;
        loadPromise = fetchPricing()
            .then(data => {
                pricingCache = data;
                cacheTimestamp = Date.now();
                return data;
            })
            .finally(() => {
                isLoading = false;
                loadPromise = null;
            });

        return loadPromise;
    }

    /**
     * Get price for a specific category and capacity
     * @param {string} categoryId - 'music', 'videos', or 'movies'
     * @param {string} capacity - '8GB', '32GB', '64GB', '128GB', or '256GB'
     * @returns {Promise<number>} Price in Colombian Pesos
     */
    async function getPrice(categoryId, capacity) {
        const pricing = await getPricing();
        const categoryPricing = pricing[categoryId];

        if (!categoryPricing) {
            console.warn(`[useUsbPricing] Unknown category: ${categoryId}`);
            return 0;
        }

        const item = categoryPricing.find(p => p.capacity === capacity);
        
        if (!item) {
            console.warn(`[useUsbPricing] Unknown capacity ${capacity} for ${categoryId}`);
            return 0;
        }

        return item.price;
    }

    /**
     * Get pricing item for a specific category and capacity
     * @param {string} categoryId - 'music', 'videos', or 'movies'
     * @param {string} capacity - '8GB', '32GB', '64GB', '128GB', or '256GB'
     * @returns {Promise<Object|null>} Pricing item or null
     */
    async function getPricingItem(categoryId, capacity) {
        const pricing = await getPricing();
        const categoryPricing = pricing[categoryId];

        if (!categoryPricing) {
            return null;
        }

        return categoryPricing.find(p => p.capacity === capacity) || null;
    }

    /**
     * Get all available capacities for a category
     * @param {string} categoryId - 'music', 'videos', or 'movies'
     * @returns {Promise<string[]>} Array of capacity strings
     */
    async function getAvailableCapacities(categoryId) {
        const pricing = await getPricing();
        const categoryPricing = pricing[categoryId];

        if (!categoryPricing) {
            return [];
        }

        return categoryPricing.map(p => p.capacity);
    }

    /**
     * Update pricing for a specific category and capacity
     * @param {string} categoryId - 'music', 'videos', or 'movies'
     * @param {string} capacity - '8GB', '32GB', '64GB', '128GB', or '256GB'
     * @param {number} price - New price
     * @param {Object} options - Additional options (changedBy, changeReason, etc.)
     * @returns {Promise<Object>} API response
     */
    async function updatePrice(categoryId, capacity, price, options = {}) {
        const response = await fetch('/api/admin/pricing/usb', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                categoryId,
                capacity,
                price,
                ...options
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            // Create error with status code for easier handling
            const error = new Error(result.error || `Failed to update pricing: ${response.status}`);
            error.status = response.status;
            error.isNotFound = response.status === 404;
            throw error;
        }

        // Invalidate cache after successful update
        invalidateCache();

        return result;
    }

    /**
     * Invalidate the pricing cache (force refresh on next call)
     */
    function invalidateCache() {
        pricingCache = null;
        cacheTimestamp = 0;
    }

    /**
     * Check if pricing data is cached
     * @returns {boolean}
     */
    function isCached() {
        const now = Date.now();
        return pricingCache && (now - cacheTimestamp) < CACHE_TTL;
    }

    /**
     * Format price in Colombian Pesos
     * @param {number} price - Price in COP
     * @returns {string} Formatted price
     */
    function formatPrice(price) {
        return `$${price.toLocaleString('es-CO')}`;
    }

    // Public API
    return {
        getPricing,
        getPrice,
        getPricingItem,
        getAvailableCapacities,
        updatePrice,
        invalidateCache,
        isCached,
        formatPrice
    };
})();
