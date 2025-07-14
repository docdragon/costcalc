// quick-calc.js
import { initializeCombobox } from './ui.js';

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
    allAccessoryMaterials = [...(localMaterialsStore['Phụ kiện'] || []), ...(localMaterialsStore['Cạnh'] || [])];

    // Get combobox elements and call their update function
    const qcMaterialWoodCombobox = document.getElementById('qc-material-wood-combobox');
    const qcMaterialWood2Combobox = document.getElementById('qc-material-wood-2-combobox');
    const qcMaterialAccessoriesCombobox = document.getElementById('qc-material-accessories-combobox');

    if (qcMaterialWoodCombobox && qcMaterialWoodCombobox.updateComboboxData) {
        qcMaterialWoodCombobox.updateComboboxData(localMaterialsStore['Ván'] || []);
    }
    if (qcMaterialWood2Combobox && qcMaterialWood2Combobox.updateComboboxData) {
        qcMaterialWood2Combobox.updateComboboxData(localMaterialsStore['Ván'] || []);
    }
    if (qcMaterialAccessoriesCombobox && qcMaterialAccessoriesCombobox.updateComboboxData) {
        qcMaterialAccessoriesCombobox.updateComboboxData(allAccessoryMaterials);
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

    // --- DOM Elements ---
    const qcAreaInput = document.getElementById('qc-area');
    const qcMaterialWoodCombobox = document.getElementById('qc-material-wood-combobox');
    const qcSheetCountDisplay = document.getElementById('qc-sheet-count-display');
    
    const qcArea2Input = document.getElementById('qc-area-2');
    const qcMaterialWood2Combobox = document.getElementById('qc-material-wood-2-combobox');
    const qcSheetCount2Display = document.getElementById('qc-sheet-count-display-2');
    
    const qcInstallCostInput = document.getElementById('qc-install-cost');
    const qcProfitMarginInput = document.getElementById('qc-profit-margin');

    const qcMaterialAccessoriesCombobox = document.getElementById('qc-material-accessories-combobox');
    const qcAccessoryQtyInput = document.getElementById('qc-accessory-quantity');
    const qcAddAccessoryBtn = document.getElementById('qc-add-accessory-btn');
    const qcAccessoriesList = document.getElementById('qc-accessories-list');

    /**
     * Renders the list of added accessories/edges into the DOM.
     */
    function renderQCAccessories() {
        qcAccessoriesList.innerHTML = '';
        qcAddedAccessories.forEach(acc => {
            const li = document.createElement('li');
            li.dataset.id = acc.id;
            li.innerHTML = `
                <span class="flex-grow">${acc.name}</span>
                <input type="text" inputmode="decimal" value="${acc.quantity}" min="1" class="input-style accessory-list-qty" data-id="${acc.id}">
                <span class="accessory-unit">${acc.unit}</span>
                <button class="remove-acc-btn" data-id="${acc.id}">&times;</button>
            `;
            qcAccessoriesList.appendChild(li);
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
        const area = parseFloat(areaInput.value) || 0;
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
        const woodCost1 = calculateSheetCost(qcAreaInput, qcMaterialWoodCombobox, qcSheetCountDisplay);
        const woodCost2 = calculateSheetCost(qcArea2Input, qcMaterialWood2Combobox, qcSheetCount2Display);
        const totalWoodCost = woodCost1 + woodCost2;
        
        // 2. Calculate dynamic accessory and edge costs
        const totalAccessoryCost = qcAddedAccessories.reduce((sum, acc) => {
            return sum + (acc.price * acc.quantity);
        }, 0);

        // 3. Get other costs
        const installCost = parseFloat(qcInstallCostInput.value) || 0;
        const profitMargin = parseFloat(qcProfitMarginInput.value) || 0;

        // 4. Sum up total cost
        const totalCost = totalWoodCost + totalAccessoryCost + installCost;

        // 5. Calculate final pricing
        const suggestedPrice = totalCost * (1 + profitMargin / 100);
        const estimatedProfit = suggestedPrice - totalCost;

        // 6. Display results
        document.getElementById('qc-total-cost-value').textContent = totalCost.toLocaleString('vi-VN') + 'đ';
        document.getElementById('qc-suggested-price-value').textContent = suggestedPrice.toLocaleString('vi-VN') + 'đ';
        document.getElementById('qc-estimated-profit-value').textContent = estimatedProfit.toLocaleString('vi-VN') + 'đ';
    }

    // --- Event Listeners & Initialization ---

    // Initialize Comboboxes with empty data; they will be populated by updateQuickCalcMaterials
    if (qcMaterialWoodCombobox) {
        initializeCombobox(qcMaterialWoodCombobox, [], () => handleQuickCalculation(), { placeholder: "Tìm hoặc chọn loại ván chính..." });
    }
    if (qcMaterialWood2Combobox) {
        initializeCombobox(qcMaterialWood2Combobox, [], () => handleQuickCalculation(), { placeholder: "Tìm hoặc chọn loại ván phụ...", allowEmpty: true, emptyOptionText: '--- Không sử dụng ván phụ ---' });
    }
    if (qcMaterialAccessoriesCombobox) {
        initializeCombobox(qcMaterialAccessoriesCombobox, [], null, { placeholder: "Tìm phụ kiện hoặc nẹp cạnh..." });
    }
    
    // Call the updater to populate with any initial data that might exist
    updateQuickCalcMaterials(localMaterialsStore);

    // Listeners for standard inputs
    const inputsToTrack = [ qcAreaInput, qcArea2Input, qcInstallCostInput, qcProfitMarginInput ];
    inputsToTrack.forEach(input => {
        if (input) {
            input.addEventListener('input', handleQuickCalculation);
        }
    });

    // Listeners for dynamic accessories and edges
    if (qcAddAccessoryBtn) {
        qcAddAccessoryBtn.addEventListener('click', () => {
            const selectedId = qcMaterialAccessoriesCombobox.querySelector('.combobox-value').value;
            const inputField = qcMaterialAccessoriesCombobox.querySelector('.combobox-input');
            const quantity = parseFloat(qcAccessoryQtyInput.value) || 0;
    
            if (!selectedId || !quantity || quantity <= 0) {
                showToast('Vui lòng chọn vật tư và nhập số lượng/chiều dài hợp lệ.', 'error');
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
            qcAccessoryQtyInput.value = '1';
            inputField.value = '';
            qcMaterialAccessoriesCombobox.querySelector('.combobox-value').value = '';
            inputField.placeholder = "Tìm phụ kiện hoặc nẹp cạnh...";
        });
    }

    if (qcAccessoriesList) {
        qcAccessoriesList.addEventListener('click', e => {
            if (e.target.classList.contains('remove-acc-btn')) {
                const id = e.target.dataset.id;
                qcAddedAccessories = qcAddedAccessories.filter(a => a.id !== id);
                renderQCAccessories();
                handleQuickCalculation();
            }
        });
    
        qcAccessoriesList.addEventListener('change', e => {
            if (e.target.classList.contains('accessory-list-qty')) {
                const id = e.target.dataset.id;
                const newQuantity = parseFloat(e.target.value) || 0;
                const accessory = qcAddedAccessories.find(a => a.id === id);
                
                if (accessory && newQuantity > 0) {
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