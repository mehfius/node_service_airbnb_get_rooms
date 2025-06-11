// src/scraper.js
const puppeteer = require('puppeteer');

function buildAirbnbUrl(params) {
    const baseUrl = 'https://www.airbnb.com.br';
    const path = `/s/${params.location_path}/homes`;
    const queryParams = new URLSearchParams();
    queryParams.append('checkin', params.checkin_date);
    queryParams.append('checkout', params.checkout_date);
    queryParams.append('adults', params.num_adults);
    queryParams.append('query', params.search_query_display);
    queryParams.append('min_bedrooms', params.min_bedrooms);
    params.refinement_paths.forEach(p => queryParams.append('refinement_paths[]', p));
    params.room_types.forEach(rt => queryParams.append('room_types[]', rt));
    params.amenities.forEach(a => queryParams.append('amenities[]', a));
    params.flexible_trip_lengths.forEach(ftl => queryParams.append('flexible_trip_lengths[]', ftl));
    queryParams.append('acp_id', params.acp_id);
    queryParams.append('date_picker_type', params.date_picker_type);
    queryParams.append('place_id', params.place_id);
    queryParams.append('source', params.source);
    queryParams.append('search_type', params.search_type);
    queryParams.append('parent_city_place_id', params.parent_city_place_id);
    queryParams.append('monthly_start_date', params.monthly_start_date);
    queryParams.append('monthly_length', params.monthly_length);
    queryParams.append('monthly_end_date', params.monthly_end_date);
    queryParams.append('search_mode', params.search_mode);
    queryParams.append('price_filter_input_type', params.price_filter_input_type);
    queryParams.append('price_filter_num_nights', params.price_filter_num_nights);
    queryParams.append('channel', params.channel);
    queryParams.append('update_selected_filters', params.update_selected_filters);
    queryParams.append('pagination_search', params.pagination_search);
    queryParams.append('federated_search_session_id', params.federated_search_session_id);
    queryParams.append('cursor', params.cursor);
    if (params.room_types.includes('Entire home/apt')) {
        queryParams.append('selected_filter_order[]', 'room_types:Entire home/apt');
    }
    if (params.min_bedrooms) {
        queryParams.append('selected_filter_order[]', `min_bedrooms:${params.min_bedrooms}`);
    }
    params.amenities.forEach(a => {
        queryParams.append('selected_filter_order[]', `amenities:${a}`);
    });
    return `${baseUrl}${path}?${queryParams.toString()}`;
}

async function getAirbnbListingDetails(params) {
    // Registra o tempo de início do processamento
    const startTime = new Date();
    console.log(`Início do processamento: ${startTime.toISOString()}`);

    const airbnbUrl = buildAirbnbUrl(params);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-gpu',
                '--enable-logging',
                '--disable-dev-shm-usage',
                '--incognito'
            ]
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 900 });
        await page.goto(airbnbUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const itemSelector = 'div[itemprop="itemListElement"]';
        const expectedMinCount = 18;
        console.log(`Aguardando até que haja pelo menos ${expectedMinCount} elementos com o seletor '${itemSelector}'...`);
        try {
            await page.waitForFunction(
                (selector, expectedCount) => {
                    return document.querySelectorAll(selector).length >= expectedCount;
                },
                { timeout: 60000, polling: 'mutation' },
                itemSelector,
                expectedMinCount
            );
        } catch (waitError) {
            console.warn(`Aviso: Erro ao esperar pelos elementos: ${waitError.message}. Tentando extrair o que foi carregado.`);
        }
        const listings = await page.evaluate((selector) => {
            const elements = document.querySelectorAll(selector);
            const data = [];
            const roomIdRegex = /\/rooms\/(\d+)\?/;
            elements.forEach(el => {
                const nameMeta = el.querySelector('meta[itemprop="name"]');
                const urlMeta = el.querySelector('meta[itemprop="url"]');
                let name = null;
                let roomId = null;
                let fullUrl = null;
                if (nameMeta) {
                    name = nameMeta.getAttribute('content');
                }
                if (urlMeta) {
                    fullUrl = urlMeta.getAttribute('content');
                    const match = fullUrl.match(roomIdRegex);
                    if (match && match[1]) {
                        roomId = match[1];
                    }
                }
                const imageSrcs = [];
                const pictures = el.querySelectorAll('picture');
                pictures.forEach(picture => {
                    const img = picture.querySelector('img');
                    if (img && img.src) {
                        imageSrcs.push(img.src);
                    }
                });

                // Captura o preço
                let price = null;
                const buttons = el.querySelectorAll('button[type="button"]');
                buttons.forEach(button => {
                    const priceSpan = Array.from(button.querySelectorAll('span')).find(span => span.textContent.trim().startsWith('R$'));
                    if (priceSpan) {
                        // Remove "R$" e pontuação, deixando apenas os números
                        price = priceSpan.textContent.trim().replace(/[^0-9]/g, '');
                    }
                });

                if (name || roomId) {
                    data.push({
                        name: name,
                        roomId: roomId,
                        url: fullUrl,
                        imageSrcs: imageSrcs,
                        price: price // Adiciona o preço formatado ao objeto
                    });
                }
            });
            return data;
        }, itemSelector);
        console.log(`Total de listings encontrados: ${listings.length}`);
        // Log para imprimir apenas o roomId e o price para cada listing
        console.log('Detalhes dos listings (roomId, preço):');
        listings.forEach(listing => {
            console.log(`  Room ID: ${listing.roomId}, Preço: R$ ${listing.price}`);
        });
        return listings;
    } catch (error) {
        console.error('Ocorreu um erro geral durante o scraping:', error);
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log('Navegador fechado.');
        }
        // Registra o tempo de fim do processamento e calcula a duração
        const endTime = new Date();
        const processingTime = endTime.getTime() - startTime.getTime();
        console.log(`Fim do processamento: ${endTime.toISOString()}`);
        console.log(`Tempo total de processamento: ${processingTime} ms`);
    }
}

module.exports = { getAirbnbListingDetails };
