// shared/utils/currency.js
// Centralized currency configuration for both admin and tenant apps.
// Controlled via environment variable CURRENCY_CODE (e.g., 'USD' or 'INR').

const code = (process.env.CURRENCY_CODE || 'USD').toUpperCase();

const SYMBOL_MAP = {
    USD: '$',
    INR: '₹'
};

const symbol = SYMBOL_MAP[code] || '$';

module.exports = {
    code,
    symbol
};
