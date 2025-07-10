// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut 
} from './firebase.js';

import { 
    openModal, closeModal, showConfirm, showToast, updateUIVisibility, 
    initializeImageUploader, initializeTabs, initializeModals 
} from './ui.js';

// --- DOM Elements ---
const logoutBtn = document.getElementById('logout-btn');
const materialForm = document.getElementById('material-form');
const materialsTableBody = document.getElementById('materials-table-body');
const savedItemsTableBody = document.getElementById('saved-items-table-body');
const calculateBtn = document.getElementById('calculate-btn');
const saveItemBtn = document.getElementById('save-item-btn');
const resultContainer = document.getElementById('result-content');
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
const initialSummarySection = document.getElementById('initial-summary-section');
const initialCostBreakdownContainer = document.getElementById('initial-cost-breakdown-container');
const initialTotalCostValue = document.getElementById('initial-total-cost-value');
const aiAnalysisSection = document.getElementById('ai-analysis-section');


// --- Global State ---
let currentUserId = null;
let materialsCollectionRef = null;
let savedItemsCollectionRef = null;
let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [] };
let localSavedItems = [];
let lastGeminiResult = null;
let addedAccessories = [];
let uploadedImage = null;
let chatHistory = [];
let isAwaitingChatResponse = false;
let calculationState = 'idle'; // idle, calculating_initial, initial_done, calculating_ai, ai_done
let initialCostDetails = null;

// --- Sample Data for New Users ---
const sampleMaterials = [
    { name: 'Ván MDF An Cường chống ẩm 17mm', type: 'Ván', price: 550000, unit: 'tấm', notes: 'Khổ 1220x2440mm' },
    { name: 'Ván HDF siêu chống ẩm 17mm', type: 'Ván', price: 780000, unit: 'tấm', notes: 'Khổ 1220x2440mm' },
    { name: 'Ván Plywood 9mm', type: 'Ván', price: 250000, unit: 'tấm', notes: 'Làm hậu tủ' },
    { name: 'Nẹp chỉ PVC An Cường 1mm', type: 'Cạnh', price: 5000, unit: 'mét', notes: 'Cùng màu ván' },
    { name: 'Bản lề hơi Ivan giảm chấn', type: 'Phụ kiện', price: 15000, unit: 'cái', notes: 'Loại thẳng' },
    { name: 'Ray bi 3 tầng', type: 'Phụ kiện', price: 45000, unit: 'cặp', notes: 'Dài 45cm' },
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
    const type = document.getElementById('item-type').value;
    const backPanelSelect = document.getElementById('material-back-panel');
    const usesMainWoodForBack = !backPanelSelect.value || backPanelSelect.value === '';

    const pieces = [];
    if (!length || !width || !height) return [];

    pieces.push({ name: 'Hông Trái', width: width, height: height, type: 'body' });
    pieces.push({ name: 'Hông Phải', width: width, height: height, type: 'body' });
    pieces.push({ name: 'Đáy', width: length, height: width, type: 'body' });
    
    if (type !== 'tu-bep-duoi') {
        pieces.push({ name: 'Nóc', width: length, height: width, type: 'body' });
    }
    if (type.includes('tu-')) {
         pieces.push({ name: 'Cánh Trái', width: Math.round(length / 2), height: height, type: 'door' });
         pieces.push({ name: 'Cánh Phải', width: Math.round(length / 2), height: height, type: 'door' });
    }
    if (usesMainWoodForBack && type !== 'tu-ao' && type !== 'khac') {
        pieces.push({ name: 'Hậu', width: length, height: height, type: 'body' }); // Add to body pieces if using main wood
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
    let breakdownHtml = '<ul class="cost-list">';
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

// REFACTORED: Returns an HTML string instead of directly manipulating the DOM.
function renderAiSuggestions(suggestions) {
    if (!suggestions) {
        return '<div class="ai-suggestions-container"><p>Không có gợi ý nào từ AI.</p></div>';
    }

    const icons = {
        cost_saving: { class: 'icon-cost-saving', i: 'fa-coins' },
        structural: { class: 'icon-structural', i: 'fa-tools' },
        warning: { class: 'icon-warning', i: 'fa-exclamation-triangle' },
        upsell: { class: 'icon-upsell', i: 'fa-arrow-trend-up' }
    };

    let keyPointsHtml = '';
    if (suggestions.keyPoints && suggestions.keyPoints.length > 0) {
        keyPointsHtml = suggestions.keyPoints.map(point => {
            const iconInfo = icons[point.type] || { class: 'icon-generic', i: 'fa-lightbulb' };
            return `
                <div class="suggestion-point">
                    <div class="suggestion-icon ${iconInfo.class}"><i class="fas ${iconInfo.i}"></i></div>
                    <div class="suggestion-text">${point.text}</div>
                </div>
            `;
        }).join('');
    }

    const html = `
        <div class="ai-suggestions-container">
            ${suggestions.summary ? `<p class="suggestion-summary">${suggestions.summary}</p>` : ''}
            ${keyPointsHtml ? `<div class="suggestion-points-list">${keyPointsHtml}</div>` : '<p>Không có điểm nhấn cụ thể nào từ AI.</p>'}
        </div>
    `;

    return html;
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
        localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [] };
        snapshot.docs.forEach(doc => {
            const material = { id: doc.id, ...doc.data() };
            if (localMaterials[material.type]) {
                localMaterials[material.type].push(material);
            }
        });
        renderMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        populateSelects();
    }, console.error);
}

function renderMaterials(materials) {
    materialsTableBody.innerHTML = '';
    if (materials.length === 0) {
        materialsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-light);">Chưa có vật tư nào.</td></tr>`;
        return;
    }
    materials.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.name}</td>
            <td><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">${m.type}</span></td>
            <td>${Number(m.price).toLocaleString('vi-VN')}đ / ${m.unit}</td>
            <td>${m.notes || ''}</td>
            <td class="text-center">
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
        const material = localMaterials['Ván'].concat(localMaterials['Cạnh'], localMaterials['Phụ kiện']).find(m => m.id === id);
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
    const selects = [
        { el: document.getElementById('material-wood'), type: 'Ván' },
        { el: document.getElementById('material-door'), type: 'Ván', optional: true },
        { el: document.getElementById('material-back-panel'), type: 'Ván', optional: true },
        { el: document.getElementById('material-edge'), type: 'Cạnh' },
        { el: document.getElementById('material-accessories'), type: 'Phụ kiện' }
    ];
    selects.forEach(s => {
        const currentVal = s.el.value;
        s.el.innerHTML = '';
        if (s.optional) s.el.add(new Option('Dùng chung ván chính', ''));
        localMaterials[s.type].forEach(m => s.el.add(new Option(`${m.name} (${Number(m.price).toLocaleString('vi-VN')}đ)`, m.id)));
        if (currentVal) s.el.value = currentVal;
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
});

function renderAccessories() {
    accessoriesList.innerHTML = '';
    addedAccessories.forEach(acc => {
        const li = document.createElement('li');
        li.dataset.id = acc.id;
        li.innerHTML = `
            <span class="flex-grow">${acc.name}</span>
            <input type="number" value="${acc.quantity}" min="1" class="input-style accessory-list-qty" data-id="${acc.id}">
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
    }
});

function clearInputs() {
    document.getElementById('item-length').value = '';
    document.getElementById('item-width').value = '';
    document.getElementById('item-height').value = '';
    document.getElementById('item-name').value = '';
    document.getElementById('product-description').value = '';
    document.getElementById('profit-margin').value = '50';
    document.getElementById('material-door').value = ''; // Reset door material
    addedAccessories = [];
    renderAccessories();
    lastGeminiResult = null;
    initialCostDetails = null;
    calculationState = 'idle';
    document.querySelector('#remove-image-btn').click();

    // Reset UI
    updateCalculateButton();
    initialSummarySection.classList.add('hidden');
    aiAnalysisSection.classList.add('hidden');
    saveItemBtn.disabled = true;
}

// --- Calculation Logic ---
function updateCalculateButton() {
    switch(calculationState) {
        case 'idle':
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '<i class="fas fa-calculator"></i> Tính chi phí vật tư';
            break;
        case 'calculating_initial':
            calculateBtn.disabled = true;
            calculateBtn.innerHTML = `<span class="spinner-sm"></span> Đang tính toán...`;
            break;
        case 'initial_done':
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '<i class="fas fa-magic"></i> Nhờ AI Phân tích & Tối ưu';
            break;
        case 'calculating_ai':
            calculateBtn.disabled = true;
            calculateBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;
            break;
        case 'ai_done':
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '<i class="fas fa-redo"></i> Phân tích lại với AI';
            break;
    }
}

function calculateInitialCosts() {
    const mainWoodId = document.getElementById('material-wood').value;
    const doorWoodId = document.getElementById('material-door').value;
    const edgeId = document.getElementById('material-edge').value;

    const mainWood = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const doorWood = localMaterials['Ván'].find(m => m.id === doorWoodId) || mainWood;
    const edge = localMaterials['Cạnh'].find(m => m.id === edgeId);

    if (!mainWood || !edge) {
        showToast('Vui lòng chọn vật liệu Ván chính và Nẹp cạnh.', 'error');
        return null;
    }

    const allPieces = getPanelPieces();
    if (allPieces.length === 0) {
        showToast('Vui lòng nhập kích thước sản phẩm.', 'error');
        return null;
    }

    const bodyPieces = allPieces.filter(p => p.type === 'body');
    const doorPieces = allPieces.filter(p => p.type === 'door');

    const backPanelId = document.getElementById('material-back-panel').value;
    const backPanel = localMaterials['Ván'].find(m => m.id === backPanelId);
    
    const standardPanelArea = 1220 * 2440;

    // Estimate main wood sheets for body
    const bodyPieceArea = bodyPieces.reduce((sum, p) => sum + p.width * p.height, 0);
    const estimatedBodySheets = bodyPieceArea > 0 ? Math.ceil((bodyPieceArea / standardPanelArea) * 1.15) : 0;
    const mainWoodCost = estimatedBodySheets * mainWood.price;

    // Estimate door wood sheets
    let doorWoodCost = 0;
    let estimatedDoorSheets = 0;
    if (doorWood && doorPieces.length > 0) {
        const doorPieceArea = doorPieces.reduce((sum, p) => sum + p.width * p.height, 0);
        estimatedDoorSheets = doorPieceArea > 0 ? Math.ceil((doorPieceArea / standardPanelArea) * 1.15) : 0;
        doorWoodCost = estimatedDoorSheets * doorWood.price;
    }

    // Estimate back panel sheets
    let backPanelCost = 0;
    if (backPanel) { // Assumes 1 sheet for back panel if specified
        backPanelCost = backPanel.price;
    }

    // Estimate edge banding
    const totalPerimeter = allPieces.reduce((sum, p) => sum + 2 * (p.width + p.height), 0);
    const estimatedEdgeMeters = Math.ceil(totalPerimeter / 1000);
    const edgeCost = estimatedEdgeMeters * edge.price;

    // Sum accessories cost
    const accessoriesCost = addedAccessories.reduce((sum, acc) => sum + acc.quantity * acc.price, 0);

    const breakdown = [
        ...(estimatedBodySheets > 0 ? [{ name: `Ván chính (${mainWood.name})`, cost: mainWoodCost, reason: `Ước tính ${estimatedBodySheets} tấm` }] : []),
        ...(estimatedDoorSheets > 0 ? [{ name: `Ván cánh (${doorWood.name})`, cost: doorWoodCost, reason: `Ước tính ${estimatedDoorSheets} tấm` }] : []),
        ...(backPanel ? [{ name: `Ván hậu (${backPanel.name})`, cost: backPanelCost, reason: 'Ước tính 1 tấm' }] : []),
        { name: `Nẹp cạnh (${edge.name})`, cost: edgeCost, reason: `Ước tính ${estimatedEdgeMeters} mét` },
        { name: 'Tổng phụ kiện', cost: accessoriesCost, reason: `${addedAccessories.length} loại` }
    ];

    const totalCost = mainWoodCost + doorWoodCost + backPanelCost + edgeCost + accessoriesCost;
    return { breakdown, totalCost };
}


async function runAICalculation() {
    calculationState = 'calculating_ai';
    updateCalculateButton();
    aiAnalysisSection.classList.remove('hidden');
    resultContainer.innerHTML = '<div class="flex justify-center items-center h-full"><div class="spinner"></div></div>';
    priceSummaryContainer.classList.add('hidden');
    costBreakdownContainer.classList.add('hidden');
    cuttingLayoutSection.classList.add('hidden');
    
    const inputs = {
        name: document.getElementById('item-name').value,
        length: document.getElementById('item-length').value,
        width: document.getElementById('item-width').value,
        height: document.getElementById('item-height').value,
        type: document.getElementById('item-type').value,
        description: document.getElementById('product-description').value,
        profitMargin: document.getElementById('profit-margin').value,
    };

    const mainWoodId = document.getElementById('material-wood').value;
    const doorWoodId = document.getElementById('material-door').value;
    const backPanelId = document.getElementById('material-back-panel').value;
    const edgeId = document.getElementById('material-edge').value;

    const mainWood = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const doorWood = localMaterials['Ván'].find(m => m.id === doorWoodId) || mainWood;
    const backPanel = localMaterials['Ván'].find(m => m.id === backPanelId);
    const edge = localMaterials['Cạnh'].find(m => m.id === edgeId);

    const allPieces = getPanelPieces();
    const bodyPieces = allPieces.filter(p => p.type === 'body');
    const doorPieces = allPieces.filter(p => p.type === 'door');

    const prompt = `
    NHIỆM VỤ: Bạn là một trợ lý AI chuyên gia cho một xưởng gỗ ở Việt Nam. Mục tiêu của bạn là cung cấp một phân tích chi phí chi tiết, các đề xuất tối ưu hóa, và một sơ đồ cắt ván chính xác (2D bin packing) cho một sản phẩm nhất định. TOÀN BỘ PHẢN HỒI PHẢI BẰNG TIẾNG VIỆT.

    DỮ LIỆU ĐẦU VÀO:
    - Tên sản phẩm: ${inputs.name}
    - Kích thước (DxRxC): ${inputs.length} x ${inputs.width} x ${inputs.height} mm
    - Loại sản phẩm: ${inputs.type}
    - Ghi chú của người dùng: ${inputs.description}
    - Tỷ suất lợi nhuận mong muốn: ${inputs.profitMargin}%
    - Gỗ chính (Thùng): ${mainWood.name} (${mainWood.price} VND/${mainWood.unit})
    - Gỗ cánh: ${doorWood.name} (${doorWood.price} VND/${doorWood.unit})
    - Gỗ hậu: ${backPanel ? `${backPanel.name} (${backPanel.price} VND/${backPanel.unit})` : 'Sử dụng gỗ chính'}
    - Nẹp cạnh: ${edge.name} (${edge.price} VND/mét)
    - Phụ kiện: ${addedAccessories.map(a => `${a.name} (SL: ${a.quantity}, Đơn giá: ${a.price})`).join(', ')}
    - Có hình ảnh: ${uploadedImage ? 'Có' : 'Không'}

    HƯỚNG DẪN:
    1.  **Sơ đồ cắt ván (Bin Packing):** Đây là tính toán QUAN TRỌNG NHẤT. Tính toán này CHỈ dành cho VÁN CHÍNH (THÙNG).
        - Kích thước tấm ván tiêu chuẩn là 1220mm x 2440mm.
        - Danh sách các miếng cần cắt từ VÁN CHÍNH (THÙNG) là: ${JSON.stringify(bodyPieces.map(({type, ...rest}) => rest))}.
        - Thực hiện thuật toán sắp xếp 2D để xếp các miếng này vào số lượng tấm ván tiêu chuẩn ít nhất.
        - Tọa độ (x, y) phải là góc trên cùng bên trái của mỗi miếng trên tấm ván.
        - Điền vào đối tượng "cuttingLayout" với kết quả. "totalSheetsUsed" phải chính xác cho VÁN CHÍNH (THÙNG).
    2.  **Tính toán chi phí:**
        - Tính "materialCosts". Nó phải bao gồm chi phí cho VÁN CHÍNH, VÁN CÁNH, VÁN HẬU (nếu có), nẹp cạnh, và phụ kiện.
        - Chi phí VÁN CHÍNH phải dựa trên "totalSheetsUsed" đã được tối ưu từ sơ đồ cắt.
        - Chi phí VÁN CÁNH phải được ƯỚC TÍNH bằng cách tính tổng diện tích các miếng cánh (${JSON.stringify(doorPieces.map(({type, ...rest}) => rest))}) và chia cho diện tích tấm ván chuẩn (1220x2440), sau đó làm tròn lên và cộng thêm một chút hao hụt (~15%).
        - Tính các "hiddenCosts" thực tế như nhân công, vận chuyển và hao hụt chung.
        - Cộng tất cả các chi phí để có được "totalCost".
        - Tính "suggestedPrice" bằng cách sử dụng tỷ suất lợi nhuận trên "totalCost".
        - Tính "estimatedProfit" là suggestedPrice - totalCost.
    3.  **Gợi ý từ AI:**
        - Điền vào đối tượng aiSuggestions.
        - summary: Cung cấp một tóm tắt rất ngắn gọn, chuyên nghiệp về phân tích của bạn.
        - keyPoints: Cung cấp từ 2 đến 4 gợi ý quan trọng nhất. Đối với mỗi điểm, chọn một loại từ danh sách này: cost_saving (tiết kiệm chi phí), structural (kết cấu), warning (cảnh báo), upsell (bán thêm). Viết lời khuyên trong trường văn bản.
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
        calculationState = 'ai_done';
        const { costBreakdown, aiSuggestions, cuttingLayout } = data;

        if (costBreakdown) {
            const allCosts = [...(costBreakdown.materialCosts || []), ...(costBreakdown.hiddenCosts || [])];
            renderCostBreakdown(allCosts, costBreakdownContainer);
            totalCostValue.textContent = (costBreakdown.totalCost || 0).toLocaleString('vi-VN') + 'đ';
            suggestedPriceValue.textContent = (costBreakdown.suggestedPrice || 0).toLocaleString('vi-VN') + 'đ';
            estimatedProfitValue.textContent = (costBreakdown.estimatedProfit || 0).toLocaleString('vi-VN') + 'đ';
            priceSummaryContainer.classList.remove('hidden');
        }

        resultContainer.innerHTML = renderAiSuggestions(aiSuggestions);
        if (cuttingLayout) {
            renderCuttingLayout(cuttingLayout, cuttingLayoutContainer, cuttingLayoutSummary);
            cuttingLayoutSection.classList.remove('hidden');
        }
        saveItemBtn.disabled = false;

    } catch (error) {
        console.error("Error calling AI:", error);
        if (error.message.includes('503') || error.message.includes('overloaded')) {
             showToast('AI đang quá tải, vui lòng thử lại sau giây lát.', 'info');
        } else {
             showToast(`Lỗi khi phân tích: ${error.message}`, 'error');
        }
        resultContainer.innerHTML = `<p style="color: var(--danger-color);">Đã xảy ra lỗi khi giao tiếp với AI. Vui lòng thử lại.</p>`;
        calculationState = 'initial_done'; // Revert state
    } finally {
        updateCalculateButton();
    }
}

calculateBtn.addEventListener('click', async () => {
    if (!currentUserId) {
        showToast('Vui lòng đăng nhập để sử dụng tính năng này.', 'error');
        return;
    }
    const itemName = document.getElementById('item-name').value.trim();
    if (!itemName) {
        showToast('Vui lòng nhập Tên sản phẩm / dự án.', 'error');
        return;
    }

    if (calculationState === 'idle' || calculationState === 'ai_done') {
        // Start fresh: Clear previous results and do initial calculation
        aiAnalysisSection.classList.add('hidden');
        calculationState = 'calculating_initial';
        updateCalculateButton();
        
        // Use a timeout to allow UI to update before blocking with calculations
        setTimeout(() => {
            initialCostDetails = calculateInitialCosts();
            if (initialCostDetails) {
                renderCostBreakdown(initialCostDetails.breakdown, initialCostBreakdownContainer);
                initialTotalCostValue.textContent = initialCostDetails.totalCost.toLocaleString('vi-VN') + 'đ';
                initialSummarySection.classList.remove('hidden');
                calculationState = 'initial_done';
            } else {
                calculationState = 'idle'; // Calculation failed, revert
            }
            updateCalculateButton();
        }, 10);

    } else if (calculationState === 'initial_done') {
        // Proceed to AI analysis
        await runAICalculation();
    }
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
    // Safely sort by timestamp, without optional chaining for better compatibility
    items.sort((a, b) => (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0));

    items.forEach(item => {
        const tr = document.createElement('tr');
        // BUG FIX: Use standard checks for safer access to nested properties on potentially old/malformed data.
        const itemName = (item && item.inputs && item.inputs.name) || 'Dự án không tên';
        const createdAt = (item && item.createdAt) ? new Date(item.createdAt.toDate()).toLocaleString('vi-VN') : 'Không rõ';
        
        tr.innerHTML = `
            <td>${itemName}</td>
            <td>${createdAt}</td>
            <td class="text-center">
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
            description: document.getElementById('product-description').value,
            profitMargin: document.getElementById('profit-margin').value,
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
    clearInputs(); // Start with a clean slate

    const inputs = item.inputs || {};

    // Populate text/number inputs
    document.getElementById('item-length').value = inputs.length || '';
    document.getElementById('item-width').value = inputs.width || '';
    document.getElementById('item-height').value = inputs.height || '';
    document.getElementById('item-name').value = inputs.name || '';
    document.getElementById('item-type').value = inputs.type || 'khac';
    document.getElementById('product-description').value = inputs.description || '';
    document.getElementById('profit-margin').value = inputs.profitMargin || '50';

    // Populate selects. This assumes `populateSelects` has already run.
    document.getElementById('material-wood').value = inputs.mainWoodId || '';
    document.getElementById('material-door').value = inputs.doorWoodId || '';
    document.getElementById('material-back-panel').value = inputs.backPanelId || '';
    document.getElementById('material-edge').value = inputs.edgeId || '';
    
    // Populate accessories
    if (inputs.accessories && Array.isArray(inputs.accessories)) {
        // Create a deep copy to avoid modifying the original saved item object
        addedAccessories = JSON.parse(JSON.stringify(inputs.accessories));
        renderAccessories();
    }

    // Restore AI result to allow re-saving if needed without re-calculating
    lastGeminiResult = {
        costBreakdown: item.costBreakdown,
        aiSuggestions: item.aiSuggestions,
        cuttingLayout: item.cuttingLayout,
    };
    if(lastGeminiResult) {
        saveItemBtn.disabled = false;
        calculationState = 'ai_done'; // Set state to reflect that AI analysis is loaded
        updateCalculateButton();
        
        // Render the loaded AI results
        aiAnalysisSection.classList.remove('hidden');
        initialSummarySection.classList.add('hidden'); // Hide initial summary as we have full data

        const { costBreakdown, aiSuggestions, cuttingLayout } = lastGeminiResult;
        if (costBreakdown) {
            const allCosts = [...(costBreakdown.materialCosts || []), ...(costBreakdown.hiddenCosts || [])];
            renderCostBreakdown(allCosts, costBreakdownContainer);
            totalCostValue.textContent = (costBreakdown.totalCost || 0).toLocaleString('vi-VN') + 'đ';
            suggestedPriceValue.textContent = (costBreakdown.suggestedPrice || 0).toLocaleString('vi-VN') + 'đ';
            estimatedProfitValue.textContent = (costBreakdown.estimatedProfit || 0).toLocaleString('vi-VN') + 'đ';
            priceSummaryContainer.classList.remove('hidden');
        }
        resultContainer.innerHTML = renderAiSuggestions(aiSuggestions);
        if (cuttingLayout) {
            renderCuttingLayout(cuttingLayout, cuttingLayoutContainer, cuttingLayoutSummary);
            cuttingLayoutSection.classList.remove('hidden');
        }
    }


    // Switch to the calculator tab
    const calculatorTabBtn = document.querySelector('button[data-tab="calculator"]');
    if (calculatorTabBtn) {
        calculatorTabBtn.click();
    }

    // Scroll to top for better UX
    window.scrollTo({ top: 0, behavior: 'smooth' });

    showToast('Đã tải dữ liệu dự án. Bạn có thể chỉnh sửa và phân tích lại.', 'info');
}


/**
 * Renders the details of a saved item to a modal.
 * REFACTORED: This function is now more robust and no longer mutates global state,
 * preventing "assignment to constant variable" errors.
 * @param {string} itemId The ID of the item to render.
 */
function renderItemDetailsToModal(itemId) {
    const item = localSavedItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Không tìm thấy dự án.', 'error');
        return;
    }

    // Safely access properties using optional chaining and default values
    const inputs = item.inputs || {};
    const costBreakdown = item.costBreakdown || {};
    const cuttingLayout = item.cuttingLayout || {};
    
    viewItemTitle.textContent = `Chi tiết dự án: ${inputs.name || 'Không tên'}`;
    
    const mainWoodFound = localMaterials['Ván'].find(m => m.id === inputs.mainWoodId);
    const mainWood = mainWoodFound ? mainWoodFound.name : 'Không rõ';

    const doorWoodFound = localMaterials['Ván'].find(m => m.id === inputs.doorWoodId);
    const doorWood = doorWoodFound ? doorWoodFound.name : 'Dùng ván chính';

    const backPanelFound = localMaterials['Ván'].find(m => m.id === inputs.backPanelId);
    const backPanel = backPanelFound ? backPanelFound.name : 'Dùng ván chính';
    
    const edgeFound = localMaterials['Cạnh'].find(m => m.id === inputs.edgeId);
    const edge = edgeFound ? edgeFound.name : 'Không rõ';

    let accessoriesHtml = 'Không có';
    if (inputs.accessories && inputs.accessories.length > 0) {
        accessoriesHtml = '<ul>' + inputs.accessories.map(a => `<li>${a.name} (SL: ${a.quantity})</li>`).join('') + '</ul>';
    }

    let breakdownHtml = '<p>Không có phân tích chi phí.</p>';
    if (costBreakdown.materialCosts || costBreakdown.hiddenCosts) {
        const allCosts = [
            ...(costBreakdown.materialCosts || []),
            ...(costBreakdown.hiddenCosts || [])
        ];
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

    const suggestionsHtml = renderAiSuggestions(item.aiSuggestions);

    viewItemContent.innerHTML = `
        <div class="final-price-recommendation">
            <div class="final-price-label">Giá Bán Đề Xuất</div>
            <div class="final-price-value">${(costBreakdown.suggestedPrice || 0).toLocaleString('vi-VN')}đ</div>
            <p class="final-price-summary">
                Tổng chi phí: <strong>${(costBreakdown.totalCost || 0).toLocaleString('vi-VN')}đ</strong> | 
                Lợi nhuận ước tính: <strong>${(costBreakdown.estimatedProfit || 0).toLocaleString('vi-VN')}đ</strong>
            </p>
        </div>

        <h4><i class="fas fa-ruler-combined"></i>Thông số Đầu vào</h4>
        <ul>
            <li><strong>Kích thước (D x R x C):</strong> ${inputs.length || 'N/A'} x ${inputs.width || 'N/A'} x ${inputs.height || 'N/A'} mm</li>
            <li><strong>Loại sản phẩm:</strong> ${inputs.type || 'N/A'}</li>
            <li><strong>Mô tả:</strong> ${inputs.description || 'Không có'}</li>
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
        
        <h4><i class="fas fa-file-invoice-dollar"></i>Phân tích Chi phí Chi tiết</h4>
        ${breakdownHtml}

        <h4><i class="fas fa-lightbulb"></i>Gợi ý từ AI</h4>
        ${suggestionsHtml}
        
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
    renderChatMessage('Chào bạn, tôi là trợ lý AI. Tôi có thể giúp gì cho việc tính giá sản phẩm của bạn?', 'model');
}

function renderChatMessage(message, role) {
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `chat-message ${role}`;
    
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.innerHTML = `<i class="fas fa-${role === 'user' ? 'user' : 'robot'}"></i>`;
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = renderFormattedText(message);
    
    messageWrapper.appendChild(icon);
    messageWrapper.appendChild(content);
    chatMessagesContainer.appendChild(messageWrapper);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
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

    renderChatMessage(message, 'user');
    chatHistory.push({ role: 'user', parts: [{ text: message }] });

    // Create the AI's message bubble, but keep it empty for now
    const aiMessageWrapper = document.createElement('div');
    aiMessageWrapper.className = 'chat-message model';
    aiMessageWrapper.innerHTML = `
        <div class="icon"><i class="fas fa-robot"></i></div>
        <div class="message-content"></div>
    `;
    chatMessagesContainer.appendChild(aiMessageWrapper);
    const aiMessageContent = aiMessageWrapper.querySelector('.message-content');
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    
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

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullResponseText += chunk;
            aiMessageContent.innerHTML = renderFormattedText(fullResponseText); // Re-render content with formatting on each chunk
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }

        if (fullResponseText) {
            chatHistory.push({ role: 'model', parts: [{ text: fullResponseText }] });
        }
        
    } catch (error) {
        console.error("Chat error:", error);
        aiMessageContent.innerHTML = renderFormattedText(`Xin lỗi, tôi gặp sự cố: ${error.message}`);
    } finally {
        isAwaitingChatResponse = false;
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.focus();
    }
});

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeModals();
    initializeImageUploader(
        (imageData) => { uploadedImage = imageData; },
        () => { uploadedImage = null; }
    );
});