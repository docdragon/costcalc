// quick-calc.js
import { initializeCombobox, debounce } from './ui.js';
import * as DOM from './dom.js';
import { parseNumber } from './utils.js';

// --- Module-level state and initialization flag ---
let localMaterialsStore = {}; // This will hold the up-to-date materials.
let isQuickCalcInitialized = false;
let qcAddedAccessories = [];
let allAccessoryMaterials = []; // Combined list of accessories and edges

// Standard sheet area as a fallback, in m^2
const STANDARD_SHEET_AREA = 1.22 * 2.44;

/**
 * Parses sheet dimensions from material notes (e.g., "Khổ 1220x2440mm").
 * @param {object} material The material object.
 * @returns {number} The area of the sheet in square meters.
 */
function parseSheetDimensions(material) {
    if (!material || !material.notes) return STANDARD_SHEET_AREA;
    // Regex to find dimensions like 1220x2440 or 1220 x 2440
    const match = material.notes.match(/(\d+)\s*x\s*(\d+)/);
    if (match && match[1] && match[2]) {
        const widthMM = parseInt(match[1], 10);
        const heightMM = parseInt(match[2], 10);
        // Convert from mm^2 to m^2
        return (widthMM * heightMM) / 1000000;
    }
    return STANDARD_SHEET_AREA;
}

/**
 * Updates the data sources for the comboboxes and the internal material store.
 * @param {object} newLocalMaterials The application's material data store.
 */
export function updateQuickCalcMaterials(newLocalMaterials) {
    localMaterialsStore = newLocalMaterials; // Update the module's store.

    if (!isQuickCalcInitialized) return;

    // Update the combined list for the accessory adder
    allAccessoryMaterials = [...(localMaterialsStore['Phụ kiện'] || []), ...(localMaterialsStore['Cạnh'] || []), ...(localMaterialsStore['Gia Công'] || [])];

    // Get combobox elements and call their update function
    if (DOM.qcMaterialWoodCombobox && DOM.qcMaterialWoodCombobox.updateComboboxData) {
        DOM.qcMaterialWoodCombobox.updateComboboxData(localMaterialsStore['Ván'] || []);
    }
    if (DOM.qcMaterialWood2Combobox && DOM.qcMaterialWood2Combobox.updateComboboxData) {
        DOM.qcMaterialWood2Combobox.updateComboboxData(localMaterialsStore['Ván'] || []);
    }
    if (DOM.qcMaterialAccessoriesCombobox && DOM.qcMaterialAccessoriesCombobox.updateComboboxData) {
        DOM.qcMaterialAccessoriesCombobox.updateComboboxData(allAccessoryMaterials);
    }
}


/**
 * Initializes the functionality for the Quick Calculator tab.
 * This should only be called once on DOMContentLoaded.
 * @param {object} initialLocalMaterials - A reference to the application's local materials store.
 * @param {function} showToast - A function to display toast notifications.
 */
export function initializeQuickCalc(initialLocalMaterials, showToast) {
    if (isQuickCalcInitialized) return;
    isQuickCalcInitialized = true;

    localMaterialsStore = initialLocalMaterials; // Set initial state

    /**
     * Renders the list of added accessories/edges into the DOM.
     */
    function renderQCAccessories() {
        DOM.qcAccessoriesList.innerHTML = '';
        qcAddedAccessories.forEach(acc => {
            const li = document.createElement('li');
            li.dataset.id = acc.id;
            li.innerHTML = `
                <span class="flex-grow">${acc.name}</span>
                <input type="text" inputmode="decimal" value="${acc.quantity}" min="0" class="input-style accessory-list-qty" data-id="${acc.id}">
                <span class="accessory-unit">${acc.unit}</span>
                <button class="remove-acc-btn" data-id="${acc.id}">&times;</button>
            `;
            DOM.qcAccessoriesList.appendChild(li);
        });
    }

    /**
     * Calculates the number of sheets and total cost for a given material input group.
     * @param {HTMLInputElement} areaInput - The input element for area.
     * @param {HTMLElement} woodCombobox - The container element for the combobox.
     * @param {HTMLElement} displayEl - The element to show the estimated sheet count.
     * @returns {number} The calculated cost for this wood type.
     */
    function calculateSheetCost(areaInput, woodCombobox, displayEl) {
        const area = parseNumber(areaInput.value) || 0;
        const woodId = woodCombobox.querySelector('.combobox-value').value;
        let cost = 0;
        const woodMaterials = localMaterialsStore['Ván'] || []; // Use the module's store

        if (area > 0 && woodId) {
            const woodMaterial = woodMaterials.find(m => m.id === woodId);
            if (woodMaterial) {
                const sheetArea = parseSheetDimensions(woodMaterial);
                const numSheets = Math.ceil(area / sheetArea);
                cost = numSheets * (woodMaterial.price || 0);
                displayEl.textContent = `(Ước tính: ${numSheets} tấm)`;
            } else {
                 displayEl.textContent = '';
            }
        } else {
            displayEl.textContent = '';
        }
        return cost;
    }

    /**
     * Performs the main calculation for the Quick Calc tab and updates the UI.
     */
    function handleQuickCalculation() {
        // 1. Calculate Wood costs
        const woodCost1 = calculateSheetCost(DOM.qcAreaInput, DOM.qcMaterialWoodCombobox, DOM.qcSheetCountDisplay);
        const woodCost2 = calculateSheetCost(DOM.qcArea2Input, DOM.qcMaterialWood2Combobox, DOM.qcSheetCount2Display);
        const totalWoodCost = woodCost1 + woodCost2;
        
        // 2. Calculate dynamic accessory and edge costs
        const totalAccessoryCost = qcAddedAccessories.reduce((sum, acc) => {
            return sum + (acc.price * acc.quantity);
        }, 0);

        // 3. Get other costs
        const installCost = parseNumber(DOM.qcInstallCostInput.value) || 0;
        const profitMargin = parseNumber(DOM.qcProfitMarginInput.value) || 0;

        // 4. Sum up total cost
        const totalCost = totalWoodCost + totalAccessoryCost + installCost;

        // 5. Calculate final pricing
        const suggestedPrice = totalCost * (1 + profitMargin / 100);
        const estimatedProfit = suggestedPrice - totalCost;

        // 6. Display results
        DOM.qcTotalCostValue.textContent = Math.round(totalCost).toLocaleString('vi-VN') + 'đ';
        DOM.qcSuggestedPriceValue.textContent = Math.round(suggestedPrice).toLocaleString('vi-VN') + 'đ';
        DOM.qcEstimatedProfitValue.textContent = Math.round(estimatedProfit).toLocaleString('vi-VN') + 'đ';
    }

    // --- Event Listeners & Initialization ---

    // Initialize Comboboxes with empty data; they will be populated by updateQuickCalcMaterials
    if (DOM.qcMaterialWoodCombobox) {
        initializeCombobox(DOM.qcMaterialWoodCombobox, [], () => handleQuickCalculation(), { placeholder: "Tìm hoặc chọn loại ván chính..." });
    }
    if (DOM.qcMaterialWood2Combobox) {
        initializeCombobox(DOM.qcMaterialWood2Combobox, [], () => handleQuickCalculation(), { placeholder: "Tìm hoặc chọn loại ván phụ...", allowEmpty: true, emptyOptionText: '--- Không sử dụng ván phụ ---' });
    }
    if (DOM.qcMaterialAccessoriesCombobox) {
        initializeCombobox(DOM.qcMaterialAccessoriesCombobox, [], null, { placeholder: "Tìm phụ kiện, nẹp hoặc gia công..." });
    }
    
    // Call the updater to populate with any initial data that might exist
    updateQuickCalcMaterials(localMaterialsStore);
    
    const debouncedCalculation = debounce(handleQuickCalculation, 300);

    // Listeners for standard inputs
    const inputsToTrack = [ DOM.qcAreaInput, DOM.qcArea2Input, DOM.qcInstallCostInput, DOM.qcProfitMarginInput ];
    inputsToTrack.forEach(input => {
        if (input) {
            input.addEventListener('input', debouncedCalculation);
        }
    });

    // Listeners for dynamic accessories and edges
    if (DOM.qcAddAccessoryBtn) {
        DOM.qcAddAccessoryBtn.addEventListener('click', () => {
            const selectedId = DOM.qcMaterialAccessoriesCombobox.querySelector('.combobox-value').value;
            const inputField = DOM.qcMaterialAccessoriesCombobox.querySelector('.combobox-input');
            const quantity = parseNumber(DOM.qcAccessoryQtyInput.value) || 0;
    
            if (!selectedId) {
                showToast('Vui lòng chọn một vật tư từ danh sách.', 'error');
                return;
            }
            if (quantity <= 0) {
                 showToast('Vui lòng nhập số lượng/chiều dài lớn hơn 0.', 'error');
                return;
            }


            const itemToAdd = allAccessoryMaterials.find(a => a.id === selectedId);
            if (!itemToAdd) return;
    
            const existing = qcAddedAccessories.find(a => a.id === selectedId);
    
            if (existing) {
                existing.quantity += quantity;
            } else {
                qcAddedAccessories.push({ ...itemToAdd, quantity });
            }
            
            renderQCAccessories();
            handleQuickCalculation();
            
            // Clear combobox and quantity input
            DOM.qcAccessoryQtyInput.value = '1';
            inputField.value = '';
            DOM.qcMaterialAccessoriesCombobox.querySelector('.combobox-value').value = '';
            inputField.placeholder = "Tìm phụ kiện, nẹp hoặc gia công...";
        });
    }

    if (DOM.qcAccessoriesList) {
        DOM.qcAccessoriesList.addEventListener('click', e => {
            if (e.target.classList.contains('remove-acc-btn')) {
                const id = e.target.dataset.id;
                qcAddedAccessories = qcAddedAccessories.filter(a => a.id !== id);
                renderQCAccessories();
                handleQuickCalculation();
            }
        });
    
        DOM.qcAccessoriesList.addEventListener('change', e => {
            if (e.target.classList.contains('accessory-list-qty')) {
                const id = e.target.dataset.id;
                const newQuantity = parseNumber(e.target.value) || 0;
                const accessory = qcAddedAccessories.find(a => a.id === id);
                
                if (accessory && newQuantity >= 0) {
                    accessory.quantity = newQuantity;
                    handleQuickCalculation();
                } else if (accessory) {
                    e.target.value = accessory.quantity; 
                }
            }
        });
    }

    // Run initial calculation to show 0s
    handleQuickCalculation();
}