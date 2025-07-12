// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut, setDoc
} from './firebase.js';

import { 
    openModal, closeModal, showConfirm, showToast, updateUIVisibility, 
    initializeImageUploader, initializeTabs, initializeModals, initializeMathInput
} from './ui.js';
import { initializeQuickCalc } from './quick-calc.js';

// --- DOM Elements ---
const logoutBtn = document.getElementById('logout-btn');
const materialForm = document.getElementById('material-form');
const materialsTableBody = document.getElementById('materials-table-body');
const savedItemsTableBody = document.getElementById('saved-items-table-body');
const analyzeBtn = document.getElementById('analyze-btn');
const saveItemBtn = document.getElementById('save-item-btn');
const addAccessoryBtn = document.getElementById('add-accessory-btn');
const accessoriesList = document.getElementById('accessories-list');
const priceSummaryContainer = document.getElementById('price-summary-container');
const totalCostValue = document.getElementById('total-cost-value');
const suggestedPriceValue = document.getElementById('suggested-price-value');
const estimatedProfitValue = document.getElementById('estimated-profit-value');
const costBreakdownContainer = document.getElementById('cost-breakdown-container');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessagesContainer = document.getElementById('chat-messages');
const viewItemModal = document.getElementById('view-item-modal');
const viewItemTitle = document.getElementById('view-item-title');
const viewItemContent = document.getElementById('view-item-content');
const cuttingLayoutSection = document.getElementById('cutting-layout-section');
let cuttingLayoutContainer = document.getElementById('cutting-layout-container');
let cuttingLayoutSummary = document.getElementById('cutting-layout-summary');
const aiAnalysisSection = document.getElementById('ai-analysis-section');
const analyzeImageBtn = document.getElementById('analyze-image-btn');
const imageAnalysisContainer = document.getElementById('image-analysis-container');
const aiConfigPrompt = document.getElementById('ai-config-prompt');
const aiConfigBtn = document.getElementById('ai-config-btn');
const materialFilterInput = document.getElementById('material-filter-input');
const materialSortSelect = document.getElementById('material-sort-select');


// --- Global State ---
let currentUserId = null;
let materialsCollectionRef = null;
let savedItemsCollectionRef = null;
let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [] };
let allLocalMaterials = []; // Flat array for filtering and sorting
let localSavedItems = [];
let lastGeminiResult = null;
let addedAccessories = [];
let uploadedImage = null;
let chatHistory = [];
let isAwaitingChatResponse = false;
let calculationState = 'idle'; // idle, calculating, done

// --- Sample Data for New Users ---
const sampleMaterials = [
    { name: 'Ván MDF An Cường chống ẩm 17mm', type: 'Ván', price: 550000, unit: 'tấm', notes: 'Khổ 1220x2440mm' },
    { name: 'Ván HDF siêu chống ẩm 17mm', type: 'Ván', price: 780000, unit: 'tấm', notes: 'Khổ 1220x2440mm' },
    { name: 'Ván Plywood 9mm', type: 'Ván', price: 250000, unit: 'tấm', notes: 'Làm hậu tủ' },
    { name: 'Nẹp chỉ PVC An Cường 1mm', type: 'Cạnh', price: 5000, unit: 'mét', notes: 'Cùng màu ván' },
    { name: 'Bản lề hơi Ivan giảm chấn', type: 'Phụ kiện', price: 15000, unit: 'cái', notes: 'Loại thẳng' },
    { name: 'Ray bi 3 tầng', type: 'Phụ kiện', price: 45000, unit: 'cặp', notes: 'Dài 45cm' },
    { name: 'Cam chốt liên kết', type: 'Phụ kiện', price: 500, unit: 'bộ', notes: 'Chất lượng tốt' },
    { name: 'Tay nắm âm', type: 'Phụ kiện', price: 25000, unit: 'cái', notes: 'Màu đen' },
];

async function addSampleData(userId) {
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
            showToast('Đã thêm dữ liệu vật tư mẫu cho bạn!', 'info');
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
        await checkAndAddSampleData(currentUserId);
        initializeChat();
        listenForData();
    } else {
        currentUserId = null;
        if (unsubscribeMaterials) unsubscribeMaterials();
        if (unsubscribeSavedItems) unsubscribeSavedItems();
        clearLocalData();
    }
    updateUIVisibility(loggedIn, user);
    document.getElementById('initial-loader').style.opacity = '0';
    setTimeout(() => document.getElementById('initial-loader').style.display = 'none', 300);
});

function listenForData() {
    listenForMaterials();
    listenForSavedItems();
}

function clearLocalData() {
    localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [] };
    allLocalMaterials = [];
    localSavedItems = [];
    chatHistory = [];
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = '';
    renderMaterials([]);
    renderSavedItems([]);
    populateSelects();
}

logoutBtn.addEventListener('click', () => signOut(auth));

// --- Helper & Renderer Functions ---

function getPanelPieces() {
    const length = parseFloat(document.getElementById('item-length').value) || 0;
    const width = parseFloat(document.getElementById('item-width').value) || 0;
    const height = parseFloat(document.getElementById('item-height').value) || 0;
    const compartments = parseInt(document.getElementById('item-compartments').value, 10) || 1;
    const type = document.getElementById('item-type').value;
    const backPanelSelect = document.getElementById('material-back-panel');
    const usesMainWoodForBack = !backPanelSelect.value || backPanelSelect.value === '';

    const pieces = [];
    if (!length || !width || !height) return [];

    // Main box structure
    pieces.push({ name: 'Hông Trái', width: width, height: height, type: 'body' });
    pieces.push({ name: 'Hông Phải', width: width, height: height, type: 'body' });
    pieces.push({ name: 'Đáy', width: length, height: width, type: 'body' });
    
    if (type !== 'tu-bep-duoi') {
        pieces.push({ name: 'Nóc', width: length, height: width, type: 'body' });
    }

    // Dividers and Doors based on compartments
    if (type.includes('tu-') && compartments > 0) {
        // Add internal dividers if more than one compartment
        if (compartments > 1) {
            const numDividers = compartments - 1;
            for (let i = 0; i < numDividers; i++) {
                pieces.push({ name: `Vách Ngăn ${i + 1}`, width: width, height: height, type: 'body' });
            }
        }
        // Add doors, one for each compartment
        const doorWidth = Math.round(length / compartments);
        for (let i = 0; i < compartments; i++) {
             pieces.push({ name: `Cánh ${i + 1}`, width: doorWidth, height: height, type: 'door' });
        }
    }
    
    // Back panel
    if (usesMainWoodForBack && type !== 'tu-ao' && type !== 'khac') {
        pieces.push({ name: 'Hậu', width: length, height: height, type: 'body' });
    }

    return pieces.filter(p => p.width > 0 && p.height > 0).map(p => ({...p, width: Math.round(p.width), height: Math.round(p.height)}));
}


// REFACTORED: Takes container elements as arguments to avoid global side-effects.
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

function renderFormattedText(text) {
    // This is a simplified version. For full markdown, a library would be better.
    // It handles bold and newlines.
    const sections = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .split(/(\*\*.*?\*\*)/g); 
        
    return sections.map(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return `<strong>${part.slice(2, -2)}</strong>`;
        }
        return part.replace(/\n/g, '<br>');
    }).join('');
}


// --- Materials Management ---
function listenForMaterials() {
    if (unsubscribeMaterials) unsubscribeMaterials(); 
    unsubscribeMaterials = onSnapshot(materialsCollectionRef, snapshot => {
        // Clear categorized object for dropdowns
        localMaterials['Ván'] = [];
        localMaterials['Cạnh'] = [];
        localMaterials['Phụ kiện'] = [];
        
        snapshot.docs.forEach(doc => {
            const material = { id: doc.id, ...doc.data() };
            if (localMaterials[material.type]) {
                localMaterials[material.type].push(material);
            }
        });

        // Update the flat array used for the main list view
        allLocalMaterials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        displayMaterials(); // Render with current filters/sort
        populateSelects();  // Update all dropdowns in the app
    }, console.error);
}


/**
 * Applies current filter and sort options and then renders the material list.
 */
function displayMaterials() {
    let materialsToRender = [...allLocalMaterials];
    const filterText = materialFilterInput.value.toLowerCase().trim();
    const sortBy = materialSortSelect.value;

    // 1. Filter
    if (filterText) {
        materialsToRender = materialsToRender.filter(m => 
            m.name.toLowerCase().includes(filterText) || 
            (m.notes && m.notes.toLowerCase().includes(filterText))
        );
    }

    // 2. Sort
    switch (sortBy) {
        case 'name-asc':
            materialsToRender.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
            break;
        case 'name-desc':
            materialsToRender.sort((a, b) => b.name.localeCompare(a.name, 'vi'));
            break;
        case 'price-asc':
            materialsToRender.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            materialsToRender.sort((a, b) => b.price - a.price);
            break;
        case 'type':
            materialsToRender.sort((a, b) => a.type.localeCompare(b.type, 'vi') || a.name.localeCompare(b.name, 'vi'));
            break;
    }
    
    // 3. Render
    renderMaterials(materialsToRender);
}

materialFilterInput.addEventListener('input', displayMaterials);
materialSortSelect.addEventListener('change', displayMaterials);


function renderMaterials(materials) {
    materialsTableBody.innerHTML = '';
    if (materials.length === 0) {
        materialsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-light);">Không tìm thấy vật tư nào.</td></tr>`;
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
        materialsTableBody.appendChild(tr);
    });
}

materialForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUserId) return;
    const materialData = {
        name: materialForm['material-name'].value,
        type: materialForm['material-type'].value,
        price: Number(materialForm['material-price'].value),
        unit: materialForm['material-unit'].value,
        notes: materialForm['material-notes'].value
    };
    const id = materialForm['material-id'].value;
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

materialsTableBody.addEventListener('click', async e => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    if (editBtn) {
        const id = editBtn.dataset.id;
        // Use the flat array to find the material
        const material = allLocalMaterials.find(m => m.id === id);
        if (material) {
            materialForm['material-id'].value = id;
            materialForm['material-name'].value = material.name;
            materialForm['material-type'].value = material.type;
            materialForm['material-price'].value = material.price;
            materialForm['material-unit'].value = material.unit;
            materialForm['material-notes'].value = material.notes;
            materialForm.querySelector('button[type="submit"]').textContent = 'Cập nhật Vật tư';
            document.getElementById('cancel-edit-button').classList.remove('hidden');
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

document.getElementById('cancel-edit-button').addEventListener('click', resetMaterialForm);

function resetMaterialForm() {
    materialForm.reset();
    materialForm['material-id'].value = '';
    materialForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Vật tư';
    document.getElementById('cancel-edit-button').classList.add('hidden');
}

function populateSelects() {
    const allSelects = [
        // Main calculator selects
        { el: document.getElementById('material-wood'), type: 'Ván' },
        { el: document.getElementById('material-door'), type: 'Ván', optional: true, optionalText: 'Dùng chung ván chính' },
        { el: document.getElementById('material-back-panel'), type: 'Ván', optional: true, optionalText: 'Dùng chung ván chính' },
        { el: document.getElementById('material-edge'), type: 'Cạnh' },
        { el: document.getElementById('material-accessories'), type: 'Phụ kiện' },
        // Quick Calc Selects
        { el: document.getElementById('qc-material-wood'), type: 'Ván' },
        { el: document.getElementById('qc-material-wood-2'), type: 'Ván', optional: true, optionalText: '--- Không chọn ---' },
        { el: document.getElementById('qc-material-edge'), type: 'Cạnh' },
        { el: document.getElementById('qc-accessory-hinge'), type: 'Phụ kiện', optional: true, optionalText: '--- Không chọn ---' },
        { el: document.getElementById('qc-accessory-slide'), type: 'Phụ kiện', optional: true, optionalText: '--- Không chọn ---' },
        { el: document.getElementById('qc-accessory-cam'), type: 'Phụ kiện', optional: true, optionalText: '--- Không chọn ---' },
        { el: document.getElementById('qc-accessory-handle'), type: 'Phụ kiện', optional: true, optionalText: '--- Không chọn ---' },
    ];

    allSelects.forEach(s => {
        if (!s.el) return; // Guard if element doesn't exist
        const currentVal = s.el.value;
        s.el.innerHTML = '';

        if (s.optional) {
            s.el.add(new Option(s.optionalText, ''));
        }

        localMaterials[s.type].forEach(m => s.el.add(new Option(`${m.name} (${Number(m.price).toLocaleString('vi-VN')}đ)`, m.id)));
        
        if (currentVal) {
            const optionExists = Array.from(s.el.options).some(opt => opt.value === currentVal);
            if (optionExists) {
                s.el.value = currentVal;
            }
        }
    });
}

// --- Accessory Management ---
addAccessoryBtn.addEventListener('click', () => {
    const accessorySelect = document.getElementById('material-accessories');
    const quantityInput = document.getElementById('accessory-quantity');
    const selectedId = accessorySelect.value;
    const quantity = parseInt(quantityInput.value);

    if (!selectedId || !quantity || quantity <= 0) {
        showToast('Vui lòng chọn phụ kiện và nhập số lượng hợp lệ.', 'error');
        return;
    }
    const accessory = localMaterials['Phụ kiện'].find(a => a.id === selectedId);
    const existing = addedAccessories.find(a => a.id === selectedId);

    if (existing) {
        existing.quantity += quantity;
    } else {
        addedAccessories.push({ ...accessory, quantity });
    }
    renderAccessories();
    quantityInput.value = '1';

    // Recalculate price if analysis is already done
    if (calculationState === 'done') {
        recalculateFinalPrice();
    }
});

function renderAccessories() {
    accessoriesList.innerHTML = '';
    addedAccessories.forEach(acc => {
        const li = document.createElement('li');
        li.dataset.id = acc.id;
        li.innerHTML = `
            <span class="flex-grow">${acc.name}</span>
            <input type="text" inputmode="decimal" value="${acc.quantity}" min="1" class="input-style accessory-list-qty" data-id="${acc.id}">
            <span class="accessory-unit">${acc.unit}</span>
            <button class="remove-acc-btn" data-id="${acc.id}">&times;</button>
        `;
        accessoriesList.appendChild(li);
    });
}

accessoriesList.addEventListener('click', e => {
    if (e.target.classList.contains('remove-acc-btn')) {
        const id = e.target.dataset.id;
        addedAccessories = addedAccessories.filter(a => a.id !== id);
        renderAccessories();
        if (calculationState === 'done') {
            recalculateFinalPrice();
        }
    }
});

accessoriesList.addEventListener('change', e => {
    if (e.target.classList.contains('accessory-list-qty')) {
        const id = e.target.dataset.id;
        const newQuantity = parseInt(e.target.value);
        const accessory = addedAccessories.find(a => a.id === id);
        if (accessory && newQuantity > 0) {
            accessory.quantity = newQuantity;
        } else if (accessory) {
            e.target.value = accessory.quantity; // revert if invalid
        }
        if (calculationState === 'done') {
            recalculateFinalPrice();
        }
    }
});

function clearInputs() {
    document.getElementById('item-length').value = '';
    document.getElementById('item-width').value = '';
    document.getElementById('item-height').value = '';
    document.getElementById('item-name').value = '';
    document.getElementById('product-description').value = '';
    document.getElementById('profit-margin').value = '50';
    document.getElementById('labor-cost').value = '0';
    document.getElementById('item-compartments').value = '1';
    document.getElementById('material-door').value = ''; // Reset door material
    aiConfigPrompt.value = '';
    addedAccessories = [];
    renderAccessories();
    lastGeminiResult = null;
    calculationState = 'idle';
    document.querySelector('#remove-image-btn').click();

    // Reset UI
    updateAnalyzeButton();
    aiAnalysisSection.classList.add('hidden');
    saveItemBtn.disabled = true;
    
    // Reset 3D viewer
    const event = new Event('input');
    document.getElementById('item-length').dispatchEvent(event);
}

// --- Calculation Logic ---
function updateAnalyzeButton() {
    switch(calculationState) {
        case 'idle':
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-microchip"></i> Phân tích & Báo giá với AI';
            break;
        case 'calculating':
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;
            break;
        case 'done':
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-redo"></i> Phân tích lại';
            break;
    }
}

async function runAICalculation() {
    calculationState = 'calculating';
    updateAnalyzeButton();
    aiAnalysisSection.classList.remove('hidden');
    
    const loadingPlaceholder = document.getElementById('ai-loading-placeholder');
    const resultsContent = document.getElementById('ai-results-content');
    loadingPlaceholder.classList.remove('hidden');
    resultsContent.classList.add('hidden');
    
    const inputs = {
        name: document.getElementById('item-name').value,
        length: document.getElementById('item-length').value,
        width: document.getElementById('item-width').value,
        height: document.getElementById('item-height').value,
        type: document.getElementById('item-type').value,
        compartments: document.getElementById('item-compartments').value,
        description: document.getElementById('product-description').value,
    };

    const mainWoodId = document.getElementById('material-wood').value;
    const doorWoodId = document.getElementById('material-door').value;
    const backPanelId = document.getElementById('material-back-panel').value;
    const edgeId = document.getElementById('material-edge').value;

    const mainWood = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const doorWood = localMaterials['Ván'].find(m => m.id === doorWoodId); 
    const backPanel = localMaterials['Ván'].find(m => m.id === backPanelId);
    const edge = localMaterials['Cạnh'].find(m => m.id === edgeId);

    const allPieces = getPanelPieces();
    const useSeparateDoorWood = !!doorWoodId && doorWood && doorWood.id !== mainWood.id;

    let mainWoodPieces = allPieces.filter(p => p.type === 'body');
    let doorPiecesForPrompt = [];

    if (useSeparateDoorWood) {
        doorPiecesForPrompt = allPieces.filter(p => p.type === 'door');
    } else {
        mainWoodPieces.push(...allPieces.filter(p => p.type === 'door'));
    }

    const prompt = `
    NHIỆM VỤ: Bạn là một trợ lý AI chuyên gia cho một xưởng gỗ ở Việt Nam. Mục tiêu của bạn là cung cấp một phân tích chi phí vật liệu chi tiết và một sơ đồ cắt ván chính xác (2D bin packing). TOÀN BỘ PHẢN HỒI PHẢI BẰNG TIẾNG VIỆT.

    DỮ LIỆU ĐẦU VÀO:
    - Tên sản phẩm: ${inputs.name}
    - Kích thước (DxRxC): ${inputs.length} x ${inputs.width} x ${inputs.height} mm
    - Loại sản phẩm: ${inputs.type}
    - Số khoang / số cánh: ${inputs.compartments}
    - Ghi chú của người dùng: ${inputs.description}
    - Vật liệu VÁN CHÍNH (dùng cho Thùng): ${mainWood.name} (${mainWood.price} VND/${mainWood.unit})
    - Vật liệu VÁN CÁNH: ${useSeparateDoorWood ? `${doorWood.name} (${doorWood.price} VND/${doorWood.unit})` : 'Sử dụng chung vật liệu Ván Chính.'}
    - Vật liệu VÁN HẬU: ${backPanel ? `${backPanel.name} (${backPanel.price} VND/${backPanel.unit})` : 'Không có hoặc đã được gộp vào Ván Chính.'}
    - Nẹp cạnh: ${edge.name} (${edge.price} VND/mét)
    - Phụ kiện: ${addedAccessories.map(a => `${a.name} (SL: ${a.quantity}, Đơn giá: ${a.price})`).join(', ')}

    DANH SÁCH CHI TIẾT VÀ VẬT LIỆU TƯƠNG ỨNG (Đây là bản bóc tách chi tiết đã được xử lý):
    - Chi tiết cắt từ VÁN CHÍNH: ${JSON.stringify(mainWoodPieces.map(({type, ...rest}) => rest))}
    - Chi tiết cắt từ VÁN CÁNH (chỉ áp dụng nếu có vật liệu riêng): ${JSON.stringify(doorPiecesForPrompt.map(({type, ...rest}) => rest))}

    HƯỚNG DẪN CHI TIẾT:
    1.  **Sơ đồ cắt ván (Bin Packing) cho VÁN CHÍNH:**
        - Chỉ tạo sơ đồ cắt cho các chi tiết trong danh sách "Chi tiết cắt từ VÁN CHÍNH".
        - Kích thước tấm ván tiêu chuẩn là 1220mm x 2440mm.
        - Thực hiện thuật toán sắp xếp 2D để xếp các miếng này vào số lượng tấm ván tiêu chuẩn ít nhất có thể.
        - Điền kết quả vào đối tượng "cuttingLayout". "totalSheetsUsed" phải là số tấm VÁN CHÍNH cần dùng.

    2.  **Tính toán chi phí vật liệu:**
        - Tạo danh sách chi phí và phân loại chúng vào: "woodCosts", "edgeCosts", "accessoryCosts".
        - **woodCosts**:
            - Tính chi phí Ván chính dựa trên "totalSheetsUsed" đã được tối ưu, nhân với giá VÁN CHÍNH.
            - Nếu có "VÁN CÁNH" riêng, ước tính số tấm cần dùng (tổng diện tích các miếng cánh / diện tích tấm chuẩn, làm tròn lên) và tính chi phí.
            - Nếu có "VÁN HẬU" riêng, tính chi phí cho 1 tấm (giả định cần 1 tấm).
            - Thêm từng mục vào mảng "woodCosts".
        - **edgeCosts**: Tính tổng chi phí nẹp cạnh dựa trên chu vi của TẤT CẢ các miếng (cả ván chính và ván cánh).
        - **accessoryCosts**: Tính chi phí cho từng phụ kiện trong danh sách được cung cấp.
    `;
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, image: uploadedImage })
        });
        
        const data = await response.json();

        if (!response.ok) {
            if (data.error && (data.error.includes('overloaded') || data.error.includes('UNAVAILABLE') || data.error.includes('503'))) {
                showToast('AI đang quá tải, vui lòng thử lại sau giây lát.', 'info');
            } else {
                 throw new Error(data.error || `Lỗi máy chủ: ${response.status}`);
            }
            return;
        }

        lastGeminiResult = data;
        calculationState = 'done';
        
        const { cuttingLayout } = data;
        
        if (cuttingLayout) {
            renderCuttingLayout(cuttingLayout, cuttingLayoutContainer, cuttingLayoutSummary);
            cuttingLayoutSection.classList.remove('hidden');
        } else {
            cuttingLayoutSection.classList.add('hidden');
        }
        
        recalculateFinalPrice(); // Perform initial client-side price calculation
        addDynamicPricingListeners(); // Add listeners for dynamic updates
        
        saveItemBtn.disabled = false;

    } catch (error) {
        console.error("Error calling AI:", error);
        if (error.message.includes('503') || error.message.includes('overloaded')) {
             showToast('AI đang quá tải, vui lòng thử lại sau giây lát.', 'info');
        } else {
             showToast(`Lỗi khi phân tích: ${error.message}`, 'error');
        }
        calculationState = 'idle'; // Revert state
    } finally {
        loadingPlaceholder.classList.add('hidden');
        resultsContent.classList.remove('hidden');
        updateAnalyzeButton();
    }
}

/**
 * Recalculates the final price based on the last AI analysis and current form inputs.
 * This function makes the pricing dynamic without needing another AI call.
 */
function recalculateFinalPrice() {
    if (calculationState !== 'done' || !lastGeminiResult || !lastGeminiResult.costBreakdown) return;

    const { woodCosts, edgeCosts } = lastGeminiResult.costBreakdown;

    // Calculate base cost of wood and edge from the AI's result
    const woodAndEdgeBaseCost = [...(woodCosts || []), ...(edgeCosts || [])].reduce((sum, item) => sum + (item.cost || 0), 0);
    
    // Recalculate accessory costs based on the current client-side list
    const currentAccessoryCostItems = addedAccessories.map(acc => {
        const material = localMaterials['Phụ kiện'].find(m => m.id === acc.id);
        const cost = material ? material.price * acc.quantity : 0;
        return {
            name: `${acc.name} (SL: ${acc.quantity})`,
            cost: cost,
            reason: `Đơn giá: ${material ? material.price.toLocaleString('vi-VN') : 0}đ`
        };
    });
    const currentAccessoryTotalCost = currentAccessoryCostItems.reduce((sum, item) => sum + item.cost, 0);

    const baseMaterialCost = woodAndEdgeBaseCost + currentAccessoryTotalCost;
    
    const laborCost = parseFloat(document.getElementById('labor-cost').value) || 0;
    const profitMargin = parseFloat(document.getElementById('profit-margin').value) || 0;
    
    const totalCost = baseMaterialCost + laborCost;
    const suggestedPrice = totalCost * (1 + profitMargin / 100);
    const estimatedProfit = suggestedPrice - totalCost;
    
    // Update the summary cards
    totalCostValue.textContent = totalCost.toLocaleString('vi-VN') + 'đ';
    suggestedPriceValue.textContent = suggestedPrice.toLocaleString('vi-VN') + 'đ';
    estimatedProfitValue.textContent = estimatedProfit.toLocaleString('vi-VN') + 'đ';
    priceSummaryContainer.classList.remove('hidden');

    // Update the detailed cost breakdown view
    const allCostsForDisplay = [...(woodCosts || []), ...(edgeCosts || []), ...currentAccessoryCostItems];
    renderCostBreakdown(allCostsForDisplay, costBreakdownContainer);

    // Update the lastGeminiResult object to reflect the current state for saving
    lastGeminiResult.costBreakdown.accessoryCosts = currentAccessoryCostItems; // Update with latest
    lastGeminiResult.finalPrices = { totalCost, suggestedPrice, estimatedProfit };
}

let dynamicListenersAdded = false;
function addDynamicPricingListeners() {
    if (dynamicListenersAdded) return;

    const laborCostInput = document.getElementById('labor-cost');
    const profitMarginInput = document.getElementById('profit-margin');
    
    laborCostInput.addEventListener('input', recalculateFinalPrice);
    profitMarginInput.addEventListener('input', recalculateFinalPrice);
    // Accessory changes are handled by their own listeners which now also call recalculateFinalPrice

    dynamicListenersAdded = true;
}


analyzeBtn.addEventListener('click', async () => {
    if (!currentUserId) {
        showToast('Vui lòng đăng nhập để sử dụng tính năng này.', 'error');
        return;
    }
    const itemName = document.getElementById('item-name').value.trim();
    if (!itemName) {
        showToast('Vui lòng nhập Tên sản phẩm / dự án.', 'error');
        return;
    }
     const mainWoodId = document.getElementById('material-wood').value;
    const edgeId = document.getElementById('material-edge').value;
     if (!mainWoodId || !edgeId) {
        showToast('Vui lòng chọn vật liệu Ván chính và Nẹp cạnh.', 'error');
        return;
    }

    await runAICalculation();
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
    savedItemsTableBody.innerHTML = '';
    if (items.length === 0) {
        savedItemsTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 1rem; color: var(--text-light);">Chưa có dự án nào được lưu.</td></tr>`;
        return;
    }
    items.sort((a, b) => (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0));

    items.forEach(item => {
        const tr = document.createElement('tr');
        const itemName = (item && item.inputs && item.inputs.name) || 'Dự án không tên';
        const createdAt = (item && item.createdAt) ? new Date(item.createdAt.toDate()).toLocaleString('vi-VN') : 'Không rõ';
        
        tr.innerHTML = `
            <td data-label="Tên dự án">${itemName}</td>
            <td data-label="Ngày tạo">${createdAt}</td>
            <td data-label="Thao tác" class="text-center">
                <button class="load-btn text-green-500 hover:text-green-700 mr-2" data-id="${item.id}" title="Tải lại dự án này"><i class="fas fa-upload"></i></button>
                <button class="view-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${item.id}" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                <button class="delete-saved-item-btn text-red-500 hover:text-red-700" data-id="${item.id}" title="Xóa dự án"><i class="fas fa-trash"></i></button>
            </td>
        `;
        savedItemsTableBody.appendChild(tr);
    });
}


saveItemBtn.addEventListener('click', async () => {
    if (!currentUserId || !lastGeminiResult) {
        showToast('Không có kết quả phân tích để lưu.', 'error');
        return;
    }
    
    const itemData = {
        inputs: {
            name: document.getElementById('item-name').value,
            length: document.getElementById('item-length').value,
            width: document.getElementById('item-width').value,
            height: document.getElementById('item-height').value,
            type: document.getElementById('item-type').value,
            compartments: document.getElementById('item-compartments').value,
            description: document.getElementById('product-description').value,
            profitMargin: document.getElementById('profit-margin').value,
            laborCost: document.getElementById('labor-cost').value,
            mainWoodId: document.getElementById('material-wood').value,
            doorWoodId: document.getElementById('material-door').value,
            backPanelId: document.getElementById('material-back-panel').value,
            edgeId: document.getElementById('material-edge').value,
            accessories: addedAccessories
        },
        ...lastGeminiResult,
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

savedItemsTableBody.addEventListener('click', async e => {
    const viewBtn = e.target.closest('.view-btn');
    const deleteBtn = e.target.closest('.delete-saved-item-btn');
    const loadBtn = e.target.closest('.load-btn');

    if (loadBtn) {
        const id = loadBtn.dataset.id;
        const itemToLoad = localSavedItems.find(i => i.id === id);
        if (itemToLoad) {
            loadItemIntoForm(itemToLoad);
        } else {
            showToast('Không tìm thấy dự án để tải.', 'error');
        }
    } else if (viewBtn) {
        renderItemDetailsToModal(viewBtn.dataset.id);
    } else if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa dự án này?');
        if (confirmed) {
            try {
                await deleteDoc(doc(db, `users/${currentUserId}/savedItems`, id));
                showToast('Xóa dự án thành công.', 'success');
            } catch (error) {
                showToast('Lỗi khi xóa dự án.', 'error');
                console.error("Error deleting saved item:", error);
            }
        }
    }
});


/**
 * Loads a saved item's data back into the main calculator form.
 * @param {object} item The saved item object from Firestore.
 */
function loadItemIntoForm(item) {
    clearInputs();

    const inputs = item.inputs || {};

    document.getElementById('item-length').value = inputs.length || '';
    document.getElementById('item-width').value = inputs.width || '';
    document.getElementById('item-height').value = inputs.height || '';
    document.getElementById('item-name').value = inputs.name || '';
    document.getElementById('item-type').value = inputs.type || 'khac';
    document.getElementById('item-compartments').value = inputs.compartments || '1';
    document.getElementById('product-description').value = inputs.description || '';
    document.getElementById('profit-margin').value = inputs.profitMargin || '50';
    document.getElementById('labor-cost').value = inputs.laborCost || '0';

    document.getElementById('material-wood').value = inputs.mainWoodId || '';
    document.getElementById('material-door').value = inputs.doorWoodId || '';
    document.getElementById('material-back-panel').value = inputs.backPanelId || '';
    document.getElementById('material-edge').value = inputs.edgeId || '';
    
    if (inputs.accessories && Array.isArray(inputs.accessories)) {
        addedAccessories = JSON.parse(JSON.stringify(inputs.accessories));
        renderAccessories();
    }

    lastGeminiResult = {
        costBreakdown: item.costBreakdown,
        cuttingLayout: item.cuttingLayout,
        finalPrices: item.finalPrices, 
    };

    if(lastGeminiResult) {
        calculationState = 'done';
        saveItemBtn.disabled = false;
        updateAnalyzeButton();
        
        aiAnalysisSection.classList.remove('hidden');
        document.getElementById('ai-results-content').classList.remove('hidden');

        const { cuttingLayout } = lastGeminiResult;
        
        recalculateFinalPrice(); // Recalculate and render prices and breakdown
        
        if (cuttingLayout) {
            renderCuttingLayout(cuttingLayout, cuttingLayoutContainer, cuttingLayoutSummary);
            cuttingLayoutSection.classList.remove('hidden');
        } else {
            cuttingLayoutSection.classList.add('hidden');
        }

        addDynamicPricingListeners();
    }

    const calculatorTabBtn = document.querySelector('button[data-tab="calculator"]');
    if (calculatorTabBtn) calculatorTabBtn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    const event = new Event('input');
    document.getElementById('item-length').dispatchEvent(event);

    showToast('Đã tải dữ liệu dự án. Bạn có thể chỉnh sửa và phân tích lại.', 'info');
}


/**
 * Renders the details of a saved item to a modal.
 * @param {string} itemId The ID of the item to render.
 */
function renderItemDetailsToModal(itemId) {
    const item = localSavedItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Không tìm thấy dự án.', 'error');
        return;
    }

    const inputs = item.inputs || {};
    const costBreakdown = item.costBreakdown || {};
    const cuttingLayout = item.cuttingLayout || {};
    const finalPrices = item.finalPrices || {};
    
    viewItemTitle.textContent = `Chi tiết dự án: ${inputs.name || 'Không tên'}`;
    
    const mainWood = localMaterials['Ván'].find(m => m.id === inputs.mainWoodId)?.name || 'Không rõ';
    const doorWood = localMaterials['Ván'].find(m => m.id === inputs.doorWoodId)?.name || 'Dùng ván chính';
    const backPanel = localMaterials['Ván'].find(m => m.id === inputs.backPanelId)?.name || 'Dùng ván chính';
    const edge = localMaterials['Cạnh'].find(m => m.id === inputs.edgeId)?.name || 'Không rõ';

    let accessoriesHtml = 'Không có';
    if (inputs.accessories && inputs.accessories.length > 0) {
        accessoriesHtml = '<ul>' + inputs.accessories.map(a => `<li>${a.name} (SL: ${a.quantity})</li>`).join('') + '</ul>';
    }

    const allCosts = [
        ...(costBreakdown.woodCosts || []),
        ...(costBreakdown.edgeCosts || []),
        ...(costBreakdown.accessoryCosts || [])
    ];

    let breakdownHtml = '<p>Không có phân tích chi phí.</p>';
    if (allCosts.length > 0) {
        const tempContainer = document.createElement('div');
        renderCostBreakdown(allCosts, tempContainer);
        breakdownHtml = tempContainer.innerHTML;
    }
    
    let layoutHtml = '<p>Không có sơ đồ cắt ván.</p>';
    if (cuttingLayout && cuttingLayout.sheets && cuttingLayout.sheets.length > 0) {
        const tempContainer = document.createElement('div');
        tempContainer.className = 'cutting-layout-container';
        const tempSummary = document.createElement('div');
        renderCuttingLayout(cuttingLayout, tempContainer, tempSummary);
        layoutHtml = tempSummary.innerHTML + tempContainer.innerHTML;
    }

    viewItemContent.innerHTML = `
        <div class="final-price-recommendation">
            <div class="final-price-label">Giá Bán Đề Xuất</div>
            <div class="final-price-value">${(finalPrices.suggestedPrice || 0).toLocaleString('vi-VN')}đ</div>
            <p class="final-price-summary">
                Tổng chi phí: <strong>${(finalPrices.totalCost || 0).toLocaleString('vi-VN')}đ</strong> | 
                Lợi nhuận ước tính: <strong>${(finalPrices.estimatedProfit || 0).toLocaleString('vi-VN')}đ</strong>
            </p>
        </div>

        <h4><i class="fas fa-ruler-combined"></i>Thông số Đầu vào</h4>
        <ul>
            <li><strong>Kích thước (D x R x C):</strong> ${inputs.length || 'N/A'} x ${inputs.width || 'N/A'} x ${inputs.height || 'N/A'} mm</li>
            <li><strong>Chi phí nhân công:</strong> ${(Number(inputs.laborCost) || 0).toLocaleString('vi-VN')}đ</li>
            <li><strong>Lợi nhuận mong muốn:</strong> ${inputs.profitMargin || 'N/A'}%</li>
        </ul>

        <h4><i class="fas fa-boxes"></i>Vật tư Sử dụng</h4>
        <ul>
            <li><strong>Ván chính:</strong> ${mainWood}</li>
            <li><strong>Ván cánh:</strong> ${doorWood}</li>
            <li><strong>Ván hậu:</strong> ${backPanel}</li>
            <li><strong>Nẹp cạnh:</strong> ${edge}</li>
            <li><strong>Phụ kiện:</strong> ${accessoriesHtml}</li>
        </ul>
        
        ${breakdownHtml}
        
        <div class="result-box" style="margin-top: 1.5rem;">
             <h3 class="result-box-header"><i class="fas fa-th-large"></i> Sơ đồ Cắt ván Gợi ý</h3>
             ${layoutHtml}
        </div>
    `;

    openModal(viewItemModal);
}

// --- AI Chat ---
function initializeChat() {
    chatHistory = [{
        role: "system",
        parts: [{ text: "Bạn là một trợ lý AI hữu ích chuyên về ước tính chi phí sản xuất đồ gỗ. Hãy trả lời ngắn gọn, tập trung vào lĩnh vực làm đồ gỗ tại Việt Nam. Toàn bộ các câu trả lời phải bằng tiếng Việt. Cuộc hội thoại này sẽ được lưu lại để tham khảo trong tương lai." }],
    }];
    chatMessagesContainer.innerHTML = ''; // Clear previous chat
    renderChatMessage('Chào bạn, tôi là trợ lý AI. Tôi có thể giúp gì cho bạn?', 'model');
}

function renderChatMessage(message, role, options = {}) {
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `chat-message ${role}`;
    
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.innerHTML = `<i class="fas fa-${role === 'user' ? 'user' : 'robot'}"></i>`;
    
    const content = document.createElement('div');
    content.className = 'message-content';

    if (options.isLoading) {
        content.innerHTML = `<div class="loading-placeholder"><span class="spinner-sm" style="border-bottom-color: var(--primary-color);"></span> ${message}</div>`;
    } else {
        content.innerHTML = renderFormattedText(message);
    }
    
    messageWrapper.appendChild(icon);
    messageWrapper.appendChild(content);
    chatMessagesContainer.appendChild(messageWrapper);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    return messageWrapper;
}


async function handleTextChat(message) {
    renderChatMessage(message, 'user');
    chatHistory.push({ role: 'user', parts: [{ text: message }] });

    const aiMessageWrapper = renderChatMessage('Đang suy nghĩ...', 'model', { isLoading: true });
    const aiMessageContent = aiMessageWrapper.querySelector('.message-content');
    
    let fullResponseText = '';
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newChatMessage: true, chatHistory: chatHistory })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Lỗi không xác định từ server');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        aiMessageContent.innerHTML = ''; // Clear "thinking..."

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullResponseText += chunk;
            aiMessageContent.innerHTML = renderFormattedText(fullResponseText);
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }

        if (fullResponseText) {
            chatHistory.push({ role: 'model', parts: [{ text: fullResponseText }] });
        }
        
    } catch (error) {
        console.error("Chat error:", error);
        aiMessageContent.innerHTML = renderFormattedText(`Xin lỗi, tôi gặp sự cố: ${error.message}`);
    }
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isAwaitingChatResponse) return;
    const message = chatInput.value.trim();
    if (!message) return;
    
    isAwaitingChatResponse = true;
    chatInput.value = '';
    chatInput.disabled = true;
    sendChatBtn.disabled = true;

    await handleTextChat(message);

    isAwaitingChatResponse = false;
    chatInput.disabled = false;
    sendChatBtn.disabled = false;
    chatInput.focus();
});

// --- New: Image Dimension Analysis ---
async function handleImageAnalysis() {
    if (!uploadedImage) {
        showToast('Vui lòng tải lên một hình ảnh trước.', 'error');
        return;
    }

    analyzeImageBtn.disabled = true;
    analyzeImageBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích ảnh...`;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analyzeDimensions: true, image: uploadedImage })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Lỗi không xác định từ máy chủ');
        }

        let fieldsUpdated = 0;
        if (data.length) {
            document.getElementById('item-length').value = data.length;
            fieldsUpdated++;
        }
        if (data.width) {
            document.getElementById('item-width').value = data.width;
            fieldsUpdated++;
        }
        if (data.height) {
            document.getElementById('item-height').value = data.height;
            fieldsUpdated++;
        }

        if (fieldsUpdated > 0) {
            showToast(`AI đã điền ${fieldsUpdated} thông số kích thước!`, 'success');
             // Trigger 3D viewer update
            const event = new Event('input');
            document.getElementById('item-length').dispatchEvent(event);
        } else {
            showToast('Không tìm thấy kích thước nào trong ảnh. Vui lòng thử ảnh khác rõ ràng hơn.', 'info');
        }

    } catch (error) {
        console.error("Error analyzing image dimensions:", error);
        showToast(`Lỗi phân tích ảnh: ${error.message}`, 'error');
    } finally {
        analyzeImageBtn.disabled = false;
        analyzeImageBtn.innerHTML = `<i class="fas fa-search-plus"></i><span>Phân tích Kích thước từ Ảnh</span>`;
    }
}

analyzeImageBtn.addEventListener('click', handleImageAnalysis);

// --- New: AI Configuration from Text ---
async function handleAIConfig() {
    const text = aiConfigPrompt.value.trim();
    if (!text) {
        showToast('Vui lòng nhập mô tả sản phẩm.', 'error');
        return;
    }
    
    aiConfigBtn.disabled = true;
    aiConfigBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ configureFromText: true, text: text })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi không xác định từ máy chủ');
        }
        
        let updatedFields = 0;
        
        if(data.length) { document.getElementById('item-length').value = data.length; updatedFields++; }
        if(data.width) { document.getElementById('item-width').value = data.width; updatedFields++; }
        if(data.height) { document.getElementById('item-height').value = data.height; updatedFields++; }
        if(data.itemName) { document.getElementById('item-name').value = data.itemName; updatedFields++; }
        if(data.itemType) { document.getElementById('item-type').value = data.itemType; updatedFields++; }
        if(data.compartments) { document.getElementById('item-compartments').value = data.compartments; updatedFields++; }
        
        if(data.materialName) {
            const materialSelect = document.getElementById('material-wood');
            const allWood = localMaterials['Ván'];
            let bestMatch = null;
            let highestScore = 0;

            // Simple fuzzy match
            allWood.forEach(wood => {
                const name = wood.name.toLowerCase();
                const aiName = data.materialName.toLowerCase();
                if (name.includes(aiName) || aiName.includes(name)) {
                   const score = name.length > aiName.length ? aiName.length / name.length : name.length / aiName.length;
                   if (score > highestScore) {
                       highestScore = score;
                       bestMatch = wood.id;
                   }
                }
            });

            if (bestMatch) {
                materialSelect.value = bestMatch;
                updatedFields++;
            }
        }
        
        if (updatedFields > 0) {
            showToast(`AI đã điền ${updatedFields} thông tin sản phẩm!`, 'success');
            // Trigger 3D viewer update
            const event = new Event('input');
            document.getElementById('item-length').dispatchEvent(event);
        } else {
            showToast('AI không thể trích xuất thông tin từ mô tả của bạn.', 'info');
        }

    } catch(error) {
        console.error("AI Config Error:", error);
        showToast(`Lỗi cấu hình AI: ${error.message}`, 'error');
    } finally {
        aiConfigBtn.disabled = false;
        aiConfigBtn.innerHTML = `<i class="fas fa-cogs"></i> Tạo Sản phẩm từ Mô tả`;
    }
}
aiConfigBtn.addEventListener('click', handleAIConfig);


// --- New: 3D Viewer ---
function initialize3DViewer() {
    const container = document.getElementById('viewer-3d-container');
    const scene = container.querySelector('.scene-3d');
    const cube = container.querySelector('.cube-3d');
    const lengthInput = document.getElementById('item-length');
    const widthInput = document.getElementById('item-width');
    const heightInput = document.getElementById('item-height');

    let mouseX = 0, mouseY = 0;
    let rotX = -20, rotY = -30;
    let isDragging = false;

    function updateCubeDimensions() {
        const length = Number(lengthInput.value) || 0; // Dài
        const width = Number(widthInput.value) || 0;  // Rộng
        const height = Number(heightInput.value) || 0; // Cao
        
        const maxDim = Math.max(length, width, height, 200);
        const scale = 180 / maxDim; // Container size is ~200px
        
        // Dài (length) is mapped to width (--w)
        // Rộng (width) is mapped to depth (--d)
        const scaledW = length * scale;
        const scaledD = width * scale;
        const scaledH = height * scale;

        cube.style.setProperty('--w', `${scaledW}px`);
        cube.style.setProperty('--h', `${scaledH}px`);
        cube.style.setProperty('--d', `${scaledD}px`);
        
        // Update labels
        cube.querySelector('.cube-face--front').setAttribute('data-label', `D: ${length || 0} mm`);
        cube.querySelector('.cube-face--right').setAttribute('data-label', `R: ${width || 0} mm`);
        cube.querySelector('.cube-face--top').setAttribute('data-label', `C: ${height || 0} mm`);
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - mouseX;
        const dy = e.clientY - mouseY;
        rotY += dx * 0.5;
        rotX -= dy * 0.5;
        rotX = Math.max(-90, Math.min(90, rotX)); // Clamp vertical rotation
        scene.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        mouseX = e.clientX;
        mouseY = e.clientY;
    }

    function onMouseDown(e) {
        isDragging = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
        container.style.cursor = 'grabbing';
    }

    function onMouseUp() {
        isDragging = false;
        container.style.cursor = 'grab';
    }

    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseUp);

    lengthInput.addEventListener('input', updateCubeDimensions);
    widthInput.addEventListener('input', updateCubeDimensions);
    heightInput.addEventListener('input', updateCubeDimensions);
    
    // Initial setup
    scene.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    updateCubeDimensions();
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeModals();
    initializeImageUploader(
        (imageData) => { 
            uploadedImage = imageData;
            imageAnalysisContainer.classList.remove('hidden');
        },
        () => { 
            uploadedImage = null; 
            imageAnalysisContainer.classList.add('hidden');
        }
    );
    initialize3DViewer();
    initializeMathInput('.input-style[type="text"][inputmode="decimal"]');
    initializeQuickCalc(localMaterials, showToast);
});