(function () {
    const apiKey = 'YOUR-API-KEY-FROM-REBRICKABLE'; // Replace with your actual API key
    const debugMode = false; // Enable debug logs for now to test

    function logDebug(message, data = null) {
        if (debugMode) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] ${message}`, data || '');
        }
    }

    // Function to reverse the ID (excluding the 'M') and fetch product data from Rebrickable API
async function fetchRebrickableData(productId) {
    const normalizedProductId = productId.toUpperCase(); // Normalize the productId
    logDebug(`Normalized product ID: ${normalizedProductId}`);

    // Check if product ID exists in cache
    const cachedData = await getCacheItem(normalizedProductId);
    logCacheMetrics(cachedData);

    if (cachedData) {
        logDebug(`Cache hit for product ID: ${normalizedProductId}`, cachedData);
        return cachedData; // Return cached data
    } else {
        logDebug(`Cache miss for product ID: ${normalizedProductId}`);
    }

    // Proceed with fetching data from the API
    const reversedId = productId.slice(1).split('').reverse().join(''); // Remove 'M' and reverse the string
    logDebug(`Reversed ID for Rebrickable lookup: ${reversedId}`);

    const url = `https://rebrickable.com/api/v3/lego/sets/${reversedId}-1/`;
    logDebug(`Rebrickable API URL: ${url}`);

    const startTime = performance.now(); // Log network request start time

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `key ${apiKey}` // Use the hardcoded API key
            }
        });

        const endTime = performance.now(); // Log network request end time
        logDebug(`Network request completed in ${(endTime - startTime).toFixed(2)} ms`);

        if (response.ok) {
            const data = await response.json();
            if (data && data.name) {
                const productName = data.name.trim();
                const productImageUrl = data.set_img_url;
                logDebug(`Product name found on Rebrickable: ${productName}`);
                logDebug(`Product image URL: ${productImageUrl}`);

                // Cache the fetched data using the normalized productId
                await setCacheItem(normalizedProductId, { name: productName, imageUrl: productImageUrl });

                return { name: productName, imageUrl: productImageUrl };
            } else {
                logDebug(`Product name not found in Rebrickable data for product ID: ${normalizedProductId}`);
            }
        } else {
            logDebug(`Failed to fetch data from Rebrickable for product ID: ${normalizedProductId}`, response.statusText);
        }
    } catch (error) {
        logDebug(`Error fetching data from Rebrickable for product ID: ${normalizedProductId}`, error);
    }

    return null; // Return null if data could not be fetched
}


    // Function to get a specific product from the cache
    function getCacheItem(productId) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(productId, (result) => {
                    if (chrome.runtime.lastError) {
                        logDebug('Error getting cache item from storage:', chrome.runtime.lastError);
                        resolve(null);
                    } else {
                        resolve(result[productId] || null);
                    }
                });
            } else {
                logDebug('chrome.storage.local is not available');
                resolve(null); // Fallback for environments without chrome.storage.local
            }
        });
    }

    // Function to set a specific product in the cache
    function setCacheItem(productId, data) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({ [productId]: data }, () => {
                    if (chrome.runtime.lastError) {
                        logDebug('Error setting cache item in storage:', chrome.runtime.lastError);
                    } else {
                        logDebug(`Cache item for ${productId} successfully updated in chrome.storage.local.`);
                    }
                    resolve();
                });
            } else {
                logDebug('chrome.storage.local is not available');
                resolve(); // Fallback for environments without chrome.storage.local
            }
        });
    }

    // Function to log cache metrics
    function logCacheMetrics() {
        chrome.storage.local.get(null, (items) => {
            const productKeys = Object.keys(items).filter(key => key.startsWith('M'));
            const itemCount = productKeys.length;
            const cacheSizeInBytes = new Blob([JSON.stringify(items)]).size;
            logDebug(`Cache contains ${itemCount} items, size: ${cacheSizeInBytes} bytes`);

            // Optionally log actual bytes used by chrome.storage.local
            chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                logDebug(`Storage currently using ${bytesInUse} bytes`);
            });

            logDebug(`Cached data: ${JSON.stringify(items)}`);
        });
    }


    // Function to update product title and image
    async function updateProductTitleAndImage(productTitleElement, productId) {
        logDebug(`Updating product with ID: ${productId}`);

        const rebrickableData = await fetchRebrickableData(productId);
        const invalidKeywords = ["Plates", "Beams", "Bricks", "Miscellaneous"];

        if (rebrickableData && !invalidKeywords.some(keyword => rebrickableData.name.includes(keyword))) {
            productTitleElement.textContent = rebrickableData.name;
            logDebug(`Updated product title to: ${rebrickableData.name}`);

            let productImageElement = null;

            if (productTitleElement.closest('.product-image')) {
                productImageElement = productTitleElement.closest('.product-image').querySelector('img');
            } else if (productTitleElement.closest('.product-snippet')) {
                productImageElement = productTitleElement.closest('.product-snippet').querySelector('img');
            } else if (document.querySelector('.product-image__content img')) {
                productImageElement = document.querySelector('.product-image__content img');
            } else if (productTitleElement.closest('.p-cursor-pointer')) { // Wishlist-specific selector
                productImageElement = productTitleElement.closest('.p-cursor-pointer').querySelector('img');
            }

            if (productImageElement && rebrickableData.imageUrl) {
                productImageElement.src = rebrickableData.imageUrl;
                productImageElement.srcset = `${rebrickableData.imageUrl} 360w, ${rebrickableData.imageUrl} 540w, ${rebrickableData.imageUrl} 720w, ${rebrickableData.imageUrl} 1024w`;
                productImageElement.alt = rebrickableData.name;
                logDebug(`Updated product image to: ${rebrickableData.imageUrl}`);
            } else {
                logDebug('Product image element not found or no image URL provided.');
            }
        } else {
            logDebug('No matching title found on Rebrickable or title seems incorrect.');
        }
    }

    // Function to check for a product on a product page
    function processProductPage() {
        logDebug('Processing product page...');
        const productTitleElement = document.querySelector('h1.product-info__header_title.dj_skin_product_title');
        const productIdElement = document.querySelector('p.product-info__header_brief');

        if (productTitleElement && productIdElement) {
            const productIdText = productTitleElement.textContent.trim();
            const productId = productIdText.match(/M\d+/)[0];
            logDebug(`Product ID found: ${productId}`);
            updateProductTitleAndImage(productTitleElement, productId);
        } else {
            logDebug('Product ID or title element not found.');
        }
    }

    function processProductListingPage() {
        logDebug('Processing product listing page...');
        const productTitleElements = document.querySelectorAll('a.product-snippet__title-normal');

        productTitleElements.forEach((element, index) => {
            logDebug(`Element ${index} href: ${element.href}`);

            let productIdMatch = element.href.match(/\/products\/m(\d+)/i);

            if (!productIdMatch) {
                const productIdWithoutM = element.href.match(/\/products\/(\d+)/i);
                if (productIdWithoutM) {
                    productIdMatch = [`M${productIdWithoutM[1]}`, productIdWithoutM[1]];
                }
            }

            if (productIdMatch) {
                const productId = `M${productIdMatch[1]}`;
                logDebug(`Product ID found for element ${index}: ${productId}`);
                updateProductTitleAndImage(element, productId);
            } else {
                logDebug(`No product ID found in the URL for element ${index}.`);
                element.textContent += ' (No ID found)';
            }
        });
    }

    function processWishlistPage() {
        logDebug('Processing wishlist page...');
        const productTitleElements = document.querySelectorAll('p.p-text-wish_desc');

        productTitleElements.forEach((element, index) => {
            const productIdText = element.textContent.trim();
            const productIdMatch = productIdText.match(/M\d+/);

            if (productIdMatch) {
                const productId = productIdMatch[0];
                logDebug(`Product ID found for wishlist item ${index}: ${productId}`);
                updateProductTitleAndImage(element, productId);
            } else {
                logDebug(`No product ID found for wishlist item ${index}.`);
                element.textContent += ' (No ID found)';
            }
        });
    }

    // Determine which page type we're on and process accordingly
    if (document.querySelector('h1.product-info__header_title.dj_skin_product_title')) {
        processProductPage();
    } else if (document.querySelector('p.p-text-wish_desc')) {
        processWishlistPage();
    } else {
        processProductListingPage();
    }
})();
