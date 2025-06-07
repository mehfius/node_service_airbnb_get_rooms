const puppeteer = require('puppeteer');
const { searchParams } = require('./src/config');
const { getAirbnbListingDetails } = require('./src/scraper');

getAirbnbListingDetails(searchParams);