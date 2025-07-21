// quick-calc.js
import { initializeCombobox, debounce, createAccessoryManager } from './ui.js';
import * as DOM from './dom.js';
import { parseNumber, getSheetArea } from './utils.js';

// --- Module-level state and initialization flag ---
let localMaterialsStore = {}; // This will hold the up-to-date materials.
let isQuickCalcInitialized = false;
let qcAddedAccessories = [];
let allAccessoryMaterials = []; // Combined list of accessories and edges
let qcAccessoryManager;

/**
 * Updates the data sources for the comboboxes and the internal material store.
 * @param {object} newLocalMaterials The application's material data store.
 */
export function updateQuickCalcMaterials(newLocalMaterials) {
    localMaterialsStore = newLocalMaterials; // Update the module's store.

    if (!isQuickCalcInitialized) return;

    // Update the combined list for the accessory adder
    allAccessoryMaterials = [...(localMaterialsStore['Phụ kiện'] || []), ...(localMaterialsStore['Cạnh'] || []), ...(localMaterialsStore['Gia Công'] || [])];
    if (qcAccessoryManager) {
        qcAccessoryManager.updateMaterials(allAccessoryMaterials);
    }


    // Get combobox elements and call their update function
    if (DOM.qcMaterialWoodCombobox && DOM.qcMaterialWoodCombobox.updateComboboxData) {
        DOM.qcMaterialWoodCombobox.updateComboboxData(localMaterialsStore['Ván'] || []);
    }
    if (DOM.qcMaterialWood2Combobox && DOM.qcMaterialWood2Combobox.updateComboboxData) {
        DOM.qcMaterialWood2Combobox.updateComboboxData(localMaterialsStore['Ván'] || []);
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
                const sheetArea = getSheetArea(woodMaterial);
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
    const debouncedCalculation = debounce(handleQuickCalculation, 300);

    // Initialize Comboboxes with empty data; they will be populated by updateQuickCalcMaterials
    if (DOM.qcMaterialWoodCombobox) {
        initializeCombobox(DOM.qcMaterialWoodCombobox, [], debouncedCalculation, { placeholder: "Tìm hoặc chọn loại ván chính..." });
    }
    if (DOM.qcMaterialWood2Combobox) {
        initializeCombobox(DOM.qcMaterialWood2Combobox, [], debouncedCalculation, { placeholder: "Tìm hoặc chọn loại ván phụ...", allowEmpty: true, emptyOptionText: '--- Không sử dụng ván phụ ---' });
    }
    
    // Call the updater to populate with any initial data that might exist
    updateQuickCalcMaterials(localMaterialsStore);

    // Listeners for standard inputs
    const inputsToTrack = [ DOM.qcAreaInput, DOM.qcArea2Input, DOM.qcInstallCostInput, DOM.qcProfitMarginInput ];
    inputsToTrack.forEach(input => {
        if (input) {
            input.addEventListener('input', debouncedCalculation);
        }
    });

    qcAccessoryManager = createAccessoryManager({
        listEl: DOM.qcAccessoriesList,
        addBtn: DOM.qcAddAccessoryBtn,
        quantityInput: DOM.qcAccessoryQtyInput,
        materialCombobox: DOM.qcMaterialAccessoriesCombobox,
        onUpdate: (newAccessories) => {
            qcAddedAccessories = newAccessories;
            debouncedCalculation();
        },
        showToast,
        comboboxPlaceholder: 'Tìm phụ kiện, nẹp hoặc gia công...'
    });

    // Run initial calculation to show 0s
    handleQuickCalculation();
}