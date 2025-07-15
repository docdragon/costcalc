// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut, setDoc
} from './firebase.js';

import { 
    openModal, closeModal, showConfirm, showToast, updateUIVisibility, 
    initializeImageUploader, initializeTabs, initializeModals, initializeMathInput,
    initializeCombobox, debounce
} from './ui.js';
import { initializeQuickCalc, updateQuickCalcMaterials } from './quick-calc.js';
import * as DOM from './dom.js';


// --- Global State ---
let currentUserId = null;
let materialsCollectionRef = null;
let savedItemsCollectionRef = null;
let componentNamesCollectionRef = null;
let productTypesCollectionRef = null;
let componentGroupsCollectionRef = null; // For component groups/assemblies

let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let unsubscribeComponentNames = null;
let unsubscribeProductTypes = null;
let unsubscribeComponentGroups = null; // New listener for groups

let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
let allLocalMaterials = []; // Flat array for filtering and sorting
let localSavedItems = [];
let localComponentNames = [];
let localProductTypes = [];
let localComponentGroups = []; // For new component groups
let currentEditingProductTypeId = null;
let currentEditingComponentGroupId = null; // To track which group is being edited

let lastGeminiResult = null;
let addedAccessories = [];
let productComponents = [];
let uploadedImage = null;
let aiCalculationState = 'idle'; // idle, calculating, done

// Pagination state
let currentPage = 1;
const itemsPerPage = 10;
let cnCurrentPage = 1;
const cnItemsPerPage = 10;


// --- Sample Data for New Users ---
const sampleMaterials = [
    { name: 'Ván MDF An Cường chống ẩm 17mm', type: 'Ván', price: 550000, unit: 'tấm', notes: 'Khổ 1220x2440mm' },
    { name: 'Ván HDF siêu chống ẩm 17mm', type: 'Ván', price: 780000, unit: 'tấm', notes: 'Khổ 1220x2440mm' },
    { name: 'Ván Plywood 9mm', type: 'Ván', price: 250000, unit: 'tấm', notes: 'Làm hậu tủ' },
    { name: 'Nẹp chỉ PVC An Cường 1mm', type: 'Cạnh', price: 5000, unit: 'mét', notes: 'Cùng màu ván' },
    { name: 'Bản lề hơi Ivan giảm chấn', type: 'Phụ kiện', price: 15000, unit: 'cái', notes: 'Loại thẳng' },
    { name: 'Ray bi 3 tầng', type: 'Phụ kiện', price: 45000, unit: 'cặp', notes: 'Dài 45cm' },
    { name: 'Sơn PU Inchem', type: 'Gia Công', price: 250000, unit: 'm²', notes: 'Sơn hoàn thiện 2 mặt' },
    { name: 'Tay nắm âm', type: 'Phụ kiện', price: 25000, unit: 'cái', notes: 'Màu đen' },
];

const sampleComponentNames = [
    { name: 'Hông Trái', notes: 'Vách bên trái tủ', lengthFormula: 'H', widthFormula: 'W', edge1: true, edge2: false, edge3: true, edge4: false },
    { name: 'Hông Phải', notes: 'Vách bên phải tủ', lengthFormula: 'H', widthFormula: 'W', edge1: true, edge2: false, edge3: true, edge4: false },
    { name: 'Đáy', notes: 'Tấm ván dưới cùng', lengthFormula: 'L - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
    { name: 'Nóc', notes: 'Tấm ván trên cùng', lengthFormula: 'L - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
    { name: 'Hậu', notes: 'Tấm ván phía sau', lengthFormula: 'L', widthFormula: 'H', edge1: false, edge2: false, edge3: false, edge4: false },
    { name: 'Cánh Mở', notes: '', lengthFormula: 'H - 4', widthFormula: '(L / 2) - 4', edge1: true, edge2: true, edge3: true, edge4: true },
    { name: 'Đợt Cố Định', notes: '', lengthFormula: 'L - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
    { name: 'Vách Ngăn', notes: 'Vách chia khoang', lengthFormula: 'H - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
];

const sampleProductTypes = [
    { name: 'Tủ Bếp Dưới', components: [
        { name: 'Hông Trái', qty: 1 }, { name: 'Hông Phải', qty: 1 },
        { name: 'Đáy', qty: 1 }, { name: 'Hậu', qty: 1 }
    ]},
    { name: 'Tủ Áo 2 Cánh', components: [
        { name: 'Hông Trái', qty: 1 }, { name: 'Hông Phải', qty: 1 },
        { name: 'Đáy', qty: 1 }, { name: 'Nóc', qty: 1 },
        { name: 'Cánh Mở', qty: 2 }, { name: 'Đợt Cố Định', qty: 1 }
    ]}
];


async function addSampleData(userId) {
    // Add sample component names first and get their new IDs
    const componentNamesRef = collection(db, `users/${userId}/componentNames`);
    const componentNameMap = {};
    for (const compName of sampleComponentNames) {
        const docRef = await addDoc(componentNamesRef, compName);
        componentNameMap[compName.name] = docRef.id;
    }
    
    // Add sample product types, using the new component name IDs
    const productTypesRef = collection(db, `users/${userId}/productTypes`);
    for (const prodType of sampleProductTypes) {
        const componentsWithIds = prodType.components
            .map(c => ({ componentNameId: componentNameMap[c.name], qty: c.qty }))
            .filter(c => c.componentNameId); // Filter out any that might have failed to map
        await addDoc(productTypesRef, { name: prodType.name, components: componentsWithIds });
    }

    // Add sample materials
    const materialsRef = collection(db, `users/${userId}/materials`);
    for (const material of sampleMaterials) {
        await addDoc(materialsRef, material);
    }
}

async function checkAndAddSampleData(userId) {
    try {
        const materialsRef = collection(db, `users/${userId}/materials`);
        const q = query(materialsRef, limit(1));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log("No materials found for user, adding sample data.");
            await addSampleData(userId);
            showToast('Đã thêm dữ liệu mẫu cho bạn!', 'info');
        }
    } catch (error) {
        console.error("Error checking/adding sample data:", error);
    }
}

// --- Auth & App Initialization ---
onAuthStateChanged(auth, async (user) => {
    const loggedIn = !!user;
    if (loggedIn) {
        currentUserId = user.uid;
        materialsCollectionRef = collection(db, `users/${currentUserId}/materials`);
        savedItemsCollectionRef = collection(db, `users/${currentUserId}/savedItems`);
        componentNamesCollectionRef = collection(db, `users/${currentUserId}/componentNames`);
        productTypesCollectionRef = collection(db, `users/${currentUserId}/productTypes`);
        componentGroupsCollectionRef = collection(db, `users/${currentUserId}/componentGroups`);
        await checkAndAddSampleData(currentUserId);
        listenForData();
    } else {
        currentUserId = null;
        if (unsubscribeMaterials) unsubscribeMaterials();
        if (unsubscribeSavedItems) unsubscribeSavedItems();
        if (unsubscribeComponentNames) unsubscribeComponentNames();
        if (unsubscribeProductTypes) unsubscribeProductTypes();
        if (unsubscribeComponentGroups) unsubscribeComponentGroups();
        clearLocalData();
    }
    updateUIVisibility(loggedIn, user);
    DOM.initialLoader.style.opacity = '0';
    setTimeout(() => DOM.initialLoader.style.display = 'none', 300);
});

function listenForData() {
    listenForMaterials();
    listenForSavedItems();
    listenForComponentNames();
    listenForProductTypes();
    listenForComponentGroups();
}

function clearLocalData() {
    localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
    allLocalMaterials = [];
    localSavedItems = [];
    localComponentNames = [];
    localProductTypes = [];
    localComponentGroups = [];
    renderMaterials([]);
    renderSavedItems([]);
    renderComponentNames([]);
    renderProductTypes([]);
    renderComponentGroups([]);
    populateComboboxes();
    populateProductTypeDropdown();
    updateQuickCalcMaterials(localMaterials);
}

DOM.logoutBtn.addEventListener('click', () => signOut(auth));

// --- Helper & Renderer Functions ---

function getSheetArea(material) {
    const STANDARD_SHEET_AREA_M2 = 1.22 * 2.44;
    if (!material || !material.notes) return STANDARD_SHEET_AREA_M2;
    const match = material.notes.match(/(\d+)\s*x\s*(\d+)/);
    if (match && match[1] && match[2]) {
        return (parseInt(match[1], 10) * parseInt(match[2], 10)) / 1000000;
    }
    return STANDARD_SHEET_AREA_M2;
}

function getBoardThickness(material) {
    const DEFAULT_THICKNESS = 17;
    if (!material) return DEFAULT_THICKNESS;
    const combinedText = `${material.name} ${material.notes || ''}`;
    const match = combinedText.match(/(\d+)\s*(mm|ly|li)/i);
    return match && match[1] ? parseInt(match[1], 10) : DEFAULT_THICKNESS;
}


// --- Component Management (Refactored) ---

function evaluateFormula(formula, context) {
    if (!formula || typeof formula !== 'string') return 0;
    
    // Sanitize to prevent malicious code injection
    const allowedChars = /^[LWHt\d\s\.\+\-\*\/\(\)]+$/;
    if (!allowedChars.test(formula)) {
        console.warn(`Invalid characters in formula: "${formula}"`);
        return 0;
    }

    const { L, W, H, t } = context;
    try {
        // Using Function constructor is safer than eval
        const func = new Function('L', 'W', 'H', 't', `return ${formula}`);
        const result = func(L, W, H, t);
        return typeof result === 'number' && isFinite(result) ? result : 0;
    } catch (e) {
        console.error(`Error evaluating formula "${formula}":`, e);
        return 0;
    }
}

function updateComponentCalculationsAndRender() {
    const L = parseFloat(DOM.itemLengthInput.value) || 0;
    const W = parseFloat(DOM.itemWidthInput.value) || 0;
    const H = parseFloat(DOM.itemHeightInput.value) || 0;
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const mainWoodMaterial = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const t = getBoardThickness(mainWoodMaterial);

    if (L > 0 || W > 0 || H > 0) {
        productComponents.forEach(comp => {
            // Only apply formulas if the component is marked as default (not manually edited)
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
                });
            }
        });
    }
    updateComponentCalculationsAndRender();
}


function renderProductComponents() {
    const rows = DOM.componentsTableBody.children;

    // If number of components is different, or if there are no rows when there should be, perform a full re-render.
    if (rows.length !== productComponents.length || (rows.length === 0 && productComponents.length > 0)) {
        DOM.componentsTableBody.innerHTML = ''; // Clear existing content
        if (productComponents.length === 0) {
            DOM.componentsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-light);">Chọn "Loại sản phẩm" hoặc thêm chi tiết tùy chỉnh.</td></tr>';
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
                <td data-label="Dài"><input type="text" inputmode="decimal" class="input-style component-input" data-field="length" value="${comp.length}"></td>
                <td data-label="Rộng"><input type="text" inputmode="decimal" class="input-style component-input" data-field="width" value="${comp.width}"></td>
                <td data-label="SL"><input type="text" inputmode="decimal" class="input-style component-input" data-field="qty" value="${comp.qty}" style="max-width: 60px; text-align: center;"></td>
                <td data-label="Xóa" class="text-center">
                    <button class="remove-component-btn" data-id="${comp.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            DOM.componentsTableBody.appendChild(tr);

            const comboboxContainer = tr.querySelector(`#comp-name-combobox-${comp.id}`);
            if(comboboxContainer) {
                initializeCombobox(
                    comboboxContainer, 
                    localComponentNames.map(c => ({ id: c.id, name: c.name, price: '', unit: ''})), 
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
        });
    } else {
        // Optimization: If the number of components is the same, just update the values.
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


function getPanelPiecesForAI() {
    const pieces = [];
    const backPanelId = DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value;

    productComponents.forEach(comp => {
        const isBackPanel = comp.name.toLowerCase().includes('hậu');
        if (isBackPanel && backPanelId) {
            return; // Skip back panels if a specific material is chosen for them
        }

        for (let i = 0; i < comp.qty; i++) {
            const pieceName = `${comp.name}${comp.qty > 1 ? ` (${i + 1})` : ''}`;
            pieces.push({ name: pieceName, width: comp.length, height: comp.width });
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

// --- Materials Management ---
function listenForMaterials() {
    if (unsubscribeMaterials) unsubscribeMaterials(); 
    unsubscribeMaterials = onSnapshot(materialsCollectionRef, snapshot => {
        localMaterials['Ván'] = [];
        localMaterials['Cạnh'] = [];
        localMaterials['Phụ kiện'] = [];
        localMaterials['Gia Công'] = [];
        
        snapshot.docs.forEach(doc => {
            const material = { id: doc.id, ...doc.data() };
            if (localMaterials[material.type]) {
                localMaterials[material.type].push(material);
            }
        });

        allLocalMaterials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        displayMaterials(); 
        populateComboboxes();
        updateQuickCalcMaterials(localMaterials);
    }, console.error);
}

function displayMaterials() {
    let materialsToProcess = [...allLocalMaterials];
    const filterText = DOM.materialFilterInput.value.toLowerCase().trim();
    const sortBy = DOM.materialSortSelect.value;

    if (filterText) {
        materialsToProcess = materialsToProcess.filter(m => 
            m.name.toLowerCase().includes(filterText) || 
            (m.notes && m.notes.toLowerCase().includes(filterText))
        );
    }

    switch (sortBy) {
        case 'name-asc': materialsToProcess.sort((a, b) => a.name.localeCompare(b.name, 'vi')); break;
        case 'name-desc': materialsToProcess.sort((a, b) => b.name.localeCompare(a.name, 'vi')); break;
        case 'price-asc': materialsToProcess.sort((a, b) => a.price - b.price); break;
        case 'price-desc': materialsToProcess.sort((a, b) => b.price - a.price); break;
        case 'type': materialsToProcess.sort((a, b) => a.type.localeCompare(b.type, 'vi') || a.name.localeCompare(b.name, 'vi')); break;
    }
    
    const totalItems = materialsToProcess.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = materialsToProcess.slice(startIndex, startIndex + itemsPerPage);

    renderMaterials(paginatedItems);
    updatePaginationControls(totalPages);
}

function updatePaginationControls(totalPages) {
    if (!DOM.paginationControls) return;
    DOM.paginationControls.dataset.totalPages = totalPages;
    if (totalPages <= 1) {
        DOM.paginationControls.classList.add('hidden');
        return;
    }
    DOM.paginationControls.classList.remove('hidden');
    DOM.pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
    DOM.prevPageBtn.disabled = currentPage === 1;
    DOM.nextPageBtn.disabled = currentPage === totalPages;
}

DOM.materialFilterInput.addEventListener('input', debounce(() => { currentPage = 1; displayMaterials(); }, 300));
DOM.materialSortSelect.addEventListener('change', () => { currentPage = 1; displayMaterials(); });
DOM.prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; displayMaterials(); } });
DOM.nextPageBtn.addEventListener('click', () => {
    const totalPages = parseInt(DOM.paginationControls.dataset.totalPages, 10) || 1;
    if (currentPage < totalPages) { 
        currentPage++; 
        displayMaterials(); 
    }
});

function renderMaterials(materials) {
    DOM.materialsTableBody.innerHTML = '';
    if (materials.length === 0) {
        DOM.materialsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-light);">Không tìm thấy vật tư nào.</td></tr>`;
        return;
    }
    materials.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Tên">${m.name}</td>
            <td data-label="Loại"><span class="tag-type">${m.type}</span></td>
            <td data-label="Đơn giá">${Number(m.price).toLocaleString('vi-VN')}đ / ${m.unit}</td>
            <td data-label="Ghi chú">${m.notes || ''}</td>
            <td data-label="Thao tác" class="text-center">
                <button class="edit-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${m.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-btn text-red-500 hover:text-red-700" data-id="${m.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        DOM.materialsTableBody.appendChild(tr);
    });
}

DOM.materialForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUserId) return;
    const materialData = {
        name: DOM.materialForm['material-name'].value,
        type: DOM.materialForm['material-type'].value,
        price: Number(DOM.materialForm['material-price'].value),
        unit: DOM.materialForm['material-unit'].value,
        notes: DOM.materialForm['material-notes'].value
    };
    const id = DOM.materialForm['material-id'].value;
    try {
        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/materials`, id), materialData);
            showToast('Cập nhật vật tư thành công!', 'success');
        } else {
            await addDoc(materialsCollectionRef, materialData);
            showToast('Thêm vật tư thành công!', 'success');
        }
        resetMaterialForm();
    } catch (error) { 
        showToast('Đã có lỗi xảy ra. ' + error.message, 'error'); 
        console.error("Error adding/updating material:", error);
    }
});

DOM.materialsTableBody.addEventListener('click', async e => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    if (editBtn) {
        const id = editBtn.dataset.id;
        const material = allLocalMaterials.find(m => m.id === id);
        if (material) {
            DOM.materialForm['material-id'].value = id;
            DOM.materialForm['material-name'].value = material.name;
            DOM.materialForm['material-type'].value = material.type;
            DOM.materialForm['material-price'].value = material.price;
            DOM.materialForm['material-unit'].value = material.unit;
            DOM.materialForm['material-notes'].value = material.notes;
            DOM.materialForm.querySelector('button[type="submit"]').textContent = 'Cập nhật Vật tư';
            DOM.cancelEditBtn.classList.remove('hidden');
        }
    } else if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa vật tư này?');
        if (confirmed) {
            try {
                await deleteDoc(doc(db, `users/${currentUserId}/materials`, id));
                showToast('Xóa vật tư thành công.', 'success');
            } catch (error) {
                showToast('Lỗi khi xóa vật tư.', 'error');
                console.error("Error deleting material:", error);
            }
        }
    }
});

DOM.cancelEditBtn.addEventListener('click', resetMaterialForm);

function resetMaterialForm() {
    DOM.materialForm.reset();
    DOM.materialForm['material-id'].value = '';
    DOM.materialForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Vật tư';
    DOM.cancelEditBtn.classList.add('hidden');
}


// --- Component Name Management (Configuration Tab) ---
function listenForComponentNames() {
    if (unsubscribeComponentNames) unsubscribeComponentNames();
    unsubscribeComponentNames = onSnapshot(componentNamesCollectionRef, snapshot => {
        localComponentNames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localComponentNames.sort((a,b) => a.name.localeCompare(b.name, 'vi'));
        displayComponentNames();
        // Also update the comboboxes that use component names
        const componentNameOptions = localComponentNames.map(c => ({ id: c.id, name: c.name }));
        if (DOM.ptComponentAddCombobox?.updateComboboxData) {
            DOM.ptComponentAddCombobox.updateComboboxData(componentNameOptions);
        }
        if (DOM.cgComponentAddCombobox?.updateComboboxData) {
            DOM.cgComponentAddCombobox.updateComboboxData(componentNameOptions);
        }
    }, console.error);
}

function displayComponentNames() {
    let namesToProcess = [...localComponentNames];
    const filterText = DOM.cnFilterInput ? DOM.cnFilterInput.value.toLowerCase().trim() : '';

    if (filterText) {
        namesToProcess = namesToProcess.filter(cn => 
            cn.name.toLowerCase().includes(filterText) || 
            (cn.notes && cn.notes.toLowerCase().includes(filterText))
        );
    }
     
    const totalItems = namesToProcess.length;
    const totalPages = Math.ceil(totalItems / cnItemsPerPage) || 1;
    if (cnCurrentPage > totalPages) cnCurrentPage = totalPages;

    const startIndex = (cnCurrentPage - 1) * cnItemsPerPage;
    const paginatedItems = namesToProcess.slice(startIndex, startIndex + cnItemsPerPage);

    renderComponentNames(paginatedItems);
    updateCnPaginationControls(totalPages);
}

function updateCnPaginationControls(totalPages) {
    if (!DOM.cnPaginationControls) return;
    DOM.cnPaginationControls.dataset.totalPages = totalPages;
    if (totalPages <= 1) {
        DOM.cnPaginationControls.classList.add('hidden');
        return;
    }
    DOM.cnPaginationControls.classList.remove('hidden');
    DOM.cnPageInfo.textContent = `Trang ${cnCurrentPage} / ${totalPages}`;
    DOM.cnPrevPageBtn.disabled = cnCurrentPage === 1;
    DOM.cnNextPageBtn.disabled = cnCurrentPage === totalPages;
}

function renderComponentNames(names) {
    DOM.componentNamesTableBody.innerHTML = '';
    if (names.length === 0) {
        DOM.componentNamesTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 1rem; color: var(--text-light);">Không tìm thấy tên chi tiết nào.</td></tr>`;
        return;
    }
    names.forEach(cn => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Tên">${cn.name}</td>
            <td data-label="CT Dài">${cn.lengthFormula || '-'}</td>
            <td data-label="CT Rộng">${cn.widthFormula || '-'}</td>
            <td data-label="D1" class="text-center"><div class="edge-banding-icon ${cn.edge1 ? 'on' : 'off'}"><i class="fas fa-check"></i></div></td>
            <td data-label="D2" class="text-center"><div class="edge-banding-icon ${cn.edge2 ? 'on' : 'off'}"><i class="fas fa-check"></i></div></td>
            <td data-label="R1" class="text-center"><div class="edge-banding-icon ${cn.edge3 ? 'on' : 'off'}"><i class="fas fa-check"></i></div></td>
            <td data-label="R2" class="text-center"><div class="edge-banding-icon ${cn.edge4 ? 'on' : 'off'}"><i class="fas fa-check"></i></div></td>
            <td data-label="Thao tác" class="text-center">
                <button class="edit-cn-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${cn.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-cn-btn text-red-500 hover:text-red-700" data-id="${cn.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        DOM.componentNamesTableBody.appendChild(tr);
    });
}

DOM.componentNameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) return;
    const nameData = {
        name: DOM.componentNameForm['component-name-input'].value,
        notes: DOM.componentNameForm['component-name-notes'].value,
        lengthFormula: DOM.componentLengthFormulaInput.value.trim(),
        widthFormula: DOM.componentWidthFormulaInput.value.trim(),
        edge1: DOM.componentNameForm['component-edge-1'].checked,
        edge2: DOM.componentNameForm['component-edge-2'].checked,
        edge3: DOM.componentNameForm['component-edge-3'].checked,
        edge4: DOM.componentNameForm['component-edge-4'].checked,
    };
    const id = DOM.componentNameForm['component-name-id'].value;
    try {
        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/componentNames`, id), nameData);
            showToast('Cập nhật tên thành công!', 'success');
        } else {
            await addDoc(componentNamesCollectionRef, nameData);
            showToast('Thêm tên thành công!', 'success');
        }
        resetComponentNameForm();
    } catch (error) {
        showToast('Đã có lỗi xảy ra.', 'error');
        console.error("Error adding/updating component name:", error);
    }
});

DOM.componentNamesTableBody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-cn-btn');
    const deleteBtn = e.target.closest('.delete-cn-btn');
    if (editBtn) {
        const id = editBtn.dataset.id;
        const cn = localComponentNames.find(c => c.id === id);
        if (cn) {
            DOM.componentNameForm['component-name-id'].value = id;
            DOM.componentNameForm['component-name-input'].value = cn.name;
            DOM.componentNameForm['component-name-notes'].value = cn.notes || '';
            DOM.componentLengthFormulaInput.value = cn.lengthFormula || '';
            DOM.componentWidthFormulaInput.value = cn.widthFormula || '';
            DOM.componentNameForm['component-edge-1'].checked = !!cn.edge1;
            DOM.componentNameForm['component-edge-2'].checked = !!cn.edge2;
            DOM.componentNameForm['component-edge-3'].checked = !!cn.edge3;
            DOM.componentNameForm['component-edge-4'].checked = !!cn.edge4;
            DOM.componentNameForm.querySelector('button[type="submit"]').textContent = 'Cập nhật Tên';
            DOM.cancelComponentNameEditBtn.classList.remove('hidden');
        }
    } else if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa tên chi tiết này?');
        if (confirmed) {
            try {
                await deleteDoc(doc(db, `users/${currentUserId}/componentNames`, id));
                showToast('Xóa tên thành công.', 'success');
            } catch (error) {
                showToast('Lỗi khi xóa.', 'error');
            }
        }
    }
});

DOM.cancelComponentNameEditBtn.addEventListener('click', resetComponentNameForm);

function resetComponentNameForm() {
    DOM.componentNameForm.reset();
    DOM.componentNameForm['component-name-id'].value = '';
    DOM.componentLengthFormulaInput.value = '';
    DOM.componentWidthFormulaInput.value = '';
    DOM.componentNameForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Tên';
    DOM.cancelComponentNameEditBtn.classList.add('hidden');
}


// --- NEW: Product Type Management (Configuration Tab) ---
function listenForProductTypes() {
    if (unsubscribeProductTypes) unsubscribeProductTypes();
    unsubscribeProductTypes = onSnapshot(productTypesCollectionRef, snapshot => {
        localProductTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localProductTypes.sort((a,b) => a.name.localeCompare(b.name, 'vi'));
        renderProductTypes(localProductTypes);
        populateProductTypeDropdown();
        if (currentEditingProductTypeId) {
            renderProductTypeEditor();
        }
    }, console.error);
}

function renderProductTypes(types) {
    DOM.productTypesList.innerHTML = '';
    if (types.length === 0) {
        DOM.productTypesList.innerHTML = `<p class="form-text">Chưa có loại sản phẩm nào. Thêm một loại ở trên để bắt đầu.</p>`;
        return;
    }
    types.forEach(pt => {
        const item = document.createElement('div');
        item.className = 'config-list-item';
        item.dataset.id = pt.id;
        if (pt.id === currentEditingProductTypeId) {
            item.classList.add('active');
        }
        item.innerHTML = `
            <span>${pt.name}</span>
            <div class="config-list-item-actions">
                 <button class="delete-pt-btn" data-id="${pt.id}" title="Xóa loại sản phẩm"><i class="fas fa-trash"></i></button>
            </div>
        `;
        DOM.productTypesList.appendChild(item);
    });
}

function renderProductTypeEditor() {
    const productType = localProductTypes.find(pt => pt.id === currentEditingProductTypeId);
    if (!productType) {
        DOM.productTypeEditor.classList.add('hidden');
        return;
    }

    DOM.productTypeEditor.classList.remove('hidden');
    DOM.productTypeEditorTitle.textContent = `Chỉnh sửa chi tiết cho: ${productType.name}`;
    
    DOM.ptComponentsList.innerHTML = '';
    const components = productType.components || [];
    if (components.length > 0) {
        components.forEach(c => {
            const componentName = localComponentNames.find(cn => cn.id === c.componentNameId)?.name || 'Không rõ';
            const tr = document.createElement('tr');
            tr.dataset.cnid = c.componentNameId;
            tr.innerHTML = `
                <td data-label="Tên">${componentName}</td>
                <td data-label="Số lượng" class="text-center">${c.qty}</td>
                <td data-label="Xóa" class="text-center">
                    <button class="remove-component-btn" data-cnid="${c.componentNameId}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            DOM.ptComponentsList.appendChild(tr);
        });
    } else {
        DOM.ptComponentsList.innerHTML = `<tr><td colspan="3" class="text-center" style="padding: 1rem; color: var(--text-light)">Chưa có chi tiết nào được thêm.</td></tr>`;
    }
}

DOM.productTypeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) return;
    const name = DOM.productTypeNameInput.value.trim();
    if (!name) return;

    const data = { name };
    const id = DOM.productTypeIdInput.value;

    try {
        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/productTypes`, id), data);
            showToast('Cập nhật loại sản phẩm thành công!', 'success');
        } else {
            const docRef = await addDoc(productTypesCollectionRef, { ...data, components: [] });
            showToast('Thêm loại sản phẩm thành công!', 'success');
            currentEditingProductTypeId = docRef.id;
        }
        resetProductTypeForm();
        renderProductTypes(localProductTypes);
        renderProductTypeEditor();
    } catch (error) {
        showToast('Đã có lỗi xảy ra.', 'error');
        console.error("Error adding/updating product type:", error);
    }
});

DOM.productTypesList.addEventListener('click', async e => {
    const item = e.target.closest('.config-list-item');
    const deleteBtn = e.target.closest('.delete-pt-btn');

    if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        const pt = localProductTypes.find(p => p.id === id);
        const confirmed = await showConfirm(`Bạn có chắc muốn xóa loại sản phẩm "${pt.name}"?`);
        if (confirmed) {
            await deleteDoc(doc(db, `users/${currentUserId}/productTypes`, id));
            if (currentEditingProductTypeId === id) {
                currentEditingProductTypeId = null;
                DOM.productTypeEditor.classList.add('hidden');
            }
            showToast("Xóa thành công", "success");
        }
        return;
    }
    
    if (item) {
        currentEditingProductTypeId = item.dataset.id;
        const pt = localProductTypes.find(p => p.id === currentEditingProductTypeId);
        if (pt) {
            DOM.productTypeIdInput.value = pt.id;
            DOM.productTypeNameInput.value = pt.name;
            DOM.productTypeForm.querySelector('button[type="submit"]').textContent = 'Cập nhật';
            DOM.cancelProductTypeEditBtn.classList.remove('hidden');
        }
        renderProductTypes(localProductTypes);
        renderProductTypeEditor();
    }
});

DOM.cancelProductTypeEditBtn.addEventListener('click', () => {
    resetProductTypeForm();
    currentEditingProductTypeId = null;
    renderProductTypes(localProductTypes);
    DOM.productTypeEditor.classList.add('hidden');
});

function resetProductTypeForm() {
    DOM.productTypeForm.reset();
    DOM.productTypeIdInput.value = '';
    DOM.productTypeForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Mới';
    DOM.cancelProductTypeEditBtn.classList.add('hidden');
}

DOM.ptComponentAddBtn.addEventListener('click', async () => {
    const productType = localProductTypes.find(pt => pt.id === currentEditingProductTypeId);
    if (!productType) return;
    
    const componentNameId = DOM.ptComponentAddCombobox.querySelector('.combobox-value').value;
    const qty = parseInt(DOM.ptComponentAddQtyInput.value);
    
    if (!componentNameId || !qty || qty < 1) {
        showToast('Vui lòng chọn chi tiết và nhập số lượng hợp lệ.', 'error');
        return;
    }
    
    const newComponents = JSON.parse(JSON.stringify(productType.components || []));
    const existing = newComponents.find(c => c.componentNameId === componentNameId);

    if (existing) {
        existing.qty = qty; 
    } else {
        newComponents.push({ componentNameId, qty });
    }
    
    await updateDoc(doc(db, `users/${currentUserId}/productTypes`, productType.id), { components: newComponents });
    showToast('Đã thêm/cập nhật chi tiết.', 'success');
    DOM.ptComponentAddQtyInput.value = '1';
    if(DOM.ptComponentAddCombobox.setValue) DOM.ptComponentAddCombobox.setValue('');
});

DOM.ptComponentsList.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('.remove-component-btn');
    if (deleteBtn) {
        const productType = localProductTypes.find(pt => pt.id === currentEditingProductTypeId);
        if (!productType) return;
        const componentNameIdToRemove = deleteBtn.dataset.cnid;
        const newComponents = (productType.components || []).filter(c => c.componentNameId !== componentNameIdToRemove);
        await updateDoc(doc(db, `users/${currentUserId}/productTypes`, productType.id), { components: newComponents });
        showToast('Đã xóa chi tiết.', 'success');
    }
});


// --- Component Group Management ---
function listenForComponentGroups() {
    if (unsubscribeComponentGroups) unsubscribeComponentGroups();
    unsubscribeComponentGroups = onSnapshot(componentGroupsCollectionRef, snapshot => {
        localComponentGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localComponentGroups.sort((a,b) => a.name.localeCompare(b.name, 'vi'));
        renderComponentGroups(localComponentGroups);
        if (DOM.addGroupCombobox?.updateComboboxData) {
            DOM.addGroupCombobox.updateComboboxData(localComponentGroups);
        }
        if (currentEditingComponentGroupId) {
            renderComponentGroupEditor();
        }
    }, console.error);
}

function renderComponentGroups(groups) {
    DOM.componentGroupsList.innerHTML = '';
    if (groups.length === 0) {
        DOM.componentGroupsList.innerHTML = `<p class="form-text">Chưa có nhóm chi tiết nào.</p>`;
        return;
    }
    groups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'config-list-item';
        item.dataset.id = group.id;
        if (group.id === currentEditingComponentGroupId) {
            item.classList.add('active');
        }
        item.innerHTML = `
            <span>${group.name}</span>
            <div class="config-list-item-actions">
                 <button class="delete-cg-btn" data-id="${group.id}" title="Xóa nhóm chi tiết"><i class="fas fa-trash"></i></button>
            </div>
        `;
        DOM.componentGroupsList.appendChild(item);
    });
}

function renderComponentGroupEditor() {
    const group = localComponentGroups.find(g => g.id === currentEditingComponentGroupId);
    if (!group) {
        DOM.componentGroupEditor.classList.add('hidden');
        return;
    }

    DOM.componentGroupEditor.classList.remove('hidden');
    DOM.componentGroupEditorTitle.textContent = `Chỉnh sửa chi tiết cho: ${group.name}`;
    
    DOM.cgComponentsList.innerHTML = '';
    const components = group.components || [];
    if (components.length > 0) {
        components.forEach(c => {
            const componentName = localComponentNames.find(cn => cn.id === c.componentNameId)?.name || 'Không rõ';
            const tr = document.createElement('tr');
            tr.dataset.cnid = c.componentNameId;
            tr.innerHTML = `
                <td data-label="Tên">${componentName}</td>
                <td data-label="Số lượng" class="text-center">${c.qty}</td>
                <td data-label="Xóa" class="text-center">
                    <button class="remove-cg-component-btn" data-cnid="${c.componentNameId}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            DOM.cgComponentsList.appendChild(tr);
        });
    } else {
        DOM.cgComponentsList.innerHTML = `<tr><td colspan="3" class="text-center" style="padding: 1rem; color: var(--text-light)">Chưa có chi tiết nào được thêm.</td></tr>`;
    }
}

DOM.componentGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) return;
    const name = DOM.componentGroupNameInput.value.trim();
    if (!name) return;

    const data = { name };
    const id = DOM.componentGroupIdInput.value;

    try {
        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/componentGroups`, id), data);
            showToast('Cập nhật nhóm thành công!', 'success');
        } else {
            const docRef = await addDoc(componentGroupsCollectionRef, { ...data, components: [] });
            showToast('Thêm nhóm thành công!', 'success');
            currentEditingComponentGroupId = docRef.id;
        }
        resetComponentGroupForm();
        renderComponentGroups(localComponentGroups);
        renderComponentGroupEditor();
    } catch (error) {
        showToast('Đã có lỗi xảy ra.', 'error');
        console.error("Error adding/updating component group:", error);
    }
});

DOM.componentGroupsList.addEventListener('click', async e => {
    const item = e.target.closest('.config-list-item');
    const deleteBtn = e.target.closest('.delete-cg-btn');

    if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        const group = localComponentGroups.find(p => p.id === id);
        const confirmed = await showConfirm(`Bạn có chắc muốn xóa nhóm "${group.name}"?`);
        if (confirmed) {
            await deleteDoc(doc(db, `users/${currentUserId}/componentGroups`, id));
            if (currentEditingComponentGroupId === id) {
                currentEditingComponentGroupId = null;
                DOM.componentGroupEditor.classList.add('hidden');
            }
            showToast("Xóa nhóm thành công", "success");
        }
        return;
    }
    
    if (item) {
        currentEditingComponentGroupId = item.dataset.id;
        const group = localComponentGroups.find(p => p.id === currentEditingComponentGroupId);
        if (group) {
            DOM.componentGroupIdInput.value = group.id;
            DOM.componentGroupNameInput.value = group.name;
            DOM.componentGroupForm.querySelector('button[type="submit"]').textContent = 'Cập nhật';
            DOM.cancelComponentGroupEditBtn.classList.remove('hidden');
        }
        renderComponentGroups(localComponentGroups);
        renderComponentGroupEditor();
    }
});

DOM.cancelComponentGroupEditBtn.addEventListener('click', () => {
    resetComponentGroupForm();
    currentEditingComponentGroupId = null;
    renderComponentGroups(localComponentGroups);
    DOM.componentGroupEditor.classList.add('hidden');
});

function resetComponentGroupForm() {
    DOM.componentGroupForm.reset();
    DOM.componentGroupIdInput.value = '';
    DOM.componentGroupForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Mới';
    DOM.cancelComponentGroupEditBtn.classList.add('hidden');
}

DOM.cgComponentAddBtn.addEventListener('click', async () => {
    const group = localComponentGroups.find(g => g.id === currentEditingComponentGroupId);
    if (!group) return;
    
    const componentNameId = DOM.cgComponentAddCombobox.querySelector('.combobox-value').value;
    const qty = parseInt(DOM.cgComponentAddQtyInput.value);
    
    if (!componentNameId || !qty || qty < 1) {
        showToast('Vui lòng chọn chi tiết và nhập số lượng hợp lệ.', 'error');
        return;
    }
    
    const newComponents = JSON.parse(JSON.stringify(group.components || []));
    const existing = newComponents.find(c => c.componentNameId === componentNameId);

    if (existing) {
        existing.qty = qty; 
    } else {
        newComponents.push({ componentNameId, qty });
    }
    
    await updateDoc(doc(db, `users/${currentUserId}/componentGroups`, group.id), { components: newComponents });
    showToast('Đã thêm/cập nhật chi tiết vào nhóm.', 'success');

    DOM.cgComponentAddQtyInput.value = '1';
    if(DOM.cgComponentAddCombobox.setValue) DOM.cgComponentAddCombobox.setValue('');
});

DOM.cgComponentsList.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('.remove-cg-component-btn');
    if (deleteBtn) {
        const group = localComponentGroups.find(g => g.id === currentEditingComponentGroupId);
        if (!group) return;
        const componentNameIdToRemove = deleteBtn.dataset.cnid;
        const newComponents = (group.components || []).filter(c => c.componentNameId !== componentNameIdToRemove);
        await updateDoc(doc(db, `users/${currentUserId}/componentGroups`, group.id), { components: newComponents });
        showToast('Đã xóa chi tiết khỏi nhóm.', 'success');
    }
});



// --- Populate Dropdowns ---
function populateProductTypeDropdown() {
    DOM.itemTypeSelect.innerHTML = '<option value="">-- Chọn loại sản phẩm --</option>';
    localProductTypes.forEach(pt => {
        const option = document.createElement('option');
        option.value = pt.id;
        option.textContent = pt.name;
        DOM.itemTypeSelect.appendChild(option);
    });
}

function populateComboboxes() {
    const allAccessoryMaterials = [ ...localMaterials['Phụ kiện'], ...localMaterials['Gia Công'], ...localMaterials['Cạnh'] ];

    if (DOM.mainMaterialWoodCombobox?.updateComboboxData) DOM.mainMaterialWoodCombobox.updateComboboxData(localMaterials['Ván']);
    if (DOM.mainMaterialBackPanelCombobox?.updateComboboxData) DOM.mainMaterialBackPanelCombobox.updateComboboxData(localMaterials['Ván']);
    if (DOM.mainMaterialAccessoriesCombobox?.updateComboboxData) DOM.mainMaterialAccessoriesCombobox.updateComboboxData(allAccessoryMaterials);
    if (DOM.edgeMaterialCombobox?.updateComboboxData) DOM.edgeMaterialCombobox.updateComboboxData(localMaterials['Cạnh']);
    if (DOM.addGroupCombobox?.updateComboboxData) DOM.addGroupCombobox.updateComboboxData(localComponentGroups);
}


// --- Accessory Management ---
DOM.addAccessoryBtn.addEventListener('click', () => {
    const selectedId = DOM.mainMaterialAccessoriesCombobox.querySelector('.combobox-value').value;
    const quantity = parseFloat(DOM.accessoryQuantityInput.value);

    if (!selectedId || !quantity || quantity <= 0) {
        showToast('Vui lòng chọn vật tư và nhập số lượng hợp lệ.', 'error');
        return;
    }

    const material = allLocalMaterials.find(a => a.id === selectedId);
     if (!material) {
        showToast('Lỗi: Không tìm thấy vật tư đã chọn.', 'error');
        return;
    }

    const existing = addedAccessories.find(a => a.id === selectedId);

    if (existing) existing.quantity += quantity;
    else addedAccessories.push({ ...material, quantity });
    
    renderAccessories();
    DOM.accessoryQuantityInput.value = '1';
    if (DOM.mainMaterialAccessoriesCombobox.setValue) DOM.mainMaterialAccessoriesCombobox.setValue('');
    runFullCalculation();
});

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

function clearInputs() {
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

// --- Calculation Logic ---
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
    NHIỆM VỤ: Bạn là một trợ lý AI chuyên nghiệp cho xưởng mộc, chuyên tối ưu hóa sản xuất.
    BỐI CẢNH: Người dùng đang thiết kế một sản phẩm nội thất và cần tối ưu sơ đồ cắt ván.
    DỮ LIỆU ĐẦU VÀO:
    - Thông tin sản phẩm: ${JSON.stringify(productInfoForAI)}
    - Danh sách các miếng ván chính cần cắt (JSON): ${JSON.stringify(mainWoodPieces.map(({type, ...rest}) => rest))}

    HƯỚNG DẪN THỰC HIỆN:
    1.  **Sơ đồ cắt ván (Bin Packing) cho VÁN CHÍNH:**
        - Nếu danh sách miếng ván trống, trả về một đối tượng "cuttingLayout" rỗng.
        - Kích thước tấm ván tiêu chuẩn là 1220mm x 2440mm.
        - Sắp xếp các miếng ván vào tấm ván tiêu chuẩn (1220mm x 2440mm). Thuật toán nên ưu tiên đặt chiều dài của miếng ván dọc theo chiều dài (2440mm) của tấm ván. Cho phép xoay các miếng ván 90 độ nếu cần thiết để tối ưu hóa không gian.
        - Trả về kết quả trong đối tượng JSON có tên "cuttingLayout".

    2.  **ĐỊNH DẠNG ĐẦU RA (QUAN TRỌNG):**
        - Chỉ trả về một đối tượng JSON duy nhất.
        - Đối tượng JSON này phải chứa "cuttingLayout".
        - Không thêm bất kỳ văn bản, giải thích, hay ghi chú nào khác bên ngoài đối tượng JSON.
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

    // 1. Main Wood Cost
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const mainWoodMaterial = localMaterials['Ván'].find(m => m.id === mainWoodId);
    let totalSheetsUsed = 0;
    
    // Use AI result if available, otherwise estimate locally
    if(lastGeminiResult?.cuttingLayout?.totalSheetsUsed > 0) {
        totalSheetsUsed = lastGeminiResult.cuttingLayout.totalSheetsUsed;
    } else {
        const mainWoodPieces = getPanelPiecesForAI();
        if (mainWoodPieces.length > 0 && mainWoodMaterial) {
            const totalAreaM2 = mainWoodPieces.reduce((sum, p) => sum + (p.width * p.height), 0) / 1000000;
            const sheetAreaM2 = getSheetArea(mainWoodMaterial);
            totalSheetsUsed = Math.ceil(totalAreaM2 / sheetAreaM2);
        }
    }

    if (mainWoodMaterial && totalSheetsUsed > 0) {
        const cost = totalSheetsUsed * mainWoodMaterial.price;
        baseMaterialCost += cost;
        const reason = lastGeminiResult?.cuttingLayout 
            ? `${totalSheetsUsed} tấm (tối ưu AI) x ${mainWoodMaterial.price.toLocaleString('vi-VN')}đ`
            : `${totalSheetsUsed} tấm (ước tính) x ${mainWoodMaterial.price.toLocaleString('vi-VN')}đ`;
        costBreakdownItems.push({
            name: `Ván chính: ${mainWoodMaterial.name}`,
            cost: cost,
            reason: reason
        });
    }

    // 2. Back Panel Cost
    const backPanelId = DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value;
    const backPanelPieces = productComponents.filter(p => p.name.toLowerCase().includes('hậu'));
    if (backPanelId && backPanelPieces.length > 0) {
        const backPanelMaterial = localMaterials['Ván'].find(m => m.id === backPanelId);
        if (backPanelMaterial) {
            const totalBackPanelArea = backPanelPieces.reduce((sum, p) => sum + (p.length * p.width * p.qty), 0) / 1000000;
            const sheetAreaM2 = getSheetArea(backPanelMaterial);
            const sheetsNeeded = Math.ceil(totalBackPanelArea / sheetAreaM2);
            if(sheetsNeeded > 0) {
                const cost = sheetsNeeded * backPanelMaterial.price;
                baseMaterialCost += cost;
                costBreakdownItems.push({
                    name: `Ván hậu: ${backPanelMaterial.name}`,
                    cost: cost,
                    reason: `Ước tính ${sheetsNeeded} tấm`
                });
            }
        }
    }
    
    // 3. Edge Banding Cost
    const totalEdgeLengthMM = calculateEdgeBanding();
    const edgeMaterialId = DOM.edgeMaterialCombobox.querySelector('.combobox-value').value;
    const edgeMaterial = localMaterials['Cạnh'].find(m => m.id === edgeMaterialId);

    if (totalEdgeLengthMM > 0 && edgeMaterial) {
        const lengthInMeters = totalEdgeLengthMM / 1000;
        const cost = lengthInMeters * edgeMaterial.price;
        baseMaterialCost += cost;
        costBreakdownItems.push({
            name: `Nẹp cạnh: ${edgeMaterial.name}`,
            cost: cost,
            reason: `${lengthInMeters.toFixed(2)}m x ${edgeMaterial.price.toLocaleString('vi-VN')}đ/m`
        });
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
    
    // Multiply final results by product quantity
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
        // Store the single-item price in the results for saving
        lastGeminiResult.finalPrices = { totalCost, suggestedPrice, estimatedProfit, costBreakdown: costBreakdownItems };
    }
}

const runFullCalculation = debounce(calculateAndDisplayFinalPrice, 400);

DOM.analyzeBtn.addEventListener('click', async () => {
    if (!currentUserId) { showToast('Vui lòng đăng nhập để sử dụng tính năng này.', 'error'); return; }
    if (!DOM.itemNameInput.value.trim()) { showToast('Vui lòng nhập Tên sản phẩm / dự án.', 'error'); return; }
    if (!DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value) { showToast('Vui lòng chọn vật liệu Ván chính.', 'error'); return; }
    await runAICuttingOptimization();
});


// --- Saved Items Management ---
function listenForSavedItems() {
    if (unsubscribeSavedItems) unsubscribeSavedItems();
    unsubscribeSavedItems = onSnapshot(savedItemsCollectionRef, snapshot => {
        localSavedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSavedItems(localSavedItems);
    }, console.error);
}

function renderSavedItems(items) {
    DOM.savedItemsTableBody.innerHTML = '';
    if (items.length === 0) {
        DOM.savedItemsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 1rem; color: var(--text-light);">Chưa có dự án nào được lưu.</td></tr>`;
        return;
    }
    items.sort((a, b) => (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0));

    items.forEach(item => {
        const tr = document.createElement('tr');
        const itemName = item?.inputs?.name || 'Dự án không tên';
        const createdAt = item?.createdAt ? new Date(item.createdAt.toDate()).toLocaleString('vi-VN') : 'Không rõ';
        const quantity = item?.inputs?.quantity || 1;

        // Calculate total prices based on saved quantity
        const singleItemPrice = item.finalPrices?.suggestedPrice || 0;
        const singleItemCost = item.finalPrices?.totalCost || 0;
        const singleItemProfit = item.finalPrices?.estimatedProfit || 0;

        const totalSuggestedPrice = singleItemPrice * quantity;
        const totalCost = singleItemCost * quantity;
        const totalProfit = singleItemProfit * quantity;

        tr.innerHTML = `
            <td data-label="Tên dự án">
                ${itemName}
                ${quantity > 1 ? `<span class="tag-type" style="margin-left: 0.5rem;">SL: ${quantity}</span>` : ''}
            </td>
            <td data-label="Giá Bán" class="font-semibold">${totalSuggestedPrice.toLocaleString('vi-VN')}đ</td>
            <td data-label="Chi Phí">${totalCost.toLocaleString('vi-VN')}đ</td>
            <td data-label="Lợi Nhuận">${totalProfit.toLocaleString('vi-VN')}đ</td>
            <td data-label="Ngày tạo">${createdAt}</td>
            <td data-label="Thao tác" class="text-center">
                <button class="load-btn text-green-500 hover:text-green-700 mr-2" data-id="${item.id}" title="Tải lại dự án này"><i class="fas fa-upload"></i></button>
                <button class="view-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${item.id}" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                <button class="delete-saved-item-btn text-red-500 hover:text-red-700" data-id="${item.id}" title="Xóa dự án"><i class="fas fa-trash"></i></button>
            </td>
        `;
        DOM.savedItemsTableBody.appendChild(tr);
    });
}


DOM.saveItemBtn.addEventListener('click', async () => {
    if (!currentUserId || !lastGeminiResult?.finalPrices) {
        showToast('Không có kết quả phân tích để lưu.', 'error');
        return;
    }
    
    const itemData = {
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
        finalPrices: lastGeminiResult.finalPrices, // Always save the single-item price
        createdAt: serverTimestamp()
    };
    
    try {
        await addDoc(savedItemsCollectionRef, itemData);
        showToast('Lưu dự án thành công!', 'success');
        clearInputs();
    } catch (error) {
        showToast('Lỗi khi lưu dự án.', 'error');
        console.error("Error saving item:", error);
    }
});

DOM.savedItemsTableBody.addEventListener('click', async e => {
    const viewBtn = e.target.closest('.view-btn');
    const deleteBtn = e.target.closest('.delete-saved-item-btn');
    const loadBtn = e.target.closest('.load-btn');

    if (loadBtn) {
        const itemToLoad = localSavedItems.find(i => i.id === loadBtn.dataset.id);
        if (itemToLoad) loadItemIntoForm(itemToLoad);
    } else if (viewBtn) {
        renderItemDetailsToModal(viewBtn.dataset.id);
    } else if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa dự án này?');
        if (confirmed) {
            await deleteDoc(doc(db, `users/${currentUserId}/savedItems`, id));
            showToast('Xóa dự án thành công.', 'success');
        }
    }
});


function loadItemIntoForm(item) {
    clearInputs();
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


function renderItemDetailsToModal(itemId) {
    const item = localSavedItems.find(i => i.id === itemId);
    if (!item) return;

    const { inputs = {}, finalPrices = {}, cuttingLayout = {} } = item;
    const costBreakdown = finalPrices.costBreakdown || [];
    const quantity = parseInt(inputs.quantity) || 1;
    
    // Calculate final prices based on quantity
    const finalSuggestedPrice = (finalPrices.suggestedPrice || 0) * quantity;
    const finalTotalCost = (finalPrices.totalCost || 0) * quantity;
    const finalEstimatedProfit = (finalPrices.estimatedProfit || 0) * quantity;

    DOM.viewItemTitle.textContent = `Chi tiết dự án: ${inputs.name || 'Không tên'}`;
    const mainWood = allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Không rõ';
    const backPanel = allLocalMaterials.find(m => m.id === inputs.backPanelId)?.name || 'Dùng ván chính';
    
    const accessoriesHtml = (inputs.accessories && inputs.accessories.length > 0)
        ? '<ul>' + inputs.accessories.map(a => `<li>${a.name} (SL: ${a.quantity} ${a.unit})</li>`).join('') + '</ul>'
        : '<p>Không có phụ kiện nào.</p>';
    
    const tempContainer = document.createElement('div');
    renderCostBreakdown(costBreakdown, tempContainer);
    const breakdownHtml = tempContainer.innerHTML || '<p>Không có phân tích chi phí.</p>';

    const tempLayoutContainer = document.createElement('div');
    tempLayoutContainer.className = 'cutting-layout-container in-modal';
    const tempSummary = document.createElement('div');
    renderCuttingLayout(cuttingLayout, tempLayoutContainer, tempSummary);
    const layoutHtml = (cuttingLayout?.sheets?.length > 0)
        ? tempSummary.innerHTML + tempLayoutContainer.innerHTML
        : '<p>Không có sơ đồ cắt ván.</p>';

    DOM.viewItemContent.innerHTML = `
        <div class="final-price-recommendation">
            <div class="final-price-main">
                <div class="final-price-label">Giá Bán Đề Xuất (Tổng cho ${quantity} sản phẩm)</div>
                <div class="final-price-value">${finalSuggestedPrice.toLocaleString('vi-VN')}đ</div>
            </div>
            <div class="final-price-breakdown">
                <div>
                    <span class="breakdown-label">Tổng Chi Phí</span>
                    <span class="breakdown-value">${finalTotalCost.toLocaleString('vi-VN')}đ</span>
                </div>
                <div>
                    <span class="breakdown-label">Lợi Nhuận</span>
                    <span class="breakdown-value">${finalEstimatedProfit.toLocaleString('vi-VN')}đ</span>
                </div>
                <div>
                    <span class="breakdown-label">Biên Lợi Nhuận</span>
                    <span class="breakdown-value">${inputs.profitMargin || 'N/A'}%</span>
                </div>
            </div>
        </div>
        <div class="modal-details-grid">
            <div class="modal-details-col">
                <h4><i class="fas fa-ruler-combined"></i>Thông số & Vật tư chính (1 sản phẩm)</h4>
                <ul>
                    <li><strong>Kích thước (D x R x C):</strong> ${inputs.length || 'N/A'} x ${inputs.width || 'N/A'} x ${inputs.height || 'N/A'} mm</li>
                    <li><strong>Ván chính:</strong> ${mainWood}</li>
                    <li><strong>Ván hậu:</strong> ${backPanel}</li>
                    <li><strong>Chi phí nhân công:</strong> ${(Number(inputs.laborCost) || 0).toLocaleString('vi-VN')}đ</li>
                </ul>
                <h4><i class="fas fa-cogs"></i>Phụ kiện & Vật tư khác (1 sản phẩm)</h4>
                ${accessoriesHtml}
            </div>
            <div class="modal-details-col">
                ${breakdownHtml}
                <div class="result-box">
                    <h3 class="result-box-header"><i class="fas fa-th-large"></i> Sơ đồ Cắt ván Gợi ý (1 sản phẩm)</h3>
                    ${layoutHtml}
                </div>
            </div>
        </div>
    `;
    openModal(DOM.viewItemModal);
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeModals();
    initializeImageUploader(
        (imageData, imageSrc) => {
            uploadedImage = imageData;
        },
        () => {
            uploadedImage = null;
        }
    );
    initializeMathInput('.input-style[type="text"][inputmode="decimal"]');
    
    // Main form Comboboxes
    initializeCombobox(DOM.mainMaterialWoodCombobox, [], () => { updateComponentCalculationsAndRender(); runFullCalculation(); }, { placeholder: "Tìm hoặc chọn ván chính..." });
    initializeCombobox(DOM.mainMaterialBackPanelCombobox, [], runFullCalculation, { placeholder: "Tìm ván hậu...", allowEmpty: true, emptyOptionText: 'Dùng chung ván chính' });
    initializeCombobox(DOM.edgeMaterialCombobox, [], runFullCalculation, { placeholder: "Tìm hoặc chọn loại nẹp..." });
    initializeCombobox(DOM.mainMaterialAccessoriesCombobox, [], null, { placeholder: "Tìm phụ kiện, gia công, nẹp..." });
    initializeCombobox(DOM.addGroupCombobox, [], null, { placeholder: "Tìm một cụm chi tiết..." });

    // Config tab Comboboxes
    initializeCombobox(DOM.ptComponentAddCombobox, [], null, { placeholder: "Tìm chi tiết để thêm..." });
    initializeCombobox(DOM.cgComponentAddCombobox, [], null, { placeholder: "Tìm chi tiết để thêm..." });

    initializeQuickCalc(localMaterials, showToast);

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
                // Any manual edit to dimensions overrides the formula
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
        productComponents.push({ id: `comp_${Date.now()}`, name: '', length: 0, width: 0, qty: 1, isDefault: false });
        renderProductComponents();
    });

    DOM.addGroupBtn.addEventListener('click', () => {
        const groupId = DOM.addGroupCombobox.querySelector('.combobox-value').value;
        const groupInstanceQty = parseInt(DOM.addGroupQuantityInput.value) || 1;

        if (!groupId) {
            showToast('Vui lòng chọn một cụm để thêm.', 'error');
            return;
        }

        const group = localComponentGroups.find(g => g.id === groupId);
        if (group && group.components) {
            group.components.forEach(template => {
                const nameData = localComponentNames.find(cn => cn.id === template.componentNameId);
                if (nameData) {
                    const newComponent = {
                        id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: nameData.name,
                        length: 0,
                        width: 0,
                        qty: template.qty * groupInstanceQty,
                        componentNameId: template.componentNameId,
                        isDefault: true // Mark as default to allow formula calculation
                    };
                    productComponents.push(newComponent);
                }
            });
            updateComponentCalculationsAndRender();
            showToast(`Đã thêm các chi tiết từ cụm "${group.name}".`, 'success');
            if (DOM.addGroupCombobox.setValue) DOM.addGroupCombobox.setValue('');
            DOM.addGroupQuantityInput.value = '1';
        }
    });

    // Component Name pagination and filter listeners
    if (DOM.cnFilterInput) {
        DOM.cnFilterInput.addEventListener('input', debounce(() => {
            cnCurrentPage = 1;
            displayComponentNames();
        }, 300));
    }
    if(DOM.cnPrevPageBtn) {
        DOM.cnPrevPageBtn.addEventListener('click', () => { if (cnCurrentPage > 1) { cnCurrentPage--; displayComponentNames(); } });
    }
    if(DOM.cnNextPageBtn) {
        DOM.cnNextPageBtn.addEventListener('click', () => {
            const totalPages = parseInt(DOM.cnPaginationControls.dataset.totalPages, 10) || 1;
            if (cnCurrentPage < totalPages) { 
                cnCurrentPage++; 
                displayComponentNames(); 
            }
        });
    }
});