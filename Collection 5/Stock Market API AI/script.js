document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION & STATE ---
    let chartInstance = null;
    let currentSymbol = null;
    let updateInterval = null;
    let debounceTimer;
    const POPULAR_SYMBOLS = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM',
        'JNJ', 'V', 'WMT', 'LMT', 'UNH', 'MA', 'PG', 'HD', 'DIS', 'BAC',
        'PFE', 'KO', 'XOM', 'CVX', 'ADBE', 'CRM', 'NFLX', 'INTC'
    ];

    // --- DOM ELEMENTS ---
    const searchInput = document.getElementById('search-input');
    const tickerList = document.getElementById('ticker-list');
    const defaultView = document.getElementById('default-view');
    const selectedStockView = document.getElementById('selected-stock-view');
    const stockHeader = document.getElementById('stock-header');
    const stockChartCanvas = document.getElementById('stock-chart');
    const stockInfo = document.getElementById('stock-info');

    // --- API & DATA HANDLING ---

    async function fetchFromAPI(endpoint) {
    // This now calls your own Netlify Function.
    // Remember to match the filename 'fetchAPI.js' you created.
    const url = `/.netlify/functions/fetchAPI?endpoint=${encodeURIComponent(endpoint)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API Error: ${response.status}`);
    }
    return response.json();
    }

    function renderTickerList(stocks, shouldScroll) {
        if (!Array.isArray(stocks) || stocks.length === 0) {
            tickerList.innerHTML = `<div class="p-4 text-center text-[#8b949e]">No stocks to display.</div>`;
            return;
        }
        const tickerItemsHTML = stocks.map(s => `
            <div class="ticker-item-vertical p-4 border-b border-[#21262d] cursor-pointer" data-symbol="${s.symbol}">
                <span class="ticker-symbol font-bold text-lg text-[#8b949e]">${s.symbol}</span>
                <span class="text-xs text-[#484f58] block truncate">${s.name || s.companyName}</span>
            </div>
        `).join('');

        tickerList.innerHTML = shouldScroll ? tickerItemsHTML + tickerItemsHTML : tickerItemsHTML;

        if (shouldScroll) {
            tickerList.classList.add('scrolling');
        } else {
            tickerList.classList.remove('scrolling');
        }
    }

    async function populatePopularTicker() {
        try {
            const popularQuotes = await fetchFromAPI(`/quote/${POPULAR_SYMBOLS.join(',')}`);
            renderTickerList(popularQuotes, true);
        } catch (error) {
            console.error("Failed to populate popular ticker:", error);
            tickerList.innerHTML = `<div class="p-4 text-red-500">Error loading symbols.</div>`;
        }
    }

    async function searchAndDisplay(query) {
        tickerList.innerHTML = `<div class="p-4 text-center text-[#8b949e]">Searching...</div>`;
        tickerList.classList.remove('scrolling');
        try {
            // Ensure the query is properly encoded for the URL.
            const searchResults = await fetchFromAPI(`/search?query=${encodeURIComponent(query)}&limit=50&exchange=NASDAQ,NYSE`);
            if (Array.isArray(searchResults) && searchResults.length > 0) {
                renderTickerList(searchResults, false);
            } else {
                tickerList.innerHTML = `<div class="p-4 text-center text-[#8b949e]">No results found.</div>`;
            }
        } catch (error) {
            console.error("Search failed:", error);
            tickerList.innerHTML = `<div class="p-4 text-red-500">Search failed. Please try again.</div>`;
        }
    }

    async function displayStockData(symbol) {
        try {
            defaultView.classList.add('hidden');
            selectedStockView.classList.remove('hidden');
            stockHeader.innerHTML = `<div class="text-2xl font-bold">Loading ${symbol}...</div>`;
            if (chartInstance) chartInstance.destroy();
            stockInfo.innerHTML = 'Fetching details...';

            const [quoteData, profileData, historicalData] = await Promise.all([
                fetchFromAPI(`/quote/${symbol}`),
                fetchFromAPI(`/profile/${symbol}`),
                // Fetch daily data for the last year for a faster initial chart load.
                fetchFromAPI(`/historical-price-full/${symbol}?timeseries=365`)
            ]);

            if (!quoteData?.[0] || !profileData?.[0] || !historicalData?.historical) {
                throw new Error(`Incomplete data for ${symbol}. The API may be rate-limiting or the symbol is invalid.`);
            }

            const quote = quoteData[0];
            const profile = profileData[0];
            const historical = historicalData.historical.slice().reverse();

            const change = quote.change;
            const changePercent = quote.changesPercentage;
            const isPositive = change >= 0;
            const colorClass = isPositive ? 'text-green-400' : 'text-red-400';
            const sign = isPositive ? '+' : '';

            stockHeader.innerHTML = `
                <div class="flex justify-between items-baseline">
                    <h1 class="text-3xl lg:text-4xl font-bold text-white">${profile.companyName} (${profile.symbol})</h1>
                    <div class="text-right">
                        <p class="text-3xl font-bold ${colorClass}">${sign}${changePercent.toFixed(2)}%</p>
                        <p class="text-lg ${colorClass}">${sign}${change.toFixed(2)}</p>
                    </div>
                </div>
            `;

            stockInfo.innerHTML = `
                <p class="mb-4 text-[#8b949e]">${profile.description}</p>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div><span class="font-bold text-white">Last Price:</span> $${quote.price.toFixed(2)}</div>
                    <div><span class="font-bold text-white">Day High:</span> $${quote.dayHigh.toFixed(2)}</div>
                    <div><span class="font-bold text-white">Day Low:</span> $${quote.dayLow.toFixed(2)}</div>
                    <div><span class="font-bold text-white">Open:</span> $${quote.open.toFixed(2)}</div>
                    <div><span class="font-bold text-white">Volume:</span> ${(quote.volume / 1e6).toFixed(2)}M</div>
                    <div><span class="font-bold text-white">Market Cap:</span> ${(profile.mktCap / 1e9).toFixed(2)}B</div>
                    <div><span class="font-bold text-white">Sector:</span> ${profile.sector}</div>
                    <div><span class="font-bold text-white">Industry:</span> ${profile.industry}</div>
                </div>
            `;

            renderGraph(historical, isPositive);

        } catch (error) {
            console.error(`Error displaying data for ${symbol}:`, error);
            stockHeader.innerHTML = `<h1 class="text-2xl font-bold text-red-500">Failed to load data for ${symbol}</h1>`;
            stockInfo.innerHTML = `<p class="text-red-400">${error.message}</p>`;
        }
    }

    function renderGraph(historicalData, isPositive) {
        if (chartInstance) chartInstance.destroy();

        const labels = historicalData.map(d => d.date);
        const dataPoints = historicalData.map(d => d.close);
        const borderColor = isPositive ? 'rgba(34, 197, 94, 1)' : 'rgba(248, 113, 113, 1)';
        const gradient = stockChartCanvas.getContext('2d').createLinearGradient(0, 0, 0, stockChartCanvas.offsetHeight);
        gradient.addColorStop(0, isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(248, 113, 113, 0.3)');
        gradient.addColorStop(1, 'rgba(13, 17, 23, 0)');

        chartInstance = new Chart(stockChartCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Close Price',
                    data: dataPoints,
                    borderColor: borderColor,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        ticks: { color: '#8b949e', font: { family: "'Roboto Mono', monospace" } },
                        grid: { color: '#21262d' }
                    },
                    x: {
                        type: 'time',
                        time: { unit: 'month' },
                        ticks: { color: '#8b949e', font: { family: "'Roboto Mono', monospace" } },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    // --- EVENT LISTENERS ---
    tickerList.addEventListener('click', (event) => {
        const target = event.target.closest('.ticker-item-vertical');
        if (target) {
            const symbol = target.dataset.symbol;
            if (symbol === currentSymbol) return;

            document.querySelectorAll('.ticker-item-vertical.selected').forEach(el => el.classList.remove('selected'));
            target.classList.add('selected');

            currentSymbol = symbol;
            displayStockData(symbol);

            if (updateInterval) clearInterval(updateInterval);
            // Increased the update interval to 5 minutes to reduce API calls.
            updateInterval = setInterval(() => {
                if (currentSymbol) {
                    displayStockData(currentSymbol);
                }
            }, 300000);
        }
    });

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const searchTerm = e.target.value.trim().toUpperCase();

        if (searchTerm) {
            // Reduced debounce time for a more responsive feel.
            debounceTimer = setTimeout(() => {
                searchAndDisplay(searchTerm);
            }, 300);
        } else {
            populatePopularTicker();
        }
    });

    // --- INITIALIZATION ---
    populatePopularTicker();
});