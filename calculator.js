// calculator.js
import * as DOM from './dom.js';
import { showToast, initializeCombobox, debounce, createAccessoryManager } from './ui.js';
import { getSheetArea, getBoardThickness, parseNumber, h } from './utils.js';

// --- Module-level state ---
let localComponentNames = [];
let localProductTypes = [];
let localComponentGroups = [];
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
let currentUserId = null;

let lastCalculationResult = null;
let addedAccessories = [];
let productComponents = [];
let accessoryManager;


// --- Data Updaters ---
export function updateCalculatorData(data) {
    if (data.componentNames) localComponentNames = data.componentNames;
    if (data.productTypes) localProductTypes = data.productTypes;
    if (data.componentGroups) localComponentGroups = data.componentGroups;
    if (data.materials) localMaterials = data.materials;
    if (data.allMaterials && accessoryManager) {
         const allAccessoryMaterials = [ ...data.materials['Phụ kiện'], ...data.materials['Gia Công'], ...data.materials['Cạnh'] ];
         accessoryManager.updateMaterials(allAccessoryMaterials);
    }
    if (data.userId) currentUserId = data.userId;
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
const runFullCalculation = debounce(calculateAndDisplayFinalPrice, 300);

function updateComponentCalculationsAndRender() {
    const L = parseNumber(DOM.itemLengthInput.value) || 0;
    const W = parseNumber(DOM.itemWidthInput.value) || 0;
    const H = parseNumber(DOM.itemHeightInput.value) || 0;
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

export function loadComponentsByProductType(productTypeId) {
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
    DOM.componentsTableBody.innerHTML = ''; // Clear previous content

    if (productComponents.length === 0) {
        DOM.componentsTableBody.appendChild(
            h('tr', {}, 
                h('td', { colSpan: 6, style: 'text-align: center; padding: 1rem; color: var(--text-light);' }, 
                    'Chọn "Loại sản phẩm" hoặc thêm chi tiết tùy chỉnh.'
                )
            )
        );
        return;
    }

    productComponents.forEach(comp => {
        const nameComboboxContainer = h('div', { id: `comp-name-combobox-${comp.id}`, className: 'combobox-container component-combobox' },
            h('input', { type: 'text', className: 'input-style combobox-input component-input', dataset: { field: 'name' }, placeholder: 'Chọn hoặc nhập...', value: comp.name }),
            h('input', { type: 'hidden', className: 'combobox-value' }),
            h('div', { className: 'combobox-options-wrapper' }, h('ul', { className: 'combobox-options' }))
        );

        const materialComboboxContainer = h('div', { id: `comp-material-combobox-${comp.id}`, className: 'combobox-container component-combobox' },
            h('input', { type: 'text', className: 'input-style combobox-input', placeholder: 'Dùng ván chính...' }),
            h('input', { type: 'hidden', className: 'combobox-value' }),
            h('div', { className: 'combobox-options-wrapper' }, h('ul', { className: 'combobox-options' }))
        );

        const tr = h('tr', { dataset: { id: comp.id } },
            h('td', { dataset: { label: 'Tên Chi tiết' } }, nameComboboxContainer),
            h('td', { dataset: { label: 'Vật liệu' } }, materialComboboxContainer),
            h('td', { dataset: { label: 'Dài' } }, h('input', { type: 'text', inputMode: 'decimal', className: 'input-style component-input', dataset: { field: 'length' }, value: comp.length })),
            h('td', { dataset: { label: 'Rộng' } }, h('input', { type: 'text', inputMode: 'decimal', className: 'input-style component-input', dataset: { field: 'width' }, value: comp.width })),
            h('td', { dataset: { label: 'SL' } }, h('input', { type: 'text', inputMode: 'decimal', className: 'input-style component-input', dataset: { field: 'qty' }, value: comp.qty, style: 'max-width: 60px; text-align: center;' })),
            h('td', { dataset: { label: 'Xóa' }, className: 'text-center' },
                h('button', { className: 'remove-component-btn', dataset: { id: comp.id } }, h('i', { className: 'fas fa-trash' }))
            )
        );
        DOM.componentsTableBody.appendChild(tr);

        // Initialize Name Combobox
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

        // Initialize Material Combobox
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
            { placeholder: 'Dùng ván chính', allowEmpty: true, emptyOptionText: '--- Dùng ván chính ---' }
        );
        if (comp.materialId && materialComboboxContainer.setValue) {
            materialComboboxContainer.setValue(comp.materialId);
        }
    });
}


// --- Price Calculation ---

function renderCostBreakdown(breakdown, container) {
    if (!breakdown || breakdown.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }
    
    const listItems = breakdown.map(item =>
        h('li', {},
            h('span', { className: 'cost-item-name' }, item.name),
            h('span', { className: 'cost-item-value' }, `${(Math.round(item.cost || 0)).toLocaleString('vi-VN')}đ`),
            item.reason ? h('p', { className: 'cost-item-reason' }, item.reason) : null
        )
    );

    const breakdownContent = [
        h('h3', { className: 'result-box-header' }, h('i', { className: 'fas fa-file-invoice-dollar' }), ' Phân tích Chi phí Vật tư'),
        h('ul', { className: 'cost-list' }, ...listItems)
    ];

    container.innerHTML = '';
    breakdownContent.forEach(el => container.appendChild(el));
    container.classList.remove('hidden');
}

function calculateEdgeBanding() {
    let totalLength = 0;
    productComponents.forEach(comp => {
        const rules = localComponentNames.find(cn => cn.id === comp.componentNameId);
        if (rules) {
            if (rules.edge1) totalLength += comp.length * comp.qty;
            if (rules.edge2) totalLength += comp.length * comp.qty;
            if (rules.edge3) totalLength += comp.width * comp.qty;
            if (rules.edge4) totalLength += comp.width * comp.qty;
        }
    });
    return totalLength;
}

function calculateAndDisplayFinalPrice() {
    const costBreakdownItems = [];
    let baseMaterialCost = 0;

    // --- Calculate wood panel costs based on material groups ---
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
        const sheetAreaM2 = getSheetArea(material);
        if (sheetAreaM2 > 0) {
            sheetsNeeded = Math.ceil(totalArea / sheetAreaM2);
        }

        if (sheetsNeeded > 0) {
            const cost = sheetsNeeded * material.price;
            baseMaterialCost += cost;
            const reason = `${sheetsNeeded} tấm (ước tính từ ${totalArea.toFixed(2)}m²) x ${material.price.toLocaleString('vi-VN')}đ`;
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

    const laborCost = parseNumber(DOM.laborCostInput.value) || 0;
    const profitMargin = parseNumber(DOM.profitMarginInput.value) || 0;
    
    const totalCost = baseMaterialCost + laborCost;
    const suggestedPrice = totalCost * (1 + profitMargin / 100);
    const estimatedProfit = suggestedPrice - totalCost;

    const roundedTotalCost = Math.round(totalCost);
    const roundedSuggestedPrice = Math.round(suggestedPrice);
    const roundedEstimatedProfit = Math.round(estimatedProfit);
    
    DOM.totalCostValue.textContent = roundedTotalCost.toLocaleString('vi-VN') + 'đ';
    DOM.suggestedPriceValue.textContent = roundedSuggestedPrice.toLocaleString('vi-VN') + 'đ';
    DOM.estimatedProfitValue.textContent = roundedEstimatedProfit.toLocaleString('vi-VN') + 'đ';
    DOM.priceSummaryContainer.classList.remove('hidden');

    renderCostBreakdown(costBreakdownItems, DOM.costBreakdownContainer);
    
    if (totalCost > 0) {
        DOM.resultsSection.classList.remove('hidden');
        DOM.resultsContent.classList.remove('hidden');
        DOM.saveItemBtn.disabled = false;
        DOM.updateItemBtn.disabled = false;
        if (DOM.aiAnalysisBtn) DOM.aiAnalysisBtn.disabled = false;
        lastCalculationResult = { 
            totalCost: roundedTotalCost, 
            suggestedPrice: roundedSuggestedPrice, 
            estimatedProfit: roundedEstimatedProfit, 
            costBreakdown: costBreakdownItems 
        };
    } else {
        DOM.saveItemBtn.disabled = true;
        DOM.updateItemBtn.disabled = true;
        if (DOM.aiAnalysisBtn) DOM.aiAnalysisBtn.disabled = true;
    }
}


// --- Form Management ---

export function clearCalculatorInputs() {
    DOM.itemLengthInput.value = '';
    DOM.itemWidthInput.value = '';
    DOM.itemHeightInput.value = '';
    DOM.itemNameInput.value = '';
    DOM.itemDescriptionInput.value = '';
    DOM.profitMarginInput.value = '50';
    DOM.laborCostInput.value = '0';
    if (DOM.itemTypeCombobox.setValue) DOM.itemTypeCombobox.setValue('');
    
    addedAccessories = [];
    if(accessoryManager) accessoryManager.setAccessories([]);
    
    productComponents = [];
    renderProductComponents();

    lastCalculationResult = null;

    if (DOM.mainMaterialWoodCombobox.setValue) DOM.mainMaterialWoodCombobox.setValue('');
    if (DOM.mainMaterialBackPanelCombobox.setValue) DOM.mainMaterialBackPanelCombobox.setValue('');
    if (DOM.edgeMaterialCombobox.setValue) DOM.edgeMaterialCombobox.setValue('');

    DOM.resultsSection.classList.add('hidden');
    DOM.saveItemBtn.disabled = true;
    DOM.updateItemBtn.disabled = true;
    
    // AI Feature Reset
    if (DOM.aiAnalysisBtn) DOM.aiAnalysisBtn.disabled = true;
    if (DOM.aiAnalysisContainer) {
        DOM.aiAnalysisContainer.innerHTML = '';
        DOM.aiAnalysisContainer.classList.add('hidden');
    }
    if(DOM.guideDetails) DOM.guideDetails.classList.remove('hidden');
    if(DOM.aiAnalysisLoader) DOM.aiAnalysisLoader.classList.add('hidden');
}

export function loadItemIntoForm(item) {
    clearCalculatorInputs();
    const inputs = item.inputs || {};

    DOM.itemLengthInput.value = inputs.length || '';
    DOM.itemWidthInput.value = inputs.width || '';
    DOM.itemHeightInput.value = inputs.height || '';
    DOM.itemNameInput.value = inputs.name || '';
    DOM.itemDescriptionInput.value = inputs.description || '';
    if (DOM.itemTypeCombobox.setValue) DOM.itemTypeCombobox.setValue(inputs.productTypeId || '');
    DOM.profitMarginInput.value = inputs.profitMargin || '50';
    DOM.laborCostInput.value = inputs.laborCost || '0';
    
    // Manually trigger formatting for inputs after loading data
    document.querySelectorAll('input[inputmode="decimal"]').forEach(input => {
        if(input.value) input.dispatchEvent(new Event('input', { bubbles: true }));
    });


    if (DOM.mainMaterialWoodCombobox.setValue) DOM.mainMaterialWoodCombobox.setValue(inputs.mainWoodId || '');
    if (DOM.mainMaterialBackPanelCombobox.setValue) DOM.mainMaterialBackPanelCombobox.setValue(inputs.backPanelId || '');
    if (DOM.edgeMaterialCombobox.setValue) DOM.edgeMaterialCombobox.setValue(inputs.edgeMaterialId || '');
    
    addedAccessories = inputs.accessories ? JSON.parse(JSON.stringify(inputs.accessories)) : [];
    if(accessoryManager) accessoryManager.setAccessories(addedAccessories);
    
    productComponents = inputs.components ? JSON.parse(JSON.stringify(inputs.components)) : [];
    
    renderProductComponents();
    calculateAndDisplayFinalPrice();
    
    document.querySelector('button[data-tab="calculator"]')?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Đã tải dữ liệu dự án. Bạn có thể chỉnh sửa và tính toán lại.', 'info');
}

export function getCalculatorStateForSave() {
     if (!currentUserId || !lastCalculationResult) {
        showToast('Không có kết quả phân tích để lưu.', 'error');
        return null;
    }
    
    return {
        inputs: {
            name: DOM.itemNameInput.value,
            description: DOM.itemDescriptionInput.value,
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
            components: productComponents
        },
        finalPrices: lastCalculationResult,
    };
}


// --- Initialization ---

export function initializeCalculator() {

    initializeCombobox(
        DOM.itemTypeCombobox,
        [], // Initial data, will be populated later
        (selectedId) => {
            // This is the onSelect callback
            DOM.itemTypeSelect.value = selectedId;
            loadComponentsByProductType(selectedId);
        },
        { placeholder: "Chọn loại sản phẩm...", allowEmpty: true, emptyOptionText: "--- Tự định nghĩa ---" }
    );
    
    [DOM.itemLengthInput, DOM.itemWidthInput, DOM.itemHeightInput].forEach(input => input.addEventListener('input', debounce(updateComponentCalculationsAndRender, 300)));
    [DOM.laborCostInput, DOM.profitMarginInput].forEach(input => input.addEventListener('input', runFullCalculation));
    
    DOM.mainMaterialWoodCombobox.addEventListener('change', updateComponentCalculationsAndRender);
    DOM.edgeMaterialCombobox.addEventListener('change', runFullCalculation);
    DOM.mainMaterialBackPanelCombobox.addEventListener('change', runFullCalculation);


    DOM.componentsTableBody.addEventListener('input', e => {
        if (e.target.classList.contains('component-input')) {
            const id = e.target.closest('tr').dataset.id;
            const field = e.target.dataset.field;
            const value = e.target.value;
            const component = productComponents.find(p => p.id === id);
            if (component) {
                if (field === 'name') {
                     component.name = value;
                } else {
                    component[field] = parseNumber(value) || 0;
                }
                
                if (field === 'length' || field === 'width' || field === 'qty') {
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
        const groupInstanceQty = parseNumber(DOM.addGroupQuantityInput.value) || 1;
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

    accessoryManager = createAccessoryManager({
        listEl: DOM.accessoriesList,
        addBtn: DOM.addAccessoryBtn,
        quantityInput: DOM.accessoryQuantityInput,
        materialCombobox: DOM.mainMaterialAccessoriesCombobox,
        onUpdate: (newAccessories) => {
            addedAccessories = newAccessories;
            runFullCalculation();
        },
        showToast,
    });
}