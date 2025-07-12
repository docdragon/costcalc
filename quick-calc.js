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
    // --- DOM Elements ---
    const qcAreaInput = document.getElementById('qc-area');
    const qcMaterialWoodSelect = document.getElementById('qc-material-wood');
    const qcSheetCountDisplay = document.getElementById('qc-sheet-count-display');
    const qcArea2Input = document.getElementById('qc-area-2');
    const qcMaterialWood2Select = document.getElementById('qc-material-wood-2');
    const qcSheetCount2Display = document.getElementById('qc-sheet-count-display-2');
    const qcEdgeLengthInput = document.getElementById('qc-edge-length');
    const qcMaterialEdgeSelect = document.getElementById('qc-material-edge');
    const qcHingeSelect = document.getElementById('qc-accessory-hinge');
    const qcHingeQtyInput = document.getElementById('qc-hinge-qty');
    const qcSlideSelect = document.getElementById('qc-accessory-slide');
    const qcSlideQtyInput = document.getElementById('qc-slide-qty');
    const qcCamSelect = document.getElementById('qc-accessory-cam');
    const qcCamQtyInput = document.getElementById('qc-cam-qty');
    const qcHandleSelect = document.getElementById('qc-accessory-handle');
    const qcHandleQtyInput = document.getElementById('qc-handle-qty');
    const qcInstallCostInput = document.getElementById('qc-install-cost');
    const qcProfitMarginInput = document.getElementById('qc-profit-margin');

    /**
     * Calculates the number of sheets and total cost for a given material input group.
     * @param {HTMLInputElement} areaInput - The input element for area.
     * @param {HTMLSelectElement} woodSelect - The select element for the material.
     * @param {HTMLElement} displayEl - The element to show the estimated sheet count.
     * @returns {{numSheets: number, cost: number}}
     */
    function calculateSheetData(areaInput, woodSelect, displayEl) {
        const area = parseFloat(areaInput.value) || 0;
        const woodId = woodSelect.value;
        let numSheets = 0;
        let cost = 0;

        if (area > 0 && woodId) {
            const woodMaterial = localMaterials['Ván'].find(m => m.id === woodId);
            if (woodMaterial) {
                const sheetArea = parseSheetDimensions(woodMaterial);
                numSheets = Math.ceil(area / sheetArea);
                cost = numSheets * (woodMaterial.price || 0);
                displayEl.textContent = `(Ước tính: ${numSheets} tấm)`;
            } else {
                 displayEl.textContent = '';
            }
        } else {
            displayEl.textContent = '';
        }
        return { numSheets, cost };
    }


    /**
     * Performs the main calculation for the Quick Calc tab.
     */
    function handleQuickCalculation() {
        // Calculate wood costs for both material types
        const woodData1 = calculateSheetData(qcAreaInput, qcMaterialWoodSelect, qcSheetCountDisplay);
        const woodData2 = calculateSheetData(qcArea2Input, qcMaterialWood2Select, qcSheetCount2Display);

        // Get all raw values
        const edgeLength = parseFloat(qcEdgeLengthInput.value) || 0;
        const edgeId = qcMaterialEdgeSelect.value;
        const hingeId = qcHingeSelect.value;
        const hingeQty = parseInt(qcHingeQtyInput.value) || 0;
        const slideId = qcSlideSelect.value;
        const slideQty = parseInt(qcSlideQtyInput.value) || 0;
        const camId = qcCamSelect.value;
        const camQty = parseInt(qcCamQtyInput.value) || 0;
        const handleId = qcHandleSelect.value;
        const handleQty = parseInt(qcHandleQtyInput.value) || 0;
        const installCost = parseFloat(qcInstallCostInput.value) || 0;
        const profitMargin = parseFloat(qcProfitMarginInput.value) || 0;

        // Find materials from local store
        const edgeMaterial = localMaterials['Cạnh'].find(m => m.id === edgeId);
        const hingeMaterial = localMaterials['Phụ kiện'].find(m => m.id === hingeId);
        const slideMaterial = localMaterials['Phụ kiện'].find(m => m.id === slideId);
        const camMaterial = localMaterials['Phụ kiện'].find(m => m.id === camId);
        const handleMaterial = localMaterials['Phụ kiện'].find(m => m.id === handleId);
        
        // Calculate individual costs, ensuring they are numbers
        const woodCost = woodData1.cost + woodData2.cost;
        const edgeCost = (edgeLength * (edgeMaterial?.price || 0)) || 0;
        const hingeCost = (hingeQty * (hingeMaterial?.price || 0)) || 0;
        const slideCost = (slideQty * (slideMaterial?.price || 0)) || 0;
        const camCost = (camQty * (camMaterial?.price || 0)) || 0;
        const handleCost = (handleQty * (handleMaterial?.price || 0)) || 0;


        // Sum up costs clearly
        const totalMaterialCost = woodCost + edgeCost;
        const totalAccessoryCost = hingeCost + slideCost + camCost + handleCost;
        const totalCost = totalMaterialCost + totalAccessoryCost + installCost;

        // Calculate final pricing
        const suggestedPrice = totalCost * (1 + profitMargin / 100);
        const estimatedProfit = suggestedPrice - totalCost;

        // Display results
        document.getElementById('qc-total-cost-value').textContent = totalCost.toLocaleString('vi-VN') + 'đ';
        document.getElementById('qc-suggested-price-value').textContent = suggestedPrice.toLocaleString('vi-VN') + 'đ';
        document.getElementById('qc-estimated-profit-value').textContent = estimatedProfit.toLocaleString('vi-VN') + 'đ';
    }

    // --- Event Listeners for Auto-Calculation ---
    const inputsToTrack = [
        qcAreaInput, qcMaterialWoodSelect, qcArea2Input, qcMaterialWood2Select,
        qcEdgeLengthInput, qcMaterialEdgeSelect,
        qcHingeSelect, qcHingeQtyInput, qcSlideSelect, qcSlideQtyInput,
        qcCamSelect, qcCamQtyInput, qcHandleSelect, qcHandleQtyInput, 
        qcInstallCostInput, qcProfitMarginInput
    ];

    inputsToTrack.forEach(input => {
        if (input) {
            // 'input' event works for text fields and 'change' for selects. 'input' also covers changes for selects.
            input.addEventListener('input', handleQuickCalculation);
        }
    });

    // Run initial calculation to show 0s
    handleQuickCalculation();
}