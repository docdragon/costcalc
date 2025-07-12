// quick-calc.js

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
 * Initializes the functionality for the Quick Calculator tab.
 * @param {object} localMaterials - A reference to the application's local materials store.
 * @param {function} showToast - A function to display toast notifications.
 */
export function initializeQuickCalc(localMaterials, showToast) {
    // --- State ---
    let qcAddedAccessories = [];

    // --- DOM Elements ---
    const qcAreaInput = document.getElementById('qc-area');
    const qcMaterialWoodSelect = document.getElementById('qc-material-wood');
    const qcSheetCountDisplay = document.getElementById('qc-sheet-count-display');
    const qcArea2Input = document.getElementById('qc-area-2');
    const qcMaterialWood2Select = document.getElementById('qc-material-wood-2');
    const qcSheetCount2Display = document.getElementById('qc-sheet-count-display-2');
    const qcEdgeLengthInput = document.getElementById('qc-edge-length');
    const qcMaterialEdgeSelect = document.getElementById('qc-material-edge');
    const qcInstallCostInput = document.getElementById('qc-install-cost');
    const qcProfitMarginInput = document.getElementById('qc-profit-margin');

    // New dynamic accessory elements
    const qcAccessorySelect = document.getElementById('qc-material-accessories');
    const qcAccessoryQtyInput = document.getElementById('qc-accessory-quantity');
    const qcAddAccessoryBtn = document.getElementById('qc-add-accessory-btn');
    const qcAccessoriesList = document.getElementById('qc-accessories-list');

    /**
     * Renders the list of added accessories into the DOM.
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
     * @param {HTMLSelectElement} woodSelect - The select element for the material.
     * @param {HTMLElement} displayEl - The element to show the estimated sheet count.
     * @returns {number} The calculated cost for this wood type.
     */
    function calculateSheetCost(areaInput, woodSelect, displayEl) {
        const area = parseFloat(areaInput.value) || 0;
        const woodId = woodSelect.value;
        let cost = 0;

        if (area > 0 && woodId) {
            const woodMaterial = localMaterials['Ván'].find(m => m.id === woodId);
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
        // 1. Calculate Wood & Edge costs
        const woodCost1 = calculateSheetCost(qcAreaInput, qcMaterialWoodSelect, qcSheetCountDisplay);
        const woodCost2 = calculateSheetCost(qcArea2Input, qcMaterialWood2Select, qcSheetCount2Display);
        const totalWoodCost = woodCost1 + woodCost2;
        
        const edgeLength = parseFloat(qcEdgeLengthInput.value) || 0;
        const edgeId = qcMaterialEdgeSelect.value;
        const edgeMaterial = localMaterials['Cạnh'].find(m => m.id === edgeId);
        const edgeCost = (edgeLength * (edgeMaterial?.price || 0)) || 0;

        // 2. Calculate dynamic accessory costs
        const totalAccessoryCost = qcAddedAccessories.reduce((sum, acc) => {
            return sum + (acc.price * acc.quantity);
        }, 0);

        // 3. Get other costs
        const installCost = parseFloat(qcInstallCostInput.value) || 0;
        const profitMargin = parseFloat(qcProfitMarginInput.value) || 0;

        // 4. Sum up total cost
        const totalCost = totalWoodCost + edgeCost + totalAccessoryCost + installCost;

        // 5. Calculate final pricing
        const suggestedPrice = totalCost * (1 + profitMargin / 100);
        const estimatedProfit = suggestedPrice - totalCost;

        // 6. Display results
        document.getElementById('qc-total-cost-value').textContent = totalCost.toLocaleString('vi-VN') + 'đ';
        document.getElementById('qc-suggested-price-value').textContent = suggestedPrice.toLocaleString('vi-VN') + 'đ';
        document.getElementById('qc-estimated-profit-value').textContent = estimatedProfit.toLocaleString('vi-VN') + 'đ';
    }

    // --- Event Listeners ---

    // Listeners for standard inputs
    const inputsToTrack = [
        qcAreaInput, qcMaterialWoodSelect, qcArea2Input, qcMaterialWood2Select,
        qcEdgeLengthInput, qcMaterialEdgeSelect, qcInstallCostInput, qcProfitMarginInput
    ];
    inputsToTrack.forEach(input => {
        if (input) {
            input.addEventListener('input', handleQuickCalculation);
        }
    });

    // Listeners for dynamic accessories
    if (qcAddAccessoryBtn) {
        qcAddAccessoryBtn.addEventListener('click', () => {
            const selectedId = qcAccessorySelect.value;
            const quantity = parseInt(qcAccessoryQtyInput.value, 10);
    
            if (!selectedId || !quantity || quantity <= 0) {
                showToast('Vui lòng chọn phụ kiện và nhập số lượng.', 'error');
                return;
            }
            const accessory = localMaterials['Phụ kiện'].find(a => a.id === selectedId);
            if (!accessory) return;
    
            const existing = qcAddedAccessories.find(a => a.id === selectedId);
    
            if (existing) {
                existing.quantity += quantity;
            } else {
                qcAddedAccessories.push({ ...accessory, quantity });
            }
            
            renderQCAccessories();
            handleQuickCalculation(); // Recalculate
            qcAccessoryQtyInput.value = '1';
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
                const newQuantity = parseInt(e.target.value, 10);
                const accessory = qcAddedAccessories.find(a => a.id === id);
                
                if (accessory && newQuantity > 0) {
                    accessory.quantity = newQuantity;
                    handleQuickCalculation();
                } else if (accessory) {
                    // Revert to old value if input is invalid (e.g., 0 or non-number)
                    e.target.value = accessory.quantity; 
                }
            }
        });
    }

    // Run initial calculation to show 0s
    handleQuickCalculation();
}