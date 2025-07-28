// utils.js

/**
 * Creates an HTML element.
 * @param {string} tag The HTML tag name.
 * @param {object} [props={}] Properties to set on the element. Special keys: `dataset`, `on...` for event listeners.
 * @param {...(Node|string|number)} children Child elements to append.
 * @returns {HTMLElement} The created element.
 */
export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
        if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (key === 'dataset') {
            Object.assign(el.dataset, value);
        } else if (key in el) {
            try {
                el[key] = value;
            } catch (e) {
                el.setAttribute(key, value);
            }
        } else {
             el.setAttribute(key, value);
        }
    });
    children.flat().forEach(child => {
        if (child instanceof Node) {
            el.appendChild(child);
        } else if (child !== null && child !== undefined) {
            el.appendChild(document.createTextNode(String(child)));
        }
    });
    return el;
}


/**
 * Formats a Date object into a locale-string for display.
 * @param {Date} date The date to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) {
    if (!(date instanceof Date)) return '';
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

/**
 * Parses sheet dimensions from material notes (e.g., "Khổ 1220x2440mm")
 * and returns the area in square meters.
 * @param {object} material The material object.
 * @returns {number} The area of the sheet in square meters.
 */
export function getSheetArea(material) {
    const STANDARD_SHEET_AREA_M2 = 1.22 * 2.44;
    if (!material || !material.notes) return STANDARD_SHEET_AREA_M2;
    const match = material.notes.match(/(\d+)\s*x\s*(\d+)/);
    if (match && match[1] && match[2]) {
        return (parseInt(match[1], 10) * parseInt(match[2], 10)) / 1000000;
    }
    return STANDARD_SHEET_AREA_M2;
}

/**
 * Parses board thickness from material name or notes (e.g., "17mm", "17ly").
 * @param {object} material The material object.
 * @returns {number} The thickness of the board in millimeters.
 */
export function getBoardThickness(material) {
    const DEFAULT_THICKNESS = 17;
    if (!material) return DEFAULT_THICKNESS;
    const combinedText = `${material.name} ${material.notes || ''}`;
    const match = combinedText.match(/(\d+)\s*(mm|ly|li)/i);
    return match && match[1] ? parseInt(match[1], 10) : DEFAULT_THICKNESS;
}

/**
 * Parses a number string that may use Vietnamese formatting (dots for thousands, comma for decimal).
 * Returns NaN for invalid strings.
 * @param {string} str The string to parse.
 * @returns {number} The parsed number or NaN.
 */
export function parseNumber(str) {
    if (typeof str !== 'string' || !str) return NaN;
    // Remove all dots (thousand separators) and replace comma (decimal separator) with a dot.
    const cleanStr = String(str).replace(/\./g, '').replace(/,/g, '.');
    return parseFloat(cleanStr);
}

/**
 * Extracts a Google Docs ID from a URL and returns an embeddable preview URL.
 * @param {string} url The Google Docs URL.
 * @returns {string|null} The embeddable URL or null if invalid.
 */
export function getGDocsEmbedUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/document\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
        return `https://docs.google.com/document/d/${match[1]}/preview`;
    }
    return null;
}

/**
 * Formats a date from 'YYYY-MM-DD' input to 'DD/MM/YYYY' display.
 * @param {string} inputDate The date string from a date input (YYYY-MM-DD).
 * @returns {string} The formatted date string (DD/MM/YYYY).
 */
export function formatInputDateToDisplay(inputDate) {
    if (!inputDate || typeof inputDate !== 'string') return '';
    const parts = inputDate.split('-');
    if (parts.length !== 3) return inputDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}