// utils.js

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
 * @param {string} str The string to parse.
 * @returns {number} The parsed number.
 */
export function parseNumber(str) {
    if (typeof str !== 'string' || !str) return 0;
    // Remove all dots (thousand separators) and replace comma (decimal separator) with a dot.
    const cleanStr = String(str).replace(/\./g, '').replace(/,/g, '.');
    return parseFloat(cleanStr) || 0;
}
