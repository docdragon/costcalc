// calculator.js
import * as DOM from './dom.js';
import { showToast, initializeCombobox, debounce } from './ui.js';
import { getSheetArea, getBoardThickness } from './utils.js';

// --- Module-level state ---
let localComponentNames = [];
let localProductTypes = [];
let localComponentGroups = [];
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
let allLocalMaterials = [];
let currentUserId = null;

let lastGeminiResult = null;
let addedAccessories = [];
let productComponents = [];
let uploadedImage = null;
let aiCalculationState = 'idle'; // idle, calculating, done


// --- Data Updaters ---
export function updateCalculatorData(data) {
    if (data.componentNames) localComponentNames = data.componentNames;
    if (data.productTypes) localProductTypes = data.productTypes;
    if (data.componentGroups) localComponentGroups = data.componentGroups;
    if (data.materials) localMaterials = data.materials;
    if (data.allMaterials) allLocalMaterials = data.allMaterials;
    if (data.userId) currentUserId = data.userId;
}

export function setUploadedImage(image) {
    uploadedImage = image;
}

// --- Formula Evaluation ---
function evaluateFormula(formula, context) {
    if (!formula || typeof formula !== 'string') return 0;
    
    const allowedChars = /^[LWHt\d\s.\+\-\*\/\(\)]+$/;
    if (!allowedChars.test(formula)) {
        console.warn(`Invalid characters in formula: "${formula}"`);
        return 0;
    }

    const { L, W, H, t } = context;
    try {
        const func = new Function('L', 'W', 'H', 't', `return ${formula}`);
        const result = func(L, W, H, t);
        return typeof result === 'number' && isFinite(result) ? result : 0;
    } catch (e) {
        console.error(`Error evaluating formula "${formula}":`, e);
        return 0;
    }
}


// --- Component & Calculation Logic ---
const runFullCalculation = debounce(calculateAndDisplayFinalPrice, 400);

function updateComponentCalculationsAndRender() {
    const L = parseFloat(DOM.itemLengthInput.value) || 0;
    const W = parseFloat(DOM.itemWidthInput.value) || 0;
    const H = parseFloat(DOM.itemHeightInput.value) || 0;
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const mainWoodMaterial = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const t = getBoardThickness(mainWoodMaterial);

    if (L > 0 || W > 0 || H > 0) {
        productComponents.forEach(comp => {
            if (!comp.isDefault) return;

            const componentNameData = localComponentNames.find(cn => cn.id === comp.componentNameId);
            if (componentNameData) {
                const context = { L, W, H, t };
                if (componentNameData.lengthFormula) {
                    comp.length = Math.round(evaluateFormula(componentNameData.lengthFormula, context));
                }
                if (componentNameData.widthFormula) {
                     comp.width = Math.round(evaluateFormula(componentNameData.widthFormula, context));
                }
            }
        });
    }

    renderProductComponents();
    runFullCalculation();
}

function loadComponentsByProductType(productTypeId) {
    const productType = localProductTypes.find(pt => pt.id === productTypeId);
    productComponents = [];
    if (productType && productType.components) {
        productType.components.forEach(compTemplate => {
            const componentNameData = localComponentNames.find(cn => cn.id === compTemplate.componentNameId);
            if (componentNameData) {
                productComponents.push({
                    id: `comp_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
                    name: componentNameData.name,
                    length: 0,
                    width: 0,
                    qty: compTemplate.qty,
                    componentNameId: compTemplate.componentNameId,
                    isDefault: true,
                    materialId: null, // Default to main material
                });
            }
        });
    }
    updateComponentCalculationsAndRender();
}

function renderProductComponents() {
    const rows = DOM.componentsTableBody.children;
    const needsFullReRender = rows.length !== productComponents.length || (rows.length === 0 && productComponents.length > 0);

    if (needsFullReRender) {
        DOM.componentsTableBody.innerHTML = '';
        if (productComponents.length === 0) {
            DOM.componentsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem; color: var(--text-light);">Chọn "Loại sản phẩm" hoặc thêm chi tiết tùy chỉnh.</td></tr>';
            return;
        }

        productComponents.forEach(comp => {
            const tr = document.createElement('tr');
            tr.dataset.id = comp.id;
            tr.innerHTML = `
                <td data-label="Tên Chi tiết">
                    <div id="comp-name-combobox-${comp.id}" class="combobox-container component-combobox">
                        <input type="text" class="input-style combobox-input component-input" data-field="name" placeholder="Chọn hoặc nhập..." value="${comp.name}">
                        <input type="hidden" class="combobox-value">
                        <div class="combobox-options-wrapper"><ul class="combobox-options"></ul></div>
                    </div>
                </td>
                <td data-label="Vật liệu">
                    <div id="comp-material-combobox-${comp.id}" class="combobox-container component-combobox">
                        <input type="text" class="input-style combobox-input" placeholder="Dùng ván chính...">
                        <input type="hidden" class="combobox-value">
                        <div class="combobox-options-wrapper"><ul class="combobox-options"></ul></div>
                    </div>
                </td>
                <td data-label="Dài"><input type="text" inputmode="decimal" class="input-style component-input" data-field="length" value="${comp.length}"></td>
                <td data-label="Rộng"><input type="text" inputmode="decimal" class="input-style component-input" data-field="width" value="${comp.width}"></td>
                <td data-label="SL"><input type="text" inputmode="decimal" class="input-style component-input" data-field="qty" value="${comp.qty}" style="max-width: 60px; text-align: center;"></td>
                <td data-label="Xóa" class="text-center">
                    <button class="remove-component-btn" data-id="${comp.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            DOM.componentsTableBody.appendChild(tr);

            // Initialize Name Combobox
            const nameComboboxContainer = tr.querySelector(`#comp-name-combobox-${comp.id}`);
            if (nameComboboxContainer) {
                initializeCombobox(
                    nameComboboxContainer,
                    localComponentNames.map(c => ({ id: c.id, name: c.name, price: '', unit: '' })),
                    (selectedId) => {
                        const selectedName = localComponentNames.find(c => c.id === selectedId)?.name;
                        const component = productComponents.find(p => p.id === comp.id);
                        if (component && selectedName) {
                            component.name = selectedName;
                            component.componentNameId = selectedId;
                            component.isDefault = true;
                            updateComponentCalculationsAndRender();
                        }
                    },
                    { placeholder: 'Chọn tên...', allowCustom: true }
                );
            }

            // Initialize Material Combobox
            const materialComboboxContainer = tr.querySelector(`#comp-material-combobox-${comp.id}`);
            if (materialComboboxContainer) {
                initializeCombobox(
                    materialComboboxContainer,
                    localMaterials['Ván'],
                    (selectedId) => {
                        const component = productComponents.find(p => p.id === comp.id);
                        if (component) {
                            component.materialId = selectedId || null;
                            runFullCalculation();
                        }
                    },
                    {
                        placeholder: 'Dùng ván chính',
                        allowEmpty: true,
                        emptyOptionText: '--- Dùng ván chính ---'
                    }
                );
                if (comp.materialId && materialComboboxContainer.setValue) {
                    materialComboboxContainer.setValue(comp.materialId);
                }
            }
        });
    } else {
        // Just update values if the structure is the same
        productComponents.forEach((comp, index) => {
            const row = rows[index];
            if (row) {
                const lengthInput = row.querySelector('input[data-field="length"]');
                if (lengthInput) lengthInput.value = comp.length;

                const widthInput = row.querySelector('input[data-field="width"]');
                if (widthInput) widthInput.value = comp.width;
            }
        });
    }
}


// --- Accessory Management ---
function renderAccessories() {
    DOM.accessoriesList.innerHTML = '';
    addedAccessories.forEach(acc => {
        const li = document.createElement('li');
        li.dataset.id = acc.id;
        li.innerHTML = `
            <span class="flex-grow">${acc.name} <span class="tag-type" style="font-size: 0.65rem; padding: 0.1rem 0.4rem; vertical-align: middle;">${acc.type}</span></span>
            <input type="text" inputmode="decimal" value="${acc.quantity}" min="1" class="input-style accessory-list-qty" data-id="${acc.id}">
            <span class="accessory-unit">${acc.unit}</span>
            <button class="remove-acc-btn" data-id="${acc.id}">&times;</button>
        `;
        DOM.accessoriesList.appendChild(li);
    });
}

// --- AI & Price Calculation ---

function getPanelPiecesForAI() {
    const pieces = [];
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const backPanelId = DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value;

    productComponents.forEach(comp => {
        let effectiveMaterialId = comp.materialId;
        if (!effectiveMaterialId) {
            const isBackPanel = comp.name.toLowerCase().includes('hậu');
            if (isBackPanel && backPanelId) {
                effectiveMaterialId = backPanelId;
            } else {
                effectiveMaterialId = mainWoodId;
            }
        }
        
        if (effectiveMaterialId === mainWoodId) {
            for (let i = 0; i < comp.qty; i++) {
                const pieceName = `${comp.name}${comp.qty > 1 ? ` (${i + 1})` : ''}`;
                pieces.push({ name: pieceName, width: comp.length, height: comp.width });
            }
        }
    });
    return pieces.filter(p => p.width > 0 && p.height > 0);
}


function renderCuttingLayout(layoutData, containerEl, summaryEl) {
    if (!layoutData || !layoutData.sheets || layoutData.totalSheetsUsed === 0) {
        summaryEl.innerHTML = `<p>AI không thể tạo sơ đồ cắt ván tối ưu từ thông tin được cung cấp.</p>`;
        containerEl.innerHTML = '';
        return;
    }

    containerEl.innerHTML = '';
    const totalSheets = layoutData.totalSheetsUsed;
    summaryEl.innerHTML = `<p><strong>Kết quả tối ưu:</strong> Cần dùng <strong>${totalSheets}</strong> tấm ván chính (kích thước 1220 x 2440mm) để hoàn thành sản phẩm này.</p>`;

    const STANDARD_WIDTH = 1220;
    const STANDARD_HEIGHT = 2440;

    layoutData.sheets.forEach(sheetData => {
        const wrapper = document.createElement('div');
        wrapper.className = 'cutting-sheet-wrapper';
        const title = document.createElement('h4');
        title.className = 'cutting-sheet-title';
        title.textContent = `Sơ đồ Tấm ván #${sheetData.sheetNumber}`;
        wrapper.appendChild(title);
        const sheetEl = document.createElement('div');
        sheetEl.className = 'cutting-sheet';
        sheetData.pieces.forEach(piece => {
            const pieceEl = document.createElement('div');
            pieceEl.className = 'cutting-piece';
            const w = piece.width, h = piece.height;
            const left = (piece.x / STANDARD_WIDTH) * 100;
            const top = (piece.y / STANDARD_HEIGHT) * 100;
            const pieceWidth = (w / STANDARD_WIDTH) * 100;
            const pieceHeight = (h / STANDARD_HEIGHT) * 100;
            pieceEl.style.left = `${left}%`;
            pieceEl.style.top = `${top}%`;
            pieceEl.style.width = `${pieceWidth}%`;
            pieceEl.style.height = `${pieceHeight}%`;
            const label = document.createElement('div');
            label.className = 'cutting-piece-label';
            if (pieceWidth > 5 && pieceHeight > 5) {
               label.innerHTML = `${piece.name}<br>(${w}x${h})`;
            }
            pieceEl.appendChild(label);
            sheetEl.appendChild(pieceEl);
        });
        wrapper.appendChild(sheetEl);
        containerEl.appendChild(wrapper);
    });
}

function renderCostBreakdown(breakdown, container) {
    if (!breakdown || breakdown.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }
    let breakdownHtml = '<h3 class="result-box-header"><i class="fas fa-file-invoice-dollar"></i> Phân tích Chi phí Vật tư</h3><ul class="cost-list">';
    breakdown.forEach(item => {
        breakdownHtml += `
            <li>
                <span class="cost-item-name">${item.name}</span>
                <span class="cost-item-value">${(item.cost || 0).toLocaleString('vi-VN')}đ</span>
                ${item.reason ? `<p class="cost-item-reason">${item.reason}</p>` : ''}
            </li>
        `;
    });
    breakdownHtml += '</ul>';
    container.innerHTML = breakdownHtml;
    container.classList.remove('hidden');
}


function updateAnalyzeButton() {
    switch(aiCalculationState) {
        case 'idle':
            DOM.analyzeBtn.disabled = false;
            DOM.analyzeBtn.innerHTML = '<i class="fas fa-th-large"></i> Tối ưu Cắt ván với AI';
            break;
        case 'calculating':
            DOM.analyzeBtn.disabled = true;
            DOM.analyzeBtn.innerHTML = `<span class="spinner-sm"></span> Đang tối ưu...`;
            break;
        case 'done':
            DOM.analyzeBtn.disabled = false;
            DOM.analyzeBtn.innerHTML = '<i class="fas fa-redo"></i> Tối ưu lại';
            break;
    }
}

function calculateEdgeBanding() {
    let totalLength = 0;
    productComponents.forEach(comp => {
        const rules = localComponentNames.find(cn => cn.id === comp.componentNameId);
        if (rules) {
            if (rules.edge1) totalLength += comp.length;
            if (rules.edge2) totalLength += comp.length;
            if (rules.edge3) totalLength += comp.width;
            if (rules.edge4) totalLength += comp.width;
        }
    });
    return totalLength;
}

async function runAICuttingOptimization() {
    aiCalculationState = 'calculating';
    updateAnalyzeButton();
    
    DOM.cuttingLayoutSection.classList.remove('hidden');
    DOM.cuttingLayoutLoader.classList.remove('hidden');
    DOM.cuttingLayoutSummary.innerHTML = '';
    DOM.cuttingLayoutContainer.innerHTML = '';
    
    const mainWoodPieces = getPanelPiecesForAI();
    if(mainWoodPieces.length === 0) {
        showToast("Không có chi tiết ván chính để AI phân tích sơ đồ cắt.", "info");
        aiCalculationState = 'idle';
        updateAnalyzeButton();
        DOM.cuttingLayoutSection.classList.add('hidden');
        DOM.cuttingLayoutLoader.classList.add('hidden');
        return;
    }

    const productInfoForAI = {
        name: DOM.itemNameInput.value,
        type: DOM.itemTypeSelect.options[DOM.itemTypeSelect.selectedIndex]?.text,
        length: DOM.itemLengthInput.value,
        width: DOM.itemWidthInput.value,
        height: DOM.itemHeightInput.value,
    };

    const prompt = `
    NHIỆM VỤ: Bạn là một trợ lý AI chuyên nghiệp cho xưởng mộc, chuyên thực hiện tối ưu hóa sơ đồ cắt (nesting) để giảm thiểu lãng phí vật liệu.

    BỐI CẢNH: Người dùng đã cung cấp danh sách các chi tiết (miếng ván) cần cắt từ các tấm ván tiêu chuẩn.

    DỮ LIỆU ĐẦU VÀO:
    - Thông tin sản phẩm: ${JSON.stringify(productInfoForAI)}
    - Danh sách các miếng ván chính cần cắt (JSON): ${JSON.stringify(mainWoodPieces.map(({type, ...rest}) => rest))}

    HƯỚNG DẪN THỰC HIỆN:
    1.  **Thuật toán Sắp xếp (2D Bin Packing):**
        - Kích thước tấm ván tiêu chuẩn để sắp xếp là 1220mm (chiều rộng) x 2440mm (chiều cao).
        - Sắp xếp tất cả các miếng ván được cung cấp vào số lượng tấm ván tiêu chuẩn ít nhất có thể.
        - **RÀNG BUỘC TỐI QUAN TRỌNG: Các miếng ván trên cùng một tấm ván TUYỆT ĐỐI KHÔNG ĐƯỢC CHỒNG CHÉO LÊN NHAU.** Mỗi miếng ván phải nằm gọn trong vùng ranh giới của tấm ván (0,0) đến (1220, 2440).
        - Có thể xoay các miếng ván 90 độ (đảo ngược chiều rộng và chiều cao) nếu việc đó giúp tối ưu hóa không gian.
        - Với mỗi miếng ván đã được đặt, hãy cung cấp tọa độ (x, y) của góc trên cùng bên trái của nó.

    2.  **ĐỊNH DẠNG ĐẦU RA (JSON):**
        - Chỉ trả về một đối tượng JSON duy nhất, tuân thủ nghiêm ngặt schema đã được cung cấp.
        - Đối tượng JSON phải chứa key "cuttingLayout".
        - Không thêm bất kỳ văn bản, giải thích, hay ký tự nào khác bên ngoài đối tượng JSON.
    `;
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Lỗi máy chủ: ${response.status}`);
        }

        lastGeminiResult = data;
        aiCalculationState = 'done';
        
        const { cuttingLayout } = data;
        if (cuttingLayout && cuttingLayout.totalSheetsUsed > 0) {
            renderCuttingLayout(cuttingLayout, DOM.cuttingLayoutContainer, DOM.cuttingLayoutSummary);
        } else {
            DOM.cuttingLayoutSection.classList.add('hidden');
        }
        
        runFullCalculation(); // Recalculate with new optimized sheet count
        DOM.saveItemBtn.disabled = false;

    } catch (error) {
        console.error("Error calling AI:", error);
        showToast(`Lỗi khi tối ưu: ${error.message}`, 'error');
        aiCalculationState = 'idle';
        DOM.cuttingLayoutSection.classList.add('hidden');
    } finally {
        DOM.cuttingLayoutLoader.classList.add('hidden');
        updateAnalyzeButton();
    }
}

function calculateAndDisplayFinalPrice() {
    const costBreakdownItems = [];
    let baseMaterialCost = 0;
    const productQuantity = parseInt(DOM.itemQuantityInput.value) || 1;

    // --- NEW: Calculate wood panel costs based on material groups ---
    const materialUsage = new Map();
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const backPanelId = DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value;
    
    // 1. Group components by their effective material
    productComponents.forEach(comp => {
        if (!comp.name || comp.length <= 0 || comp.width <= 0 || comp.qty <= 0) return;

        let effectiveMaterialId = comp.materialId; // Custom material takes precedence
        if (!effectiveMaterialId) {
            const isBackPanel = comp.name.toLowerCase().includes('hậu');
            if (isBackPanel && backPanelId) {
                effectiveMaterialId = backPanelId; // Use specific back panel material
            } else {
                effectiveMaterialId = mainWoodId; // Default to main material
            }
        }

        if (!effectiveMaterialId) return; // No material assigned, skip

        if (!materialUsage.has(effectiveMaterialId)) {
            const material = localMaterials['Ván'].find(m => m.id === effectiveMaterialId);
            if (material) {
                materialUsage.set(effectiveMaterialId, { material, totalArea: 0 });
            } else {
                return; // Material not found, skip
            }
        }
        
        const usage = materialUsage.get(effectiveMaterialId);
        const componentArea = (comp.length * comp.width * comp.qty) / 1000000; // in m^2
        usage.totalArea += componentArea;
    });

    // 2. Calculate cost for each material group
    materialUsage.forEach((usage, materialId) => {
        const { material, totalArea } = usage;
        let sheetsNeeded = 0;

        // Use AI-optimized sheet count for main material if available
        if (materialId === mainWoodId && lastGeminiResult?.cuttingLayout?.totalSheetsUsed > 0) {
            sheetsNeeded = lastGeminiResult.cuttingLayout.totalSheetsUsed;
        } else {
            const sheetAreaM2 = getSheetArea(material);
            if (sheetAreaM2 > 0) {
                sheetsNeeded = Math.ceil(totalArea / sheetAreaM2);
            }
        }

        if (sheetsNeeded > 0) {
            const cost = sheetsNeeded * material.price;
            baseMaterialCost += cost;
            const reason = (materialId === mainWoodId && lastGeminiResult?.cuttingLayout?.totalSheetsUsed > 0)
                ? `${sheetsNeeded} tấm (tối ưu AI) x ${material.price.toLocaleString('vi-VN')}đ`
                : `${sheetsNeeded} tấm (ước tính từ ${totalArea.toFixed(2)}m²) x ${material.price.toLocaleString('vi-VN')}đ`;
            costBreakdownItems.push({ name: `Ván: ${material.name}`, cost, reason });
        }
    });

    // 3. Edge Banding Cost
    const totalEdgeLengthMM = calculateEdgeBanding();
    const edgeMaterialId = DOM.edgeMaterialCombobox.querySelector('.combobox-value').value;
    const edgeMaterial = localMaterials['Cạnh'].find(m => m.id === edgeMaterialId);

    if (totalEdgeLengthMM > 0 && edgeMaterial) {
        const lengthInMeters = totalEdgeLengthMM / 1000;
        const cost = lengthInMeters * edgeMaterial.price;
        baseMaterialCost += cost;
        costBreakdownItems.push({ name: `Nẹp cạnh: ${edgeMaterial.name}`, cost, reason: `${lengthInMeters.toFixed(2)}m x ${edgeMaterial.price.toLocaleString('vi-VN')}đ/m` });
    }

    // 4. All other accessories
    addedAccessories.forEach(acc => {
        const cost = acc.quantity * acc.price;
        if(cost > 0) {
            baseMaterialCost += cost;
            costBreakdownItems.push({ name: acc.name, cost, reason: `${acc.quantity} ${acc.unit} x ${acc.price.toLocaleString('vi-VN')}đ` });
        }
    });

    const laborCost = parseFloat(DOM.laborCostInput.value) || 0;
    const profitMargin = parseFloat(DOM.profitMarginInput.value) || 0;
    
    const totalCost = baseMaterialCost + laborCost;
    const suggestedPrice = totalCost * (1 + profitMargin / 100);
    const estimatedProfit = suggestedPrice - totalCost;
    
    const finalTotalCost = totalCost * productQuantity;
    const finalSuggestedPrice = suggestedPrice * productQuantity;
    const finalEstimatedProfit = estimatedProfit * productQuantity;
    
    DOM.totalCostValue.textContent = finalTotalCost.toLocaleString('vi-VN') + 'đ';
    DOM.suggestedPriceValue.textContent = finalSuggestedPrice.toLocaleString('vi-VN') + 'đ';
    DOM.estimatedProfitValue.textContent = finalEstimatedProfit.toLocaleString('vi-VN') + 'đ';
    DOM.priceSummaryContainer.classList.remove('hidden');

    renderCostBreakdown(costBreakdownItems, DOM.costBreakdownContainer);
    
    if (totalCost > 0) {
        DOM.resultsSection.classList.remove('hidden');
        DOM.resultsContent.classList.remove('hidden');
        DOM.saveItemBtn.disabled = false;
        if (!lastGeminiResult) lastGeminiResult = {};
        lastGeminiResult.finalPrices = { totalCost, suggestedPrice, estimatedProfit, costBreakdown: costBreakdownItems };
    }
}


// --- Form Management ---

export function clearCalculatorInputs() {
    DOM.itemLengthInput.value = '';
    DOM.itemWidthInput.value = '';
    DOM.itemHeightInput.value = '';
    DOM.itemNameInput.value = '';
    DOM.itemQuantityInput.value = '1';
    DOM.profitMarginInput.value = '50';
    DOM.laborCostInput.value = '0';
    DOM.itemTypeSelect.value = '';
    
    addedAccessories = [];
    renderAccessories();
    
    productComponents = [];
    renderProductComponents();

    lastGeminiResult = null;
    aiCalculationState = 'idle';
    if(DOM.sidebarRemoveImageBtn) DOM.sidebarRemoveImageBtn.click();

    if (DOM.mainMaterialWoodCombobox.setValue) DOM.mainMaterialWoodCombobox.setValue('');
    if (DOM.mainMaterialBackPanelCombobox.setValue) DOM.mainMaterialBackPanelCombobox.setValue('');
    if (DOM.edgeMaterialCombobox.setValue) DOM.edgeMaterialCombobox.setValue('');

    updateAnalyzeButton();
    DOM.resultsSection.classList.add('hidden');
    DOM.cuttingLayoutSection.classList.add('hidden');
    DOM.saveItemBtn.disabled = true;
}

export function loadItemIntoForm(item) {
    clearCalculatorInputs();
    const inputs = item.inputs || {};

    DOM.itemLengthInput.value = inputs.length || '';
    DOM.itemWidthInput.value = inputs.width || '';
    DOM.itemHeightInput.value = inputs.height || '';
    DOM.itemNameInput.value = inputs.name || '';
    DOM.itemQuantityInput.value = inputs.quantity || '1';
    DOM.itemTypeSelect.value = inputs.productTypeId || '';
    DOM.profitMarginInput.value = inputs.profitMargin || '50';
    DOM.laborCostInput.value = inputs.laborCost || '0';

    if (DOM.mainMaterialWoodCombobox.setValue) DOM.mainMaterialWoodCombobox.setValue(inputs.mainWoodId || '');
    if (DOM.mainMaterialBackPanelCombobox.setValue) DOM.mainMaterialBackPanelCombobox.setValue(inputs.backPanelId || '');
    if (DOM.edgeMaterialCombobox.setValue) DOM.edgeMaterialCombobox.setValue(inputs.edgeMaterialId || '');

    if (inputs.uploadedImage) {
        uploadedImage = inputs.uploadedImage;
        const imageSrc = `data:${uploadedImage.mimeType};base64,${uploadedImage.data}`;

        if (DOM.sidebarImagePreview && DOM.sidebarImagePlaceholder) {
            DOM.sidebarImagePreview.src = imageSrc;
            DOM.sidebarImagePreview.classList.remove('hidden');
            DOM.sidebarImagePlaceholder.classList.add('hidden');
            DOM.sidebarRemoveImageBtn.classList.remove('hidden');
        }
    }
    
    addedAccessories = inputs.accessories ? JSON.parse(JSON.stringify(inputs.accessories)) : [];
    renderAccessories();
    
    productComponents = inputs.components ? JSON.parse(JSON.stringify(inputs.components)) : [];
    renderProductComponents();

    lastGeminiResult = { cuttingLayout: item.cuttingLayout, finalPrices: item.finalPrices };

    if(lastGeminiResult) {
        aiCalculationState = lastGeminiResult.cuttingLayout ? 'done' : 'idle';
        updateAnalyzeButton();
        
        DOM.resultsSection.classList.remove('hidden');
        DOM.resultsContent.classList.remove('hidden');
        calculateAndDisplayFinalPrice();
        
        if (lastGeminiResult.cuttingLayout) {
            renderCuttingLayout(lastGeminiResult.cuttingLayout, DOM.cuttingLayoutContainer, DOM.cuttingLayoutSummary);
            DOM.cuttingLayoutSection.classList.remove('hidden');
        } else {
            DOM.cuttingLayoutSection.classList.add('hidden');
        }
    }

    document.querySelector('button[data-tab="calculator"]')?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Đã tải dữ liệu dự án. Bạn có thể chỉnh sửa và tính toán lại.', 'info');
}

export function getCalculatorStateForSave() {
     if (!currentUserId || !lastGeminiResult?.finalPrices) {
        showToast('Không có kết quả phân tích để lưu.', 'error');
        return null;
    }
    
    return {
        inputs: {
            name: DOM.itemNameInput.value,
            quantity: DOM.itemQuantityInput.value,
            length: DOM.itemLengthInput.value,
            width: DOM.itemWidthInput.value,
            height: DOM.itemHeightInput.value,
            productTypeId: DOM.itemTypeSelect.value,
            profitMargin: DOM.profitMarginInput.value,
            laborCost: DOM.laborCostInput.value,
            mainWoodId: DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value,
            backPanelId: DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value,
            edgeMaterialId: DOM.edgeMaterialCombobox.querySelector('.combobox-value').value,
            accessories: addedAccessories,
            components: productComponents,
            uploadedImage: uploadedImage
        },
        cuttingLayout: lastGeminiResult.cuttingLayout,
        finalPrices: lastGeminiResult.finalPrices,
    };
}


// --- Initialization ---

export function initializeCalculator() {
    // Event Listeners for main calculator
    DOM.itemTypeSelect.addEventListener('change', (e) => loadComponentsByProductType(e.target.value));
    
    [DOM.itemLengthInput, DOM.itemWidthInput, DOM.itemHeightInput, DOM.itemQuantityInput].forEach(input => input.addEventListener('input', debounce(updateComponentCalculationsAndRender, 300)));
    [DOM.laborCostInput, DOM.profitMarginInput].forEach(input => input.addEventListener('input', runFullCalculation));
    
    DOM.mainMaterialWoodCombobox.addEventListener('change', updateComponentCalculationsAndRender);

    DOM.componentsTableBody.addEventListener('change', e => {
        if (e.target.classList.contains('component-input')) {
            const id = e.target.closest('tr').dataset.id;
            const field = e.target.dataset.field;
            const value = e.target.value;
            const component = productComponents.find(p => p.id === id);
            if (component) {
                component[field] = (field === 'name') ? value : parseFloat(value) || 0;
                if (field === 'length' || field === 'width') {
                    component.isDefault = false; 
                }
                runFullCalculation();
            }
        }
    });

    DOM.componentsTableBody.addEventListener('click', e => {
        const deleteBtn = e.target.closest('.remove-component-btn');
        if (deleteBtn) {
            productComponents = productComponents.filter(p => p.id !== deleteBtn.dataset.id);
            renderProductComponents();
            runFullCalculation();
        }
    });

    DOM.addCustomComponentBtn.addEventListener('click', () => {
        productComponents.push({ id: `comp_${Date.now()}`, name: '', length: 0, width: 0, qty: 1, isDefault: false, materialId: null });
        renderProductComponents();
    });

    DOM.addGroupBtn.addEventListener('click', () => {
        const groupId = DOM.addGroupCombobox.querySelector('.combobox-value').value;
        const groupInstanceQty = parseInt(DOM.addGroupQuantityInput.value) || 1;
        if (!groupId) { showToast('Vui lòng chọn một cụm để thêm.', 'error'); return; }

        const group = localComponentGroups.find(g => g.id === groupId);
        if (group && group.components) {
            group.components.forEach(template => {
                const nameData = localComponentNames.find(cn => cn.id === template.componentNameId);
                if (nameData) {
                    productComponents.push({
                        id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: nameData.name,
                        length: 0, width: 0,
                        qty: template.qty * groupInstanceQty,
                        componentNameId: template.componentNameId,
                        isDefault: true,
                        materialId: null
                    });
                }
            });
            updateComponentCalculationsAndRender();
            showToast(`Đã thêm các chi tiết từ cụm "${group.name}".`, 'success');
            if (DOM.addGroupCombobox.setValue) DOM.addGroupCombobox.setValue('');
            DOM.addGroupQuantityInput.value = '1';
        }
    });

    DOM.addAccessoryBtn.addEventListener('click', () => {
        const selectedId = DOM.mainMaterialAccessoriesCombobox.querySelector('.combobox-value').value;
        const quantity = parseFloat(DOM.accessoryQuantityInput.value);
        if (!selectedId || !quantity || quantity <= 0) {
            showToast('Vui lòng chọn vật tư và nhập số lượng hợp lệ.', 'error'); return;
        }
        const material = allLocalMaterials.find(a => a.id === selectedId);
        if (!material) { showToast('Lỗi: Không tìm thấy vật tư đã chọn.', 'error'); return; }
        const existing = addedAccessories.find(a => a.id === selectedId);
        if (existing) existing.quantity += quantity;
        else addedAccessories.push({ ...material, quantity });
        renderAccessories();
        DOM.accessoryQuantityInput.value = '1';
        if (DOM.mainMaterialAccessoriesCombobox.setValue) DOM.mainMaterialAccessoriesCombobox.setValue('');
        runFullCalculation();
    });

    DOM.accessoriesList.addEventListener('click', e => {
        if (e.target.classList.contains('remove-acc-btn')) {
            addedAccessories = addedAccessories.filter(a => a.id !== e.target.dataset.id);
            renderAccessories();
            runFullCalculation();
        }
    });

    DOM.accessoriesList.addEventListener('change', e => {
        if (e.target.classList.contains('accessory-list-qty')) {
            const id = e.target.dataset.id;
            const newQuantity = parseInt(e.target.value);
            const accessory = addedAccessories.find(a => a.id === id);
            if (accessory && newQuantity > 0) accessory.quantity = newQuantity;
            else if (accessory) e.target.value = accessory.quantity;
            runFullCalculation();
        }
    });
    
    DOM.analyzeBtn.addEventListener('click', async () => {
        if (!currentUserId) { showToast('Vui lòng đăng nhập để sử dụng tính năng này.', 'error'); return; }
        if (!DOM.itemNameInput.value.trim()) { showToast('Vui lòng nhập Tên sản phẩm / dự án.', 'error'); return; }
        if (!DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value) { showToast('Vui lòng chọn vật liệu Ván chính.', 'error'); return; }
        await runAICuttingOptimization();
    });
}