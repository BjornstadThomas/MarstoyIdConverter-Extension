// content.js

// Function to reverse the ID (excluding the 'M') and fetch product data from Rebrickable API
async function fetchRebrickableData(productId) {
    const reversedId = productId.slice(1).split('').reverse().join(''); // Remove 'M' and reverse the string
    console.log(`Reversed ID for Rebrickable lookup: ${reversedId}`); // Print the reversed ID
    
    const url = `https://rebrickable.com/api/v3/lego/sets/${reversedId}-1/`;
    console.log(`Rebrickable API URL: ${url}`);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'key 3e613d4c0f5f966fd67529afe024212d' // Replace with your actual API key
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.name) {
                const productName = data.name.trim();
                console.log(`Product name found on Rebrickable: ${productName}`);
                return productName;
            } else {
                console.error(`Product name not found in Rebrickable data for product ID: ${productId}`);
            }
        } else {
            console.error(`Failed to fetch data from Rebrickable for product ID: ${productId}`);
        }
    } catch (error) {
        console.error(`Error fetching data from Rebrickable for product ID: ${productId}`, error);
    }
}

// Function to update product title
async function updateProductTitle(productTitleElement, productId) {
    const rebrickableTitle = await fetchRebrickableData(productId);
    
    // Example of a basic validation check to prevent incorrect updates
    const invalidKeywords = ["Plates", "Beams", "Bricks", "Miscellaneous"];
    
    if (rebrickableTitle && !invalidKeywords.some(keyword => rebrickableTitle.includes(keyword))) {
        productTitleElement.textContent = rebrickableTitle;
        console.log(`Updated product title to: ${rebrickableTitle}`);
    } else {
        console.log('No matching title found on Rebrickable or title seems incorrect.');
    }
}

// Function to check for a product on a product page
function processProductPage() {
    const productTitleElement = document.querySelector('h1.product-info__header_title.dj_skin_product_title'); // Updated selector
    const productIdElement = document.querySelector('p.product-info__header_brief');
    
    if (productTitleElement && productIdElement) {
        const productIdText = productTitleElement.textContent.trim();
        const productId = productIdText.match(/M\d+/)[0];  // Extracting the product ID (e.g., M17267)
        console.log(`Product ID found: ${productId}`);
        updateProductTitle(productTitleElement, productId);
    } else {
        console.log('Product ID or title element not found.');
    }
}

// Function to check for products on the product listing page
function processProductListingPage() {
    const productTitleElements = document.querySelectorAll('a.product-snippet__title-normal');
    
    productTitleElements.forEach(async (element) => {
        const productIdMatch = element.href.match(/\/products\/m(\d+)/);
        if (productIdMatch) {
            const productId = `M${productIdMatch[1]}`;
            console.log(`Product ID found: ${productId}`);
            updateProductTitle(element, productId);
        } else {
            console.log('No product ID found in the URL.');
        }
    });
}

// Check if we are on a product page or product listing page
if (document.querySelector('h1.product-info__header_title.dj_skin_product_title')) { // Updated condition
    processProductPage();
} else {
    processProductListingPage();
}
